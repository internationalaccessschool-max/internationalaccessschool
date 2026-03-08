"use client";

import { useState, useEffect } from "react";
import { collection, getDocs, doc, getDoc, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { Banknote, CheckCircle2, Clock, AlertCircle, Loader2 } from "lucide-react";

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
    const [studentId, setStudentId] = useState<string | null>(null);

    useEffect(() => {
        if (!user) return;
        // Student's uid is their studentId
        setStudentId(user.uid);
    }, [user]);

    useEffect(() => {
        if (!studentId) return;
        const fetchFees = async () => {
            try {
                let studentClass = "unknown";

                // Try direct students document first
                const studentDoc = await getDoc(doc(db, "students", studentId));
                if (studentDoc.exists()) {
                    const data = studentDoc.data();
                    const rawCls = data.currentClass || data.className || data.class || "";
                    studentClass = rawCls.toString().replace(/^class\s*/i, "").trim() || "unknown";
                }

                // If not found, try profiles subcollection
                if (studentClass === "unknown") {
                    const profilesSnap = await getDocs(
                        collection(db, "students", studentId, "profiles")
                    );
                    if (!profilesSnap.empty) {
                        const profileData = profilesSnap.docs[0].data();
                        const rawCls = profileData.currentClass || profileData.className || profileData.class || "";
                        studentClass = rawCls.toString().replace(/^class\s*/i, "").trim() || "unknown";
                    }
                }

                const currentYear = new Date().getFullYear();
                const months = Array.from({ length: 12 }, (_, i) => i + 1);

                const promises = [];
                // Fetch this year and previous year
                for (const year of [currentYear - 1, currentYear]) {
                    for (const month of months) {
                        promises.push(
                            getDocs(query(
                                collection(db, `feeRecords/${year}/months/${month}/classes/${studentClass}/records`),
                                where("studentId", "==", studentId)
                            ))
                        );
                    }
                }

                const snapshots = await Promise.all(promises);
                const allRecords = snapshots.flatMap(snap =>
                    snap.docs.map(d => ({ id: d.id, path: d.ref.path, ...d.data() } as FeeRecord))
                );

                setRecords(allRecords.sort((a, b) => b.year - a.year || b.month - a.month));
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetchFees();
    }, [studentId]);

    const totalPaid = records.filter(r => r.status === "paid").reduce((s, r) => s + r.amount, 0);
    const totalDue = records.filter(r => r.status !== "paid").reduce((s, r) => s + r.amount, 0);

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
                    </div>
                ) : (
                    <div className="divide-y divide-gray-50">
                        {records.map(record => {
                            const cfg = STATUS_CONFIG[record.status] || STATUS_CONFIG.pending;
                            const StatusIcon = cfg.icon;
                            return (
                                <div key={record.id} className="flex items-center justify-between p-5 hover:bg-gray-50/50 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-10 h-10 rounded-xl ${cfg.bg} border ${cfg.border} flex items-center justify-center shrink-0`}>
                                            <StatusIcon className={`w-5 h-5 ${cfg.text}`} />
                                        </div>
                                        <div>
                                            <p className="font-semibold text-navy">{MONTHS[(record.month || 1) - 1]} {record.year}</p>
                                            <p className="text-xs text-gray-400 mt-0.5">
                                                Due: {record.dueDate?.toDate ? record.dueDate.toDate().toLocaleDateString("en-IN") : "—"}
                                            </p>
                                            {record.receiptNo && (
                                                <p className="text-xs font-mono text-gray-400 mt-0.5">Receipt: {record.receiptNo}</p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-lg font-bold text-navy">₹{record.amount?.toLocaleString()}</p>
                                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                                            <StatusIcon className="w-3 h-3" />
                                            {cfg.label}
                                        </span>
                                        {record.status === "paid" && record.paidOn?.toDate && (
                                            <p className="text-xs text-gray-400 mt-1">
                                                Paid {record.paidOn.toDate().toLocaleDateString("en-IN")}
                                            </p>
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
        </div>
    );
}
