"use client";

import { authFetch } from "@/lib/auth-fetch";

import { useState, useEffect, useCallback } from "react";
import { collection, getDocs, query, where, orderBy, updateDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import {
    Banknote, TrendingUp, Clock, AlertCircle, CheckCircle2,
    ArrowUpRight, Search, Filter, Loader2, Mail, RefreshCw
} from "lucide-react";
import Link from "next/link";

interface FeeRecord {
    id: string;
    studentName: string;
    rollNo: string;
    class: string;
    section: string;
    parentEmail: string;
    amount: number;
    month: number;
    year: number;
    dueDate: { toDate: () => Date } | null;
    paidOn: { toDate: () => Date } | null;
    status: "pending" | "paid" | "overdue";
    receiptNo: string | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function AccountantDashboard() {
    const { user } = useAuth();
    const NOW_MONTH = new Date().getMonth() + 1;
    const NOW_YEAR = new Date().getFullYear();

    const [filterMonth, setFilterMonth] = useState(NOW_MONTH);
    const [filterYear, setFilterYear] = useState(NOW_YEAR);

    const [records, setRecords] = useState<FeeRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [filterStatus, setFilterStatus] = useState("all");
    const [filterClass, setFilterClass] = useState("all");

    const fetchRecords = useCallback(async () => {
        setLoading(true);
        try {
            // First get class IDs
            const classesSnap = await getDocs(collection(db, "fees", "structure", "classes"));
            const classIds = classesSnap.docs.map(d => d.id);

            // Fetch records from nested path
            const promises = classIds.map(classId =>
                getDocs(collection(db, `feeRecords/${filterYear}/months/${filterMonth}/classes/${classId}/records`))
            );

            const snapshots = await Promise.all(promises);
            const allRecords = snapshots.flatMap(snap =>
                snap.docs.map(d => ({ id: d.id, path: d.ref.path, ...d.data() } as FeeRecord & { path: string }))
            );

            // Sort by class and name
            allRecords.sort((a, b) => {
                const classCompare = (a.class || "").localeCompare(b.class || "", undefined, { numeric: true });
                if (classCompare !== 0) return classCompare;
                return (a.studentName || "").localeCompare(b.studentName || "");
            });

            setRecords(allRecords);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [filterMonth, filterYear]);

    useEffect(() => { fetchRecords(); }, [fetchRecords]);

    const handleMarkPaid = async (record: FeeRecord) => {
        setActionLoading(record.id);
        try {
            const seq = Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
            const receiptNo = `REC-${record.year}-${String(record.month).padStart(2, "0")}-${seq}`;
            const recordPath = (record as any).path || `feeRecords/${filterYear}/months/${filterMonth}/classes/${record.class}/records/${record.id}`;
            await updateDoc(doc(db, recordPath), {
                status: "paid",
                paidOn: new Date(),
                receiptNo,
                markedBy: user?.uid || "",
            });
            setRecords(prev => prev.map(r =>
                r.id === record.id
                    ? { ...r, status: "paid", receiptNo, paidOn: { toDate: () => new Date() } }
                    : r
            ));
        } catch (e) { console.error(e); } finally { setActionLoading(null); }
    };

    const handleSendReminder = async (record: FeeRecord) => {
        if (!record.parentEmail) { alert("No parent email on file"); return; }
        setActionLoading(record.id + "_mail");
        try {
            const dueStr = record.dueDate?.toDate ? record.dueDate.toDate().toLocaleDateString("en-IN") : "N/A";
            const isOverdue = record.status === "overdue";
            await authFetch("/api/send-email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    to: record.parentEmail,
                    subject: isOverdue
                        ? `⚠️ Fee Overdue — ${record.studentName} (Class ${record.class})`
                        : `📌 Fee Reminder — ${record.studentName} (Class ${record.class})`,
                    html: `<div style="font-family:Arial,sans-serif;padding:20px;max-width:500px">
                        <h2 style="color:#0f2044">International Access School</h2>
                        <p>Dear Parent/Guardian,</p>
                        <p>${isOverdue ? "Your child's fee is <b style='color:red'>OVERDUE</b>. Please pay immediately." : "This is a friendly reminder that your child's fee is due soon."}</p>
                        <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#f9f9f9;border-radius:8px;padding:12px">
                            <tr><td style="padding:4px 8px;color:#666">Student</td><td style="padding:4px 8px;font-weight:bold">${record.studentName}</td></tr>
                            <tr><td style="padding:4px 8px;color:#666">Class</td><td style="padding:4px 8px;font-weight:bold">Class ${record.class}${record.section ? " - " + record.section : ""}</td></tr>
                            <tr><td style="padding:4px 8px;color:#666">Month</td><td style="padding:4px 8px;font-weight:bold">${MONTHS[(record.month || 1) - 1]} ${record.year}</td></tr>
                            <tr><td style="padding:4px 8px;color:#666">Amount</td><td style="padding:4px 8px;font-weight:bold;font-size:18px">₹${record.amount?.toLocaleString()}</td></tr>
                            <tr><td style="padding:4px 8px;color:#666">Due Date</td><td style="padding:4px 8px;font-weight:bold;color:${isOverdue ? "red" : "#0f2044"}">${dueStr}</td></tr>
                        </table>
                        <p style="color:#555;font-size:13px">Please visit the school office to pay. Thank you.</p>
                        <p style="color:#aaa;font-size:12px">— International Access School Finance Department</p>
                    </div>`
                }),
            });
            alert(`Reminder sent to ${record.parentEmail}`);
        } catch { alert("Failed to send email"); } finally { setActionLoading(null); }
    };

    // Stats
    const totalCollected = records.filter(r => r.status === "paid").reduce((s, r) => s + r.amount, 0);
    const totalPending = records.filter(r => r.status !== "paid").reduce((s, r) => s + r.amount, 0);
    const overdueCount = records.filter(r => r.status === "overdue").length;
    const paidCount = records.filter(r => r.status === "paid").length;
    const collectionRate = records.length ? Math.round((paidCount / records.length) * 100) : 0;

    const classes = [...new Set(records.map(r => r.class).filter(Boolean))].sort();

    const filtered = records.filter(r => {
        if (filterStatus !== "all" && r.status !== filterStatus) return false;
        if (filterClass !== "all" && r.class !== filterClass) return false;
        if (search && !r.studentName?.toLowerCase().includes(search.toLowerCase()) &&
            !r.rollNo?.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    });

    const STATUS_CFG = {
        paid: { label: "Paid", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
        pending: { label: "Pending", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
        overdue: { label: "Overdue", bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="rounded-2xl gradient-navy p-6 md:p-8 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10"
                    style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.2) 0%, transparent 50%)` }} />
                <div className="relative z-10 flex items-center justify-between">
                    <div>
                        <p className="text-white/50 text-sm font-medium">Finance Portal</p>
                        <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">
                            {MONTHS[filterMonth - 1]} {filterYear} — Fee Overview
                        </h1>
                        <p className="text-white/40 text-sm mt-1">
                            Welcome{user?.displayName ? `, ${user.displayName.split(" ")[0]}` : ""}! Manage all student fee payments below.
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <select value={filterMonth} onChange={e => { setFilterMonth(Number(e.target.value)); setSearch(""); setFilterClass("all"); }}
                            className="px-3 py-2 rounded-xl bg-white/10 text-white text-sm border border-white/20 focus:outline-none focus:bg-white/20 transition-all">
                            {MONTHS.map((m, i) => <option key={m} value={i + 1} className="text-navy bg-white">{m}</option>)}
                        </select>
                        <select value={filterYear} onChange={e => { setFilterYear(Number(e.target.value)); setSearch(""); setFilterClass("all"); }}
                            className="px-3 py-2 rounded-xl bg-white/10 text-white text-sm border border-white/20 focus:outline-none focus:bg-white/20 transition-all">
                            {Array.from({ length: 5 }, (_, i) => NOW_YEAR - 1 + i).map(y => <option key={y} value={y} className="text-navy bg-white">{y}</option>)}
                        </select>
                        <button onClick={fetchRecords}
                            className="hidden md:flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 text-white text-sm hover:bg-white/20 transition-all">
                            <RefreshCw className="w-4 h-4" /> Refresh
                        </button>
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: "Total Collected", value: loading ? "..." : `₹${totalCollected.toLocaleString()}`, sub: `${paidCount} students paid`, icon: TrendingUp, bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
                    { label: "Pending Amount", value: loading ? "..." : `₹${totalPending.toLocaleString()}`, sub: `${records.length - paidCount} students`, icon: Clock, bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
                    { label: "Overdue", value: loading ? "..." : overdueCount.toString(), sub: "Need immediate action", icon: AlertCircle, bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
                    { label: "Collection Rate", value: loading ? "..." : `${collectionRate}%`, sub: `${records.length} total records`, icon: Banknote, bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
                ].map(s => (
                    <div key={s.label} className={`${s.bg} border ${s.border} rounded-2xl p-5`}>
                        <s.icon className={`w-5 h-5 ${s.text} mb-3`} />
                        <div className={`text-2xl font-bold ${s.text}`}>{s.value}</div>
                        <div className={`text-xs ${s.text} opacity-70 mt-0.5`}>{s.label}</div>
                        <div className={`text-xs ${s.text} opacity-50 mt-0.5`}>{s.sub}</div>
                    </div>
                ))}
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-3 gap-3">
                {[
                    { label: "Fee Structure", href: "/accountant/fees/structure", desc: "Set monthly amounts per class" },
                    { label: "Generate Fees", href: "/accountant/fees/generate", desc: "Create records for a month" },
                    { label: "Full Fee Manager", href: "/accountant/fees", desc: "Advanced filters & actions" },
                ].map(a => (
                    <Link key={a.label} href={a.href}
                        className="flex flex-col gap-1 p-4 rounded-xl bg-white border border-gray-100 shadow-sm hover:shadow-md hover:border-navy/20 transition-all group">
                        <div className="flex items-center justify-between">
                            <span className="font-semibold text-sm text-navy group-hover:text-navy">{a.label}</span>
                            <ArrowUpRight className="w-4 h-4 text-gray-300 group-hover:text-navy transition-colors" />
                        </div>
                        <span className="text-xs text-gray-400">{a.desc}</span>
                    </Link>
                ))}
            </div>

            {/* Fee Records Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 border-b border-gray-100">
                    <div className="flex flex-wrap gap-3 items-center">
                        <h2 className="font-bold text-navy text-lg mr-auto">
                            Fee Records — {MONTHS[filterMonth - 1]} {filterYear}
                        </h2>

                        {/* Search */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input value={search} onChange={e => setSearch(e.target.value)}
                                placeholder="Search student..."
                                className="pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-gold outline-none w-44" />
                        </div>

                        {/* Status filter */}
                        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                            className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-gold outline-none">
                            <option value="all">All Status</option>
                            <option value="pending">Pending</option>
                            <option value="paid">Paid</option>
                            <option value="overdue">Overdue</option>
                        </select>

                        {/* Class filter */}
                        <select value={filterClass} onChange={e => setFilterClass(e.target.value)}
                            className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-gold outline-none">
                            <option value="all">All Classes</option>
                            {classes.map(c => <option key={c} value={c}>Class {c}</option>)}
                        </select>
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="w-8 h-8 animate-spin text-navy" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-16 text-gray-400">
                        <Banknote className="w-10 h-10 mx-auto mb-3 opacity-20" />
                        <p className="text-sm font-medium">No fee records for this month</p>
                        <p className="text-xs mt-1">Go to <Link href="/accountant/fees/generate" className="text-navy underline">Generate Monthly Fees</Link> to create records.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wider">
                                <tr>
                                    <th className="px-4 py-3 text-left">#</th>
                                    <th className="px-4 py-3 text-left">Student</th>
                                    <th className="px-4 py-3 text-left">Class</th>
                                    <th className="px-4 py-3 text-left">Amount</th>
                                    <th className="px-4 py-3 text-left">Due Date</th>
                                    <th className="px-4 py-3 text-left">Status</th>
                                    <th className="px-4 py-3 text-left">Receipt</th>
                                    <th className="px-4 py-3 text-left">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filtered.map((record, idx) => {
                                    const cfg = STATUS_CFG[record.status] || STATUS_CFG.pending;
                                    return (
                                        <tr key={record.id} className="hover:bg-gray-50/60 transition-colors">
                                            <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                                            <td className="px-4 py-3">
                                                <div className="font-semibold text-navy">{record.studentName || "—"}</div>
                                                {record.rollNo && <div className="text-xs text-gray-400">Roll: {record.rollNo}</div>}
                                            </td>
                                            <td className="px-4 py-3 text-gray-600 text-sm">
                                                {record.class ? `Class ${record.class}` : "—"}
                                                {record.section ? ` - ${record.section}` : ""}
                                            </td>
                                            <td className="px-4 py-3 font-bold text-navy">
                                                ₹{record.amount?.toLocaleString() || "0"}
                                            </td>
                                            <td className="px-4 py-3 text-gray-500 text-xs">
                                                {record.dueDate?.toDate ? record.dueDate.toDate().toLocaleDateString("en-IN") : "—"}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                                                    {cfg.label}
                                                </span>
                                                {record.status === "paid" && record.paidOn?.toDate && (
                                                    <div className="text-xs text-gray-400 mt-0.5">
                                                        {record.paidOn.toDate().toLocaleDateString("en-IN")}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-xs text-gray-400 font-mono">
                                                {record.receiptNo || "—"}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex gap-2">
                                                    {record.status !== "paid" && (
                                                        <button
                                                            onClick={() => handleMarkPaid(record)}
                                                            disabled={actionLoading === record.id}
                                                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100 disabled:opacity-50 transition-colors"
                                                        >
                                                            {actionLoading === record.id
                                                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                                                : <CheckCircle2 className="w-3 h-3" />}
                                                            Paid
                                                        </button>
                                                    )}
                                                    {record.status !== "paid" && (
                                                        <button
                                                            onClick={() => handleSendReminder(record)}
                                                            disabled={actionLoading === record.id + "_mail"}
                                                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100 disabled:opacity-50 transition-colors"
                                                        >
                                                            {actionLoading === record.id + "_mail"
                                                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                                                : <Mail className="w-3 h-3" />}
                                                            Remind
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>

                        {/* Summary Footer */}
                        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between text-xs text-gray-500">
                            <span>Showing {filtered.length} of {records.length} records</span>
                            <span className="font-semibold text-navy">
                                Collected: ₹{totalCollected.toLocaleString()} / ₹{(totalCollected + totalPending).toLocaleString()} total
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
