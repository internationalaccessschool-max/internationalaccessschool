"use client";

import { useState, useEffect, useCallback } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
    Banknote, Search, CheckCircle2, AlertCircle, Clock,
    Loader2, RefreshCw, Bus, School, Users, IndianRupee
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FeeRecord {
    id: string;
    path: string;
    studentId?: string;
    studentName: string;
    rollNo: string;
    admissionNumber?: string;
    class: string;
    section: string;
    parentPhone?: string;
    parentEmail?: string;
    amount: number;
    previousDues?: number;
    totalAmount?: number;
    month: number;
    year: number;
    dueDate: any;
    status: "pending" | "paid" | "overdue" | "carried_forward";
    transportStatus?: "pending" | "paid" | "overdue" | "carried_forward";
    transportFeeAmount?: number;
    transportTotalAmount?: number;
    transportReceiptNo?: string | null;
    isTransportOnly?: boolean;
    paidOn: any;
    receiptNo: string | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const STATUS_CFG: Record<string, { label: string; bg: string; text: string; border: string; icon: any }> = {
    paid:             { label: "Paid",    bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", icon: CheckCircle2 },
    pending:          { label: "Pending", bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200",   icon: Clock        },
    overdue:          { label: "Overdue", bg: "bg-rose-50",    text: "text-rose-700",    border: "border-rose-200",    icon: AlertCircle  },
    carried_forward:  { label: "Arrear",  bg: "bg-purple-50",  text: "text-purple-700",  border: "border-purple-200",  icon: AlertCircle  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function TeacherFeesPage() {
    const [uid, setUid] = useState<string | null>(null);
    const [assignedClass, setAssignedClass] = useState<{ cls: string; section: string } | null>(null);
    const [classLoading, setClassLoading] = useState(true);
    const [records, setRecords] = useState<FeeRecord[]>([]);
    const [loading, setLoading] = useState(false);

    const currentMonth = new Date().getMonth() + 1;
    const currentYear  = new Date().getFullYear();
    const [filterMonth,  setFilterMonth]  = useState(currentMonth);
    const [filterYear,   setFilterYear]   = useState(currentYear);
    const [filterStatus, setFilterStatus] = useState("all");
    const [search, setSearch] = useState("");

    // ── Auth + fetch class assignment ─────────────────────────────────────────
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (user) => {
            if (!user) { setClassLoading(false); return; }
            setUid(user.uid);
            try {
                const ctSnap = await getDocs(collection(db, "class_teachers"));
                const ct = ctSnap.docs.find(d => d.data().teacherId === user.uid);
                if (ct) setAssignedClass({ cls: ct.data().cls, section: ct.data().section });
            } catch { /* no assignment */ } finally {
                setClassLoading(false);
            }
        });
        return () => unsub();
    }, []);

    // ── Fetch fee records ─────────────────────────────────────────────────────
    const fetchRecords = useCallback(async () => {
        if (!assignedClass) return;
        setLoading(true);
        try {
            // 1. School fee records — fetch all class buckets, filter by class+section
            const classesSnap = await getDocs(collection(db, "fees", "structure", "classes"));
            const classIds = classesSnap.docs.map(d => d.id);

            const snapshots = await Promise.all(
                classIds.map(cid =>
                    getDocs(collection(db, `feeRecords/${filterYear}/months/${filterMonth}/classes/${cid}/records`))
                )
            );

            const clsStr = String(assignedClass.cls);
            const secStr = String(assignedClass.section).toUpperCase();

            const allSchool = snapshots
                .flatMap(snap => snap.docs.map(d => ({ id: d.id, path: d.ref.path, ...d.data() } as FeeRecord)))
                .filter(r => String(r.class) === clsStr && String(r.section).toUpperCase() === secStr);

            // Deduplicate by studentId
            const schoolMap = new Map<string, FeeRecord>();
            const rank: Record<string, number> = { paid: 4, overdue: 3, carried_forward: 2, pending: 1 };
            for (const rec of allSchool) {
                const key = rec.studentId || rec.id;
                const existing = schoolMap.get(key);
                if (!existing || (rank[rec.status] ?? 0) > (rank[existing.status] ?? 0))
                    schoolMap.set(key, rec);
            }
            const schoolRecords = Array.from(schoolMap.values());

            // 2. Transport fee records — filter by class+section
            const transportSnap = await getDocs(
                collection(db, "transportFeeRecords", filterYear.toString(), "months", filterMonth.toString(), "students")
            ).catch(() => ({ docs: [] as any[] }));

            const transportMap: Record<string, any> = {};
            for (const d of transportSnap.docs) {
                const td = d.data();
                if (String(td.className) === clsStr && String(td.section).toUpperCase() === secStr) {
                    transportMap[d.id] = td;
                }
            }

            // 3. Merge school + transport
            const schoolUids = new Set<string>();
            const merged: FeeRecord[] = schoolRecords.map(r => {
                const key = r.studentId || r.id;
                schoolUids.add(key);
                const t = transportMap[key];
                if (!t) return r;
                return {
                    ...r,
                    transportStatus: t.status,
                    transportFeeAmount: t.amount,
                    transportTotalAmount: t.totalAmount || t.amount,
                    transportReceiptNo: t.receiptNo || null,
                };
            });

            // 4. Transport-only students
            for (const [key, t] of Object.entries(transportMap)) {
                if (!schoolUids.has(key)) {
                    merged.push({
                        id: key, path: "", studentId: key,
                        studentName: t.studentName, rollNo: "",
                        class: t.className, section: t.section,
                        parentEmail: t.parentEmail, parentPhone: t.parentPhone || "",
                        amount: 0, month: filterMonth, year: filterYear,
                        dueDate: t.dueDate, status: "paid",
                        transportStatus: t.status,
                        transportFeeAmount: t.amount,
                        transportTotalAmount: t.totalAmount || t.amount,
                        transportReceiptNo: t.receiptNo || null,
                        paidOn: null, receiptNo: null, isTransportOnly: true,
                    });
                }
            }

            merged.sort((a, b) => a.studentName?.localeCompare(b.studentName || "") ?? 0);
            setRecords(merged);
        } catch (err) {
            console.error("Fee fetch error:", err);
        } finally {
            setLoading(false);
        }
    }, [assignedClass, filterMonth, filterYear]);

    useEffect(() => { if (assignedClass) fetchRecords(); }, [assignedClass, fetchRecords]);

    // ── Filtered list ─────────────────────────────────────────────────────────
    const filtered = records.filter(r => {
        if (filterStatus !== "all") {
            const sMatch = r.isTransportOnly ? false : r.status === filterStatus;
            const tMatch = r.transportStatus === filterStatus;
            if (!sMatch && !tMatch) return false;
        }
        if (search) {
            const q = search.toLowerCase();
            return (r.studentName?.toLowerCase().includes(q) ||
                (r.admissionNumber || r.rollNo || "").toLowerCase().includes(q));
        }
        return true;
    });

    // ── Stats ─────────────────────────────────────────────────────────────────
    const totalSchoolPaid    = records.filter(r => !r.isTransportOnly && r.status === "paid").length;
    const totalSchoolPending = records.filter(r => !r.isTransportOnly && r.status !== "paid").length;
    const totalTransportPaid = records.filter(r => r.transportStatus === "paid").length;

    // ── WhatsApp message builder ──────────────────────────────────────────────
    const buildWAMsg = (r: FeeRecord) => {
        const schoolDue = !r.isTransportOnly && r.status !== "paid" ? `School Fee ₹${r.totalAmount || r.amount}` : "";
        const transDue  = r.transportFeeAmount && r.transportStatus !== "paid" ? `Transport Fee ₹${r.transportTotalAmount || r.transportFeeAmount}` : "";
        const parts = [schoolDue, transDue].filter(Boolean).join(" + ");
        return encodeURIComponent(
            `Dear Parent, fee for ${r.studentName} (Class ${r.class}-${r.section}) — ${parts} for ${MONTHS[(r.month || 1) - 1]} ${r.year} is due. Please pay at the earliest. - International Access School`
        );
    };

    // ── Render ────────────────────────────────────────────────────────────────
    if (classLoading) {
        return (
            <div className="flex items-center justify-center py-32">
                <Loader2 className="w-8 h-8 animate-spin text-navy" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="rounded-2xl gradient-navy p-6 md:p-8 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.2) 0%, transparent 50%)` }} />
                <div className="relative z-10">
                    <p className="text-white/50 text-sm font-medium">Teacher Portal</p>
                    <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">Class Fees</h1>
                    <p className="text-white/40 text-sm mt-1">
                        {assignedClass
                            ? `Class ${assignedClass.cls} – ${assignedClass.section} · Fee overview for your class`
                            : "View fee status of your class students"}
                    </p>
                </div>
            </div>

            {/* Not a class teacher */}
            {!assignedClass && (
                <div className="bg-white rounded-2xl border border-dashed border-gray-200 py-20 text-center">
                    <Users className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-gray-400">No class assigned</p>
                    <p className="text-xs text-gray-400 mt-1">You are not assigned as a class teacher for any class/section.</p>
                </div>
            )}

            {assignedClass && (
                <>
                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-4">
                        {[
                            { label: "School Fee Paid",    count: totalSchoolPaid,    color: "text-emerald-600", bg: "bg-emerald-50" },
                            { label: "School Fee Pending", count: totalSchoolPending, color: "text-amber-600",   bg: "bg-amber-50"   },
                            { label: "Transport Paid",     count: totalTransportPaid, color: "text-blue-600",    bg: "bg-blue-50"    },
                        ].map(s => (
                            <div key={s.label} className={`${s.bg} rounded-2xl p-4 text-center border border-gray-100`}>
                                <div className={`text-2xl font-extrabold ${s.color}`}>{s.count}</div>
                                <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
                            </div>
                        ))}
                    </div>

                    {/* Filters */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-3 items-center">
                        {/* Month */}
                        <select value={filterMonth} onChange={e => setFilterMonth(Number(e.target.value))}
                            className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-navy bg-white">
                            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                        </select>
                        {/* Year */}
                        <select value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}
                            className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-navy bg-white">
                            {[currentYear - 1, currentYear, currentYear + 1].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                        {/* Status */}
                        <div className="flex rounded-xl border border-gray-200 overflow-hidden">
                            {(["all", "pending", "paid", "overdue"] as const).map(s => (
                                <button key={s} onClick={() => setFilterStatus(s)}
                                    className={`px-3 py-2 text-xs font-semibold capitalize transition-colors ${filterStatus === s ? "bg-navy text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
                                    {s === "all" ? "All" : s}
                                </button>
                            ))}
                        </div>
                        {/* Search */}
                        <div className="relative flex-1 min-w-[180px]">
                            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                            <input value={search} onChange={e => setSearch(e.target.value)}
                                placeholder="Search student…"
                                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-navy bg-white" />
                        </div>
                        {/* Refresh */}
                        <button onClick={fetchRecords} disabled={loading}
                            className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50">
                            <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? "animate-spin" : ""}`} />
                        </button>
                    </div>

                    {/* Table */}
                    {loading ? (
                        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-navy" /></div>
                    ) : filtered.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-dashed border-gray-200 py-16 text-center">
                            <IndianRupee className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                            <p className="text-sm font-semibold text-gray-400">No fee records found</p>
                            <p className="text-xs text-gray-400 mt-1">Records appear after fees are generated for the selected month.</p>
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                                <h3 className="font-bold text-navy text-sm">
                                    Fee Records — {MONTHS[filterMonth - 1]} {filterYear}
                                    <span className="ml-2 text-xs font-normal text-gray-400">({filtered.length} students)</span>
                                </h3>
                                <span className="text-xs text-gray-400 font-medium">
                                    Class {assignedClass.cls} – {assignedClass.section}
                                </span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 border-b border-gray-100">
                                        <tr>
                                            <th className="h-10 px-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">#</th>
                                            <th className="h-10 px-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Student</th>
                                            <th className="h-10 px-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Adm No.</th>
                                            <th className="h-10 px-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                                                <span className="inline-flex items-center gap-1"><School className="w-3 h-3" /> School Fee</span>
                                            </th>
                                            <th className="h-10 px-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                                                <span className="inline-flex items-center gap-1"><Bus className="w-3 h-3" /> Transport</span>
                                            </th>
                                            <th className="h-10 px-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {filtered.map((r, idx) => {
                                            const schoolCfg = r.isTransportOnly ? null : STATUS_CFG[r.status];
                                            const transCfg  = r.transportStatus  ? STATUS_CFG[r.transportStatus] : null;
                                            const SchoolIcon = schoolCfg?.icon;
                                            const TransIcon  = transCfg?.icon;

                                            const schoolUnpaid = !r.isTransportOnly && r.status !== "paid";
                                            const transUnpaid  = !!r.transportFeeAmount && r.transportStatus !== "paid";
                                            const showWA = (schoolUnpaid || transUnpaid) && (r.parentPhone || "");

                                            return (
                                                <tr key={r.id} className="hover:bg-gray-50/60 transition-colors">
                                                    <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                                                    <td className="px-4 py-3">
                                                        <div className="font-semibold text-navy">{r.studentName}</div>
                                                        {r.previousDues ? (
                                                            <div className="text-[10px] text-purple-600 font-medium mt-0.5">
                                                                +₹{r.previousDues} arrear
                                                            </div>
                                                        ) : null}
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-500 text-xs font-mono">
                                                        {r.admissionNumber || r.rollNo || "—"}
                                                    </td>
                                                    {/* School Fee */}
                                                    <td className="px-4 py-3">
                                                        {r.isTransportOnly ? (
                                                            <span className="text-xs text-gray-300">—</span>
                                                        ) : schoolCfg ? (
                                                            <div className="flex flex-col gap-0.5">
                                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border w-fit ${schoolCfg.bg} ${schoolCfg.text} ${schoolCfg.border}`}>
                                                                    {SchoolIcon && <SchoolIcon className="w-3 h-3" />}
                                                                    {schoolCfg.label}
                                                                </span>
                                                                <span className="text-[10px] text-gray-500 font-medium pl-1">
                                                                    ₹{r.totalAmount || r.amount}
                                                                </span>
                                                            </div>
                                                        ) : null}
                                                    </td>
                                                    {/* Transport Fee */}
                                                    <td className="px-4 py-3">
                                                        {transCfg ? (
                                                            <div className="flex flex-col gap-0.5">
                                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border w-fit ${transCfg.bg} ${transCfg.text} ${transCfg.border}`}>
                                                                    {TransIcon && <TransIcon className="w-3 h-3" />}
                                                                    {transCfg.label}
                                                                </span>
                                                                <span className="text-[10px] text-gray-500 font-medium pl-1">
                                                                    ₹{r.transportTotalAmount || r.transportFeeAmount}
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            <span className="text-xs text-gray-300">—</span>
                                                        )}
                                                    </td>
                                                    {/* WhatsApp only */}
                                                    <td className="px-4 py-3">
                                                        {showWA ? (
                                                            <a href={`https://wa.me/91${r.parentPhone}?text=${buildWAMsg(r)}`}
                                                                target="_blank" rel="noopener noreferrer"
                                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 text-green-700 text-xs font-semibold hover:bg-green-100 transition-colors border border-green-100">
                                                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                                                                    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.121.553 4.112 1.522 5.843L.057 23.486a.75.75 0 00.918.919l5.655-1.464A11.942 11.942 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.891 0-3.667-.513-5.192-1.408l-.372-.222-3.857.999 1.017-3.73-.243-.384A9.956 9.956 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                                                                </svg>
                                                                WhatsApp
                                                            </a>
                                                        ) : (
                                                            <span className="text-xs text-gray-300">—</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
