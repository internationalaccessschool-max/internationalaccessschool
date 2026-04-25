"use client";

import toast from "react-hot-toast";
import { useState, useEffect, useMemo } from "react";
import { collection, doc, getDocs, setDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { authFetch } from "@/lib/auth-fetch";
import { Loader2, Check, Clock, X, ChevronDown, CalendarX } from "lucide-react";

type AttendanceStatus = "present" | "late" | "absent" | "holiday";

const CLASSES = ["NUR", "LKG", "UKG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
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

function getWeekRange(date: string): { from: string; to: string } {
    const d = new Date(date + "T00:00:00");
    const day = d.getDay(); // 0=Sun
    const mon = new Date(d); mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return { from: mon.toISOString().split("T")[0], to: sun.toISOString().split("T")[0] };
}

function getMonthRange(date: string): { from: string; to: string } {
    const [y, m] = date.split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    return { from: `${date.slice(0, 7)}-01`, to: `${date.slice(0, 7)}-${String(last).padStart(2, "0")}` };
}

function getMonthsBetween(from: string, to: string): string[] {
    const months: string[] = [];
    let [y, m] = from.split("-").map(Number);
    const [ey, em] = to.split("-").map(Number);
    while (y < ey || (y === ey && m <= em)) {
        months.push(`${y}-${String(m).padStart(2, "0")}`);
        m++; if (m > 12) { m = 1; y++; }
    }
    return months;
}

interface AttendanceDoc {
    date: string;
    month: string;
    year: string;
    records: Record<string, string>;
    markedByName?: string;
    isHoliday?: boolean;
}

interface ClassDaySummary {
    cls: string;
    section: string;
    total: number;
    present: number;
    late: number;
    absent: number;
    holiday: boolean;
}

interface ClassPeriodSummary {
    cls: string;
    section: string;
    workingDays: number;
    totalSlots: number;
    present: number;
    late: number;
    absent: number;
}

interface StudentInfo {
    id: string;
    name: string;
    regNo: string;
    status: AttendanceStatus;
}

export default function AdminAttendancePage() {
    const [selectedClass, setSelectedClass] = useState("1");
    const [selectedSection, setSelectedSection] = useState("A");
    const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
    const [viewMode, setViewMode] = useState<"date" | "summary">("date");
    const [summarySortKey, setSummarySortKey] = useState<"name" | "present" | "late" | "absent" | "pct">("name");
    const [summarySortDir, setSummarySortDir] = useState<"asc" | "desc">("asc");

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
    const [isHoliday, setIsHoliday] = useState(false);
    const [schoolOverview, setSchoolOverview] = useState<ClassDaySummary[]>([]);

    // Period summary (ALL classes view)
    const [overviewPeriod, setOverviewPeriod] = useState<"daily" | "weekly" | "monthly" | "period">("daily");
    const [periodFrom, setPeriodFrom] = useState(() => new Date().toISOString().split("T")[0]);
    const [periodTo, setPeriodTo] = useState(() => new Date().toISOString().split("T")[0]);
    const [periodData, setPeriodData] = useState<ClassPeriodSummary[]>([]);
    const [periodLoading, setPeriodLoading] = useState(false);

    // Fetch students for selected class-section
    useEffect(() => {
        if (selectedClass === "ALL") { setStudents([]); return; }
        const fetchStudents = async () => {
            try {
                const classNum = selectedClass.replace(/^class\s*/i, "").trim();

                const directSnap = await getDocs(
                    collection(db, "users", "classes", selectedClass, "sections", selectedSection, "students", "profiles")
                );
                let allProfiles: any[] = directSnap.docs
                    .map(d => ({ id: d.id, ...d.data() }))
                    .filter((d: any) => (d.status || "").toUpperCase() !== "LEFT");

                if (allProfiles.length === 0) {
                    const altSnap = await getDocs(
                        collection(db, "users", "classes", classNum, "sections", selectedSection, "students", "profiles")
                    );
                    allProfiles = altSnap.docs
                        .map(d => ({ id: d.id, ...d.data() }))
                        .filter((d: any) => (d.status || "").toUpperCase() !== "LEFT");
                }

                const seenIds = new Set<string>();
                const list: StudentInfo[] = [];
                for (const data of allProfiles) {
                    if (seenIds.has(data.id)) continue;
                    seenIds.add(data.id);
                    list.push({
                        id: data.id,
                        name: `${data.firstName || ""} ${data.lastName || ""}`.trim() || data.name || "Unknown",
                        regNo: data.admissionNumber || "",
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
            setIsHoliday(false);
            setSchoolOverview([]);

            // ── School-wide overview (ALL classes) ────────────────────────────
            if (selectedClass === "ALL") {
                const year = selectedDate.slice(0, 4);
                const month = selectedDate.slice(0, 7);
                const overviews: ClassDaySummary[] = [];
                const classOrder: Record<string, number> = { NUR: 0, LKG: 1, UKG: 2 };

                try {
                    // 15 parallel reads — one getDocs per class for the month
                    await Promise.all(CLASSES.map(async (cls) => {
                        try {
                            const snap = await getDocs(collection(db, "attendance", year, cls, "months", month));
                            snap.docs
                                .filter(d => (d.data().date || d.id.split("_")[0]) === selectedDate)
                                .forEach(d => {
                                    const data = d.data();
                                    const section = data.section || d.id.split("_")[1] || "?";
                                    const records = data.records || {};
                                    const isHol = !!data.isHoliday;
                                    const vals = Object.values(records) as string[];
                                    overviews.push({
                                        cls, section,
                                        total: isHol ? 0 : vals.length,
                                        present: isHol ? 0 : vals.filter(v => v === "present").length,
                                        late: isHol ? 0 : vals.filter(v => v === "late").length,
                                        absent: isHol ? 0 : vals.filter(v => v === "absent").length,
                                        holiday: isHol,
                                    });
                                });
                        } catch { /* class may have no attendance yet */ }
                    }));
                } catch { /* ignore */ }

                overviews.sort((a, b) => {
                    const na = classOrder[a.cls] ?? (parseInt(a.cls) || 99);
                    const nb = classOrder[b.cls] ?? (parseInt(b.cls) || 99);
                    return na !== nb ? na - nb : a.section.localeCompare(b.section);
                });
                setSchoolOverview(overviews);
                setLoading(false);
                return;
            }

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

                    // Set holiday state from the fetched doc
                    if (dayDoc?.isHoliday) {
                        setIsHoliday(true);
                        setStudents(prev => prev.map(s => ({ ...s, status: "holiday" as AttendanceStatus })));
                    }

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

    // Period summary fetch (only when ALL classes selected and period !== daily)
    useEffect(() => {
        if (selectedClass !== "ALL" || overviewPeriod === "daily") { setPeriodData([]); return; }

        let from = "", to = "";
        if (overviewPeriod === "weekly") { const r = getWeekRange(selectedDate); from = r.from; to = r.to; }
        else if (overviewPeriod === "monthly") { const r = getMonthRange(selectedDate); from = r.from; to = r.to; }
        else { from = periodFrom; to = periodTo; }
        if (!from || !to || from > to) return;

        const fetchPeriod = async () => {
            setPeriodLoading(true);
            const months = getMonthsBetween(from, to);
            const classOrder: Record<string, number> = { NUR: 0, LKG: 1, UKG: 2 };
            const map: Record<string, ClassPeriodSummary> = {};

            await Promise.all(CLASSES.map(async (cls) => {
                await Promise.all(months.map(async (monthStr) => {
                    try {
                        const year = monthStr.split("-")[0];
                        const snap = await getDocs(collection(db, "attendance", year, cls, "months", monthStr));
                        snap.docs.forEach(d => {
                            const data = d.data();
                            if (data.isHoliday) return;
                            const dateStr = data.date || d.id.split("_")[0];
                            if (dateStr < from || dateStr > to) return;
                            const section = data.section || d.id.split("_")[1] || "?";
                            const key = `${cls}_${section}`;
                            if (!map[key]) map[key] = { cls, section, workingDays: 0, totalSlots: 0, present: 0, late: 0, absent: 0 };
                            const vals = Object.values(data.records || {}) as string[];
                            map[key].workingDays++;
                            map[key].totalSlots += vals.length;
                            map[key].present += vals.filter(v => v === "present").length;
                            map[key].late += vals.filter(v => v === "late").length;
                            map[key].absent += vals.filter(v => v === "absent").length;
                        });
                    } catch { /* class may have no data */ }
                }));
            }));

            const result = Object.values(map).sort((a, b) => {
                const na = classOrder[a.cls] ?? (parseInt(a.cls) || 99);
                const nb = classOrder[b.cls] ?? (parseInt(b.cls) || 99);
                return na !== nb ? na - nb : a.section.localeCompare(b.section);
            });
            setPeriodData(result);
            setPeriodLoading(false);
        };

        fetchPeriod();
    }, [selectedClass, overviewPeriod, selectedDate, periodFrom, periodTo]);

    // Apply fetched attendance statuses to student list (skip if day is holiday)
    useEffect(() => {
        if (students.length > 0 && !isHoliday) {
            setStudents(prev => prev.map(s => ({
                ...s,
                status: (singleDayRecords[s.id] as AttendanceStatus) || "present",
            })));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [singleDayRecords, isHoliday]);

    const setStatus = (studentId: string, status: AttendanceStatus) => {
        setStudents(prev => prev.map(s => s.id === studentId ? { ...s, status } : s));
        setSaved(false);
    };

    const markAll = (status: AttendanceStatus) => {
        if (status === "holiday") {
            setIsHoliday(true);
            setStudents(prev => prev.map(s => ({ ...s, status: "holiday" as AttendanceStatus })));
        } else {
            setIsHoliday(false);
            setStudents(prev => prev.map(s => ({ ...s, status })));
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
                isHoliday: isHoliday,
                records: isHoliday ? {} : records,
                markedBy: currentUser?.uid || "admin",
                markedByName: currentUser?.displayName || "Admin/Supervisor",
                createdAt: serverTimestamp(),
            });

            // Trigger push notifications for absent/late students
            authFetch("/api/notifications/attendance", {
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
            toast.error("Failed to save attendance. Please try again.");
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

    const handleSummarySort = (key: typeof summarySortKey) => {
        if (summarySortKey === key) setSummarySortDir(d => d === "asc" ? "desc" : "asc");
        else { setSummarySortKey(key); setSummarySortDir(key === "name" ? "asc" : "desc"); }
    };

    const sortedSummaryStudents = [...students].sort((a, b) => {
        const sa = getStudentSummary(a.id);
        const sb = getStudentSummary(b.id);
        let diff = 0;
        if (summarySortKey === "name") diff = a.name.localeCompare(b.name);
        else if (summarySortKey === "present") diff = sa.present - sb.present;
        else if (summarySortKey === "late") diff = sa.late - sb.late;
        else if (summarySortKey === "absent") diff = sa.absent - sb.absent;
        else diff = sa.pct - sb.pct;
        return summarySortDir === "asc" ? diff : -diff;
    });

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
                            <option value="ALL">All Classes</option>
                            {CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                </div>

                {/* Section — hidden when ALL selected */}
                {selectedClass !== "ALL" && (
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Section</label>
                        <div className="relative">
                            <select
                                value={selectedSection}
                                onChange={e => setSelectedSection(e.target.value)}
                                className="px-4 py-2 pr-8 border border-gray-200 rounded-xl focus:ring-2 focus:ring-navy/20 outline-none appearance-none bg-white text-sm min-w-[100px]"
                            >
                                {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                        </div>
                    </div>
                )}

                {/* Date — in Day View or ALL */}
                {(viewMode === "date" || selectedClass === "ALL") && (
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

                {/* Year + Month filter — only in Summary View (not ALL) */}
                {viewMode === "summary" && selectedClass !== "ALL" && (
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

                {/* Period tabs — only when ALL selected */}
                {selectedClass === "ALL" && (
                    <div className="flex rounded-xl border border-gray-200 overflow-hidden ml-auto">
                        {(["daily", "weekly", "monthly", "period"] as const).map(p => (
                            <button key={p} onClick={() => setOverviewPeriod(p)}
                                className={`px-3 py-2 text-xs font-semibold capitalize transition-colors ${overviewPeriod === p ? "bg-navy text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
                                {p === "period" ? "Custom" : p.charAt(0).toUpperCase() + p.slice(1)}
                            </button>
                        ))}
                    </div>
                )}

                {/* View Toggle — hidden when ALL selected */}
                {selectedClass !== "ALL" && (
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
                )}
            </div>

            {/* Custom period pickers */}
            {selectedClass === "ALL" && overviewPeriod === "period" && (
                <div className="flex flex-wrap items-end gap-4 px-1">
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">From Date</label>
                        <input type="date" value={periodFrom} onChange={e => setPeriodFrom(e.target.value)}
                            className="px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-navy/20 outline-none text-sm" />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">To Date</label>
                        <input type="date" value={periodTo} min={periodFrom} onChange={e => setPeriodTo(e.target.value)}
                            className="px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-navy/20 outline-none text-sm" />
                    </div>
                </div>
            )}

            {loading ? (
                <div className="flex justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-navy" />
                </div>
            ) : selectedClass === "ALL" ? (
                /* ── School-wide Overview ── */
                overviewPeriod !== "daily" ? (
                    /* ── Period Summary ── */
                    periodLoading ? (
                        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-navy" /></div>
                    ) : (() => {
                        const label = overviewPeriod === "weekly"
                            ? (() => { const r = getWeekRange(selectedDate); return `${r.from} → ${r.to}`; })()
                            : overviewPeriod === "monthly"
                            ? new Date(selectedDate + "T00:00:00").toLocaleDateString("en-IN", { month: "long", year: "numeric" })
                            : `${periodFrom} → ${periodTo}`;

                        const totPresent = periodData.reduce((a, r) => a + r.present, 0);
                        const totLate = periodData.reduce((a, r) => a + r.late, 0);
                        const totAbsent = periodData.reduce((a, r) => a + r.absent, 0);
                        const totSlots = periodData.reduce((a, r) => a + r.totalSlots, 0);
                        const totPct = totSlots > 0 ? Math.round(((totPresent + totLate) / totSlots) * 100) : null;
                        const pctClr = (p: number | null) => p === null ? "text-gray-400" : p >= 90 ? "text-emerald-600" : p >= 75 ? "text-amber-600" : "text-red-600";

                        return (
                            <>
                                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                                    <div className="flex items-center justify-between mb-4">
                                        <div>
                                            <h3 className="font-bold text-navy capitalize">{overviewPeriod === "period" ? "Custom Period" : overviewPeriod.charAt(0).toUpperCase() + overviewPeriod.slice(1)} Summary</h3>
                                            <p className="text-xs text-gray-400 mt-0.5">{label}</p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-4 gap-3 text-center">
                                        <div className="bg-blue-50 rounded-xl py-3">
                                            <div className="text-xl font-extrabold text-blue-600">{totSlots}</div>
                                            <div className="text-[10px] text-gray-400 mt-0.5">Student-Days</div>
                                        </div>
                                        <div className="bg-emerald-50 rounded-xl py-3">
                                            <div className="text-xl font-extrabold text-emerald-600">{totPresent}</div>
                                            <div className="text-[10px] text-gray-400 mt-0.5">Present</div>
                                        </div>
                                        <div className="bg-amber-50 rounded-xl py-3">
                                            <div className="text-xl font-extrabold text-amber-600">{totLate}</div>
                                            <div className="text-[10px] text-gray-400 mt-0.5">Late</div>
                                        </div>
                                        <div className="bg-red-50 rounded-xl py-3">
                                            <div className="text-xl font-extrabold text-red-600">{totAbsent}</div>
                                            <div className="text-[10px] text-gray-400 mt-0.5">Absent</div>
                                        </div>
                                    </div>
                                    {totPct !== null && (
                                        <div className="mt-4">
                                            <div className="flex justify-between text-xs text-gray-500 mb-1">
                                                <span>Overall Attendance</span>
                                                <span className={`font-bold ${pctClr(totPct)}`}>{totPct}%</span>
                                            </div>
                                            <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden flex">
                                                <div className="bg-emerald-500 h-full" style={{ width: totSlots > 0 ? `${(totPresent / totSlots) * 100}%` : "0%" }} />
                                                <div className="bg-amber-400 h-full" style={{ width: totSlots > 0 ? `${(totLate / totSlots) * 100}%` : "0%" }} />
                                                <div className="bg-red-400 h-full" style={{ width: totSlots > 0 ? `${(totAbsent / totSlots) * 100}%` : "0%" }} />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {periodData.length > 0 && (
                                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                                        <div className="grid grid-cols-[80px_60px_70px_70px_70px_70px_80px] px-4 py-3 bg-gray-50 border-b text-xs font-semibold text-gray-500">
                                            <span>Class</span>
                                            <span className="text-center">Sec</span>
                                            <span className="text-center">Days</span>
                                            <span className="text-center text-emerald-600">Present</span>
                                            <span className="text-center text-amber-600">Late</span>
                                            <span className="text-center text-red-600">Absent</span>
                                            <span className="text-center">Avg %</span>
                                        </div>
                                        <div className="divide-y divide-gray-50">
                                            {periodData.map((row, i) => {
                                                const rowPct = row.totalSlots > 0 ? Math.round(((row.present + row.late) / row.totalSlots) * 100) : null;
                                                return (
                                                    <div key={i} className="grid grid-cols-[80px_60px_70px_70px_70px_70px_80px] px-4 py-3 items-center hover:bg-gray-50/50 transition-colors">
                                                        <span className="font-bold text-navy text-sm">{row.cls}</span>
                                                        <span className="text-center text-xs text-gray-500 font-medium">{row.section}</span>
                                                        <span className="text-center text-sm font-semibold text-gray-700">{row.workingDays}</span>
                                                        <span className="text-center text-sm font-bold text-emerald-600">{row.present}</span>
                                                        <span className="text-center text-sm font-bold text-amber-600">{row.late}</span>
                                                        <span className="text-center text-sm font-bold text-red-600">{row.absent}</span>
                                                        <div className="flex flex-col items-center gap-0.5">
                                                            <span className={`text-sm font-extrabold ${pctClr(rowPct)}`}>{rowPct !== null ? `${rowPct}%` : "—"}</span>
                                                            {rowPct !== null && <div className="w-10 h-1 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full ${rowPct >= 90 ? "bg-emerald-500" : rowPct >= 75 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${rowPct}%` }} /></div>}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                                {periodData.length === 0 && (
                                    <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center text-gray-400 text-sm">No attendance data found for this period.</div>
                                )}
                            </>
                        );
                    })()
                ) : (() => {
                    const nonHoliday = schoolOverview.filter(r => !r.holiday);
                    const schoolTotal   = nonHoliday.reduce((s, r) => s + r.total,   0);
                    const schoolPresent = nonHoliday.reduce((s, r) => s + r.present, 0);
                    const schoolLate    = nonHoliday.reduce((s, r) => s + r.late,    0);
                    const schoolAbsent  = nonHoliday.reduce((s, r) => s + r.absent,  0);
                    const holidayRows   = schoolOverview.filter(r => r.holiday).length;
                    const schoolAttended = schoolPresent + schoolLate;
                    const schoolPct = schoolTotal > 0 ? Math.round((schoolAttended / schoolTotal) * 100) : null;
                    const pctColor  = schoolPct === null ? "text-gray-400"
                                    : schoolPct >= 90   ? "text-emerald-600"
                                    : schoolPct >= 75   ? "text-amber-600"
                                    : "text-red-600";
                    const barColor  = schoolPct === null ? "bg-gray-200"
                                    : schoolPct >= 90   ? "bg-emerald-500"
                                    : schoolPct >= 75   ? "bg-amber-500"
                                    : "bg-red-500";

                    return (
                        <>
                            <p className="text-sm font-semibold text-navy">{dateDisplay}</p>

                            {/* School-wide percentage hero card */}
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col sm:flex-row items-center gap-5">
                                {/* Big % */}
                                <div className="flex flex-col items-center justify-center w-28 h-28 rounded-full border-4 border-gray-100 shrink-0"
                                    style={{ background: "conic-gradient(var(--bar-clr, #10b981) calc(var(--pct, 0) * 1%), #f3f4f6 0)" }}
                                >
                                    <style>{`
                                        .school-ring {
                                            --pct: ${schoolPct ?? 0};
                                            --bar-clr: ${schoolPct === null ? "#e5e7eb" : schoolPct >= 90 ? "#10b981" : schoolPct >= 75 ? "#f59e0b" : "#ef4444"};
                                        }
                                    `}</style>
                                    <div className="school-ring flex flex-col items-center justify-center w-28 h-28 rounded-full"
                                        style={{ background: `conic-gradient(${schoolPct === null ? "#e5e7eb" : schoolPct >= 90 ? "#10b981" : schoolPct >= 75 ? "#f59e0b" : "#ef4444"} ${schoolPct ?? 0}%, #f3f4f6 0)` }}>
                                        <div className="flex flex-col items-center justify-center w-20 h-20 rounded-full bg-white">
                                            <span className={`text-2xl font-extrabold leading-none ${pctColor}`}>
                                                {schoolPct !== null ? `${schoolPct}%` : "—"}
                                            </span>
                                            <span className="text-[10px] text-gray-400 font-medium mt-0.5">Present</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Stats */}
                                <div className="flex-1 w-full space-y-3">
                                    <div className="flex items-center justify-between text-xs text-gray-500 font-medium">
                                        <span>School Attendance — {schoolTotal} students marked</span>
                                        {holidayRows > 0 && (
                                            <span className="flex items-center gap-1 text-purple-600">
                                                <CalendarX className="w-3 h-3" /> {holidayRows} section{holidayRows > 1 ? "s" : ""} holiday
                                            </span>
                                        )}
                                    </div>
                                    {/* Progress bar */}
                                    <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden flex">
                                        <div className="bg-emerald-500 h-full transition-all"
                                            style={{ width: schoolTotal > 0 ? `${(schoolPresent / schoolTotal) * 100}%` : "0%" }} />
                                        <div className="bg-amber-400 h-full transition-all"
                                            style={{ width: schoolTotal > 0 ? `${(schoolLate / schoolTotal) * 100}%` : "0%" }} />
                                        <div className="bg-red-400 h-full transition-all"
                                            style={{ width: schoolTotal > 0 ? `${(schoolAbsent / schoolTotal) * 100}%` : "0%" }} />
                                    </div>
                                    {/* Counts */}
                                    <div className="grid grid-cols-3 gap-2 text-center">
                                        <div className="bg-emerald-50 rounded-xl py-2">
                                            <div className="text-lg font-extrabold text-emerald-600">{schoolPresent}</div>
                                            <div className="text-[10px] text-gray-400">Present</div>
                                        </div>
                                        <div className="bg-amber-50 rounded-xl py-2">
                                            <div className="text-lg font-extrabold text-amber-600">{schoolLate}</div>
                                            <div className="text-[10px] text-gray-400">Late</div>
                                        </div>
                                        <div className="bg-red-50 rounded-xl py-2">
                                            <div className="text-lg font-extrabold text-red-600">{schoolAbsent}</div>
                                            <div className="text-[10px] text-gray-400">Absent</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Per-class table */}
                            {schoolOverview.length === 0 ? (
                                <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center text-gray-400 text-sm">
                                    No attendance marked for this date yet.
                                </div>
                            ) : (
                                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                                    <div className="grid grid-cols-[80px_60px_60px_60px_60px_60px_80px] px-4 py-3 bg-gray-50 border-b text-xs font-semibold text-gray-500">
                                        <span>Class</span>
                                        <span className="text-center">Sec</span>
                                        <span className="text-center">Total</span>
                                        <span className="text-center text-emerald-600">Present</span>
                                        <span className="text-center text-amber-600">Late</span>
                                        <span className="text-center text-red-600">Absent</span>
                                        <span className="text-center">Attendance %</span>
                                    </div>
                                    <div className="divide-y divide-gray-50">
                                        {schoolOverview.map((row, i) => {
                                            const rowAttended = row.present + row.late;
                                            const rowPct = row.holiday ? null : row.total > 0 ? Math.round((rowAttended / row.total) * 100) : null;
                                            const rowPctColor = rowPct === null ? "text-gray-400"
                                                : rowPct >= 90 ? "text-emerald-600"
                                                : rowPct >= 75 ? "text-amber-600"
                                                : "text-red-600";
                                            const rowBarColor = rowPct === null ? "bg-gray-200"
                                                : rowPct >= 90 ? "bg-emerald-500"
                                                : rowPct >= 75 ? "bg-amber-500"
                                                : "bg-red-500";
                                            return (
                                                <div key={i} className={`grid grid-cols-[80px_60px_60px_60px_60px_60px_80px] px-4 py-3 items-center hover:bg-gray-50/50 transition-colors ${row.holiday ? "opacity-60" : ""}`}>
                                                    <span className="font-bold text-navy text-sm">{row.cls}</span>
                                                    <span className="text-center text-xs text-gray-500 font-medium">{row.section}</span>
                                                    {row.holiday ? (
                                                        <span className="col-span-5 flex items-center gap-1.5 text-xs text-purple-600 font-semibold">
                                                            <CalendarX className="w-3.5 h-3.5" /> Holiday
                                                        </span>
                                                    ) : (
                                                        <>
                                                            <span className="text-center text-sm font-semibold text-gray-700">{row.total}</span>
                                                            <span className="text-center text-sm font-bold text-emerald-600">{row.present}</span>
                                                            <span className="text-center text-sm font-bold text-amber-600">{row.late}</span>
                                                            <span className="text-center text-sm font-bold text-red-600">{row.absent}</span>
                                                            <div className="flex flex-col items-center gap-1">
                                                                <span className={`text-sm font-extrabold ${rowPctColor}`}>
                                                                    {rowPct !== null ? `${rowPct}%` : "—"}
                                                                </span>
                                                                {row.total > 0 && (
                                                                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                                        <div className={`h-full rounded-full ${rowBarColor} transition-all`}
                                                                            style={{ width: `${rowPct ?? 0}%` }} />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </>
                    );
                })()
            ) : viewMode === "date" ? ( // end overviewPeriod ternary + end ALL ternary
                <>
                    {/* Day Stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-center">
                            <div className="text-2xl font-bold text-navy">{dayTotal}</div>
                            <div className="text-xs text-gray-400">Total</div>
                        </div>
                        {isHoliday ? (
                            <div className="col-span-3 bg-purple-50 rounded-2xl p-4 shadow-sm border border-purple-200 text-center flex items-center justify-center gap-2">
                                <CalendarX className="w-5 h-5 text-purple-500" />
                                <div className="text-xl font-bold text-purple-700">Holiday — {dayTotal} students</div>
                            </div>
                        ) : (
                            <>
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
                            </>
                        )}
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
                    <div className="flex gap-2 mb-2 flex-wrap">
                        <button
                            onClick={() => markAll("present")}
                            className="bg-emerald-50 text-emerald-600 hover:bg-emerald-100 text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors">
                            Mark All Present
                        </button>
                        <button
                            onClick={() => markAll("holiday")}
                            className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                                isHoliday
                                    ? "bg-purple-500 text-white"
                                    : "bg-purple-50 text-purple-600 hover:bg-purple-100"
                            }`}>
                            <span className="flex items-center gap-1">
                                <CalendarX className="w-3 h-3" />
                                Mark Holiday
                            </span>
                        </button>
                    </div>

                    {/* Holiday banner */}
                    {isHoliday && (
                        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-purple-50 border border-purple-200 text-purple-800 text-sm font-medium mb-2">
                            <CalendarX className="w-4 h-4 shrink-0 text-purple-500" />
                            <span>This day is marked as a <strong>Holiday</strong>. It will not be counted as a working day in attendance reports.</span>
                        </div>
                    )}

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
                                        {isHoliday ? (
                                            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-100 text-purple-700">
                                                <CalendarX className="w-3.5 h-3.5" />
                                                Holiday
                                            </span>
                                        ) : (
                                            <>
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
                                            </>
                                        )}
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
                    ) : (() => {
                        const allSummaries = sortedSummaryStudents.map(st => getStudentSummary(st.id));
                        const totalPresent = allSummaries.reduce((a, s) => a + s.present, 0);
                        const totalLate = allSummaries.reduce((a, s) => a + s.late, 0);
                        const totalAbsent = allSummaries.reduce((a, s) => a + s.absent, 0);
                        const totalAttended = totalPresent + totalLate;
                        const totalSlots = allSummaries.reduce((a, s) => a + s.total, 0);
                        const totalPct = totalSlots > 0 ? Math.round((totalAttended / totalSlots) * 100) : 0;

                        const SortTh = ({ col, label, className = "" }: { col: typeof summarySortKey; label: string; className?: string }) => (
                            <button onClick={() => handleSummarySort(col)} className={`flex items-center justify-center gap-0.5 hover:text-navy transition-colors ${className}`}>
                                {label}
                                <span className="text-[10px] ml-0.5">{summarySortKey === col ? (summarySortDir === "asc" ? "↑" : "↓") : "↕"}</span>
                            </button>
                        );

                        return (
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                                {/* Total summary bar */}
                                <div className="grid grid-cols-[1fr_60px_60px_60px_70px] sm:grid-cols-[1fr_80px_80px_80px_80px] gap-2 px-5 py-3 bg-navy/5 border-b border-navy/10 text-xs font-bold text-navy">
                                    <span>Total — {students.length} students</span>
                                    <span className="text-center text-emerald-700">{totalPresent}</span>
                                    <span className="text-center text-amber-700">{totalLate}</span>
                                    <span className="text-center text-red-700">{totalAbsent}</span>
                                    <span className={`text-center ${totalPct >= 75 ? "text-emerald-700" : totalPct >= 50 ? "text-amber-700" : "text-red-700"}`}>{totalSlots > 0 ? `${totalPct}%` : "—"}</span>
                                </div>
                                {/* Sortable headers */}
                                <div className="grid grid-cols-[1fr_60px_60px_60px_70px] sm:grid-cols-[1fr_80px_80px_80px_80px] gap-2 px-5 py-3 bg-gray-50 text-xs font-semibold text-gray-500 border-b border-gray-100">
                                    <SortTh col="name" label="Student" className="justify-start" />
                                    <SortTh col="present" label="Present" />
                                    <SortTh col="late" label="Late" />
                                    <SortTh col="absent" label="Absent" />
                                    <SortTh col="pct" label="%" />
                                </div>
                                <div className="divide-y divide-gray-50">
                                    {sortedSummaryStudents.map(student => {
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
                        );
                    })()}
                </>
            )}
        </div>
    );
}
