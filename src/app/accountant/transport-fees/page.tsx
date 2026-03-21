"use client";

import { useState, useEffect, useCallback } from "react";
import { collection, getDocs, doc, updateDoc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
    Bus, CheckCircle2, Clock, AlertCircle, Loader2, Banknote,
    Search, RefreshCw, Mail
} from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import toast from "react-hot-toast";

interface TransportFeeRecord {
    id: string;
    path: string;
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
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const STATUS_CFG = {
    paid: { label: "Paid", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", Icon: CheckCircle2 },
    pending: { label: "Pending", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", Icon: Clock },
    overdue: { label: "Overdue", bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200", Icon: AlertCircle },
};

export default function AccountantTransportFeesPage() {
    const now = new Date();
    const [filterMonth, setFilterMonth] = useState(now.getMonth() + 1);
    const [filterYear, setFilterYear] = useState(now.getFullYear());
    const [records, setRecords] = useState<TransportFeeRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [filterStatus, setFilterStatus] = useState("all");
    const [filterBus, setFilterBus] = useState("all");

    const fetchRecords = useCallback(async () => {
        setLoading(true);
        try {
            const snap = await getDocs(
                collection(db, "transportFeeRecords", filterYear.toString(), "months", filterMonth.toString(), "students")
            );
            const recs = snap.docs.map(d => ({ id: d.id, path: d.ref.path, ...d.data() } as TransportFeeRecord));
            recs.sort((a, b) => a.studentName?.localeCompare(b.studentName || "") || 0);
            setRecords(recs);
        } catch (err) {
            console.error(err);
            toast.error("Failed to load transport fee records");
        } finally {
            setLoading(false);
        }
    }, [filterMonth, filterYear]);

    useEffect(() => { fetchRecords(); }, [fetchRecords]);

    const handleMarkPaid = async (record: TransportFeeRecord) => {
        setActionLoading(record.id);
        try {
            const seq = Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 5).toUpperCase();
            const receiptNo = `TRP-${record.year}-${String(record.month).padStart(2, "0")}-${seq}`;
            await updateDoc(doc(db, record.path), { status: "paid", paidOn: new Date(), receiptNo });
            setRecords(prev => prev.map(r => r.id === record.id
                ? { ...r, status: "paid", receiptNo, paidOn: { toDate: () => new Date() } }
                : r
            ));
            toast.success(`Marked paid — Receipt: ${receiptNo}`);
        } catch {
            toast.error("Failed to mark as paid");
        } finally {
            setActionLoading(null);
        }
    };

    const handleMarkOverdue = async (record: TransportFeeRecord) => {
        setActionLoading(record.id + "_od");
        try {
            await updateDoc(doc(db, record.path), { status: "overdue" });
            setRecords(prev => prev.map(r => r.id === record.id ? { ...r, status: "overdue" } : r));
            toast.success("Marked as overdue");
        } catch {
            toast.error("Failed");
        } finally {
            setActionLoading(null);
        }
    };

    const handleSendReminder = async (record: TransportFeeRecord) => {
        if (!record.parentEmail) { toast.error("No parent email on file"); return; }
        setActionLoading(record.id + "_email");
        try {
            const subject = `🚌 Transport Fee Reminder — ${record.studentName}`;
            const html = `
<body style="font-family: Arial, sans-serif; background: #f4f4f4; padding: 20px;">
<div style="max-width:500px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
  <div style="background:#0f2044;padding:28px;text-align:center;">
    <h2 style="color:white;margin:0;">Transport Fee Reminder</h2>
    <p style="color:rgba(255,255,255,0.5);margin:6px 0 0;font-size:13px;">International Access School</p>
  </div>
  <div style="padding:28px;">
    <p>Dear Parent,</p>
    <p>This is a reminder that the <strong>bus transport fee</strong> for <strong>${record.studentName}</strong> is <span style="color:#e53e3e;font-weight:bold;">${record.status.toUpperCase()}</span>.</p>
    <table style="width:100%;font-size:13px;border-collapse:collapse;background:#f8f9fa;border-radius:8px;padding:12px 16px;margin:16px 0;">
      <tr><td style="padding:4px 0;color:#888;">Student</td><td style="font-weight:bold;">${record.studentName}</td></tr>
      <tr><td style="padding:4px 0;color:#888;">Class</td><td>${record.className}${record.section ? `-${record.section}` : ""}</td></tr>
      <tr><td style="padding:4px 0;color:#888;">Bus</td><td>${record.busNumber} · ${record.routeDetails}</td></tr>
      <tr><td style="padding:4px 0;color:#888;">Month</td><td>${MONTHS[record.month - 1]} ${record.year}</td></tr>
      <tr><td style="padding:4px 0;color:#888;">Amount</td><td style="font-size:16px;font-weight:bold;">₹${record.amount?.toLocaleString()}</td></tr>
    </table>
    <p style="font-size:13px;color:#555;">Please visit the school office to complete your transport fee payment.</p>
  </div>
</div>
</body>`;
            const res = await authFetch("/api/send-email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ to: record.parentEmail, subject, html }),
            });
            if (res.ok) toast.success(`Reminder sent to ${record.parentEmail}`);
            else toast.error("Failed to send email");
        } catch {
            toast.error("Failed to send reminder");
        } finally {
            setActionLoading(null);
        }
    };

    // Derived
    const busNumbers = [...new Set(records.map(r => r.busNumber).filter(Boolean))].sort();
    const filtered = records.filter(r => {
        if (filterStatus !== "all" && r.status !== filterStatus) return false;
        if (filterBus !== "all" && r.busNumber !== filterBus) return false;
        if (search) {
            const q = search.toLowerCase();
            if (!r.studentName?.toLowerCase().includes(q) && !r.className?.includes(q)) return false;
        }
        return true;
    });

    const totalCollected = records.filter(r => r.status === "paid").reduce((s, r) => s + r.amount, 0);
    const totalPending = records.filter(r => r.status !== "paid").reduce((s, r) => s + r.amount, 0);
    const overdueCount = records.filter(r => r.status === "overdue").length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="rounded-2xl gradient-navy p-6 md:p-8 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 80% 50%, rgba(200,169,81,0.25) 0%, transparent 60%)" }} />
                <div className="relative z-10">
                    <p className="text-white/50 text-sm font-medium">Finance Portal</p>
                    <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">Transport Fees</h1>
                    <p className="text-white/40 text-sm mt-2">Manage and track bus transport fee payments for all enrolled students.</p>
                </div>
            </div>

            {/* Stats */}
            {records.length > 0 && (
                <div className="grid grid-cols-3 gap-4">
                    {[
                        { label: "Collected", value: `₹${totalCollected.toLocaleString()}`, bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", Icon: CheckCircle2 },
                        { label: "Pending", value: `₹${totalPending.toLocaleString()}`, bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", Icon: Clock },
                        { label: "Overdue", value: overdueCount.toString(), bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200", Icon: AlertCircle },
                    ].map(s => (
                        <div key={s.label} className={`${s.bg} border ${s.border} rounded-2xl p-4`}>
                            <s.Icon className={`w-4 h-4 ${s.text} mb-2`} />
                            <div className={`text-xl font-bold ${s.text}`}>{s.value}</div>
                            <div className={`text-xs ${s.text} opacity-70`}>{s.label}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Filters */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <div className="flex flex-wrap gap-3">
                    <select value={filterMonth} onChange={e => setFilterMonth(Number(e.target.value))}
                        className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-navy outline-none">
                        {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                    </select>
                    <select value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}
                        className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-navy outline-none">
                        {[filterYear - 1, filterYear, filterYear + 1].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                        className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-navy outline-none">
                        <option value="all">All Status</option>
                        <option value="pending">Pending</option>
                        <option value="paid">Paid</option>
                        <option value="overdue">Overdue</option>
                    </select>
                    {busNumbers.length > 0 && (
                        <select value={filterBus} onChange={e => setFilterBus(e.target.value)}
                            className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-navy outline-none">
                            <option value="all">All Buses</option>
                            {busNumbers.map(bn => <option key={bn} value={bn}>Bus {bn}</option>)}
                        </select>
                    )}
                    <div className="flex-1 min-w-[160px] relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="Search student..."
                            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-navy outline-none" />
                    </div>
                    <button onClick={fetchRecords}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:border-navy hover:text-navy transition-colors">
                        <RefreshCw className="w-4 h-4" />Refresh
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-bold text-navy">
                        Transport Fee Records — {MONTHS[filterMonth - 1]} {filterYear}
                    </h3>
                    <span className="text-xs text-gray-400">{filtered.length} records</span>
                </div>
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="w-8 h-8 animate-spin text-navy" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-16 text-gray-400">
                        <Banknote className="w-10 h-10 mx-auto mb-3 opacity-20" />
                        <p className="text-sm font-medium">No transport fee records for this month</p>
                        <p className="text-xs mt-1">Generate transport fees from Admin → Transport → Transport Fees tab.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wider">
                                <tr>
                                    <th className="px-4 py-3 text-left font-semibold">#</th>
                                    <th className="px-4 py-3 text-left font-semibold">Student</th>
                                    <th className="px-4 py-3 text-left font-semibold">Bus</th>
                                    <th className="px-4 py-3 text-left font-semibold">Amount</th>
                                    <th className="px-4 py-3 text-left font-semibold">Status</th>
                                    <th className="px-4 py-3 text-left font-semibold">Receipt</th>
                                    <th className="px-4 py-3 text-left font-semibold">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filtered.map((record, idx) => {
                                    const cfg = STATUS_CFG[record.status] || STATUS_CFG.pending;
                                    const Icon = cfg.Icon;
                                    return (
                                        <tr key={record.id} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                                            <td className="px-4 py-3">
                                                <div className="font-medium text-navy">{record.studentName}</div>
                                                <div className="text-xs text-gray-400">Class {record.className}{record.section ? `-${record.section}` : ""}</div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-1 rounded-lg">
                                                    <Bus className="w-3 h-3" /> {record.busNumber || "—"}
                                                </span>
                                                {record.routeDetails && (
                                                    <div className="text-xs text-gray-400 mt-0.5 max-w-[120px] truncate">{record.routeDetails}</div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 font-bold text-navy">₹{record.amount?.toLocaleString() || "0"}</td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                                                    <Icon className="w-3 h-3" />{cfg.label}
                                                </span>
                                                {record.status === "paid" && record.paidOn?.toDate && (
                                                    <div className="text-xs text-gray-400 mt-0.5">{record.paidOn.toDate().toLocaleDateString("en-IN")}</div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-xs text-gray-400 font-mono">{record.receiptNo || "—"}</td>
                                            <td className="px-4 py-3">
                                                <div className="flex gap-1.5 flex-wrap">
                                                    {record.status !== "paid" && (
                                                        <button onClick={() => handleMarkPaid(record)}
                                                            disabled={actionLoading === record.id}
                                                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100 disabled:opacity-50 transition-colors">
                                                            {actionLoading === record.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                                                            Mark Paid
                                                        </button>
                                                    )}
                                                    {record.status === "pending" && (
                                                        <button onClick={() => handleMarkOverdue(record)}
                                                            disabled={actionLoading === record.id + "_od"}
                                                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-700 text-xs font-medium hover:bg-rose-100 disabled:opacity-50 transition-colors">
                                                            Overdue
                                                        </button>
                                                    )}
                                                    {record.status !== "paid" && record.parentEmail && (
                                                        <button onClick={() => handleSendReminder(record)}
                                                            disabled={actionLoading === record.id + "_email"}
                                                            title={record.parentEmail}
                                                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100 disabled:opacity-50 transition-colors">
                                                            {actionLoading === record.id + "_email" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
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
                    </div>
                )}
            </div>
        </div>
    );
}
