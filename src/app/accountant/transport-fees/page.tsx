"use client";

import { useState, useEffect, useCallback } from "react";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import {
    Bus, CheckCircle2, Clock, AlertCircle, Loader2, Banknote,
    Search, RefreshCw, Mail, Printer
} from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import toast from "react-hot-toast";
import { printReceiptHTML, buildReceiptHTML } from "@/lib/print-receipt";

interface TransportFeeRecord {
    id: string;
    path: string;
    studentId?: string;
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
    paymentMode?: "CASH" | "UPI";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const YEARS = Array.from({ length: 2050 - 2024 + 1 }, (_, i) => 2024 + i);

const STATUS_CFG = {
    paid: { label: "Paid", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", Icon: CheckCircle2 },
    pending: { label: "Pending", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", Icon: Clock },
    overdue: { label: "Overdue", bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200", Icon: AlertCircle },
};

export default function AccountantTransportFeesPage() {
    const { user } = useAuth();
    const now = new Date();
    const [filterMonth, setFilterMonth] = useState(now.getMonth() + 1);
    const [filterYear, setFilterYear] = useState(now.getFullYear());
    const [records, setRecords] = useState<TransportFeeRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [filterStatus, setFilterStatus] = useState("all");
    const [filterBus, setFilterBus] = useState("all");
    const [receiptRecord, setReceiptRecord] = useState<TransportFeeRecord | null>(null);
    
    // Mark Paid Dialog
    const [markPaidRecord, setMarkPaidRecord] = useState<TransportFeeRecord | null>(null);
    const [paymentMode, setPaymentMode] = useState<"CASH" | "UPI">("CASH");
    const [markPaidLoading, setMarkPaidLoading] = useState(false);

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

    const handleConfirmMarkPaid = async () => {
        if (!markPaidRecord) return;
        setMarkPaidLoading(true);
        try {
            const seq = Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 5).toUpperCase();
            const receiptNo = `TRP-${markPaidRecord.year}-${String(markPaidRecord.month).padStart(2, "0")}-${seq}`;
            await updateDoc(doc(db, markPaidRecord.path), { 
                status: "paid", 
                paidOn: new Date(), 
                receiptNo, 
                paymentMode,
                markedBy: user?.uid || "" 
            });
            setRecords(prev => prev.map(r => r.id === markPaidRecord.id
                ? { ...r, status: "paid", receiptNo, paymentMode, paidOn: { toDate: () => new Date() } }
                : r
            ));
            toast.success(`Marked paid — Receipt: ${receiptNo}`);
            setMarkPaidRecord(null);
        } catch {
            toast.error("Failed to mark as paid");
        } finally {
            setMarkPaidLoading(false);
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
                    {/* Year dropdown — 2024 to 2050 */}
                    <select value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}
                        className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-navy outline-none">
                        {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
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
                                                        <button onClick={() => setMarkPaidRecord(record)}
                                                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100 transition-colors">
                                                            <CheckCircle2 className="w-3 h-3" />
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
                                                    {record.status === "paid" && (
                                                        <button onClick={() => setReceiptRecord(record)}
                                                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-medium hover:bg-gray-200 transition-colors">
                                                            <Printer className="w-3 h-3" />
                                                            Receipt
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

            {/* Transport Receipt Modal */}
            {receiptRecord && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col">
                        {/* Modal Header */}
                        <div className="sticky top-0 bg-gray-50/90 backdrop-blur-md px-6 py-4 border-b border-gray-100 flex items-center justify-between z-10 rounded-t-2xl">
                            <h2 className="text-lg font-bold text-navy">Transport Fee Receipt</h2>
                            <div className="flex items-center gap-2">
                                <button onClick={() => {
                                    const html = buildReceiptHTML({
                                        title: "Transport Fee Receipt",
                                        receiptNo: receiptRecord.receiptNo || "N/A",
                                        studentName: receiptRecord.studentName,
                                        classSection: `Class ${receiptRecord.className}${receiptRecord.section ? ` - ${receiptRecord.section}` : ""}`,
                                        extraInfo: [
                                            { label: "Bus Number", value: `${receiptRecord.busNumber || "—"}${receiptRecord.routeDetails ? " · " + receiptRecord.routeDetails : ""}` },
                                        ],
                                        paidOn: receiptRecord.paidOn?.toDate
                                            ? receiptRecord.paidOn.toDate().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
                                            : "N/A",
                                        feeMonth: `${MONTHS_FULL[(receiptRecord.month || 1) - 1]} ${receiptRecord.year}`,
                                        lineItems: [{ label: `Bus Transport Fee — ${MONTHS_FULL[(receiptRecord.month || 1) - 1]} ${receiptRecord.year}`, amount: receiptRecord.amount }],
                                        totalAmount: receiptRecord.amount,
                                        paymentMode: receiptRecord.paymentMode
                                    });
                                    printReceiptHTML(html, "Transport Fee Receipt");
                                }}
                                    className="inline-flex items-center gap-2 px-4 py-2 bg-navy text-white text-sm font-medium rounded-xl hover:bg-opacity-90 transition-colors shadow-sm">
                                    <Printer className="w-4 h-4" />Print / Download PDF
                                </button>
                                <button onClick={() => setReceiptRecord(null)}
                                    className="p-2 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors">
                                    ✕
                                </button>
                            </div>
                        </div>

                        {/* Printable Content */}
                        <div id="transport-receipt" className="p-8 sm:p-10 bg-white">
                            <div className="text-center border-b-2 border-navy/20 pb-6 mb-8">
                                <h1 className="text-3xl font-extrabold text-navy tracking-tight uppercase">International Access School</h1>
                                <p className="text-sm text-gray-500 mt-2 font-medium">Atarsua, Siwan, Bihar, India, 841227</p>
                                <p className="text-xs text-gray-400 mt-1">Phone: +91 84060 00830 | Email: info@iaschool.edu.in</p>
                                <div className="inline-block mt-4 px-4 py-1.5 bg-indigo-50 text-indigo-800 text-sm font-bold uppercase tracking-widest border border-indigo-100 rounded-full">
                                    Transport Fee Receipt
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-8 mb-8 text-sm">
                                <div className="space-y-4">
                                    <div>
                                        <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Receipt Number</p>
                                        <p className="font-mono text-base font-bold text-navy">{receiptRecord.receiptNo || "N/A"}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Student Name</p>
                                        <p className="font-bold text-gray-800 text-base">{receiptRecord.studentName}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Class / Section</p>
                                        <p className="font-semibold text-gray-800">Class {receiptRecord.className}{receiptRecord.section ? ` - ${receiptRecord.section}` : ""}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Bus Number</p>
                                        <p className="font-semibold text-gray-800">{receiptRecord.busNumber || "—"} {receiptRecord.routeDetails ? `· ${receiptRecord.routeDetails}` : ""}</p>
                                    </div>
                                </div>
                                <div className="space-y-4 text-right">
                                    <div>
                                        <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Date of Payment</p>
                                        <p className="font-semibold text-gray-800">
                                            {receiptRecord.paidOn?.toDate ? receiptRecord.paidOn.toDate().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "N/A"}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Fee Month</p>
                                        <p className="font-bold text-navy text-base">{MONTHS_FULL[(receiptRecord.month || 1) - 1]} {receiptRecord.year}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Payment Status / Mode</p>
                                        <div className="flex flex-col gap-1 items-end">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 uppercase tracking-widest border border-emerald-200">
                                                Paid Successfully
                                            </span>
                                            {receiptRecord.paymentMode && (
                                                <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                                                    Via {receiptRecord.paymentMode}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-8 border rounded-xl overflow-hidden border-gray-200">
                                <table className="min-w-full divide-y divide-gray-200 text-sm">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase w-16">S.No</th>
                                            <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">Particulars</th>
                                            <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase">Amount (₹)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-100">
                                        <tr>
                                            <td className="px-6 py-4 text-gray-500">1.</td>
                                            <td className="px-6 py-4 font-medium text-gray-800">Bus Transport Fee — {MONTHS_FULL[(receiptRecord.month || 1) - 1]} {receiptRecord.year}</td>
                                            <td className="px-6 py-4 text-right font-medium text-gray-600">{receiptRecord.amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                        </tr>
                                    </tbody>
                                    <tfoot className="bg-gray-50/80 border-t-2 border-gray-200">
                                        <tr>
                                            <th colSpan={2} className="px-6 py-5 text-right font-extrabold text-navy text-base uppercase">Total Amount Paid</th>
                                            <td className="px-6 py-5 text-right font-extrabold text-navy text-lg">₹{receiptRecord.amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>

                            <div className="mt-20 pt-8 flex justify-between items-end border-t border-dashed border-gray-300">
                                <div className="text-center">
                                    <div className="w-32 border-b border-gray-400 mb-2"></div>
                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Parent/Guardian Sign</p>
                                </div>
                                <div className="text-center">
                                    <strong className="text-lg font-bold text-navy opacity-30 block mb-1">IAS Auth</strong>
                                    <div className="w-40 border-b border-gray-400 mb-2"></div>
                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Authorized Signatory</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* Mark Paid Dialog */}
            {markPaidRecord && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
                        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
                            <div>
                                <h3 className="text-lg font-bold text-navy">Mark Fee as Paid</h3>
                                <p className="text-sm text-gray-400 mt-0.5">{markPaidRecord.studentName}</p>
                            </div>
                        </div>

                        <div className="px-6 py-5 space-y-4">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Total Amount</span>
                                <span className="font-bold text-navy">₹{markPaidRecord.amount.toLocaleString()}</span>
                            </div>

                            <div className="border-t border-gray-100 pt-4">
                                <p className="text-sm font-semibold text-gray-700 mb-3">Payment Mode</p>
                                <div className="grid grid-cols-2 gap-3">
                                    <label className={`flex justify-center items-center py-2.5 rounded-xl border-2 cursor-pointer font-semibold text-sm transition-all ${paymentMode === "CASH" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-100 hover:border-gray-300 text-gray-600"}`}>
                                        <input type="radio" name="paymentMode" value="CASH" checked={paymentMode === "CASH"} onChange={() => setPaymentMode("CASH")} className="hidden"/>
                                        💵 Cash
                                    </label>
                                    <label className={`flex justify-center items-center py-2.5 rounded-xl border-2 cursor-pointer font-semibold text-sm transition-all ${paymentMode === "UPI" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-100 hover:border-gray-300 text-gray-600"}`}>
                                        <input type="radio" name="paymentMode" value="UPI" checked={paymentMode === "UPI"} onChange={() => setPaymentMode("UPI")} className="hidden"/>
                                        📱 UPI
                                    </label>
                                </div>
                            </div>
                        </div>

                        <div className="px-6 pb-6 flex gap-3">
                            <button onClick={() => setMarkPaidRecord(null)} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmMarkPaid}
                                disabled={markPaidLoading}
                                className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                            >
                                {markPaidLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
