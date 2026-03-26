"use client";

import { useState, useEffect } from "react";
import {
    collection,
    collectionGroup,
    getDocs,
    query,
    where,
    doc,
    setDoc,
    getDoc
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Exam, Subject, Result, SubjectMark } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2, Save, CheckCircle2 } from "lucide-react";

interface StudentProfile {
    id: string;
    firstName: string;
    lastName: string;
    className: string;
    section: string;
    admissionNumber: string;
}

/** New nested path helper for a result document */
function resultDocRef(examId: string, classId: string, sectionId: string, studentId: string) {
    return doc(db, "results", examId, "classes", classId, "sections", sectionId, "students", studentId);
}

/** New nested collection path for reading all results of a class+section in an exam */
function resultSectionCol(examId: string, classId: string, sectionId: string) {
    return collection(db, "results", examId, "classes", classId, "sections", sectionId, "students");
}

const calculateGrade = (percentage: number): string => {
    if (percentage >= 90) return "A+";
    if (percentage >= 80) return "A";
    if (percentage >= 70) return "B+";
    if (percentage >= 60) return "B";
    if (percentage >= 50) return "C";
    if (percentage >= 40) return "D";
    return "E";
};

export default function BulkMarksEntryPage() {
    const [exams, setExams] = useState<Exam[]>([]);
    const [classes, setClasses] = useState<string[]>([]);
    const [sections, setSections] = useState<string[]>([]);
    const [subjects, setSubjects] = useState<Subject[]>([]);

    const [selectedExamId, setSelectedExamId] = useState("");
    const [selectedClass, setSelectedClass] = useState("");
    const [selectedSection, setSelectedSection] = useState("");

    const [students, setStudents] = useState<StudentProfile[]>([]);
    const [resultsMap, setResultsMap] = useState<Record<string, Record<string, string>>>({});

    const [isFetchingMetadata, setIsFetchingMetadata] = useState(true);
    const [isFetchingData, setIsFetchingData] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Initial Fetch — Exams + Classes
    useEffect(() => {
        const fetchMetadata = async () => {
            try {
                const examsSnap = await getDocs(collection(db, "exams"));
                setExams(examsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Exam)));

                const profilesSnap = await getDocs(collectionGroup(db, "profiles"));
                const allClasses = new Set<string>();
                profilesSnap.docs.forEach(d => {
                    const data = d.data();
                    if (data.className) allClasses.add(data.className);
                });
                setClasses(Array.from(allClasses).sort());
            } catch (err) {
                console.error("Error fetching metadata:", err);
                alert("Failed to load initial data.");
            } finally {
                setIsFetchingMetadata(false);
            }
        };
        fetchMetadata();
    }, []);

    // Fetch Sections + Subjects when class changes
    useEffect(() => {
        if (!selectedClass) {
            setSections([]);
            setSelectedSection("");
            setSubjects([]);
            return;
        }

        const fetchSectionsAndSubjects = async () => {
            try {
                const profilesSnap = await getDocs(collectionGroup(db, "profiles"));
                const classSections = new Set<string>();
                profilesSnap.docs.forEach(d => {
                    const data = d.data();
                    if (data.className === selectedClass && data.section) {
                        classSections.add(data.section);
                    }
                });
                setSections(Array.from(classSections).sort());

                const subDoc = await getDoc(doc(db, "classSubjects", selectedClass));
                if (subDoc.exists()) {
                    setSubjects((subDoc.data().subjects as Subject[]) || []);
                } else {
                    const subjectsSnap = await getDocs(collection(db, "subjects"));
                    setSubjects(subjectsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Subject)));
                }
            } catch (err) {
                console.error("Error fetching sections/subjects:", err);
            }
        };

        fetchSectionsAndSubjects();
    }, [selectedClass]);

    // Fetch Students + existing Results when all three are selected
    useEffect(() => {
        if (!selectedExamId || !selectedClass || !selectedSection) {
            setStudents([]);
            setResultsMap({});
            return;
        }

        const loadGridData = async () => {
            setIsFetchingData(true);
            try {
                // 1. Fetch Students
                const profilesSnap = await getDocs(collectionGroup(db, "profiles"));
                const filteredStudents: StudentProfile[] = [];
                const seenIds = new Set();

                profilesSnap.docs.forEach(d => {
                    const data = d.data() as StudentProfile;
                    const profileId = d.id;
                    if (
                        data.className === selectedClass &&
                        data.section === selectedSection &&
                        !seenIds.has(profileId)
                    ) {
                        seenIds.add(profileId);
                        filteredStudents.push({ ...data, id: profileId });
                    }
                });

                filteredStudents.sort((a, b) => a.firstName.localeCompare(b.firstName));
                setStudents(filteredStudents);

                // 2. Initialize marks map
                const initialMap: Record<string, Record<string, string>> = {};
                filteredStudents.forEach(s => { initialMap[s.id] = {}; });

                // 3. Fetch existing results from NEW nested path
                const resultsSnap = await getDocs(resultSectionCol(selectedExamId, selectedClass, selectedSection));
                resultsSnap.forEach(d => {
                    const data = d.data() as Result;
                    if (initialMap[d.id]) {
                        Object.entries(data.marks).forEach(([subId, markData]) => {
                            if (markData.obtained !== null) {
                                initialMap[d.id][subId] = markData.obtained.toString();
                            }
                        });
                    }
                });

                // 4. Fallback: also check old flat collection for existing data
                await Promise.all(filteredStudents.map(async student => {
                    if (Object.keys(initialMap[student.id]).length > 0) return; // already found
                    const oldRef = doc(db, "results", `${selectedExamId}_${student.id}`);
                    const oldSnap = await getDoc(oldRef);
                    if (oldSnap.exists()) {
                        const oldData = oldSnap.data() as Result;
                        Object.entries(oldData.marks).forEach(([subId, markData]) => {
                            if (markData.obtained !== null) {
                                initialMap[student.id][subId] = markData.obtained.toString();
                            }
                        });
                    }
                }));

                setResultsMap(initialMap);
            } catch (err) {
                console.error("Error loading grid data:", err);
                alert("Failed to load students and marks.");
            } finally {
                setIsFetchingData(false);
            }
        };

        loadGridData();
    }, [selectedExamId, selectedClass, selectedSection]);

    const handleMarkChange = (studentId: string, subjectId: string, value: string) => {
        if (value !== "" && isNaN(Number(value))) return;
        setResultsMap(prev => ({
            ...prev,
            [studentId]: { ...prev[studentId], [subjectId]: value }
        }));
    };

    const handleSave = async () => {
        if (!selectedExamId || !selectedClass || !selectedSection) {
            alert("Please select Exam, Class, and Section before saving.");
            return;
        }

        setIsSaving(true);
        let successCount = 0;

        try {
            const promises = students.map(async (student) => {
                const marksData = resultsMap[student.id] || {};
                if (Object.keys(marksData).length === 0) return;

                const processedMarks: Record<string, SubjectMark> = {};
                let totalObtained = 0;
                let totalMax = 0;

                subjects.forEach(sub => {
                    const valStr = marksData[sub.id!];
                    if (valStr && valStr.trim() !== "") {
                        const obtained = Math.min(Number(valStr), sub.maxMarks);
                        processedMarks[sub.id!] = { subjectId: sub.id!, obtained, total: sub.maxMarks };
                        totalObtained += obtained;
                        totalMax += sub.maxMarks;
                    }
                });

                const percentage = totalMax > 0 ? (totalObtained / totalMax) * 100 : 0;

                const resultPayload: Partial<Result> = {
                    studentId: student.id,
                    examId: selectedExamId,
                    // ── Snapshot exam info so results survive exam deletion ──────
                    examName: exams.find(e => e.id === selectedExamId)?.name || "",
                    examStartDate: exams.find(e => e.id === selectedExamId)?.startDate || "",
                    examEndDate: exams.find(e => e.id === selectedExamId)?.endDate || "",
                    // ─────────────────────────────────────────────────────────────
                    classId: selectedClass,
                    sectionId: selectedSection,
                    marks: processedMarks,
                    totalObtained,
                    totalMax,
                    percentage: Number(percentage.toFixed(2)),
                    overallGrade: calculateGrade(percentage),
                    updatedAt: Date.now()
                };

                // Save to NEW nested path: results/{examId}/classes/{classId}/sections/{sectionId}/students/{studentId}
                await setDoc(
                    resultDocRef(selectedExamId, selectedClass, selectedSection, student.id),
                    resultPayload,
                    { merge: true }
                );
                successCount++;
            });

            await Promise.all(promises);
            alert(`Successfully saved marks for ${successCount} students.`);
        } catch (err: any) {
            console.error("Error saving marks:", err);
            alert("Failed to save marks. Check console for details.");
        } finally {
            setIsSaving(false);
        }
    };

    if (isFetchingMetadata) {
        return (
            <div className="flex items-center justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Bulk Marks Entry</h1>
                    <p className="text-muted-foreground">Select exam, class, and section to enter results.</p>
                </div>
                <Button onClick={handleSave} disabled={isSaving || students.length === 0} className="min-w-[120px]">
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    {isSaving ? "Saving..." : "Save All Marks"}
                </Button>
            </div>

            <Card className="border-border/50 shadow-sm">
                <CardHeader className="bg-muted/10 border-b pb-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="space-y-2">
                            <Label>Examination</Label>
                            <Select value={selectedExamId} onValueChange={setSelectedExamId}>
                                <SelectTrigger><SelectValue placeholder="Select Exam" /></SelectTrigger>
                                <SelectContent>
                                    {exams.map(ex => (
                                        <SelectItem key={ex.id} value={ex.id!}>{ex.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Class</Label>
                            <Select value={selectedClass} onValueChange={setSelectedClass}>
                                <SelectTrigger><SelectValue placeholder="Select Class" /></SelectTrigger>
                                <SelectContent>
                                    {classes.map(c => (
                                        <SelectItem key={c} value={c}>{c}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Section</Label>
                            <Select value={selectedSection} onValueChange={setSelectedSection} disabled={!selectedClass}>
                                <SelectTrigger><SelectValue placeholder="Select Section" /></SelectTrigger>
                                <SelectContent>
                                    {sections.map(s => (
                                        <SelectItem key={s} value={s}>{s}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="p-0">
                    {!selectedExamId || !selectedClass || !selectedSection ? (
                        <div className="p-12 text-center text-muted-foreground flex flex-col items-center">
                            <CheckCircle2 className="h-12 w-12 text-muted-foreground/30 mb-4" />
                            <p>Please select an Exam, Class, and Section to load the entry grid.</p>
                        </div>
                    ) : isFetchingData ? (
                        <div className="p-12 text-center text-muted-foreground flex items-center justify-center">
                            <Loader2 className="h-6 w-6 animate-spin mr-3 text-primary" />
                            Loading class roster...
                        </div>
                    ) : students.length === 0 ? (
                        <div className="p-12 text-center text-muted-foreground">
                            No students found in this class and section.
                        </div>
                    ) : (
                        <div className="overflow-x-auto relative rounded-b-xl border-t bg-white">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-muted-foreground uppercase bg-muted/40 border-b sticky top-0 z-10">
                                    <tr>
                                        <th className="px-4 py-4 font-medium sticky left-0 bg-muted/40 backdrop-blur-sm z-20 min-w-[200px]">
                                            Student Name
                                        </th>
                                        <th className="px-4 py-4 font-medium w-24">Adm No</th>
                                        {subjects.map(sub => (
                                            <th key={sub.id} className="px-4 py-4 font-medium text-center min-w-[120px]">
                                                {sub.name} <br />
                                                <span className="text-[10px] text-muted-foreground font-normal normal-case">(Max {sub.maxMarks})</span>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/50">
                                    {students.map((student) => (
                                        <tr key={student.id} className="hover:bg-muted/10 transition-colors">
                                            <td className="px-4 py-3 font-medium sticky left-0 bg-white shadow-[1px_0_0_0_rgba(0,0,0,0.05)]">
                                                {student.firstName} {student.lastName}
                                            </td>
                                            <td className="px-4 py-3 text-xs text-muted-foreground">
                                                {student.admissionNumber || "—"}
                                            </td>
                                            {subjects.map(sub => {
                                                const value = resultsMap[student.id]?.[sub.id!] || "";
                                                const isExceeding = Number(value) > sub.maxMarks;
                                                return (
                                                    <td key={sub.id} className="px-4 py-2">
                                                        <Input
                                                            className={`w-full text-center h-9 ${isExceeding ? 'text-red-500 border-red-500 focus-visible:ring-red-500' : ''}`}
                                                            placeholder="—"
                                                            value={value}
                                                            onChange={(e) => handleMarkChange(student.id, sub.id!, e.target.value)}
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
