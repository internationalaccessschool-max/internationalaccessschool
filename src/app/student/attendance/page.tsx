"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Loader2, CalendarCheck, Clock, Check, X, AlertCircle, TrendingUp } from "lucide-react";

interface AttendanceRecord {
    date: string;
    status: "present" | "absent" | "late";
    day: string;
}

export default function StudentAttendancePage() {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [records, setRecords] = useState<AttendanceRecord[]>([]);
    const [studentClass, setStudentClass] = useState("");
    const [studentSection, setStudentSection] = useState("");
    const [filterMonth, setFilterMonth] = useState("All");

    useEffect(() => {
        if (!user) return;

        const fetchAttendance = async () => {
            try {
                // Step 1: Get student's class and section
                const studentDoc = await getDoc(doc(db, "students", user.uid));
                if (!studentDoc.exists()) {
                    setLoading(false);
                    return;
                }

                const sd = studentDoc.data();
                const cls = sd.class || "";
                const sec = sd.section || "";
                setStudentClass(cls);
                setStudentSection(sec);

                // Step 2: Get all attendance docs for this class-section
                const attendanceSnap = await getDocs(
                    query(
                        collection(db, "attendance"),
                        where("cls", "==", cls),
                        where("section", "==", sec)
                    )
                );

                // Step 3: Extract this student's status from each doc
                const studentRecords: AttendanceRecord[] = [];

                attendanceSnap.docs.forEach(d => {
                    const data = d.data();
                    const statusMap = data.records || {};
                    const myStatus = statusMap[user.uid];

                    if (myStatus) {
                        const dateObj = new Date(data.date + "T00:00:00");
                        studentRecords.push({
                            date: data.date,
                            status: myStatus as "present" | "absent" | "late",
                            day: dateObj.toLocaleDateString("en-IN", { weekday: "long" }),
                        });
                    }
                });

                // Sort by date descending
                studentRecords.sort((a, b) => b.date.localeCompare(a.date));
                setRecords(studentRecords);
            } catch (err) {
                console.error("Error fetching attendance:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchAttendance();
    }, [user]);

    // Stats
    const totalDays = records.length;
    const presentDays = records.filter(r => r.status === "present").length;
    const lateDays = records.filter(r => r.status === "late").length;
    const absentDays = records.filter(r => r.status === "absent").length;
    const percentage = totalDays > 0 ? Math.round(((presentDays + lateDays) / totalDays) * 100) : 0;

    // Month filter
    const months = ["All", ...Array.from(new Set(records.map(r => {
        const d = new Date(r.date + "T00:00:00");
        return d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    })))];

    const filteredRecords = filterMonth === "All"
        ? records
        : records.filter(r => {
            const d = new Date(r.date + "T00:00:00");
            return d.toLocaleDateString("en-IN", { month: "long", year: "numeric" }) === filterMonth;
        });

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-[60vh]">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-10 h-10 animate-spin text-navy" />
                    <p className="text-sm text-gray-400">Loading attendance...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="rounded-2xl bg-gradient-to-br from-navy to-navy-light p-6 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10"
                    style={{ backgroundImage: "radial-gradient(circle at 80% 50%, rgba(200,169,81,0.4) 0%, transparent 60%)" }}
                />
                <div className="relative z-10">
                    <p className="text-white/50 text-sm font-medium">Student Portal</p>
                    <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">📋 My Attendance</h1>
                    <p className="text-white/40 text-sm mt-1">
                        {studentClass} — Section {studentSection}
                    </p>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {/* Percentage */}
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 text-center">
                    <div className={`w-12 h-12 rounded-xl mx-auto flex items-center justify-center mb-3 ${percentage >= 75 ? "bg-emerald-100" : percentage >= 50 ? "bg-amber-100" : "bg-red-100"
                        }`}>
                        <TrendingUp className={`w-6 h-6 ${percentage >= 75 ? "text-emerald-600" : percentage >= 50 ? "text-amber-600" : "text-red-600"
                            }`} />
                    </div>
                    <div className={`text-3xl font-bold ${percentage >= 75 ? "text-emerald-600" : percentage >= 50 ? "text-amber-600" : "text-red-600"
                        }`}>
                        {percentage}%
                    </div>
                    <div className="text-xs text-gray-400 mt-1">Overall</div>
                </div>

                {/* Present */}
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 text-center">
                    <div className="w-12 h-12 rounded-xl mx-auto flex items-center justify-center mb-3 bg-emerald-100">
                        <Check className="w-6 h-6 text-emerald-600" />
                    </div>
                    <div className="text-3xl font-bold text-emerald-600">{presentDays}</div>
                    <div className="text-xs text-gray-400 mt-1">Present</div>
                </div>

                {/* Late */}
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 text-center">
                    <div className="w-12 h-12 rounded-xl mx-auto flex items-center justify-center mb-3 bg-amber-100">
                        <Clock className="w-6 h-6 text-amber-600" />
                    </div>
                    <div className="text-3xl font-bold text-amber-600">{lateDays}</div>
                    <div className="text-xs text-gray-400 mt-1">Late</div>
                </div>

                {/* Absent */}
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 text-center">
                    <div className="w-12 h-12 rounded-xl mx-auto flex items-center justify-center mb-3 bg-red-100">
                        <X className="w-6 h-6 text-red-600" />
                    </div>
                    <div className="text-3xl font-bold text-red-600">{absentDays}</div>
                    <div className="text-xs text-gray-400 mt-1">Absent</div>
                </div>
            </div>

            {/* Attendance Progress Bar */}
            {totalDays > 0 && (
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-bold text-navy">Attendance Breakdown</span>
                        <span className="text-xs text-gray-400">{totalDays} total days</span>
                    </div>
                    <div className="w-full h-4 rounded-full bg-gray-100 overflow-hidden flex">
                        {presentDays > 0 && (
                            <div className="bg-emerald-500 h-full transition-all" style={{ width: `${(presentDays / totalDays) * 100}%` }} />
                        )}
                        {lateDays > 0 && (
                            <div className="bg-amber-400 h-full transition-all" style={{ width: `${(lateDays / totalDays) * 100}%` }} />
                        )}
                        {absentDays > 0 && (
                            <div className="bg-red-400 h-full transition-all" style={{ width: `${(absentDays / totalDays) * 100}%` }} />
                        )}
                    </div>
                    <div className="flex gap-4 mt-2">
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Present
                        </span>
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                            <span className="w-2 h-2 rounded-full bg-amber-400" /> Late
                        </span>
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                            <span className="w-2 h-2 rounded-full bg-red-400" /> Absent
                        </span>
                    </div>
                </div>
            )}

            {/* Month Filter + Date-wise List */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="font-bold text-navy">Date-wise Attendance</h2>
                    <select
                        value={filterMonth}
                        onChange={e => setFilterMonth(e.target.value)}
                        className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 outline-none focus:ring-2 focus:ring-navy/20"
                    >
                        {months.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                </div>

                {filteredRecords.length === 0 ? (
                    <div className="p-10 text-center text-gray-400 text-sm">
                        No attendance records found.
                    </div>
                ) : (
                    <div className="divide-y divide-gray-50">
                        {filteredRecords.map((record, i) => {
                            const dateObj = new Date(record.date + "T00:00:00");
                            const formatted = dateObj.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

                            return (
                                <div key={i} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50/50 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-navy/5 flex flex-col items-center justify-center">
                                            <span className="text-xs font-bold text-navy leading-tight">
                                                {dateObj.getDate()}
                                            </span>
                                            <span className="text-[9px] text-navy/50">
                                                {dateObj.toLocaleDateString("en-IN", { month: "short" })}
                                            </span>
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-navy">{record.day}</p>
                                            <p className="text-xs text-gray-400">{formatted}</p>
                                        </div>
                                    </div>
                                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${record.status === "present"
                                            ? "bg-emerald-100 text-emerald-700"
                                            : record.status === "late"
                                                ? "bg-amber-100 text-amber-700"
                                                : "bg-red-100 text-red-700"
                                        }`}>
                                        {record.status === "present" ? "✓ Present" : record.status === "late" ? "⏰ Late" : "✗ Absent"}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
