"use client";

import { useState, useEffect } from "react";
import {
    collection, getDocs, doc, getDoc, query, where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { Exam, Result } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, GraduationCap, TrendingUp } from "lucide-react";
import { getStudentClassInfo } from "@/lib/utils/studentProfile";

interface SubjectResult {
    subjectName: string;
    obtained: number | null;
    total: number;
    grade: string;
}

interface ExamResult {
    exam: Exam;
    subjects: SubjectResult[];
    totalObtained: number;
    totalMax: number;
    percentage: number;
    overallGrade: string;
    teacherRemarks?: string;
}

const gradeColor = (grade: string) => {
    if (grade === "A+" || grade === "A") return "bg-green-100 text-green-700";
    if (grade === "B+" || grade === "B") return "bg-blue-100 text-blue-700";
    if (grade === "C") return "bg-yellow-100 text-yellow-700";
    if (grade === "D") return "bg-orange-100 text-orange-700";
    return "bg-red-100 text-red-700";
};

export default function StudentResultsPage() {
    const { user } = useAuth();
    const [results, setResults] = useState<ExamResult[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [studentClass, setStudentClass] = useState("");

    useEffect(() => {
        if (!user) return;

        const fetchResults = async () => {
            try {
                // 1. Get student's class using the shared utility (fast via studentLookup)
                const { className } = await getStudentClassInfo(user.uid);
                setStudentClass(className);

                if (!className) {
                    setIsLoading(false);
                    return;
                }

                // 2. Get all published exams applicable to student's class
                const examsSnap = await getDocs(collection(db, "exams"));
                const publishedExams = examsSnap.docs
                    .map(d => ({ id: d.id, ...d.data() }) as Exam)
                    .filter(e =>
                        e.status === "Published" &&
                        (e.classesApplicable ?? []).includes(className)
                    );

                // 3. Get subject names for this class
                const subDoc = await getDoc(doc(db, "classSubjects", className));
                const subjectMap: Record<string, string> = {};
                if (subDoc.exists()) {
                    (subDoc.data().subjects as any[]).forEach((s: any) => {
                        subjectMap[s.id] = s.name;
                    });
                }

                // 4. Fetch result for each exam
                const examResults: ExamResult[] = [];
                await Promise.all(publishedExams.map(async exam => {
                    const resultRef = doc(db, "results", `${exam.id}_${user.uid}`);
                    const resultSnap = await getDoc(resultRef);
                    if (!resultSnap.exists()) return;

                    const data = resultSnap.data() as Result;
                    const subjectRows: SubjectResult[] = Object.entries(data.marks).map(([subId, mark]) => ({
                        subjectName: subjectMap[subId] || subId,
                        obtained: mark.obtained,
                        total: mark.total,
                        grade: mark.obtained !== null
                            ? calcGrade((mark.obtained / mark.total) * 100)
                            : "—",
                    }));

                    examResults.push({
                        exam,
                        subjects: subjectRows,
                        totalObtained: data.totalObtained,
                        totalMax: data.totalMax,
                        percentage: data.percentage,
                        overallGrade: data.overallGrade,
                        teacherRemarks: data.teacherRemarks,
                    });
                }));

                // Sort by exam start date
                examResults.sort((a, b) =>
                    new Date(b.exam.startDate).getTime() - new Date(a.exam.startDate).getTime()
                );
                setResults(examResults);
            } catch (err) {
                console.error("Error fetching results:", err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchResults();
    }, [user]);

    const calcGrade = (pct: number) => {
        if (pct >= 90) return "A+";
        if (pct >= 80) return "A";
        if (pct >= 70) return "B+";
        if (pct >= 60) return "B";
        if (pct >= 50) return "C";
        if (pct >= 40) return "D";
        return "E";
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6 p-4">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                    <GraduationCap className="h-6 w-6 text-primary" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold">My Results</h1>
                    {studentClass && (
                        <p className="text-muted-foreground text-sm">Class: {studentClass}</p>
                    )}
                </div>
            </div>

            {results.length === 0 ? (
                <Card>
                    <CardContent className="py-16 flex flex-col items-center text-center gap-4">
                        <TrendingUp className="h-12 w-12 text-muted-foreground/30" />
                        <p className="text-muted-foreground">
                            No published results available yet. Check back after your exams are graded.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                results.map(examResult => (
                    <Card key={examResult.exam.id} className="border-border/50 shadow-sm overflow-hidden">
                        {/* Exam Header */}
                        <CardHeader className="bg-muted/20 border-b flex flex-row items-start justify-between gap-4">
                            <div>
                                <CardTitle className="text-lg">{examResult.exam.name}</CardTitle>
                                <p className="text-sm text-muted-foreground mt-1">
                                    {examResult.exam.startDate} — {examResult.exam.endDate}
                                </p>
                            </div>
                            <div className="text-right shrink-0">
                                <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold ${gradeColor(examResult.overallGrade)}`}>
                                    {examResult.overallGrade}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {examResult.totalObtained}/{examResult.totalMax} · {examResult.percentage}%
                                </p>
                            </div>
                        </CardHeader>

                        {/* Subject-wise marks */}
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="text-xs text-muted-foreground uppercase bg-muted/20 border-b">
                                        <tr>
                                            <th className="px-6 py-3 text-left font-medium">Subject</th>
                                            <th className="px-6 py-3 text-center font-medium">Marks</th>
                                            <th className="px-6 py-3 text-center font-medium">Max</th>
                                            <th className="px-6 py-3 text-center font-medium">Grade</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {examResult.subjects.map((sub, i) => (
                                            <tr key={i} className="hover:bg-muted/10">
                                                <td className="px-6 py-3 font-medium">{sub.subjectName}</td>
                                                <td className="px-6 py-3 text-center">
                                                    {sub.obtained !== null ? sub.obtained : "Absent"}
                                                </td>
                                                <td className="px-6 py-3 text-center text-muted-foreground">{sub.total}</td>
                                                <td className="px-6 py-3 text-center">
                                                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${gradeColor(sub.grade)}`}>
                                                        {sub.grade}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    {/* Summary row */}
                                    <tfoot className="border-t bg-muted/10">
                                        <tr>
                                            <td className="px-6 py-3 font-semibold">Total</td>
                                            <td className="px-6 py-3 text-center font-semibold">{examResult.totalObtained}</td>
                                            <td className="px-6 py-3 text-center text-muted-foreground">{examResult.totalMax}</td>
                                            <td className="px-6 py-3 text-center">
                                                <Badge className={gradeColor(examResult.overallGrade)}>
                                                    {examResult.overallGrade} · {examResult.percentage}%
                                                </Badge>
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                            {examResult.teacherRemarks && (
                                <div className="px-6 py-3 text-sm text-muted-foreground border-t bg-muted/5 italic">
                                    Teacher's Remarks: {examResult.teacherRemarks}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ))
            )}
        </div>
    );
}
