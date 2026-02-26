"use client";

import { useState, useEffect } from "react";
import { collection, getDocs, query, where, collectionGroup } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Loader2, Check, Clock, X, TrendingUp, ChevronDown, Users, CalendarCheck } from "lucide-react";

const CLASSES = Array.from({ length: 12 }, (_, i) => `Class ${i + 1}`);
const SECTIONS = ["A", "B", "C", "D"];

interface AttendanceDoc {
    date: string;
    records: Record<string, string>;
    markedByName?: string;
}

interface StudentInfo {
    id: string;
    name: string;
    regNo: string;
}

export default function AdminAttendancePage() {
    const [selectedClass, setSelectedClass] = useState("Class 1");
    const [selectedSection, setSelectedSection] = useState("A");
    const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
    const [viewMode, setViewMode] = useState<"date" | "summary">("date");

    const [loading, setLoading] = useState(false);
    const [students, setStudents] = useState<StudentInfo[]>([]);
    const [attendanceDocs, setAttendanceDocs] = useState<AttendanceDoc[]>([]);
    const [singleDayRecords, setSingleDayRecords] = useState<Record<string, string>>({});
    const [markedBy, setMarkedBy] = useState<string | null>(null);

    // Fetch students for selected class-section
    useEffect(() => {
        const fetchStudents = async () => {
            try {
                const classNum = selectedClass.replace("Class ", "").trim();
                const q = query(
                    collectionGroup(db, "profiles"),
                    where("className", "in", [selectedClass, classNum]),
                    where("section", "==", selectedSection)
                );
                const snap = await getDocs(q);
                const list: StudentInfo[] = snap.docs.map(d => {
                    const data = d.data();
                    return {
                        id: d.id,
                        name: data.name || `${data.firstName || ""} ${data.lastName || ""}`.trim() || "Unknown",
                        regNo: data.admissionNumber || data.regNo || data.registrationNumber || "—",
                    };
                });
                list.sort((a, b) => a.regNo.localeCompare(b.regNo, undefined, { numeric: true }));
                setStudents(list);
            } catch (err) {
                console.error("Error fetching students:", err);
                setStudents([]);
            }
        };
        fetchStudents();
    }, [selectedClass, selectedSection]);

    // Fetch attendance data
    useEffect(() => {
        const fetchAttendance = async () => {
            setLoading(true);
            try {
                const q = query(
                    collection(db, "attendance"),
                    where("cls", "==", selectedClass),
                    where("section", "==", selectedSection)
                );
                const snap = await getDocs(q);
                const docs: AttendanceDoc[] = snap.docs.map(d => ({
                    date: d.data().date,
                    records: d.data().records || {},
                    markedByName: d.data().markedByName,
                }));
                docs.sort((a, b) => b.date.localeCompare(a.date));
                setAttendanceDocs(docs);

                // Find single-day records for selectedDate
                const dayDoc = docs.find(d => d.date === selectedDate);
                setSingleDayRecords(dayDoc?.records || {});
                setMarkedBy(dayDoc?.markedByName || null);
            } catch (err) {
                console.error("Error fetching attendance:", err);
                setAttendanceDocs([]);
                setSingleDayRecords({});
            } finally {
                setLoading(false);
            }
        };
        fetchAttendance();
    }, [selectedClass, selectedSection, selectedDate]);

    // Summary stats
    const totalDays = attendanceDocs.length;

    // Per-student attendance summary
    const getStudentSummary = (studentId: string) => {
        let present = 0, late = 0, absent = 0, total = 0;
        attendanceDocs.forEach(doc => {
            if (doc.records[studentId]) {
                total++;
                if (doc.records[studentId] === "present") present++;
                else if (doc.records[studentId] === "late") late++;
                else absent++;
            }
        });
        const pct = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
        return { present, late, absent, total, pct };
    };

    // Overall class stats for selected date
    const dayPresent = Object.values(singleDayRecords).filter(s => s === "present").length;
    const dayLate = Object.values(singleDayRecords).filter(s => s === "late").length;
    const dayAbsent = Object.values(singleDayRecords).filter(s => s === "absent").length;
    const dayTotal = Object.keys(singleDayRecords).length;

    const dateDisplay = new Date(selectedDate + "T00:00:00").toLocaleDateString("en-IN", {
        weekday: "long", day: "numeric", month: "long", year: "numeric"
    });

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="rounded-2xl bg-gradient-to-br from-navy to-navy-light p-6 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10"
                    style={{ backgroundImage: "radial-gradient(circle at 80% 50%, rgba(200,169,81,0.4) 0%, transparent 60%)" }}
                />
                <div className="relative z-10">
                    <p className="text-white/50 text-sm font-medium">Admin Panel</p>
                    <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">📋 Attendance Reports</h1>
                    <p className="text-white/40 text-sm mt-1">View and monitor class-wise attendance</p>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-end">
                {/* Class */}
                <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Class</label>
                    <div className="relative">
                        <select
                            value={selectedClass}
                            onChange={e => setSelectedClass(e.target.value)}
                            className="px-4 py-2 pr-8 border border-gray-200 rounded-xl focus:ring-2 focus:ring-navy/20 outline-none appearance-none bg-white text-sm min-w-[130px]"
                        >
                            {CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                </div>

                {/* Section */}
                <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Section</label>
                    <div className="relative">
                        <select
                            value={selectedSection}
                            onChange={e => setSelectedSection(e.target.value)}
                            className="px-4 py-2 pr-8 border border-gray-200 rounded-xl focus:ring-2 focus:ring-navy/20 outline-none appearance-none bg-white text-sm min-w-[100px]"
                        >
                            {SECTIONS.map(s => <option key={s} value={s}>Section {s}</option>)}
                        </select>
                        <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                </div>

                {/* Date */}
                <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Date</label>
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={e => setSelectedDate(e.target.value)}
                        className="px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-navy/20 outline-none text-sm"
                    />
                </div>

                {/* View Toggle */}
                <div className="flex rounded-xl border border-gray-200 overflow-hidden">
                    <button
                        onClick={() => setViewMode("date")}
                        className={`px-4 py-2 text-xs font-semibold transition-colors ${viewMode === "date" ? "bg-navy text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
                    >
                        Day View
                    </button>
                    <button
                        onClick={() => setViewMode("summary")}
                        className={`px-4 py-2 text-xs font-semibold transition-colors ${viewMode === "summary" ? "bg-navy text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
                    >
                        Summary
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-navy" />
                </div>
            ) : viewMode === "date" ? (
                <>
                    {/* Day Stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-center">
                            <div className="text-2xl font-bold text-navy">{dayTotal}</div>
                            <div className="text-xs text-gray-400">Marked</div>
                        </div>
                        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-center">
                            <div className="text-2xl font-bold text-emerald-600">{dayPresent}</div>
                            <div className="text-xs text-gray-400">Present</div>
                        </div>
                        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-center">
                            <div className="text-2xl font-bold text-amber-600">{dayLate}</div>
                            <div className="text-xs text-gray-400">Late</div>
                        </div>
                        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-center">
                            <div className="text-2xl font-bold text-red-600">{dayAbsent}</div>
                            <div className="text-xs text-gray-400">Absent</div>
                        </div>
                    </div>

                    <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-navy">{dateDisplay}</p>
                        {markedBy && <p className="text-xs text-gray-400">Marked by: {markedBy}</p>}
                    </div>

                    {/* Student list for that day */}
                    {dayTotal === 0 ? (
                        <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center text-gray-400 text-sm">
                            No attendance marked for this date.
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
                            {students.map((student, idx) => {
                                const status = singleDayRecords[student.id];
                                if (!status) return null;
                                return (
                                    <div key={student.id} className="flex items-center justify-between px-5 py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-navy/10 flex items-center justify-center text-navy font-bold text-xs">
                                                {idx + 1}
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-navy">{student.name}</p>
                                                <p className="text-xs text-gray-400">Reg: {student.regNo}</p>
                                            </div>
                                        </div>
                                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${status === "present" ? "bg-emerald-100 text-emerald-700"
                                            : status === "late" ? "bg-amber-100 text-amber-700"
                                                : "bg-red-100 text-red-700"
                                            }`}>
                                            {status === "present" ? "✓ Present" : status === "late" ? "⏰ Late" : "✗ Absent"}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            ) : (
                /* Summary View */
                <>
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-bold text-navy">Student Attendance Summary</h3>
                            <span className="text-xs text-gray-400">{totalDays} days recorded</span>
                        </div>
                    </div>

                    {students.length === 0 ? (
                        <div className="text-center py-10 text-gray-400 text-sm">No students found.</div>
                    ) : (
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                            {/* Table Header */}
                            <div className="grid grid-cols-[1fr_60px_60px_60px_70px] sm:grid-cols-[1fr_80px_80px_80px_80px] gap-2 px-5 py-3 bg-gray-50 text-xs font-semibold text-gray-500 border-b border-gray-100">
                                <span>Student</span>
                                <span className="text-center">Present</span>
                                <span className="text-center">Late</span>
                                <span className="text-center">Absent</span>
                                <span className="text-center">%</span>
                            </div>
                            {/* Rows */}
                            <div className="divide-y divide-gray-50">
                                {students.map(student => {
                                    const s = getStudentSummary(student.id);
                                    return (
                                        <div key={student.id} className="grid grid-cols-[1fr_60px_60px_60px_70px] sm:grid-cols-[1fr_80px_80px_80px_80px] gap-2 px-5 py-3 items-center hover:bg-gray-50/50 transition-colors">
                                            <div>
                                                <p className="text-sm font-semibold text-navy truncate">{student.name}</p>
                                                <p className="text-xs text-gray-400">{student.regNo}</p>
                                            </div>
                                            <span className="text-center text-sm font-bold text-emerald-600">{s.present}</span>
                                            <span className="text-center text-sm font-bold text-amber-600">{s.late}</span>
                                            <span className="text-center text-sm font-bold text-red-600">{s.absent}</span>
                                            <div className="text-center">
                                                <span className={`text-sm font-bold ${s.pct >= 75 ? "text-emerald-600" : s.pct >= 50 ? "text-amber-600" : "text-red-600"
                                                    }`}>
                                                    {s.total > 0 ? `${s.pct}%` : "—"}
                                                </span>
                                            </div>
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
