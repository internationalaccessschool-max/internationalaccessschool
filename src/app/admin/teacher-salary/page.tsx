"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, query, orderBy, doc, addDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { authFetch } from "@/lib/auth-fetch";
import Link from "next/link";
import toast from "react-hot-toast";
import {
    Loader2, Search, CheckCircle2, Clock, AlertCircle,
    ChevronDown, PlusCircle, FileText, X, UserPlus, Pencil, Trash2, Users2,
    ChevronRight, Calendar, TrendingDown, IndianRupee
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
    staffType: "teacher" | "staff";
}

interface StaffForm {
    name: string;
    designation: string;
    basicSalary: string;
    hra: string;
    da: string;
    otherAllowances: string;
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
    pfPct: number;
    esicPct: number;
    pfDeduction: number;
    esicDeduction: number;
    otherDeductions: number;
    absentDeduction: number;
    deductibleDays: number;
    lateToAbsent: number;
    effectiveAbsents: number;
    perDayRate: number;
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
    lateDays?: number;
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
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // Staff management modal
    const [staffModalOpen, setStaffModalOpen] = useState(false);
    const [editingStaff, setEditingStaff] = useState<TeacherInfo | null>(null);
    const [staffSaving, setStaffSaving] = useState(false);
    const emptyForm: StaffForm = { name: "", designation: "", basicSalary: "", hra: "0", da: "0", otherAllowances: "0" };
    const [staffForm, setStaffForm] = useState<StaffForm>(emptyForm);

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
                    basicSalary: basic, hra, da, otherAllowances: other,
                    gross: basic + hra + da + other,
                    staffType: "teacher" as const,
                };
            });

            const staffSnap = await getDocs(collection(db, "nonTeachingStaff"));
            const staffList: TeacherInfo[] = staffSnap.docs.map(d => {
                const data = d.data() as any;
                const basic = Number(data.basicSalary) || 0;
                const hra = Number(data.hra) || 0;
                const da = Number(data.da) || 0;
                const other = Number(data.otherAllowances) || 0;
                return {
                    id: d.id,
                    name: data.name || "Unknown",
                    email: "",
                    designation: data.designation || "Staff",
                    basicSalary: basic, hra, da, otherAllowances: other,
                    gross: basic + hra + da + other,
                    staffType: "staff" as const,
                };
            });

            const allList = [...teacherList, ...staffList];
            allList.sort((a, b) => a.name.localeCompare(b.name));
            setTeachers(allList);

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

    const displayList = useMemo(() => {
        return teachers.map(t => {
            const rec = records.find(r => r.teacherId === t.id);
            return { teacher: t, record: rec || null };
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
        return { generated, paid, pending, notGenerated, totalPayable };
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
            toast.error(err.message || "Failed to mark as paid");
        } finally {
            setPayLoading(false);
        }
    };

    const openAddStaff = () => { setEditingStaff(null); setStaffForm(emptyForm); setStaffModalOpen(true); };
    const openEditStaff = (t: TeacherInfo) => {
        setEditingStaff(t);
        setStaffForm({ name: t.name, designation: t.designation, basicSalary: String(t.basicSalary), hra: String(t.hra), da: String(t.da), otherAllowances: String(t.otherAllowances) });
        setStaffModalOpen(true);
    };

    const handleSaveStaff = async () => {
        if (!staffForm.name.trim() || !staffForm.designation.trim()) { toast.error("Name and designation are required"); return; }
        setStaffSaving(true);
        try {
            const payload = {
                name: staffForm.name.trim(), designation: staffForm.designation.trim(),
                basicSalary: Number(staffForm.basicSalary) || 0, hra: Number(staffForm.hra) || 0,
                da: Number(staffForm.da) || 0, otherAllowances: Number(staffForm.otherAllowances) || 0,
                updatedAt: Date.now(),
            };
            if (editingStaff) {
                await updateDoc(doc(db, "nonTeachingStaff", editingStaff.id), payload);
                toast.success("Staff updated!");
            } else {
                await addDoc(collection(db, "nonTeachingStaff"), { ...payload, createdAt: Date.now() });
                toast.success("Staff added!");
            }
            setStaffModalOpen(false);
            fetchData();
        } catch (err: any) {
            toast.error(err.message || "Failed to save");
        } finally {
            setStaffSaving(false);
        }
    };

    const handleDeleteStaff = async (t: TeacherInfo) => {
        if (!window.confirm(`Delete "${t.name}" from non-teaching staff?`)) return;
        try {
            await deleteDoc(doc(db, "nonTeachingStaff", t.id));
            toast.success("Staff removed");
            fetchData();
        } catch (err: any) {
            toast.error(err.message || "Failed to delete");
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
                        <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">💰 Staff Salary</h1>
                        <p className="text-white/40 text-sm mt-1">Attendance-linked · 3 absents = 1 day deduction</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={openAddStaff}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 text-white font-semibold text-sm hover:bg-white/20 transition-colors border border-white/20">
                            <Users2 className="w-4 h-4" /> Manage Staff
                        </button>
                        <Link href="/admin/teacher-salary/generate"
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gold text-navy font-semibold text-sm hover:bg-gold-light transition-colors shadow-md">
                            <PlusCircle className="w-4 h-4" /> Generate Salaries
                        </Link>
                    </div>
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
                    <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1.2fr_0.8fr_1.4fr] gap-2 px-5 py-3 bg-gray-50 text-xs font-semibold text-gray-500 border-b border-gray-100">
                        <span>Teacher</span>
                        <span>Gross / Per Day</span>
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
                            const perDay = record?.perDayRate ?? 0;
                            const isExpanded = expandedId === teacher.id;

                            return (
                                <div key={teacher.id} className="border-b border-gray-50 last:border-0">
                                    {/* Main row */}
                                    <div
                                        className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1.2fr_0.8fr_1.4fr] gap-2 px-5 py-4 items-center hover:bg-gray-50/50 transition-colors cursor-pointer"
                                        onClick={() => record && setExpandedId(isExpanded ? null : teacher.id)}
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${teacher.staffType === "staff" ? "bg-orange-100 text-orange-700" : "bg-navy/10 text-navy"}`}>
                                                {idx + 1}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <p className="text-sm font-semibold text-navy truncate">{teacher.name}</p>
                                                    {teacher.staffType === "staff" && (
                                                        <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-700">Staff</span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-gray-400 truncate">{teacher.designation}</p>
                                            </div>
                                            {record && (
                                                <ChevronRight className={`w-4 h-4 text-gray-300 shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                                            )}
                                        </div>

                                        {/* Gross + Per Day */}
                                        <div>
                                            <div className="text-sm text-gray-700 font-semibold">
                                                <span className="md:hidden text-xs text-gray-400">Gross: </span>
                                                ₹{gross.toLocaleString("en-IN")}
                                            </div>
                                            {perDay > 0 && (
                                                <div className="text-xs text-indigo-500 font-medium mt-0.5">
                                                    ₹{perDay.toLocaleString("en-IN")}/day
                                                </div>
                                            )}
                                        </div>

                                        {/* Deductions */}
                                        <div className="text-sm text-red-500 font-medium">
                                            <span className="md:hidden text-xs text-gray-400">Deductions: </span>
                                            ₹{deductions.toLocaleString("en-IN")}
                                            {record?.absentDeduction ? (
                                                <div className="text-xs text-red-400">incl. absent cut</div>
                                            ) : null}
                                        </div>

                                        {/* Net */}
                                        <div className="text-sm text-emerald-700 font-bold">
                                            <span className="md:hidden text-xs text-gray-400">Net: </span>
                                            ₹{net.toLocaleString("en-IN")}
                                        </div>

                                        {/* Status */}
                                        <div onClick={e => e.stopPropagation()}>
                                            {record ? <StatusBadge status={record.status} /> : <NotGeneratedBadge />}
                                        </div>

                                        {/* Actions */}
                                        <div className="flex items-center justify-end gap-2 flex-wrap" onClick={e => e.stopPropagation()}>
                                            {teacher.staffType === "staff" && (
                                                <>
                                                    <button onClick={() => openEditStaff(teacher)}
                                                        className="text-xs p-1.5 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors" title="Edit staff">
                                                        <Pencil className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button onClick={() => handleDeleteStaff(teacher)}
                                                        className="text-xs p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Remove staff">
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </>
                                            )}
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
                                                <span className="text-xs text-gray-400 italic">Not generated</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Expanded daily breakdown */}
                                    {isExpanded && record && (
                                        <div className="mx-5 mb-4 rounded-2xl bg-slate-50 border border-slate-100 overflow-hidden">
                                            {/* Attendance row */}
                                            <div className="px-5 py-3 border-b border-slate-100">
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                                    <Calendar className="w-3 h-3" /> Attendance — {MONTHS[(record.month || 1) - 1]} {record.year}
                                                </p>
                                                <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                                                    <AttBox label="Working Days" value={record.workingDays ?? "—"} color="text-slate-600" />
                                                    <AttBox label="Present" value={record.presentDays ?? 0} color="text-emerald-600" />
                                                    <AttBox label="CL" value={record.leaveDays ?? 0} color="text-blue-600" />
                                                    <AttBox label="Holiday" value={record.holidayDays ?? 0} color="text-purple-600" />
                                                    <AttBox label="Late" value={record.lateDays ?? 0} color="text-amber-600" />
                                                    <AttBox label="Absent" value={record.absentDays ?? 0} color="text-red-600" />
                                                </div>
                                            </div>

                                            {/* Per-day salary breakdown */}
                                            <div className="px-5 py-3 border-b border-slate-100">
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                                    <IndianRupee className="w-3 h-3" /> Daily Salary Breakdown
                                                </p>
                                                <div className="space-y-1.5 text-xs">
                                                    {/* Per day rate */}
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-slate-500">Per Day Rate  <span className="text-slate-400">(Gross ÷ Working Days)</span></span>
                                                        <span className="font-bold text-indigo-600">₹{(record.perDayRate ?? 0).toLocaleString("en-IN")} / day</span>
                                                    </div>
                                                    {/* Paid days */}
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-slate-500 flex items-center gap-1">
                                                            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                                                            Present ({record.presentDays ?? 0}) + CL ({record.leaveDays ?? 0}) + Holiday ({record.holidayDays ?? 0}) days <span className="text-slate-400">— all paid</span>
                                                        </span>
                                                        <span className="font-semibold text-emerald-600">
                                                            ₹{(((record.presentDays ?? 0) + (record.leaveDays ?? 0) + (record.holidayDays ?? 0)) * (record.perDayRate ?? 0)).toLocaleString("en-IN")}
                                                        </span>
                                                    </div>
                                                    {/* Absent rule */}
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-slate-500 flex items-center gap-1">
                                                            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                                                            Late: {record.lateDays ?? 0} days → ÷3 = {record.lateToAbsent ?? Math.floor((record.lateDays ?? 0) / 3)} extra absent
                                                        </span>
                                                        <span className="text-amber-500 font-medium text-xs">counted as absent</span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-slate-500 flex items-center gap-1">
                                                            <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                                                            Effective Absent: {record.absentDays ?? 0} + {record.lateToAbsent ?? Math.floor((record.lateDays ?? 0) / 3)} = {record.effectiveAbsents ?? ((record.absentDays ?? 0) + Math.floor((record.lateDays ?? 0) / 3))} → ÷3 = {record.deductibleDays ?? 0} day(s) cut
                                                        </span>
                                                        <span className="font-semibold text-red-500">
                                                            −₹{(record.absentDeduction ?? 0).toLocaleString("en-IN")}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Deductions summary */}
                                            <div className="px-5 py-3">
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                                    <TrendingDown className="w-3 h-3" /> Deduction Summary
                                                </p>
                                                <div className="flex flex-wrap gap-4 text-xs">
                                                    <DeductBox label={`PF (${record.pfPct ?? 0}%)`} value={record.pfDeduction ?? 0} />
                                                    <DeductBox label={`ESIC (${record.esicPct ?? 0}%)`} value={record.esicDeduction ?? 0} />
                                                    <DeductBox
                                                        label={`Absent (${record.deductibleDays ?? 0} day${(record.deductibleDays ?? 0) !== 1 ? "s" : ""})`}
                                                        value={record.absentDeduction ?? 0}
                                                        highlight
                                                    />
                                                    <div className="ml-auto text-right">
                                                        <div className="text-slate-400">Gross</div>
                                                        <div className="font-bold text-navy">₹{record.gross.toLocaleString("en-IN")}</div>
                                                        <div className="text-slate-400 mt-1">Total Deductions</div>
                                                        <div className="font-bold text-red-500">−₹{record.totalDeductions.toLocaleString("en-IN")}</div>
                                                        <div className="text-slate-400 mt-1">Net Salary</div>
                                                        <div className="font-bold text-emerald-600 text-base">₹{record.netSalary.toLocaleString("en-IN")}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Staff Management Modal */}
            {staffModalOpen && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                    onClick={() => !staffSaving && setStaffModalOpen(false)}>
                    <div onClick={e => e.stopPropagation()}
                        className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl border border-gray-100 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-lg font-bold text-navy flex items-center gap-2">
                                <Users2 className="w-5 h-5 text-orange-500" />
                                {editingStaff ? "Edit Staff Member" : "Add Non-Teaching Staff"}
                            </h3>
                            <button onClick={() => setStaffModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="space-y-3">
                            {[
                                { label: "Full Name *", key: "name", placeholder: "e.g. Ramesh Kumar" },
                                { label: "Designation *", key: "designation", placeholder: "e.g. Peon, Guard, Clerk" },
                            ].map(({ label, key, placeholder }) => (
                                <div key={key}>
                                    <label className="block text-xs font-semibold text-gray-500 mb-1">{label}</label>
                                    <input value={staffForm[key as keyof StaffForm]}
                                        onChange={e => setStaffForm(p => ({ ...p, [key]: e.target.value }))}
                                        placeholder={placeholder}
                                        className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm" />
                                </div>
                            ))}
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { label: "Basic Salary (₹)", key: "basicSalary" },
                                    { label: "HRA (₹)", key: "hra" },
                                    { label: "DA (₹)", key: "da" },
                                    { label: "Other Allowances (₹)", key: "otherAllowances" },
                                ].map(({ label, key }) => (
                                    <div key={key}>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">{label}</label>
                                        <input type="number" min={0}
                                            value={staffForm[key as keyof StaffForm]}
                                            onChange={e => setStaffForm(p => ({ ...p, [key]: e.target.value }))}
                                            className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm" />
                                    </div>
                                ))}
                            </div>
                            <div className="bg-orange-50 rounded-xl px-4 py-2 text-sm font-bold text-orange-700">
                                Gross: ₹{(
                                    (Number(staffForm.basicSalary) || 0) + (Number(staffForm.hra) || 0) +
                                    (Number(staffForm.da) || 0) + (Number(staffForm.otherAllowances) || 0)
                                ).toLocaleString("en-IN")}
                            </div>
                        </div>
                        <div className="flex gap-2 mt-5">
                            <button onClick={() => setStaffModalOpen(false)} disabled={staffSaving}
                                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                                Cancel
                            </button>
                            <button onClick={handleSaveStaff} disabled={staffSaving}
                                className="flex-1 px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2">
                                {staffSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : editingStaff ? <Pencil className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                                {editingStaff ? "Save Changes" : "Add Staff"}
                            </button>
                        </div>
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

function AttBox({ label, value, color }: { label: string; value: number | string; color: string }) {
    return (
        <div className="text-center">
            <div className={`text-lg font-bold ${color}`}>{value}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">{label}</div>
        </div>
    );
}

function DeductBox({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
    return (
        <div className={`px-3 py-2 rounded-xl ${highlight ? "bg-red-50 border border-red-100" : "bg-white border border-slate-100"}`}>
            <div className="text-slate-400">{label}</div>
            <div className={`font-bold ${highlight ? "text-red-500" : "text-slate-600"}`}>−₹{value.toLocaleString("en-IN")}</div>
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
