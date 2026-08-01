"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { fetchStudentProfile } from "@/lib/utils/studentProfile";
import { Loader2, Check, Clock, X, TrendingUp, ChevronDown, CalendarCheck } from "lucide-react";

interface AttendanceRecord {
    date: string;
    status: "present" | "absent" | "late" | "holiday";
    day: string;
    month: string; // "YYYY-MM"
    year: string;  // "YYYY"
    isHoliday?: boolean;
}

// Generate month options for the filter dropdown
function generateMonthOptions(records: AttendanceRecord[]): { label: string; value: string }[] {
    const monthSet = new Set<string>();
    records.forEach(r => {
        const m = r.month || r.date?.slice(0, 7);
        if (m) monthSet.add(m);
    });
    return Array.from(monthSet)
        .sort((a, b) => b.localeCompare(a)) // newest first
        .map(m => {
            const [y, mo] = m.split("-");
            const label = new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
            return { label, value: m };
        });
}

// Generate all YYYY-MM strings for an academic year (Apr–Mar)
// Returns array of { monthStr, year } where year is the correct Firestore year key
function generateAcademicMonthsWithYear(sessionYear: number): { monthStr: string; year: string }[] {
    const result: { monthStr: string; year: string }[] = [];
    // Apr–Dec of sessionYear → stored under sessionYear
    for (let m = 4; m <= 12; m++) {
        result.push({ monthStr: `${sessionYear}-${String(m).padStart(2, "0")}`, year: String(sessionYear) });
    }
    // Jan–Mar of next year → stored under next year
    for (let m = 1; m <= 3; m++) {
        result.push({ monthStr: `${sessionYear + 1}-${String(m).padStart(2, "0")}`, year: String(sessionYear + 1) });
    }
    return result;
}

export default function StudentAttendancePage() {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [records, setRecords] = useState<AttendanceRecord[]>([]);
    const [studentClass, setStudentClass] = useState("");
    const [studentSection, setStudentSection] = useState("");
    const [filterMonth, setFilterMonth] = useState<string>("all");

    useEffect(() => {
        if (!user) return;

        const fetchAttendance = async () => {
            try {
                // ── Step 1: Get student's class and section ────────────────────
                // Profile document is the source of truth — it lives at
                // users/classes/{cls}/sections/{sec}/students/profiles/{uid}, the same
                // place the admin panel reads from. studentLookup / users can go stale
                // after a section transfer, so we never trust them on their own:
                // fetchStudentProfile only uses them as a hint and verifies the doc
                // actually exists at that path, else it falls back to a uid query.
                const { profile, className, section } = await fetchStudentProfile(user.uid);
                let cls = className;
                let sec = section;

                // Last resort — class/section hints when no profile doc could be read
                if (!cls || !sec) {
                    const lookupSnap = await getDoc(doc(db, "studentLookup", user.uid));
                    if (lookupSnap.exists()) {
                        const d = lookupSnap.data();
                        cls = cls || d.className || d.class || d.cls || "";
                        sec = sec || d.section || "";
                    }
                }
                if (!cls || !sec) {
                    const userSnap = await getDoc(doc(db, "users", user.uid));
                    if (userSnap.exists()) {
                        const d = userSnap.data();
                        cls = cls || d.className || d.currentClass || d.class || "";
                        sec = sec || d.section || "";
                    }
                }

                if (!cls) { setLoading(false); return; }

                // Normalize class name: strip "Class " prefix
                const normCls = cls.replace(/^class\s*/i, "").trim();
                setStudentClass(normCls);
                setStudentSection(sec);

                // ── Step 2: Determine academic session years to check ──────────
                const now = new Date();
                const currentYear = now.getFullYear();
                // If Jan–Mar, also check the previous academic session
                const sessionYears = now.getMonth() < 3
                    ? [currentYear - 1, currentYear]
                    : [currentYear];

                // All class name variants to try
                const clsVariants = Array.from(new Set([
                    normCls,
                    cls,
                    `Class ${normCls}`,
                    `class ${normCls}`,
                ])).filter(Boolean);

                // Keys used by the admin/teacher panel when saving records.
                // It writes records[profileDocId], and the profile doc id IS the uid —
                // admissionNumber is kept as a fallback for older imported records.
                const keysToCheck = Array.from(new Set([
                    user.uid,
                    profile?.admissionNumber,
                    profile?.regNo,
                ].filter(Boolean) as string[]));

                // ── Step 3: Fetch attendance records ──────────────────────────
                // A month's subcollection holds every section's doc, so we collect all
                // of them and decide per-doc below.
                type RawDoc = { data: any; docId: string; monthStr: string; year: string };
                const rawDocs: RawDoc[] = [];

                for (const sessionYear of sessionYears) {
                    const monthList = generateAcademicMonthsWithYear(sessionYear);
                    let foundCls = false;

                    for (const clsVar of clsVariants) {
                        let foundAnyMonth = false;

                        for (const { monthStr, year } of monthList) {
                            try {
                                // Use 'year' derived from monthStr, NOT sessionYear —
                                // Jan–Mar live under the next calendar year.
                                const monthCol = collection(db, "attendance", year, clsVar, "months", monthStr);
                                const docsSnap = await getDocs(monthCol);
                                if (docsSnap.empty) continue;

                                foundAnyMonth = true;
                                docsSnap.docs.forEach(d => {
                                    rawDocs.push({ data: d.data(), docId: d.id, monthStr, year });
                                });
                            } catch {
                                // Month not found — skip
                            }
                        }

                        if (foundAnyMonth) { foundCls = true; break; } // stop trying class variants
                    }

                    if (foundCls) break; // stop trying session years once data found
                }

                const docSection = (r: RawDoc): string => r.data.section || r.docId.split("_")[1] || "";
                const mkRecord = (r: RawDoc, dateStr: string, status: AttendanceRecord["status"]): AttendanceRecord => ({
                    date: dateStr,
                    status,
                    day: new Date(dateStr + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long" }),
                    month: r.monthStr,
                    year: r.year,
                    ...(status === "holiday" ? { isHoliday: true } : {}),
                });

                // Pass 1 — marked days. A doc is this student's day when their key is
                // present in `records`; we deliberately do NOT filter by section here.
                // The section on studentLookup/users can be stale, and a student who
                // moves section mid-year still owns their earlier records.
                const studentRecords: AttendanceRecord[] = [];
                const mySections = new Set<string>();

                for (const r of rawDocs) {
                    if (r.data.isHoliday) continue;
                    const dateStr: string = r.data.date || r.docId.split("_")[0] || "";
                    if (!dateStr) continue;

                    const statusMap = r.data.records || {};
                    let myStatus: string | undefined;
                    for (const key of keysToCheck) {
                        if (statusMap[key]) { myStatus = statusMap[key]; break; }
                    }
                    if (!myStatus) continue;

                    const s = docSection(r);
                    if (s) mySections.add(s);
                    studentRecords.push(mkRecord(r, dateStr, myStatus as AttendanceRecord["status"]));
                }

                // Header fallback — if no section could be resolved from the profile,
                // use the one the student is actually being marked under.
                if (!sec && mySections.size === 1) setStudentSection(Array.from(mySections)[0]);

                // Pass 2 — holidays. These carry no `records` map, so they can only be
                // matched by section: use the sections the student was actually marked
                // in, falling back to the resolved profile section.
                const holidaySections = mySections.size > 0 ? mySections : new Set([sec].filter(Boolean));
                for (const r of rawDocs) {
                    if (!r.data.isHoliday) continue;
                    const dateStr: string = r.data.date || r.docId.split("_")[0] || "";
                    if (!dateStr) continue;
                    const s = docSection(r);
                    if (s && holidaySections.size > 0 && !holidaySections.has(s)) continue;
                    studentRecords.push(mkRecord(r, dateStr, "holiday"));
                }

                // Deduplicate by date — a real marked status always wins over a holiday
                // entry for the same day (e.g. one section works, another is off).
                const uniqueMap = new Map<string, AttendanceRecord>();
                studentRecords.forEach(r => {
                    const existing = uniqueMap.get(r.date);
                    if (existing && !existing.isHoliday && r.isHoliday) return;
                    uniqueMap.set(r.date, r);
                });
                const finalRecords = Array.from(uniqueMap.values());
                finalRecords.sort((a, b) => b.date.localeCompare(a.date));
                setRecords(finalRecords);

                // Default filter to current month
                const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
                const hasCurMonth = finalRecords.some(r => (r.month || r.date?.slice(0, 7)) === curMonth);
                setFilterMonth(hasCurMonth ? curMonth : "all");

            } catch (err) {
                console.error("Error fetching attendance:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchAttendance();
    }, [user]);

    const monthOptions = useMemo(() => generateMonthOptions(records), [records]);

    const filteredRecords = filterMonth === "all"
        ? records
        : records.filter(r => (r.month || r.date?.slice(0, 7)) === filterMonth);

    // Holidays excluded from working day calculation
    const workingDays = filteredRecords.filter(r => !r.isHoliday);
    const totalDays = workingDays.length;
    const presentDays = workingDays.filter(r => r.status === "present").length;
    const lateDays = workingDays.filter(r => r.status === "late").length;
    const absentDays = workingDays.filter(r => r.status === "absent").length;
    const percentage = totalDays > 0 ? Math.round(((presentDays + lateDays) / totalDays) * 100) : 0;

    const allWorking = records.filter(r => !r.isHoliday);
    const allTotal = allWorking.length;
    const allPresent = allWorking.filter(r => r.status === "present").length;
    const allLate = allWorking.filter(r => r.status === "late").length;
    const allPct = allTotal > 0 ? Math.round(((allPresent + allLate) / allTotal) * 100) : 0;

    const selectedMonthLabel = filterMonth === "all"
        ? "All Time"
        : monthOptions.find(m => m.value === filterMonth)?.label || filterMonth;

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
                <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <p className="text-white/50 text-sm font-medium">Student Portal</p>
                        <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">📋 My Attendance</h1>
                        <p className="text-white/40 text-sm mt-1">
                            {studentClass ? `Class ${studentClass}` : "Loading..."} {studentSection ? `— Section ${studentSection}` : ""}
                        </p>
                    </div>
                    <div className={`self-start sm:self-auto px-4 py-3 rounded-2xl text-center min-w-[90px] ${allPct >= 75 ? "bg-emerald-500/20 border border-emerald-400/30" : allPct >= 50 ? "bg-amber-500/20 border border-amber-400/30" : "bg-red-500/20 border border-red-400/30"}`}>
                        <div className={`text-2xl font-bold ${allPct >= 75 ? "text-emerald-300" : allPct >= 50 ? "text-amber-300" : "text-red-300"}`}>{allPct}%</div>
                        <div className="text-white/50 text-xs mt-0.5">Overall</div>
                    </div>
                </div>
            </div>

            {/* Month Filter */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                    <CalendarCheck className="w-4 h-4 text-navy" />
                    <span className="text-sm font-semibold text-navy">{selectedMonthLabel}</span>
                </div>
                <div className="relative">
                    <select
                        value={filterMonth}
                        onChange={e => setFilterMonth(e.target.value)}
                        className="px-4 py-2 pr-8 border border-gray-200 rounded-xl focus:ring-2 focus:ring-navy/20 outline-none appearance-none bg-white text-sm min-w-[180px]"
                    >
                        <option value="all">All Time</option>
                        {monthOptions.map(m => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 text-center">
                    <div className={`w-12 h-12 rounded-xl mx-auto flex items-center justify-center mb-3 ${percentage >= 75 ? "bg-emerald-100" : percentage >= 50 ? "bg-amber-100" : "bg-red-100"}`}>
                        <TrendingUp className={`w-6 h-6 ${percentage >= 75 ? "text-emerald-600" : percentage >= 50 ? "text-amber-600" : "text-red-600"}`} />
                    </div>
                    <div className={`text-3xl font-bold ${percentage >= 75 ? "text-emerald-600" : percentage >= 50 ? "text-amber-600" : "text-red-600"}`}>
                        {totalDays > 0 ? `${percentage}%` : "—"}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">Attendance</div>
                </div>

                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 text-center">
                    <div className="w-12 h-12 rounded-xl mx-auto flex items-center justify-center mb-3 bg-emerald-100">
                        <Check className="w-6 h-6 text-emerald-600" />
                    </div>
                    <div className="text-3xl font-bold text-emerald-600">{presentDays}</div>
                    <div className="text-xs text-gray-400 mt-1">Present</div>
                </div>

                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 text-center">
                    <div className="w-12 h-12 rounded-xl mx-auto flex items-center justify-center mb-3 bg-amber-100">
                        <Clock className="w-6 h-6 text-amber-600" />
                    </div>
                    <div className="text-3xl font-bold text-amber-600">{lateDays}</div>
                    <div className="text-xs text-gray-400 mt-1">Late</div>
                </div>

                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 text-center">
                    <div className="w-12 h-12 rounded-xl mx-auto flex items-center justify-center mb-3 bg-red-100">
                        <X className="w-6 h-6 text-red-600" />
                    </div>
                    <div className="text-3xl font-bold text-red-600">{absentDays}</div>
                    <div className="text-xs text-gray-400 mt-1">Absent</div>
                </div>
            </div>

            {/* Progress Bar */}
            {totalDays > 0 && (
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-bold text-navy">Attendance Breakdown</span>
                        <span className="text-xs text-gray-400">{totalDays} total days · {selectedMonthLabel}</span>
                    </div>
                    <div className="w-full h-4 rounded-full bg-gray-100 overflow-hidden flex">
                        {presentDays > 0 && <div className="bg-emerald-500 h-full transition-all" style={{ width: `${(presentDays / totalDays) * 100}%` }} />}
                        {lateDays > 0 && <div className="bg-amber-400 h-full transition-all" style={{ width: `${(lateDays / totalDays) * 100}%` }} />}
                        {absentDays > 0 && <div className="bg-red-400 h-full transition-all" style={{ width: `${(absentDays / totalDays) * 100}%` }} />}
                    </div>
                    <div className="flex gap-4 mt-2">
                        <span className="flex items-center gap-1 text-xs text-gray-500"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Present ({presentDays})</span>
                        <span className="flex items-center gap-1 text-xs text-gray-500"><span className="w-2 h-2 rounded-full bg-amber-400" /> Late ({lateDays})</span>
                        <span className="flex items-center gap-1 text-xs text-gray-500"><span className="w-2 h-2 rounded-full bg-red-400" /> Absent ({absentDays})</span>
                    </div>
                </div>
            )}

            {/* Date-wise List */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-5 border-b border-gray-100">
                    <h2 className="font-bold text-navy">Date-wise Attendance</h2>
                    {filterMonth !== "all" && <p className="text-xs text-gray-400 mt-1">{selectedMonthLabel}</p>}
                </div>

                {filteredRecords.length === 0 ? (
                    <div className="p-10 text-center text-gray-400 text-sm">
                        {records.length === 0
                            ? "No attendance records found."
                            : `No records for ${selectedMonthLabel}.`}
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
                                            <span className="text-xs font-bold text-navy leading-tight">{dateObj.getDate()}</span>
                                            <span className="text-[9px] text-navy/50">{dateObj.toLocaleDateString("en-IN", { month: "short" })}</span>
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-navy">{record.day}</p>
                                            <p className="text-xs text-gray-400">{formatted}</p>
                                        </div>
                                    </div>
                                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                                        record.isHoliday ? "bg-purple-100 text-purple-700"
                                        : record.status === "present" ? "bg-emerald-100 text-emerald-700"
                                        : record.status === "late" ? "bg-amber-100 text-amber-700"
                                        : "bg-red-100 text-red-700"
                                    }`}>
                                        {record.isHoliday ? "🗓️ Holiday" : record.status === "present" ? "✓ Present" : record.status === "late" ? "⏰ Late" : "✗ Absent"}
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
