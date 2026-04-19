"use client";

import toast from "react-hot-toast";
import { useState, useEffect } from "react";
import {
    collection, getDocs, doc, getDoc, setDoc, query, where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { Exam } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
    Loader2, Save, ShieldAlert, BookOpen, CheckCircle2, AlertCircle,
    Lock, PowerOff,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface SubjectEntry { id: string; name: string; maxMarks: number; }
interface StudentRow { id: string; firstName: string; lastName: string; admissionNumber: string; }

const CO_SCHOLASTIC_ITEMS = [
    { id: "workEd",  label: "Work Education" },
    { id: "artEd",   label: "Art Education" },
    { id: "sports",  label: "Sports / Yoga / NCC" },
];
const CO_SCHO_GRADES = ["A", "B", "C", "D"];

function resultDocRef(examId: string, cls: string, sec: string, uid: string) {
    return doc(db, "results", examId, "classes", cls, "sections", sec, "students", uid);
}
function resultSectionCol(examId: string, cls: string, sec: string) {
    return collection(db, "results", examId, "classes", cls, "sections", sec, "students");
}

// ─── Grade Calculation ────────────────────────────────────────────────────────
function calcGrade(pct: number): string {
    if (pct >= 90.5) return "A1";
    if (pct >= 81) return "A2";
    if (pct >= 71) return "B1";
    if (pct >= 61) return "B2";
    if (pct >= 51) return "C1";
    if (pct >= 41) return "C2";
    if (pct >= 33) return "D";
    return "E";
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TeacherMarksPage() {
    const { user } = useAuth();

    const [myClass, setMyClass] = useState<{ className: string; section: string } | null>(null);
    const [isClassTeacher, setIsClassTeacher] = useState<boolean | null>(null);

    // All exams for this session
    const [sessions, setSessions] = useState<string[]>([]);
    const [selectedSession, setSelectedSession] = useState("");
    const [sessionExams, setSessionExams] = useState<Exam[]>([]);

    const [subjects, setSubjects] = useState<SubjectEntry[]>([]);
    const [students, setStudents] = useState<StudentRow[]>([]);

    // which exam slot to enter marks for
    type TabKey = "unit1" | "halfYearly" | "unit2" | "annual";
    const [activeTab, setActiveTab] = useState<TabKey>("unit1");

    // resultsMap[examId][studentId][fieldKey] = value
    const [resultsMap, setResultsMap] = useState<Record<string, Record<string, Record<string, string>>>>({});
    // coSchoMap[studentId][actId] = { hy, annual }
    const [coSchoMap, setCoSchoMap] = useState<Record<string, Record<string, { hy: string; annual: string }>>>({});

    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState<TabKey | null>(null);
    const [isLoadingMarks, setIsLoadingMarks] = useState(false);

    // ── 1. Verify class teacher assignment ────────────────────────────────────
    useEffect(() => {
        if (!user) return;
        const check = async () => {
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

                let matches: { cls: string, section: string }[] = [];

                if (teacherSnap.exists()) {
                    const data = teacherSnap.data();
                    const a = data.assignment;

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
                } else {
                    // No teacher doc found by UID – scan class_teachers by uid OR email
                    const ctSnap = await getDocs(collection(db, "class_teachers"));
                    ctSnap.docs.forEach(d => {
                        const ctData = d.data();
                        if (
                            ctData.teacherId === user.uid ||
                            (user.email && ctData.teacherEmail === user.email)
                        ) {
                            matches.push({ cls: ctData.cls, section: ctData.section });
                        }
                    });
                }

                if (matches.length > 0) {
                    const cls = (matches[0].cls || "").replace(/^class\s*/i, "").trim();
                    setMyClass({ className: cls, section: matches[0].section });
                    setIsClassTeacher(true);
                } else {
                    setIsClassTeacher(false);
                }
            } catch (err) {
                console.error("Error finding class teacher assignment:", err);
                setIsClassTeacher(false);
            }
        };
        check();
    }, [user]);

    // ── 2. Load all sessions from exams ───────────────────────────────────────
    useEffect(() => {
        const load = async () => {
            const snap = await getDocs(collection(db, "exams"));
            const all = snap.docs.map(d => ({ id: d.id, ...d.data() }) as Exam);
            const sessionSet = Array.from(new Set(all.map(e => e.session || "").filter(Boolean))).sort().reverse();
            setSessions(sessionSet);
            if (sessionSet.length > 0) setSelectedSession(sessionSet[0]!);
        };
        load();
    }, []);

    // ── 3. When session changes, load its 4 exams ─────────────────────────────
    useEffect(() => {
        if (!selectedSession) return;
        const load = async () => {
            const snap = await getDocs(collection(db, "exams"));
            const all = snap.docs.map(d => ({ id: d.id, ...d.data() }) as Exam);
            const filtered = all.filter(e => e.session === selectedSession);
            setSessionExams(filtered);
        };
        load();
    }, [selectedSession]);

    // ── 4. When class is known, load subjects and students ────────────────────
    useEffect(() => {
        if (!myClass) return;
        const load = async () => {
            // Subjects
            const normCls = myClass.className.replace(/^class\s*/i, "").trim();
            for (const key of [normCls, myClass.className, `Class ${normCls}`]) {
                const subDoc = await getDoc(doc(db, "classSubjects", key));
                if (subDoc.exists()) {
                    const rawSubs = subDoc.data().subjects || [];
                    setSubjects(rawSubs.map((s: any) =>
                        typeof s === "object"
                            ? { id: s.id || s.name, name: s.name, maxMarks: s.maxMarks || 100 }
                            : { id: s, name: s, maxMarks: 100 }
                    ));
                    break;
                }
            }

            // Students
            const normSec = myClass.section;
            let studs: StudentRow[] = [];
            for (const cls of [normCls, myClass.className]) {
                try {
                    const snap = await getDocs(
                        collection(db, "users", "classes", cls, "sections", normSec, "students", "profiles")
                    );
                    if (snap.docs.length > 0) {
                        studs = snap.docs
                            .map(d => ({ id: d.id, ...d.data() }))
                            .filter((data: any) => {
                                const st = (data.status || "").toUpperCase();
                                return st !== "LEFT" && st !== "TC" && st !== "INACTIVE";
                            })
                            .map((data: any) => ({
                                id: data.id,
                                firstName: data.firstName || "",
                                lastName: data.lastName || "",
                                admissionNumber: data.admissionNumber || "",
                            }));
                        break;
                    }
                } catch { /* try next */ }
            }
            if (studs.length === 0) {
                // Fallback: query users collection
                const usersSnap = await getDocs(collection(db, "users"));
                studs = usersSnap.docs
                    .map(d => ({ id: d.id, ...d.data() }) as any)
                    .filter((d: any) => {
                        const st = (d.status || "").toUpperCase();
                        return d.role === "student" &&
                            (d.className === normCls || d.className === myClass.className || d.currentClass === normCls) &&
                            d.section === normSec &&
                            st !== "LEFT" && st !== "TC" && st !== "INACTIVE";
                    })
                    .map((d: any) => ({
                        id: d.id,
                        firstName: d.firstName || d.name || "",
                        lastName: d.lastName || "",
                        admissionNumber: d.admissionNumber || "",
                    }));
            }
            studs.sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
            setStudents(studs);
        };
        load();
    }, [myClass]);

    // ── 5. Load existing marks for all 4 exams ────────────────────────────────
    useEffect(() => {
        if (!myClass || sessionExams.length === 0 || students.length === 0) return;
        const load = async () => {
            setIsLoadingMarks(true);
            try {
                const newMap: Record<string, Record<string, Record<string, string>>> = {};
                const newCoScho: Record<string, Record<string, { hy: string; annual: string }>> = {};

                for (const exam of sessionExams) {
                    if (!exam.id) continue;
                    newMap[exam.id] = {};
                    const normCls = myClass.className.replace(/^class\s*/i, "").trim();
                    for (const cls of [normCls, myClass.className]) {
                        try {
                            const snap = await getDocs(resultSectionCol(exam.id, cls, myClass.section));
                            if (snap.docs.length > 0) {
                                snap.docs.forEach(d => {
                                    const data = d.data();
                                    const entryMap: Record<string, string> = {};
                                    Object.entries(data.marks || {}).forEach(([subId, m]: [string, any]) => {
                                        if (exam.examType === "Unit Test") {
                                            entryMap[`${subId}__perTest`]  = m.perTest  !== null && m.perTest  !== undefined ? String(m.perTest)  : "";
                                            entryMap[`${subId}__noteBook`] = m.noteBook !== null && m.noteBook !== undefined ? String(m.noteBook) : "";
                                            entryMap[`${subId}__sea`]      = m.sea      !== null && m.sea      !== undefined ? String(m.sea)      : "";
                                        } else {
                                            entryMap[subId] = m.obtained !== null && m.obtained !== undefined ? String(m.obtained) : "";
                                        }
                                    });
                                    newMap[exam.id!][d.id] = entryMap;

                                    // co-scholastic (stored on Annual exam)
                                    if (exam.examType === "Annual Exam" && data.coScholastic) {
                                        newCoScho[d.id] = data.coScholastic;
                                    }
                                });
                                break;
                            }
                        } catch (err) { console.error("Error fetching marks for", cls, err); }
                    }
                }
                setResultsMap(newMap);
                setCoSchoMap(newCoScho);
            } catch (err) {
                console.error("Critical error in marks loader:", err);
            } finally {
                setIsLoadingMarks(false);
            }
        };
        load();
    }, [myClass, sessionExams, students]);

    // ── Helpers ───────────────────────────────────────────────────────────────
    const getExamByType = (type: string): Exam | undefined =>
        sessionExams.find(e => e.examType === type);

    // Get the Unit I or Unit II exam (since both have examType "Unit Test")
    const getUnitExam = (which: "unit1" | "unit2"): Exam | undefined => {
        const all = sessionExams.filter(e => e.examType === "Unit Test");
        if (which === "unit1") {
            // Match "Unit I" but NOT "Unit II" using regex negative lookahead
            return all.find(e => /unit\s+i(?!i)/i.test(e.name || "")) ?? all[0];
        }
        return all.find(e => /unit\s+ii/i.test(e.name || ""))
            ?? (all.length > 1 ? all[1] : undefined);
    };

    const currentExam = (): Exam | undefined => {
        if (activeTab === "unit1")      return getUnitExam("unit1");
        if (activeTab === "halfYearly") return getExamByType("Term Exam");
        if (activeTab === "unit2")      return getUnitExam("unit2");
        if (activeTab === "annual")     return getExamByType("Annual Exam");
    };

    const markVal = (examId: string, studentId: string, key: string) =>
        resultsMap[examId]?.[studentId]?.[key] ?? "";

    const setMarkVal = (examId: string, studentId: string, key: string, val: string) => {
        setResultsMap(prev => ({
            ...prev,
            [examId]: {
                ...prev[examId],
                [studentId]: {
                    ...(prev[examId]?.[studentId] || {}),
                    [key]: val,
                },
            },
        }));
    };

    const coVal = (studentId: string, actId: string, term: "hy" | "annual") =>
        coSchoMap[studentId]?.[actId]?.[term] ?? "";
    const setCoVal = (studentId: string, actId: string, term: "hy" | "annual", val: string) => {
        setCoSchoMap(prev => ({
            ...prev,
            [studentId]: {
                ...prev[studentId],
                [actId]: {
                    ...(prev[studentId]?.[actId] || { hy: "", annual: "" }),
                    [term]: val,
                },
            },
        }));
    };

    // ── Save marks ────────────────────────────────────────────────────────────
    const handleSave = async () => {
        const exam = currentExam();
        if (!exam?.id || !myClass) return;
        setIsSaving(true);
        const normCls = myClass.className.replace(/^class\s*/i, "").trim();
        const examId = exam.id;
        const isUnit = exam.examType === "Unit Test";
        const isTermOrAnnual = exam.examType === "Annual Exam" || exam.examType === "Term Exam";

        try {
            for (const student of students) {
                const entry = resultsMap[examId]?.[student.id] || {};
                const marks: Record<string, any> = {};

                if (isUnit) {
                    subjects.forEach(sub => {
                        const pt  = parseFloat(entry[`${sub.id}__perTest`]  || "") || 0;
                        const nb  = parseFloat(entry[`${sub.id}__noteBook`] || "") || 0;
                        const sea = parseFloat(entry[`${sub.id}__sea`]      || "") || 0;
                        const total = pt + nb + sea;
                        marks[sub.id] = {
                            subjectId: sub.id,
                            perTest: pt,
                            noteBook: nb,
                            sea: sea,
                            obtained: total,
                            total: 20,
                        };
                    });
                } else {
                    subjects.forEach(sub => {
                        const obt = parseFloat(entry[sub.id] || "") || 0;
                        const maxM = isTermOrAnnual ? 80 : sub.maxMarks;
                        marks[sub.id] = {
                            subjectId: sub.id,
                            obtained: obt,
                            total: maxM,
                        };
                    });
                }

                const totalObtained = Object.values(marks).reduce((s, m) => s + (m.obtained || 0), 0);
                const totalMax = subjects.reduce((s, sub) => s + (isUnit ? 20 : isTermOrAnnual ? 80 : sub.maxMarks), 0);
                const pct = totalMax > 0 ? (totalObtained / totalMax) * 100 : 0;

                const payload: Record<string, any> = {
                    studentId: student.id,
                    studentName: `${student.firstName} ${student.lastName}`.trim(),
                    examId,
                    examName: exam.name,
                    examType: exam.examType,
                    session: exam.session || "",
                    classId: normCls,
                    sectionId: myClass.section,
                    marks,
                    totalObtained,
                    totalMax,
                    percentage: Math.round(pct * 10) / 10,
                    overallGrade: calcGrade(pct),
                    updatedAt: Date.now(),
                };

                if (exam.examType === "Annual Exam") {
                    payload.coScholastic = coSchoMap[student.id] || {};
                }

                await setDoc(resultDocRef(examId, normCls, myClass.section, student.id), payload, { merge: true });
            }
            setSaveSuccess(activeTab);
            setTimeout(() => setSaveSuccess(null), 3000);
        } catch (err: any) {
            toast.error("Error saving marks: " + err.message);
        } finally {
            setIsSaving(false);
        }
    };

    // ─── Guard: not a class teacher ───────────────────────────────────────────
    if (isClassTeacher === null) {
        return (
            <div className="flex items-center justify-center p-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }
    if (isClassTeacher === false) {
        return (
            <div className="flex flex-col items-center justify-center p-16 gap-4 text-center">
                <ShieldAlert className="h-12 w-12 text-destructive" />
                <h2 className="text-xl font-bold">Access Restricted</h2>
                <p className="text-muted-foreground max-w-sm">
                    Only assigned Class Teachers can enter marks. Please contact the admin to assign you as a class teacher.
                </p>
            </div>
        );
    }

    // ─── Helpers for the active exam ──────────────────────────────────────────
    const exam = currentExam();
    const isUnit  = exam?.examType === "Unit Test";
    const isAnnual = exam?.examType === "Annual Exam";

    // Permission guards:
    // 1. Exam must be isActive (marks-entry open) — set by admin
    // 2. Exam must NOT be Published — once published, only admin can edit
    const isExamLocked  = exam?.status === "Published";  // published → teacher read-only
    const isExamInactive = exam ? (exam.isActive === false || exam.isActive === undefined) : false;
    const canEditMarks  = exam ? (!isExamLocked && !isExamInactive) : false;

    const tabs: { key: TabKey; label: string; term: string; color: string }[] = [
        { key: "unit1",      label: "Unit I Test",    term: "Term 1", color: "blue"    },
        { key: "halfYearly", label: "Half Yearly",    term: "Term 1", color: "indigo"  },
        { key: "unit2",      label: "Unit II Test",   term: "Term 2", color: "orange"  },
        { key: "annual",     label: "Annual Exam",    term: "Term 2", color: "emerald" },
    ];

    const tabColorClasses: Record<string, { active: string; badge: string }> = {
        blue:    { active: "border-blue-500 text-blue-700 bg-blue-50",    badge: "bg-blue-100 text-blue-700" },
        indigo:  { active: "border-indigo-500 text-indigo-700 bg-indigo-50",  badge: "bg-indigo-100 text-indigo-700" },
        orange:  { active: "border-orange-500 text-orange-700 bg-orange-50",  badge: "bg-orange-100 text-orange-700" },
        emerald: { active: "border-emerald-500 text-emerald-700 bg-emerald-50", badge: "bg-emerald-100 text-emerald-700" },
    };

    return (
        <div className="p-6 space-y-6 max-w-7xl">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        <BookOpen className="h-8 w-8 text-primary" /> Marks Entry
                    </h1>
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        {myClass && (
                            <Badge variant="secondary" className="text-sm font-semibold px-3 py-1">
                                Class {myClass.className} — {myClass.section}
                            </Badge>
                        )}
                        <span className="text-muted-foreground text-sm">{students.length} students</span>
                    </div>
                </div>

                {/* Session selector */}
                {sessions.length > 0 && (
                    <div className="flex items-center gap-2">
                        <Label className="text-sm whitespace-nowrap">Academic Session</Label>
                        <Select value={selectedSession} onValueChange={setSelectedSession}>
                            <SelectTrigger className="w-36">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {sessions.map(s => (
                                    <SelectItem key={s} value={s}>{s}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}
            </div>

            {/* Session not found */}
            {sessions.length === 0 && (
                <Card className="border-dashed bg-muted/5">
                    <CardContent className="py-12 text-center">
                        <AlertCircle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
                        <p className="font-semibold">No exam sessions configured</p>
                        <p className="text-muted-foreground text-sm mt-1">Ask admin to set up the academic session first.</p>
                    </CardContent>
                </Card>
            )}

            {sessions.length > 0 && (
                <>
                    {/* Term Labels + Tabs */}
                    <div className="space-y-1">
                        {/* Term Indicators */}
                        <div className="grid grid-cols-4">
                            <div className="col-span-2 text-xs font-bold text-blue-600 uppercase tracking-wide px-1 pb-1 border-b-2 border-blue-200">
                                ◀ Term 1
                            </div>
                            <div className="col-span-2 text-xs font-bold text-orange-600 uppercase tracking-wide px-1 pb-1 border-b-2 border-orange-200 text-right">
                                Term 2 ▶
                            </div>
                        </div>

                        {/* Exam Tabs */}
                        <div className="grid grid-cols-4 gap-1">
                            {tabs.map(tab => {
                                const tc = tabColorClasses[tab.color]!;
                                const isActive = activeTab === tab.key;
                                const tabExam = tab.key === "unit1" ? getUnitExam("unit1")
                                    : tab.key === "unit2" ? getUnitExam("unit2")
                                    : tab.key === "halfYearly" ? getExamByType("Term Exam")
                                    : getExamByType("Annual Exam");
                                const hasExam = !!tabExam;

                                return (
                                    <button
                                        key={tab.key}
                                        onClick={() => hasExam && setActiveTab(tab.key)}
                                        disabled={!hasExam}
                                        className={`py-3 px-2 rounded-lg border-2 text-sm font-semibold transition-all text-center ${
                                            !hasExam
                                                ? "opacity-40 border-dashed border-gray-200 bg-gray-50 cursor-not-allowed"
                                                : isActive
                                                    ? `${tc.active} border-current shadow-sm`
                                                    : "border-transparent hover:border-gray-200 hover:bg-gray-50 text-muted-foreground"
                                        }`}
                                    >
                                        <div>{tab.label}</div>
                                        {hasExam && (
                                            <div className={`text-xs mt-0.5 font-normal ${isActive ? "" : "text-muted-foreground"}`}>
                                                {tab.key === "unit1" || tab.key === "unit2" ? "/20 per sub" : "/80 per sub"}
                                            </div>
                                        )}
                                        {!hasExam && (
                                            <div className="text-xs mt-0.5 text-muted-foreground">Not set up</div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Exam not set up */}
                    {!exam && (
                        <Card className="border-dashed bg-muted/5">
                            <CardContent className="py-12 text-center">
                                <AlertCircle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
                                <p className="font-semibold">Exam not configured for session {selectedSession}</p>
                                <p className="text-muted-foreground text-sm mt-1">Ask admin to set up this exam.</p>
                            </CardContent>
                        </Card>
                    )}

                    {/* Marks Grid */}
                    {exam && (
                        <div className="space-y-5">

                            {/* ── Permission banners ── */}
                            {isExamLocked && (
                                <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700">
                                    <Lock className="h-5 w-5 mt-0.5 flex-shrink-0" />
                                    <div>
                                        <p className="font-semibold text-sm">Exam Published — Marks Locked</p>
                                        <p className="text-xs mt-0.5 text-red-600">
                                            This exam result has been published. Marks are now read-only for teachers.
                                            Contact the admin to unlock it for corrections.
                                        </p>
                                    </div>
                                </div>
                            )}
                            {!isExamLocked && isExamInactive && (
                                <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700">
                                    <PowerOff className="h-5 w-5 mt-0.5 flex-shrink-0" />
                                    <div>
                                        <p className="font-semibold text-sm">Marks Entry Disabled</p>
                                        <p className="text-xs mt-0.5 text-amber-600">
                                            This exam is currently inactive. The admin needs to activate it before you can enter or save marks.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Exam info strip */}
                            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-muted/20 border border-border/50 flex-wrap">
                                <div>
                                    <span className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Exam</span>
                                    <p className="font-bold text-base">{exam.name}</p>
                                </div>
                                <div className="ml-4">
                                    <span className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Max Marks / Subject</span>
                                    <p className="font-bold text-base">{isUnit ? "20" : "80"}</p>
                                </div>
                                {exam.startDate && exam.endDate && (
                                    <div className="ml-4">
                                        <span className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Dates</span>
                                        <p className="font-bold text-base">
                                            {new Date(exam.startDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                                            {" – "}
                                            {new Date(exam.endDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                                        </p>
                                    </div>
                                )}
                                {saveSuccess === activeTab && (
                                    <div className="ml-auto flex items-center gap-2 text-emerald-600 font-semibold text-sm">
                                        <CheckCircle2 className="h-5 w-5" /> Saved!
                                    </div>
                                )}
                            </div>

                            {isLoadingMarks && (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                    <span className="ml-2 text-muted-foreground">Loading existing marks...</span>
                                </div>
                            )}

                            {!isLoadingMarks && students.length === 0 && (
                                <Card className="border-dashed bg-muted/5">
                                    <CardContent className="py-12 text-center">
                                        <AlertCircle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
                                        <p className="font-semibold">No students found</p>
                                        <p className="text-muted-foreground text-sm mt-1">No students enrolled in Class {myClass!.className} — {myClass!.section}</p>
                                    </CardContent>
                                </Card>
                            )}

                            {!isLoadingMarks && students.length > 0 && subjects.length === 0 && (
                                <Card className="border-dashed bg-muted/5">
                                    <CardContent className="py-12 text-center">
                                        <AlertCircle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
                                        <p className="font-semibold">No subjects configured</p>
                                        <p className="text-muted-foreground text-sm mt-1">Please ask the administration to configure subjects for Class {myClass!.className} before entering marks.</p>
                                    </CardContent>
                                </Card>
                            )}

                            {!isLoadingMarks && students.length > 0 && subjects.length > 0 && (
                                <div className="overflow-x-auto rounded-xl border border-border/60 shadow-sm">
                                    <table className="w-full text-sm border-collapse">
                                        <thead>
                                            <tr className="bg-slate-800 text-white">
                                                <th className="text-left px-4 py-3 font-semibold w-8">#</th>
                                                <th className="text-left px-4 py-3 font-semibold min-w-[180px]">Student</th>
                                                <th className="text-left px-3 py-3 font-semibold text-xs text-slate-300 w-24">Adm. No.</th>

                                                {/* Unit Test columns: Per Test / Note Book / SEA per subject */}
                                                {isUnit && subjects.map(sub => (
                                                    <th key={sub.id} className="text-center px-2 py-3 font-semibold border-l border-slate-600">
                                                        <div className="text-xs leading-tight">{sub.name}</div>
                                                        <div className="flex justify-center gap-0.5 mt-1 text-[10px] font-normal text-slate-300">
                                                            <span className="w-10 text-center">PT/10</span>
                                                            <span className="w-10 text-center">NB/5</span>
                                                            <span className="w-10 text-center">SEA/5</span>
                                                        </div>
                                                    </th>
                                                ))}

                                                {/* Standard / Annual: single column per subject */}
                                                {!isUnit && subjects.map(sub => (
                                                    <th key={sub.id} className="text-center px-2 py-3 font-semibold min-w-[80px] border-l border-slate-600">
                                                        <div className="text-xs leading-tight">{sub.name}</div>
                                                        <div className="text-xs font-normal text-slate-300 mt-0.5">{exam?.examType === "Term Exam" || isAnnual ? "/80" : `/${sub.maxMarks}`}</div>
                                                    </th>
                                                ))}

                                                {/* Total column */}
                                                <th className="text-center px-3 py-3 font-semibold min-w-[70px] border-l-2 border-slate-500 bg-slate-900">
                                                    <div className="text-xs">Total</div>
                                                    <div className="text-xs font-normal text-slate-300 mt-0.5">
                                                        /{isUnit ? subjects.length * 20 : subjects.length * (exam?.examType === "Term Exam" || isAnnual ? 80 : 100)}
                                                    </div>
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {students.map((student, idx) => (
                                                <tr
                                                    key={student.id}
                                                    className={`border-b border-border/40 transition-colors ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"} hover:bg-primary/5`}
                                                >
                                                    <td className="px-4 py-2.5 text-muted-foreground text-xs font-medium">{idx + 1}</td>
                                                    <td className="px-4 py-2.5">
                                                        <p className="font-semibold text-sm leading-tight">
                                                            {student.firstName} {student.lastName}
                                                        </p>
                                                    </td>
                                                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{student.admissionNumber}</td>

                                                    {/* Unit Test sub-cells */}
                                                    {isUnit && subjects.map(sub => (
                                                        <td key={sub.id} className="border-l border-border/30 px-1 py-1.5">
                                                            <div className="flex justify-center gap-0.5">
                                                                {(["perTest", "noteBook", "sea"] as const).map(field => {
                                                                    const max = field === "perTest" ? 10 : 5;
                                                                    const key = `${sub.id}__${field}`;
                                                                    const val = markVal(exam.id!, student.id, key);
                                                                    const numVal = parseFloat(val);
                                                                    const isOver = !isNaN(numVal) && numVal > max;
                                                                    return (
                                                                        <input
                                                                            key={field}
                                                                            type="number"
                                                                            min={0}
                                                                            max={max}
                                                                            value={val}
                                                                            disabled={!canEditMarks}
                                                                            onChange={e => setMarkVal(exam.id!, student.id, key, e.target.value)}
                                                                            className={`w-10 h-8 text-center text-xs rounded border ${!canEditMarks ? "bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200" : isOver ? "border-red-400 bg-red-50 text-red-700" : "border-border/50 focus:border-primary"} focus:outline-none focus:ring-1 focus:ring-primary/30`}
                                                                        />
                                                                    );
                                                                })}
                                                            </div>
                                                        </td>
                                                    ))}

                                                    {/* Standard / Annual single cell */}
                                                    {!isUnit && subjects.map(sub => {
                                                        const val = markVal(exam.id!, student.id, sub.id);
                                                        const numVal = parseFloat(val);
                                                        const max = exam?.examType === "Term Exam" || isAnnual ? 80 : sub.maxMarks;
                                                        const isOver = !isNaN(numVal) && numVal > max;
                                                        return (
                                                            <td key={sub.id} className="border-l border-border/30 px-2 py-1.5">
                                                                <input
                                                                    type="number"
                                                                    min={0}
                                                                    max={max}
                                                                    value={val}
                                                                    disabled={!canEditMarks}
                                                                    onChange={e => setMarkVal(exam.id!, student.id, sub.id, e.target.value)}
                                                                    className={`w-16 h-8 text-center text-xs rounded border ${!canEditMarks ? "bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200" : isOver ? "border-red-400 bg-red-50 text-red-700" : "border-border/50 focus:border-primary"} focus:outline-none focus:ring-1 focus:ring-primary/30`}
                                                                />
                                                            </td>
                                                        );
                                                    })}

                                                    {/* Total cell */}
                                                    {(() => {
                                                        let total = 0;
                                                        if (isUnit) {
                                                            subjects.forEach(sub => {
                                                                const pt = parseFloat(markVal(exam.id!, student.id, `${sub.id}__perTest`) || "0") || 0;
                                                                const nb = parseFloat(markVal(exam.id!, student.id, `${sub.id}__noteBook`) || "0") || 0;
                                                                const se = parseFloat(markVal(exam.id!, student.id, `${sub.id}__sea`) || "0") || 0;
                                                                total += pt + nb + se;
                                                            });
                                                        } else {
                                                            subjects.forEach(sub => {
                                                                total += parseFloat(markVal(exam.id!, student.id, sub.id) || "0") || 0;
                                                            });
                                                        }
                                                        return (
                                                            <td className="border-l-2 border-border/50 px-2 py-1.5 bg-slate-50/80 text-center">
                                                                <span className="font-bold text-sm text-primary">{total}</span>
                                                            </td>
                                                        );
                                                    })()}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Co-Scholastic (Annual only) */}
                            {isAnnual && !isLoadingMarks && students.length > 0 && (
                                <div className="space-y-3">
                                    <h3 className="text-base font-bold flex items-center gap-2">
                                        <BookOpen className="h-4 w-4 text-emerald-600" />
                                        Co-Scholastic Activities
                                        <span className="text-xs font-normal text-muted-foreground ml-1">Grade: A / B / C / D</span>
                                    </h3>
                                    <div className="overflow-x-auto rounded-xl border border-border/60 shadow-sm">
                                        <table className="w-full text-sm border-collapse">
                                            <thead>
                                                <tr className="bg-emerald-800 text-white">
                                                    <th className="text-left px-4 py-3 font-semibold w-8">#</th>
                                                    <th className="text-left px-4 py-3 font-semibold min-w-[200px]">Student</th>
                                                    {CO_SCHOLASTIC_ITEMS.map(cs => (
                                                        <th key={cs.id} colSpan={2} className="text-center px-2 py-3 font-semibold border-l border-emerald-700 min-w-[140px]">
                                                            <div className="text-xs">{cs.label}</div>
                                                            <div className="flex justify-around text-xs font-normal text-emerald-200 mt-1">
                                                                <span>HY</span>
                                                                <span>Annual</span>
                                                            </div>
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {students.map((student, idx) => (
                                                    <tr key={student.id} className={`border-b border-border/40 ${idx % 2 === 0 ? "bg-white" : "bg-emerald-50/30"}`}>
                                                        <td className="px-4 py-2.5 text-muted-foreground text-xs">{idx + 1}</td>
                                                        <td className="px-4 py-2.5 font-semibold text-sm">{student.firstName} {student.lastName}</td>
                                                        {CO_SCHOLASTIC_ITEMS.map(cs => (
                                                            <td key={cs.id} className="border-l border-border/30 px-2 py-2">
                                                                <div className="flex gap-2 justify-center">
                                                                    {(["hy", "annual"] as const).map(term => (
                                                                        <select
                                                                            key={term}
                                                                            value={coVal(student.id, cs.id, term)}
                                                                            disabled={!canEditMarks}
                                                                            onChange={e => setCoVal(student.id, cs.id, term, e.target.value)}
                                                                            className={`w-16 h-8 text-center text-xs rounded border focus:outline-none focus:ring-1 focus:ring-emerald-400 ${!canEditMarks ? "bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200" : "bg-white border-border/50"}`}
                                                                        >
                                                                            <option value="">—</option>
                                                                            {CO_SCHO_GRADES.map(g => (
                                                                                <option key={g} value={g}>{g}</option>
                                                                            ))}
                                                                        </select>
                                                                    ))}
                                                                </div>
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* Save Button — only visible when teacher can edit */}
                            {!isLoadingMarks && students.length > 0 && (
                                <div className="flex justify-end pt-2">
                                    {canEditMarks ? (
                                        <Button
                                            onClick={handleSave}
                                            disabled={isSaving}
                                            size="lg"
                                            className="gap-2 min-w-[180px]"
                                        >
                                            {isSaving
                                                ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
                                                : <><Save className="h-4 w-4" /> Save {tabs.find(t => t.key === activeTab)?.label} Marks</>
                                            }
                                        </Button>
                                    ) : (
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground px-4 py-2 rounded-lg bg-muted/30 border">
                                            <Lock className="h-4 w-4" />
                                            {isExamLocked ? "Marks locked — exam is published" : "Activate exam to enable mark entry"}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
