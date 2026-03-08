"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Search, X, Loader2, Bus, Users, MapPin, Route, Map, UserCheck, Plus, Pencil, Trash2, ShieldAlert
} from "lucide-react";
import {
    collection, query, getDocs, doc, setDoc, deleteDoc, serverTimestamp, orderBy, collectionGroup, writeBatch
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Student {
    id: string;
    name?: string;
    firstName?: string;
    middleName?: string;
    lastName?: string;
    admissionNumber?: string;
    className?: string;
    section?: string;
    mobileNo?: string;
    transport?: string;
    [key: string]: any;
}

interface TransportBus {
    id: string;
    busNumber: string;
    routeDetails: string;
    driverName: string;
    driverContact: string;
    helperName?: string;
    totalSeats: number;
    createdAt?: any;
    updatedAt?: any;
}

type TabType = "students" | "buses";

const busSchema = z.object({
    busNumber: z.string().min(1, "Bus number is required"),
    routeDetails: z.string().min(1, "Route details are required"),
    driverName: z.string().min(1, "Driver name is required"),
    driverContact: z.string().min(10, "Valid contact required"),
    helperName: z.string().optional(),
    totalSeats: z.coerce.number().min(1, "Seats must be at least 1"),
});

interface BusFormValues {
    busNumber: string;
    routeDetails: string;
    driverName: string;
    driverContact: string;
    helperName?: string;
    totalSeats: number;
}

const assignSchema = z.object({
    transportMode: z.string().min(1, "Select mode"),
    assignedBusId: z.string().optional(),
});
type AssignFormValues = z.infer<typeof assignSchema>;

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TransportAdminPage() {
    const [buses, setBuses] = useState<TransportBus[]>([]);
    const [students, setStudents] = useState<Student[]>([]);
    const [activeTab, setActiveTab] = useState<TabType>("students");
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

    // Modals
    const [busModalOpen, setBusModalOpen] = useState(false);
    const [editingBus, setEditingBus] = useState<TransportBus | null>(null);
    const [savingBus, setSavingBus] = useState(false);

    const [assignModalOpen, setAssignModalOpen] = useState(false);
    const [assigningStudent, setAssigningStudent] = useState<Student | null>(null);
    const [savingAssignment, setSavingAssignment] = useState(false);

    const busForm = useForm<BusFormValues>({ resolver: zodResolver(busSchema) as any });
    const assignForm = useForm<AssignFormValues>({ resolver: zodResolver(assignSchema) });
    const watchTransportMode = assignForm.watch("transportMode");

    const showToast = useCallback((msg: string, type: "success" | "error" = "success") => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 4000);
    }, []);

    // ─── Fetch Data ────────────────────────────────────────────────────────
    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            // 1. Fetch Buses
            const busSnap = await getDocs(query(collection(db, "transport_buses"), orderBy("busNumber")));
            const loadedBuses = busSnap.docs.map(d => ({ id: d.id, ...d.data() } as TransportBus));
            setBuses(loadedBuses);

            // 2. Fetch all students to find transport users
            const studentSnap = await getDocs(collectionGroup(db, "profiles"));
            const allStudents = studentSnap.docs.map(d => ({ id: d.id, ...d.data() } as Student));

            // Store all students rather than strictly filtering. Admins need to see all to assign transport.
            setStudents(allStudents);
        } catch (error) {
            console.error("Error fetching transport data:", error);
            showToast("Failed to load data.", "error");
        } finally {
            setIsLoading(false);
        }
    }, [showToast]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // ─── Bus Management ─────────────────────────────────────────────────────

    const openBusForm = (bus?: TransportBus) => {
        setEditingBus(bus || null);
        if (bus) {
            busForm.reset({
                busNumber: bus.busNumber,
                routeDetails: bus.routeDetails,
                driverName: bus.driverName,
                driverContact: bus.driverContact,
                helperName: bus.helperName || "",
                totalSeats: bus.totalSeats,
            });
        } else {
            busForm.reset({ busNumber: "", routeDetails: "", driverName: "", driverContact: "", helperName: "", totalSeats: 40 });
        }
        setBusModalOpen(true);
    };

    const handleBusSubmit = async (data: BusFormValues) => {
        setSavingBus(true);
        try {
            const isNew = !editingBus;
            const busId = isNew ? `bus-${Date.now()}` : editingBus.id;
            const payload = {
                ...data,
                id: busId,
                updatedAt: serverTimestamp(),
                ...(isNew ? { createdAt: serverTimestamp() } : {})
            };

            await setDoc(doc(db, "transport_buses", busId), payload, { merge: true });

            showToast(`Bus ${data.busNumber} ${isNew ? "added" : "updated"} successfully!`);
            setBusModalOpen(false);
            fetchData();
        } catch (err) {
            console.error(err);
            showToast("Failed to save bus.", "error");
        } finally {
            setSavingBus(false);
        }
    };

    const handleDeleteBus = async (bus: TransportBus) => {
        if (!confirm(`Are you sure you want to delete Bus ${bus.busNumber}?\n\nThis will NOT remove the students from the bus automatically.`)) return;
        try {
            await deleteDoc(doc(db, "transport_buses", bus.id));
            showToast(`Bus deleted.`);
            fetchData();
        } catch {
            showToast("Failed to delete.", "error");
        }
    };

    // ─── Student Assignment Management ──────────────────────────────────────

    const openAssignForm = (student: Student) => {
        setAssigningStudent(student);
        const t = (student.transport || "").trim().toUpperCase();

        let initialMode = "NONE";
        let initialBusId = "";

        if (t === "BUS") {
            initialMode = "BUS_UNASSIGNED";
        } else if (t.startsWith("BUS-")) {
            initialMode = "BUS_ASSIGNED";
            initialBusId = t; // The 'transport' field directly stores the bus ID
        } else if (t !== "NONE" && t !== "") {
            // Legacy / Custom strings
            initialMode = "BUS_UNASSIGNED";
        }

        assignForm.reset({ transportMode: initialMode, assignedBusId: initialBusId });
        setAssignModalOpen(true);
    };

    const handleAssignSubmit = async (data: AssignFormValues) => {
        if (!assigningStudent) return;
        setSavingAssignment(true);
        try {
            let newTransportString = "";
            if (data.transportMode === "NONE") {
                newTransportString = "NONE";
            } else if (data.transportMode === "BUS_ASSIGNED" && data.assignedBusId) {
                newTransportString = "BUS"; // Store explicit BUS literal instead of Bus ID
            } else {
                newTransportString = "BUS"; // General fallback
            }

            // Update nested profile
            const className = assigningStudent.className || "Unknown";
            const section = assigningStudent.section || "Unknown";
            const profileRef = doc(db, "users", "classes", className, "sections", section, "students", "profiles", assigningStudent.id);
            await setDoc(profileRef, { transport: newTransportString }, { merge: true });

            showToast("Transport updated!");
            setAssignModalOpen(false);
            fetchData();
        } catch (err) {
            console.error(err);
            showToast("Failed to update transport.", "error");
        } finally {
            setSavingAssignment(false);
        }
    };

    const getDisplayName = (s: Student) => {
        const raw = `${s.firstName || ""} ${s.middleName || ""} ${s.lastName || ""}`.replace(/\s+/g, " ").trim();
        return raw || s.name || "Unknown Student";
    };

    const getBusByTransportString = (ts: string) => {
        if (!ts) return null;
        return buses.find(b => b.id === ts) || null;
    };

    // ─── Render Data ────────────────────────────────────────────────────────

    const filteredStudents = students.filter(s => {
        if (!searchTerm) return true;
        const q = searchTerm.toLowerCase();
        return (getDisplayName(s).toLowerCase().includes(q) || (s.admissionNumber || "").toLowerCase().includes(q) || (s.className || "").toLowerCase().includes(q));
    });

    const filteredBuses = buses.filter(b => {
        if (!searchTerm) return true;
        const q = searchTerm.toLowerCase();
        return (b.busNumber.toLowerCase().includes(q) || b.routeDetails.toLowerCase().includes(q));
    });

    const totalAssigned = students.filter(s => getBusByTransportString(s.transport || "")).length;
    const totalUnassigned = students.filter(s => {
        const t = (s.transport || "").trim().toUpperCase();
        return t === "BUS" || (t && t !== "NONE" && t !== "SELF" && !getBusByTransportString(t));
    }).length;

    return (
        <div className="space-y-6">
            {toast && (
                <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-semibold text-white animate-in slide-in-from-right-4 ${toast.type === "success" ? "bg-green-600" : "bg-red-600"}`}>
                    {toast.msg}
                </div>
            )}

            {/* Header */}
            <div className="rounded-2xl gradient-navy p-6 md:p-8 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 80% 50%, rgba(200,169,81,0.3) 0%, transparent 60%)" }} />
                <div className="relative z-10">
                    <p className="text-white/50 text-sm font-medium">Operations</p>
                    <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">Transport Management</h1>
                    <p className="text-white/40 text-sm mt-1">
                        {buses.length} Active Routes · {totalAssigned} Assigned Riders · {totalUnassigned} Unassigned Requests
                    </p>
                </div>
            </div>

            {/* Metrics */}
            <div className="grid gap-4 sm:grid-cols-3">
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                        <Bus className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-navy">{buses.length}</p>
                        <p className="text-xs text-gray-500 font-medium">Active Buses</p>
                    </div>
                </div>
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                        <UserCheck className="w-6 h-6 text-emerald-600" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-navy">{totalAssigned}</p>
                        <p className="text-xs text-gray-500 font-medium">Assigned Riders</p>
                    </div>
                </div>
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                        <ShieldAlert className="w-6 h-6 text-red-600" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-navy">{totalUnassigned}</p>
                        <p className="text-xs text-gray-500 font-medium">Unassigned Requests</p>
                    </div>
                </div>
            </div>

            {/* Controls */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div className="flex gap-2 p-1 bg-white border border-gray-200 rounded-xl max-w-fit shadow-sm">
                    <button
                        onClick={() => setActiveTab("students")}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${activeTab === "students" ? "bg-indigo-50 text-indigo-700" : "text-gray-500 hover:text-gray-900"}`}
                    >
                        <Users className="w-4 h-4" /> Students
                    </button>
                    <button
                        onClick={() => setActiveTab("buses")}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${activeTab === "buses" ? "bg-indigo-50 text-indigo-700" : "text-gray-500 hover:text-gray-900"}`}
                    >
                        <Route className="w-4 h-4" /> Buses
                    </button>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="search" placeholder={`Search ${activeTab}...`}
                            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                            className="pl-9 pr-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/10 w-full sm:w-64 bg-white shadow-sm"
                        />
                    </div>
                    {activeTab === "buses" && (
                        <Button onClick={() => openBusForm()} className="bg-navy hover:bg-navy-light text-white shrink-0 shadow-sm">
                            <Plus className="w-4 h-4 mr-2" /> Add Bus
                        </Button>
                    )}
                </div>
            </div>

            {isLoading ? (
                <div className="min-h-[400px] flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3 text-gray-400">
                        <Loader2 className="w-8 h-8 animate-spin text-navy" />
                        <p className="text-sm font-medium">Loading Transport Data...</p>
                    </div>
                </div>
            ) : (
                <div className="animate-in fade-in duration-300">
                    {activeTab === "buses" ? (
                        /* BUSES VIEW */
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {filteredBuses.length === 0 ? (
                                <div className="col-span-full py-20 text-center text-gray-400">
                                    <Route className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                    <p>No buses found.</p>
                                </div>
                            ) : filteredBuses.map(bus => {
                                const riders = students.filter(s => s.transport === bus.id).length;
                                const capacityReached = riders >= bus.totalSeats;
                                return (
                                    <Card key={bus.id} className="border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                                        <CardContent className="p-5 flex flex-col h-full">
                                            <div className="flex justify-between items-start mb-4">
                                                <div className="w-14 h-14 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
                                                    <span className="font-bold text-indigo-700 text-lg">{bus.busNumber}</span>
                                                </div>
                                                <div className="flex gap-1.5">
                                                    <button onClick={() => openBusForm(bus)} className="p-2 bg-gray-50 text-gray-500 rounded-lg hover:bg-gray-100 transition-colors">
                                                        <Pencil className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={() => handleDeleteBus(bus)} className="p-2 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-colors">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="space-y-3 flex-1">
                                                <div className="flex gap-2.5 items-start">
                                                    <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                                                    <p className="text-sm text-navy font-semibold">{bus.routeDetails}</p>
                                                </div>
                                                <div className="flex gap-2.5 items-start">
                                                    <Users className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                                                    <p className="text-sm text-gray-600">Driver: {bus.driverName} ({bus.driverContact})</p>
                                                </div>
                                                {bus.helperName && (
                                                    <div className="flex gap-2.5 items-start">
                                                        <ShieldAlert className="w-4 h-4 text-gray-300 mt-0.5 shrink-0" />
                                                        <p className="text-sm text-gray-500">Helper: {bus.helperName}</p>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="mt-5 pt-4 border-t border-gray-50">
                                                <div className="flex justify-between items-center mb-1.5">
                                                    <p className="text-xs font-semibold text-gray-500">Capacity</p>
                                                    <p className={`text-xs font-bold ${capacityReached ? "text-red-500" : "text-navy"}`}>
                                                        {riders} / {bus.totalSeats}
                                                    </p>
                                                </div>
                                                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full ${capacityReached ? "bg-red-500" : "bg-emerald-500"}`}
                                                        style={{ width: `${Math.min((riders / bus.totalSeats) * 100, 100)}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>
                    ) : (
                        /* STUDENTS VIEW */
                        <Card className="border-gray-100 shadow-sm overflow-hidden">
                            <CardContent className="p-0">
                                <div className="relative w-full overflow-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50/50 border-b">
                                            <tr>
                                                <th className="h-12 px-4 text-left font-semibold text-gray-500">Student Name</th>
                                                <th className="h-12 px-4 text-left font-semibold text-gray-500">Class</th>
                                                <th className="h-12 px-4 text-left font-semibold text-gray-500">Contact</th>
                                                <th className="h-12 px-4 text-left font-semibold text-gray-500">Assigned Bus</th>
                                                <th className="h-12 px-4 text-right font-semibold text-gray-500">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-50">
                                            {filteredStudents.length === 0 ? (
                                                <tr><td colSpan={5} className="p-12 text-center text-gray-400">No students found.</td></tr>
                                            ) : filteredStudents.map(student => {
                                                const busId = student.transport || "";
                                                const assignedBus = getBusByTransportString(busId);
                                                const isUnassigned = !assignedBus;

                                                return (
                                                    <tr key={student.id} className="hover:bg-gray-50/60 transition-colors">
                                                        <td className="p-4 font-semibold text-navy">
                                                            <div>{getDisplayName(student)}</div>
                                                            <div className="text-xs text-gray-400 mt-0.5 font-normal">{student.admissionNumber}</div>
                                                        </td>
                                                        <td className="p-4 text-gray-600">{student.className} {student.section}</td>
                                                        <td className="p-4 text-gray-600">{student.mobileNo || "—"}</td>
                                                        <td className="p-4">
                                                            {isUnassigned ? (
                                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-600 border border-red-100">
                                                                    <ShieldAlert className="w-3 h-3" /> Unassigned
                                                                    {busId && busId !== "BUS" ? ` (${busId})` : ""}
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                                                                    <Bus className="w-3.5 h-3.5" /> {assignedBus.busNumber}
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="p-4 text-right">
                                                            <Button onClick={() => openAssignForm(student)} variant="outline" size="sm" className="h-8">
                                                                Assign Bus
                                                            </Button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}

            {/* ─── Add/Edit Bus Modal ─── */}
            {busModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                        <div className="flex justify-between items-center p-5 border-b border-gray-100 gradient-navy">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                <Bus className="w-5 h-5" /> {editingBus ? "Edit Bus Route" : "Add New Bus"}
                            </h2>
                            <button onClick={() => setBusModalOpen(false)} className="text-white/50 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6">
                            <form onSubmit={busForm.handleSubmit(handleBusSubmit)} className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="col-span-1">
                                        <Label>Bus Number *</Label>
                                        <Input {...busForm.register("busNumber")} placeholder="e.g. 12A" className="mt-1" />
                                        {busForm.formState.errors.busNumber && <p className="text-red-500 text-xs mt-1">{busForm.formState.errors.busNumber.message}</p>}
                                    </div>
                                    <div className="col-span-1">
                                        <Label>Total Seats *</Label>
                                        <Input {...busForm.register("totalSeats")} type="number" min={1} className="mt-1" />
                                        {busForm.formState.errors.totalSeats && <p className="text-red-500 text-xs mt-1">{busForm.formState.errors.totalSeats.message}</p>}
                                    </div>
                                </div>
                                <div>
                                    <Label>Route Details *</Label>
                                    <Input {...busForm.register("routeDetails")} placeholder="e.g. Downtown to School via Broad St" className="mt-1" />
                                    {busForm.formState.errors.routeDetails && <p className="text-red-500 text-xs mt-1">{busForm.formState.errors.routeDetails.message}</p>}
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label>Driver Name *</Label>
                                        <Input {...busForm.register("driverName")} placeholder="Driver Name" className="mt-1" />
                                        {busForm.formState.errors.driverName && <p className="text-red-500 text-xs mt-1">{busForm.formState.errors.driverName.message}</p>}
                                    </div>
                                    <div>
                                        <Label>Driver Contact *</Label>
                                        <Input {...busForm.register("driverContact")} placeholder="e.g. 9876543210" className="mt-1" />
                                        {busForm.formState.errors.driverContact && <p className="text-red-500 text-xs mt-1">{busForm.formState.errors.driverContact.message}</p>}
                                    </div>
                                </div>
                                <div>
                                    <Label>Helper Name (Optional)</Label>
                                    <Input {...busForm.register("helperName")} placeholder="Helper Name" className="mt-1" />
                                </div>
                                <div className="flex gap-3 pt-4 border-t mt-6">
                                    <Button type="button" variant="outline" className="flex-1" onClick={() => setBusModalOpen(false)}>Cancel</Button>
                                    <Button type="submit" disabled={savingBus} className="flex-1 bg-navy hover:bg-navy-light text-white">
                                        {savingBus ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Bus"}
                                    </Button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Assign Student Modal ─── */}
            {assignModalOpen && assigningStudent && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
                        <div className="flex justify-between items-center p-5 border-b border-gray-100 gradient-navy">
                            <div>
                                <h2 className="text-lg font-bold text-white">Assign Transport</h2>
                                <p className="text-xs text-white/60">{getDisplayName(assigningStudent)}</p>
                            </div>
                            <button onClick={() => setAssignModalOpen(false)} className="text-white/50 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6">
                            <form onSubmit={assignForm.handleSubmit(handleAssignSubmit)} className="space-y-5">
                                <div>
                                    <Label className="mb-2 block">Transport Mode</Label>
                                    <Controller
                                        name="transportMode" control={assignForm.control}
                                        render={({ field }) => (
                                            <Select onValueChange={field.onChange} value={field.value}>
                                                <SelectTrigger className="w-full bg-white">
                                                    <SelectValue placeholder="Select mode" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="NONE">No Transport (Self / Parent)</SelectItem>
                                                    <SelectItem value="BUS_UNASSIGNED">Uses Bus (Not Assigned Yet)</SelectItem>
                                                    <SelectItem value="BUS_ASSIGNED">Assign to specific Bus</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        )}
                                    />
                                </div>

                                {watchTransportMode === "BUS_ASSIGNED" && (
                                    <div className="p-4 bg-indigo-50/50 rounded-xl border border-indigo-100/50">
                                        <Label className="mb-2 block text-indigo-900">Select Bus Route</Label>
                                        <Controller
                                            name="assignedBusId" control={assignForm.control}
                                            render={({ field }) => (
                                                <Select onValueChange={field.onChange} value={field.value}>
                                                    <SelectTrigger className="w-full bg-white border-indigo-200 focus:border-indigo-400 focus:ring-indigo-100 shadow-sm">
                                                        <SelectValue placeholder="Select a Bus Route..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {buses.length === 0 ? (
                                                            <div className="p-2 text-sm text-center text-gray-500">No buses available. Add a bus first.</div>
                                                        ) : (
                                                            buses.map(b => (
                                                                <SelectItem key={b.id} value={b.id}>
                                                                    <div className="flex flex-col text-left py-1">
                                                                        <span className="font-bold text-navy">Bus {b.busNumber}</span>
                                                                        <span className="text-[10px] text-gray-400 mt-0.5 max-w-[200px] truncate">{b.routeDetails}</span>
                                                                    </div>
                                                                </SelectItem>
                                                            ))
                                                        )}
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        />
                                        {assignForm.formState.errors.assignedBusId && <p className="text-red-500 text-xs mt-1">{assignForm.formState.errors.assignedBusId.message}</p>}
                                    </div>
                                )}

                                <div className="flex gap-3 pt-2">
                                    <Button type="button" variant="outline" className="flex-1" onClick={() => setAssignModalOpen(false)}>Cancel</Button>
                                    <Button type="submit" disabled={savingAssignment} className="flex-1 bg-navy hover:bg-navy-light text-white">
                                        {savingAssignment ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Assignment"}
                                    </Button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
