"use client";

import toast from "react-hot-toast";
import { useState, useEffect } from "react";
import { collection, doc, getDoc, getDocs, setDoc, query, where, serverTimestamp } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { authFetch } from "@/lib/auth-fetch";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Check, X, Clock, Loader2, AlertCircle, CalendarX } from "lucide-react";

type AttendanceStatus = "present" | "absent" | "late" | "holiday";

interface Student {
    id: string;
    name: string;
    regNo: string;
    status: AttendanceStatus;
}

// ─── Path helpers ─────────────────────────────────────────────────────────────
// Structure: attendance/{year}/{cls}/months/{month}/{date}_{section}
// Firestore rules: collection = odd segments, document = even segments
// attendance(1)/year(2)/cls(3)/months(4)/month(5) = 5 = odd ✅ (collection)
// attendance(1)/year(2)/cls(3)/months(4)/month(5)/docId(6) = 6 = even ✅ (document)
function attPath(cls: string, section: string, date: string) {
    const year = date.slice(0, 4);           // "2026"
    const month = date.slice(0, 7);          // "2026-04"
    const docId = `${date}_${section}`;      // "2026-04-03_A"
    return doc(db, "attendance", year, cls, "months", month, docId);
}

function attMonthCol(cls: string, section: string, date: string) {
    const year = date.slice(0, 4);
    const month = date.slice(0, 7);
    return collection(db, "attendance", year, cls, "months", month);
}

export default function TeacherAttendancePage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    // Class teacher info
    const [assignedSections, setAssignedSections] = useState<{ cls: string, section: string }[]>([]);
    const [assignedClass, setAssignedClass] = useState<string | null>(null);
    const [assignedSection, setAssignedSection] = useState<string | null>(null);
    const [notClassTeacher, setNotClassTeacher] = useState(false);

    // Students & attendance
    const [students, setStudents] = useState<Student[]>([]);
    const [selectedDate, setSelectedDate] = useState(() => {
        const d = new Date();
        return d.toISOString().split("T")[0]; // "2026-04-03"
    });
    const [existingDoc, setExistingDoc] = useState(false);
    const [isHoliday, setIsHoliday] = useState(false);

    // Step 1: Find the teacher's assigned class from teacher doc
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (!user) return;

            try {
                let teacherDocRef = doc(db, "teachers", user.uid);
                let teacherSnap = await getDoc(teacherDocRef);

                if (!teacherSnap.exists() && user.email) {
                    const emailQ = query(collection(db, "teachers"), where("email", "==", user.email));
                    const emailSnaps = await getDocs(emailQ);
                    if (!emailSnaps.empty) {
                        teacherSnap = emailSnaps.docs[0] as any;
                    }
                }

                if (teacherSnap.exists()) {
                    const data = teacherSnap.data();
                    const a = data.assignment;
                    let matches: { cls: string, section: string }[] = [];

                    if (a?.classSections) {
                        Object.entries(a.classSections).forEach(([cls, secs]: [string, any]) => {
                            if (Array.isArray(secs)) {
                                secs.forEach((sec: string) => {
                                    matches.push({ cls, section: sec });
                                });
                            }
                        });
                    } else if (a?.classes?.length) {
                        (a.classes as string[]).forEach((c: string) => {
                            (a.sections || []).forEach((s: string) => {
                                matches.push({ cls: c, section: s });
                            });
                        });
                    }

                    if (matches.length === 0) {
                        const ctSnap = await getDocs(collection(db, "class_teachers"));
                        ctSnap.docs.forEach(d => {
                            const ctData = d.data();
                            if (ctData.teacherId === user.uid || (data.email && ctData.teacherEmail === data.email) || ctData.teacherName === `${data.firstName || ""} ${data.lastName || ""}`.trim()) {
                                matches.push({ cls: ctData.cls, section: ctData.section });
                            }
                        });
                    }

                    if (matches.length > 0) {
                        setAssignedSections(matches);
                        setAssignedClass(matches[0].cls);
                        setAssignedSection(matches[0].section);
                    } else {
                        setNotClassTeacher(true);
                        setLoading(false);
                    }
                } else {
                    setNotClassTeacher(true);
                    setLoading(false);
                }
            } catch (err) {
                console.error("Error finding class teacher assignment:", err);
                setNotClassTeacher(true);
                setLoading(false);
            }
        });

        return () => unsubscribe();
    }, []);

    // Step 2: Load students for the assigned class
    useEffect(() => {
        if (!assignedClass || !assignedSection) return;

        const fetchStudents = async () => {
            try {
                const normClass = assignedClass.replace(/^class\s*/i, "").trim();

                const directSnap = await getDocs(
                    collection(db, "users", "classes", assignedClass, "sections", assignedSection, "students", "profiles")
                );

                let allProfiles: any[] = directSnap.docs
                    .map(d => ({ id: d.id, ...d.data() }))
                    .filter((d: any) => (d.status || "").toUpperCase() !== "LEFT");

                if (allProfiles.length === 0) {
                    const altSnap = await getDocs(
                        collection(db, "users", "classes", normClass, "sections", assignedSection, "students", "profiles")
                    );
                    allProfiles = altSnap.docs
                        .map(d => ({ id: d.id, ...d.data() }))
                        .filter((d: any) => (d.status || "").toUpperCase() !== "LEFT");
                }

                if (allProfiles.length === 0) {
                    const usersSnap = await getDocs(query(collection(db, "users"), where("role", "==", "student")));
                    allProfiles = usersSnap.docs
                        .map((d): any => ({ id: d.id, ...d.data() }))
                        .filter((d: any) => {
                            const cls = d.className || d.currentClass || "";
                            return (cls === assignedClass || cls === normClass)
                                && d.section === assignedSection
                                && (d.status || "").toUpperCase() !== "LEFT";
                        });
                }

                const seen = new Set<string>();
                const studentList: Student[] = [];
                for (const data of allProfiles) {
                    if (seen.has(data.id)) continue;
                    seen.add(data.id);
                    studentList.push({
                        id: data.id,
                        name: `${data.firstName || ""} ${data.lastName || ""}`.trim() || data.name || "Unknown",
                        regNo: data.admissionNumber || "—",
                        status: "present" as AttendanceStatus,
                    });
                }

                studentList.sort((a, b) => a.regNo.localeCompare(b.regNo, undefined, { numeric: true }));
                setStudents(studentList);
            } catch (err) {
                console.error("Error fetching students:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchStudents();
    }, [assignedClass, assignedSection]);

    // Step 3: When date changes, check if attendance already exists for that date
    useEffect(() => {
        if (!assignedClass || !assignedSection || !selectedDate || students.length === 0) return;

        const checkExisting = async () => {
            try {
                const ref = attPath(assignedClass, assignedSection, selectedDate);
                const snap = await getDoc(ref);
                if (snap.exists()) {
                    const data = snap.data();
                    setExistingDoc(true);
                    if (data.isHoliday) {
                        setIsHoliday(true);
                        setStudents(prev => prev.map(s => ({ ...s, status: "holiday" as AttendanceStatus })));
                    } else {
                        setIsHoliday(false);
                        const records = data.records || {};
                        setStudents(prev => prev.map(s => ({
                            ...s,
                            status: (records[s.id] as AttendanceStatus) || "present",
                        })));
                    }
                } else {
                    setExistingDoc(false);
                    setIsHoliday(false);
                    setStudents(prev => prev.map(s => ({ ...s, status: "present" as AttendanceStatus })));
                }
            } catch (err) {
                console.error("Error checking existing attendance:", err);
            }
        };

        checkExisting();
    }, [selectedDate, assignedClass, assignedSection, students.length]);

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
        if (!assignedClass || !assignedSection) return;
        setSaving(true);
        setSaved(false);

        try {
            const year = selectedDate.slice(0, 4);
            const month = selectedDate.slice(0, 7);
            const records: Record<string, string> = {};
            students.forEach(s => { records[s.id] = s.status; });

            const currentUser = auth.currentUser;

            // New hierarchical path: attendance/{year}/{cls}/{month}/{date}_{section}
            const ref = attPath(assignedClass, assignedSection, selectedDate);
            await setDoc(ref, {
                cls: assignedClass,
                section: assignedSection,
                date: selectedDate,
                year,
                month,
                isHoliday: isHoliday,
                records: isHoliday ? {} : records,
                markedBy: currentUser?.uid || "unknown",
                markedByName: currentUser?.displayName || "Teacher",
                createdAt: serverTimestamp(),
            });

            // Trigger push notifications asynchronously
            authFetch("/api/notifications/attendance", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    date: selectedDate,
                    students: students
                })
            }).catch(e => console.error("Push Notification failed", e));

            setExistingDoc(true);
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (err) {
            console.error("Error saving attendance:", err);
            toast.error("Failed to save attendance. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    // Counts
    const lateCount = students.filter(s => s.status === "late").length;
    const presentCount = students.filter(s => s.status === "present").length + lateCount;
    const absentCount = students.filter(s => s.status === "absent").length;

    const todayStr = new Date().toISOString().split("T")[0];
    const isPastDate = selectedDate < todayStr;
    const dateDisplay = new Date(selectedDate + "T00:00:00").toLocaleDateString("en-IN", {
        weekday: "long", day: "numeric", month: "long", year: "numeric"
    });

    if (notClassTeacher) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center">
                    <AlertCircle className="w-8 h-8 text-amber-600" />
                </div>
                <h2 className="text-xl font-bold text-navy">Not a Class Teacher</h2>
                <p className="text-gray-500 text-sm text-center max-w-md">
                    You are not assigned as a Class Teacher. Only class teachers can mark attendance.
                    Please contact the admin if this is a mistake.
                </p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-[60vh]">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-10 h-10 animate-spin text-navy" />
                    <p className="text-sm text-gray-400">Loading students...</p>
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
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <p className="text-white/50 text-sm font-medium">Class Teacher</p>
                        <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">
                            Mark Attendance
                        </h1>
                        <div className="flex items-center gap-2 mt-2">
                            {assignedSections.length > 1 ? (
                                <select
                                    className="px-3 py-1.5 rounded-lg text-sm bg-white/20 text-white font-medium border-0 focus:ring-2 focus:ring-gold/30 outline-none"
                                    value={`${assignedClass}|${assignedSection}`}
                                    onChange={(e) => {
                                        const [c, s] = e.target.value.split('|');
                                        setAssignedClass(c);
                                        setAssignedSection(s);
                                    }}
                                >
                                    {assignedSections.map(seq => (
                                        <option key={`${seq.cls}-${seq.section}`} value={`${seq.cls}|${seq.section}`} className="text-navy">
                                            {seq.cls} — {seq.section}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <p className="text-white/80 text-sm font-medium">
                                    {assignedClass} — {assignedSection}
                                </p>
                            )}
                            <span className="text-white/40 text-sm">• {students.length} students</span>
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                        <input
                            type="date"
                            value={selectedDate}
                            max={todayStr}
                            onChange={e => setSelectedDate(e.target.value)}
                            className="px-4 py-2 rounded-xl text-sm border-0 bg-white/10 text-white backdrop-blur-sm focus:ring-2 focus:ring-gold/30 outline-none"
                        />
                        <span className="text-white/40 text-xs">
                            {selectedDate.slice(0, 4)} / {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-IN", { month: "long" })}
                        </span>
                    </div>
                </div>
            </div>

            {/* Date info + Stats */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div>
                    <p className="text-sm font-semibold text-navy">{dateDisplay}</p>
                    {existingDoc && (
                        <p className="text-xs text-amber-600 font-medium mt-1">⚡ Attendance already marked — editing mode</p>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    <span className="px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                        ✓ {presentCount} Present
                    </span>
                    <span className="px-3 py-1.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
                        ⏰ {lateCount} Late
                    </span>
                    <span className="px-3 py-1.5 rounded-full bg-red-100 text-red-700 text-xs font-bold">
                        ✗ {absentCount} Absent
                    </span>
                </div>
            </div>

            {/* Past date — read only banner */}
            {isPastDate && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm font-medium">
                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-500" />
                    <span>Past attendance is <strong>view-only</strong>. Only Admin or Supervisor can edit previous days.</span>
                </div>
            )}

            {/* Quick actions */}
            <div className="flex gap-2 flex-wrap">
                <button
                    disabled={isPastDate}
                    onClick={() => markAll("present")}
                    className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors ${isPastDate
                        ? "bg-gray-100 text-gray-300 cursor-not-allowed"
                        : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                        }`}>
                    Mark All Present
                </button>
                <button
                    disabled={isPastDate}
                    onClick={() => markAll("absent")}
                    className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors ${isPastDate
                        ? "bg-gray-100 text-gray-300 cursor-not-allowed"
                        : "bg-red-50 text-red-600 hover:bg-red-100"
                        }`}>
                    Mark All Absent
                </button>
                <button
                    disabled={isPastDate}
                    onClick={() => markAll("holiday")}
                    className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors ${isPastDate
                        ? "bg-gray-100 text-gray-300 cursor-not-allowed"
                        : isHoliday
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
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-purple-50 border border-purple-200 text-purple-800 text-sm font-medium">
                    <CalendarX className="w-4 h-4 shrink-0 text-purple-500" />
                    <span>This day is marked as a <strong>Holiday</strong>. It will not be counted as a working day in attendance reports.</span>
                </div>
            )}

            {/* Student List */}
            {students.length === 0 ? (
                <div className="text-center py-20 text-gray-400 text-sm">
                    No students found in {assignedClass} - {assignedSection}.
                </div>
            ) : (
                <Card className="overflow-hidden">
                    <CardContent className="p-0">
                        <div className="divide-y divide-gray-100">
                            {students.map((student, idx) => (
                                <div key={student.id} className="flex items-center justify-between px-4 py-3 sm:px-6 hover:bg-gray-50/50 transition-colors">
                                    <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-navy/10 flex items-center justify-center text-navy font-bold text-xs sm:text-sm shrink-0">
                                            {idx + 1}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-semibold text-navy text-sm truncate">{student.name}</p>
                                            <p className="text-xs text-gray-400">Reg: {student.regNo}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                                        {isHoliday ? (
                                            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-100 text-purple-700">
                                                <CalendarX className="w-3.5 h-3.5" />
                                                Holiday
                                            </span>
                                        ) : (
                                            <>
                                                {/* Present */}
                                                <button
                                                    disabled={isPastDate}
                                                    onClick={() => setStatus(student.id, "present")}
                                                    className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs font-semibold transition-all ${isPastDate
                                                        ? student.status === "present" ? "bg-emerald-500 text-white opacity-60" : "bg-gray-100 text-gray-300"
                                                        : student.status === "present" ? "bg-emerald-500 text-white shadow-sm" : "bg-gray-100 text-gray-400 hover:bg-emerald-50 hover:text-emerald-600"
                                                        }`}
                                                >
                                                    <Check className="w-3.5 h-3.5" />
                                                    <span className="hidden sm:inline">Present</span>
                                                </button>

                                                {/* Late */}
                                                <button
                                                    disabled={isPastDate}
                                                    onClick={() => setStatus(student.id, "late")}
                                                    className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs font-semibold transition-all ${isPastDate
                                                        ? student.status === "late" ? "bg-amber-500 text-white opacity-60" : "bg-gray-100 text-gray-300"
                                                        : student.status === "late" ? "bg-amber-500 text-white shadow-sm" : "bg-gray-100 text-gray-400 hover:bg-amber-50 hover:text-amber-600"
                                                        }`}
                                                >
                                                    <Clock className="w-3.5 h-3.5" />
                                                    <span className="hidden sm:inline">Late</span>
                                                </button>

                                                {/* Absent */}
                                                <button
                                                    disabled={isPastDate}
                                                    onClick={() => setStatus(student.id, "absent")}
                                                    className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs font-semibold transition-all ${isPastDate
                                                        ? student.status === "absent" ? "bg-red-500 text-white opacity-60" : "bg-gray-100 text-gray-300"
                                                        : student.status === "absent" ? "bg-red-500 text-white shadow-sm" : "bg-gray-100 text-gray-400 hover:bg-red-50 hover:text-red-600"
                                                        }`}
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
                    </CardContent>
                </Card>
            )}

            {/* Save Button — hidden for past dates */}
            {students.length > 0 && !isPastDate && (
                <div className="sticky bottom-4 z-20">
                    <Button
                        onClick={handleSave}
                        disabled={saving}
                        className={`w-full py-6 text-base font-bold rounded-2xl shadow-lg transition-all ${saved
                            ? "bg-emerald-500 hover:bg-emerald-500"
                            : "bg-navy hover:bg-navy-light"
                            } text-white`}
                    >
                        {saving ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : saved ? (
                            "✓ Attendance Saved!"
                        ) : existingDoc ? (
                            "Update Attendance"
                        ) : (
                            "Save Attendance"
                        )}
                    </Button>
                </div>
            )}
        </div>
    );
}
