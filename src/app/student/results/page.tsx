"use client";

import { useState, useEffect, useRef } from "react";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { Result, Exam, Subject } from "@/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Download, Award, FileText, ChevronRight, School } from "lucide-react";

export default function StudentResultsPage() {
    const { user } = useAuth();
    const [results, setResults] = useState<(Result & { examDetails?: Exam })[]>([]);
    const [subjects, setSubjects] = useState<Record<string, Subject>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [selectedResult, setSelectedResult] = useState<(Result & { examDetails?: Exam }) | null>(null);

    const reportCardRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!user) return;

        const fetchData = async () => {
            try {
                // Fetch student Results
                const resultsRef = collection(db, "results");
                const q = query(resultsRef, where("studentId", "==", user.uid));
                const resultsSnap = await getDocs(q);

                const studentResults: (Result & { examDetails?: Exam })[] = [];

                // Fetch exam details for each result
                for (const d of resultsSnap.docs) {
                    const resultData = { id: d.id, ...d.data() } as Result;
                    // fetch exam metadata
                    const examRef = doc(db, "exams", resultData.examId);
                    const examSnap = await getDoc(examRef);
                    if (examSnap.exists()) {
                        const examData = examSnap.data() as Exam;
                        // Only show published results
                        if (examData.status === "Published") {
                            studentResults.push({ ...resultData, examDetails: examData });
                        }
                    }
                }

                // Sort by date descending
                studentResults.sort((a, b) => {
                    const dateA = a.examDetails ? new Date(a.examDetails.endDate).getTime() : 0;
                    const dateB = b.examDetails ? new Date(b.examDetails.endDate).getTime() : 0;
                    return dateB - dateA;
                });

                setResults(studentResults);

                // Build subject name map from classSubjects collection
                // Marks are stored with IDs from classSubjects/{className}.subjects[]
                if (studentResults.length > 0) {
                    const classId = studentResults[0].classId;
                    const classSubDoc = await getDoc(doc(db, "classSubjects", classId));
                    if (classSubDoc.exists()) {
                        const subjectList: { id: string; name: string; maxMarks: number }[] =
                            classSubDoc.data().subjects || [];
                        const subsMap: Record<string, any> = {};
                        subjectList.forEach(s => { subsMap[s.id] = { name: s.name, id: s.id }; });
                        setSubjects(subsMap);
                    }
                }
            } catch (err) {
                console.error("Error fetching student results:", err);
                alert("Failed to load results.");
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [user]);


    const handleDownloadPDF = () => {
        if (typeof window === "undefined") return;

        // We can simply trigger the browser's print dialog to save as PDF
        // A more advanced approach involves html2canvas and jsPDF, but browser print is often better for standard CSS formatting
        window.print();
    };

    if (isLoading) {
        return (
            <div className="flex h-[50vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (results.length === 0) {
        return (
            <div className="p-6">
                <Card className="border-dashed bg-muted/10">
                    <CardContent className="flex flex-col items-center justify-center py-24 text-center">
                        <Award className="h-16 w-16 text-muted-foreground/30 mb-4" />
                        <h2 className="text-2xl font-bold tracking-tight text-foreground">No Results Available</h2>
                        <p className="text-muted-foreground mt-2 max-w-sm">
                            There are currently no published examination results available for your profile. Please check back later or contact your class teacher.
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (selectedResult) {
        const { marks, totalObtained, totalMax, percentage, overallGrade, examDetails } = selectedResult;
        const markEntries = Object.values(marks);

        return (
            <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6 print:p-0 print:m-0 print:max-w-none print:w-full">
                {/* Print actions (hidden in print) */}
                <div className="flex items-center justify-between no-print mb-6">
                    <Button variant="outline" onClick={() => setSelectedResult(null)}>
                        &larr; Back to all results
                    </Button>
                    <Button onClick={handleDownloadPDF} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                        <Download className="mr-2 h-4 w-4" /> Download PDF / Print
                    </Button>
                </div>

                {/* Report Card (printable area) */}
                <Card className="border-border shadow-md bg-white text-black overflow-hidden print:overflow-visible print:shadow-none print:border-none print:m-0 print:p-0" ref={reportCardRef}>
                    <CardContent className="p-0 print:p-0">
                        {/* Header */}
                        <div className="bg-[#1a2e4c] text-white p-8 md:p-12 pb-16 print:p-10 print:pb-10 relative overflow-hidden print:overflow-visible flex items-center justify-between print:break-inside-avoid print:rounded-t-2xl border-b print:border-b-[#1a2e4c]">
                            <div className="absolute inset-0 opacity-10 print:hidden" style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.4) 0%, transparent 50%)` }} />
                            <div className="relative z-10 flex gap-6 items-center">
                                <div className="bg-white/10 backdrop-blur-md print:backdrop-blur-none print:bg-transparent rounded-2xl flex items-center justify-center border border-white/20 print:border-white/40 shadow-xl print:shadow-none shrink-0" style={{ width: '80px', height: '80px' }}>
                                    <School size={40} color="#d4af37" />
                                </div>
                                <div>
                                    <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white mb-2 shadow-sm">International Access School</h1>
                                    <p className="text-blue-100/80 font-medium text-lg tracking-wide uppercase">{examDetails?.name || "Official Report Card"}</p>
                                </div>
                            </div>
                        </div>

                        {/* Student Details Section */}
                        <div className="px-8 md:px-12 -mt-8 print:mt-0 relative z-20 print:break-inside-avoid print:px-10">
                            <Card className="border-0 shadow-xl ring-1 ring-black/5 bg-white p-6 md:p-8 rounded-2xl print:shadow-none print:ring-0 print:border print:border-gray-200 print:rounded-b-2xl print:rounded-t-none print:p-8">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8 print:grid-cols-4 print:gap-4">
                                    <div className="space-y-1">
                                        <p className="text-[11px] font-bold tracking-widest text-[#1a2e4c]/50 uppercase">Student Name</p>
                                        <p className="font-semibold text-lg text-[#1a2e4c]">{user?.displayName || "Student"}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[11px] font-bold tracking-widest text-[#1a2e4c]/50 uppercase">Class & Section</p>
                                        <p className="font-semibold text-lg text-[#1a2e4c]">{selectedResult.classId} - {selectedResult.sectionId}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[11px] font-bold tracking-widest text-[#1a2e4c]/50 uppercase">Date of Exam</p>
                                        <p className="font-semibold text-lg text-[#1a2e4c]">
                                            {examDetails?.startDate ? new Date(examDetails.startDate).toLocaleDateString() : "N/A"}
                                        </p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[11px] font-bold tracking-widest text-[#1a2e4c]/50 uppercase">Status</p>
                                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 mt-1 hover:bg-emerald-50 text-sm py-0.5 px-3">
                                            Published
                                        </Badge>
                                    </div>
                                </div>
                            </Card>
                        </div>

                        {/* Marks Details Section */}
                        <div className="p-8 md:p-12 pt-10 print:p-10 print:pt-8">
                            <div className="border border-gray-100 rounded-2xl overflow-x-auto shadow-sm print:overflow-visible">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-[#f8fafc] border-b border-gray-100">
                                            <th className="py-4 px-6 text-sm font-bold text-[#1a2e4c] w-1/2">Subjects</th>
                                            <th className="py-4 px-6 text-sm font-bold text-[#1a2e4c] text-right whitespace-nowrap">Max Marks</th>
                                            <th className="py-4 px-6 text-sm font-bold text-[#1a2e4c] text-right whitespace-nowrap">Obtained Marks</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50 bg-white">
                                        {markEntries.map((m, idx) => {
                                            const subName = subjects[m.subjectId]?.name || "Unknown Subject";
                                            return (
                                                <tr key={idx} className="hover:bg-gray-50/50 transition-colors print:break-inside-avoid">
                                                    <td className="py-4 px-6 font-medium text-gray-900 whitespace-nowrap">{subName}</td>
                                                    <td className="py-4 px-6 text-gray-500 text-right font-medium">{m.total}</td>
                                                    <td className="py-4 px-6 text-[#1a2e4c] text-right font-bold text-lg">{m.obtained !== null ? m.obtained : <span className="text-red-500 text-sm">ABSENT</span>}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Summary Footer */}
                            <div className="mt-8 flex flex-col md:flex-row gap-6 print:flex-row print:break-inside-avoid print:mt-10">
                                <div className="flex-1 bg-[#1a2e4c] text-white p-6 rounded-2xl shadow-md border border-[#2a4570] print:border-gray-200 flex flex-col justify-center print:p-6 print:shadow-none">
                                    <div className="flex justify-between items-end">
                                        <div>
                                            <p className="text-blue-200 text-sm font-medium mb-1 print:text-gray-500">Total Score</p>
                                            <div className="flex items-baseline gap-2">
                                                <span className="text-4xl font-bold tracking-tight text-[#d4af37] print:text-[#1a2e4c]">{totalObtained}</span>
                                                <span className="text-xl text-blue-200/50 print:text-gray-400">/ {totalMax}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex-1 bg-white border border-gray-100 p-6 rounded-2xl shadow-sm flex flex-col justify-center print:p-6 print:shadow-none print:border-gray-200">
                                    <p className="text-gray-500 text-sm font-medium mb-1 tracking-wide">Percentage</p>
                                    <span className="text-4xl font-bold tracking-tight text-[#1a2e4c]">{percentage}%</span>
                                </div>
                                <div className="flex-1 bg-gradient-to-br from-[#d4af37]/20 to-[#d4af37]/5 border border-[#d4af37]/30 print:border-gray-200 print:bg-white print:bg-none p-6 rounded-2xl shadow-sm flex flex-col justify-center print:p-6 print:shadow-none">
                                    <p className="text-[#a68a2b] print:text-gray-500 text-sm font-bold uppercase tracking-widest mb-1">Overall Grade</p>
                                    <span className="text-5xl font-black text-[#8c7423] print:text-[#1a2e4c] drop-shadow-sm print:drop-shadow-none">{overallGrade}</span>
                                </div>
                            </div>

                            {/* Signatures */}
                            <div className="mt-16 grid grid-cols-2 md:grid-cols-3 gap-8 pt-8 border-t border-gray-100 text-center print:grid-cols-3 print:break-inside-avoid print:mt-24">
                                <div className="space-y-8">
                                    <div className="border-b-2 border-dashed border-gray-300 mx-auto w-3/4"></div>
                                    <p className="text-sm text-gray-500 uppercase tracking-widest font-semibold">Class Teacher</p>
                                </div>
                                <div className="space-y-8 hidden md:block print:block">
                                    <div className="border-b-2 border-dashed border-gray-300 mx-auto w-3/4"></div>
                                    <p className="text-sm text-gray-500 uppercase tracking-widest font-semibold">Principal</p>
                                </div>
                                <div className="space-y-8">
                                    <div className="border-b-2 border-dashed border-gray-300 mx-auto w-3/4"></div>
                                    <p className="text-sm text-gray-500 uppercase tracking-widest font-semibold">Parents / Guardian</p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <style dangerouslySetInnerHTML={{
                    __html: `
                    @media print {
                        @page {
                            margin: 10mm;
                            size: A4 portrait;
                        }
                        
                        * {
                            -webkit-print-color-adjust: exact !important;
                            print-color-adjust: exact !important;
                        }
                        
                        .no-print { 
                            display: none !important; 
                        }
                        
                        body {
                            background: white !important;
                            margin: 0;
                            padding: 0;
                        }
                    }
                `}} />
            </div>
        );
    }

    return (
        <div className="p-6 md:p-10 space-y-8 max-w-6xl mx-auto">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Academic Results</h1>
                <p className="text-muted-foreground mt-1">View and download your examination report cards.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {results.map((res) => (
                    <Card
                        key={res.id}
                        className="overflow-hidden hover:shadow-lg transition-all duration-300 border-border group cursor-pointer"
                        onClick={() => setSelectedResult(res)}
                    >
                        <div className="h-2 bg-gradient-to-r from-[#1a2e4c] to-[#d4af37]" />
                        <CardHeader className="pb-4">
                            <div className="flex justify-between items-start mb-2">
                                <div className="p-2.5 bg-blue-50 text-blue-700 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                    <FileText className="h-6 w-6" />
                                </div>
                                <Badge variant="secondary" className="bg-[#1a2e4c]/5 text-[#1a2e4c] font-semibold border-none">
                                    {res.percentage}%
                                </Badge>
                            </div>
                            <CardTitle className="text-xl line-clamp-1">{res.examDetails?.name || "Exam Term"}</CardTitle>
                            <CardDescription>
                                {res.overallGrade} Grade • Class {res.classId}-{res.sectionId}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center justify-between text-sm pt-4 border-t border-dashed border-gray-200">
                                <span className="text-muted-foreground">
                                    {res.examDetails?.startDate ? new Date(res.examDetails.startDate).toLocaleDateString() : "View details"}
                                </span>
                                <span className="text-primary font-medium flex items-center group-hover:translate-x-1 transition-transform">
                                    View Report <ChevronRight className="ml-1 h-4 w-4" />
                                </span>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
