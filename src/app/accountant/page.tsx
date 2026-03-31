"use client";

import { useState, useEffect, useCallback } from "react";
import { collection, getDocs, query, where, orderBy, collectionGroup, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import {
    Banknote, TrendingUp, Clock, AlertCircle, CheckCircle2,
    ArrowUpRight, Search, Loader2, RefreshCw, Bus, School,
    Calendar, Users, BarChart3, History, ChevronRight, FileText, X
} from "lucide-react";
import Link from "next/link";

interface FeeRecord {
    id: string;
    path?: string;
    studentId?: string;
    studentName: string;
    rollNo?: string;
    class: string;
    section: string;
    parentEmail?: string;
    amount: number;
    totalAmount?: number;
    previousDues?: number;
    month: number;
    year: number;
    dueDate: { toDate: () => Date } | null;
    paidOn: { toDate: () => Date } | null;
    status: "pending" | "paid" | "overdue" | "carried_forward";
    receiptNo: string | null;
    paymentMode?: string;
    breakdown?: Record<string, number>;
    transportStatus?: string;
    transportFeeAmount?: number;
    transportReceiptNo?: string;
}

interface TransportRecord {
    id: string;
    studentId: string;
    studentName: string;
    className: string;
    section: string;
    amount: number;
    totalAmount?: number;
    previousDues?: number;
    month: number;
    year: number;
    status: string;
    receiptNo: string | null;
    paidOn: { toDate: () => Date } | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Format receipt number for display
function formatReceiptDisplay(receiptNo: string | null): string {
    if (!receiptNo) return "—";
    return receiptNo;
}

// Parse new receipt format: REC-YYYYMMDD-HHMMSS-XXX
function parseReceiptDate(receiptNo: string | null): string {
    if (!receiptNo) return "—";
    // New format: REC-20260331-144523-A3F
    const parts = receiptNo.split("-");
    if (parts.length >= 3 && parts[1].length === 8) {
        const d = parts[1];
        const t = parts[2];
        const year = d.slice(0, 4);
        const month = d.slice(4, 6);
        const day = d.slice(6, 8);
        const h = t.slice(0, 2);
        const m = t.slice(2, 4);
        return `${day}/${month}/${year} ${h}:${m}`;
    }
    return receiptNo;
}

export default function AccountantDashboard() {
    const { user } = useAuth();
    const NOW_MONTH = new Date().getMonth() + 1;
    const NOW_YEAR = new Date().getFullYear();

    // ── State ──────────────────────────────────────────────────────────────────
    const [filterMonth, setFilterMonth] = useState(NOW_MONTH);
    const [filterYear, setFilterYear] = useState(NOW_YEAR);
    const [schoolRecords, setSchoolRecords] = useState<FeeRecord[]>([]);
    const [transportRecords, setTransportRecords] = useState<TransportRecord[]>([]);
    const [todayPayments, setTodayPayments] = useState<FeeRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<"overview" | "today" | "history">("overview");

    // History tab state
    const [historySearch, setHistorySearch] = useState("");
    const [historyClass, setHistoryClass] = useState("all");
    const [historySection, setHistorySection] = useState("all");
    const [historyResults, setHistoryResults] = useState<FeeRecord[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [selectedStudentName, setSelectedStudentName] = useState("");
    const [receiptModal, setReceiptModal] = useState<FeeRecord | null>(null);

    // ── Fetch overview data ────────────────────────────────────────────────────
    const fetchOverview = useCallback(async () => {
        setLoading(true);
        try {
            // 1. School fee records
            const classesSnap = await getDocs(collection(db, "fees", "structure", "classes"));
            const classIds = classesSnap.docs.map(d => d.id);

            const schoolPromises = classIds.map(cid =>
                getDocs(collection(db, `feeRecords/${filterYear}/months/${filterMonth}/classes/${cid}/records`))
            );
            const snaps = await Promise.all(schoolPromises);
            const school = snaps.flatMap(snap =>
                snap.docs.map(d => ({ id: d.id, path: d.ref.path, ...d.data() } as FeeRecord))
            ).filter(r => r.status !== "carried_forward");
            setSchoolRecords(school);

            // 2. Transport fee records
            const tSnap = await getDocs(
                collection(db, "transportFeeRecords", filterYear.toString(), "months", filterMonth.toString(), "students")
            ).catch(() => ({ docs: [] as any[] }));
            const transport = tSnap.docs
                .map((d: any) => ({ id: d.id, ...d.data() } as TransportRecord))
                .filter((r: TransportRecord) => r.status !== "carried_forward");
            setTransportRecords(transport);

            // 3. Today's payments across ALL months this year
            const today = new Date();
            const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            const todayEnd = new Date(todayStart.getTime() + 86400000);

            // Fetch current month's paid records for "today" activity
            const todayPaid = school.filter(r => {
                if (r.status !== "paid" || !r.paidOn?.toDate) return false;
                const pd = r.paidOn.toDate();
                return pd >= todayStart && pd < todayEnd;
            });
            setTodayPayments(todayPaid);

        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [filterMonth, filterYear]);

    useEffect(() => { fetchOverview(); }, [fetchOverview]);

    // ── History search ─────────────────────────────────────────────────────────
    const searchHistory = useCallback(async () => {
        if (!historySearch.trim() && historyClass === "all") return;
        setHistoryLoading(true);
        setHistoryResults([]);
        setSelectedStudentName("");
        try {
            const classesSnap = await getDocs(collection(db, "fees", "structure", "classes"));
            const classIds = historyClass === "all"
                ? classesSnap.docs.map(d => d.id)
                : [historyClass];

            const results: FeeRecord[] = [];
            const q = historySearch.trim().toLowerCase();

            // Scan all months of the current year
            for (const cid of classIds) {
                for (let m = 1; m <= 12; m++) {
                    try {
                        const snap = await getDocs(
                            collection(db, `feeRecords/${NOW_YEAR}/months/${m}/classes/${cid}/records`)
                        );
                        snap.docs.forEach(d => {
                            const data = { id: d.id, path: d.ref.path, ...d.data() } as FeeRecord;
                            const matchName = !q || (data.studentName || "").toLowerCase().includes(q);
                            const matchSection = historySection === "all" || data.section === historySection;
                            if (matchName && matchSection) results.push(data);
                        });
                    } catch { /* skip missing months */ }
                }
            }

            results.sort((a, b) => {
                const monthDiff = a.month - b.month;
                if (monthDiff !== 0) return monthDiff;
                return (a.studentName || "").localeCompare(b.studentName || "");
            });

            if (results.length > 0) {
                setSelectedStudentName(results[0].studentName);
            }
            setHistoryResults(results);
        } catch (err) {
            console.error(err);
        } finally {
            setHistoryLoading(false);
        }
    }, [historySearch, historyClass, historySection, NOW_YEAR]);

    // ── Derived stats ──────────────────────────────────────────────────────────
    const schoolPaid = schoolRecords.filter(r => r.status === "paid");
    const schoolPending = schoolRecords.filter(r => r.status !== "paid");
    const schoolCollected = schoolPaid.reduce((s, r) => s + (r.totalAmount || r.amount), 0);
    const schoolPendingAmt = schoolPending.reduce((s, r) => s + (r.totalAmount || r.amount), 0);

    const transportPaid = transportRecords.filter(r => r.status === "paid");
    const transportPending = transportRecords.filter(r => r.status !== "paid");
    const transportCollected = transportPaid.reduce((s, r) => s + (r.totalAmount || r.amount), 0);
    const transportPendingAmt = transportPending.reduce((s, r) => s + (r.totalAmount || r.amount), 0);

    const totalCollected = schoolCollected + transportCollected;
    const totalPending = schoolPendingAmt + transportPendingAmt;
    const overallRate = schoolRecords.length
        ? Math.round((schoolPaid.length / schoolRecords.length) * 100)
        : 0;

    // ── Sections for history filter ────────────────────────────────────────────
    const availableClasses = [...new Set(schoolRecords.map(r => r.class).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true })
    );

    return (
        <div className="space-y-6">
            {/* ── Header ─────────────────────────────────────────────────────── */}
            <div className="rounded-2xl gradient-navy p-6 md:p-8 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10"
                    style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.2) 0%, transparent 50%)` }} />
                <div className="relative z-10 flex items-center justify-between flex-wrap gap-4">
                    <div>
                        <p className="text-white/50 text-sm font-medium">Finance Portal</p>
                        <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">Fee Dashboard</h1>
                        <p className="text-white/40 text-sm mt-1">
                            {MONTHS[filterMonth - 1]} {filterYear} — Overview
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <select value={filterMonth} onChange={e => setFilterMonth(Number(e.target.value))}
                            className="px-3 py-2 rounded-xl bg-white/10 text-white text-sm border border-white/20 focus:outline-none">
                            {MONTHS.map((m, i) => <option key={m} value={i + 1} className="text-navy bg-white">{m}</option>)}
                        </select>
                        <select value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}
                            className="px-3 py-2 rounded-xl bg-white/10 text-white text-sm border border-white/20 focus:outline-none">
                            {[NOW_YEAR - 1, NOW_YEAR, NOW_YEAR + 1].map(y => <option key={y} value={y} className="text-navy bg-white">{y}</option>)}
                        </select>
                        <button onClick={fetchOverview}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 text-white text-sm hover:bg-white/20 transition-all">
                            <RefreshCw className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Tabs ───────────────────────────────────────────────────────── */}
            <div className="flex gap-1 p-1 bg-white border border-gray-200 rounded-xl w-fit shadow-sm">
                {([
                    { id: "overview", label: "Overview", icon: BarChart3 },
                    { id: "today", label: "Today's Activity", icon: Calendar },
                    { id: "history", label: "Fee History", icon: History },
                ] as const).map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === tab.id
                                ? "bg-navy text-white shadow-sm"
                                : "text-gray-500 hover:text-gray-800"
                            }`}
                    >
                        <tab.icon className="w-4 h-4" />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* ════════════ OVERVIEW TAB ════════════ */}
            {activeTab === "overview" && (
                <div className="space-y-6">
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="w-8 h-8 animate-spin text-navy" />
                        </div>
                    ) : (
                        <>
                            {/* Combined stats */}
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                {[
                                    { label: "Total Collected", value: `₹${totalCollected.toLocaleString()}`, sub: `${schoolPaid.length + transportPaid.length} payments`, icon: TrendingUp, bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
                                    { label: "Total Pending", value: `₹${totalPending.toLocaleString()}`, sub: `${schoolPending.length + transportPending.length} students`, icon: Clock, bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
                                    { label: "Overdue", value: schoolRecords.filter(r => r.status === "overdue").length.toString(), sub: "Need immediate action", icon: AlertCircle, bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
                                    { label: "Collection Rate", value: `${overallRate}%`, sub: `${schoolRecords.length} total records`, icon: Banknote, bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
                                ].map(s => (
                                    <div key={s.label} className={`${s.bg} border ${s.border} rounded-2xl p-5`}>
                                        <s.icon className={`w-5 h-5 ${s.text} mb-3`} />
                                        <div className={`text-2xl font-bold ${s.text}`}>{s.value}</div>
                                        <div className={`text-xs ${s.text} opacity-70 mt-0.5`}>{s.label}</div>
                                        <div className={`text-xs ${s.text} opacity-50 mt-0.5`}>{s.sub}</div>
                                    </div>
                                ))}
                            </div>

                            {/* School vs Transport breakdown */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* School Fee Card */}
                                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                                    <div className="flex items-center gap-3 mb-5">
                                        <div className="w-10 h-10 rounded-xl bg-navy/10 flex items-center justify-center">
                                            <School className="w-5 h-5 text-navy" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-navy">School Fee</h3>
                                            <p className="text-xs text-gray-400">{MONTHS[filterMonth - 1]} {filterYear}</p>
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center py-2 border-b border-gray-50">
                                            <span className="text-sm text-gray-500">Total Students</span>
                                            <span className="font-bold text-navy">{schoolRecords.length}</span>
                                        </div>
                                        <div className="flex justify-between items-center py-2 border-b border-gray-50">
                                            <span className="text-sm text-emerald-600 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" />Paid</span>
                                            <div className="text-right">
                                                <div className="font-bold text-emerald-700">₹{schoolCollected.toLocaleString()}</div>
                                                <div className="text-xs text-gray-400">{schoolPaid.length} students</div>
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-center py-2">
                                            <span className="text-sm text-amber-600 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />Pending</span>
                                            <div className="text-right">
                                                <div className="font-bold text-amber-700">₹{schoolPendingAmt.toLocaleString()}</div>
                                                <div className="text-xs text-gray-400">{schoolPending.length} students</div>
                                            </div>
                                        </div>
                                    </div>
                                    {/* Progress bar */}
                                    <div className="mt-4">
                                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                                            <span>Collection Progress</span>
                                            <span>{overallRate}%</span>
                                        </div>
                                        <div className="w-full bg-gray-100 rounded-full h-2">
                                            <div className="bg-emerald-500 h-2 rounded-full transition-all" style={{ width: `${overallRate}%` }} />
                                        </div>
                                    </div>
                                </div>

                                {/* Transport Fee Card */}
                                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                                    <div className="flex items-center gap-3 mb-5">
                                        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                                            <Bus className="w-5 h-5 text-indigo-600" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-navy">Transport Fee</h3>
                                            <p className="text-xs text-gray-400">{MONTHS[filterMonth - 1]} {filterYear}</p>
                                        </div>
                                    </div>
                                    {transportRecords.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-8 text-gray-300">
                                            <Bus className="w-8 h-8 mb-2" />
                                            <p className="text-sm">No transport records for this month</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center py-2 border-b border-gray-50">
                                                <span className="text-sm text-gray-500">Total Students</span>
                                                <span className="font-bold text-navy">{transportRecords.length}</span>
                                            </div>
                                            <div className="flex justify-between items-center py-2 border-b border-gray-50">
                                                <span className="text-sm text-emerald-600 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" />Paid</span>
                                                <div className="text-right">
                                                    <div className="font-bold text-emerald-700">₹{transportCollected.toLocaleString()}</div>
                                                    <div className="text-xs text-gray-400">{transportPaid.length} students</div>
                                                </div>
                                            </div>
                                            <div className="flex justify-between items-center py-2">
                                                <span className="text-sm text-amber-600 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />Pending</span>
                                                <div className="text-right">
                                                    <div className="font-bold text-amber-700">₹{transportPendingAmt.toLocaleString()}</div>
                                                    <div className="text-xs text-gray-400">{transportPending.length} students</div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    {transportRecords.length > 0 && (
                                        <div className="mt-4">
                                            <div className="flex justify-between text-xs text-gray-400 mb-1">
                                                <span>Collection Progress</span>
                                                <span>{transportRecords.length ? Math.round((transportPaid.length / transportRecords.length) * 100) : 0}%</span>
                                            </div>
                                            <div className="w-full bg-gray-100 rounded-full h-2">
                                                <div className="bg-indigo-500 h-2 rounded-full transition-all"
                                                    style={{ width: `${transportRecords.length ? Math.round((transportPaid.length / transportRecords.length) * 100) : 0}%` }} />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Quick Links */}
                            <div className="grid grid-cols-3 gap-3">
                                {[
                                    { label: "Fee Structure", href: "/accountant/fees/structure", desc: "Set monthly amounts per class", icon: Banknote },
                                    { label: "Generate Monthly Fees", href: "/accountant/fees/generate", desc: "Create records for a month", icon: Calendar },
                                    { label: "Manage & Pay Fees", href: "/accountant/fees", desc: "Mark paid, send reminders", icon: CheckCircle2 },
                                ].map(a => (
                                    <Link key={a.label} href={a.href}
                                        className="flex flex-col gap-1 p-4 rounded-xl bg-white border border-gray-100 shadow-sm hover:shadow-md hover:border-navy/20 transition-all group">
                                        <div className="flex items-center justify-between">
                                            <span className="font-semibold text-sm text-navy">{a.label}</span>
                                            <ArrowUpRight className="w-4 h-4 text-gray-300 group-hover:text-navy transition-colors" />
                                        </div>
                                        <span className="text-xs text-gray-400">{a.desc}</span>
                                    </Link>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ════════════ TODAY'S ACTIVITY TAB ════════════ */}
            {activeTab === "today" && (
                <div className="space-y-4">
                    {/* Summary cards for today */}
                    <div className="grid grid-cols-3 gap-4">
                        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
                            <TrendingUp className="w-5 h-5 text-emerald-600 mb-3" />
                            <div className="text-2xl font-bold text-emerald-700">
                                ₹{todayPayments.reduce((s, r) => s + (r.totalAmount || r.amount), 0).toLocaleString()}
                            </div>
                            <div className="text-xs text-emerald-600 mt-1">Collected Today</div>
                        </div>
                        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
                            <Users className="w-5 h-5 text-blue-600 mb-3" />
                            <div className="text-2xl font-bold text-blue-700">{todayPayments.length}</div>
                            <div className="text-xs text-blue-600 mt-1">Payments Today</div>
                        </div>
                        <div className="bg-purple-50 border border-purple-200 rounded-2xl p-5">
                            <Calendar className="w-5 h-5 text-purple-600 mb-3" />
                            <div className="text-lg font-bold text-purple-700">
                                {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                            </div>
                            <div className="text-xs text-purple-600 mt-1">Today's Date</div>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                            <h2 className="font-bold text-navy">Payments Received Today</h2>
                            <span className="text-xs text-gray-400 bg-gray-50 px-3 py-1 rounded-full">{todayPayments.length} records</span>
                        </div>
                        {loading ? (
                            <div className="flex items-center justify-center py-16">
                                <Loader2 className="w-8 h-8 animate-spin text-navy" />
                            </div>
                        ) : todayPayments.length === 0 ? (
                            <div className="text-center py-16 text-gray-400">
                                <Calendar className="w-10 h-10 mx-auto mb-3 opacity-20" />
                                <p className="text-sm font-medium">No payments recorded today</p>
                                <p className="text-xs mt-1">Payments marked as paid today will appear here.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wider">
                                        <tr>
                                            <th className="px-4 py-3 text-left font-semibold">#</th>
                                            <th className="px-4 py-3 text-left font-semibold">Student</th>
                                            <th className="px-4 py-3 text-left font-semibold">Class</th>
                                            <th className="px-4 py-3 text-left font-semibold">Amount Paid</th>
                                            <th className="px-4 py-3 text-left font-semibold">Time</th>
                                            <th className="px-4 py-3 text-left font-semibold">Receipt No.</th>
                                            <th className="px-4 py-3 text-left font-semibold">Mode</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {todayPayments.map((r, idx) => (
                                            <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                                                <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                                                <td className="px-4 py-3">
                                                    <div className="font-semibold text-navy">{r.studentName}</div>
                                                    {r.rollNo && <div className="text-xs text-gray-400">Roll: {r.rollNo}</div>}
                                                </td>
                                                <td className="px-4 py-3 text-gray-600">
                                                    Class {r.class}{r.section ? ` - ${r.section}` : ""}
                                                </td>
                                                <td className="px-4 py-3 font-bold text-emerald-700">
                                                    ₹{(r.totalAmount || r.amount).toLocaleString()}
                                                </td>
                                                <td className="px-4 py-3 text-gray-500 text-xs">
                                                    {r.paidOn?.toDate
                                                        ? r.paidOn.toDate().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
                                                        : "—"}
                                                </td>
                                                <td className="px-4 py-3 font-mono text-xs text-gray-500">
                                                    {r.receiptNo || "—"}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {r.paymentMode && (
                                                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${r.paymentMode === "UPI"
                                                                ? "bg-violet-50 text-violet-700 border-violet-200"
                                                                : "bg-green-50 text-green-700 border-green-200"
                                                            }`}>
                                                            {r.paymentMode}
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-emerald-50/50">
                                        <tr>
                                            <td colSpan={3} className="px-4 py-3 text-sm font-semibold text-gray-600">Total Collected Today</td>
                                            <td className="px-4 py-3 font-bold text-emerald-700 text-base">
                                                ₹{todayPayments.reduce((s, r) => s + (r.totalAmount || r.amount), 0).toLocaleString()}
                                            </td>
                                            <td colSpan={3} />
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ════════════ FEE HISTORY TAB ════════════ */}
            {activeTab === "history" && (
                <div className="space-y-4">
                    {/* Search bar */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                        <h3 className="font-bold text-navy mb-4 flex items-center gap-2">
                            <History className="w-5 h-5 text-navy" />
                            Search Student Fee History
                        </h3>
                        <div className="flex flex-wrap gap-3">
                            <div className="relative flex-1 min-w-[200px]">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    value={historySearch}
                                    onChange={e => setHistorySearch(e.target.value)}
                                    onKeyDown={e => e.key === "Enter" && searchHistory()}
                                    placeholder="Type student name..."
                                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-navy outline-none"
                                />
                            </div>
                            <select value={historyClass} onChange={e => { setHistoryClass(e.target.value); setHistorySection("all"); }}
                                className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-navy outline-none">
                                <option value="all">All Classes</option>
                                {availableClasses.map(c => <option key={c} value={c}>Class {c}</option>)}
                            </select>
                            <button
                                onClick={searchHistory}
                                disabled={historyLoading}
                                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-navy text-white text-sm font-semibold hover:bg-navy/90 transition-all disabled:opacity-50"
                            >
                                {historyLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                Search
                            </button>
                        </div>
                    </div>

                    {/* Results */}
                    {historyLoading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="w-8 h-8 animate-spin text-navy" />
                        </div>
                    ) : historyResults.length > 0 ? (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                                <div>
                                    <h2 className="font-bold text-navy">
                                        {selectedStudentName || "Fee History"} — {NOW_YEAR}
                                    </h2>
                                    <p className="text-xs text-gray-400 mt-0.5">{historyResults.length} records found</p>
                                </div>
                                <div className="flex gap-4 text-sm">
                                    <span className="text-emerald-600 font-semibold">
                                        Paid: ₹{historyResults.filter(r => r.status === "paid").reduce((s, r) => s + (r.totalAmount || r.amount), 0).toLocaleString()}
                                    </span>
                                    <span className="text-amber-600 font-semibold">
                                        Pending: ₹{historyResults.filter(r => r.status !== "paid").reduce((s, r) => s + (r.totalAmount || r.amount), 0).toLocaleString()}
                                    </span>
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wider">
                                        <tr>
                                            <th className="px-4 py-3 text-left font-semibold">Month</th>
                                            <th className="px-4 py-3 text-left font-semibold">Student</th>
                                            <th className="px-4 py-3 text-left font-semibold">Class</th>
                                            <th className="px-4 py-3 text-left font-semibold">Amount</th>
                                            <th className="px-4 py-3 text-left font-semibold">Status</th>
                                            <th className="px-4 py-3 text-left font-semibold">Paid On</th>
                                            <th className="px-4 py-3 text-left font-semibold">Receipt No.</th>
                                            <th className="px-4 py-3 text-left font-semibold">Receipt</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {historyResults.map(r => {
                                            const statusCfg = {
                                                paid: { label: "Paid", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
                                                pending: { label: "Pending", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
                                                overdue: { label: "Overdue", bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
                                                carried_forward: { label: "Arrear", bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
                                            }[r.status] || { label: "Pending", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" };
                                            return (
                                                <tr key={`${r.id}-${r.month}`} className="hover:bg-gray-50/50 transition-colors">
                                                    <td className="px-4 py-3 font-semibold text-navy">
                                                        {MONTHS[(r.month || 1) - 1]} {r.year}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="font-medium text-navy">{r.studentName}</div>
                                                        {r.rollNo && <div className="text-xs text-gray-400">Roll: {r.rollNo}</div>}
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-600">
                                                        Class {r.class}{r.section ? ` - ${r.section}` : ""}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="font-bold text-navy">₹{(r.totalAmount || r.amount).toLocaleString()}</div>
                                                        {(r.previousDues || 0) > 0 && (
                                                            <div className="text-xs text-rose-500">incl. ₹{r.previousDues?.toLocaleString()} arrears</div>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}>
                                                            {statusCfg.label}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-500 text-xs">
                                                        {r.paidOn?.toDate
                                                            ? r.paidOn.toDate().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                                                            : "—"}
                                                    </td>
                                                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                                                        {r.receiptNo || "—"}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        {r.receiptNo && r.status === "paid" && (
                                                            <button
                                                                onClick={() => setReceiptModal(r)}
                                                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-medium hover:bg-gray-200 transition-colors"
                                                            >
                                                                <FileText className="w-3 h-3" />
                                                                View
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : historySearch && !historyLoading ? (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm text-center py-16 text-gray-400">
                            <Search className="w-10 h-10 mx-auto mb-3 opacity-20" />
                            <p className="text-sm font-medium">No records found</p>
                            <p className="text-xs mt-1">Try a different name or class filter.</p>
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm text-center py-16 text-gray-400">
                            <History className="w-10 h-10 mx-auto mb-3 opacity-20" />
                            <p className="text-sm font-medium">Search for a student above</p>
                            <p className="text-xs mt-1">Enter student name and press Search to view their full fee history.</p>
                        </div>
                    )}
                </div>
            )}

            {/* ── Receipt Modal ──────────────────────────────────────────────── */}
            {receiptModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md relative">
                        <button
                            onClick={() => setReceiptModal(null)}
                            className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700"
                        >
                            <X className="w-4 h-4" />
                        </button>
                        <div className="p-6">
                            <div className="rounded-xl gradient-navy p-5 text-white mb-5">
                                <p className="text-white/60 text-xs">International Access School</p>
                                <h3 className="text-xl font-bold mt-1">Fee Receipt</h3>
                                <p className="text-white/60 text-sm mt-0.5">Finance Department</p>
                            </div>
                            <div className="space-y-2.5 text-sm">
                                {[
                                    ["Receipt No.", receiptModal.receiptNo],
                                    ["Student Name", receiptModal.studentName],
                                    ["Class", `Class ${receiptModal.class}${receiptModal.section ? ` - ${receiptModal.section}` : ""}`],
                                    ["Roll No.", receiptModal.rollNo || "—"],
                                    ["Fee Month", `${MONTHS[(receiptModal.month || 1) - 1]} ${receiptModal.year}`],
                                    ["Amount Paid", `₹${(receiptModal.totalAmount || receiptModal.amount).toLocaleString()}`],
                                    ["Paid On", receiptModal.paidOn?.toDate ? receiptModal.paidOn.toDate().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "—"],
                                    ["Payment Mode", receiptModal.paymentMode || "—"],
                                    ["Receipt Date", parseReceiptDate(receiptModal.receiptNo)],
                                ].map(([label, value]) => (
                                    <div key={label} className="flex justify-between items-center py-2 border-b border-gray-50">
                                        <span className="text-gray-500">{label}</span>
                                        <span className={`font-semibold text-navy ${label === "Amount Paid" ? "text-emerald-700 text-base" : ""}`}>{value}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-5 flex gap-3">
                                <button
                                    onClick={() => window.print()}
                                    className="flex-1 py-2.5 rounded-xl bg-navy text-white text-sm font-semibold hover:bg-navy/90 transition-all"
                                >
                                    Print Receipt
                                </button>
                                <button
                                    onClick={() => setReceiptModal(null)}
                                    className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 transition-all"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
