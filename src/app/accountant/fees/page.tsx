"use client";

import { useState, useEffect, useCallback } from "react";
import { collection, getDocs, doc, updateDoc, query, where, orderBy, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import {
    Banknote, Search, Filter, CheckCircle2, AlertCircle, Clock,
    Mail, Loader2, RefreshCw, ChevronDown
} from "lucide-react";
import toast from "react-hot-toast";
import FeeReceiptModal from "@/components/accountant/FeeReceiptModal";

interface FeeRecord {
    id: string;
    path: string;
    studentName: string;
    rollNo: string;
    class: string;
    section: string;
    parentEmail: string;
    parentPhone?: string;
    amount: number;
    month: number;
    year: number;
    dueDate: { toDate: () => Date } | null;
    status: "pending" | "paid" | "overdue";
    paidOn: { toDate: () => Date } | null;
    receiptNo: string | null;
    breakdown?: {
        tuitionFee?: number;
        examFee?: number;
        computerFee?: number;
        transportFee?: number;
        libraryFee?: number;
        sportsFee?: number;
        miscFee?: number;
    };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const STATUS_CONFIG = {
    paid: { label: "Paid", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", icon: CheckCircle2 },
    pending: { label: "Pending", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", icon: Clock },
    overdue: { label: "Overdue", bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200", icon: AlertCircle },
};

export default function ManageFeesPage() {
    const { user } = useAuth();
    const [records, setRecords] = useState<FeeRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [selectedReceipt, setSelectedReceipt] = useState<FeeRecord | null>(null);

    // Filters
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    const [filterMonth, setFilterMonth] = useState(currentMonth);
    const [filterYear, setFilterYear] = useState(currentYear);
    const [filterStatus, setFilterStatus] = useState<string>("all");
    const [filterClass, setFilterClass] = useState<string>("all");
    const [search, setSearch] = useState("");

    const fetchRecords = useCallback(async () => {
        setLoading(true);
        try {
            // First get all classes
            const classesSnap = await getDocs(collection(db, "classes"));
            const classIds = classesSnap.docs.map(d => d.id);

            // Fetch records for all classes concurrently
            const promises = classIds.map(classId =>
                getDocs(collection(db, `feeRecords/${filterYear}/months/${filterMonth}/classes/${classId}/records`))
            );
            const snapshots = await Promise.all(promises);
            const allRecords = snapshots.flatMap(snap =>
                snap.docs.map(d => ({ id: d.id, path: d.ref.path, ...d.data() } as FeeRecord))
            );

            // Sort by class and then studentName
            allRecords.sort((a, b) => {
                if (a.class !== b.class) return a.class.localeCompare(b.class);
                return a.studentName.localeCompare(b.studentName);
            });

            setRecords(allRecords);
        } catch (err: any) {
            toast.error("Failed to load fee records");
        } finally {
            setLoading(false);
        }
    }, [filterMonth, filterYear]);

    useEffect(() => { fetchRecords(); }, [fetchRecords]);

    // Mark fee as paid
    const handleMarkPaid = async (record: FeeRecord) => {
        setActionLoading(record.id);
        try {
            const seq = Math.floor(Math.random() * 90000) + 10000;
            const receiptNo = `REC-${record.year}-${String(record.month).padStart(2, "0")}-${seq}`;

            await updateDoc(doc(db, record.path), {
                status: "paid",
                paidOn: new Date(),
                receiptNo,
                markedBy: user?.uid || "",
            });
            setRecords(prev => prev.map(r =>
                r.id === record.id ? { ...r, status: "paid", receiptNo, paidOn: { toDate: () => new Date() } } : r
            ));
            toast.success(`Marked as paid! Receipt: ${receiptNo}`);
        } catch {
            toast.error("Failed to mark as paid");
        } finally {
            setActionLoading(null);
        }
    };

    // Mark fee as overdue
    const handleMarkOverdue = async (record: FeeRecord) => {
        setActionLoading(record.id + "_overdue");
        try {
            await updateDoc(doc(db, record.path), { status: "overdue" });
            setRecords(prev => prev.map(r =>
                r.id === record.id ? { ...r, status: "overdue" } : r
            ));
            toast.success("Marked as overdue");
        } catch {
            toast.error("Failed to update status");
        } finally {
            setActionLoading(null);
        }
    };

    // Send email reminder
    const handleSendReminder = async (record: FeeRecord) => {
        if (!record.parentEmail) {
            toast.error("No parent email found for this student");
            return;
        }
        setActionLoading(record.id + "_email");
        try {
            const dueDate = record.dueDate?.toDate ? record.dueDate.toDate().toLocaleDateString("en-IN") : "N/A";
            const isOverdue = record.status === "overdue";

            const subject = isOverdue
                ? `⚠️ Fee Overdue — ${record.studentName} (Class ${record.class})`
                : `📌 Fee Reminder — ${record.studentName} (Class ${record.class})`;

            const html = `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; background: #f4f4f4; padding: 20px;">
  <div style="max-width: 520px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.08);">
    <div style="background: #0f2044; padding: 28px 32px; text-align: center;">
      <h2 style="color: white; margin: 0; font-size: 20px;">International Access School</h2>
      <p style="color: rgba(255,255,255,0.6); margin: 6px 0 0; font-size: 13px;">Finance Department</p>
    </div>
    <div style="padding: 28px 32px;">
      <p style="color: #333; font-size: 15px; margin-bottom: 20px;">Dear Parent/Guardian,</p>
      <p style="color: #555; font-size: 14px; line-height: 1.6;">
        ${isOverdue
                    ? `This is to inform you that the school fee for your child <strong>${record.studentName}</strong> is <span style="color: #e53e3e; font-weight: bold;">OVERDUE</span>. Please pay immediately to avoid any academic penalties.`
                    : `This is a friendly reminder that the school fee for your child <strong>${record.studentName}</strong> is due soon. Please ensure timely payment.`
                }
      </p>
      <div style="background: #f8f9fa; border-radius: 10px; padding: 18px; margin: 20px 0;">
        <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
          <tr><td style="color: #888; padding: 4px 0;">Student</td><td style="font-weight: bold; color: #0f2044;">${record.studentName}</td></tr>
          <tr><td style="color: #888; padding: 4px 0;">Class</td><td style="font-weight: bold; color: #0f2044;">Class ${record.class}${record.section ? " - " + record.section : ""}</td></tr>
          <tr><td style="color: #888; padding: 4px 0;">Month</td><td style="font-weight: bold; color: #0f2044;">${MONTHS[(record.month || 1) - 1]} ${record.year}</td></tr>
          <tr><td style="color: #888; padding: 4px 0;">Amount Due</td><td style="font-weight: bold; color: #0f2044; font-size: 16px;">₹${record.amount?.toLocaleString()}</td></tr>
          <tr><td style="color: #888; padding: 4px 0;">Due Date</td><td style="font-weight: bold; color: ${isOverdue ? "#e53e3e" : "#0f2044"};">${dueDate}</td></tr>
        </table>
      </div>
      <p style="color: #555; font-size: 13px;">Please visit the school office to complete your payment. For queries, contact us at ${process.env.EMAIL_USER || "school@example.com"}.</p>
    </div>
    <div style="background: #f8f9fa; padding: 16px 32px; text-align: center; border-top: 1px solid #eee;">
      <p style="color: #aaa; font-size: 12px; margin: 0;">International Access School — Finance Department</p>
    </div>
  </div>
</body>
</html>`;

            const res = await fetch("/api/send-email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ to: record.parentEmail, subject, html }),
            });

            if (res.ok) {
                toast.success(`Reminder sent to ${record.parentEmail}`);
            } else {
                toast.error("Failed to send email");
            }
        } catch {
            toast.error("Failed to send reminder");
        } finally {
            setActionLoading(null);
        }
    };

    // Filter records
    const classes = [...new Set(records.map(r => r.class).filter(Boolean))].sort();
    const filtered = records.filter(r => {
        if (filterStatus !== "all" && r.status !== filterStatus) return false;
        if (filterClass !== "all" && r.class !== filterClass) return false;
        if (search && !r.studentName?.toLowerCase().includes(search.toLowerCase()) &&
            !r.rollNo?.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    });

    const stats = {
        total: records.length,
        paid: records.filter(r => r.status === "paid").length,
        pending: records.filter(r => r.status === "pending").length,
        overdue: records.filter(r => r.status === "overdue").length,
        collected: records.filter(r => r.status === "paid").reduce((sum, r) => sum + (r.amount || 0), 0),
        pending_amount: records.filter(r => r.status !== "paid").reduce((sum, r) => sum + (r.amount || 0), 0),
    };

    // Generate years from 2024 to 2050
    const years = Array.from({ length: 2050 - 2024 + 1 }, (_, i) => 2024 + i);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="rounded-2xl gradient-navy p-6 md:p-8 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10"
                    style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.2) 0%, transparent 50%)` }}
                />
                <div className="relative z-10">
                    <p className="text-white/50 text-sm font-medium">Finance Portal</p>
                    <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">Manage Fees</h1>
                    <p className="text-white/40 text-sm mt-2">View, track and manage fee payments for all students.</p>
                </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: "Total Collected", value: `₹${stats.collected.toLocaleString()}`, bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
                    { label: "Pending Amount", value: `₹${stats.pending_amount.toLocaleString()}`, bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
                    { label: "Paid", value: `${stats.paid} / ${stats.total}`, bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
                    { label: "Overdue", value: stats.overdue.toString(), bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
                ].map(s => (
                    <div key={s.label} className={`${s.bg} border ${s.border} rounded-2xl p-4`}>
                        <div className={`text-xl font-bold ${s.text}`}>{s.value}</div>
                        <div className={`text-xs ${s.text} opacity-70 mt-0.5`}>{s.label}</div>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <div className="flex flex-wrap gap-3">
                    {/* Month */}
                    <select
                        value={filterMonth}
                        onChange={e => setFilterMonth(Number(e.target.value))}
                        className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-gold outline-none"
                    >
                        {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                    </select>

                    {/* Year */}
                    <select
                        value={filterYear}
                        onChange={e => setFilterYear(Number(e.target.value))}
                        className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-gold outline-none"
                    >
                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>

                    {/* Status */}
                    <select
                        value={filterStatus}
                        onChange={e => setFilterStatus(e.target.value)}
                        className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-gold outline-none"
                    >
                        <option value="all">All Status</option>
                        <option value="pending">Pending</option>
                        <option value="paid">Paid</option>
                        <option value="overdue">Overdue</option>
                    </select>

                    {/* Class */}
                    <select
                        value={filterClass}
                        onChange={e => setFilterClass(e.target.value)}
                        className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-gold outline-none"
                    >
                        <option value="all">All Classes</option>
                        {classes.map(c => <option key={c} value={c}>Class {c}</option>)}
                    </select>

                    {/* Search */}
                    <div className="flex-1 min-w-[160px] relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search student..."
                            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-gold outline-none"
                        />
                    </div>

                    <button
                        onClick={fetchRecords}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:border-navy hover:text-navy transition-colors"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Records Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="font-semibold text-navy">
                        Fee Records — {MONTHS[filterMonth - 1]} {filterYear}
                    </h2>
                    <span className="text-xs text-gray-400">{filtered.length} records</span>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="w-8 h-8 animate-spin text-navy" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-16 text-gray-400">
                        <Banknote className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p className="text-sm font-medium">No fee records found</p>
                        <p className="text-xs mt-1">Try changing the month/year or generate fees first.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wider">
                                <tr>
                                    <th className="px-4 py-3 text-left font-semibold">Student</th>
                                    <th className="px-4 py-3 text-left font-semibold">Class</th>
                                    <th className="px-4 py-3 text-left font-semibold">Amount</th>
                                    <th className="px-4 py-3 text-left font-semibold">Due Date</th>
                                    <th className="px-4 py-3 text-left font-semibold">Status</th>
                                    <th className="px-4 py-3 text-left font-semibold">Receipt</th>
                                    <th className="px-4 py-3 text-left font-semibold">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filtered.map(record => {
                                    const statusCfg = STATUS_CONFIG[record.status] || STATUS_CONFIG.pending;
                                    const StatusIcon = statusCfg.icon;
                                    return (
                                        <tr key={record.id} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="font-medium text-navy">{record.studentName}</div>
                                                {record.rollNo && <div className="text-xs text-gray-400">Roll: {record.rollNo}</div>}
                                            </td>
                                            <td className="px-4 py-3 text-gray-600">
                                                Class {record.class}{record.section ? ` - ${record.section}` : ""}
                                            </td>
                                            <td className="px-4 py-3 font-bold text-navy">
                                                ₹{record.amount?.toLocaleString()}
                                            </td>
                                            <td className="px-4 py-3 text-gray-500 text-xs">
                                                {record.dueDate?.toDate ? record.dueDate.toDate().toLocaleDateString("en-IN") : "—"}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}>
                                                    <StatusIcon className="w-3 h-3" />
                                                    {statusCfg.label}
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
                                                <div className="flex items-center gap-2">
                                                    {record.status !== "paid" && (
                                                        <button
                                                            onClick={() => handleMarkPaid(record)}
                                                            disabled={actionLoading === record.id}
                                                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100 transition-colors disabled:opacity-50"
                                                        >
                                                            {actionLoading === record.id ? (
                                                                <Loader2 className="w-3 h-3 animate-spin" />
                                                            ) : (
                                                                <CheckCircle2 className="w-3 h-3" />
                                                            )}
                                                            Mark Paid
                                                        </button>
                                                    )}
                                                    {record.status === "pending" && (
                                                        <button
                                                            onClick={() => handleMarkOverdue(record)}
                                                            disabled={actionLoading === record.id + "_overdue"}
                                                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-50 text-rose-700 text-xs font-medium hover:bg-rose-100 transition-colors disabled:opacity-50"
                                                        >
                                                            {actionLoading === record.id + "_overdue" ? (
                                                                <Loader2 className="w-3 h-3 animate-spin" />
                                                            ) : (
                                                                <AlertCircle className="w-3 h-3" />
                                                            )}
                                                            Overdue
                                                        </button>
                                                    )}
                                                    {record.status !== "paid" && (
                                                        <button
                                                            onClick={() => handleSendReminder(record)}
                                                            disabled={actionLoading === record.id + "_email"}
                                                            title={record.parentEmail || "No email on file"}
                                                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100 transition-colors disabled:opacity-50"
                                                        >
                                                            {actionLoading === record.id + "_email" ? (
                                                                <Loader2 className="w-3 h-3 animate-spin" />
                                                            ) : (
                                                                <Mail className="w-3 h-3" />
                                                            )}
                                                            Remind
                                                        </button>
                                                    )}
                                                    {record.status !== "paid" && (
                                                        <a
                                                            href={`https://wa.me/91${record.parentPhone || ""}?text=${encodeURIComponent(
                                                                `Dear Parent, school fee for ${record.studentName} (Class ${record.class}) of ₹${record.amount} for ${MONTHS[(record.month || 1) - 1]} ${record.year} is ${record.status}. Please pay at the earliest. - International Access School`
                                                            )}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-50 text-green-700 text-xs font-medium hover:bg-green-100 transition-colors"
                                                        >
                                                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                                                            </svg>
                                                            WhatsApp
                                                        </a>
                                                    )}
                                                    {record.status === "paid" && (
                                                        <button
                                                            onClick={() => setSelectedReceipt(record)}
                                                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-medium hover:bg-gray-200 transition-colors"
                                                        >
                                                            <CheckCircle2 className="w-3 h-3" />
                                                            View Receipt
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

            {/* Receipt Modal */}
            <FeeReceiptModal
                record={selectedReceipt}
                onClose={() => setSelectedReceipt(null)}
            />
        </div>
    );
}
