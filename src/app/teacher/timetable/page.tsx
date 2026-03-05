"use client";

import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { Loader2, Clock, BookOpen, Users } from "lucide-react";

type PeriodEntry = { className: string; section: string; subject: string };
type PeriodSchedule = Record<string, PeriodEntry>;

const PERIOD_COLORS = [
    "bg-indigo-50 border-indigo-100 text-indigo-700",
    "bg-purple-50 border-purple-100 text-purple-700",
    "bg-emerald-50 border-emerald-100 text-emerald-700",
    "bg-blue-50 border-blue-100 text-blue-700",
    "bg-amber-50 border-amber-100 text-amber-700",
    "bg-rose-50 border-rose-100 text-rose-700",
    "bg-cyan-50 border-cyan-100 text-cyan-700",
    "bg-orange-50 border-orange-100 text-orange-700",
];

export default function TeacherTimetablePage() {
    const [schedule, setSchedule] = useState<PeriodSchedule>({});
    const [loading, setLoading] = useState(true);
    const [teacherName, setTeacherName] = useState("");

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (user) => {
            if (!user) { setLoading(false); return; }
            const snap = await getDoc(doc(db, "teachers", user.uid));
            if (snap.exists()) {
                const data = snap.data();
                setSchedule(data.periodSchedule || {});
                setTeacherName([data.firstName, data.lastName].filter(Boolean).join(" ") || "");
            }
            setLoading(false);
        });
        return () => unsub();
    }, []);

    const assignedPeriods = Object.entries(schedule).filter(([, v]) => v?.className && v?.subject);
    const totalPeriods = 8;

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-[60vh]">
                <Loader2 className="w-8 h-8 animate-spin text-navy" />
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            {/* Header */}
            <div className="rounded-2xl gradient-navy p-6 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.3) 0%, transparent 50%)` }} />
                <div className="relative z-10">
                    <p className="text-white/50 text-sm">My Schedule</p>
                    <h1 className="text-2xl font-bold text-white mt-1">Period Timetable</h1>
                    <p className="text-white/40 text-sm mt-1">
                        {assignedPeriods.length} of {totalPeriods} periods assigned
                    </p>
                </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
                    <p className="text-2xl font-bold text-navy">{assignedPeriods.length}</p>
                    <p className="text-xs text-gray-400 mt-1">Periods Assigned</p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
                    <p className="text-2xl font-bold text-indigo-600">
                        {new Set(assignedPeriods.map(([, v]) => v.subject)).size}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">Subjects</p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
                    <p className="text-2xl font-bold text-emerald-600">
                        {new Set(assignedPeriods.map(([, v]) => `${v.className}-${v.section}`)).size}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">Classes</p>
                </div>
            </div>

            {/* Timetable */}
            {assignedPeriods.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-20 text-center">
                    <Clock className="w-12 h-12 mx-auto text-gray-200 mb-3" />
                    <p className="text-gray-400 font-semibold">No periods assigned yet</p>
                    <p className="text-gray-300 text-sm mt-1">Contact your admin to get your schedule set up.</p>
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-50">
                        <h2 className="font-bold text-navy">Daily Period Schedule</h2>
                        <p className="text-xs text-gray-400 mt-0.5">All 8 periods of your school day</p>
                    </div>
                    <div className="divide-y divide-gray-50">
                        {Array.from({ length: totalPeriods }, (_, i) => String(i + 1)).map((p, idx) => {
                            const entry = schedule[p];
                            const isAssigned = entry?.className && entry?.subject;
                            const colorCls = PERIOD_COLORS[idx] || PERIOD_COLORS[0];

                            return (
                                <div key={p} className={`flex items-center gap-5 px-6 py-4 ${isAssigned ? "" : "opacity-40"}`}>
                                    {/* Period badge */}
                                    <div className={`w-12 h-12 rounded-xl border-2 flex flex-col items-center justify-center shrink-0 font-bold ${isAssigned ? colorCls : "bg-gray-50 border-gray-100 text-gray-300"}`}>
                                        <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">P</span>
                                        <span className="text-lg leading-none">{p}</span>
                                    </div>

                                    {/* Content */}
                                    {isAssigned ? (
                                        <div className="flex-1">
                                            <p className="font-bold text-navy text-base">{entry.subject}</p>
                                            <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                                                <span className="flex items-center gap-1">
                                                    <BookOpen className="w-3 h-3" />
                                                    Class {entry.className}
                                                </span>
                                                <span className="text-gray-200">·</span>
                                                <span className="flex items-center gap-1">
                                                    <Users className="w-3 h-3" />
                                                    Section {entry.section}
                                                </span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex-1">
                                            <p className="text-sm text-gray-300 font-medium">Period {p} — Free / Not Assigned</p>
                                        </div>
                                    )}

                                    {isAssigned && (
                                        <span className={`text-[11px] px-3 py-1 rounded-full font-semibold border ${colorCls}`}>
                                            {entry.className}-{entry.section}
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
