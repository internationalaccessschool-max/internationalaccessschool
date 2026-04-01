"use client";

import { useState, useEffect } from "react";
import {
    collection, getDocs, doc, getDoc,
    setDoc, query, where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { Exam, Result, SubjectMark } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, Save, ShieldAlert } from "lucide-react";

interface SubjectEntry {
    id: string;
    name: string;
    maxMarks: number;
}

interface StudentRow {
    id: string;
    firstName: string;
    lastName: string;
    admissionNumber: string;
}

// Standard grade calc (for non-4-exam exams)
const calculateGrade = (pct: number) => {
    if (pct >= 90.5) return "A1";
    if (pct >= 81) return "A2";
    if (pct >= 71) return "B1";
    if (pct >= 61) return "B2";
    if (pct >= 51) return "C1";
    if (pct >= 41) return "C2";
    if (pct >= 33) return "D";
    return "E";
};

/** Nested result path */
function resultDocRef(examId: string, classId: string, sectionId: string, studentId: string) {
    return doc(db, "results", examId, "classes", classId, "sections", sectionId, "students", studentId);
}
function resultSectionCol(examId: string, classId: string, sectionId: string) {
    return collection(db, "results", examId, "classes", classId, "sections", sectionId, "students");
}

// For Unit Test: marks map has sub-keys like subId__perTest, subId__noteBook, subId__sea
// For others: single key subId

const CO_SCHOLASTIC_ITEMS = [
    { id: "workEd", label: "Work Education" },
    { id: "artEd", label: "Art Education" },
    { id: "sports", label: "Sports / Yoga / NCC" },
];
const CO_SCHO_GRADES = ["A", "B", "C", "D"];

export default function TeacherMarksPage() {
    const { user } = useAuth();

    const [myClass, setMyClass] = useState<{ className: string; section: string } | null>(null);
    const [isClassTeacher, setIsClassTeacher] = useState<boolean | null>(null);

    const [exams, setExams] = useState<Exam[]>([]);
    const [subjects, setSubjects] = useState<SubjectEntry[]>([]);
    const [students, setStudents] = useState<StudentRow[]>([]);

    // resultsMap: studentId -> { subjectId or subjectId__perTest etc -> value string }
    const [resultsMap, setResultsMap] = useState<Record<string, Record<string, string>>>({});

    // coScholastic: studentId -> { activityId -> { hy: string, annual: string } }
    const [coSchoMap, setCoSchoMap] = useState<Record<string, Record<string, { hy: string; annual: string }>>>({});

    const [selectedExamId, setSelectedExamId] = useState("");
    const [selectedExam, setSelectedExam] = useState<Exam | null>(null);

    const [isLoadingMeta, setIsLoadingMeta] = useState(true);
    const [isLoadingStudents, setIsLoadingStudents] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Step 1: Find if this teacher is a class teacher and which class they manage
    useEffect(() => {
        if (!user) return;

        const findClassTeacher = async () => {
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

                let foundClass: { className: string; section: string } | null = null;

                if (teacherSnap.exists()) {
                    const data = teacherSnap.data();
                    const a = data.assignment;
                    let matches: { cls: string, section: string }[] = [];

                    if (a?.classSections) {
                        Object.entries(a.classSections).forEach(([cls, secs]: [string, any]) => {
                            if (Array.isArray(secs)) {
                                secs.forEach((sec: string) => matches.push({ cls, section: sec }));
                            }
                        });
                    } else if (a?.classes?.length) {
                        (a.classes as string[]).forEach((c: string) => {
                            (a.sections || []).forEach((s: string) => matches.push({ cls: c, section: s }));
                        });
                    }

                    if (matches.length === 0) {
                        const ctSnap = await getDocs(collection(db, "class_teachers"));
                        ctSnap.docs.forEach(d => {
                            const ctData = d.data();
                            if (
                                ctData.teacherId === user.uid ||
                                (data.email && ctData.teacherEmail === data.email) ||
                                ctData.teacherName === `${data.firstName || ""} ${data.lastName || ""}`.trim()
                            ) {
                                matches.push({ cls: ctData.cls, section: ctData.section });
                            }
                        });
                    }

                    if (matches.length > 0) {
                        foundClass = { className: matches[0].cls, section: matches[0].section };
                    }
                }

                if (foundClass) {
                    setIsClassTeacher(true);
                    setMyClass(foundClass);

                    const rawClassName = (foundClass as any).className as string;
                    const normClass = rawClassName.replace(/^class\s*/i, "").trim();

                    let subjectsLoaded = false;
                    for (const key of [normClass, rawClassName]) {
                        const subDoc = await getDoc(doc(db, "classSubjects", key));
                        if (subDoc.exists()) {
                            const rawSubjects = subDoc.data().subjects || [];
                            const subjectEntries = rawSubjects.map((s: any) =>
                                typeof s === "object"
                                    ? { id: s.id || s.name, name: s.name, maxMarks: s.maxMarks || 100 }
                                    : { id: s, name: s, maxMarks: 100 }
                            );
                            setSubjects(subjectEntries);
                            subjectsLoaded = true;
                            break;
                        }
                    }
                    if (!subjectsLoaded) setSubjects([]);

                    const examsSnap = await getDocs(collection(db, "exams"));
                    const applicableExams = examsSnap.docs
                        .map(d => ({ id: d.id, ...d.data() }) as Exam)
                        .filter(e => {
                            const classes = e.classesApplicable ?? [];
                            return (
                                (e.status === "Published" || e.status === "Draft") &&
                                (classes.includes(normClass) || classes.includes(rawClassName))
                            );
                        });
                    setExams(applicableExams);
                } else {
                    setIsClassTeacher(false);
                }
            } catch (err) {
                console.error("Error checking class teacher:", err);
                setIsClassTeacher(false);
            } finally {
                setIsLoadingMeta(false);
            }
        };

        findClassTeacher();
    }, [user]);

    // Update selectedExam whenever selectedExamId changes
    useEffect(() => {
        const exam = exams.find(e => e.id === selectedExamId) || null;
        setSelectedExam(exam);
    }, [selectedExamId, exams]);

    // Step 2: Load students and existing marks when exam is selected
    useEffect(() => {
        if (!myClass || !selectedExamId) {
            setStudents([]);
            setResultsMap({});
            setCoSchoMap({});
            return;
        }

        const loadData = async () => {
            setIsLoadingStudents(true);
            try {
                const normMyClass = myClass.className.replace(/^class\s*/i, "").trim();

                let allProfiles: any[] = [];

                const directSnap = await getDocs(
                    collection(db, "users", "classes", myClass.className, "sections", myClass.section, "students", "profiles")
                );
                allProfiles = directSnap.docs.map(d => ({ id: d.id, ...d.data() }));

                if (allProfiles.length === 0) {
                    const altSnap = await getDocs(
                        collection(db, "users", "classes", normMyClass, "sections", myClass.section, "students", "profiles")
                    );
                    allProfiles = altSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                }

                if (allProfiles.length === 0) {
                    const usersSnap = await getDocs(query(collection(db, "users"), where("role", "==", "student")));
                    allProfiles = usersSnap.docs
                        .map((d): any => ({ id: d.id, ...d.data() }))
                        .filter((d: any) => {
                            const cls = d.className || d.currentClass || "";
                            return (cls === myClass.className || cls === normMyClass) && d.section === myClass.section;
                        });
                }

                const seenIds = new Set<string>();
                const filtered: StudentRow[] = [];
                for (const data of allProfiles) {
                    if (seenIds.has(data.id)) continue;
                    seenIds.add(data.id);
                    filtered.push({
                        id: data.id,
                        firstName: data.firstName || "",
                        lastName: data.lastName || "",
                        admissionNumber: data.admissionNumber || "—",
                    });
                }
                filtered.sort((a, b) => a.firstName.localeCompare(b.firstName));
                setStudents(filtered);

                const initMap: Record<string, Record<string, string>> = {};
                const initCoScho: Record<string, Record<string, { hy: string; annual: string }>> = {};
                filtered.forEach(s => {
                    initMap[s.id] = {};
                    initCoScho[s.id] = {};
                    CO_SCHOLASTIC_ITEMS.forEach(cs => {
                        initCoScho[s.id][cs.id] = { hy: "", annual: "" };
                    });
                });

                // Fetch existing results from nested path
                const resultsSnap = await getDocs(
                    resultSectionCol(selectedExamId, myClass.className, myClass.section)
                );
                resultsSnap.docs.forEach(d => {
                    const data = d.data() as Result;
                    if (initMap[d.id]) {
                        Object.entries(data.marks).forEach(([subId, markData]) => {
                            if (markData.obtained !== null) {
                                initMap[d.id][subId] = String(markData.obtained);
                            }
                            // Restore sub-marks if present
                            if (markData.perTest !== undefined && markData.perTest !== null) {
                                initMap[d.id][`${subId}__perTest`] = String(markData.perTest);
                            }
                            if (markData.noteBook !== undefined && markData.noteBook !== null) {
                                initMap[d.id][`${subId}__noteBook`] = String(markData.noteBook);
                            }
                            if (markData.sea !== undefined && markData.sea !== null) {
                                initMap[d.id][`${subId}__sea`] = String(markData.sea);
                            }
                        });
                        // Restore co-scholastic if present
                        if (data.coScholastic) {
                            Object.entries(data.coScholastic).forEach(([csId, val]) => {
                                initCoScho[d.id][csId] = { hy: val.hy || "", annual: val.annual || "" };
                            });
                        }
                    }
                });

                // Fallback: old flat path
                await Promise.all(filtered.map(async student => {
                    if (Object.keys(initMap[student.id]).length > 0) return;
                    const oldRef = doc(db, "results", `${selectedExamId}_${student.id}`);
                    const oldSnap = await getDoc(oldRef);
                    if (oldSnap.exists()) {
                        const oldData = oldSnap.data() as Result;
                        Object.entries(oldData.marks).forEach(([subId, markData]) => {
                            if (markData.obtained !== null) {
                                initMap[student.id][subId] = String(markData.obtained);
                            }
                        });
                    }
                }));

                setResultsMap(initMap);
                setCoSchoMap(initCoScho);
            } catch (err) {
                console.error("Error loading data:", err);
                alert("Failed to load student data.");
            } finally {
                setIsLoadingStudents(false);
            }
        };

        loadData();
    }, [myClass, selectedExamId]);

    const handleMarkChange = (studentId: string, key: string, value: string) => {
        if (value !== "" && isNaN(Number(value))) return;
        setResultsMap(prev => ({
            ...prev,
            [studentId]: { ...prev[studentId], [key]: value },
        }));
    };

    const handleCoSchoChange = (studentId: string, actId: string, term: "hy" | "annual", value: string) => {
        setCoSchoMap(prev => ({
            ...prev,
            [studentId]: {
                ...prev[studentId],
                [actId]: {
                    ...(prev[studentId]?.[actId] || { hy: "", annual: "" }),
                    [term]: value,
                },
            },
        }));
    };

    const handleSave = async () => {
        if (!selectedExamId || !myClass || !selectedExam) return;
        setIsSaving(true);
        const isUnitTest = selectedExam.examType === "Unit Test";
        const isAnnual = selectedExam.examType === "Annual Exam";
        let saved = 0;
        try {
            await Promise.all(students.map(async student => {
                const studentMarks = resultsMap[student.id] || {};
                const hasAnyData = Object.values(studentMarks).some(v => v !== "");
                const hasCoScho = isAnnual && Object.values(coSchoMap[student.id] || {}).some(v => v.hy || v.annual);
                if (!hasAnyData && !hasCoScho) return;

                const processedMarks: Record<string, SubjectMark> = {};
                let totalObtained = 0;
                let totalMax = 0;

                subjects.forEach(sub => {
                    if (isUnitTest) {
                        const perTestStr = studentMarks[`${sub.id}__perTest`] || "";
                        const noteBookStr = studentMarks[`${sub.id}__noteBook`] || "";
                        const seaStr = studentMarks[`${sub.id}__sea`] || "";

                        if (!perTestStr && !noteBookStr && !seaStr) return;

                        const perTest = perTestStr !== "" ? Math.min(Number(perTestStr), 10) : null;
                        const noteBook = noteBookStr !== "" ? Math.min(Number(noteBookStr), 5) : null;
                        const sea = seaStr !== "" ? Math.min(Number(seaStr), 5) : null;

                        const obtained = (perTest ?? 0) + (noteBook ?? 0) + (sea ?? 0);
                        processedMarks[sub.id] = {
                            subjectId: sub.id,
                            obtained,
                            total: 20,
                            perTest,
                            noteBook,
                            sea,
                        };
                        totalObtained += obtained;
                        totalMax += 20;
                    } else {
                        const valStr = studentMarks[sub.id];
                        if (!valStr || valStr.trim() === "") return;
                        const maxMarks = (selectedExam.examType === "Term Exam" || selectedExam.examType === "Annual Exam") ? 80 : sub.maxMarks;
                        const obtained = Math.min(Number(valStr), maxMarks);
                        processedMarks[sub.id] = { subjectId: sub.id, obtained, total: maxMarks };
                        totalObtained += obtained;
                        totalMax += maxMarks;
                    }
                });

                const percentage = totalMax > 0 ? Number(((totalObtained / totalMax) * 100).toFixed(2)) : 0;
                const resultPayload: Partial<Result> = {
                    studentId: student.id,
                    examId: selectedExamId,
                    classId: myClass.className,
                    sectionId: myClass.section,
                    marks: processedMarks,
                    totalObtained,
                    totalMax,
                    percentage,
                    overallGrade: calculateGrade(percentage),
                    updatedAt: Date.now(),
                };

                if (isAnnual) {
                    const coScho = coSchoMap[student.id] || {};
                    const coSchoPayload: Record<string, { hy?: string; annual?: string }> = {};
                    CO_SCHOLASTIC_ITEMS.forEach(cs => {
                        const val = coScho[cs.id];
                        if (val && (val.hy || val.annual)) {
                            coSchoPayload[cs.id] = { hy: val.hy, annual: val.annual };
                        }
                    });
                    if (Object.keys(coSchoPayload).length > 0) {
                        resultPayload.coScholastic = coSchoPayload;
                    }
                }

                await setDoc(
                    resultDocRef(selectedExamId, myClass.className, myClass.section, student.id),
                    resultPayload,
                    { merge: true }
                );
                saved++;
            }));
            alert(`Marks saved for ${saved} student(s).`);
        } catch (err: any) {
            console.error("Save error:", err);
            alert("Failed to save marks: " + err.message);
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoadingMeta) {
        return (
            <div className="flex items-center justify-center p-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (isClassTeacher === false) {
        return (
            <div className="flex flex-col items-center justify-center p-16 gap-4 text-center">
                <ShieldAlert className="h-16 w-16 text-muted-foreground/40" />
                <h2 className="text-xl font-semibold">Not a Class Teacher</h2>
                <p className="text-muted-foreground max-w-md">
                    You are not assigned as a class teacher for any class. Contact the admin to get assigned.
                </p>
            </div>
        );
    }

    const isExamPublished = selectedExam?.status === "Published";
    const isUnitTest = selectedExam?.examType === "Unit Test";
    const isTermOrAnnual = selectedExam?.examType === "Term Exam" || selectedExam?.examType === "Annual Exam";
    const isAnnualExam = selectedExam?.examType === "Annual Exam";
    const maxPerSubject = isUnitTest ? 20 : isTermOrAnnual ? 80 : null;

    return (
        <div className="p-6 space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Enter Marks</h1>
                    <p className="text-muted-foreground">
                        Class: <strong>{myClass?.className}</strong> — Section: <strong>{myClass?.section}</strong>
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {isExamPublished && (
                        <span className="text-sm font-medium text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-200 flex items-center gap-1.5">
                            <ShieldAlert className="w-4 h-4" />
                            Published exams cannot be edited by teachers
                        </span>
                    )}
                    <Button
                        onClick={handleSave}
                        disabled={isSaving || students.length === 0 || !selectedExamId || isExamPublished}
                    >
                        {isSaving
                            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                            : <><Save className="mr-2 h-4 w-4" /> Save All Marks</>}
                    </Button>
                </div>
            </div>

            <Card className="border-border/50 shadow-sm">
                <CardHeader className="bg-muted/10 border-b pb-4">
                    <div className="space-y-2 max-w-xs">
                        <Label>Select Examination</Label>
                        <Select value={selectedExamId} onValueChange={setSelectedExamId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Choose an exam..." />
                            </SelectTrigger>
                            <SelectContent>
                                {exams.length === 0
                                    ? <SelectItem value="_none" disabled>No exams available</SelectItem>
                                    : exams.map(e => (
                                        <SelectItem key={e.id} value={e.id!}>
                                            {e.name}{e.examType && e.examType !== "Standard" ? ` (${e.examType})` : ""} ({e.status})
                                        </SelectItem>
                                    ))
                                }
                            </SelectContent>
                        </Select>
                    </div>
                    {selectedExam && selectedExam.examType && selectedExam.examType !== "Standard" && (
                        <div className="mt-2 flex gap-2 flex-wrap">
                            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                                isUnitTest ? "bg-blue-50 text-blue-700 border-blue-200" :
                                isAnnualExam ? "bg-purple-50 text-purple-700 border-purple-200" :
                                "bg-green-50 text-green-700 border-green-200"
                            }`}>
                                {selectedExam.examType}
                                {isUnitTest && " — Per Test (10) + Note Book (5) + SEA (5) = 20"}
                                {isTermOrAnnual && " — 80 marks per subject"}
                            </span>
                            {selectedExam.session && (
                                <span className="text-xs font-semibold px-2.5 py-1 rounded-full border bg-amber-50 text-amber-700 border-amber-200">
                                    Session: {selectedExam.session}
                                </span>
                            )}
                        </div>
                    )}
                </CardHeader>

                <CardContent className="p-0">
                    {!selectedExamId ? (
                        <div className="py-12 text-center text-muted-foreground">
                            Select an exam above to load the marks entry grid.
                        </div>
                    ) : isLoadingStudents ? (
                        <div className="py-12 flex items-center justify-center gap-2 text-muted-foreground">
                            <Loader2 className="h-5 w-5 animate-spin" /> Loading students...
                        </div>
                    ) : students.length === 0 ? (
                        <div className="py-12 text-center text-muted-foreground">
                            No students found in {myClass?.className} - {myClass?.section}.
                        </div>
                    ) : subjects.length === 0 ? (
                        <div className="py-12 text-center text-muted-foreground">
                            No subjects configured for {myClass?.className}. Ask admin to set up class subjects.
                        </div>
                    ) : isUnitTest ? (
                        /* ── Unit Test: 3 sub-columns per subject ── */
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left border-collapse">
                                <thead className="text-xs text-muted-foreground uppercase bg-muted/30 border-b sticky top-0">
                                    <tr>
                                        <th className="px-4 py-3 font-medium sticky left-0 bg-muted/30 min-w-[180px]" rowSpan={2}>Student</th>
                                        <th className="px-4 py-3 font-medium min-w-[80px]" rowSpan={2}>Adm No.</th>
                                        {subjects.map(sub => (
                                            <th key={sub.id} className="px-2 py-2 font-medium text-center border-l" colSpan={3}>
                                                {sub.name} <span className="normal-case font-normal text-[10px]">(Max 20)</span>
                                            </th>
                                        ))}
                                    </tr>
                                    <tr>
                                        {subjects.map(sub => (
                                            <>
                                                <th key={`${sub.id}_pt`} className="px-2 py-2 text-center font-medium border-l min-w-[70px]">
                                                    Per Test<br /><span className="font-normal text-[10px] normal-case">/10</span>
                                                </th>
                                                <th key={`${sub.id}_nb`} className="px-2 py-2 text-center font-medium min-w-[70px]">
                                                    Note Book<br /><span className="font-normal text-[10px] normal-case">/5</span>
                                                </th>
                                                <th key={`${sub.id}_sea`} className="px-2 py-2 text-center font-medium min-w-[70px]">
                                                    SEA<br /><span className="font-normal text-[10px] normal-case">/5</span>
                                                </th>
                                            </>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {students.map(student => (
                                        <tr key={student.id} className="hover:bg-muted/10 transition-colors">
                                            <td className="px-4 py-3 font-medium sticky left-0 bg-white shadow-[1px_0_0_0_rgba(0,0,0,0.05)]">
                                                {student.firstName} {student.lastName}
                                            </td>
                                            <td className="px-4 py-3 text-xs text-muted-foreground">
                                                {student.admissionNumber || "—"}
                                            </td>
                                            {subjects.map(sub => {
                                                const ptVal = resultsMap[student.id]?.[`${sub.id}__perTest`] || "";
                                                const nbVal = resultsMap[student.id]?.[`${sub.id}__noteBook`] || "";
                                                const seaVal = resultsMap[student.id]?.[`${sub.id}__sea`] || "";
                                                return (
                                                    <>
                                                        <td key={`${sub.id}_pt`} className="px-2 py-2 border-l">
                                                            <Input type="number" min={0} max={10} placeholder="—"
                                                                value={ptVal}
                                                                onChange={e => handleMarkChange(student.id, `${sub.id}__perTest`, e.target.value)}
                                                                disabled={isExamPublished}
                                                                className={`w-full text-center h-9 ${Number(ptVal) > 10 ? "text-red-500 border-red-400" : ""} ${isExamPublished ? "bg-muted cursor-not-allowed opacity-70" : ""}`}
                                                            />
                                                        </td>
                                                        <td key={`${sub.id}_nb`} className="px-2 py-2">
                                                            <Input type="number" min={0} max={5} placeholder="—"
                                                                value={nbVal}
                                                                onChange={e => handleMarkChange(student.id, `${sub.id}__noteBook`, e.target.value)}
                                                                disabled={isExamPublished}
                                                                className={`w-full text-center h-9 ${Number(nbVal) > 5 ? "text-red-500 border-red-400" : ""} ${isExamPublished ? "bg-muted cursor-not-allowed opacity-70" : ""}`}
                                                            />
                                                        </td>
                                                        <td key={`${sub.id}_sea`} className="px-2 py-2">
                                                            <Input type="number" min={0} max={5} placeholder="—"
                                                                value={seaVal}
                                                                onChange={e => handleMarkChange(student.id, `${sub.id}__sea`, e.target.value)}
                                                                disabled={isExamPublished}
                                                                className={`w-full text-center h-9 ${Number(seaVal) > 5 ? "text-red-500 border-red-400" : ""} ${isExamPublished ? "bg-muted cursor-not-allowed opacity-70" : ""}`}
                                                            />
                                                        </td>
                                                    </>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        /* ── Standard / Term Exam / Annual Exam: single column per subject ── */
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-muted-foreground uppercase bg-muted/30 border-b sticky top-0">
                                    <tr>
                                        <th className="px-4 py-4 font-medium sticky left-0 bg-muted/30 min-w-[200px]">Student</th>
                                        <th className="px-4 py-4 font-medium w-28">Adm No.</th>
                                        {subjects.map(sub => (
                                            <th key={sub.id} className="px-4 py-4 font-medium text-center min-w-[120px]">
                                                {sub.name}
                                                <br />
                                                <span className="text-[10px] font-normal normal-case text-muted-foreground">
                                                    (Max {maxPerSubject ?? sub.maxMarks})
                                                </span>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {students.map(student => (
                                        <tr key={student.id} className="hover:bg-muted/10 transition-colors">
                                            <td className="px-4 py-3 font-medium sticky left-0 bg-white shadow-[1px_0_0_0_rgba(0,0,0,0.05)]">
                                                {student.firstName} {student.lastName}
                                            </td>
                                            <td className="px-4 py-3 text-xs text-muted-foreground">
                                                {student.admissionNumber || "—"}
                                            </td>
                                            {subjects.map(sub => {
                                                const effectiveMax = maxPerSubject ?? sub.maxMarks;
                                                const val = resultsMap[student.id]?.[sub.id] || "";
                                                const isOver = val !== "" && Number(val) > effectiveMax;
                                                return (
                                                    <td key={sub.id} className="px-4 py-2">
                                                        <Input
                                                            type="number"
                                                            min={0}
                                                            max={effectiveMax}
                                                            placeholder="—"
                                                            value={val}
                                                            onChange={e => handleMarkChange(student.id, sub.id, e.target.value)}
                                                            disabled={isExamPublished}
                                                            className={`w-full text-center h-9 ${isOver ? "text-red-500 border-red-400" : ""} ${isExamPublished ? "bg-muted cursor-not-allowed opacity-70" : ""}`}
                                                        />
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Co-Scholastic section — only for Annual Exam */}
            {isAnnualExam && students.length > 0 && (
                <Card className="border-border/50 shadow-sm">
                    <CardHeader className="bg-muted/10 border-b pb-3">
                        <h2 className="text-lg font-semibold">Co-Scholastic Activities</h2>
                        <p className="text-sm text-muted-foreground">Enter grades (A/B/C/D) for each activity. Half Yearly and Annual columns.</p>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-muted-foreground uppercase bg-muted/30 border-b">
                                    <tr>
                                        <th className="px-4 py-3 font-medium sticky left-0 bg-muted/30 min-w-[200px]">Student</th>
                                        {CO_SCHOLASTIC_ITEMS.map(cs => (
                                            <>
                                                <th key={`${cs.id}_hy`} className="px-3 py-3 font-medium text-center min-w-[120px] border-l">
                                                    {cs.label}<br /><span className="font-normal normal-case text-[10px]">Half Yearly</span>
                                                </th>
                                                <th key={`${cs.id}_an`} className="px-3 py-3 font-medium text-center min-w-[120px]">
                                                    {cs.label}<br /><span className="font-normal normal-case text-[10px]">Annual</span>
                                                </th>
                                            </>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {students.map(student => (
                                        <tr key={student.id} className="hover:bg-muted/10 transition-colors">
                                            <td className="px-4 py-3 font-medium sticky left-0 bg-white shadow-[1px_0_0_0_rgba(0,0,0,0.05)]">
                                                {student.firstName} {student.lastName}
                                            </td>
                                            {CO_SCHOLASTIC_ITEMS.map(cs => {
                                                const hyVal = coSchoMap[student.id]?.[cs.id]?.hy || "";
                                                const anVal = coSchoMap[student.id]?.[cs.id]?.annual || "";
                                                return (
                                                    <>
                                                        <td key={`${cs.id}_hy`} className="px-3 py-2 border-l">
                                                            <Select
                                                                value={hyVal}
                                                                onValueChange={v => handleCoSchoChange(student.id, cs.id, "hy", v)}
                                                                disabled={isExamPublished}
                                                            >
                                                                <SelectTrigger className="h-9 w-full">
                                                                    <SelectValue placeholder="—" />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="">—</SelectItem>
                                                                    {CO_SCHO_GRADES.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                                                                </SelectContent>
                                                            </Select>
                                                        </td>
                                                        <td key={`${cs.id}_an`} className="px-3 py-2">
                                                            <Select
                                                                value={anVal}
                                                                onValueChange={v => handleCoSchoChange(student.id, cs.id, "annual", v)}
                                                                disabled={isExamPublished}
                                                            >
                                                                <SelectTrigger className="h-9 w-full">
                                                                    <SelectValue placeholder="—" />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="">—</SelectItem>
                                                                    {CO_SCHO_GRADES.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                                                                </SelectContent>
                                                            </Select>
                                                        </td>
                                                    </>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
