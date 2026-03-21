"use client";

import { useState, useEffect } from "react";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { Bus, Clock, CheckCircle2, AlertCircle, Loader2, Banknote } from "lucide-react";
import { getStudentClassInfo } from "@/lib/utils/studentProfile";

interface TransportFeeRecord {
    id: string;
    studentName: string;
    busNumber: string;
    routeDetails: string;
    amount: number;
    month: number;
    year: number;
    status: "pending" | "paid" | "overdue";
    paidOn?: { toDate: () => Date } | null;
    receiptNo?: string | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function StudentTransportFeePage() {
    const { user } = useAuth();
    const [records, setRecords] = useState<TransportFeeRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isBusStudent, setIsBusStudent] = useState(false);

    useEffect(() => {
        if (!user) return;
        const fetch = async () => {
            try {
                // Check if this student uses bus transport
                const { className, section } = await getStudentClassInfo(user.uid);
                const profileRef = doc(db, "users", "classes", className, "sections", section, "students", "profiles", user.uid);
                const profileSnap = await getDoc(profileRef);
                const transport = profileSnap.data()?.transport || "";
                const usesBus = transport.toUpperCase() === "BUS" || transport.startsWith("bus-");
                setIsBusStudent(usesBus);

                if (!usesBus) { setIsLoading(false); return; }

                // Fetch all years/months transport fee records for this student
                // Check last 12 months
                const now = new Date();
                const allRecords: TransportFeeRecord[] = [];

                for (let i = 0; i < 12; i++) {
                    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                    const y = d.getFullYear().toString();
                    const m = (d.getMonth() + 1).toString();
                    const snap = await getDoc(
                        doc(db, "transportFeeRecords", y, "months", m, "students", user.uid)
                    );
                    if (snap.exists()) {
                        allRecords.push({ id: snap.id, ...snap.data() } as TransportFeeRecord);
                    }
                }

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
                    <h3 className="font-bold text-navy">Payment History (Last 12 Months)</h3>
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
                                <div key={record.id} className="flex items-center justify-between px-5 py-4 hover:bg-gray-50/60 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-10 h-10 rounded-xl ${cfg.bg} flex items-center justify-center shrink-0`}>
                                            <Icon className={`w-5 h-5 ${cfg.text}`} />
                                        </div>
                                        <div>
                                            <p className="font-semibold text-navy text-sm">
                                                {MONTHS[record.month - 1]} {record.year}
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
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-bold text-navy text-sm">₹{record.amount?.toLocaleString() || "0"}</p>
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                                            {cfg.label}
                                        </span>
                                        {record.receiptNo && (
                                            <p className="text-xs text-gray-400 font-mono mt-0.5">{record.receiptNo}</p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
