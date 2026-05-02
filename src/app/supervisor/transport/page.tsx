"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
    Search, Loader2, Bus, Users, Route, Map, UserCheck, ShieldAlert,
    ChevronUp, ChevronDown, ChevronsUpDown
} from "lucide-react";
import {
    collection, query, getDocs, orderBy, collectionGroup
} from "firebase/firestore";
import { db } from "@/lib/firebase";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Student {
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
    address?: string;
    village?: string;
    city?: string;
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
}

type TabType = "students" | "buses";

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SupervisorTransportPage() {
    const [buses, setBuses] = useState<TransportBus[]>([]);
    const [students, setStudents] = useState<Student[]>([]);
    const [activeTab, setActiveTab] = useState<TabType>("students");
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [sortKey, setSortKey] = useState<string | null>(null);
    const [sortAsc, setSortAsc] = useState(true);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const busSnap = await getDocs(query(collection(db, "transport_buses"), orderBy("busNumber")));
            setBuses(busSnap.docs.map(d => ({ id: d.id, ...d.data() } as TransportBus)));

            const studentSnap = await getDocs(collectionGroup(db, "profiles"));
            setStudents(studentSnap.docs.map(d => ({ id: d.id, ...d.data() } as Student)));
        } catch (error) {
            console.error("Error fetching transport data:", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const getDisplayName = (s: Student) => {
        const raw = `${s.firstName || ""} ${s.middleName || ""} ${s.lastName || ""}`.replace(/\s+/g, " ").trim();
        return raw || s.name || "Unknown Student";
    };

    const getStudentAddress = (s: Student) =>
        s.address || s.village || s.city || s.presentAddress || s.localAddress || "";

    const handleSort = (key: string) => {
        if (sortKey === key) setSortAsc(p => !p);
        else { setSortKey(key); setSortAsc(true); }
    };

    const SortIcon = ({ k }: { k: string }) => sortKey === k
        ? sortAsc ? <ChevronUp className="w-3 h-3 text-navy" /> : <ChevronDown className="w-3 h-3 text-navy" />
        : <ChevronsUpDown className="w-3 h-3 opacity-30" />;

    const getBusByTransportString = (ts: string) =>
        buses.find(b => b.id === ts) || null;

    const filteredStudents = (() => {
        const list = students.filter(s => {
            if (!searchTerm) return true;
            const q = searchTerm.toLowerCase();
            return (getDisplayName(s).toLowerCase().includes(q) ||
                (s.admissionNumber || "").toLowerCase().includes(q) ||
                (s.className || "").toLowerCase().includes(q));
        });
        if (!sortKey) return list;
        return [...list].sort((a, b) => {
            let av = "", bv = "";
            if (sortKey === "name")    { av = getDisplayName(a); bv = getDisplayName(b); }
            else if (sortKey === "enr"){ av = a.admissionNumber || ""; bv = b.admissionNumber || ""; }
            else if (sortKey === "class"){ av = `${a.className || ""}${a.section || ""}`; bv = `${b.className || ""}${b.section || ""}`; }
            else if (sortKey === "contact"){ av = a.mobileNo || ""; bv = b.mobileNo || ""; }
            else if (sortKey === "address"){ av = getStudentAddress(a); bv = getStudentAddress(b); }
            else if (sortKey === "bus") { av = getBusByTransportString(a.transport || "")?.busNumber || ""; bv = getBusByTransportString(b.transport || "")?.busNumber || ""; }
            const cmp = av.localeCompare(bv, undefined, { numeric: true });
            return sortAsc ? cmp : -cmp;
        });
    })();

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
            {/* Header */}
            <div className="rounded-2xl gradient-navy p-6 md:p-8 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 80% 50%, rgba(200,169,81,0.3) 0%, transparent 60%)" }} />
                <div className="relative z-10">
                    <p className="text-white/50 text-sm font-medium">Supervisor Panel</p>
                    <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">Transport Overview</h1>
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
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="search" placeholder={`Search ${activeTab}...`}
                        value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                        className="pl-9 pr-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/10 w-full sm:w-64 bg-white shadow-sm"
                    />
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
                                                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${capacityReached ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"}`}>
                                                    {riders}/{bus.totalSeats} seats
                                                </span>
                                            </div>
                                            <div className="space-y-3 flex-1">
                                                <div className="flex gap-2.5 items-start">
                                                    <Map className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
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
                        <Card className="border-gray-100 shadow-sm overflow-hidden">
                            <CardContent className="p-0">
                                <div className="relative w-full overflow-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50/50 border-b">
                                            <tr>
                                                {[
                                                    { label: "Student Name", key: "name" },
                                                    { label: "Class",        key: "class" },
                                                    { label: "Contact",      key: "contact" },
                                                    { label: "Address",      key: "address" },
                                                    { label: "Assigned Bus", key: "bus" },
                                                ].map(({ label, key }) => (
                                                    <th key={key} onClick={() => handleSort(key)}
                                                        className="h-12 px-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-800 hover:bg-gray-100 select-none transition-colors">
                                                        <span className="inline-flex items-center gap-1">{label}<SortIcon k={key} /></span>
                                                    </th>
                                                ))}
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
                                                        <td className="p-4 text-gray-500 text-xs max-w-[160px]">
                                                            {getStudentAddress(student) || <span className="text-gray-300">—</span>}
                                                        </td>
                                                        <td className="p-4">
                                                            {isUnassigned ? (
                                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-600 border border-red-100">
                                                                    <ShieldAlert className="w-3 h-3" /> Unassigned
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                                                                    <Bus className="w-3.5 h-3.5" /> {assignedBus!.busNumber}
                                                                </span>
                                                            )}
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
        </div>
    );
}
