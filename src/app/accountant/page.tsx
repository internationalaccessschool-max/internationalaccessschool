"use client";

import { useState, useEffect, useCallback } from "react";
import {
    collection, getDocs, collectionGroup, getDoc, doc
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import {
    Banknote, TrendingUp, Clock, AlertCircle, CheckCircle2,
    ArrowUpRight, Search, Loader2, RefreshCw, Bus, School,
    Calendar, Users, BarChart3, History, FileText, X, ChevronRight, IndianRupee
} from "lucide-react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────
interface FeeRecord {
    id: string;
    path?: string;
    studentId?: string;
    studentName: string;
    rollNo?: string;
    class: string;
    section: string;
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
}

interface TransportRecord {
    id: string;
    studentName: string;
    amount: number;
    totalAmount?: number;
    month: number;
    year: number;
    status: string;
    receiptNo: string | null;
    paidOn: { toDate: () => Date } | null;
}

interface StudentProfile {
    id: string;
    firstName?: string;
    middleName?: string;
    lastName?: string;
    name?: string;
    admissionNumber?: string;
    rollNo?: string;
    currentClass?: string;
    className?: string;
    section?: string;
    status?: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function getStudentName(s: StudentProfile) {
    const full = `${s.firstName || ""} ${s.middleName || ""} ${s.lastName || ""}`.replace(/\s+/g, " ").trim();
    return full || s.name || "Unknown";
}

// Parse new receipt format to show date/time
function receiptDateTime(receiptNo: string | null): string {
    if (!receiptNo) return "—";
    const parts = receiptNo.split("-");
    if (parts.length >= 3 && parts[1]?.length === 8) {
        const d = parts[1];
        const t = parts[2];
        return `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)}  ${t.slice(0, 2)}:${t.slice(2, 4)}`;
    }
    return receiptNo;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function AccountantDashboard() {
    const { user } = useAuth();
    const NOW_MONTH = new Date().getMonth() + 1;
    const NOW_YEAR = new Date().getFullYear();

    // ── Shared state ──────────────────────────────────────────────────────────
    const [filterMonth, setFilterMonth] = useState(NOW_MONTH);
    const [filterYear, setFilterYear] = useState(NOW_YEAR);
    const [activeTab, setActiveTab] = useState<"overview" | "today" | "history">("overview");

    // ── Overview state ────────────────────────────────────────────────────────
    const [schoolRecords, setSchoolRecords] = useState<FeeRecord[]>([]);
    const [transportRecords, setTransportRecords] = useState<TransportRecord[]>([]);
    const [todayPayments, setTodayPayments] = useState<FeeRecord[]>([]);
    const [allTimePending, setAllTimePending] = useState<number | null>(null);
    const [allTimePendingCount, setAllTimePendingCount] = useState(0);
    const [loadingOverview, setLoadingOverview] = useState(true);
    const [loadingAllTime, setLoadingAllTime] = useState(false);

    // ── History state ─────────────────────────────────────────────────────────
    const [allStudents, setAllStudents] = useState<StudentProfile[]>([]);
    const [loadingStudents, setLoadingStudents] = useState(false);
    const [historyClass, setHistoryClass] = useState("all");
    const [historySearch, setHistorySearch] = useState("");
    const [selectedStudent, setSelectedStudent] = useState<StudentProfile | null>(null);
    const [studentHistory, setStudentHistory] = useState<FeeRecord[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [receiptModal, setReceiptModal] = useState<FeeRecord | null>(null);

    // ── Load overview data ────────────────────────────────────────────────────
    const fetchOverview = useCallback(async () => {
        setLoadingOverview(true);
        try {
            // 1. Get class IDs
            const classesSnap = await getDocs(collection(db, "fees", "structure", "classes"));
            const classIds = classesSnap.docs.map(d => d.id);

            // 2. School fee records for selected month
            const snaps = await Promise.all(
                classIds.map(cid =>
                    getDocs(collection(db, `feeRecords/${filterYear}/months/${filterMonth}/classes/${cid}/records`))
                )
            );
            // Keep carried_forward records — they are unpaid fees (shown as arrears)
            // so they correctly count toward the "pending" total for that month
            const school = snaps.flatMap(snap =>
                snap.docs.map(d => ({ id: d.id, path: d.ref.path, ...d.data() } as FeeRecord))
            );
            setSchoolRecords(school);

            // 3. Transport records
            const tSnap = await getDocs(
                collection(db, "transportFeeRecords", filterYear.toString(), "months", filterMonth.toString(), "students")
            ).catch(() => ({ docs: [] as any[] }));
            // Include carried_forward transport records too (unpaid fees)
            const transport = tSnap.docs
                .map((d: any) => ({ id: d.id, ...d.data() } as TransportRecord));
            setTransportRecords(transport);

            // 4. Today's payments from this month's records
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const todayEnd = new Date(todayStart.getTime() + 86400000);
            setTodayPayments(
                school.filter(r => {
                    if (r.status !== "paid" || !r.paidOn?.toDate) return false;
                    const pd = r.paidOn.toDate();
                    return pd >= todayStart && pd < todayEnd;
                })
            );
        } catch (err) {
            console.error("Overview fetch error:", err);
        } finally {
            setLoadingOverview(false);
        }
    }, [filterMonth, filterYear]);

    useEffect(() => { fetchOverview(); }, [fetchOverview]);

    // ── Load all-time pending — scans ALL months of current year ─────────────
    const fetchAllTimePending = useCallback(async () => {
        setLoadingAllTime(true);
        try {
            const classesSnap = await getDocs(collection(db, "fees", "structure", "classes"));
            const classIds = classesSnap.docs.map(d => d.id);

            let total = 0;
            let count = 0;

            // Scan ALL 12 months so future months (April, May...) are included
            for (let m = 1; m <= 12; m++) {
                const monthSnaps = await Promise.all(
                    classIds.map(cid =>
                        getDocs(collection(db, `feeRecords/${NOW_YEAR}/months/${m}/classes/${cid}/records`))
                    )
                );
                monthSnaps.forEach(snap => {
                    snap.docs.forEach(d => {
                        const r = d.data() as FeeRecord;
                        if (r.status === "paid") return; // paid — skip
                        // For carried_forward: the fee is absorbed into next month's previousDues.
                        // We count carried_forward only if its amount > 0 AND it hasn't been paid.
                        // But to avoid double-counting with next month's pending totalAmount,
                        // we skip carried_forward and rely on pending/overdue records which
                        // already include previousDues in their totalAmount.
                        // However, we use `amount` (base fee only) not `totalAmount` to prevent
                        // counting arrears twice across months.
                        if (r.status === "carried_forward") {
                            // Only count if amount is set (real arrear record)
                            total += r.amount || 0;
                            count++;
                            return;
                        }
                        // For pending/overdue — use base amount only (previousDues already counted via carried_forward)
                        total += r.amount || 0;
                        count++;
                    });
                });
            }
            setAllTimePending(total);
            setAllTimePendingCount(count);
        } catch (err) {
            console.error("All-time fetch error:", err);
        } finally {
            setLoadingAllTime(false);
        }
    }, [NOW_YEAR]);

    useEffect(() => { fetchAllTimePending(); }, [fetchAllTimePending]);

    // ── Load all students for History tab ─────────────────────────────────────
    const loadStudents = useCallback(async () => {
        setLoadingStudents(true);
        try {
            const snap = await getDocs(collectionGroup(db, "profiles"));
            const students: StudentProfile[] = snap.docs
                .map(d => ({ id: d.id, ...d.data() } as StudentProfile))
                .filter(s => (s.status || "").toUpperCase() !== "LEFT")
                .sort((a, b) => {
                    const ca = a.currentClass || a.className || "";
                    const cb = b.currentClass || b.className || "";
                    const cc = ca.localeCompare(cb, undefined, { numeric: true });
                    if (cc !== 0) return cc;
                    return getStudentName(a).localeCompare(getStudentName(b));
                });
            setAllStudents(students);
        } catch (err) {
            console.error("Student load error:", err);
        } finally {
            setLoadingStudents(false);
        }
    }, []);

    useEffect(() => {
        if (activeTab === "history" && allStudents.length === 0) loadStudents();
    }, [activeTab, allStudents.length, loadStudents]);

    // ── Fetch fee history for a student ──────────────────────────────────────
    const viewStudentHistory = useCallback(async (student: StudentProfile) => {
        setSelectedStudent(student);
        setStudentHistory([]);
        setLoadingHistory(true);

        const cls = student.currentClass || student.className || "";
        try {
            const history: FeeRecord[] = [];
            // Scan last 2 years × 12 months
            for (const yr of [NOW_YEAR - 1, NOW_YEAR]) {
                for (let m = 1; m <= 12; m++) {
                    const recordId = `${student.id}_${yr}_${String(m).padStart(2, "0")}`;
                    try {
                        const ref = doc(db, `feeRecords/${yr}/months/${m}/classes/${cls}/records/${recordId}`);
                        const snap = await getDoc(ref);
                        if (snap.exists()) {
                            history.push({ id: snap.id, path: ref.path, ...snap.data() } as FeeRecord);
                        }
                    } catch { /* skip */ }
                }
            }
            history.sort((a, b) => {
                if (a.year !== b.year) return a.year - b.year;
                return a.month - b.month;
            });
            setStudentHistory(history);
        } catch (err) {
            console.error("History fetch error:", err);
        } finally {
            setLoadingHistory(false);
        }
    }, [NOW_YEAR]);

    // ── Derived: Overview stats (base amount only, no arrears) ─────────────────
    // Use record.amount (base fee for that month), not totalAmount (which includes previous dues)
    const schoolPaid = schoolRecords.filter(r => r.status === "paid");
    const schoolPending = schoolRecords.filter(r => r.status !== "paid");
    const schoolCollected = schoolPaid.reduce((s, r) => s + (r.amount || 0), 0);
    const schoolPendingAmt = schoolPending.reduce((s, r) => s + (r.amount || 0), 0);

    const transportPaid = transportRecords.filter(r => r.status === "paid");
    const transportPending = transportRecords.filter(r => r.status !== "paid");
    const transportCollected = transportPaid.reduce((s, r) => s + (r.amount || 0), 0);
    const transportPendingAmt = transportPending.reduce((s, r) => s + (r.amount || 0), 0);

    const overallRate = schoolRecords.length
        ? Math.round((schoolPaid.length / schoolRecords.length) * 100) : 0;
    const transportRate = transportRecords.length
        ? Math.round((transportPaid.length / transportRecords.length) * 100) : 0;

    // ── Filtered student list for History tab ─────────────────────────────────
    const uniqueClasses = [...new Set(allStudents.map(s => s.currentClass || s.className || "").filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    const filteredStudents = allStudents.filter(s => {
        const cls = s.currentClass || s.className || "";
        if (historyClass !== "all" && cls !== historyClass) return false;
        if (historySearch) {
            const name = getStudentName(s).toLowerCase();
            const roll = (s.rollNo || s.admissionNumber || "").toLowerCase();
            if (!name.includes(historySearch.toLowerCase()) && !roll.includes(historySearch.toLowerCase())) return false;
        }
        return true;
    });

    // ── Student history stats ─────────────────────────────────────────────────
    const histPaid = studentHistory.filter(r => r.status === "paid").reduce((s, r) => s + (r.amount || 0), 0);
    const histPending = studentHistory.filter(r => r.status !== "paid" && r.status !== "carried_forward")
        .reduce((s, r) => s + (r.amount || 0), 0);

    return (
        <div className="space-y-6">
            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="rounded-2xl gradient-navy p-6 md:p-8 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10"
                    style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.2) 0%, transparent 50%)` }} />
                <div className="relative z-10 flex items-center justify-between flex-wrap gap-4">
                    <div>
                        <p className="text-white/50 text-sm font-medium">Finance Portal</p>
                        <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">Fee Dashboard</h1>
                        <p className="text-white/40 text-sm mt-1">{MONTHS[filterMonth - 1]} {filterYear} — Overview</p>
                    </div>
                    {activeTab !== "history" && (
                        <div className="flex items-center gap-2 shrink-0">
                            <select value={filterMonth} onChange={e => setFilterMonth(Number(e.target.value))}
                                className="px-3 py-2 rounded-xl bg-white/10 text-white text-sm border border-white/20 focus:outline-none">
                                {MONTHS.map((m, i) => <option key={m} value={i + 1} className="text-navy bg-white">{m}</option>)}
                            </select>
                            <select value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}
                                className="px-3 py-2 rounded-xl bg-white/10 text-white text-sm border border-white/20 focus:outline-none">
                                {[NOW_YEAR - 1, NOW_YEAR, NOW_YEAR + 1].map(y => <option key={y} value={y} className="text-navy bg-white">{y}</option>)}
                            </select>
                            <button onClick={fetchOverview} className="p-2 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-all">
                                <RefreshCw className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* ── All-Time Pending Banner ────────────────────────────────── */}
            <div className="bg-rose-600 rounded-2xl p-5 flex items-center justify-between gap-4 shadow-md">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                        <IndianRupee className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <p className="text-white/70 text-xs font-semibold uppercase tracking-wide">Total Fee Remaining (All Time — {NOW_YEAR})</p>
                        {loadingAllTime ? (
                            <div className="flex items-center gap-2 mt-1">
                                <Loader2 className="w-5 h-5 animate-spin text-white" />
                                <span className="text-white text-sm">Calculating...</span>
                            </div>
                        ) : (
                            <p className="text-3xl font-bold text-white mt-0.5">
                                ₹{(allTimePending ?? 0).toLocaleString()}
                            </p>
                        )}
                        <p className="text-white/60 text-xs mt-0.5">{allTimePendingCount} pending payments across all months</p>
                    </div>
                </div>
                <Link href="/accountant/fees"
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/20 text-white text-sm font-semibold hover:bg-white/30 transition-all shrink-0">
                    Manage Fees <ArrowUpRight className="w-4 h-4" />
                </Link>
            </div>

            {/* ── Tabs ────────────────────────────────────────────────────── */}
            <div className="flex gap-1 p-1 bg-white border border-gray-200 rounded-xl w-fit shadow-sm">
                {([
                    { id: "overview", label: "Overview", icon: BarChart3 },
                    { id: "today", label: "Today's Activity", icon: Calendar },
                    { id: "history", label: "Fee History", icon: History },
                ] as const).map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === tab.id ? "bg-navy text-white shadow-sm" : "text-gray-500 hover:text-gray-800"}`}>
                        <tab.icon className="w-4 h-4" />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* ════════════ OVERVIEW TAB ════════════ */}
            {activeTab === "overview" && (
                <div className="space-y-5">
                    {loadingOverview ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="w-8 h-8 animate-spin text-navy" />
                        </div>
                    ) : (
                        <>
                            {/* School Fee Card */}
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                                <div className="flex items-center gap-3 mb-5">
                                    <div className="w-10 h-10 rounded-xl bg-navy/10 flex items-center justify-center">
                                        <School className="w-5 h-5 text-navy" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-navy text-lg">School Fee — {MONTHS[filterMonth - 1]} {filterYear}</h3>
                                        <p className="text-xs text-gray-400">{schoolRecords.length} students</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-3 gap-4 mb-5">
                                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                                        <CheckCircle2 className="w-5 h-5 text-emerald-600 mx-auto mb-2" />
                                        <div className="text-xl font-bold text-emerald-700">₹{schoolCollected.toLocaleString()}</div>
                                        <div className="text-xs text-emerald-600 mt-1">Collected</div>
                                        <div className="text-xs text-emerald-500 mt-0.5">{schoolPaid.length} students</div>
                                    </div>
                                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                                        <Clock className="w-5 h-5 text-amber-600 mx-auto mb-2" />
                                        <div className="text-xl font-bold text-amber-700">₹{schoolPendingAmt.toLocaleString()}</div>
                                        <div className="text-xs text-amber-600 mt-1">Remaining</div>
                                        <div className="text-xs text-amber-500 mt-0.5">{schoolPending.length} students</div>
                                    </div>
                                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                                        <BarChart3 className="w-5 h-5 text-blue-600 mx-auto mb-2" />
                                        <div className="text-xl font-bold text-blue-700">{overallRate}%</div>
                                        <div className="text-xs text-blue-600 mt-1">Collected</div>
                                        <div className="text-xs text-blue-500 mt-0.5">This month</div>
                                    </div>
                                </div>
                                <div className="w-full bg-gray-100 rounded-full h-2.5">
                                    <div className="bg-emerald-500 h-2.5 rounded-full transition-all duration-500" style={{ width: `${overallRate}%` }} />
                                </div>
                                <div className="flex justify-between text-xs text-gray-400 mt-1">
                                    <span>₹0</span>
                                    <span>₹{(schoolCollected + schoolPendingAmt).toLocaleString()} total</span>
                                </div>
                            </div>

                            {/* Transport Fee Card */}
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                                <div className="flex items-center gap-3 mb-5">
                                    <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                                        <Bus className="w-5 h-5 text-indigo-600" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-navy text-lg">Transport Fee — {MONTHS[filterMonth - 1]} {filterYear}</h3>
                                        <p className="text-xs text-gray-400">{transportRecords.length} students</p>
                                    </div>
                                </div>
                                {transportRecords.length === 0 ? (
                                    <div className="text-center py-8 text-gray-300">
                                        <Bus className="w-8 h-8 mx-auto mb-2" />
                                        <p className="text-sm text-gray-400">No transport records for this month</p>
                                    </div>
                                ) : (
                                    <>
                                        <div className="grid grid-cols-3 gap-4 mb-5">
                                            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                                                <CheckCircle2 className="w-5 h-5 text-emerald-600 mx-auto mb-2" />
                                                <div className="text-xl font-bold text-emerald-700">₹{transportCollected.toLocaleString()}</div>
                                                <div className="text-xs text-emerald-600 mt-1">Collected</div>
                                                <div className="text-xs text-emerald-500 mt-0.5">{transportPaid.length} students</div>
                                            </div>
                                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                                                <Clock className="w-5 h-5 text-amber-600 mx-auto mb-2" />
                                                <div className="text-xl font-bold text-amber-700">₹{transportPendingAmt.toLocaleString()}</div>
                                                <div className="text-xs text-amber-600 mt-1">Remaining</div>
                                                <div className="text-xs text-amber-500 mt-0.5">{transportPending.length} students</div>
                                            </div>
                                            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                                                <BarChart3 className="w-5 h-5 text-blue-600 mx-auto mb-2" />
                                                <div className="text-xl font-bold text-blue-700">{transportRate}%</div>
                                                <div className="text-xs text-blue-600 mt-1">Collected</div>
                                                <div className="text-xs text-blue-500 mt-0.5">This month</div>
                                            </div>
                                        </div>
                                        <div className="w-full bg-gray-100 rounded-full h-2.5">
                                            <div className="bg-indigo-500 h-2.5 rounded-full transition-all duration-500" style={{ width: `${transportRate}%` }} />
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Quick Links */}
                            <div className="grid grid-cols-3 gap-3">
                                {[
                                    { label: "Fee Structure", href: "/accountant/fees/structure", desc: "Set monthly amounts per class" },
                                    { label: "Generate Monthly Fees", href: "/accountant/fees/generate", desc: "Create records for a month" },
                                    { label: "Manage & Pay Fees", href: "/accountant/fees", desc: "Mark paid, send reminders" },
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
                    <div className="grid grid-cols-3 gap-4">
                        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
                            <TrendingUp className="w-5 h-5 text-emerald-600 mb-3" />
                            <div className="text-2xl font-bold text-emerald-700">
                                ₹{todayPayments.reduce((s, r) => s + (r.amount || 0), 0).toLocaleString()}
                            </div>
                            <div className="text-xs text-emerald-600 mt-1">Collected Today</div>
                        </div>
                        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
                            <Users className="w-5 h-5 text-blue-600 mb-3" />
                            <div className="text-2xl font-bold text-blue-700">{todayPayments.length}</div>
                            <div className="text-xs text-blue-600 mt-1">Students Paid Today</div>
                        </div>
                        <div className="bg-purple-50 border border-purple-200 rounded-2xl p-5">
                            <Calendar className="w-5 h-5 text-purple-600 mb-3" />
                            <div className="text-sm font-bold text-purple-700">
                                {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                            </div>
                            <div className="text-xs text-purple-600 mt-1">Today</div>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                            <h2 className="font-bold text-navy">Payments Received Today</h2>
                            <span className="text-xs text-gray-400 bg-gray-50 px-3 py-1 rounded-full">{todayPayments.length} records</span>
                        </div>
                        {loadingOverview ? (
                            <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-navy" /></div>
                        ) : todayPayments.length === 0 ? (
                            <div className="text-center py-16 text-gray-400">
                                <Calendar className="w-10 h-10 mx-auto mb-3 opacity-20" />
                                <p className="text-sm font-medium">No payments recorded today</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wider">
                                        <tr>
                                            <th className="px-4 py-3 text-left font-semibold">#</th>
                                            <th className="px-4 py-3 text-left font-semibold">Student</th>
                                            <th className="px-4 py-3 text-left font-semibold">Class</th>
                                            <th className="px-4 py-3 text-left font-semibold">Amount</th>
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
                                                <td className="px-4 py-3 text-gray-600">Class {r.class}{r.section ? ` - ${r.section}` : ""}</td>
                                                <td className="px-4 py-3 font-bold text-emerald-700">₹{(r.amount || 0).toLocaleString()}</td>
                                                <td className="px-4 py-3 text-gray-500 text-xs">
                                                    {r.paidOn?.toDate ? r.paidOn.toDate().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}
                                                </td>
                                                <td className="px-4 py-3 font-mono text-xs text-gray-500">{r.receiptNo || "—"}</td>
                                                <td className="px-4 py-3">
                                                    {r.paymentMode && (
                                                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${r.paymentMode === "UPI" ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-green-50 text-green-700 border-green-200"}`}>
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
                                                ₹{todayPayments.reduce((s, r) => s + (r.amount || 0), 0).toLocaleString()}
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
                    {/* Filters */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                        <h3 className="font-bold text-navy mb-4 flex items-center gap-2">
                            <Users className="w-5 h-5" />
                            All Students — Fee History
                        </h3>
                        <div className="flex flex-wrap gap-3">
                            <div className="relative flex-1 min-w-[200px]">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    value={historySearch}
                                    onChange={e => setHistorySearch(e.target.value)}
                                    placeholder="Search by name or roll no..."
                                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-navy outline-none"
                                />
                            </div>
                            <select value={historyClass} onChange={e => setHistoryClass(e.target.value)}
                                className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-navy outline-none">
                                <option value="all">All Classes</option>
                                {uniqueClasses.map(c => <option key={c} value={c}>Class {c}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Student list */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                            <h2 className="font-bold text-navy">Active Students</h2>
                            <span className="text-xs text-gray-400 bg-gray-50 px-3 py-1 rounded-full">{filteredStudents.length} students</span>
                        </div>
                        {loadingStudents ? (
                            <div className="flex items-center justify-center py-16">
                                <Loader2 className="w-8 h-8 animate-spin text-navy" />
                            </div>
                        ) : filteredStudents.length === 0 ? (
                            <div className="text-center py-16 text-gray-400">
                                <Users className="w-10 h-10 mx-auto mb-3 opacity-20" />
                                <p className="text-sm">No students found</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wider">
                                        <tr>
                                            <th className="px-4 py-3 text-left font-semibold">#</th>
                                            <th className="px-4 py-3 text-left font-semibold">Student Name</th>
                                            <th className="px-4 py-3 text-left font-semibold">Class</th>
                                            <th className="px-4 py-3 text-left font-semibold">Roll / Adm. No.</th>
                                            <th className="px-4 py-3 text-right font-semibold">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {filteredStudents.map((s, idx) => (
                                            <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                                                <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                                                <td className="px-4 py-3 font-semibold text-navy">{getStudentName(s)}</td>
                                                <td className="px-4 py-3 text-gray-600">
                                                    Class {s.currentClass || s.className || "—"}{s.section ? ` - ${s.section}` : ""}
                                                </td>
                                                <td className="px-4 py-3 text-gray-400 text-xs">{s.rollNo || s.admissionNumber || "—"}</td>
                                                <td className="px-4 py-3 text-right">
                                                    <button
                                                        onClick={() => viewStudentHistory(s)}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-navy/5 text-navy text-xs font-semibold hover:bg-navy hover:text-white transition-all"
                                                    >
                                                        <History className="w-3.5 h-3.5" />
                                                        View History
                                                        <ChevronRight className="w-3.5 h-3.5" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── Student History Drawer/Modal ───────────────────────────── */}
            {selectedStudent && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-end" onClick={() => setSelectedStudent(null)}>
                    <div
                        className="bg-white h-full w-full max-w-2xl overflow-y-auto shadow-2xl animate-in slide-in-from-right duration-300"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Drawer header */}
                        <div className="gradient-navy p-6 sticky top-0 z-10">
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className="text-white/50 text-xs">Fee History</p>
                                    <h2 className="text-xl font-bold text-white mt-0.5">{getStudentName(selectedStudent)}</h2>
                                    <p className="text-white/60 text-sm mt-1">
                                        Class {selectedStudent.currentClass || selectedStudent.className || "—"}{selectedStudent.section ? ` - ${selectedStudent.section}` : ""}
                                        {(selectedStudent.rollNo || selectedStudent.admissionNumber) && ` • Roll: ${selectedStudent.rollNo || selectedStudent.admissionNumber}`}
                                    </p>
                                </div>
                                <button onClick={() => setSelectedStudent(null)}
                                    className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-all mt-1">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            {/* Summary */}
                            {!loadingHistory && studentHistory.length > 0 && (
                                <div className="flex gap-4 mt-4">
                                    <div className="bg-white/10 rounded-xl px-4 py-2.5">
                                        <div className="text-white text-lg font-bold">₹{histPaid.toLocaleString()}</div>
                                        <div className="text-white/60 text-xs">Total Paid</div>
                                    </div>
                                    <div className="bg-white/10 rounded-xl px-4 py-2.5">
                                        <div className="text-amber-300 text-lg font-bold">₹{histPending.toLocaleString()}</div>
                                        <div className="text-white/60 text-xs">Still Pending</div>
                                    </div>
                                    <div className="bg-white/10 rounded-xl px-4 py-2.5">
                                        <div className="text-white text-lg font-bold">{studentHistory.length}</div>
                                        <div className="text-white/60 text-xs">Total Months</div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* History list */}
                        <div className="p-6">
                            {loadingHistory ? (
                                <div className="flex items-center justify-center py-16">
                                    <Loader2 className="w-8 h-8 animate-spin text-navy" />
                                </div>
                            ) : studentHistory.length === 0 ? (
                                <div className="text-center py-16 text-gray-400">
                                    <FileText className="w-10 h-10 mx-auto mb-3 opacity-20" />
                                    <p className="text-sm font-medium">No fee records found</p>
                                    <p className="text-xs mt-1">No records for this student in {NOW_YEAR - 1}–{NOW_YEAR}</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {studentHistory.map(r => {
                                        const statusCfg = {
                                            paid: { label: "Paid", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
                                            pending: { label: "Pending", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
                                            overdue: { label: "Overdue", bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
                                            carried_forward: { label: "Arrear", bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
                                        }[r.status] || { label: "Pending", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" };
                                        return (
                                            <div key={`${r.id}-${r.month}-${r.year}`}
                                                className={`border rounded-xl p-4 ${r.status === "paid" ? "border-emerald-100 bg-emerald-50/30" : r.status === "overdue" ? "border-rose-100 bg-rose-50/30" : r.status === "carried_forward" ? "border-purple-100 bg-purple-50/30" : "border-gray-100 bg-white"}`}>
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-3 flex-wrap">
                                                            <span className="font-bold text-navy text-base">
                                                                {MONTHS[(r.month || 1) - 1]} {r.year}
                                                            </span>
                                                            <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}>
                                                                {statusCfg.label}
                                                            </span>
                                                        </div>
                                                        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500">
                                                            <span>Base Fee: <strong className="text-navy">₹{(r.amount || 0).toLocaleString()}</strong></span>
                                                            {(r.previousDues || 0) > 0 && (
                                                                <span>Arrears: <strong className="text-rose-600">+₹{(r.previousDues || 0).toLocaleString()}</strong></span>
                                                            )}
                                                            {r.status === "paid" && r.paidOn?.toDate && (
                                                                <span>Paid On: <strong className="text-emerald-700">{r.paidOn.toDate().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</strong></span>
                                                            )}
                                                            {r.paymentMode && (
                                                                <span>Mode: <strong className="text-navy">{r.paymentMode}</strong></span>
                                                            )}
                                                        </div>
                                                        {r.receiptNo && (
                                                            <div className="mt-1.5 text-xs font-mono text-gray-400">{r.receiptNo}</div>
                                                        )}
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <div className="text-xl font-bold text-navy">₹{(r.totalAmount || r.amount || 0).toLocaleString()}</div>
                                                        <div className="text-xs text-gray-400">Total</div>
                                                        {r.receiptNo && r.status === "paid" && (
                                                            <button
                                                                onClick={() => setReceiptModal(r)}
                                                                className="mt-2 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-medium hover:bg-gray-200 transition-colors"
                                                            >
                                                                <FileText className="w-3 h-3" /> Receipt
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Receipt Viewer Modal ───────────────────────────────────── */}
            {receiptModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md relative">
                        <button onClick={() => setReceiptModal(null)}
                            className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                            <X className="w-4 h-4" />
                        </button>
                        <div className="p-6">
                            <div className="rounded-xl gradient-navy p-5 text-white mb-5">
                                <p className="text-white/60 text-xs">International Access School</p>
                                <h3 className="text-xl font-bold mt-1">Fee Receipt</h3>
                                <p className="text-white/60 text-sm">{receiptModal.receiptNo}</p>
                            </div>
                            <div className="space-y-2.5 text-sm">
                                {[
                                    ["Student", receiptModal.studentName],
                                    ["Class", `Class ${receiptModal.class}${receiptModal.section ? ` - ${receiptModal.section}` : ""}`],
                                    ["Roll No.", receiptModal.rollNo || "—"],
                                    ["Fee Month", `${MONTHS[(receiptModal.month || 1) - 1]} ${receiptModal.year}`],
                                    ["Base Fee", `₹${(receiptModal.amount || 0).toLocaleString()}`],
                                    ["Total Paid", `₹${(receiptModal.totalAmount || receiptModal.amount || 0).toLocaleString()}`],
                                    ["Paid On", receiptModal.paidOn?.toDate ? receiptModal.paidOn.toDate().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "—"],
                                    ["Payment Mode", receiptModal.paymentMode || "—"],
                                    ["Receipt Date/Time", receiptDateTime(receiptModal.receiptNo)],
                                ].map(([label, value]) => (
                                    <div key={label} className="flex justify-between items-center py-2 border-b border-gray-50">
                                        <span className="text-gray-500">{label}</span>
                                        <span className={`font-semibold text-navy ${label === "Total Paid" ? "text-emerald-700 text-base" : ""}`}>{value}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-5 flex gap-3">
                                <button onClick={() => window.print()} className="flex-1 py-2.5 rounded-xl bg-navy text-white text-sm font-semibold hover:bg-navy/90 transition-all">
                                    Print Receipt
                                </button>
                                <button onClick={() => setReceiptModal(null)} className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 transition-all">
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
