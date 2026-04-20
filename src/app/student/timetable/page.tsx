"use client";

import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { Loader2, Clock, BookOpen, User, CalendarDays } from "lucide-react";
import { TIMETABLE_DAYS as DAYS, TIMETABLE_PERIODS } from "@/lib/timetable-config";

const PERIOD_COLORS = [
    "bg-indigo-50 border-indigo-200 text-indigo-700",
    "bg-purple-50 border-purple-200 text-purple-700",
    "bg-emerald-50 border-emerald-200 text-emerald-700",
    "bg-amber-50 border-amber-200 text-amber-700",
    "bg-rose-50 border-rose-200 text-rose-700",
    "bg-cyan-50 border-cyan-200 text-cyan-700",
    "bg-orange-50 border-orange-200 text-orange-700",
    "bg-blue-50 border-blue-200 text-blue-700",
];

interface Slot { subjectId: string; subjectName: string; teacherId: string; teacherName: string; }

export default function StudentTimetablePage() {
    const [loading, setLoading] = useState(true);
    const [slots, setSlots] = useState<Record<string, Slot>>({});
    const [cls, setCls] = useState("");
    const [section, setSection] = useState("");
    const [selectedDay, setSelectedDay] = useState(
        DAYS[new Date().getDay() === 0 ? 0 : new Date().getDay() - 1] || "Monday"
    );

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async user => {
            if (!user) { setLoading(false); return; }
            try {
                // Get student class/section from lookup
                const lookup = await getDoc(doc(db, "studentLookup", user.uid));
                if (!lookup.exists()) { setLoading(false); return; }
                const { className, section: sec } = lookup.data();
                setCls(className || "");
                setSection(sec || "");

                if (className && sec) {
                    const ttSnap = await getDoc(doc(db, "timetable", `${className}-${sec}`));
                    setSlots(ttSnap.exists() ? (ttSnap.data().slots || {}) : {});
                }
            } catch (e) { console.error(e); }
            finally { setLoading(false); }
        });
        return () => unsub();
    }, []);

    const daySlots = TIMETABLE_PERIODS.map(timing => ({
        timing,
        slot: timing.isBreak ? null : slots[`${selectedDay}-${timing.period}`] || null,
    }));

    const filledToday = daySlots.filter(d => d.slot?.subjectName).length;
    const totalWeek = Object.values(slots).filter(s => s.subjectName).length;
    const uniqueSubjects = new Set(Object.values(slots).map(s => s.subjectName).filter(Boolean)).size;

    if (loading) return (
        <div className="flex justify-center items-center min-h-[60vh]">
            <Loader2 className="w-8 h-8 animate-spin text-navy" />
        </div>
    );

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="rounded-2xl gradient-navy p-6 md:p-8 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10"
                    style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.2) 0%, transparent 50%)` }} />
                <div className="relative z-10">
                    <p className="text-white/50 text-sm font-medium">Student Portal</p>
                    <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">My Timetable</h1>
                    <p className="text-white/40 text-sm mt-1">
                        Class {cls || "—"} – {section || "—"} &nbsp;·&nbsp; Daily class schedule
                    </p>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
                {[
                    { label: "Periods Today", value: filledToday, icon: Clock, color: "text-navy" },
                    { label: "Periods / Week", value: totalWeek, icon: CalendarDays, color: "text-indigo-600" },
                    { label: "Total Subjects", value: uniqueSubjects, icon: BookOpen, color: "text-emerald-600" },
                ].map(s => (
                    <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
                        <s.icon className={`w-7 h-7 ${s.color} opacity-80`} />
                        <div>
                            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
                        </div>
                    </div>
                ))}
            </div>

            {totalWeek === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-20 text-center">
                    <Clock className="w-12 h-12 mx-auto text-gray-200 mb-3" />
                    <p className="text-gray-400 font-semibold">Timetable abhi set nahi hua</p>
                    <p className="text-gray-300 text-sm mt-1">Admin ne abhi aapki class ka timetable set nahi kiya.</p>
                </div>
            ) : (
                <>
                    {/* Day tabs */}
                    <div className="flex gap-2 flex-wrap">
                        {DAYS.map((day, idx) => {
                            const count = TIMETABLE_PERIODS.filter(p => !p.isBreak && slots[`${day}-${p.period}`]?.subjectName).length;
                            const isToday = day === DAYS[new Date().getDay() === 0 ? 0 : new Date().getDay() - 1];
                            return (
                                <button key={day} onClick={() => setSelectedDay(day)}
                                    className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all relative ${selectedDay === day
                                        ? "bg-navy text-white border-navy"
                                        : count > 0
                                            ? "bg-white text-navy border-navy/20 hover:border-navy/40"
                                            : "bg-white text-gray-300 border-gray-100"
                                    }`}
                                >
                                    {day.slice(0, 3)}
                                    {isToday && (
                                        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-500" />
                                    )}
                                    {count > 0 && (
                                        <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${selectedDay === day ? "bg-white/20" : "bg-navy/10 text-navy"}`}>
                                            {count}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* Period cards for selected day */}
                    <div className="space-y-3">
                        {daySlots.map(({ timing, slot }, idx) => {
                            if (timing.isBreak) {
                                return (
                                    <div key={`break-${idx}`} className="bg-amber-50 rounded-2xl border border-amber-200/60 shadow-sm flex items-center justify-center py-4">
                                        <span className="font-bold text-amber-700 uppercase tracking-[0.2em] text-[11px]">
                                            {timing.label || "BREAK"} — <span className="opacity-70 normal-case tracking-normal">{timing.start} to {timing.end}</span>
                                        </span>
                                    </div>
                                );
                            }

                            const period = timing.period;
                            const colorCls = PERIOD_COLORS[(period - 1) % PERIOD_COLORS.length];
                            return (
                                <div key={period}
                                    className={`bg-white rounded-2xl border shadow-sm flex items-center gap-4 px-5 py-4 transition-all ${slot?.subjectName ? "border-gray-100" : "border-gray-50 opacity-40"}`}
                                >
                                    {/* Period badge */}
                                    <div className={`w-14 h-14 rounded-xl border-2 flex flex-col items-center justify-center shrink-0 ${slot?.subjectName ? colorCls : "bg-gray-50 border-gray-100 text-gray-400"}`}>
                                        <span className="text-[9px] font-bold uppercase tracking-wider opacity-60">P{period}</span>
                                        <span className="text-[10px] font-bold leading-none mt-1">{timing.start.replace(' AM','').replace(' PM','')}</span>
                                    </div>

                                    {slot?.subjectName ? (
                                        <div className="flex-1">
                                            <p className="font-bold text-navy text-base">{slot.subjectName}</p>
                                            {slot.teacherName && (
                                                <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5">
                                                    <User className="w-3 h-3" />
                                                    {slot.teacherName}
                                                </p>
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-gray-300 font-medium">Period {period} — Free / Break</p>
                                    )}

                                    {slot?.subjectName && (
                                        <span className={`text-xs px-3 py-1 rounded-full border font-semibold ${colorCls}`}>
                                            {slot.subjectName.slice(0, 3).toUpperCase()}
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}
