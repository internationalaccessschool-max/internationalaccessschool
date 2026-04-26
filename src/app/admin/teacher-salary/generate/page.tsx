"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { authFetch } from "@/lib/auth-fetch";
import Link from "next/link";
import toast from "react-hot-toast";
import {
    Loader2, ChevronLeft, PlusCircle, CheckCircle2, AlertCircle,
    Users, Calendar, Percent, ChevronDown, Info
} from "lucide-react";

const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

function getDaysInMonth(year: number, month: number): number {
    return new Date(year, month, 0).getDate();
}

interface TeacherRow {
    id: string;
    name: string;
    email: string;
    designation: string;
    basicSalary: number;
    hra: number;
    da: number;
    otherAllowances: number;
    gross: number;
    pfPct: number;
    esicPct: number;
    selected: boolean;
    alreadyGenerated: boolean;
    staffType: "teacher" | "staff";
}

interface AttStat {
    present: number;
    absent: number;
    leave: number;
    late: number;
    halfDay: number;
}

export default function GenerateTeacherSalaryPage() {
    const now = new Date();
    const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
    const [loading, setLoading] = useState(true);
    const [teachers, setTeachers] = useState<TeacherRow[]>([]);
    const [pfDefault, setPfDefault] = useState<number>(0);
    const [esicDefault, setEsicDefault] = useState<number>(0);
    const [generating, setGenerating] = useState(false);
    const [result, setResult] = useState<{ created: number; skipped: number; failed: number } | null>(null);

    // Attendance data for the selected month
    const [attMap, setAttMap] = useState<Record<string, AttStat>>({});
    const [attDetectedDays, setAttDetectedDays] = useState(0);
    const [workingDays, setWorkingDays] = useState(0);
    const [attLoading, setAttLoading] = useState(false);

    const yearOptions = useMemo(() => {
        const years: number[] = [];
        for (let y = now.getFullYear(); y >= 2024; y--) years.push(y);
        return years;
    }, []);

    // Fetch teachers + salary records
    useEffect(() => {
        const fetchTeachers = async () => {
            setLoading(true);
            try {
                const [teacherSnap, recSnap] = await Promise.all([
                    getDocs(query(collection(db, "teachers"), orderBy("createdAt", "desc"))),
                    getDocs(collection(db, "teacherSalary", String(selectedYear), "months", String(selectedMonth), "records")),
                ]);

                const existingIds = new Set(recSnap.docs.map(d => (d.data() as any).teacherId));

                const teacherList: TeacherRow[] = teacherSnap.docs.map(d => {
                    const data = d.data() as any;
                    const basic = Number(data.basicSalary) || 0;
                    const hra = Number(data.hra) || 0;
                    const da = Number(data.da) || 0;
                    const other = Number(data.otherAllowances) || 0;
                    const already = existingIds.has(d.id);
                    return {
                        id: d.id,
                        name: `${data.firstName || ""} ${data.lastName || ""}`.trim() || data.name || "Unknown",
                        email: data.email || "",
                        designation: data.designation || "Teacher",
                        basicSalary: basic, hra, da, otherAllowances: other,
                        gross: basic + hra + da + other,
                        pfPct: data.pfPct != null ? Number(data.pfPct) : pfDefault,
                        esicPct: data.esicPct != null ? Number(data.esicPct) : esicDefault,
                        selected: !already && basic + hra + da + other > 0,
                        alreadyGenerated: already,
                        staffType: "teacher" as const,
                    };
                });

                const staffSnap = await getDocs(collection(db, "nonTeachingStaff"));
                const staffList: TeacherRow[] = staffSnap.docs.map(d => {
                    const data = d.data() as any;
                    const basic = Number(data.basicSalary) || 0;
                    const hra = Number(data.hra) || 0;
                    const da = Number(data.da) || 0;
                    const other = Number(data.otherAllowances) || 0;
                    const already = existingIds.has(d.id);
                    return {
                        id: d.id,
                        name: data.name || "Unknown",
                        email: "",
                        designation: data.designation || "Staff",
                        basicSalary: basic, hra, da, otherAllowances: other,
                        gross: basic + hra + da + other,
                        pfPct: data.pfPct != null ? Number(data.pfPct) : pfDefault,
                        esicPct: data.esicPct != null ? Number(data.esicPct) : esicDefault,
                        selected: !already && basic + hra + da + other > 0,
                        alreadyGenerated: already,
                        staffType: "staff" as const,
                    };
                });

                const list = [...teacherList, ...staffList];
                list.sort((a, b) => a.name.localeCompare(b.name));
                setTeachers(list);
            } catch (err) {
                console.error(err);
                toast.error("Failed to load teachers");
            } finally {
                setLoading(false);
            }
        };
        fetchTeachers();
    }, [selectedMonth, selectedYear]);

    // Reset working days when month/year changes
    useEffect(() => {
        setWorkingDays(getDaysInMonth(selectedYear, selectedMonth));
        setAttDetectedDays(0);
    }, [selectedMonth, selectedYear]);

    // Fetch attendance for selected month
    useEffect(() => {
        const fetchAtt = async () => {
            setAttLoading(true);
            const ymPrefix = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`;
            try {
                const snap = await getDocs(
                    collection(db, "teacherAttendance", String(selectedYear), "months", ymPrefix, "days")
                );
                const map: Record<string, AttStat> = {};
                let holidayCount = 0;
                snap.docs.forEach(d => {
                    const data = d.data() as any;
                    if (data.isHoliday) { holidayCount++; return; }
                    const records: Record<string, string> = data.records || {};
                    for (const [tid, status] of Object.entries(records)) {
                        if (!map[tid]) map[tid] = { present: 0, absent: 0, leave: 0, late: 0, halfDay: 0 };
                        if (status === "present") map[tid].present++;
                        else if (status === "late") { map[tid].present++; map[tid].late++; }
                        else if (status === "absent") map[tid].absent++;
                        else if (status === "leave") map[tid].leave++;
                        else if (status === "half_day") map[tid].halfDay++;
                    }
                });
                setAttMap(map);
                // Working days = total calendar days - holidays marked in attendance
                const totalCal = getDaysInMonth(selectedYear, selectedMonth);
                const calculatedWorkingDays = totalCal - holidayCount;
                setAttDetectedDays(holidayCount);
                setWorkingDays(calculatedWorkingDays > 0 ? calculatedWorkingDays : totalCal);
            } catch (e) {
                console.warn("Attendance fetch failed:", e);
                setAttMap({});
                setAttDetectedDays(0);
                setWorkingDays(getDaysInMonth(selectedYear, selectedMonth));
            } finally {
                setAttLoading(false);
            }
        };
        fetchAtt();
    }, [selectedMonth, selectedYear]);

    const applyDefaults = () => {
        setTeachers(prev => prev.map(t => ({ ...t, pfPct: pfDefault, esicPct: esicDefault })));
        toast.success("Defaults applied to all teachers");
    };

    const toggleSelect = (id: string) => {
        setTeachers(prev => prev.map(t => t.id === id && !t.alreadyGenerated ? { ...t, selected: !t.selected } : t));
    };

    const toggleAll = (checked: boolean) => {
        setTeachers(prev => prev.map(t => t.alreadyGenerated ? t : { ...t, selected: checked }));
    };

    const updateField = (id: string, field: "pfPct" | "esicPct", value: number) => {
        setTeachers(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
    };

    const selectedTeachers = teachers.filter(t => t.selected);

    const handleGenerate = async () => {
        if (selectedTeachers.length === 0) { toast.error("Select at least one teacher"); return; }
        setGenerating(true);
        setResult(null);
        try {
            const payload = {
                year: selectedYear,
                month: selectedMonth,
                workingDays,
                teachers: selectedTeachers.map(t => ({
                    id: t.id, name: t.name, designation: t.designation,
                    basicSalary: t.basicSalary, hra: t.hra, da: t.da,
                    otherAllowances: t.otherAllowances, pfPct: t.pfPct, esicPct: t.esicPct,
                })),
            };
            const res = await authFetch("/api/admin/teacher-salary/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Generation failed");
            setResult(data);
            toast.success(`Generated ${data.created} salaries`);
            const newlyGenerated = new Set(selectedTeachers.map(t => t.id));
            setTeachers(prev => prev.map(t => newlyGenerated.has(t.id) ? { ...t, alreadyGenerated: true, selected: false } : t));
        } catch (err: any) {
            console.error(err);
            toast.error(err.message || "Failed to generate");
        } finally {
            setGenerating(false);
        }
    };

    const totalPayout = selectedTeachers.reduce((sum, t) => {
        const att = attMap[t.id] || { present: 0, absent: 0, leave: 0, late: 0, halfDay: 0 };
        const pf = Math.round((t.gross * t.pfPct) / 100);
        const esic = Math.round((t.gross * t.esicPct) / 100);
        const perDay = workingDays > 0 ? t.gross / workingDays : 0;
        const effective = att.absent + Math.floor(att.late / 3);
        const absentCut = Math.round(Math.floor(effective / 3) * perDay);
        const halfDayCut = Math.round((att.halfDay || 0) * 0.5 * perDay);
        return sum + (t.gross - pf - esic - absentCut - halfDayCut);
    }, 0);

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <Link href="/admin/teacher-salary" className="text-navy hover:text-navy-light flex items-center gap-1 text-sm">
                    <ChevronLeft className="w-4 h-4" /> Back
                </Link>
            </div>

            <div className="rounded-2xl bg-gradient-to-br from-navy to-navy-light p-6 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10"
                    style={{ backgroundImage: "radial-gradient(circle at 80% 50%, rgba(200,169,81,0.4) 0%, transparent 60%)" }} />
                <div className="relative z-10">
                    <p className="text-white/50 text-sm font-medium">Admin Finance</p>
                    <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">Generate Staff Salary</h1>
                    <p className="text-white/40 text-sm mt-1">3 late = 1 absent · 3 absents = 1 day deduction</p>
                </div>
            </div>

            {/* Period + Defaults */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> Month
                        </label>
                        <div className="relative">
                            <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))}
                                className="w-full px-4 py-2 pr-8 border border-gray-200 rounded-xl text-sm appearance-none bg-white">
                                {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                            </select>
                            <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> Year
                        </label>
                        <div className="relative">
                            <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}
                                className="w-full px-4 py-2 pr-8 border border-gray-200 rounded-xl text-sm appearance-none bg-white">
                                {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                            <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1">
                            <Percent className="w-3 h-3" /> Default PF %
                        </label>
                        <input type="number" min={0} max={100} value={pfDefault}
                            onChange={e => setPfDefault(Number(e.target.value) || 0)}
                            className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm" placeholder="e.g. 12" />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1">
                            <Percent className="w-3 h-3" /> Default ESIC %
                        </label>
                        <input type="number" min={0} max={100} value={esicDefault}
                            onChange={e => setEsicDefault(Number(e.target.value) || 0)}
                            className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm" placeholder="e.g. 0.75" />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> Working Days
                        </label>
                        <input type="number" min={1} max={31} value={workingDays}
                            onChange={e => setWorkingDays(Number(e.target.value) || 1)}
                            className="w-full px-4 py-2 border-2 border-indigo-300 rounded-xl text-sm font-bold text-indigo-700 focus:border-indigo-500 focus:outline-none" />
                        <p className="text-[10px] text-gray-400 mt-1">
                            Auto: {getDaysInMonth(selectedYear, selectedMonth)} calendar days {attDetectedDays > 0 ? `− ${attDetectedDays} holiday = ${workingDays}` : ""} · Edit if needed
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    <button onClick={applyDefaults}
                        className="text-xs px-3 py-1.5 rounded-lg bg-navy/5 text-navy font-semibold hover:bg-navy/10 transition-colors">
                        Apply Defaults to All
                    </button>
                    <span className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 px-3 py-1.5 rounded-lg">
                        <Info className="w-3 h-3" />
                        {getDaysInMonth(selectedYear, selectedMonth)} calendar days
                        {attDetectedDays > 0 && <span className="text-red-500 ml-1">− {attDetectedDays} holiday{attDetectedDays > 1 ? "s" : ""}</span>}
                        <span className="font-semibold text-indigo-600 ml-1">= {workingDays} working days</span>
                        <span className="ml-2 text-gray-400">· Per day = Gross ÷ {workingDays}</span>
                    </span>
                    {attLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
                </div>
            </div>

            {/* Teacher List */}
            {loading ? (
                <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-navy" /></div>
            ) : (
                <>
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        {/* Header */}
                        <div className="flex items-center gap-3 px-5 py-3 bg-gray-50 border-b border-gray-100">
                            <input type="checkbox"
                                checked={teachers.filter(t => !t.alreadyGenerated).every(t => t.selected) && teachers.some(t => !t.alreadyGenerated)}
                                onChange={e => toggleAll(e.target.checked)}
                                className="w-4 h-4 rounded border-gray-300 text-navy focus:ring-navy" />
                            <span className="text-xs font-semibold text-gray-500 flex-1">
                                Teacher / Staff — {selectedTeachers.length} selected
                            </span>
                            <span className="hidden md:flex gap-6 text-xs font-semibold text-gray-400 pr-2">
                                <span className="w-24 text-center">Per Day</span>
                                <span className="w-36 text-center">Attendance (P / A / L)</span>
                                <span className="w-24 text-center">Absent Cut</span>
                                <span className="w-20 text-right">Net Salary</span>
                            </span>
                        </div>

                        <div className="divide-y divide-gray-50">
                            {teachers.map(t => {
                                const att = attMap[t.id] || { present: 0, absent: 0, leave: 0, late: 0, halfDay: 0 };
                                const perDay = workingDays > 0 ? t.gross / workingDays : 0;
                                const lateToAbsent = Math.floor(att.late / 3);
                                const effectiveAbsents = att.absent + lateToAbsent;
                                const deductDays = Math.floor(effectiveAbsents / 3);
                                const absentCut = Math.round(deductDays * perDay);
                                const halfDayCut = Math.round((att.halfDay || 0) * 0.5 * perDay);
                                const pfAmt = Math.round((t.gross * t.pfPct) / 100);
                                const esicAmt = Math.round((t.gross * t.esicPct) / 100);
                                const netAmt = t.gross - pfAmt - esicAmt - absentCut - halfDayCut;

                                return (
                                    <div key={t.id} className={`px-5 py-4 hover:bg-gray-50/40 transition-colors ${t.alreadyGenerated ? "opacity-60" : ""}`}>
                                        <div className="flex flex-wrap md:flex-nowrap gap-3 md:gap-4 items-center">
                                            <input type="checkbox" disabled={t.alreadyGenerated} checked={t.selected}
                                                onChange={() => toggleSelect(t.id)}
                                                className="w-4 h-4 rounded border-gray-300 text-navy focus:ring-navy shrink-0" />

                                            {/* Name */}
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5">
                                                    <p className="text-sm font-semibold text-navy truncate">{t.name}</p>
                                                    {t.staffType === "staff" && (
                                                        <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-700">Staff</span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-gray-400 truncate">{t.designation}{t.email ? ` · ${t.email}` : ""}</p>
                                                {t.alreadyGenerated && (
                                                    <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold text-emerald-700">
                                                        <CheckCircle2 className="w-3 h-3" /> Already generated
                                                    </span>
                                                )}
                                                {t.gross === 0 && (
                                                    <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold text-red-600">
                                                        <AlertCircle className="w-3 h-3" /> No salary configured
                                                    </span>
                                                )}
                                            </div>

                                            {/* Gross */}
                                            <div className="text-xs text-gray-500 shrink-0">
                                                <div>Gross</div>
                                                <div className="font-bold text-navy text-sm">₹{t.gross.toLocaleString("en-IN")}</div>
                                            </div>

                                            {/* Per Day */}
                                            <div className="hidden md:block text-xs text-center shrink-0 w-24">
                                                <div className="text-gray-400">Per Day</div>
                                                <div className="font-bold text-indigo-600">
                                                    {workingDays > 0 ? `₹${Math.round(perDay).toLocaleString("en-IN")}` : "—"}
                                                </div>
                                            </div>

                                            {/* Attendance */}
                                            <div className="hidden md:flex items-center gap-2 text-xs shrink-0 w-44 justify-center">
                                                {attLoading ? (
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-300" />
                                                ) : (
                                                    <>
                                                        <span className="flex flex-col items-center">
                                                            <span className="text-gray-400">Present</span>
                                                            <span className="font-bold text-emerald-600">{att.present}</span>
                                                        </span>
                                                        <span className="text-gray-200">·</span>
                                                        <span className="flex flex-col items-center">
                                                            <span className="text-gray-400">Late</span>
                                                            <span className="font-bold text-amber-500">{att.late}</span>
                                                        </span>
                                                        <span className="text-gray-200">·</span>
                                                        <span className="flex flex-col items-center">
                                                            <span className="text-gray-400">Absent</span>
                                                            <span className="font-bold text-red-500">{att.absent}</span>
                                                        </span>
                                                        <span className="text-gray-200">·</span>
                                                        <span className="flex flex-col items-center">
                                                            <span className="text-gray-400">CL</span>
                                                            <span className="font-bold text-blue-500">{att.leave}</span>
                                                        </span>
                                                        {att.halfDay > 0 && (
                                                            <>
                                                                <span className="text-gray-200">·</span>
                                                                <span className="flex flex-col items-center">
                                                                    <span className="text-gray-400">½ Day</span>
                                                                    <span className="font-bold text-purple-500">{att.halfDay}</span>
                                                                </span>
                                                            </>
                                                        )}
                                                    </>
                                                )}
                                            </div>

                                            {/* Absent Cut */}
                                            <div className="hidden md:block text-xs text-center shrink-0 w-28">
                                                <div className="text-gray-400">Cut</div>
                                                {deductDays > 0 || halfDayCut > 0 ? (
                                                    <div className="font-bold text-red-500">
                                                        {deductDays > 0 && <span>{deductDays} day{deductDays > 1 ? "s" : ""}</span>}
                                                        {lateToAbsent > 0 && <span className="block text-[10px] text-amber-500">(+{lateToAbsent} from late)</span>}
                                                        {halfDayCut > 0 && <span className="block text-[10px] text-purple-500">½ day ×{att.halfDay}</span>}
                                                        <span className="text-[10px]">-₹{(absentCut + halfDayCut).toLocaleString("en-IN")}</span>
                                                    </div>
                                                ) : (
                                                    <div className="text-gray-300">None</div>
                                                )}
                                            </div>

                                            {/* PF / ESIC inputs */}
                                            <div className="flex items-center gap-2 shrink-0">
                                                <label className="text-xs text-gray-400">PF %</label>
                                                <input type="number" min={0} max={100} value={t.pfPct}
                                                    disabled={t.alreadyGenerated}
                                                    onChange={e => updateField(t.id, "pfPct", Number(e.target.value) || 0)}
                                                    className="w-14 px-2 py-1 border border-gray-200 rounded-lg text-xs" />
                                                <span className="text-xs text-red-400">-₹{pfAmt}</span>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <label className="text-xs text-gray-400">ESIC %</label>
                                                <input type="number" min={0} max={100} step={0.01} value={t.esicPct}
                                                    disabled={t.alreadyGenerated}
                                                    onChange={e => updateField(t.id, "esicPct", Number(e.target.value) || 0)}
                                                    className="w-14 px-2 py-1 border border-gray-200 rounded-lg text-xs" />
                                                <span className="text-xs text-red-400">-₹{esicAmt}</span>
                                            </div>

                                            {/* Net */}
                                            <div className="text-sm font-bold text-emerald-700 min-w-[90px] text-right shrink-0">
                                                ₹{netAmt.toLocaleString("en-IN")}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {result && (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-3">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                            <div className="text-sm">
                                <p className="font-semibold text-emerald-800">Generation complete!</p>
                                <p className="text-emerald-700">Created: {result.created} · Skipped: {result.skipped} · Failed: {result.failed}</p>
                            </div>
                        </div>
                    )}

                    {selectedTeachers.length > 0 && (
                        <div className="sticky bottom-4 z-20 bg-white rounded-2xl shadow-xl border border-gray-200 p-4 flex flex-wrap items-center gap-3 justify-between">
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <Users className="w-5 h-5 text-navy" />
                                    <div>
                                        <p className="text-xs text-gray-400">Selected</p>
                                        <p className="text-sm font-bold text-navy">{selectedTeachers.length} teachers</p>
                                    </div>
                                </div>
                                <div className="h-8 w-px bg-gray-200" />
                                <div>
                                    <p className="text-xs text-gray-400">Total Net Payout</p>
                                    <p className="text-lg font-bold text-emerald-700">₹{totalPayout.toLocaleString("en-IN")}</p>
                                </div>
                                {workingDays > 0 && (
                                    <>
                                        <div className="h-8 w-px bg-gray-200" />
                                        <div>
                                            <p className="text-xs text-gray-400">Working Days</p>
                                            <p className="text-sm font-bold text-indigo-600">{workingDays}</p>
                                        </div>
                                    </>
                                )}
                            </div>
                            <button onClick={handleGenerate} disabled={generating}
                                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gold text-navy font-bold text-sm hover:bg-gold-light transition-colors shadow-md disabled:opacity-60">
                                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlusCircle className="w-4 h-4" />}
                                Generate Salaries
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
