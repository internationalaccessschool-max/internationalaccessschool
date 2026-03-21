"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Search, X, Loader2, Bus, Users, MapPin, Route, UserCheck, Plus, Pencil,
    Trash2, ShieldAlert, Banknote, CheckCircle2, Clock, AlertCircle, RefreshCw, PlusCircle
} from "lucide-react";
import {
    collection, query, getDocs, doc, setDoc, deleteDoc,
    serverTimestamp, orderBy, collectionGroup, updateDoc, getDoc
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Student {
    id: string;
    name?: string;
    firstName?: string;
    middleName?: string;
    lastName?: string;
    admissionNumber?: string;
    className?: string;
    currentClass?: string;
    section?: string;
    mobileNo?: string;
    transport?: string;
    parentEmail?: string;
    status?: string;
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
    monthlyFee?: number;
    createdAt?: any;
    updatedAt?: any;
}

interface TransportFeeRecord {
    id: string;
    studentId: string;
    studentName: string;
    className: string;
    section: string;
    busId: string;
    busNumber: string;
    routeDetails: string;
    amount: number;
    month: number;
    year: number;
    dueDate: any;
    status: "pending" | "paid" | "overdue";
    paidOn: any;
    receiptNo: string | null;
    parentEmail?: string;
    path?: string;
}

type TabType = "bus-students" | "non-bus" | "fees";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const busSchema = z.object({
    busNumber: z.string().min(1, "Bus number is required"),
    routeDetails: z.string().min(1, "Route details are required"),
    driverName: z.string().min(1, "Driver name is required"),
    driverContact: z.string().min(10, "Valid contact required"),
    helperName: z.string().optional(),
    totalSeats: z.coerce.number().min(1, "Seats must be at least 1"),
    monthlyFee: z.coerce.number().min(0, "Fee must be 0 or more"),
});
type BusFormValues = z.infer<typeof busSchema>;

const assignSchema = z.object({
    transportMode: z.string().min(1),
    assignedBusId: z.string().optional(),
});
type AssignFormValues = z.infer<typeof assignSchema>;

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function TransportAdminPage() {
    const [buses, setBuses] = useState<TransportBus[]>([]);
    const [students, setStudents] = useState<Student[]>([]);
    const [activeTab, setActiveTab] = useState<TabType>("bus-students");
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

    // Fee tab state
    const [feeMonth, setFeeMonth] = useState(() => new Date().getMonth() + 1);
    const [feeYear, setFeeYear] = useState(() => new Date().getFullYear());
    const [feeRecords, setFeeRecords] = useState<TransportFeeRecord[]>([]);
    const [loadingFees, setLoadingFees] = useState(false);
    const [generatingFees, setGeneratingFees] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [busView, setBusView] = useState<"all" | string>("all"); // filter by bus in buses tab

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

    // ─── Fetch Data ─────────────────────────────────────────────────────────
    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const busSnap = await getDocs(query(collection(db, "transport_buses"), orderBy("busNumber")));
            const loadedBuses = busSnap.docs.map(d => ({ id: d.id, ...d.data() } as TransportBus));
            setBuses(loadedBuses);

            const studentSnap = await getDocs(collectionGroup(db, "profiles"));
            const allStudents = studentSnap.docs.map(d => ({ id: d.id, ...d.data() } as Student));
            setStudents(allStudents.filter(s => (s.status || "").toUpperCase() !== "LEFT"));
        } catch (error) {
            console.error("Error fetching transport data:", error);
            showToast("Failed to load data.", "error");
        } finally {
            setIsLoading(false);
        }
    }, [showToast]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // ─── Fee Records ─────────────────────────────────────────────────────────
    const fetchFeeRecords = useCallback(async () => {
        setLoadingFees(true);
        try {
            const snap = await getDocs(
                collection(db, "transportFeeRecords", feeYear.toString(), "months", feeMonth.toString(), "students")
            );
            const records = snap.docs.map(d => ({ id: d.id, path: d.ref.path, ...d.data() } as TransportFeeRecord));
            records.sort((a, b) => a.studentName?.localeCompare(b.studentName || "") || 0);
            setFeeRecords(records);
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingFees(false);
        }
    }, [feeMonth, feeYear]);

    useEffect(() => {
        if (activeTab === "fees") fetchFeeRecords();
    }, [activeTab, fetchFeeRecords]);

    const handleGenerateTransportFees = async () => {
        const busStudents = students.filter(s => {
            const t = (s.transport || "").trim().toUpperCase();
            return t === "BUS" || t.startsWith("BUS-");
        });

        if (busStudents.length === 0) {
            showToast("No bus students found. Assign buses to students first.", "error");
            return;
        }

        const confirm = window.confirm(
            `Generate transport fee records for ${MONTHS[feeMonth - 1]} ${feeYear}?\n\n` +
            `• ${busStudents.length} bus students will get records\n` +
            `• Existing records for the same month will be skipped`
        );
        if (!confirm) return;

        setGeneratingFees(true);
        let created = 0, skipped = 0;
        try {
            for (const student of busStudents) {
                const studentId = student.id;
                const docRef = doc(db, "transportFeeRecords", feeYear.toString(), "months", feeMonth.toString(), "students", studentId);
                const existing = await getDoc(docRef);
                if (existing.exists()) { skipped++; continue; }

                // Find assigned bus to get fee
                const busId = (student.transport || "").trim();
                const assignedBus = buses.find(b => b.id === busId || busId === "BUS");
                const feeAmount = assignedBus?.monthlyFee || 0;

                const name = getDisplayName(student);
                const cls = student.currentClass || student.className || "";
                const dueDate = new Date(feeYear, feeMonth - 1, 10);

                await setDoc(docRef, {
                    studentId,
                    studentName: name,
                    className: cls,
                    section: student.section || "",
                    busId: busId || "BUS",
                    busNumber: assignedBus?.busNumber || "—",
                    routeDetails: assignedBus?.routeDetails || "",
                    amount: feeAmount,
                    month: feeMonth,
                    year: feeYear,
                    dueDate,
                    status: "pending",
                    paidOn: null,
                    receiptNo: null,
                    parentEmail: student.parentEmail || student.email || "",
                    createdAt: serverTimestamp(),
                });
                created++;
            }
            showToast(`Generated ${created} records. ${skipped} existing skipped.`);
            fetchFeeRecords();
        } catch (err) {
            console.error(err);
            showToast("Error generating fees.", "error");
        } finally {
            setGeneratingFees(false);
        }
    };

    const handleMarkTransportPaid = async (record: TransportFeeRecord) => {
        setActionLoading(record.id);
        try {
            const seq = Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
            const receiptNo = `TRP-${record.year}-${String(record.month).padStart(2, "0")}-${seq}`;
            const path = record.path || `transportFeeRecords/${record.year}/months/${record.month}/students/${record.id}`;
            await updateDoc(doc(db, path), {
                status: "paid",
                paidOn: new Date(),
                receiptNo,
            });
            setFeeRecords(prev => prev.map(r => r.id === record.id
                ? { ...r, status: "paid", receiptNo, paidOn: { toDate: () => new Date() } }
                : r
            ));
            showToast(`Marked paid — Receipt: ${receiptNo}`);
        } catch (e) {
            console.error(e);
            showToast("Failed to mark paid.", "error");
        } finally {
            setActionLoading(null);
        }
    };

    const handleMarkOverdue = async (record: TransportFeeRecord) => {
        setActionLoading(record.id + "_od");
        try {
            const path = record.path || `transportFeeRecords/${record.year}/months/${record.month}/students/${record.id}`;
            await updateDoc(doc(db, path), { status: "overdue" });
            setFeeRecords(prev => prev.map(r => r.id === record.id ? { ...r, status: "overdue" } : r));
            showToast("Marked as overdue.");
        } catch (e) {
            showToast("Failed.", "error");
        } finally {
            setActionLoading(null);
        }
    };

    // ─── Bus Management ──────────────────────────────────────────────────────
    const openBusForm = (bus?: TransportBus) => {
        setEditingBus(bus || null);
        busForm.reset(bus
            ? { busNumber: bus.busNumber, routeDetails: bus.routeDetails, driverName: bus.driverName, driverContact: bus.driverContact, helperName: bus.helperName || "", totalSeats: bus.totalSeats, monthlyFee: bus.monthlyFee || 0 }
            : { busNumber: "", routeDetails: "", driverName: "", driverContact: "", helperName: "", totalSeats: 40, monthlyFee: 0 }
        );
        setBusModalOpen(true);
    };

    const handleBusSubmit = async (data: BusFormValues) => {
        setSavingBus(true);
        try {
            const isNew = !editingBus;
            const busId = isNew ? `bus-${Date.now()}` : editingBus!.id;
            await setDoc(doc(db, "transport_buses", busId), {
                ...data, id: busId,
                updatedAt: serverTimestamp(),
                ...(isNew ? { createdAt: serverTimestamp() } : {})
            }, { merge: true });
            showToast(`Bus ${data.busNumber} ${isNew ? "added" : "updated"}!`);
            setBusModalOpen(false);
            fetchData();
        } catch (err) {
            showToast("Failed to save bus.", "error");
        } finally {
            setSavingBus(false);
        }
    };

    const handleDeleteBus = async (bus: TransportBus) => {
        if (!confirm(`Delete Bus ${bus.busNumber}? Students assigned to it will become unassigned.`)) return;
        try {
            await deleteDoc(doc(db, "transport_buses", bus.id));
            showToast("Bus deleted.");
            fetchData();
        } catch {
            showToast("Failed to delete.", "error");
        }
    };

    // ─── Student Assignment ──────────────────────────────────────────────────
    const openAssignForm = (student: Student) => {
        setAssigningStudent(student);
        const t = (student.transport || "").trim().toUpperCase();
        let initialMode = "NONE";
        let initialBusId = "";
        if (t === "BUS") { initialMode = "BUS_UNASSIGNED"; }
        else if (t.startsWith("BUS-")) { initialMode = "BUS_ASSIGNED"; initialBusId = student.transport || ""; }
        else if (t && t !== "NONE") { initialMode = "BUS_UNASSIGNED"; }
        assignForm.reset({ transportMode: initialMode, assignedBusId: initialBusId });
        setAssignModalOpen(true);
    };

    const handleAssignSubmit = async (data: AssignFormValues) => {
        if (!assigningStudent) return;
        setSavingAssignment(true);
        try {
            let newTransport = "NONE";
            if (data.transportMode === "BUS_ASSIGNED" && data.assignedBusId) {
                newTransport = data.assignedBusId;
            } else if (data.transportMode === "BUS_UNASSIGNED") {
                newTransport = "BUS";
            }
            const className = assigningStudent.className || assigningStudent.currentClass || "Unknown";
            const section = assigningStudent.section || "Unknown";
            const profileRef = doc(db, "users", "classes", className, "sections", section, "students", "profiles", assigningStudent.id);
            await setDoc(profileRef, { transport: newTransport }, { merge: true });
            showToast("Transport updated!");
            setAssignModalOpen(false);
            fetchData();
        } catch (err) {
            showToast("Failed to update transport.", "error");
        } finally {
            setSavingAssignment(false);
        }
    };

    // ─── Helpers ─────────────────────────────────────────────────────────────
    const getDisplayName = (s: Student) => {
        const raw = `${s.firstName || ""} ${s.middleName || ""} ${s.lastName || ""}`.replace(/\s+/g, " ").trim();
        return raw || s.name || "Unknown Student";
    };

    const getBusById = (id: string) => buses.find(b => b.id === id) || null;

    const isBusStudent = (s: Student) => {
        const t = (s.transport || "").trim().toUpperCase();
        return t === "BUS" || t.startsWith("BUS-");
    };

    // ─── Derived lists ───────────────────────────────────────────────────────
    const busStudents = students.filter(isBusStudent);
    const nonBusStudents = students.filter(s => !isBusStudent(s));

    const filterStudents = (list: Student[]) => {
        if (!searchTerm) return list;
        const q = searchTerm.toLowerCase();
        return list.filter(s =>
            getDisplayName(s).toLowerCase().includes(q) ||
            (s.admissionNumber || "").toLowerCase().includes(q) ||
            ((s.currentClass || s.className || "") + " " + (s.section || "")).toLowerCase().includes(q)
        );
    };

    const filteredFeeRecords = feeRecords.filter(r => {
        if (!searchTerm) return true;
        const q = searchTerm.toLowerCase();
        return r.studentName?.toLowerCase().includes(q) || r.busNumber?.toLowerCase().includes(q) || r.className?.includes(q);
    });

    const totalCollected = feeRecords.filter(r => r.status === "paid").reduce((s, r) => s + r.amount, 0);
    const totalPending = feeRecords.filter(r => r.status !== "paid").reduce((s, r) => s + r.amount, 0);
    const overdueCount = feeRecords.filter(r => r.status === "overdue").length;

    const STATUS_CFG = {
        paid: { label: "Paid", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
        pending: { label: "Pending", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
        overdue: { label: "Overdue", bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
    };

    // ─── Render ───────────────────────────────────────────────────────────────
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
                        {buses.length} Active Buses · {busStudents.length} Bus Students · {nonBusStudents.length} Walk/Self Students
                    </p>
                </div>
            </div>

            {/* Metrics */}
            <div className="grid gap-4 sm:grid-cols-4">
                {[
                    { label: "Active Buses", value: buses.length, icon: Bus, bg: "bg-indigo-50", text: "text-indigo-600" },
                    { label: "Bus Students", value: busStudents.length, icon: UserCheck, bg: "bg-emerald-50", text: "text-emerald-600" },
                    { label: "Walk / Self", value: nonBusStudents.length, icon: Users, bg: "bg-amber-50", text: "text-amber-600" },
                    { label: "Unassigned Bus", value: busStudents.filter(s => (s.transport || "").toUpperCase() === "BUS").length, icon: ShieldAlert, bg: "bg-rose-50", text: "text-rose-600" },
                ].map(m => (
                    <div key={m.label} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl ${m.bg} flex items-center justify-center shrink-0`}>
                            <m.icon className={`w-6 h-6 ${m.text}`} />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-navy">{m.value}</p>
                            <p className="text-xs text-gray-500 font-medium">{m.label}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Tabs + Search */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div className="flex gap-1 p-1 bg-white border border-gray-200 rounded-xl max-w-fit shadow-sm">
                    {([
                        { id: "bus-students", label: "Bus Students", icon: Bus, count: busStudents.length },
                        { id: "non-bus", label: "Walk / Self", icon: Users, count: nonBusStudents.length },
                        { id: "fees", label: "Transport Fees", icon: Banknote, count: null },
                    ] as const).map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5
                                ${activeTab === tab.id ? "bg-indigo-50 text-indigo-700" : "text-gray-500 hover:text-gray-900"}`}
                        >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                            {tab.count !== null && (
                                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${activeTab === tab.id ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-500"}`}>
                                    {tab.count}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="search" placeholder="Search..."
                            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                            className="pl-9 pr-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/10 w-52 bg-white shadow-sm"
                        />
                    </div>
                    {activeTab !== "fees" && (
                        <Button onClick={() => openBusForm()} variant="outline" size="sm" className="shrink-0">
                            <Plus className="w-4 h-4 mr-1.5" />Add Bus
                        </Button>
                    )}
                </div>
            </div>

            {/* Content */}
            {isLoading ? (
                <div className="min-h-[400px] flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-navy" />
                </div>
            ) : (
                <div className="animate-in fade-in duration-300">
                    {/* ── BUS STUDENTS TAB ── */}
                    {activeTab === "bus-students" && (
                        <div className="space-y-4">
                            {/* Bus filter chips */}
                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => setBusView("all")}
                                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${busView === "all" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"}`}
                                >
                                    All Buses
                                </button>
                                {buses.map(b => (
                                    <button
                                        key={b.id}
                                        onClick={() => setBusView(b.id)}
                                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${busView === b.id ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"}`}
                                    >
                                        Bus {b.busNumber}
                                    </button>
                                ))}
                                <button
                                    onClick={() => setBusView("unassigned")}
                                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${busView === "unassigned" ? "bg-rose-600 text-white border-rose-600" : "bg-white text-gray-600 border-gray-200 hover:border-rose-300"}`}
                                >
                                    Unassigned
                                </button>
                            </div>

                            <Card className="border-gray-100 shadow-sm overflow-hidden">
                                <CardContent className="p-0">
                                    <table className="w-full text-sm">
                                        <thead className="bg-indigo-50/60 border-b border-gray-100">
                                            <tr>
                                                <th className="h-11 px-4 text-left font-semibold text-gray-600">#</th>
                                                <th className="h-11 px-4 text-left font-semibold text-gray-600">Student Name</th>
                                                <th className="h-11 px-4 text-left font-semibold text-gray-600">Class</th>
                                                <th className="h-11 px-4 text-left font-semibold text-gray-600">Contact</th>
                                                <th className="h-11 px-4 text-left font-semibold text-gray-600">Assigned Bus</th>
                                                <th className="h-11 px-4 text-right font-semibold text-gray-600">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-50">
                                            {(() => {
                                                let list = filterStudents(busStudents);
                                                if (busView !== "all") {
                                                    if (busView === "unassigned") {
                                                        list = list.filter(s => (s.transport || "").toUpperCase() === "BUS");
                                                    } else {
                                                        list = list.filter(s => s.transport === busView);
                                                    }
                                                }
                                                if (list.length === 0) return (
                                                    <tr><td colSpan={6} className="p-12 text-center text-gray-400">No bus students found.</td></tr>
                                                );
                                                return list.map((student, idx) => {
                                                    const assignedBus = getBusById(student.transport || "");
                                                    return (
                                                        <tr key={student.id} className="hover:bg-indigo-50/30 transition-colors">
                                                            <td className="p-4 text-gray-400 text-xs">{idx + 1}</td>
                                                            <td className="p-4">
                                                                <div className="font-semibold text-navy">{getDisplayName(student)}</div>
                                                                <div className="text-xs text-gray-400">{student.admissionNumber}</div>
                                                            </td>
                                                            <td className="p-4 text-gray-600">
                                                                {student.currentClass || student.className || "—"} {student.section || ""}
                                                            </td>
                                                            <td className="p-4 text-gray-600">{student.mobileNo || "—"}</td>
                                                            <td className="p-4">
                                                                {assignedBus ? (
                                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                                                                        <Bus className="w-3.5 h-3.5" /> Bus {assignedBus.busNumber}
                                                                    </span>
                                                                ) : (
                                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-600 border border-rose-100">
                                                                        <ShieldAlert className="w-3 h-3" /> Unassigned
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="p-4 text-right">
                                                                <Button onClick={() => openAssignForm(student)} variant="outline" size="sm" className="h-8">
                                                                    Change Bus
                                                                </Button>
                                                            </td>
                                                        </tr>
                                                    );
                                                });
                                            })()}
                                        </tbody>
                                    </table>
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    {/* ── NON-BUS STUDENTS TAB ── */}
                    {activeTab === "non-bus" && (
                        <Card className="border-gray-100 shadow-sm overflow-hidden">
                            <CardContent className="p-0">
                                <table className="w-full text-sm">
                                    <thead className="bg-amber-50/60 border-b border-gray-100">
                                        <tr>
                                            <th className="h-11 px-4 text-left font-semibold text-gray-600">#</th>
                                            <th className="h-11 px-4 text-left font-semibold text-gray-600">Student Name</th>
                                            <th className="h-11 px-4 text-left font-semibold text-gray-600">Class</th>
                                            <th className="h-11 px-4 text-left font-semibold text-gray-600">Contact</th>
                                            <th className="h-11 px-4 text-left font-semibold text-gray-600">Mode</th>
                                            <th className="h-11 px-4 text-right font-semibold text-gray-600">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-50">
                                        {filterStudents(nonBusStudents).length === 0 ? (
                                            <tr><td colSpan={6} className="p-12 text-center text-gray-400">No non-bus students found.</td></tr>
                                        ) : filterStudents(nonBusStudents).map((student, idx) => (
                                            <tr key={student.id} className="hover:bg-amber-50/30 transition-colors">
                                                <td className="p-4 text-gray-400 text-xs">{idx + 1}</td>
                                                <td className="p-4">
                                                    <div className="font-semibold text-navy">{getDisplayName(student)}</div>
                                                    <div className="text-xs text-gray-400">{student.admissionNumber}</div>
                                                </td>
                                                <td className="p-4 text-gray-600">
                                                    {student.currentClass || student.className || "—"} {student.section || ""}
                                                </td>
                                                <td className="p-4 text-gray-600">{student.mobileNo || "—"}</td>
                                                <td className="p-4">
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-100">
                                                        <Users className="w-3 h-3" /> {student.transport?.toUpperCase() === "NONE" || !student.transport ? "Walk / Self" : student.transport}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-right">
                                                    <Button onClick={() => openAssignForm(student)} variant="outline" size="sm" className="h-8">
                                                        Assign Bus
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </CardContent>
                        </Card>
                    )}

                    {/* ── TRANSPORT FEES TAB ── */}
                    {activeTab === "fees" && (
                        <div className="space-y-5">
                            {/* Bus Fee Structure */}
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                                <h3 className="font-bold text-navy mb-4 flex items-center gap-2">
                                    <Bus className="w-5 h-5 text-indigo-500" />
                                    Monthly Fee Per Bus Route
                                </h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {buses.map(bus => (
                                        <div key={bus.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-gray-50/50">
                                            <div>
                                                <p className="text-sm font-bold text-navy">Bus {bus.busNumber}</p>
                                                <p className="text-xs text-gray-400 truncate max-w-[140px]">{bus.routeDetails}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-base font-bold text-indigo-700">₹{(bus.monthlyFee || 0).toLocaleString()}</p>
                                                <button
                                                    onClick={() => openBusForm(bus)}
                                                    className="text-xs text-indigo-400 hover:text-indigo-600 font-medium transition-colors"
                                                >
                                                    Edit fee
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    {buses.length === 0 && (
                                        <p className="text-sm text-gray-400 col-span-3">No buses added yet. Add buses first.</p>
                                    )}
                                </div>
                            </div>

                            {/* Generate Controls */}
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                                <div className="flex flex-wrap items-end gap-4">
                                    <div>
                                        <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Month</label>
                                        <select value={feeMonth} onChange={e => setFeeMonth(Number(e.target.value))}
                                            className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-indigo-400 outline-none bg-white">
                                            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Year</label>
                                        <select value={feeYear} onChange={e => setFeeYear(Number(e.target.value))}
                                            className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-indigo-400 outline-none bg-white">
                                            {[feeYear - 1, feeYear, feeYear + 1].map(y => <option key={y} value={y}>{y}</option>)}
                                        </select>
                                    </div>
                                    <Button
                                        onClick={handleGenerateTransportFees}
                                        disabled={generatingFees}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white"
                                    >
                                        {generatingFees ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <PlusCircle className="w-4 h-4 mr-2" />}
                                        Generate Transport Fees
                                    </Button>
                                    <Button onClick={fetchFeeRecords} variant="outline" size="icon" className="shrink-0" title="Refresh">
                                        <RefreshCw className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>

                            {/* Fee Stats */}
                            {feeRecords.length > 0 && (
                                <div className="grid grid-cols-3 gap-4">
                                    {[
                                        { label: "Collected", value: `₹${totalCollected.toLocaleString()}`, icon: CheckCircle2, bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
                                        { label: "Pending", value: `₹${totalPending.toLocaleString()}`, icon: Clock, bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
                                        { label: "Overdue", value: overdueCount.toString(), icon: AlertCircle, bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
                                    ].map(s => (
                                        <div key={s.label} className={`${s.bg} border ${s.border} rounded-2xl p-4`}>
                                            <s.icon className={`w-4 h-4 ${s.text} mb-2`} />
                                            <div className={`text-xl font-bold ${s.text}`}>{s.value}</div>
                                            <div className={`text-xs ${s.text} opacity-70`}>{s.label}</div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Fee Records Table */}
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                                    <h3 className="font-bold text-navy">
                                        Transport Fee Records — {MONTHS[feeMonth - 1]} {feeYear}
                                        <span className="ml-2 text-xs font-normal text-gray-400">({feeRecords.length} records)</span>
                                    </h3>
                                </div>
                                {loadingFees ? (
                                    <div className="flex items-center justify-center py-16">
                                        <Loader2 className="w-8 h-8 animate-spin text-navy" />
                                    </div>
                                ) : filteredFeeRecords.length === 0 ? (
                                    <div className="text-center py-16 text-gray-400">
                                        <Banknote className="w-10 h-10 mx-auto mb-3 opacity-20" />
                                        <p className="text-sm font-medium">No transport fee records for this month</p>
                                        <p className="text-xs mt-1">Click "Generate Transport Fees" to create records for bus students.</p>
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wider">
                                                <tr>
                                                    <th className="px-4 py-3 text-left">#</th>
                                                    <th className="px-4 py-3 text-left">Student</th>
                                                    <th className="px-4 py-3 text-left">Bus</th>
                                                    <th className="px-4 py-3 text-left">Amount</th>
                                                    <th className="px-4 py-3 text-left">Status</th>
                                                    <th className="px-4 py-3 text-left">Receipt</th>
                                                    <th className="px-4 py-3 text-left">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {filteredFeeRecords.map((record, idx) => {
                                                    const cfg = STATUS_CFG[record.status] || STATUS_CFG.pending;
                                                    return (
                                                        <tr key={record.id} className="hover:bg-gray-50/60 transition-colors">
                                                            <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                                                            <td className="px-4 py-3">
                                                                <div className="font-semibold text-navy">{record.studentName}</div>
                                                                <div className="text-xs text-gray-400">Class {record.className}{record.section ? `-${record.section}` : ""}</div>
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-1 rounded-lg">
                                                                    <Bus className="w-3 h-3" /> {record.busNumber || "—"}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-3 font-bold text-navy">₹{record.amount?.toLocaleString() || "0"}</td>
                                                            <td className="px-4 py-3">
                                                                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                                                                    {cfg.label}
                                                                </span>
                                                                {record.status === "paid" && record.paidOn?.toDate && (
                                                                    <div className="text-xs text-gray-400 mt-0.5">
                                                                        {record.paidOn.toDate().toLocaleDateString("en-IN")}
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-3 text-xs text-gray-400 font-mono">{record.receiptNo || "—"}</td>
                                                            <td className="px-4 py-3">
                                                                <div className="flex gap-2">
                                                                    {record.status !== "paid" && (
                                                                        <button
                                                                            onClick={() => handleMarkTransportPaid(record)}
                                                                            disabled={actionLoading === record.id}
                                                                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100 disabled:opacity-50 transition-colors"
                                                                        >
                                                                            {actionLoading === record.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                                                                            Paid
                                                                        </button>
                                                                    )}
                                                                    {record.status === "pending" && (
                                                                        <button
                                                                            onClick={() => handleMarkOverdue(record)}
                                                                            disabled={actionLoading === record.id + "_od"}
                                                                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-50 text-rose-700 text-xs font-medium hover:bg-rose-100 disabled:opacity-50 transition-colors"
                                                                        >
                                                                            Overdue
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ─── Add/Edit Bus Modal ─── */}
            {busModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                        <div className="flex justify-between items-center p-5 border-b gradient-navy">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                <Bus className="w-5 h-5" /> {editingBus ? "Edit Bus Route" : "Add New Bus"}
                            </h2>
                            <button onClick={() => setBusModalOpen(false)} className="text-white/50 hover:text-white"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-6 overflow-y-auto max-h-[70vh]">
                            <form onSubmit={busForm.handleSubmit(handleBusSubmit)} className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label>Bus Number *</Label>
                                        <Input {...busForm.register("busNumber")} placeholder="e.g. 12A" className="mt-1" />
                                        {busForm.formState.errors.busNumber && <p className="text-red-500 text-xs mt-1">{busForm.formState.errors.busNumber.message}</p>}
                                    </div>
                                    <div>
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
                                    </div>
                                    <div>
                                        <Label>Driver Contact *</Label>
                                        <Input {...busForm.register("driverContact")} placeholder="9876543210" className="mt-1" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label>Helper Name</Label>
                                        <Input {...busForm.register("helperName")} placeholder="Optional" className="mt-1" />
                                    </div>
                                    <div>
                                        <Label>Monthly Fee (₹) *</Label>
                                        <Input {...busForm.register("monthlyFee")} type="number" min={0} placeholder="e.g. 1500" className="mt-1" />
                                        <p className="text-xs text-gray-400 mt-1">Transport fee per student/month</p>
                                    </div>
                                </div>
                                <div className="flex gap-3 pt-4 border-t mt-2">
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
                        <div className="flex justify-between items-center p-5 border-b gradient-navy">
                            <div>
                                <h2 className="text-lg font-bold text-white">Assign Transport</h2>
                                <p className="text-xs text-white/60">{getDisplayName(assigningStudent)}</p>
                            </div>
                            <button onClick={() => setAssignModalOpen(false)} className="text-white/50 hover:text-white"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-6">
                            <form onSubmit={assignForm.handleSubmit(handleAssignSubmit)} className="space-y-5">
                                <div>
                                    <Label className="mb-2 block">Transport Mode</Label>
                                    <Controller
                                        name="transportMode" control={assignForm.control}
                                        render={({ field }) => (
                                            <Select onValueChange={field.onChange} value={field.value}>
                                                <SelectTrigger className="w-full bg-white"><SelectValue placeholder="Select mode" /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="NONE">No Transport (Walk / Self)</SelectItem>
                                                    <SelectItem value="BUS_UNASSIGNED">Uses Bus (Not Assigned Yet)</SelectItem>
                                                    <SelectItem value="BUS_ASSIGNED">Assign to Specific Bus</SelectItem>
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
                                                    <SelectTrigger className="w-full bg-white border-indigo-200">
                                                        <SelectValue placeholder="Select a Bus..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {buses.length === 0 ? (
                                                            <div className="p-2 text-sm text-center text-gray-500">No buses available.</div>
                                                        ) : buses.map(b => (
                                                            <SelectItem key={b.id} value={b.id}>
                                                                <div className="flex flex-col text-left py-1">
                                                                    <span className="font-bold text-navy">Bus {b.busNumber}</span>
                                                                    <span className="text-[10px] text-gray-400">{b.routeDetails}</span>
                                                                    {b.monthlyFee ? <span className="text-[10px] text-indigo-600 font-semibold">₹{b.monthlyFee}/month</span> : null}
                                                                </div>
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        />
                                    </div>
                                )}
                                <div className="flex gap-3 pt-2">
                                    <Button type="button" variant="outline" className="flex-1" onClick={() => setAssignModalOpen(false)}>Cancel</Button>
                                    <Button type="submit" disabled={savingAssignment} className="flex-1 bg-navy hover:bg-navy-light text-white">
                                        {savingAssignment ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
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
