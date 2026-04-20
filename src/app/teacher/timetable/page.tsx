"use client";

import { useState, useEffect } from "react";
import { getDocs, collection } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { Loader2, Clock, BookOpen, Users, CalendarDays } from "lucide-react";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

const DAY_COLORS: Record<string, string> = {
    Monday: "bg-indigo-50 border-indigo-200 text-indigo-700",
    Tuesday: "bg-purple-50 border-purple-200 text-purple-700",
    Wednesday: "bg-emerald-50 border-emerald-200 text-emerald-700",
    Thursday: "bg-amber-50 border-amber-200 text-amber-700",
    Friday: "bg-rose-50 border-rose-200 text-rose-700",
    Saturday: "bg-cyan-50 border-cyan-200 text-cyan-700",
};

interface Slot { subjectId: string; subjectName: string; teacherId: string; teacherName: string; }

export default function TeacherTimetablePage() {
    const [teacherId, setTeacherId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedDay, setSelectedDay] = useState(DAYS[new Date().getDay() === 0 ? 0 : new Date().getDay() - 1] || "Monday");

    // All my slots: { day: { period: { subjectName, cls, section } } }
    const [mySchedule, setMySchedule] = useState<Record<string, Record<number, { subjectName: string; cls: string; section: string }>>>({});

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, user => {
            setTeacherId(user?.uid || null);
        });
        return () => unsub();
    }, []);

    useEffect(() => {
        if (!teacherId) { setLoading(false); return; }
        const load = async () => {
            setLoading(true);
            try {
                const snap = await getDocs(collection(db, "timetable"));
                const schedule: Record<string, Record<number, { subjectName: string; cls: string; section: string }>> = {};

                snap.docs.forEach(d => {
                    const data = d.data();
                    const slots = (data.slots || {}) as Record<string, Slot>;
                    const cls = data.cls || "";
                    const section = data.section || "";

                    Object.entries(slots).forEach(([key, slot]) => {
                        if (slot.teacherId !== teacherId) return;
                        const [day, periodStr] = key.split("-");
                        const period = parseInt(periodStr);
                        if (!day || !period) return;
                        if (!schedule[day]) schedule[day] = {};
                        schedule[day][period] = { subjectName: slot.subjectName, cls, section };
                    });
                });

                setMySchedule(schedule);
            } catch (e) { console.error(e); }
            finally { setLoading(false); }
        };
        load();
    }, [teacherId]);

    const totalPeriods = Object.values(mySchedule).reduce((s, d) => s + Object.keys(d).length, 0);
    const totalClasses = new Set(
        Object.values(mySchedule).flatMap(d => Object.values(d).map(s => `${s.cls}-${s.section}`))
    ).size;

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
                    <p className="text-white/50 text-sm font-medium">Teacher Portal</p>
                    <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">My Timetable</h1>
                    <p className="text-white/40 text-sm mt-1">Aapka weekly class schedule</p>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
                {[
                    { label: "Total Periods / Week", value: totalPeriods, icon: Clock, color: "text-navy" },
                    { label: "Classes Handled", value: totalClasses, icon: Users, color: "text-indigo-600" },
                    { label: "Active Days", value: Object.keys(mySchedule).length, icon: CalendarDays, color: "text-emerald-600" },
                ].map(s => (
                    <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
                        <s.icon className={`w-8 h-8 ${s.color} opacity-80`} />
                        <div>
                            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
                        </div>
                    </div>
                ))}
            </div>

            {totalPeriods === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-20 text-center">
                    <Clock className="w-12 h-12 mx-auto text-gray-200 mb-3" />
                    <p className="text-gray-400 font-semibold">No schedule assigned yet</p>
                    <p className="text-gray-300 text-sm mt-1">Admin se timetable set karne ko bolein.</p>
                </div>
            ) : (
                <>
                    {/* Day tabs */}
                    <div className="flex gap-2 flex-wrap">
                        {DAYS.map(day => {
                            const hasPeriods = Object.keys(mySchedule[day] || {}).length > 0;
                            return (
                                <button key={day}
                                    onClick={() => setSelectedDay(day)}
                                    className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${selectedDay === day
                                        ? "bg-navy text-white border-navy"
                                        : hasPeriods
                                            ? "bg-white text-navy border-navy/20 hover:border-navy/40"
                                            : "bg-white text-gray-300 border-gray-100"
                                    }`}
                                >
                                    {day.slice(0, 3)}
                                    {hasPeriods && (
                                        <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${selectedDay === day ? "bg-white/20" : "bg-navy/10 text-navy"}`}>
                                            {Object.keys(mySchedule[day]).length}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* Periods for selected day */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-50">
                            <h2 className="font-bold text-navy">{selectedDay}</h2>
                            <p className="text-xs text-gray-400 mt-0.5">
                                {Object.keys(mySchedule[selectedDay] || {}).length} periods assigned
                            </p>
                        </div>
                        <div className="divide-y divide-gray-50">
                            {PERIODS.map(period => {
                                const entry = mySchedule[selectedDay]?.[period];
                                const dayColor = DAY_COLORS[selectedDay];
                                return (
                                    <div key={period} className={`flex items-center gap-4 px-5 py-3.5 ${!entry ? "opacity-35" : ""}`}>
                                        <div className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center shrink-0 font-bold text-sm ${entry ? dayColor : "bg-gray-50 border-gray-100 text-gray-300"}`}>
                                            P{period}
                                        </div>
                                        {entry ? (
                                            <div className="flex-1">
                                                <p className="font-bold text-navy">{entry.subjectName}</p>
                                                <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                                                    <BookOpen className="w-3 h-3" />
                                                    Class {entry.cls} – {entry.section}
                                                </p>
                                            </div>
                                        ) : (
                                            <p className="text-sm text-gray-300 font-medium">Period {period} — Free</p>
                                        )}
                                        {entry && (
                                            <span className={`text-xs px-2.5 py-1 rounded-full border font-semibold ${dayColor}`}>
                                                {entry.cls}-{entry.section}
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
