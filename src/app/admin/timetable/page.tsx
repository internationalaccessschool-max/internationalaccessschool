"use client";

import { useState, useEffect, useCallback } from "react";
import {
    doc, getDoc, setDoc, getDocs, collection, query, orderBy, serverTimestamp
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Loader2, Save, AlertTriangle, Clock, Settings, X, Plus, Trash2, Printer, ChevronUp, ChevronDown } from "lucide-react";
import toast from "react-hot-toast";
import { TIMETABLE_DAYS as DAYS, TIMETABLE_PERIODS, PeriodTiming } from "@/lib/timetable-config";

const CLASS_LIST = ["NUR", "LKG", "UKG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
const SECTIONS = ["A", "B", "C", "D", "E"];

interface Slot { subjectId: string; subjectName: string; teacherId: string; teacherName: string; }
type TimetableSlots = Record<string, Slot>;
interface Teacher { id: string; firstName: string; lastName: string; }
interface Subject { id: string; name: string; }
interface ConflictInfo { cls: string; section: string; day: string; period: number; }

function to24h(time12: string): string {
    if (!time12) return "08:00";
    const match = time12.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!match) return "08:00";
    let h = parseInt(match[1]);
    const m = parseInt(match[2]);
    const p = match[3].toUpperCase();
    if (p === "AM" && h === 12) h = 0;
    if (p === "PM" && h !== 12) h += 12;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function to12h(time24: string): string {
    if (!time24) return "08:00 AM";
    const [hStr, mStr] = time24.split(":");
    const h = parseInt(hStr);
    const m = parseInt(mStr) || 0;
    const p = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${p}`;
}

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
    const [periods, setPeriods] = useState<PeriodTiming[]>(TIMETABLE_PERIODS);
    const [showConfig, setShowConfig] = useState(false);
    const [configDraft, setConfigDraft] = useState<PeriodTiming[]>(TIMETABLE_PERIODS);

    useEffect(() => {
        getDocs(query(collection(db, "teachers"), orderBy("firstName"))).then(snap => {
            setTeachers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Teacher)));
        });
    }, []);

    // Load period config from Firestore (falls back to hardcoded default)
    useEffect(() => {
        getDoc(doc(db, "timetableConfig", "schedule")).then(snap => {
            if (snap.exists() && snap.data().periods?.length) {
                const p = snap.data().periods as PeriodTiming[];
                setPeriods(p);
                setConfigDraft(p);
            }
        });
    }, []);

    const loadAllTimetables = useCallback(async () => {
        const snap = await getDocs(collection(db, "timetable"));
        const map: Record<string, TimetableSlots> = {};
        snap.docs.forEach(d => { map[d.id] = (d.data().slots || {}) as TimetableSlots; });
        setAllTimetables(map);
    }, []);

    useEffect(() => { loadAllTimetables(); }, [loadAllTimetables]);

    useEffect(() => {
        const loadSubjects = async () => {
            try {
                const snap = await getDoc(doc(db, "classSubjects", cls));
                setSubjects(snap.exists() ? (snap.data().subjects as Subject[]) || [] : []);
            } catch { setSubjects([]); }
        };
        loadSubjects();
    }, [cls]);

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
            let conflictMsg = "";
            let hasConflict = false;
            for (const day of DAYS) {
                for (const timing of periods) {
                    if (timing.isBreak) continue;
                    const slot = getSlot(day, timing.period);
                    if (slot.teacherId) {
                        const conflict = getConflict(day, timing.period, slot.teacherId);
                        if (conflict) {
                            hasConflict = true;
                            conflictMsg = `Cannot save! Teacher ${slot.teacherName} is busy in Class ${conflict.cls}-${conflict.section} on ${day} Period ${timing.period}.`;
                            break;
                        }
                    }
                }
                if (hasConflict) break;
            }
            if (hasConflict) {
                toast.error(conflictMsg, { duration: 5000 });
                setSaving(false);
                return;
            }
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

    const updateDraft = (i: number, field: string, value: any) =>
        setConfigDraft(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item));

    const removeDraft = (i: number) =>
        setConfigDraft(prev => prev.filter((_, idx) => idx !== i));

    const moveDraft = (i: number, dir: -1 | 1) => {
        const j = i + dir;
        setConfigDraft(prev => {
            if (j < 0 || j >= prev.length) return prev;
            const next = [...prev];
            [next[i], next[j]] = [next[j], next[i]];
            return next;
        });
    };

    const addPeriod = () => {
        const nonBreaks = configDraft.filter(p => !p.isBreak);
        const nextNum = nonBreaks.length > 0 ? Math.max(...nonBreaks.map(p => p.period)) + 1 : 1;
        const last = configDraft[configDraft.length - 1];
        setConfigDraft(prev => [...prev, { period: nextNum, start: last?.end || "08:00 AM", end: "08:40 AM" }]);
    };

    const addBreak = () => {
        const last = configDraft[configDraft.length - 1];
        setConfigDraft(prev => [...prev, { period: -1, start: last?.end || "10:40 AM", end: "11:10 AM", isBreak: true, label: "BREAK" }]);
    };

    const handleSaveConfig = async () => {
        setSaving(true);
        try {
            let pNum = 1;
            const numbered = configDraft.map(item =>
                item.isBreak ? item : { ...item, period: pNum++ }
            );
            await setDoc(doc(db, "timetableConfig", "schedule"), { periods: numbered });
            setPeriods(numbered);
            setConfigDraft(numbered);
            setShowConfig(false);
            toast.success("Bell schedule saved!");
        } catch (e: any) {
            toast.error(e.message || "Save failed");
        } finally { setSaving(false); }
    };

    const filledCount = Object.values(slots).filter(s => s.subjectId || s.teacherId).length;
    const totalSlots = DAYS.length * periods.filter(p => !p.isBreak).length;

    const handlePrint = () => {
        const logoUrl = `${window.location.origin}/LOGO.png`;
        const dayHeaders = DAYS.map(d => `<th style="padding:6px 8px;text-align:center;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#fff;background:#0f2044;border:1px solid #1e3a6e">${d.slice(0,3)}</th>`).join("");

        const rows = periods.map(timing => {
            if (timing.isBreak) {
                return `<tr><td colspan="${DAYS.length + 1}" style="padding:6px;text-align:center;background:#fef3c7;border:1px solid #fcd34d;font-size:10px;font-weight:700;color:#92400e;letter-spacing:2px;text-transform:uppercase">${timing.label || "BREAK"} &nbsp;(${timing.start} – ${timing.end})</td></tr>`;
            }
            const period = timing.period!;
            const cells = DAYS.map(day => {
                const slot = getSlot(day, period);
                const hasData = slot.subjectName || slot.teacherName;
                return `<td style="padding:4px 6px;border:1px solid #e5e7eb;vertical-align:middle;min-width:90px;background:${hasData ? "#f0fdf4" : "#fff"}">
                    <div style="font-size:11px;font-weight:700;color:#0f2044;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${slot.subjectName || "<span style='color:#d1d5db'>—</span>"}</div>
                    <div style="font-size:9px;color:#6b7280;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${slot.teacherName || ""}</div>
                </td>`;
            }).join("");
            return `<tr>
                <td style="padding:6px 8px;border:1px solid #e5e7eb;background:#f8fafc;text-align:center;white-space:nowrap">
                    <div style="font-size:11px;font-weight:700;color:#0f2044;background:#0f2044;color:#fff;border-radius:6px;padding:2px 6px;display:inline-block;margin-bottom:3px">P${period}</div>
                    <div style="font-size:9px;color:#6b7280">${timing.start}</div>
                    <div style="font-size:9px;color:#6b7280">${timing.end}</div>
                </td>
                ${cells}
            </tr>`;
        }).join("");

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Timetable – Class ${cls} ${section}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,Helvetica,sans-serif;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  @page{size:A4 landscape;margin:8mm}
  table{border-collapse:collapse;width:100%}
</style>
</head>
<body>
<div style="padding:8px">
  <!-- Header -->
  <table style="width:100%;margin-bottom:8px;border-collapse:collapse">
    <tr>
      <td style="width:60px;vertical-align:middle;padding-right:10px">
        <img src="${logoUrl}" style="width:56px;height:56px;object-fit:contain"/>
      </td>
      <td style="vertical-align:middle">
        <div style="font-size:16px;font-weight:700;color:#0f2044;letter-spacing:0.5px">INTERNATIONAL ACCESS SCHOOL</div>
        <div style="font-size:9px;color:#666;margin-top:2px">Barhan, Siwan, Bihar – 841227 | Ph: +91-9934776670 | Email: info@iaschool.edu.in</div>
      </td>
      <td style="text-align:right;vertical-align:middle">
        <div style="display:inline-block;background:#0f2044;color:#c8a951;padding:6px 14px;border-radius:8px;font-size:13px;font-weight:700">CLASS TIMETABLE</div>
        <div style="font-size:12px;font-weight:700;color:#0f2044;margin-top:4px">Class ${cls} – Section ${section}</div>
      </td>
    </tr>
  </table>
  <hr style="border:1px solid #0f2044;margin-bottom:8px"/>
  <!-- Timetable -->
  <table>
    <thead>
      <tr>
        <th style="padding:6px 8px;text-align:center;font-size:11px;font-weight:700;color:#fff;background:#0f2044;border:1px solid #1e3a6e;width:72px">PERIOD</th>
        ${dayHeaders}
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div style="text-align:right;font-size:9px;color:#aaa;margin-top:6px">Printed on ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</div>
</div>
</body>
</html>`;

        const win = window.open("", "_blank", "width=1000,height=700");
        if (!win) { toast.error("Pop-up blocked — allow pop-ups."); return; }
        win.document.open();
        win.document.write(html);
        win.document.close();
        win.onload = () => { win.focus(); win.print(); };
        setTimeout(() => { try { win.focus(); win.print(); } catch { } }, 800);
    };

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
                        Har class-section ke liye {DAYS[0]}–{DAYS[DAYS.length - 1]}, {periods.filter(p => !p.isBreak).length} periods schedule set karo.
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
                        <button onClick={() => { setConfigDraft([...periods]); setShowConfig(true); }}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 transition-colors">
                            <Settings className="w-4 h-4" /> Schedule
                        </button>
                        {dirty && (
                            <button onClick={handleSave} disabled={saving}
                                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-navy text-white text-sm font-semibold hover:bg-opacity-90 transition-colors disabled:opacity-60">
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                {saving ? "Saving..." : "Save Timetable"}
                            </button>
                        )}
                        <button onClick={handlePrint} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 transition-colors">
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
                                {periods.map((timing, idx) => {
                                    if (timing.isBreak) {
                                        return (
                                            <tr key={`break-${idx}`} className="bg-amber-50">
                                                <td colSpan={DAYS.length + 1} className="px-4 py-3 text-center border-y border-amber-200/60">
                                                    <span className="font-bold text-amber-700 uppercase tracking-[0.2em] text-xs">
                                                        {timing.label || "BREAK"} <span className="opacity-70 ml-2">({timing.start} – {timing.end})</span>
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
                                                        {timing.start}<br /><span className="opacity-50">-</span><br />{timing.end}
                                                    </div>
                                                </div>
                                            </td>
                                            {DAYS.map(day => {
                                                const slot = getSlot(day, period);
                                                const conflict = slot.teacherId ? getConflict(day, period, slot.teacherId) : null;
                                                return (
                                                    <td key={day} className="px-2 py-2">
                                                        <div className={`rounded-xl border p-2 space-y-1.5 min-w-[130px] transition-colors ${conflict ? "border-amber-300 bg-amber-50/60" : slot.subjectId ? "border-emerald-200 bg-emerald-50/40" : "border-gray-200 bg-white"}`}>
                                                            <select value={slot.subjectId} onChange={e => updateSlot(day, period, "subjectId", e.target.value)}
                                                                className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold bg-white outline-none focus:border-navy truncate">
                                                                <option value="">— Subject —</option>
                                                                {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                                            </select>
                                                            <select value={slot.teacherId} onChange={e => updateSlot(day, period, "teacherId", e.target.value)}
                                                                className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-xs bg-white outline-none focus:border-navy truncate">
                                                                <option value="">— Teacher —</option>
                                                                {teachers.map(t => <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>)}
                                                            </select>
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
                                    );
                                })}
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

            {/* Configure Bell Schedule Modal */}
            {showConfig && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                            <div>
                                <h2 className="font-bold text-navy">Configure Bell Schedule</h2>
                                <p className="text-xs text-gray-400 mt-0.5">Period timings aur breaks edit karo — sabhi classes pe apply hoga</p>
                            </div>
                            <button onClick={() => setShowConfig(false)} className="p-2 rounded-xl hover:bg-gray-50 text-gray-400">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-2">
                            {configDraft.map((item, i) => (
                                <div key={i} className={`flex items-center gap-2 p-2 rounded-xl border ${item.isBreak ? "bg-amber-50 border-amber-200" : "bg-gray-50/50 border-gray-100"}`}>
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${item.isBreak ? "bg-amber-100 text-amber-700" : "bg-navy text-white"}`}>
                                        {item.isBreak ? "BRK" : `P${item.period}`}
                                    </div>
                                    {item.isBreak ? (
                                        <input value={item.label || ""}
                                            onChange={e => updateDraft(i, "label", e.target.value)}
                                            className="flex-1 px-2 py-1.5 rounded-lg border border-amber-200 text-xs font-semibold bg-white outline-none focus:border-amber-400"
                                            placeholder="Break name (e.g. LUNCH BREAK)" />
                                    ) : (
                                        <span className="flex-1 text-xs font-semibold text-gray-500">Period {item.period}</span>
                                    )}
                                    <input type="time" value={to24h(item.start)}
                                        onChange={e => updateDraft(i, "start", to12h(e.target.value))}
                                        className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs bg-white outline-none focus:border-navy w-[90px]" />
                                    <span className="text-gray-300 text-xs shrink-0">–</span>
                                    <input type="time" value={to24h(item.end)}
                                        onChange={e => updateDraft(i, "end", to12h(e.target.value))}
                                        className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs bg-white outline-none focus:border-navy w-[90px]" />
                                    <div className="flex flex-col gap-0.5 shrink-0">
                                        <button onClick={() => moveDraft(i, -1)} disabled={i === 0}
                                            className="p-1 rounded text-gray-300 hover:text-navy hover:bg-navy/10 disabled:opacity-20 transition-colors">
                                            <ChevronUp className="w-3.5 h-3.5" />
                                        </button>
                                        <button onClick={() => moveDraft(i, 1)} disabled={i === configDraft.length - 1}
                                            className="p-1 rounded text-gray-300 hover:text-navy hover:bg-navy/10 disabled:opacity-20 transition-colors">
                                            <ChevronDown className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                    <button onClick={() => removeDraft(i)}
                                        className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div className="p-4 border-t border-gray-100 space-y-3">
                            <div className="flex gap-2">
                                <button onClick={addPeriod}
                                    className="flex-1 py-2 rounded-xl border border-dashed border-navy/30 text-navy text-xs font-semibold hover:bg-navy/5 flex items-center justify-center gap-1.5 transition-colors">
                                    <Plus className="w-3.5 h-3.5" /> Add Period
                                </button>
                                <button onClick={addBreak}
                                    className="flex-1 py-2 rounded-xl border border-dashed border-amber-400/40 text-amber-600 text-xs font-semibold hover:bg-amber-50 flex items-center justify-center gap-1.5 transition-colors">
                                    <Plus className="w-3.5 h-3.5" /> Add Break
                                </button>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setShowConfig(false)}
                                    className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 transition-colors">
                                    Cancel
                                </button>
                                <button onClick={handleSaveConfig} disabled={saving}
                                    className="flex-1 py-2.5 rounded-xl bg-navy text-white text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2 hover:bg-navy/90 transition-colors">
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    {saving ? "Saving..." : "Save Schedule"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
