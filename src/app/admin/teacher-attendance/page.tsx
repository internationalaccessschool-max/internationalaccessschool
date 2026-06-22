"use client";

import toast from "react-hot-toast";
import { useState, useEffect, useMemo } from "react";
import { collection, doc, getDocs, setDoc, serverTimestamp, query, orderBy } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { Loader2, Check, Clock, X, ChevronDown, CalendarX, Search, Users, Sun } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";

type AttendanceStatus = "present" | "late" | "absent" | "leave" | "half_day" | "holiday";

// Path: teacherAttendance/{year}/months/{month}/days/{date}
function taDocRef(date: string) {
    const year = date.slice(0, 4);
    const month = date.slice(0, 7);
    return doc(db, "teacherAttendance", year, "months", month, "days", date);
}

function taMonthColRef(year: string, month: string) {
    return collection(db, "teacherAttendance", year, "months", month, "days");
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

interface TeacherInfo {
    id: string;
    name: string;
    email: string;
    designation: string;
    status: AttendanceStatus;
    staffType: "teacher" | "staff";
}

interface AttendanceDoc {
    date: string;
    month: string;
    year: string;
    records: Record<string, string>;
    markedByName?: string;
    isHoliday?: boolean;
}

export default function AdminTeacherAttendancePage() {
    const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
    const [viewMode, setViewMode] = useState<"date" | "summary">("date");
    const currentYearMonth = (() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    })();
    const [filterMonth, setFilterMonth] = useState(currentYearMonth);
    const monthOptions = useMemo(() => generateMonthOptions(), []);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [search, setSearch] = useState("");
    const [teachers, setTeachers] = useState<TeacherInfo[]>([]);
    const [attendanceDocs, setAttendanceDocs] = useState<AttendanceDoc[]>([]);
    const [singleDayRecords, setSingleDayRecords] = useState<Record<string, string>>({});
    const [markedBy, setMarkedBy] = useState<string | null>(null);
    const [existingDocId, setExistingDocId] = useState<string | null>(null);
    const [isHoliday, setIsHoliday] = useState(false);

    // Fetch all teachers
    useEffect(() => {
        const fetchTeachers = async () => {
            try {
                const snap = await getDocs(query(collection(db, "teachers"), orderBy("createdAt", "desc")));
                const teacherList: TeacherInfo[] = snap.docs
                    .filter(d => (d.data() as any).status !== "DISABLED") // exclude disabled teachers
                    .map(d => {
                    const data = d.data() as any;
                    return {
                        id: d.id,
                        name: `${data.firstName || ""} ${data.lastName || ""}`.trim() || data.name || "Unknown",
                        email: data.email || "",
                        designation: data.designation || "Teacher",
                        status: "present" as AttendanceStatus,
                        staffType: "teacher" as const,
                    };
                });

                // Fetch non-teaching staff
                const staffSnap = await getDocs(collection(db, "nonTeachingStaff"));
                const staffList: TeacherInfo[] = staffSnap.docs.map(d => {
                    const data = d.data() as any;
                    return {
                        id: d.id,
                        name: data.name || "Unknown",
                        email: "",
                        designation: data.designation || "Staff",
                        status: "present" as AttendanceStatus,
                        staffType: "staff" as const,
                    };
                });

                const allList = [...teacherList, ...staffList];
                allList.sort((a, b) => a.name.localeCompare(b.name));
                setTeachers(allList);
            } catch (err) {
                console.error("Error fetching teachers:", err);
                setTeachers([]);
            }
        };
        fetchTeachers();
    }, []);

    // Fetch attendance docs for selected month
    useEffect(() => {
        const fetchAttendance = async () => {
            setLoading(true);
            setSingleDayRecords({});
            setExistingDocId(null);
            setMarkedBy(null);
            setIsHoliday(false);

            try {
                const month = viewMode === "date" ? selectedDate.slice(0, 7) : filterMonth;
                const year = month.slice(0, 4);
                const snap = await getDocs(taMonthColRef(year, month));

                const docs: AttendanceDoc[] = snap.docs.map(d => ({
                    date: d.data().date || d.id,
                    month: d.data().month || month,
                    year: d.data().year || year,
                    records: d.data().records || {},
                    markedByName: d.data().markedByName,
                    isHoliday: d.data().isHoliday || false,
                }));

                docs.sort((a, b) => b.date.localeCompare(a.date));
                setAttendanceDocs(docs);

                if (viewMode === "date") {
                    const dayDoc = docs.find(d => d.date === selectedDate);
                    setSingleDayRecords(dayDoc?.records || {});
                    setMarkedBy(dayDoc?.markedByName || null);
                    setExistingDocId(dayDoc ? selectedDate : null);
                    if (dayDoc?.isHoliday) setIsHoliday(true);
                }
            } catch (err) {
                console.error("Error fetching teacher attendance:", err);
                setAttendanceDocs([]);
            } finally {
                setLoading(false);
            }
        };
        fetchAttendance();
    }, [selectedDate, viewMode, filterMonth]);

    // Apply fetched status to teachers list
    useEffect(() => {
        if (teachers.length > 0 && viewMode === "date") {
            setTeachers(prev => prev.map(t => ({
                ...t,
                status: isHoliday
                    ? "holiday" as AttendanceStatus
                    : (singleDayRecords[t.id] as AttendanceStatus) || "present",
            })));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [singleDayRecords, isHoliday, teachers.length]);

    const setStatus = (teacherId: string, status: AttendanceStatus) => {
        setTeachers(prev => prev.map(t => t.id === teacherId ? { ...t, status } : t));
        setSaved(false);
    };

    const markAll = (status: AttendanceStatus) => {
        if (status === "holiday") {
            setIsHoliday(true);
            setTeachers(prev => prev.map(t => ({ ...t, status: "holiday" as AttendanceStatus })));
        } else {
            setIsHoliday(false);
            setTeachers(prev => prev.map(t => ({ ...t, status })));
        }
        setSaved(false);
    };

    const handleSave = async () => {
        setSaving(true);
        setSaved(false);
        try {
            const year = selectedDate.slice(0, 4);
            const month = selectedDate.slice(0, 7);
            const records: Record<string, string> = {};
            teachers.forEach(t => { records[t.id] = t.status; });

            const currentUser = auth.currentUser;

            await setDoc(taDocRef(selectedDate), {
                date: selectedDate,
                year,
                month,
                isHoliday,
                records: isHoliday ? {} : records,
                markedBy: currentUser?.uid || "admin",
                markedByName: currentUser?.displayName || "Admin/Supervisor",
                createdAt: serverTimestamp(),
            });

            // Push notifications for absent/late
            authFetch("/api/notifications/teacher-attendance", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    date: selectedDate,
                    teachers: teachers.map(t => ({ id: t.id, name: t.name, status: t.status }))
                })
            }).catch(e => console.error("Push Notification failed:", e));

            setSingleDayRecords(records);
            setExistingDocId(selectedDate);
            setMarkedBy(currentUser?.displayName || "Admin/Supervisor");

            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (err) {
            console.error("Error saving teacher attendance:", err);
            toast.error("Failed to save attendance. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    const filteredTeachers = teachers.filter(t =>
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.email.toLowerCase().includes(search.toLowerCase())
    );

    // Summary: exclude holiday days
    const summaryDocs = viewMode === "summary" && filterMonth !== "all"
        ? attendanceDocs.filter(d => d.month === filterMonth || d.date?.startsWith(filterMonth))
        : attendanceDocs;
    const totalDays = summaryDocs.filter(d => !d.isHoliday).length;

    const getTeacherSummary = (teacherId: string) => {
        let present = 0, late = 0, absent = 0, leave = 0, halfDay = 0, total = 0;
        summaryDocs.forEach(d => {
            if (d.isHoliday) return;
            const v = d.records[teacherId];
            if (v) {
                total++;
                if (v === "present") present++;
                else if (v === "late") late++;
                else if (v === "leave") leave++;
                else if (v === "half_day") halfDay++;
                else absent++;
            }
        });
        const pct = total > 0 ? Math.round(((present + late + halfDay * 0.5) / total) * 100) : 0;
        return { present, late, absent, leave, halfDay, total, pct };
    };

    const dayPresent = teachers.filter(t => t.status === "present").length;
    const dayLate = teachers.filter(t => t.status === "late").length;
    const dayAbsent = teachers.filter(t => t.status === "absent").length;
    const dayLeave = teachers.filter(t => t.status === "leave").length;
    const dayHalfDay = teachers.filter(t => t.status === "half_day").length;
    const dayTotal = teachers.length;

    const dateDisplay = new Date(selectedDate + "T00:00:00").toLocaleDateString("en-IN", {
        weekday: "long", day: "numeric", month: "long", year: "numeric"
    });

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="rounded-2xl bg-gradient-to-br from-navy to-navy-light p-6 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10"
                    style={{ backgroundImage: "radial-gradient(circle at 80% 50%, rgba(200,169,81,0.4) 0%, transparent 60%)" }} />
                <div className="relative z-10">
                    <p className="text-white/50 text-sm font-medium">Admin Panel</p>
                    <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">👨‍🏫 Teacher Attendance</h1>
                    <p className="text-white/40 text-sm mt-1">Mark and view staff attendance — only admins &amp; supervisors can modify</p>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-end">
                {(viewMode === "date") && (
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Date</label>
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={e => setSelectedDate(e.target.value)}
                            className="px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-navy/20 outline-none text-sm"
                        />
                    </div>
                )}

                {viewMode === "summary" && (
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
                )}

                <div className="relative ml-auto">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="search"
                        placeholder="Search teacher..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-9 pr-4 py-2 rounded-xl border border-gray-200 text-sm w-56 focus:outline-none focus:border-navy"
                    />
                </div>

                <div className="flex rounded-xl border border-gray-200 overflow-hidden">
                    <button onClick={() => setViewMode("date")}
                        className={`px-4 py-2 text-xs font-semibold transition-colors ${viewMode === "date" ? "bg-navy text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
                        Day View
                    </button>
                    <button onClick={() => setViewMode("summary")}
                        className={`px-4 py-2 text-xs font-semibold transition-colors ${viewMode === "summary" ? "bg-navy text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
                        Monthly Summary
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-navy" /></div>
            ) : viewMode === "date" ? (
                <>
                    {/* Day Stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                        <StatCard value={dayTotal} label="Total" color="text-navy" />
                        {isHoliday ? (
                            <div className="col-span-5 bg-purple-50 rounded-2xl p-4 shadow-sm border border-purple-200 text-center flex items-center justify-center gap-2">
                                <CalendarX className="w-5 h-5 text-purple-500" />
                                <div className="text-xl font-bold text-purple-700">Holiday — {dayTotal} staff</div>
                            </div>
                        ) : (
                            <>
                                <StatCard value={dayPresent} label="Present" color="text-emerald-600" />
                                <StatCard value={dayLate} label="Late" color="text-amber-600" />
                                <StatCard value={dayAbsent} label="Absent" color="text-red-600" />
                                <StatCard value={dayLeave} label="CL" color="text-blue-600" />
                                <StatCard value={dayHalfDay} label="Half Day" color="text-purple-600" />
                            </>
                        )}
                    </div>

                    <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-navy">{dateDisplay}</p>
                        {markedBy && <p className="text-xs text-amber-600 font-medium">⚡ Last marked by: {markedBy}</p>}
                    </div>

                    {/* Path info */}
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-navy/5 rounded-lg text-xs text-navy/60 font-mono w-fit">
                        📁 teacherAttendance / {selectedDate.slice(0, 4)} / months / {selectedDate.slice(0, 7)} / days / {selectedDate}
                    </div>

                    {/* Quick actions */}
                    <div className="flex gap-2 mb-2 flex-wrap">
                        <button onClick={() => markAll("present")}
                            className="bg-emerald-50 text-emerald-600 hover:bg-emerald-100 text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors">
                            Mark All Present
                        </button>
                        <button onClick={() => markAll("holiday")}
                            className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors ${isHoliday ? "bg-purple-500 text-white" : "bg-purple-50 text-purple-600 hover:bg-purple-100"}`}>
                            <span className="flex items-center gap-1">
                                <CalendarX className="w-3 h-3" />
                                Mark Holiday
                            </span>
                        </button>
                    </div>

                    {isHoliday && (
                        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-purple-50 border border-purple-200 text-purple-800 text-sm font-medium mb-2">
                            <CalendarX className="w-4 h-4 shrink-0 text-purple-500" />
                            <span>This day is marked as a <strong>Holiday</strong>. It won&apos;t count as a working day in reports.</span>
                        </div>
                    )}

                    {/* Teacher list */}
                    {filteredTeachers.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center text-gray-400 text-sm">
                            {teachers.length === 0 ? "No teachers registered yet." : "No teachers match your search."}
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
                            {filteredTeachers.map((teacher, idx) => (
                                <div key={teacher.id} className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between px-5 py-3 hover:bg-gray-50/50 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-navy/10 flex items-center justify-center text-navy font-bold text-xs shrink-0">
                                            {idx + 1}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <p className="text-sm font-semibold text-navy truncate">{teacher.name}</p>
                                                {teacher.staffType === "staff" && (
                                                    <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-700">Staff</span>
                                                )}
                                            </div>
                                            <p className="text-xs text-gray-400">{teacher.designation}{teacher.email ? ` · ${teacher.email}` : ""}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 self-end sm:self-auto ml-11 sm:ml-0 flex-wrap justify-end">
                                        {isHoliday ? (
                                            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-100 text-purple-700">
                                                <CalendarX className="w-3.5 h-3.5" />
                                                Holiday
                                            </span>
                                        ) : (
                                            <>
                                                <StatusBtn active={teacher.status === "present"} onClick={() => setStatus(teacher.id, "present")} color="emerald" icon={<Check className="w-3.5 h-3.5" />} label="Present" />
                                                <StatusBtn active={teacher.status === "late"} onClick={() => setStatus(teacher.id, "late")} color="amber" icon={<Clock className="w-3.5 h-3.5" />} label="Late" />
                                                <StatusBtn active={teacher.status === "absent"} onClick={() => setStatus(teacher.id, "absent")} color="red" icon={<X className="w-3.5 h-3.5" />} label="Absent" />
                                                <StatusBtn active={teacher.status === "leave"} onClick={() => setStatus(teacher.id, "leave")} color="blue" icon={<CalendarX className="w-3.5 h-3.5" />} label="CL" />
                                                <StatusBtn active={teacher.status === "half_day"} onClick={() => setStatus(teacher.id, "half_day")} color="purple" icon={<Sun className="w-3.5 h-3.5" />} label="Half Day" />
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {teachers.length > 0 && (
                        <div className="sticky bottom-4 z-20 mt-6">
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className={`w-full py-4 text-base font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 ${saved ? "bg-emerald-500" : "bg-navy hover:bg-navy-light"} text-white`}>
                                {saving ? (<><Loader2 className="w-5 h-5 animate-spin" /> Saving...</>) : saved ? ("✓ Attendance Saved!") : existingDocId ? ("Update Attendance") : ("Save Attendance")}
                            </button>
                        </div>
                    )}
                </>
            ) : (
                /* Summary View */
                <>
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-bold text-navy flex items-center gap-2">
                                <Users className="w-4 h-4" />
                                Teacher Attendance Summary
                                <span className="text-sm font-normal text-gray-400">
                                    — {monthOptions.find(m => m.value === filterMonth)?.label}
                                </span>
                            </h3>
                            <span className="text-xs text-gray-400">{totalDays} working days</span>
                        </div>
                        {totalDays > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                                {summaryDocs.map(d => (
                                    <span key={d.date} className={`px-2 py-0.5 rounded-md text-xs font-medium ${d.isHoliday ? "bg-purple-50 text-purple-500" : "bg-navy/5 text-navy"}`} title={d.date}>
                                        {new Date(d.date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                                        {d.isHoliday && " 🎉"}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    {filteredTeachers.length === 0 ? (
                        <div className="text-center py-10 text-gray-400 text-sm">No teachers found.</div>
                    ) : (
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                            <div className="grid grid-cols-[1fr_50px_50px_50px_50px_60px_60px] sm:grid-cols-[1fr_70px_70px_70px_70px_80px_80px] gap-2 px-5 py-3 bg-gray-50 text-xs font-semibold text-gray-500 border-b border-gray-100">
                                <span>Teacher</span>
                                <span className="text-center">Present</span>
                                <span className="text-center">Late</span>
                                <span className="text-center">Absent</span>
                                <span className="text-center">CL</span>
                                <span className="text-center">Half Day</span>
                                <span className="text-center">%</span>
                            </div>
                            <div className="divide-y divide-gray-50">
                                {filteredTeachers.map(teacher => {
                                    const s = getTeacherSummary(teacher.id);
                                    return (
                                        <div key={teacher.id} className="grid grid-cols-[1fr_50px_50px_50px_50px_60px_60px] sm:grid-cols-[1fr_70px_70px_70px_70px_80px_80px] gap-2 px-5 py-3 items-center hover:bg-gray-50/50 transition-colors">
                                            <div>
                                                <div className="flex items-center gap-1.5">
                                                    <p className="text-sm font-semibold text-navy truncate">{teacher.name}</p>
                                                    {teacher.staffType === "staff" && (
                                                        <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-700">Staff</span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-gray-400 truncate">{teacher.designation}</p>
                                            </div>
                                            <span className="text-center text-sm font-bold text-emerald-600">{s.present}</span>
                                            <span className="text-center text-sm font-bold text-amber-600">{s.late}</span>
                                            <span className="text-center text-sm font-bold text-red-600">{s.absent}</span>
                                            <span className="text-center text-sm font-bold text-blue-600">{s.leave}</span>
                                            <span className="text-center text-sm font-bold text-purple-600">{s.halfDay}</span>
                                            <span className={`text-center text-sm font-bold ${s.pct >= 75 ? "text-emerald-600" : s.pct >= 50 ? "text-amber-600" : "text-red-600"}`}>
                                                {s.total > 0 ? `${s.pct}%` : "—"}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
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

function StatusBtn({ active, onClick, color, icon, label }: { active: boolean; onClick: () => void; color: string; icon: React.ReactNode; label: string }) {
    const activeCls = {
        emerald: "bg-emerald-500 text-white shadow-sm",
        amber: "bg-amber-500 text-white shadow-sm",
        red: "bg-red-500 text-white shadow-sm",
        blue: "bg-blue-500 text-white shadow-sm",
        purple: "bg-purple-500 text-white shadow-sm",
    }[color] || "bg-gray-500 text-white";
    const hoverCls = {
        emerald: "hover:bg-emerald-50 hover:text-emerald-600",
        amber: "hover:bg-amber-50 hover:text-amber-600",
        red: "hover:bg-red-50 hover:text-red-600",
        blue: "hover:bg-blue-50 hover:text-blue-600",
        purple: "hover:bg-purple-50 hover:text-purple-600",
    }[color] || "";
    return (
        <button onClick={onClick}
            className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${active ? activeCls : `bg-gray-100 text-gray-400 ${hoverCls}`}`}>
            {icon}
            <span className="hidden sm:inline">{label}</span>
        </button>
    );
}
