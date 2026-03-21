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

const calculateGrade = (pct: number) => {
    if (pct >= 90) return "A+";
    if (pct >= 80) return "A";
    if (pct >= 70) return "B+";
    if (pct >= 60) return "B";
    if (pct >= 50) return "C";
    if (pct >= 40) return "D";
    return "E";
};

/** New nested result path: results/{examId}/classes/{classId}/sections/{sectionId}/students/{studentId} */
function resultDocRef(examId: string, classId: string, sectionId: string, studentId: string) {
    return doc(db, "results", examId, "classes", classId, "sections", sectionId, "students", studentId);
}

function resultSectionCol(examId: string, classId: string, sectionId: string) {
    return collection(db, "results", examId, "classes", classId, "sections", sectionId, "students");
}

export default function TeacherMarksPage() {
    const { user } = useAuth();

    const [myClass, setMyClass] = useState<{ className: string; section: string } | null>(null);
    const [isClassTeacher, setIsClassTeacher] = useState<boolean | null>(null);

    const [exams, setExams] = useState<Exam[]>([]);
    const [subjects, setSubjects] = useState<SubjectEntry[]>([]);
    const [students, setStudents] = useState<StudentRow[]>([]);
    const [resultsMap, setResultsMap] = useState<Record<string, Record<string, string>>>({});

    const [selectedExamId, setSelectedExamId] = useState("");

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

    // Step 2: Load students and existing marks when exam is selected
    useEffect(() => {
        if (!myClass || !selectedExamId) {
            setStudents([]);
            setResultsMap({});
            return;
        }

        const loadData = async () => {
            setIsLoadingStudents(true);
            try {
                const normMyClass = myClass.className.replace(/^class\s*/i, "").trim();

                // Try nested path first, then fallback to collectionGroup query
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
                filtered.forEach(s => { initMap[s.id] = {}; });

                // Fetch existing results from NEW nested path
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
                        });
                    }
                });

                // Fallback: check old flat path for any student without data yet
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
            } catch (err) {
                console.error("Error loading data:", err);
                alert("Failed to load student data.");
            } finally {
                setIsLoadingStudents(false);
            }
        };

        loadData();
    }, [myClass, selectedExamId]);

    const handleMarkChange = (studentId: string, subjectId: string, value: string) => {
        if (value !== "" && isNaN(Number(value))) return;
        setResultsMap(prev => ({
            ...prev,
            [studentId]: { ...prev[studentId], [subjectId]: value },
        }));
    };

    const handleSave = async () => {
        if (!selectedExamId || !myClass) return;
        setIsSaving(true);
        let saved = 0;
        try {
            await Promise.all(students.map(async student => {
                const studentMarks = resultsMap[student.id] || {};
                if (Object.keys(studentMarks).length === 0) return;

                const processedMarks: Record<string, SubjectMark> = {};
                let totalObtained = 0;
                let totalMax = 0;

                subjects.forEach(sub => {
                    const valStr = studentMarks[sub.id];
                    if (valStr && valStr.trim() !== "") {
                        const obtained = Math.min(Number(valStr), sub.maxMarks);
                        processedMarks[sub.id] = { subjectId: sub.id, obtained, total: sub.maxMarks };
                        totalObtained += obtained;
                        totalMax += sub.maxMarks;
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

                // Save to NEW nested path
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

    const selectedExam = exams.find(e => e.id === selectedExamId);
    const isExamPublished = selectedExam?.status === "Published";

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
                                            {e.name} ({e.status})
                                        </SelectItem>
                                    ))
                                }
                            </SelectContent>
                        </Select>
                    </div>
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
                    ) : (
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
                                                    (Max {sub.maxMarks})
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
                                                const val = resultsMap[student.id]?.[sub.id] || "";
                                                const isOver = val !== "" && Number(val) > sub.maxMarks;
                                                return (
                                                    <td key={sub.id} className="px-4 py-2">
                                                        <Input
                                                            type="number"
                                                            min={0}
                                                            max={sub.maxMarks}
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
        </div>
    );
}
