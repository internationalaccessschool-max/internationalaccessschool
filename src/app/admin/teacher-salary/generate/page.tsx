"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { authFetch } from "@/lib/auth-fetch";
import Link from "next/link";
import toast from "react-hot-toast";
import {
    Loader2, ChevronLeft, PlusCircle, CheckCircle2, AlertCircle,
    Users, Calendar, Percent, ChevronDown
} from "lucide-react";

const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

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

    const yearOptions = useMemo(() => {
        const years: number[] = [];
        for (let y = now.getFullYear(); y >= 2024; y--) years.push(y);
        return years;
    }, []);

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
                        basicSalary: basic,
                        hra, da, otherAllowances: other,
                        gross: basic + hra + da + other,
                        pfPct: pfDefault,
                        esicPct: esicDefault,
                        selected: !already && basic + hra + da + other > 0,
                        alreadyGenerated: already,
                        staffType: "teacher" as const,
                    };
                });

                // Include non-teaching staff
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
                        basicSalary: basic,
                        hra, da, otherAllowances: other,
                        gross: basic + hra + da + other,
                        pfPct: pfDefault,
                        esicPct: esicDefault,
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

    // Apply default PF/ESIC to all (only if user changes)
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
        if (selectedTeachers.length === 0) {
            toast.error("Select at least one teacher");
            return;
        }
        setGenerating(true);
        setResult(null);
        try {
            const payload = {
                year: selectedYear,
                month: selectedMonth,
                teachers: selectedTeachers.map(t => ({
                    id: t.id,
                    name: t.name,
                    designation: t.designation,
                    basicSalary: t.basicSalary,
                    hra: t.hra,
                    da: t.da,
                    otherAllowances: t.otherAllowances,
                    pfPct: t.pfPct,
                    esicPct: t.esicPct,
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
            // Mark generated ones
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
        const gross = t.gross;
        const pf = Math.round((gross * t.pfPct) / 100);
        const esic = Math.round((gross * t.esicPct) / 100);
        return sum + (gross - pf - esic);
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
                    <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">Generate Teacher Salary</h1>
                    <p className="text-white/40 text-sm mt-1">Select teachers, configure PF / ESIC, and create salary records</p>
                </div>
            </div>

            {/* Period + Defaults */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                            <Percent className="w-3 h-3" /> Default PF % (on Gross)
                        </label>
                        <input type="number" min={0} max={100} value={pfDefault}
                            onChange={e => setPfDefault(Number(e.target.value) || 0)}
                            className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm" placeholder="e.g. 12" />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1">
                            <Percent className="w-3 h-3" /> Default ESIC % (on Gross)
                        </label>
                        <input type="number" min={0} max={100} value={esicDefault}
                            onChange={e => setEsicDefault(Number(e.target.value) || 0)}
                            className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm" placeholder="e.g. 0.75" />
                    </div>
                </div>
                <button onClick={applyDefaults}
                    className="text-xs px-3 py-1.5 rounded-lg bg-navy/5 text-navy font-semibold hover:bg-navy/10 transition-colors">
                    Apply Defaults to All Teachers Below
                </button>
            </div>

            {/* Teacher List */}
            {loading ? (
                <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-navy" /></div>
            ) : (
                <>
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="flex items-center gap-3 px-5 py-3 bg-gray-50 border-b border-gray-100">
                            <input type="checkbox"
                                checked={teachers.filter(t => !t.alreadyGenerated).every(t => t.selected) && teachers.some(t => !t.alreadyGenerated)}
                                onChange={e => toggleAll(e.target.checked)}
                                className="w-4 h-4 rounded border-gray-300 text-navy focus:ring-navy" />
                            <span className="text-xs font-semibold text-gray-500 flex-1">
                                Teacher — {selectedTeachers.length} selected
                            </span>
                        </div>
                        <div className="divide-y divide-gray-50">
                            {teachers.map(t => {
                                const pfAmt = Math.round((t.gross * t.pfPct) / 100);
                                const esicAmt = Math.round((t.gross * t.esicPct) / 100);
                                const netAmt = t.gross - pfAmt - esicAmt;
                                return (
                                    <div key={t.id} className={`px-5 py-4 hover:bg-gray-50/40 transition-colors ${t.alreadyGenerated ? "opacity-60" : ""}`}>
                                        <div className="flex flex-wrap md:flex-nowrap gap-3 md:gap-4 items-center">
                                            <input type="checkbox" disabled={t.alreadyGenerated} checked={t.selected}
                                                onChange={() => toggleSelect(t.id)}
                                                className="w-4 h-4 rounded border-gray-300 text-navy focus:ring-navy" />
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
                                            <div className="text-xs text-gray-500">
                                                <div>Gross: <span className="font-bold text-navy">₹{t.gross.toLocaleString("en-IN")}</span></div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <label className="text-xs text-gray-400">PF %</label>
                                                <input type="number" min={0} max={100} value={t.pfPct}
                                                    disabled={t.alreadyGenerated}
                                                    onChange={e => updateField(t.id, "pfPct", Number(e.target.value) || 0)}
                                                    className="w-16 px-2 py-1 border border-gray-200 rounded-lg text-xs" />
                                                <span className="text-xs text-red-500">-₹{pfAmt}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <label className="text-xs text-gray-400">ESIC %</label>
                                                <input type="number" min={0} max={100} step={0.01} value={t.esicPct}
                                                    disabled={t.alreadyGenerated}
                                                    onChange={e => updateField(t.id, "esicPct", Number(e.target.value) || 0)}
                                                    className="w-16 px-2 py-1 border border-gray-200 rounded-lg text-xs" />
                                                <span className="text-xs text-red-500">-₹{esicAmt}</span>
                                            </div>
                                            <div className="text-sm font-bold text-emerald-700 min-w-[90px] text-right">
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

                    {/* Sticky Summary + Generate */}
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
