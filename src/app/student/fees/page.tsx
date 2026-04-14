"use client";

import { useState, useEffect } from "react";
import { collectionGroup, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { Banknote, CheckCircle2, Clock, AlertCircle, Loader2, Printer, X } from "lucide-react";
import { printReceiptHTML, buildReceiptHTML } from "@/lib/print-receipt";

interface FeeRecord {
    id: string;
    path: string;
    amount: number;
    month: number;
    year: number;
    dueDate: { toDate: () => Date } | null;
    paidOn: { toDate: () => Date } | null;
    status: "pending" | "paid" | "overdue";
    receiptNo: string | null;
    studentId?: string;
    admissionNumber?: string;
    rollNo?: string;
    lateFine?: number;          // ₹100 fine applied after 15th if unpaid
    totalAmount?: number;       // amount + previousDues + lateFine
    // Extra fields for receipt
    studentName?: string;
    class?: string;
    section?: string;
    breakdown?: {
        tuitionFee?: number;
        annualFee?: number;
        admissionFee?: number;
        transportFee?: number;
        registrationFee?: number;
        sportsFee?: number;
        miscFee?: number;
    };
    paymentMode?: "CASH" | "UPI";
}

const MONTHS = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

const STATUS_CONFIG = {
    paid: { label: "Paid", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", icon: CheckCircle2 },
    pending: { label: "Pending", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", icon: Clock },
    overdue: { label: "Overdue", bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200", icon: AlertCircle },
};

export default function StudentFeesPage() {
    const { user } = useAuth();
    const [records, setRecords] = useState<FeeRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [debugInfo, setDebugInfo] = useState("");
    const [receiptRecord, setReceiptRecord] = useState<FeeRecord | null>(null);
    const [studentName, setStudentName] = useState("");
    const [studentRoll, setStudentRoll] = useState("");

    useEffect(() => {
        if (!user) return;

        const fetchFees = async () => {
            setLoading(true);
            try {
                const admNo = user.email?.split("@")[0] || "";

                // 1. Get student info from lookup (for name/rollNo display)
                try {
                    const lookupDoc = await getDoc(doc(db, "studentLookup", user.uid));
                    if (lookupDoc.exists()) {
                        const data = lookupDoc.data();
                        const sName = data.studentName || data.name || "";
                        const admissionNumber = data.admissionNumber || admNo;
                        setStudentName(sName);
                        setStudentRoll(admissionNumber);
                    }
                } catch (e) {
                    console.warn("studentLookup failed:", e);
                }

                // 2. Fetch ALL fee records for this student using collectionGroup
                //    Works like transport fees — keyed by studentId, not class path
                //    This correctly handles students who moved class (e.g. NUR → LKG):
                //    their old NUR fee records will still appear alongside new LKG records
                const q = query(
                    collectionGroup(db, "records"),
                    where("studentId", "==", user.uid)
                );
                const snap = await getDocs(q);

                const allRecords: FeeRecord[] = snap.docs.map(d => ({
                    id: d.id,
                    path: d.ref.path,
                    ...d.data()
                } as FeeRecord));

                // Fallback: also check by admissionNumber if no UID-matched records found
                if (allRecords.length === 0 && admNo) {
                    const q2 = query(
                        collectionGroup(db, "records"),
                        where("rollNo", "==", admNo)
                    );
                    const snap2 = await getDocs(q2);
                    snap2.docs.forEach(d => {
                        allRecords.push({ id: d.id, path: d.ref.path, ...d.data() } as FeeRecord);
                    });

                    // Update student name from records if still empty
                    const firstWithName = snap2.docs.find(d => d.data().studentName);
                    if (firstWithName && !studentName) {
                        setStudentName(firstWithName.data().studentName);
                    }
                }

                const uniqueRecords = Array.from(new Map(allRecords.map(r => [r.id, r])).values());
                uniqueRecords.sort((a, b) => b.year - a.year || b.month - a.month);
                setRecords(uniqueRecords);

                if (uniqueRecords.length === 0) {
                    setDebugInfo(`UID: ${user.uid} | Adm#: ${admNo} | No records found via collectionGroup`);
                }
            } catch (e) {
                console.error("Error fetching fees:", e);
                setDebugInfo(`Error: ${(e as any)?.message || "Unknown"}`);
            } finally {
                setLoading(false);
            }
        };

        fetchFees();
    }, [user]);


    const totalPaid = records.filter(r => r.status === "paid").reduce((s, r) => s + r.amount, 0);
    // Use totalAmount (includes arrears + lateFine) for the due sum
    const totalDue = records
        .filter(r => r.status !== "paid")
        .reduce((s, r) => s + (r.totalAmount || r.amount), 0);

    // Build breakdown items for receipt
    const getBreakdownItems = (record: FeeRecord) => {
        if (!record.breakdown) {
            const fallback: { label: string; amount: number }[] = [{ label: "School Fee", amount: record.amount }];
            if ((record.lateFine || 0) > 0) fallback.push({ label: "Late Payment Fine", amount: record.lateFine! });
            return fallback;
        }
        const items: { label: string; amount: number }[] = [
            { label: "Tuition Fee", amount: record.breakdown.tuitionFee || 0 },
            { label: "Annual Fee", amount: record.breakdown.annualFee || 0 },
            { label: "Admission Fee", amount: record.breakdown.admissionFee || 0 },
            { label: "Transport Fee", amount: record.breakdown.transportFee || 0 },
            { label: "Registration Fee", amount: record.breakdown.registrationFee || 0 },
            { label: "Sports Fee", amount: record.breakdown.sportsFee || 0 },
            { label: "Miscellaneous Fee", amount: record.breakdown.miscFee || 0 },
        ].filter(i => i.amount > 0);
        if ((record.lateFine || 0) > 0) {
            items.push({ label: "Late Payment Fine", amount: record.lateFine! });
        }
        return items.length > 0 ? items : [{ label: "School Fee", amount: record.amount }];
    };

    return (
        <div className="space-y-6 p-4 md:p-6 max-w-3xl mx-auto">
            {/* Header */}
            <div className="rounded-2xl gradient-navy p-6 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10"
                    style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.2) 0%, transparent 50%)` }} />
                <div className="relative z-10 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gold/20 flex items-center justify-center">
                        <Banknote className="w-6 h-6 text-gold" />
                    </div>
                    <div>
                        <p className="text-white/50 text-sm">Student Portal</p>
                        <h1 className="text-2xl font-bold text-white">My Fees</h1>
                        <p className="text-white/40 text-sm mt-1">View your fee payment status and history.</p>
                    </div>
                </div>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 mb-2" />
                    <div className="text-2xl font-bold text-emerald-700">₹{totalPaid.toLocaleString()}</div>
                    <div className="text-xs text-emerald-600 mt-0.5">Total Paid</div>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
                    <AlertCircle className="w-5 h-5 text-amber-600 mb-2" />
                    <div className="text-2xl font-bold text-amber-700">₹{totalDue.toLocaleString()}</div>
                    <div className="text-xs text-amber-600 mt-0.5">Due / Pending</div>
                </div>
            </div>

            {/* Records */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                    <h2 className="font-semibold text-navy">Payment History</h2>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="w-8 h-8 animate-spin text-navy" />
                    </div>
                ) : records.length === 0 ? (
                    <div className="text-center py-16 text-gray-400">
                        <Banknote className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p className="text-sm">No fee records found yet.</p>
                        <p className="text-xs mt-1">Your fee records will appear here once generated by the accountant.</p>
                        {debugInfo && (
                            <p className="text-xs mt-3 text-gray-300 font-mono">{debugInfo}</p>
                        )}
                    </div>
                ) : (
                    <div className="divide-y divide-gray-50">
                        {records.map(record => {
                            const cfg = STATUS_CONFIG[record.status] || STATUS_CONFIG.pending;
                            const StatusIcon = cfg.icon;
                            return (
                                <div key={record.id} className="flex items-center justify-between p-5 hover:bg-gray-50/50 transition-colors gap-4">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-10 h-10 rounded-xl ${cfg.bg} border ${cfg.border} flex items-center justify-center shrink-0`}>
                                            <StatusIcon className={`w-5 h-5 ${cfg.text}`} />
                                        </div>
                                        <div>
                                            <p className="font-semibold text-navy">{MONTHS[(record.month || 1) - 1]} {record.year}</p>
                                            <p className="text-xs text-gray-400 mt-0.5">
                                                Due: {record.dueDate?.toDate ? record.dueDate.toDate().toLocaleDateString("en-IN") : "—"}
                                            </p>
                                            {(record.lateFine || 0) > 0 && record.status !== "paid" && (
                                                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200 mt-1">
                                                    ⚠️ Late Fine: ₹{record.lateFine}
                                                </span>
                                            )}
                                            {record.receiptNo && (
                                                <p className="text-xs font-mono text-gray-400 mt-0.5">Receipt: {record.receiptNo}</p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-lg font-bold text-navy">₹{(record.totalAmount || record.amount)?.toLocaleString()}</p>
                                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                                            <StatusIcon className="w-3 h-3" />
                                            {cfg.label}
                                        </span>
                                        {record.status === "paid" && record.paidOn?.toDate && (
                                            <p className="text-xs text-gray-400 mt-1">
                                                Paid {record.paidOn.toDate().toLocaleDateString("en-IN")}
                                            </p>
                                        )}
                                        {/* Download Receipt Button */}
                                        {record.status === "paid" && record.receiptNo && (
                                            <button
                                                onClick={() => setReceiptRecord(record)}
                                                className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-navy/5 text-navy text-xs font-medium hover:bg-navy/10 transition-colors"
                                            >
                                                <Printer className="w-3 h-3" />
                                                Download Receipt
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Info Note */}
            <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 border border-blue-100">
                <Clock className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-600">
                    Payments are processed at the school office. Once you pay, the accountant will update your status.
                    You will receive an email reminder if your fee is due or overdue.
                </p>
            </div>

            {/* ── Receipt Modal ─────────────────────────────────────────────────── */}
            {receiptRecord && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col">
                        <div className="sticky top-0 bg-gray-50/90 backdrop-blur-md px-6 py-4 border-b border-gray-100 flex items-center justify-between z-10 rounded-t-2xl">
                            <h2 className="text-lg font-bold text-navy">Fee Receipt</h2>
                            <div className="flex items-center gap-2">
                                <button onClick={() => {
                                    const items = getBreakdownItems(receiptRecord);
                                    const html = buildReceiptHTML({
                                        title: "School Fee Receipt",
                                        receiptNo: receiptRecord.receiptNo || "N/A",
                                        studentName: receiptRecord.studentName || studentName || "—",
                                        classSection: `Class ${receiptRecord.class || "—"}${receiptRecord.section ? ` - ${receiptRecord.section}` : ""}`,
                                        rollNo: receiptRecord.rollNo || studentRoll || undefined,
                                        paidOn: receiptRecord.paidOn?.toDate
                                            ? receiptRecord.paidOn.toDate().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
                                            : "N/A",
                                        feeMonth: `${MONTHS[(receiptRecord.month || 1) - 1]} ${receiptRecord.year}`,
                                        lineItems: items,
                                        totalAmount: receiptRecord.amount,
                                        paymentMode: receiptRecord.paymentMode || "CASH"
                                    });
                                    if(receiptRecord.paymentMode) {
                                      // Note: we can visually add the Payment Mode in the UI too
                                    }
                                    printReceiptHTML(html, "School Fee Receipt");
                                }}
                                    className="inline-flex items-center gap-2 px-4 py-2 bg-navy text-white text-sm font-medium rounded-xl hover:bg-opacity-90 transition-colors shadow-sm">
                                    <Printer className="w-4 h-4" />Print / Download PDF
                                </button>
                                <button onClick={() => setReceiptRecord(null)}
                                    className="p-2 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                        <div id="student-fee-receipt" className="p-8 sm:p-10 bg-white">
                            <div className="text-center border-b-2 border-navy/20 pb-6 mb-8">
                                <h1 className="text-3xl font-extrabold text-navy tracking-tight uppercase">International Access School</h1>
                                <p className="text-sm text-gray-500 mt-2 font-medium">Atarsua, Siwan, Bihar, India, 841227</p>
                                <p className="text-xs text-gray-400 mt-1">Phone: +91 84060 00830 | Email: info@iaschool.edu.in</p>
                                <div className="inline-block mt-4 px-4 py-1.5 bg-navy/5 text-navy text-sm font-bold uppercase tracking-widest border border-navy/10 rounded-full">
                                    Fee Receipt
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
                                        <p className="font-bold text-gray-800 text-base">{receiptRecord.studentName || studentName || "—"}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Class / Section</p>
                                        <p className="font-semibold text-gray-800">Class {receiptRecord.class || "—"} {receiptRecord.section ? `- ${receiptRecord.section}` : ""}</p>
                                    </div>
                                    {(receiptRecord.rollNo || studentRoll) && (
                                        <div>
                                            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Admission No</p>
                                            <p className="font-semibold text-gray-800">{receiptRecord.rollNo || studentRoll}</p>
                                        </div>
                                    )}
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
                                        <p className="font-bold text-navy text-base">{MONTHS[(receiptRecord.month || 1) - 1]} {receiptRecord.year}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Payment Status / Mode</p>
                                        <div className="flex flex-col items-end gap-1">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 uppercase tracking-widest border border-emerald-200">
                                                Paid Successfully
                                            </span>
                                            <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                                                Via {receiptRecord.paymentMode || "CASH"}
                                            </span>
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
                                        {getBreakdownItems(receiptRecord).map((item, index) => (
                                            <tr key={index}>
                                                <td className="px-6 py-4 text-gray-500">{index + 1}.</td>
                                                <td className="px-6 py-4 font-medium text-gray-800">{item.label}</td>
                                                <td className="px-6 py-4 text-right font-medium text-gray-600">
                                                    {item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-gray-50/80 border-t-2 border-gray-200">
                                        <tr>
                                            <th colSpan={2} className="px-6 py-5 text-right font-extrabold text-navy text-base uppercase">Total Amount Paid</th>
                                            <td className="px-6 py-5 text-right font-extrabold text-navy text-lg">
                                                ₹{receiptRecord.amount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
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
        </div>
    );
}
