"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
    doc, getDoc, setDoc,
    collectionGroup, getDocs, collection,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Exam } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ArrowLeft, Save, FileCheck } from "lucide-react";

// Normalise "Class 7" → "7"
function normaliseClass(raw: string): string {
    return raw.replace(/^class\s*/i, "").trim();
}

interface SubjectTiming {
    date: string;
    startTime: string;
    endTime: string;
    roomNo: string;
}

type ScheduleMap = Record<string, Record<string, SubjectTiming>>;

/**
 * New admit card path: exams/{examId}/classes/{classId}/admitCards/{studentId}
 */
function admitCardRef(examId: string, classId: string, studentId: string) {
    return doc(db, "exams", examId, "classes", classId, "admitCards", studentId);
}

export default function AdvancedAdmitCardManagerPage() {
    const params = useParams();
    const router = useRouter();
    const examId = params.id as string;

    const [exam, setExam] = useState<Exam | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [classSubjects, setClassSubjects] = useState<Record<string, { id: string, name: string }[]>>({});
    const [schedule, setSchedule] = useState<ScheduleMap>({});
    const [isGenerating, setIsGenerating] = useState(false);
    const [generateMsg, setGenerateMsg] = useState("");

    useEffect(() => {
        if (!examId) return;
        const fetchExamAndSubjects = async () => {
            try {
                const exSnap = await getDoc(doc(db, "exams", examId));
                if (!exSnap.exists()) { setIsLoading(false); return; }

                const examData = { id: exSnap.id, ...exSnap.data() } as Exam;
                setExam(examData);

                const subjectsObj: Record<string, any[]> = {};
                const localSchedule: ScheduleMap = {};
                const applicable = examData.classesApplicable ?? [];
                const preSavedSchedule = (examData as any).admitCardSchedule as ScheduleMap | undefined;

                for (const cls of applicable) {
                    const subjSnap = await getDoc(doc(db, "classSubjects", cls));
                    let subjectsList: any[] = [];
                    if (subjSnap.exists()) {
                        subjectsList = subjSnap.data().subjects || [];
                    }
                    subjectsObj[cls] = subjectsList;
                    localSchedule[cls] = {};
                    subjectsList.forEach(sub => {
                        localSchedule[cls][sub.name] = {
                            date: preSavedSchedule?.[cls]?.[sub.name]?.date || examData.startDate || "",
                            startTime: preSavedSchedule?.[cls]?.[sub.name]?.startTime || "",
                            endTime: preSavedSchedule?.[cls]?.[sub.name]?.endTime || "",
                            roomNo: preSavedSchedule?.[cls]?.[sub.name]?.roomNo || ""
                        };
                    });
                }

                setClassSubjects(subjectsObj);
                setSchedule(localSchedule);
            } catch (err: any) {
                console.error("Failed to fetch data:", err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchExamAndSubjects();
    }, [examId]);

    const handleScheduleChange = (cls: string, subject: string, field: keyof SubjectTiming, val: string) => {
        setSchedule(prev => ({
            ...prev,
            [cls]: {
                ...prev[cls],
                [subject]: { ...prev[cls][subject], [field]: val }
            }
        }));
    };

    const applyFirstToAll = (cls: string) => {
        const subjectsList = classSubjects[cls];
        if (!subjectsList || subjectsList.length === 0) return;
        const firstSubj = subjectsList[0].name;
        const firstData = schedule[cls][firstSubj];
        setSchedule(prev => {
            const nextCls = { ...prev[cls] };
            subjectsList.forEach(sub => {
                if (sub.name !== firstSubj) {
                    nextCls[sub.name] = { ...firstData, date: nextCls[sub.name]?.date || firstData.date };
                }
            });
            return { ...prev, [cls]: nextCls };
        });
    };

    const handleSaveAndGenerate = async () => {
        if (!exam) return;
        if (!window.confirm(`Generate admit cards for all students in "${exam.name}"? This replaces old ones.`)) return;

        setIsGenerating(true);
        setGenerateMsg("");

        try {
            // Save schedule back to exam doc for persistence
            await setDoc(doc(db, "exams", exam.id!), { admitCardSchedule: schedule }, { merge: true });

            // Fetch all student profiles
            const snap = await getDocs(collectionGroup(db, "profiles"));
            let count = 0;
            let skipped = 0;
            const applicable = exam.classesApplicable ?? [];

            for (const d of snap.docs) {
                const data = d.data();

                // ── Only generate for ACTIVE students ──────────────────────
                const studentStatus = (data.status || "").toLowerCase();
                if (studentStatus !== "active") {
                    skipped++;
                    continue;
                }
                // ───────────────────────────────────────────────────────────

                const cls = normaliseClass(String(data.className || data.currentClass || ""));

                if (!applicable.includes(cls)) continue;

                const uid = d.id;

                // Build timetable for this student's class
                const timetable = [];
                const subjectsForMyClass = classSubjects[cls] || [];
                for (const sub of subjectsForMyClass) {
                    const config = schedule[cls]?.[sub.name];
                    if (config) {
                        timetable.push({
                            subject: sub.name,
                            date: config.date,
                            startTime: config.startTime,
                            endTime: config.endTime,
                            roomNo: config.roomNo
                        });
                    }
                }

                const admitCardPayload = {
                    examId: exam.id,
                    examName: exam.name,
                    startDate: exam.startDate,
                    endDate: exam.endDate,
                    timing: (exam as any).timing || "",
                    instructions: (exam as any).instructions || "",
                    studentId: uid,
                    admissionNumber: data.admissionNumber || "",
                    studentName: data.name || `${data.firstName || ""} ${data.lastName || ""}`.trim(),
                    className: cls,
                    section: data.section || "",
                    dob: data.dob || "",
                    fatherName: data.fatherName || "",
                    generatedAt: Date.now(),
                    timetable,
                };

                // NEW path: exams/{examId}/classes/{classId}/admitCards/{studentId}
                await setDoc(admitCardRef(exam.id!, cls, uid), admitCardPayload, { merge: true });

                // Also write to old path for backward compatibility with any existing readers
                await setDoc(
                    doc(db, "exams", exam.id!, "admitCards", uid),
                    admitCardPayload,
                    { merge: true }
                );

                count++;
            }
            setGenerateMsg(`✅ Generated ${count} admit cards for active students.${skipped > 0 ? ` (${skipped} inactive/TC students skipped)` : ""}`);
        } catch (err: any) {
            console.error("Failed to generate:", err);
            setGenerateMsg(`❌ Generation failed: ${err.message}`);
        } finally {
            setIsGenerating(false);
        }
    };

    if (isLoading) {
        return <div className="p-12 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }

    if (!exam) {
        return <div className="p-12 text-center">Exam not found. <Button variant="link" onClick={() => router.back()}>Go back</Button></div>;
    }

    const applicable = exam.classesApplicable ?? [];

    return (
        <div className="p-6 space-y-6 max-w-6xl mx-auto">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => router.back()}>
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="flex-1">
                    <h1 className="text-2xl font-bold">Admit Card Manager</h1>
                    <p className="text-muted-foreground">
                        Configure subject schedules per class for <b>{exam.name}</b>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Cards saved at: <code className="bg-muted px-1 py-0.5 rounded text-[10px]">
                            exams/{exam.id}/classes/&#123;class&#125;/admitCards/&#123;studentId&#125;
                        </code>
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => router.push(`/admin/exams/${exam.id}/admit-cards/view`)}>
                        View Generated Cards
                    </Button>
                    <Button
                        onClick={handleSaveAndGenerate}
                        disabled={isGenerating || applicable.length === 0}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white"
                    >
                        {isGenerating
                            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating...</>
                            : <><FileCheck className="mr-2 h-4 w-4" /> Save & Generate Cards</>}
                    </Button>
                </div>
            </div>

            {generateMsg && (
                <div className={`p-4 rounded-lg border ${generateMsg.startsWith('✅') ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                    {generateMsg}
                </div>
            )}

            {applicable.length === 0 ? (
                <Card>
                    <CardContent className="p-12 text-center text-muted-foreground">
                        This exam has no applicable classes selected. Go back and edit the exam to select classes.
                    </CardContent>
                </Card>
            ) : (
                <Card className="border-border/50 shadow-sm">
                    <CardHeader className="bg-muted/20 border-b pb-4">
                        <CardTitle className="text-lg">Subject Timetables by Class</CardTitle>
                        <CardDescription>
                            Configure the exact date, time, and room for every subject in each class's admit cards.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Tabs defaultValue={applicable[0]} className="w-full">
                            <div className="px-6 py-3 border-b bg-muted/5 w-full overflow-x-auto">
                                <TabsList className="bg-muted/20 p-1 flex w-max h-auto">
                                    {applicable.map(cls => (
                                        <TabsTrigger
                                            key={cls}
                                            value={cls}
                                            className="px-4 py-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
                                        >
                                            Class {cls}
                                        </TabsTrigger>
                                    ))}
                                </TabsList>
                            </div>

                            {applicable.map(cls => {
                                const subjects = classSubjects[cls] || [];
                                return (
                                    <TabsContent key={cls} value={cls} className="p-0 m-0">
                                        {subjects.length === 0 ? (
                                            <div className="p-12 text-center text-muted-foreground">
                                                No subjects mapped for Class {cls}. Add them in the{" "}
                                                <a href="/admin/class-subjects" className="text-primary hover:underline">Manage Subjects</a> page.
                                            </div>
                                        ) : (
                                            <div className="p-6">
                                                <div className="flex justify-between items-end mb-4">
                                                    <p className="text-sm font-medium text-muted-foreground">
                                                        Schedule for Class {cls}
                                                    </p>
                                                    <Button variant="outline" size="sm" onClick={() => applyFirstToAll(cls)} className="text-xs h-7">
                                                        <Save className="w-3 h-3 mr-1" /> Copy first timing to all
                                                    </Button>
                                                </div>
                                                <div className="overflow-x-auto rounded-lg border">
                                                    <table className="w-full text-sm text-left">
                                                        <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                                                            <tr>
                                                                <th className="px-4 py-3 font-medium">Subject</th>
                                                                <th className="px-4 py-3 font-medium">Exam Date</th>
                                                                <th className="px-4 py-3 font-medium">Start Time</th>
                                                                <th className="px-4 py-3 font-medium">End Time</th>
                                                                <th className="px-4 py-3 font-medium">Room No.</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-border/50">
                                                            {subjects.map(sub => (
                                                                <tr key={sub.id} className="hover:bg-muted/5 transition-colors">
                                                                    <td className="px-4 py-3 font-semibold text-foreground align-middle">
                                                                        {sub.name}
                                                                    </td>
                                                                    <td className="px-4 py-3">
                                                                        <Input
                                                                            type="date"
                                                                            value={schedule[cls]?.[sub.name]?.date || ""}
                                                                            onChange={(e) => handleScheduleChange(cls, sub.name, "date", e.target.value)}
                                                                            className="h-8 text-xs"
                                                                        />
                                                                    </td>
                                                                    <td className="px-4 py-3">
                                                                        <Input
                                                                            type="time"
                                                                            value={schedule[cls]?.[sub.name]?.startTime || ""}
                                                                            onChange={(e) => handleScheduleChange(cls, sub.name, "startTime", e.target.value)}
                                                                            className="h-8 text-xs"
                                                                        />
                                                                    </td>
                                                                    <td className="px-4 py-3">
                                                                        <Input
                                                                            type="time"
                                                                            value={schedule[cls]?.[sub.name]?.endTime || ""}
                                                                            onChange={(e) => handleScheduleChange(cls, sub.name, "endTime", e.target.value)}
                                                                            className="h-8 text-xs w-[110px]"
                                                                        />
                                                                    </td>
                                                                    <td className="px-4 py-3">
                                                                        <Input
                                                                            type="text"
                                                                            placeholder="e.g. Hall 1"
                                                                            value={schedule[cls]?.[sub.name]?.roomNo || ""}
                                                                            onChange={(e) => handleScheduleChange(cls, sub.name, "roomNo", e.target.value)}
                                                                            className="h-8 text-xs"
                                                                        />
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}
                                    </TabsContent>
                                );
                            })}
                        </Tabs>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
