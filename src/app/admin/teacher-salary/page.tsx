"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { authFetch } from "@/lib/auth-fetch";
import Link from "next/link";
import toast from "react-hot-toast";
import {
    Loader2, Search, CheckCircle2, Clock, AlertCircle,
    ChevronDown, PlusCircle, FileText, X
} from "lucide-react";

const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

interface TeacherInfo {
    id: string;
    name: string;
    email: string;
    designation: string;
    basicSalary: number;
    hra: number;
    da: number;
    otherAllowances: number;
    gross: number;
}

interface SalaryRecord {
    id: string;
    teacherId: string;
    teacherName: string;
    designation: string;
    year: number;
    month: number;
    basicSalary: number;
    hra: number;
    da: number;
    otherAllowances: number;
    gross: number;
    pfDeduction: number;
    esicDeduction: number;
    otherDeductions: number;
    totalDeductions: number;
    netSalary: number;
    status: "pending" | "paid";
    paidOn?: any;
    paymentMode?: "CASH" | "BANK_TRANSFER" | "UPI" | "CHEQUE";
    paymentRef?: string;
    workingDays?: number;
    presentDays?: number;
    absentDays?: number;
    leaveDays?: number;
    holidayDays?: number;
}

export default function AdminTeacherSalaryPage() {
    const now = new Date();
    const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
    const [loading, setLoading] = useState(true);
    const [records, setRecords] = useState<SalaryRecord[]>([]);
    const [teachers, setTeachers] = useState<TeacherInfo[]>([]);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "paid" | "unpaid">("all");

    // Pay Modal
    const [payModal, setPayModal] = useState<SalaryRecord | null>(null);
    const [payMode, setPayMode] = useState<"CASH" | "BANK_TRANSFER" | "UPI" | "CHEQUE">("BANK_TRANSFER");
    const [payRef, setPayRef] = useState("");
    const [payLoading, setPayLoading] = useState(false);

    const yearOptions = useMemo(() => {
        const years: number[] = [];
        for (let y = now.getFullYear(); y >= 2024; y--) years.push(y);
        return years;
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. Fetch all teachers
            const teacherSnap = await getDocs(query(collection(db, "teachers"), orderBy("createdAt", "desc")));
            const teacherList: TeacherInfo[] = teacherSnap.docs.map(d => {
                const data = d.data() as any;
                const basic = Number(data.basicSalary) || 0;
                const hra = Number(data.hra) || 0;
                const da = Number(data.da) || 0;
                const other = Number(data.otherAllowances) || 0;
                return {
                    id: d.id,
                    name: `${data.firstName || ""} ${data.lastName || ""}`.trim() || data.name || "Unknown",
                    email: data.email || "",
                    designation: data.designation || "Teacher",
                    basicSalary: basic,
                    hra, da, otherAllowances: other,
                    gross: basic + hra + da + other,
                };
            });
            teacherList.sort((a, b) => a.name.localeCompare(b.name));
            setTeachers(teacherList);

            // 2. Fetch salary records for selected month
            const recSnap = await getDocs(collection(db, "teacherSalary", String(selectedYear), "months", String(selectedMonth), "records"));
            const recList: SalaryRecord[] = recSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
            setRecords(recList);
        } catch (err) {
            console.error("Error fetching salary data:", err);
            toast.error("Failed to load salary data");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, [selectedMonth, selectedYear]);

    // Merge teachers + records into display list
    const displayList = useMemo(() => {
        return teachers.map(t => {
            const rec = records.find(r => r.teacherId === t.id);
            return {
                teacher: t,
                record: rec || null,
            };
        });
    }, [teachers, records]);

    const filteredList = displayList.filter(({ teacher, record }) => {
        const matchSearch = teacher.name.toLowerCase().includes(search.toLowerCase()) ||
            teacher.email.toLowerCase().includes(search.toLowerCase());
        if (!matchSearch) return false;

        if (statusFilter === "unpaid") return !record;
        if (statusFilter === "paid") return record?.status === "paid";
        if (statusFilter === "pending") return record?.status === "pending";
        return true;
    });

    const stats = useMemo(() => {
        const generated = records.length;
        const paid = records.filter(r => r.status === "paid").length;
        const pending = records.filter(r => r.status === "pending").length;
        const notGenerated = teachers.length - generated;
        const totalPayable = records.reduce((sum, r) => sum + (r.status === "pending" ? r.netSalary : 0), 0);
        const totalPaid = records.reduce((sum, r) => sum + (r.status === "paid" ? r.netSalary : 0), 0);
        return { generated, paid, pending, notGenerated, totalPayable, totalPaid };
    }, [records, teachers]);

    const handlePay = async () => {
        if (!payModal) return;
        setPayLoading(true);
        try {
            const res = await authFetch("/api/admin/teacher-salary/pay", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    recordId: payModal.id,
                    year: payModal.year,
                    month: payModal.month,
                    paymentMode: payMode,
                    paymentRef: payRef,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Payment failed");
            toast.success("Salary marked as paid!");
            setPayModal(null);
            setPayRef("");
            fetchData();
        } catch (err: any) {
            console.error(err);
            toast.error(err.message || "Failed to mark as paid");
        } finally {
            setPayLoading(false);
        }
    };

    const openSlip = (record: SalaryRecord) => {
        window.open(`/admin/teacher-salary/slip?year=${record.year}&month=${record.month}&recordId=${record.id}`, "_blank");
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="rounded-2xl bg-gradient-to-br from-navy to-navy-light p-6 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10"
                    style={{ backgroundImage: "radial-gradient(circle at 80% 50%, rgba(200,169,81,0.4) 0%, transparent 60%)" }} />
                <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="text-white/50 text-sm font-medium">Admin Finance</p>
                        <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">💰 Teacher Salary</h1>
                        <p className="text-white/40 text-sm mt-1">Generate, pay and track teacher salaries</p>
                    </div>
                    <Link href="/admin/teacher-salary/generate"
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gold text-navy font-semibold text-sm hover:bg-gold-light transition-colors shadow-md">
                        <PlusCircle className="w-4 h-4" />
                        Generate Salaries
                    </Link>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-end">
                <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Month</label>
                    <div className="relative">
                        <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))}
                            className="px-4 py-2 pr-8 border border-gray-200 rounded-xl text-sm appearance-none bg-white min-w-[140px]">
                            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                        </select>
                        <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Year</label>
                    <div className="relative">
                        <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}
                            className="px-4 py-2 pr-8 border border-gray-200 rounded-xl text-sm appearance-none bg-white min-w-[100px]">
                            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                        <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Status</label>
                    <div className="relative">
                        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
                            className="px-4 py-2 pr-8 border border-gray-200 rounded-xl text-sm appearance-none bg-white min-w-[130px]">
                            <option value="all">All</option>
                            <option value="pending">Pending</option>
                            <option value="paid">Paid</option>
                            <option value="unpaid">Not Generated</option>
                        </select>
                        <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                </div>
                <div className="relative ml-auto">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="search" placeholder="Search teacher..." value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-9 pr-4 py-2 rounded-xl border border-gray-200 text-sm w-56 focus:outline-none focus:border-navy" />
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <StatCard value={teachers.length} label="Total Staff" color="text-navy" />
                <StatCard value={stats.generated} label="Generated" color="text-blue-600" />
                <StatCard value={stats.pending} label="Pending" color="text-amber-600" />
                <StatCard value={stats.paid} label="Paid" color="text-emerald-600" />
                <StatCard value={`₹${stats.totalPayable.toLocaleString("en-IN")}`} label="Payable" color="text-red-600" small />
            </div>

            {loading ? (
                <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-navy" /></div>
            ) : filteredList.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center text-gray-400 text-sm">
                    No teachers found.
                </div>
            ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="hidden md:grid grid-cols-[2fr_1.2fr_1fr_1.2fr_1fr_1.5fr] gap-2 px-5 py-3 bg-gray-50 text-xs font-semibold text-gray-500 border-b border-gray-100">
                        <span>Teacher</span>
                        <span>Gross</span>
                        <span>Deductions</span>
                        <span>Net Salary</span>
                        <span>Status</span>
                        <span className="text-right">Actions</span>
                    </div>
                    <div className="divide-y divide-gray-50">
                        {filteredList.map(({ teacher, record }, idx) => {
                            const gross = record?.gross ?? teacher.gross;
                            const deductions = record?.totalDeductions ?? 0;
                            const net = record?.netSalary ?? gross;

                            return (
                                <div key={teacher.id}
                                    className="grid grid-cols-1 md:grid-cols-[2fr_1.2fr_1fr_1.2fr_1fr_1.5fr] gap-2 px-5 py-4 items-center hover:bg-gray-50/50 transition-colors">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-8 h-8 rounded-full bg-navy/10 flex items-center justify-center text-navy font-bold text-xs shrink-0">
                                            {idx + 1}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-navy truncate">{teacher.name}</p>
                                            <p className="text-xs text-gray-400 truncate">{teacher.designation}</p>
                                        </div>
                                    </div>
                                    <div className="text-sm text-gray-700 font-semibold">
                                        <span className="md:hidden text-xs text-gray-400">Gross: </span>
                                        ₹{gross.toLocaleString("en-IN")}
                                    </div>
                                    <div className="text-sm text-red-600 font-medium">
                                        <span className="md:hidden text-xs text-gray-400">Deductions: </span>
                                        ₹{deductions.toLocaleString("en-IN")}
                                    </div>
                                    <div className="text-sm text-emerald-700 font-bold">
                                        <span className="md:hidden text-xs text-gray-400">Net: </span>
                                        ₹{net.toLocaleString("en-IN")}
                                    </div>
                                    <div>
                                        {record ? <StatusBadge status={record.status} /> : <NotGeneratedBadge />}
                                    </div>
                                    <div className="flex items-center justify-end gap-2 flex-wrap">
                                        {record ? (
                                            <>
                                                {record.status === "pending" && (
                                                    <button onClick={() => { setPayModal(record); setPayRef(""); setPayMode("BANK_TRANSFER"); }}
                                                        className="text-xs px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-semibold transition-colors">
                                                        Mark Paid
                                                    </button>
                                                )}
                                                {record.status === "paid" && (
                                                    <button onClick={() => openSlip(record)}
                                                        className="flex items-center gap-1 text-xs px-3 py-1.5 bg-navy hover:bg-navy-light text-white rounded-lg font-semibold transition-colors">
                                                        <FileText className="w-3 h-3" /> Slip
                                                    </button>
                                                )}
                                            </>
                                        ) : (
                                            <span className="text-xs text-gray-400 italic">Not generated yet</span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Pay Modal */}
            {payModal && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                    onClick={() => !payLoading && setPayModal(null)}>
                    <div onClick={e => e.stopPropagation()}
                        className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl border border-gray-100">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-navy">Mark Salary as Paid</h3>
                            <button onClick={() => !payLoading && setPayModal(null)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-4 mb-4">
                            <p className="text-xs text-gray-400">Teacher</p>
                            <p className="text-sm font-semibold text-navy">{payModal.teacherName}</p>
                            <p className="text-xs text-gray-400 mt-2">Period</p>
                            <p className="text-sm font-semibold text-navy">{MONTHS[payModal.month - 1]} {payModal.year}</p>
                            <p className="text-xs text-gray-400 mt-2">Net Salary</p>
                            <p className="text-xl font-bold text-emerald-600">₹{payModal.netSalary.toLocaleString("en-IN")}</p>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 mb-1">Payment Mode</label>
                                <select value={payMode} onChange={e => setPayMode(e.target.value as any)}
                                    className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm bg-white">
                                    <option value="BANK_TRANSFER">Bank Transfer</option>
                                    <option value="UPI">UPI</option>
                                    <option value="CASH">Cash</option>
                                    <option value="CHEQUE">Cheque</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 mb-1">Reference / Txn ID (optional)</label>
                                <input value={payRef} onChange={e => setPayRef(e.target.value)}
                                    placeholder="e.g. UTR12345 / Cheque No"
                                    className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm" />
                            </div>
                        </div>
                        <div className="flex gap-2 mt-5">
                            <button onClick={() => setPayModal(null)} disabled={payLoading}
                                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                                Cancel
                            </button>
                            <button onClick={handlePay} disabled={payLoading}
                                className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2">
                                {payLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                Confirm Payment
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function StatCard({ value, label, color, small }: { value: number | string; label: string; color: string; small?: boolean }) {
    return (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-center">
            <div className={`${small ? "text-sm md:text-base" : "text-2xl"} font-bold ${color} truncate`}>{value}</div>
            <div className="text-xs text-gray-400">{label}</div>
        </div>
    );
}

function StatusBadge({ status }: { status: "pending" | "paid" }) {
    if (status === "paid") {
        return (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-100 text-emerald-700 w-fit">
                <CheckCircle2 className="w-3.5 h-3.5" /> Paid
            </span>
        );
    }
    return (
        <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-100 text-amber-700 w-fit">
            <Clock className="w-3.5 h-3.5" /> Pending
        </span>
    );
}

function NotGeneratedBadge() {
    return (
        <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-100 text-gray-500 w-fit">
            <AlertCircle className="w-3.5 h-3.5" /> Not Generated
        </span>
    );
}
