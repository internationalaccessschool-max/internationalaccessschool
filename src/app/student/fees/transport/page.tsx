"use client";

import { useState, useEffect } from "react";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { Bus, Clock, CheckCircle2, AlertCircle, Loader2, Banknote, Printer, X } from "lucide-react";
import { getStudentClassInfo } from "@/lib/utils/studentProfile";

interface TransportFeeRecord {
    id: string;
    studentName?: string;
    className?: string;
    section?: string;
    busNumber: string;
    routeDetails: string;
    amount: number;
    month: number;
    year: number;
    status: "pending" | "paid" | "overdue";
    paidOn?: { toDate: () => Date } | null;
    receiptNo?: string | null;
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function StudentTransportFeePage() {
    const { user } = useAuth();
    const [records, setRecords] = useState<TransportFeeRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isBusStudent, setIsBusStudent] = useState(false);
    const [receiptRecord, setReceiptRecord] = useState<TransportFeeRecord | null>(null);
    const [studentDisplayName, setStudentDisplayName] = useState("");

    useEffect(() => {
        if (!user) return;
        const fetch = async () => {
            try {
                // ── Get student name ──────────────────────────────────────────
                try {
                    const lookupDoc = await getDoc(doc(db, "studentLookup", user.uid));
                    if (lookupDoc.exists()) {
                        const d = lookupDoc.data();
                        setStudentDisplayName(d.studentName || d.name || "");
                    }
                } catch { /* ignore */ }

                // ── Try to get bus status from profile ────────────────────────
                let busDetected = false;
                try {
                    const { className, section } = await getStudentClassInfo(user.uid);
                    const profileRef = doc(db, "users", "classes", className, "sections", section, "students", "profiles", user.uid);
                    const profileSnap = await getDoc(profileRef);
                    const transport = profileSnap.data()?.transport || "";
                    busDetected = transport.toUpperCase() === "BUS" || transport.startsWith("bus-") || /^[a-zA-Z0-9_-]{10,}$/.test(transport);
                } catch { /* profile path may fail — will fallback below */ }

                // ── Fetch transport fee records for the last 24 months ────────
                const now = new Date();
                const allRecords: TransportFeeRecord[] = [];

                for (let i = 0; i < 24; i++) {
                    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                    const y = d.getFullYear().toString();
                    const m = (d.getMonth() + 1).toString();
                    const snap = await getDoc(
                        doc(db, "transportFeeRecords", y, "months", m, "students", user.uid)
                    );
                    if (snap.exists()) {
                        allRecords.push({ id: snap.id, ...snap.data() } as TransportFeeRecord);
                        busDetected = true; // if records exist, they are a bus student
                    }
                }

                setIsBusStudent(busDetected);

                allRecords.sort((a, b) => {
                    if (a.year !== b.year) return b.year - a.year;
                    return b.month - a.month;
                });

                setRecords(allRecords);
            } catch (err) {
                console.error("Error fetching transport fees:", err);
            } finally {
                setIsLoading(false);
            }
        };
        fetch();
    }, [user]);

    const STATUS_CFG = {
        paid: { label: "Paid", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", icon: CheckCircle2 },
        pending: { label: "Pending", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", icon: Clock },
        overdue: { label: "Overdue", bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200", icon: AlertCircle },
    };

    const totalPaid = records.filter(r => r.status === "paid").reduce((s, r) => s + r.amount, 0);
    const totalPending = records.filter(r => r.status !== "paid").reduce((s, r) => s + r.amount, 0);

    if (isLoading) return (
        <div className="flex h-[50vh] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
    );

    if (!isBusStudent) return (
        <div className="p-6">
            <div className="rounded-2xl gradient-navy p-8 text-center">
                <Bus className="w-12 h-12 text-white/30 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-white mb-2">No Transport Enrolled</h2>
                <p className="text-white/50 text-sm">You are not enrolled in the school bus service. Contact the school office to enroll.</p>
            </div>
        </div>
    );

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="rounded-2xl gradient-navy p-6 md:p-8 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 80% 50%, rgba(200,169,81,0.3) 0%, transparent 60%)" }} />
                <div className="relative z-10 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center">
                        <Bus className="w-6 h-6 text-indigo-300" />
                    </div>
                    <div>
                        <p className="text-white/50 text-sm font-medium">Student Portal</p>
                        <h1 className="text-2xl font-bold text-white">Transport Fees</h1>
                        <p className="text-white/40 text-sm mt-1">Your school bus fee payment history</p>
                    </div>
                </div>
            </div>

            {/* Stats */}
            {records.length > 0 && (
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 mb-2" />
                        <div className="text-xl font-bold text-emerald-700">₹{totalPaid.toLocaleString()}</div>
                        <div className="text-xs text-emerald-600 opacity-70">Total Paid</div>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
                        <Clock className="w-5 h-5 text-amber-600 mb-2" />
                        <div className="text-xl font-bold text-amber-700">₹{totalPending.toLocaleString()}</div>
                        <div className="text-xs text-amber-600 opacity-70">Pending</div>
                    </div>
                </div>
            )}

            {/* Records */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                    <h3 className="font-bold text-navy">Payment History</h3>
                </div>
                {records.length === 0 ? (
                    <div className="text-center py-16 text-gray-400">
                        <Banknote className="w-10 h-10 mx-auto mb-3 opacity-20" />
                        <p className="text-sm font-medium">No transport fee records yet</p>
                        <p className="text-xs mt-1">Records will appear once fees are generated by the school.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-50">
                        {records.map(record => {
                            const cfg = STATUS_CFG[record.status] || STATUS_CFG.pending;
                            const Icon = cfg.icon;
                            return (
                                <div key={record.id} className="flex items-center justify-between px-5 py-4 hover:bg-gray-50/60 transition-colors gap-4">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-10 h-10 rounded-xl ${cfg.bg} flex items-center justify-center shrink-0`}>
                                            <Icon className={`w-5 h-5 ${cfg.text}`} />
                                        </div>
                                        <div>
                                            <p className="font-semibold text-navy text-sm">
                                                {MONTHS_SHORT[record.month - 1]} {record.year}
                                            </p>
                                            {record.busNumber && record.busNumber !== "—" && (
                                                <p className="text-xs text-gray-400 flex items-center gap-1">
                                                    <Bus className="w-3 h-3" /> Bus {record.busNumber}
                                                    {record.routeDetails && ` · ${record.routeDetails}`}
                                                </p>
                                            )}
                                            {record.status === "paid" && record.paidOn?.toDate && (
                                                <p className="text-xs text-emerald-500">
                                                    Paid on {record.paidOn.toDate().toLocaleDateString("en-IN")}
                                                </p>
                                            )}
                                            {record.receiptNo && (
                                                <p className="text-xs text-gray-400 font-mono">{record.receiptNo}</p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="font-bold text-navy text-sm">₹{record.amount?.toLocaleString() || "0"}</p>
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                                            {cfg.label}
                                        </span>
                                        {/* Receipt download */}
                                        {record.status === "paid" && record.receiptNo && (
                                            <button
                                                onClick={() => setReceiptRecord(record)}
                                                className="mt-2 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-medium hover:bg-indigo-100 transition-colors ml-auto"
                                            >
                                                <Printer className="w-3 h-3" />
                                                Receipt
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── Transport Receipt Modal ─────────────────────────────────────── */}
            {receiptRecord && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm">
                    <style jsx global>{`
                        @media print {
                            body * { visibility: hidden; }
                            #student-transport-receipt, #student-transport-receipt * { visibility: visible; }
                            #student-transport-receipt { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 20px; }
                            .no-print { display: none !important; }
                        }
                    `}</style>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col">
                        <div className="sticky top-0 bg-gray-50/90 backdrop-blur-md px-6 py-4 border-b border-gray-100 flex items-center justify-between z-10 no-print rounded-t-2xl">
                            <h2 className="text-lg font-bold text-navy">Transport Fee Receipt</h2>
                            <div className="flex items-center gap-2">
                                <button onClick={() => window.print()}
                                    className="inline-flex items-center gap-2 px-4 py-2 bg-navy text-white text-sm font-medium rounded-xl hover:bg-opacity-90 transition-colors">
                                    <Printer className="w-4 h-4" />Print / Download PDF
                                </button>
                                <button onClick={() => setReceiptRecord(null)}
                                    className="p-2 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                        <div id="student-transport-receipt" className="p-8 sm:p-10 bg-white">
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
                                        <p className="font-bold text-gray-800 text-base">{receiptRecord.studentName || studentDisplayName || "—"}</p>
                                    </div>
                                    {(receiptRecord.className) && (
                                        <div>
                                            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Class / Section</p>
                                            <p className="font-semibold text-gray-800">Class {receiptRecord.className}{receiptRecord.section ? ` - ${receiptRecord.section}` : ""}</p>
                                        </div>
                                    )}
                                    {receiptRecord.busNumber && receiptRecord.busNumber !== "—" && (
                                        <div>
                                            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Bus</p>
                                            <p className="font-semibold text-gray-800">Bus {receiptRecord.busNumber} {receiptRecord.routeDetails ? `· ${receiptRecord.routeDetails}` : ""}</p>
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
                                        <p className="font-bold text-navy text-base">{MONTHS_FULL[(receiptRecord.month || 1) - 1]} {receiptRecord.year}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Payment Status</p>
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 uppercase tracking-widest border border-emerald-200">
                                            Paid Successfully
                                        </span>
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
                                            <td className="px-6 py-4 font-medium text-gray-800">
                                                Bus Transport Fee — {MONTHS_FULL[(receiptRecord.month || 1) - 1]} {receiptRecord.year}
                                            </td>
                                            <td className="px-6 py-4 text-right font-medium text-gray-600">
                                                {receiptRecord.amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                        </tr>
                                    </tbody>
                                    <tfoot className="bg-gray-50/80 border-t-2 border-gray-200">
                                        <tr>
                                            <th colSpan={2} className="px-6 py-5 text-right font-extrabold text-navy text-base uppercase">Total Amount Paid</th>
                                            <td className="px-6 py-5 text-right font-extrabold text-navy text-lg">
                                                ₹{receiptRecord.amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
