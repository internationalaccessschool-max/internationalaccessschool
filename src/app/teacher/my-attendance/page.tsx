"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { Loader2, Check, Clock, X, CalendarX, ChevronDown, Calendar } from "lucide-react";

type AttendanceStatus = "present" | "late" | "absent" | "leave" | "holiday";

interface DayRecord {
    date: string;
    status: AttendanceStatus | null;
    isHoliday: boolean;
}

function generateMonthOptions(): { label: string; value: string }[] {
    const options: { label: string; value: string }[] = [];
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    const start = new Date(2024, 0, 1);
    let cur = new Date(start);
    while (cur <= end) {
        const y = cur.getFullYear();
        const m = String(cur.getMonth() + 1).padStart(2, "0");
        const value = `${y}-${m}`;
        const label = cur.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
        options.unshift({ label, value });
        cur = new Date(y, cur.getMonth() + 1, 1);
    }
    return options;
}

export default function TeacherMyAttendancePage() {
    const { user } = useAuth();
    const currentYearMonth = (() => {
        const n = new Date();
        return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
    })();
    const [filterMonth, setFilterMonth] = useState(currentYearMonth);
    const monthOptions = useMemo(() => generateMonthOptions(), []);
    const [loading, setLoading] = useState(true);
    const [days, setDays] = useState<DayRecord[]>([]);

    useEffect(() => {
        if (!user?.uid) return;
        const fetchAttendance = async () => {
            setLoading(true);
            try {
                const year = filterMonth.slice(0, 4);
                const snap = await getDocs(collection(db, "teacherAttendance", year, "months", filterMonth, "days"));
                const list: DayRecord[] = snap.docs.map(d => {
                    const data = d.data() as any;
                    return {
                        date: data.date || d.id,
                        status: (data.records?.[user.uid] as AttendanceStatus) || null,
                        isHoliday: !!data.isHoliday,
                    };
                });
                list.sort((a, b) => a.date.localeCompare(b.date));
                setDays(list);
            } catch (err) {
                console.error("Error fetching my attendance:", err);
                setDays([]);
            } finally {
                setLoading(false);
            }
        };
        fetchAttendance();
    }, [filterMonth, user?.uid]);

    const workingDays = days.filter(d => !d.isHoliday);
    const present = workingDays.filter(d => d.status === "present").length;
    const late = workingDays.filter(d => d.status === "late").length;
    const absent = workingDays.filter(d => d.status === "absent").length;
    const leave = workingDays.filter(d => d.status === "leave").length;
    const total = workingDays.length;
    const pct = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

    return (
        <div className="space-y-6">
            <div className="rounded-2xl bg-gradient-to-br from-navy to-navy-light p-6 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10"
                    style={{ backgroundImage: "radial-gradient(circle at 80% 50%, rgba(200,169,81,0.4) 0%, transparent 60%)" }} />
                <div className="relative z-10">
                    <p className="text-white/50 text-sm font-medium">Teacher Portal</p>
                    <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">📅 My Attendance</h1>
                    <p className="text-white/40 text-sm mt-1">View your attendance history — marked by admin/supervisor</p>
                </div>
            </div>

            <div className="flex flex-wrap gap-3 items-end">
                <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Month</label>
                    <div className="relative">
                        <select
                            value={filterMonth}
                            onChange={e => setFilterMonth(e.target.value)}
                            className="px-4 py-2 pr-8 border border-gray-200 rounded-xl focus:ring-2 focus:ring-navy/20 outline-none appearance-none bg-white text-sm min-w-[180px]"
                        >
                            {monthOptions.map(m => (
                                <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-navy" /></div>
            ) : (
                <>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                        <StatCard value={total} label="Working Days" color="text-navy" />
                        <StatCard value={present} label="Present" color="text-emerald-600" />
                        <StatCard value={late} label="Late" color="text-amber-600" />
                        <StatCard value={absent} label="Absent" color="text-red-600" />
                        <StatCard value={leave} label="Leave" color="text-blue-600" />
                    </div>

                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-bold text-navy flex items-center gap-2">
                                <Calendar className="w-4 h-4" />
                                {monthOptions.find(m => m.value === filterMonth)?.label}
                            </h3>
                            <span className={`text-sm font-bold ${pct >= 75 ? "text-emerald-600" : pct >= 50 ? "text-amber-600" : "text-red-600"}`}>
                                {total > 0 ? `${pct}% attendance` : "No data"}
                            </span>
                        </div>

                        {days.length === 0 ? (
                            <div className="text-center py-10 text-gray-400 text-sm">No attendance records yet for this month.</div>
                        ) : (
                            <div className="divide-y divide-gray-50">
                                {days.map(d => {
                                    const dateLabel = new Date(d.date + "T00:00:00").toLocaleDateString("en-IN", {
                                        weekday: "short", day: "numeric", month: "short"
                                    });
                                    return (
                                        <div key={d.date} className="flex items-center justify-between py-3">
                                            <span className="text-sm font-medium text-navy">{dateLabel}</span>
                                            <StatusBadge status={d.isHoliday ? "holiday" : d.status} />
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

function StatCard({ value, label, color }: { value: number; label: string; color: string }) {
    return (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-center">
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-xs text-gray-400">{label}</div>
        </div>
    );
}

function StatusBadge({ status }: { status: AttendanceStatus | null }) {
    if (!status) return <span className="text-xs text-gray-400">—</span>;
    const map: Record<AttendanceStatus, { cls: string; icon: React.ReactNode; label: string }> = {
        present: { cls: "bg-emerald-100 text-emerald-700", icon: <Check className="w-3.5 h-3.5" />, label: "Present" },
        late: { cls: "bg-amber-100 text-amber-700", icon: <Clock className="w-3.5 h-3.5" />, label: "Late" },
        absent: { cls: "bg-red-100 text-red-700", icon: <X className="w-3.5 h-3.5" />, label: "Absent" },
        leave: { cls: "bg-blue-100 text-blue-700", icon: <CalendarX className="w-3.5 h-3.5" />, label: "Leave" },
        holiday: { cls: "bg-purple-100 text-purple-700", icon: <CalendarX className="w-3.5 h-3.5" />, label: "Holiday" },
    };
    const s = map[status];
    return (
        <span className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold ${s.cls}`}>
            {s.icon}
            {s.label}
        </span>
    );
}
