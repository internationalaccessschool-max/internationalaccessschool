"use client";

import { useState, useEffect, useCallback } from "react";
import {
    doc, getDoc, setDoc, getDocs, collection, query, orderBy, serverTimestamp
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Loader2, Save, AlertTriangle, Clock, CheckCircle2, RefreshCw, Printer } from "lucide-react";
import toast from "react-hot-toast";
import { TIMETABLE_DAYS as DAYS, TIMETABLE_PERIODS } from "@/lib/timetable-config";

const CLASS_LIST = ["NUR", "LKG", "UKG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
const SECTIONS = ["A", "B", "C", "D", "E"];

interface Slot { subjectId: string; subjectName: string; teacherId: string; teacherName: string; }
type TimetableSlots = Record<string, Slot>; // key: "Monday-1"
interface Teacher { id: string; firstName: string; lastName: string; }
interface Subject { id: string; name: string; }
interface ConflictInfo { cls: string; section: string; day: string; period: number; }

export default function AdminTimetablePage() {
    const [cls, setCls] = useState("1");
    const [section, setSection] = useState("A");
    const [slots, setSlots] = useState<TimetableSlots>({});
    const [allTimetables, setAllTimetables] = useState<Record<string, TimetableSlots>>({});
    const [teachers, setTeachers] = useState<Teacher[]>([]);
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);

    // Load teachers once
    useEffect(() => {
        getDocs(query(collection(db, "teachers"), orderBy("firstName"))).then(snap => {
            setTeachers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Teacher)));
        });
    }, []);

    // Load all timetables for conflict detection
    const loadAllTimetables = useCallback(async () => {
        const snap = await getDocs(collection(db, "timetable"));
        const map: Record<string, TimetableSlots> = {};
        snap.docs.forEach(d => { map[d.id] = (d.data().slots || {}) as TimetableSlots; });
        setAllTimetables(map);
    }, []);

    useEffect(() => { loadAllTimetables(); }, [loadAllTimetables]);

    // Load subjects for selected class
    useEffect(() => {
        const loadSubjects = async () => {
            try {
                const snap = await getDoc(doc(db, "classSubjects", cls));
                if (snap.exists()) {
                    setSubjects((snap.data().subjects as Subject[]) || []);
                } else {
                    setSubjects([]);
                }
            } catch { setSubjects([]); }
        };
        loadSubjects();
    }, [cls]);

    // Load timetable for selected class-section
    useEffect(() => {
        const key = `${cls}-${section}`;
        const loadTimetable = async () => {
            setLoading(true);
            try {
                const snap = await getDoc(doc(db, "timetable", key));
                setSlots(snap.exists() ? (snap.data().slots || {}) : {});
                setDirty(false);
            } catch { setSlots({}); }
            finally { setLoading(false); }
        };
        loadTimetable();
    }, [cls, section]);

    const getSlot = (day: string, period: number): Slot =>
        slots[`${day}-${period}`] || { subjectId: "", subjectName: "", teacherId: "", teacherName: "" };

    const updateSlot = (day: string, period: number, field: keyof Slot, value: string) => {
        const key = `${day}-${period}`;
        const current = getSlot(day, period);
        let updated = { ...current, [field]: value };

        if (field === "subjectId") {
            const sub = subjects.find(s => s.id === value);
            updated = { ...updated, subjectName: sub?.name || value };
        }
        if (field === "teacherId") {
            const t = teachers.find(t => t.id === value);
            updated = { ...updated, teacherName: t ? `${t.firstName} ${t.lastName}` : "" };
        }

        setSlots(prev => ({ ...prev, [key]: updated }));
        setDirty(true);
    };

    // Check if a teacher is already assigned in the same period in another class
    const getConflict = (day: string, period: number, teacherId: string): ConflictInfo | null => {
        if (!teacherId) return null;
        const currentKey = `${cls}-${section}`;
        const slotKey = `${day}-${period}`;
        for (const [ttKey, ttSlots] of Object.entries(allTimetables)) {
            if (ttKey === currentKey) continue;
            const slot = ttSlots[slotKey];
            if (slot?.teacherId === teacherId) {
                const [ttCls, ttSection] = ttKey.split("-");
                return { cls: ttCls, section: ttSection, day, period };
            }
        }
        return null;
    };

    const handleSave = async () => {
        setSaving(true);
        const key = `${cls}-${section}`;
        try {
            // Clean empty slots before saving
            const cleanSlots: TimetableSlots = {};
            Object.entries(slots).forEach(([k, v]) => {
                if (v.subjectId || v.teacherId) cleanSlots[k] = v;
            });
            await setDoc(doc(db, "timetable", key), {
                cls, section, slots: cleanSlots, updatedAt: serverTimestamp()
            });
            setAllTimetables(prev => ({ ...prev, [key]: cleanSlots }));
            setDirty(false);
            toast.success(`Class ${cls}-${section} timetable saved!`);
        } catch (err: any) {
            toast.error(err.message || "Save failed");
        } finally { setSaving(false); }
    };

    const filledCount = Object.values(slots).filter(s => s.subjectId || s.teacherId).length;
    const totalSlots = DAYS.length * TIMETABLE_PERIODS.filter(p => !p.isBreak).length;

    return (
        <div className="space-y-6 print:m-0 print:p-0">
            {/* Header */}
            <div className="rounded-2xl gradient-navy p-6 md:p-8 relative overflow-hidden print:hidden">
                <div className="absolute inset-0 opacity-10"
                    style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.2) 0%, transparent 50%)` }} />
                <div className="relative z-10">
                    <p className="text-white/50 text-sm font-medium">Admin Console</p>
                    <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">Manage Timetable</h1>
                    <p className="text-white/40 text-sm mt-1">
                        Har class-section ke liye Mon–Sat, Period 1–8 schedule set karo.
                    </p>
                </div>
            </div>

            {/* Class + Section selector */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 print:hidden">
                <div className="flex flex-wrap gap-4 items-end">
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5">Class</label>
                        <select value={cls} onChange={e => { setCls(e.target.value); setSection("A"); }}
                            className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold focus:border-navy outline-none bg-white min-w-[100px]">
                            {CLASS_LIST.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5">Section</label>
                        <select value={section} onChange={e => setSection(e.target.value)}
                            className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold focus:border-navy outline-none bg-white min-w-[80px]">
                            {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                    <div className="flex items-center gap-3 ml-auto">
                        <span className="text-xs text-gray-400">
                            <span className="font-bold text-navy">{filledCount}</span>/{totalSlots} slots filled
                        </span>
                        {dirty && (
                            <button onClick={handleSave} disabled={saving}
                                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-navy text-white text-sm font-semibold hover:bg-opacity-90 transition-colors disabled:opacity-60">
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                {saving ? "Saving..." : "Save Timetable"}
                            </button>
                        )}
                        <button onClick={() => window.print()} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 transition-colors">
                            <Printer className="w-4 h-4" /> Print
                        </button>
                    </div>
                </div>
            </div>

            {/* Timetable Grid */}
            {loading ? (
                <div className="flex justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-navy" />
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm" style={{ minWidth: "900px" }}>
                            <thead>
                                <tr className="bg-navy text-white">
                                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide w-24">Period</th>
                                    {DAYS.map(day => (
                                        <th key={day} className="px-3 py-3 text-center text-xs font-bold uppercase tracking-wide">
                                            {day.slice(0, 3)}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {TIMETABLE_PERIODS.map((timing, idx) => {
                                    if (timing.isBreak) {
                                        return (
                                            <tr key={`break-${idx}`} className="bg-amber-50">
                                                <td colSpan={DAYS.length + 1} className="px-4 py-3 text-center border-y border-amber-200/60">
                                                    <span className="font-bold text-amber-700 uppercase tracking-[0.2em] text-xs">
                                                        {timing.label || "BREAK"} <span className="opacity-70 ml-2">({timing.start} - {timing.end})</span>
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    }
                                    const period = timing.period;
                                    return (
                                    <tr key={period} className="border-t border-gray-100 hover:bg-gray-50/30">
                                        <td className="px-4 py-3 align-middle border-r border-gray-100 bg-gray-50/50">
                                            <div className="flex flex-col items-center justify-center text-center">
                                                <div className="w-9 h-9 mb-1.5 rounded-xl bg-navy flex items-center justify-center shadow-sm">
                                                    <span className="text-xs font-bold text-white">P{period}</span>
                                                </div>
                                                <div className="text-[10px] font-bold text-gray-500 leading-tight">
                                                    {timing.start}<br/><span className="opacity-50">-</span><br/>{timing.end}
                                                </div>
                                            </div>
                                        </td>
                                        {DAYS.map(day => {
                                            const slot = getSlot(day, period);
                                            const conflict = slot.teacherId ? getConflict(day, period, slot.teacherId) : null;
                                            return (
                                                <td key={day} className="px-2 py-2">
                                                    <div className={`rounded-xl border p-2 space-y-1.5 min-w-[130px] transition-colors ${conflict ? "border-amber-300 bg-amber-50/60" : slot.subjectId ? "border-emerald-200 bg-emerald-50/40" : "border-gray-200 bg-white"}`}>
                                                        {/* Subject */}
                                                        <select
                                                            value={slot.subjectId}
                                                            onChange={e => updateSlot(day, period, "subjectId", e.target.value)}
                                                            className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold bg-white outline-none focus:border-navy truncate"
                                                        >
                                                            <option value="">— Subject —</option>
                                                            {subjects.map(s => (
                                                                <option key={s.id} value={s.id}>{s.name}</option>
                                                            ))}
                                                        </select>
                                                        {/* Teacher */}
                                                        <select
                                                            value={slot.teacherId}
                                                            onChange={e => updateSlot(day, period, "teacherId", e.target.value)}
                                                            className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-xs bg-white outline-none focus:border-navy truncate"
                                                        >
                                                            <option value="">— Teacher —</option>
                                                            {teachers.map(t => (
                                                                <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>
                                                            ))}
                                                        </select>
                                                        {/* Conflict warning */}
                                                        {conflict && (
                                                            <div className="flex items-center gap-1 text-[10px] text-amber-700 font-semibold mt-1">
                                                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                                                Busy: {conflict.cls}-{conflict.section}
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                )})}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Sticky save bar */}
            {dirty && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
                    <div className="flex items-center gap-4 bg-navy text-white px-6 py-3.5 rounded-2xl shadow-2xl border border-white/10">
                        <Clock className="w-4 h-4 text-amber-300" />
                        <span className="text-sm font-semibold">Unsaved timetable changes</span>
                        <button onClick={handleSave} disabled={saving}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-navy text-sm font-bold hover:bg-gray-100 transition-colors disabled:opacity-60">
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            {saving ? "Saving..." : "Save"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
