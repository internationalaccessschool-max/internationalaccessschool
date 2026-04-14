"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, doc, getDocs, setDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { Loader2, Check, Clock, X, TrendingUp, ChevronDown, CalendarCheck } from "lucide-react";

type AttendanceStatus = "present" | "late" | "absent";

const CLASSES = Array.from({ length: 12 }, (_, i) => `Class ${i + 1}`);
const SECTIONS = ["A", "B", "C", "D"];

// ─── Path helpers ─────────────────────────────────────────────────────────────
// Structure: attendance/{year}/{cls}/months/{month}/{date}_{section}
// Firestore rules: collection = odd segments, document = even segments
// attendance(1)/year(2)/cls(3)/months(4)/month(5) = 5 = odd ✅ (collection)
// attendance(1)/year(2)/cls(3)/months(4)/month(5)/docId(6) = 6 = even ✅ (document)
function attDocRef(cls: string, section: string, date: string) {
    const year = date.slice(0, 4);
    const month = date.slice(0, 7);
    const docId = `${date}_${section}`;
    return doc(db, "attendance", year, cls, "months", month, docId);
}

function attMonthColRef(cls: string, date: string, month: string) {
    const year = date.slice(0, 4);
    return collection(db, "attendance", year, cls, "months", month);
}

// Generate all YYYY-MM strings for an academic year (Apr to Mar)
function academicMonths(year: string): string[] {
    const y = Number(year);
    const months: string[] = [];
    for (let m = 4; m <= 12; m++) months.push(`${y}-${String(m).padStart(2, "0")}`);
    for (let m = 1; m <= 3; m++) months.push(`${y + 1}-${String(m).padStart(2, "0")}`);
    return months;
}

// Generate list of year-months from Jan 2024 to today
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

function generateYearOptions(): string[] {
    const years: string[] = [];
    for (let y = 2050; y >= 2020; y--) years.push(String(y));
    return years;
}

interface AttendanceDoc {
    date: string;
    month: string;
    year: string;
    records: Record<string, string>;
    markedByName?: string;
    isHoliday?: boolean;
}

interface StudentInfo {
    id: string;
    name: string;
    regNo: string;
    status: AttendanceStatus;
}

export default function AdminAttendancePage() {
    const [selectedClass, setSelectedClass] = useState("Class 1");
    const [selectedSection, setSelectedSection] = useState("A");
    const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
    const [viewMode, setViewMode] = useState<"date" | "summary">("date");

    const currentYearMonth = (() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    })();
    const [filterMonth, setFilterMonth] = useState(currentYearMonth);
    const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()));

    const monthOptions = useMemo(() => generateMonthOptions(), []);
    const yearOptions = useMemo(() => generateYearOptions(), []);

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [students, setStudents] = useState<StudentInfo[]>([]);
    const [attendanceDocs, setAttendanceDocs] = useState<AttendanceDoc[]>([]);
    const [singleDayRecords, setSingleDayRecords] = useState<Record<string, string>>({});
    const [markedBy, setMarkedBy] = useState<string | null>(null);
    const [existingDocId, setExistingDocId] = useState<string | null>(null);

    // Fetch students for selected class-section
    useEffect(() => {
        const fetchStudents = async () => {
            try {
                const classNum = selectedClass.replace(/^class\s*/i, "").trim();

                const directSnap = await getDocs(
                    collection(db, "users", "classes", selectedClass, "sections", selectedSection, "students", "profiles")
                );
                let allProfiles: any[] = directSnap.docs.map(d => ({ id: d.id, ...d.data() }));

                if (allProfiles.length === 0) {
                    const altSnap = await getDocs(
                        collection(db, "users", "classes", classNum, "sections", selectedSection, "students", "profiles")
                    );
                    allProfiles = altSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                }

                const seenIds = new Set<string>();
                const list: StudentInfo[] = [];
                for (const data of allProfiles) {
                    if (seenIds.has(data.id)) continue;
                    seenIds.add(data.id);
                    list.push({
                        id: data.id,
                        name: `${data.firstName || ""} ${data.lastName || ""}`.trim() || data.name || "Unknown",
                        regNo: data.admissionNumber || "—",
                        status: "present" as AttendanceStatus,
                    });
                }
                list.sort((a, b) => a.regNo.localeCompare(b.regNo, undefined, { numeric: true }));
                setStudents(list);
            } catch (err) {
                console.error("Error fetching students:", err);
                setStudents([]);
            }
        };
        fetchStudents();
    }, [selectedClass, selectedSection]);

    // ─── Fetch attendance data using new hierarchical structure ───────────────
    useEffect(() => {
        const fetchAttendance = async () => {
            setLoading(true);
            setSingleDayRecords({});
            setExistingDocId(null);
            setMarkedBy(null);

            try {
                if (viewMode === "date") {
                    // Day view: fetch all docs in the selected month's subcollection
                    const month = selectedDate.slice(0, 7);
                    const year = selectedDate.slice(0, 4);
                    const monthCol = collection(db, "attendance", year, selectedClass, "months", month);
                    const snap = await getDocs(monthCol);

                    const docs: AttendanceDoc[] = snap.docs
                        .filter(d => {
                            const sec = d.data().section;
                            return !sec || sec === selectedSection; // filter by section
                        })
                        .map(d => ({
                            date: d.data().date || d.id.split("_")[0],
                            month: d.data().month || month,
                            year: d.data().year || year,
                            records: d.data().records || {},
                            markedByName: d.data().markedByName,
                            isHoliday: d.data().isHoliday || false,
                        }));

                    docs.sort((a, b) => b.date.localeCompare(a.date));
                    setAttendanceDocs(docs);

                    const dayDoc = docs.find(d => d.date === selectedDate);
                    setSingleDayRecords(dayDoc?.records || {});
                    setMarkedBy(dayDoc?.markedByName || null);
                    setExistingDocId(dayDoc ? `${selectedDate}_${selectedSection}` : null);

                } else {
                    // Summary view: fetch all months for the selected year
                    const months = academicMonths(filterYear);
                    const allDocs: AttendanceDoc[] = [];

                    for (const monthStr of months) {
                        // Only include if month year matches filterYear (approximate)
                        const monthYear = monthStr.slice(0, 4);
                        if (monthYear !== filterYear && !(filterYear === monthStr.slice(0, 4))) {
                            // For academic year: April of filterYear to March of filterYear+1
                        }
                        try {
                            const monthCol = collection(db, "attendance", filterYear, selectedClass, "months", monthStr);
                            const snap = await getDocs(monthCol);
                            snap.docs
                                .filter(d => {
                                    const sec = d.data().section;
                                    return !sec || sec === selectedSection;
                                })
                                .forEach(d => {
                                    allDocs.push({
                                        date: d.data().date || d.id.split("_")[0],
                                        month: d.data().month || monthStr,
                                        year: d.data().year || filterYear,
                                        records: d.data().records || {},
                                        markedByName: d.data().markedByName,
                                        isHoliday: d.data().isHoliday || false,
                                    });
                                });
                        } catch {
                            // Month subcollection may not exist
                        }
                    }

                    allDocs.sort((a, b) => b.date.localeCompare(a.date));
                    setAttendanceDocs(allDocs);
                }
            } catch (err) {
                console.error("Error fetching attendance:", err);
                setAttendanceDocs([]);
            } finally {
                setLoading(false);
            }
        };

        fetchAttendance();
    }, [selectedClass, selectedSection, selectedDate, viewMode, filterYear]);

    // Apply fetched attendance statuses to student list
    useEffect(() => {
        if (students.length > 0) {
            setStudents(prev => prev.map(s => ({
                ...s,
                status: (singleDayRecords[s.id] as AttendanceStatus) || "present",
            })));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [singleDayRecords]);

    const setStatus = (studentId: string, status: AttendanceStatus) => {
        setStudents(prev => prev.map(s => s.id === studentId ? { ...s, status } : s));
        setSaved(false);
    };

    const markAll = (status: AttendanceStatus) => {
        setStudents(prev => prev.map(s => ({ ...s, status })));
        setSaved(false);
    };

    const handleSave = async () => {
        setSaving(true);
        setSaved(false);
        try {
            const year = selectedDate.slice(0, 4);
            const month = selectedDate.slice(0, 7);
            const records: Record<string, string> = {};
            students.forEach(s => { records[s.id] = s.status; });

            const currentUser = auth.currentUser;

            // Save to new hierarchical path: attendance/{year}/{cls}/{month}/{date}_{section}
            const ref = attDocRef(selectedClass, selectedSection, selectedDate);
            await setDoc(ref, {
                cls: selectedClass,
                section: selectedSection,
                date: selectedDate,
                year,
                month,
                records,
                markedBy: currentUser?.uid || "admin",
                markedByName: currentUser?.displayName || "Admin/Supervisor",
                createdAt: serverTimestamp(),
            });

            // Trigger push notifications for absent/late students
            fetch("/api/notifications/attendance", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    date: selectedDate,
                    students: students.map(s => ({ id: s.id, name: s.name, regNo: s.regNo, status: s.status }))
                })
            }).catch(e => console.error("Push Notification failed:", e));

            setSingleDayRecords(records);
            setExistingDocId(`${selectedDate}_${selectedSection}`);
            setMarkedBy(currentUser?.displayName || "Admin/Supervisor");

            // Update local attendanceDocs list
            setAttendanceDocs(prev => {
                const existing = prev.find(d => d.date === selectedDate);
                if (existing) {
                    return prev.map(d => d.date === selectedDate ? { ...d, records } : d);
                }
                return [...prev, { date: selectedDate, month, year, records, markedByName: currentUser?.displayName || "Admin/Supervisor" }]
                    .sort((a, b) => b.date.localeCompare(a.date));
            });

            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (err) {
            console.error("Error saving attendance:", err);
            alert("Failed to save attendance. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    // Summary stats filtered by chosen month
    const summaryDocs = viewMode === "summary" && filterMonth !== "all"
        ? attendanceDocs.filter(d => d.month === filterMonth || d.date?.startsWith(filterMonth))
        : attendanceDocs;

    // Summary: exclude holiday days from total count
    const totalDays = summaryDocs.filter(d => !d.isHoliday).length;

    const getStudentSummary = (studentId: string) => {
        let present = 0, late = 0, absent = 0, total = 0;
        summaryDocs.forEach(d => {
            // Skip holiday days — they don't count as working days
            if (d.isHoliday) return;
            if (d.records[studentId]) {
                total++;
                if (d.records[studentId] === "present") present++;
                else if (d.records[studentId] === "late") late++;
                else absent++;
            }
        });
        const pct = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
        return { present, late, absent, total, pct };
    };

    const dayPresent = students.filter(s => s.status === "present").length;
    const dayLate = students.filter(s => s.status === "late").length;
    const dayAbsent = students.filter(s => s.status === "absent").length;
    const dayTotal = students.length;

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
                    <p className="text-white/40 text-sm mt-1">View and manage class-wise attendance — organized by Year → Class → Month → Date</p>
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

                {/* Date — only in Day View */}
                {viewMode === "date" && (
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

                {/* Year + Month filter — only in Summary View */}
                {viewMode === "summary" && (
                    <>
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">Year</label>
                            <div className="relative">
                                <select
                                    value={filterYear}
                                    onChange={e => setFilterYear(e.target.value)}
                                    className="px-4 py-2 pr-8 border border-gray-200 rounded-xl focus:ring-2 focus:ring-navy/20 outline-none appearance-none bg-white text-sm"
                                >
                                    {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                                <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">Month</label>
                            <div className="relative">
                                <select
                                    value={filterMonth}
                                    onChange={e => setFilterMonth(e.target.value)}
                                    className="px-4 py-2 pr-8 border border-gray-200 rounded-xl focus:ring-2 focus:ring-navy/20 outline-none appearance-none bg-white text-sm min-w-[160px]"
                                >
                                    <option value="all">All Months in {filterYear}</option>
                                    {monthOptions.filter(m => m.value.startsWith(filterYear)).map(m => (
                                        <option key={m.value} value={m.value}>{m.label}</option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                            </div>
                        </div>
                    </>
                )}

                {/* View Toggle */}
                <div className="flex rounded-xl border border-gray-200 overflow-hidden ml-auto">
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
                            <div className="text-xs text-gray-400">Total</div>
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
                        {markedBy && <p className="text-xs text-amber-600 font-medium">⚡ Last marked by: {markedBy}</p>}
                    </div>

                    {/* DB Path info badge */}
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-navy/5 rounded-lg text-xs text-navy/60 font-mono w-fit">
                        📁 attendance / {selectedDate.slice(0, 4)} / {selectedClass} / {selectedDate.slice(0, 7)} / {selectedDate}_{selectedSection}
                    </div>

                    {/* Quick actions */}
                    <div className="flex gap-2 mb-2">
                        <button
                            onClick={() => markAll("present")}
                            className="bg-emerald-50 text-emerald-600 hover:bg-emerald-100 text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors">
                            Mark All Present
                        </button>
                        <button
                            onClick={() => markAll("absent")}
                            className="bg-red-50 text-red-600 hover:bg-red-100 text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors">
                            Mark All Absent
                        </button>
                    </div>

                    {students.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center text-gray-400 text-sm">
                            No students found for this class &amp; section.
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
                            {students.map((student, idx) => (
                                <div key={student.id} className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between px-5 py-3 hover:bg-gray-50/50 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-navy/10 flex items-center justify-center text-navy font-bold text-xs shrink-0">
                                            {idx + 1}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-navy truncate">{student.name}</p>
                                            <p className="text-xs text-gray-400">Reg: {student.regNo}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 self-end sm:self-auto ml-11 sm:ml-0">
                                        <button
                                            onClick={() => setStatus(student.id, "present")}
                                            className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${student.status === "present" ? "bg-emerald-500 text-white shadow-sm" : "bg-gray-100 text-gray-400 hover:bg-emerald-50 hover:text-emerald-600"}`}
                                        >
                                            <Check className="w-3.5 h-3.5" />
                                            <span className="hidden sm:inline">Present</span>
                                        </button>
                                        <button
                                            onClick={() => setStatus(student.id, "late")}
                                            className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${student.status === "late" ? "bg-amber-500 text-white shadow-sm" : "bg-gray-100 text-gray-400 hover:bg-amber-50 hover:text-amber-600"}`}
                                        >
                                            <Clock className="w-3.5 h-3.5" />
                                            <span className="hidden sm:inline">Late</span>
                                        </button>
                                        <button
                                            onClick={() => setStatus(student.id, "absent")}
                                            className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${student.status === "absent" ? "bg-red-500 text-white shadow-sm" : "bg-gray-100 text-gray-400 hover:bg-red-50 hover:text-red-600"}`}
                                        >
                                            <X className="w-3.5 h-3.5" />
                                            <span className="hidden sm:inline">Absent</span>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {students.length > 0 && (
                        <div className="sticky bottom-4 z-20 mt-6">
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className={`w-full py-4 text-base font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 ${saved
                                    ? "bg-emerald-500 hover:bg-emerald-500"
                                    : "bg-navy hover:bg-navy-light"
                                    } text-white`}
                            >
                                {saving ? (
                                    <><Loader2 className="w-5 h-5 animate-spin" /> Saving...</>
                                ) : saved ? (
                                    "✓ Attendance Saved!"
                                ) : existingDocId ? (
                                    "Update Attendance"
                                ) : (
                                    "Save Attendance"
                                )}
                            </button>
                        </div>
                    )}
                </>
            ) : (
                /* Summary View */
                <>
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-bold text-navy">
                                Student Attendance Summary
                                {filterMonth !== "all" && (
                                    <span className="ml-2 text-sm font-normal text-gray-400">
                                        — {monthOptions.find(m => m.value === filterMonth)?.label}
                                    </span>
                                )}
                            </h3>
                            <span className="text-xs text-gray-400">{totalDays} days recorded</span>
                        </div>

                        {totalDays > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                                {summaryDocs.map(d => (
                                    <span
                                        key={d.date}
                                        className="px-2 py-0.5 rounded-md bg-navy/5 text-navy text-xs font-medium"
                                        title={d.date}
                                    >
                                        {new Date(d.date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    {students.length === 0 ? (
                        <div className="text-center py-10 text-gray-400 text-sm">No students found.</div>
                    ) : (
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                            <div className="grid grid-cols-[1fr_60px_60px_60px_70px] sm:grid-cols-[1fr_80px_80px_80px_80px] gap-2 px-5 py-3 bg-gray-50 text-xs font-semibold text-gray-500 border-b border-gray-100">
                                <span>Student</span>
                                <span className="text-center">Present</span>
                                <span className="text-center">Late</span>
                                <span className="text-center">Absent</span>
                                <span className="text-center">%</span>
                            </div>
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
                                                <span className={`text-sm font-bold ${s.pct >= 75 ? "text-emerald-600" : s.pct >= 50 ? "text-amber-600" : "text-red-600"}`}>
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
