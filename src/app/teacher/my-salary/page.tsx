"use client";

import { useState, useEffect, useMemo } from "react";
import { collectionGroup, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import {
    Loader2, Banknote, CheckCircle2, Clock, FileText, Printer, X, ChevronDown
} from "lucide-react";
import { SalarySlip } from "@/components/salary-slip";

const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

interface SalaryRecord {
    id: string;
    teacherId: string;
    teacherName: string;
    year: number;
    month: number;
    gross: number;
    totalDeductions: number;
    netSalary: number;
    status: "pending" | "paid";
    paidOn?: any;
    paymentMode?: string;
    paymentRef?: string;
    basicSalary?: number;
    hra?: number;
    da?: number;
    otherAllowances?: number;
    pfDeduction?: number;
    esicDeduction?: number;
    pfPct?: number;
    esicPct?: number;
    receiptNo?: string;
    designation?: string;
    workingDays?: number;
    presentDays?: number;
    absentDays?: number;
    leaveDays?: number;
    lateDays?: number;
    otherDeductions?: number;
}

export default function TeacherMySalaryPage() {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [records, setRecords] = useState<SalaryRecord[]>([]);
    const [teacherData, setTeacherData] = useState<any>(null);
    const [yearFilter, setYearFilter] = useState<"all" | string>("all");
    const [slipRecord, setSlipRecord] = useState<SalaryRecord | null>(null);

    useEffect(() => {
        if (!user?.uid) return;
        const fetchData = async () => {
            setLoading(true);
            try {
                // Fetch teacher profile
                const tSnap = await getDoc(doc(db, "teachers", user.uid));
                if (tSnap.exists()) setTeacherData(tSnap.data());

                // Fetch all salary records for this teacher via collectionGroup
                const q = query(
                    collectionGroup(db, "records"),
                    where("teacherId", "==", user.uid)
                );
                const snap = await getDocs(q);
                const list: SalaryRecord[] = snap.docs
                    .map(d => ({ id: d.id, ...(d.data() as any) }))
                    .filter(r => r.gross !== undefined && r.netSalary !== undefined);
                list.sort((a, b) => b.year - a.year || b.month - a.month);
                setRecords(list);
            } catch (err) {
                console.error("Error fetching salary:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [user?.uid]);

    const yearOptions = useMemo(() => {
        const years = new Set<number>();
        records.forEach(r => years.add(r.year));
        return Array.from(years).sort((a, b) => b - a);
    }, [records]);

    const filtered = records.filter(r => yearFilter === "all" || String(r.year) === yearFilter);

    const yearTotals = useMemo(() => {
        const paid = filtered.filter(r => r.status === "paid").reduce((sum, r) => sum + r.netSalary, 0);
        const pending = filtered.filter(r => r.status === "pending").reduce((sum, r) => sum + r.netSalary, 0);
        return { paid, pending };
    }, [filtered]);

    return (
        <div className="space-y-6">
            <div className="rounded-2xl bg-gradient-to-br from-navy to-navy-light p-6 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10"
                    style={{ backgroundImage: "radial-gradient(circle at 80% 50%, rgba(200,169,81,0.4) 0%, transparent 60%)" }} />
                <div className="relative z-10">
                    <p className="text-white/50 text-sm font-medium">Teacher Portal</p>
                    <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">💰 My Salary</h1>
                    <p className="text-white/40 text-sm mt-1">View and download your salary slips</p>
                </div>
            </div>

            <div className="flex flex-wrap gap-3 items-end">
                <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Year</label>
                    <div className="relative">
                        <select value={yearFilter} onChange={e => setYearFilter(e.target.value)}
                            className="px-4 py-2 pr-8 border border-gray-200 rounded-xl text-sm appearance-none bg-white min-w-[120px]">
                            <option value="all">All Years</option>
                            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                        <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <StatCard value={`₹${yearTotals.paid.toLocaleString("en-IN")}`} label="Total Paid" color="text-emerald-600" />
                <StatCard value={`₹${yearTotals.pending.toLocaleString("en-IN")}`} label="Pending" color="text-amber-600" />
            </div>

            {loading ? (
                <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-navy" /></div>
            ) : filtered.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center text-gray-400 text-sm">
                    No salary records found. Salaries will appear here once generated by admin.
                </div>
            ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="hidden md:grid grid-cols-[1fr_1fr_1fr_1fr_1fr_100px] gap-2 px-5 py-3 bg-gray-50 text-xs font-semibold text-gray-500 border-b border-gray-100">
                        <span>Period</span>
                        <span>Gross</span>
                        <span>Deductions</span>
                        <span>Net</span>
                        <span>Status</span>
                        <span className="text-right">Slip</span>
                    </div>
                    <div className="divide-y divide-gray-50">
                        {filtered.map(r => (
                            <div key={r.id}
                                className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_1fr_1fr_100px] gap-2 px-5 py-4 items-center hover:bg-gray-50/50 transition-colors">
                                <div className="flex items-center gap-2">
                                    <Banknote className="w-4 h-4 text-navy/50" />
                                    <span className="text-sm font-semibold text-navy">{MONTHS[r.month - 1]} {r.year}</span>
                                </div>
                                <div className="text-sm text-gray-700 font-semibold">
                                    <span className="md:hidden text-xs text-gray-400">Gross: </span>
                                    ₹{r.gross.toLocaleString("en-IN")}
                                </div>
                                <div className="text-sm text-red-600 font-medium">
                                    <span className="md:hidden text-xs text-gray-400">Deductions: </span>
                                    ₹{r.totalDeductions.toLocaleString("en-IN")}
                                </div>
                                <div className="text-sm font-bold text-emerald-700">
                                    <span className="md:hidden text-xs text-gray-400">Net: </span>
                                    ₹{r.netSalary.toLocaleString("en-IN")}
                                </div>
                                <div>
                                    {r.status === "paid" ? (
                                        <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-100 text-emerald-700 w-fit">
                                            <CheckCircle2 className="w-3.5 h-3.5" /> Paid
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-100 text-amber-700 w-fit">
                                            <Clock className="w-3.5 h-3.5" /> Pending
                                        </span>
                                    )}
                                </div>
                                <div className="flex justify-end">
                                    {r.status === "paid" && (
                                        <button onClick={() => setSlipRecord(r)}
                                            className="flex items-center gap-1 text-xs px-3 py-1.5 bg-navy hover:bg-navy-light text-white rounded-lg font-semibold transition-colors">
                                            <FileText className="w-3 h-3" /> View
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Slip Modal */}
            {slipRecord && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 overflow-y-auto print:bg-white print:static print:overflow-visible"
                    onClick={() => setSlipRecord(null)}>
                    <div className="min-h-full flex items-start justify-center py-6 px-4 print:p-0">
                        <div onClick={e => e.stopPropagation()}
                            className="w-full max-w-3xl print:max-w-none">
                            <div className="flex justify-end gap-2 mb-3 print:hidden">
                                <button onClick={() => window.print()}
                                    className="flex items-center gap-2 px-4 py-2 bg-navy text-white rounded-xl text-sm font-semibold hover:bg-navy-light transition-colors">
                                    <Printer className="w-4 h-4" /> Print / Save PDF
                                </button>
                                <button onClick={() => setSlipRecord(null)}
                                    className="flex items-center gap-2 px-4 py-2 bg-white text-navy border border-gray-200 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors">
                                    <X className="w-4 h-4" /> Close
                                </button>
                            </div>
                            <SalarySlip record={slipRecord} teacher={teacherData} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function StatCard({ value, label, color }: { value: string; label: string; color: string }) {
    return (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-center">
            <div className={`text-lg md:text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-xs text-gray-400">{label}</div>
        </div>
    );
}
