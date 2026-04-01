"use client";

import { useState, useEffect, useRef } from "react";
import { collection, collectionGroup, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { Result, Exam, Subject } from "@/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Download, Award, FileText, ChevronRight, School, LayoutTemplate } from "lucide-react";
import { getStudentClassInfo } from "@/lib/utils/studentProfile";

// Grading scale for landscape 4-exam format
function getGrade(pct: number): string {
    if (pct >= 90.5) return "A1";
    if (pct >= 81) return "A2";
    if (pct >= 71) return "B1";
    if (pct >= 61) return "B2";
    if (pct >= 51) return "C1";
    if (pct >= 41) return "C2";
    if (pct >= 33) return "D";
    return "E";
}

export default function StudentResultsPage() {
    const { user } = useAuth();
    const [results, setResults] = useState<Result[]>([]);
    const [subjects, setSubjects] = useState<Record<string, Subject>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [selectedResult, setSelectedResult] = useState<Result | null>(null);

    const reportCardRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!user) return;

        const fetchData = async () => {
            try {
                // 1. Get student's class & section
                const { className, section } = await getStudentClassInfo(user.uid);

                const seenExamIds = new Set<string>();
                const studentResults: Result[] = [];

                // ── Path A: Check every exam doc (works even for draft exams, no index needed) ──
                const examsSnap = await getDocs(collection(db, "exams"));
                const allExams = examsSnap.docs.map(d => ({ id: d.id, ...d.data() }) as Exam);

                for (const exam of allExams) {
                    if (seenExamIds.has(exam.id!)) continue;
                    let resultData: Result | null = null;

                    // Try new nested path: results/{examId}/classes/{cls}/sections/{sec}/students/{uid}
                    if (section && className) {
                        const newRef = doc(
                            db, "results", exam.id!, "classes", className,
                            "sections", section, "students", user.uid
                        );
                        const newSnap = await getDoc(newRef);
                        if (newSnap.exists()) {
                            resultData = { id: newSnap.id, ...newSnap.data() } as Result;
                        }
                    }

                    // Fallback: old composite ID path results/{examId}_{studentId}
                    if (!resultData) {
                        const oldRef = doc(db, "results", `${exam.id}_${user.uid}`);
                        const oldSnap = await getDoc(oldRef);
                        if (oldSnap.exists()) {
                            resultData = { id: oldSnap.id, ...oldSnap.data() } as Result;
                        }
                    }

                    if (resultData) {
                        // Merge snapshotted exam info if not already in result doc
                        if (!resultData.examName) resultData.examName = exam.name;
                        if (!resultData.examStartDate) resultData.examStartDate = exam.startDate;
                        if (!resultData.examEndDate) resultData.examEndDate = exam.endDate;
                        studentResults.push(resultData);
                        seenExamIds.add(exam.id!);
                    }
                }

                // ── Path B: Also query top-level results collection for old-format docs ──
                // (these are regular top-level docs, no collectionGroup index needed)
                try {
                    const oldResultsSnap = await getDocs(
                        query(collection(db, "results"), where("studentId", "==", user.uid))
                    );
                    oldResultsSnap.forEach(d => {
                        const data = d.data() as Result;
                        if (data.examId && !seenExamIds.has(data.examId)) {
                            studentResults.push({ ...data, id: d.id });
                            seenExamIds.add(data.examId);
                        }
                    });
                } catch {
                    // Ignore if index not set up for this path
                }

                // Sort newest first
                studentResults.sort((a, b) => {
                    const dateA = a.examEndDate ? new Date(a.examEndDate).getTime() : (a.updatedAt || 0);
                    const dateB = b.examEndDate ? new Date(b.examEndDate).getTime() : (b.updatedAt || 0);
                    return dateB - dateA;
                });

                setResults(studentResults);

                // 2. Build subject map for display
                if (className) {
                    const classSubDoc = await getDoc(doc(db, "classSubjects", className));
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
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [user]);


    const handleDownloadLandscapePDF = (result: Result) => {
        if (typeof window === "undefined") return;
        const { examName } = result;
        const studentName = user?.displayName || "Student";
        const clsId = result.classId;
        const secId = result.sectionId;

        const subjectList = Object.values(result.marks);
        const subjectRows = subjectList.map(m => {
            const subName = subjects[m.subjectId]?.name || "Unknown Subject";
            const examTypeMark = (result as any).examType;
            const isUnit = examTypeMark === "Unit Test";
            const ptVal = isUnit ? (m.perTest !== null && m.perTest !== undefined ? m.perTest : 0) : "—";
            const nbVal = isUnit ? (m.noteBook !== null && m.noteBook !== undefined ? m.noteBook : 0) : "—";
            const seaVal = isUnit ? (m.sea !== null && m.sea !== undefined ? m.sea : 0) : "—";
            const testTotal = isUnit ? ((m.perTest || 0) + (m.noteBook || 0) + (m.sea || 0)) : "—";
            const maxM = m.total;
            const obt = m.obtained !== null ? m.obtained : 0;
            const pct = maxM > 0 ? (obt / maxM) * 100 : 0;
            const grade = getGrade(pct);
            return `<tr>
                <td style="padding:3px 6px;border:1px solid #ccc;text-align:left">${subName}</td>
                <td style="padding:3px 6px;border:1px solid #ccc;text-align:center">${ptVal}</td>
                <td style="padding:3px 6px;border:1px solid #ccc;text-align:center">${nbVal}</td>
                <td style="padding:3px 6px;border:1px solid #ccc;text-align:center">${seaVal}</td>
                <td style="padding:3px 6px;border:1px solid #ccc;text-align:center;font-weight:bold">${testTotal}</td>
                <td style="padding:3px 6px;border:1px solid #ccc;text-align:center;font-weight:bold">${obt}</td>
                <td style="padding:3px 6px;border:1px solid #ccc;text-align:center">${m.total}</td>
                <td style="padding:3px 6px;border:1px solid #ccc;text-align:center;color:#1a6b2e;font-weight:bold">${grade}</td>
            </tr>`;
        }).join("");

        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>Report Card - ${studentName}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:Arial,sans-serif;background:#fff;color:#111;font-size:11px;}
.hdr{background:#1a2e4c;color:#fff;padding:12px 20px;text-align:center;}
.school{font-size:18px;font-weight:800;}
.exam{font-size:10px;color:#93c5fd;text-transform:uppercase;letter-spacing:1px;margin-top:2px;}
.info{display:flex;gap:20px;flex-wrap:wrap;padding:10px 20px;background:#f8fafc;border-bottom:1px solid #e5e7eb;}
.info-item{display:flex;flex-direction:column;}
.info-lbl{font-size:8px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;}
.info-val{font-size:12px;font-weight:700;color:#1a2e4c;}
.tbl-sec{margin:10px 20px;}
table{width:100%;border-collapse:collapse;font-size:10px;}
th{padding:4px 6px;background:#1a2e4c;color:#fff;text-align:center;border:1px solid #ccc;}
.sum{display:flex;gap:10px;padding:10px 20px;}
.sb{flex:1;padding:10px;border:1px solid #e5e7eb;border-radius:6px;}
.sl{font-size:8px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;margin-bottom:3px;}
.sv{font-size:22px;font-weight:900;color:#1a2e4c;}
.sigs{display:flex;gap:20px;justify-content:space-around;margin:20px 20px 0;padding-top:12px;border-top:1px solid #e5e7eb;text-align:center;}
.sline{border-bottom:2px dashed #d1d5db;margin:0 auto 6px;width:75%;height:30px;}
.sname{font-size:8px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;}
@page{size:A4 landscape;margin:8mm;}
</style></head><body>
<div class="hdr"><div class="school">International Access School</div>
<div class="exam">${examName || "Report Card"}${(result as any).session ? " — Session " + (result as any).session : ""}</div></div>
<div class="info">
<div class="info-item"><span class="info-lbl">Student Name</span><span class="info-val">${studentName}</span></div>
<div class="info-item"><span class="info-lbl">Class & Section</span><span class="info-val">${clsId} — ${secId}</span></div>
<div class="info-item"><span class="info-lbl">Total Marks</span><span class="info-val">${result.totalObtained} / ${result.totalMax}</span></div>
<div class="info-item"><span class="info-lbl">Percentage</span><span class="info-val">${result.percentage}%</span></div>
<div class="info-item"><span class="info-lbl">Grade</span><span class="info-val">${result.overallGrade}</span></div>
</div>
<div class="tbl-sec"><table>
<thead><tr><th style="text-align:left">Subject</th><th>Per Test /10</th><th>Note Book /5</th><th>SEA /5</th><th>Test Total /20</th><th>Obtained</th><th>Max</th><th>Grade</th></tr></thead>
<tbody>${subjectRows}</tbody>
</table></div>
<div class="sigs">
<div><div class="sline"></div><div class="sname">Class Teacher</div></div>
<div><div class="sline"></div><div class="sname">Principal</div></div>
<div><div class="sline"></div><div class="sname">Parent / Guardian</div></div>
</div></body></html>`;

        const pw = window.open("", "_blank", "width=1100,height=700");
        if (!pw) { alert("Please allow popups to download as PDF"); return; }
        pw.document.write(html);
        pw.document.close();
        pw.focus();
        setTimeout(() => pw.print(), 600);
    };

    const handleDownloadPDF = () => {
        if (typeof window === "undefined" || !selectedResult) return;
        const { marks, totalObtained, totalMax, percentage, overallGrade, examName, examStartDate, examEndDate } = selectedResult;
        const markEntries = Object.values(marks);
        const studentName = user?.displayName || "Student";

        const rows = markEntries.map(m => {
            const subName = subjects[m.subjectId]?.name || "Unknown Subject";
            const obtained = m.obtained !== null ? String(m.obtained) : "ABSENT";
            const color = m.obtained !== null ? "#1a2e4c" : "#dc2626";
            return `<tr>
                <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;">${subName}</td>
                <td style="padding:10px 16px;text-align:right;border-bottom:1px solid #f0f0f0;">${m.total}</td>
                <td style="padding:10px 16px;text-align:right;border-bottom:1px solid #f0f0f0;font-weight:700;color:${color}">${obtained}</td>
            </tr>`;
        }).join("");

        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>Report Card - ${studentName}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:Arial,sans-serif;background:#fff;color:#111;}
.hdr{background:#1a2e4c;color:#fff;padding:28px 36px;display:flex;align-items:center;gap:18px;}
.logo{width:60px;height:60px;background:rgba(255,255,255,.15);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:26px;flex-shrink:0;}
.school{font-size:24px;font-weight:800;}
.exam{font-size:12px;color:#93c5fd;text-transform:uppercase;letter-spacing:1px;margin-top:4px;}
.info{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;padding:20px 36px;background:#f8fafc;border-bottom:1px solid #e5e7eb;}
.info label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;display:block;margin-bottom:3px;}
.info span{font-size:15px;font-weight:700;color:#1a2e4c;}
.tbl{margin:20px 36px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;}
table{width:100%;border-collapse:collapse;}
th{padding:10px 16px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;background:#f8fafc;}
th:not(:first-child){text-align:right;}
.sum{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:0 36px 28px;}
.sb{padding:18px;border-radius:10px;border:1px solid #e5e7eb;}
.sl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin-bottom:5px;}
.sv{font-size:30px;font-weight:900;color:#1a2e4c;}
.sigs{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin:32px 36px 0;padding-top:20px;border-top:1px solid #e5e7eb;text-align:center;}
.sline{border-bottom:2px dashed #d1d5db;margin:0 auto 8px;width:75%;height:36px;}
.sname{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;}
@page{size:A4 portrait;margin:8mm;}
</style></head><body>
<div class="hdr"><div class="logo">🏫</div>
<div><div class="school">International Access School</div>
<div class="exam">${examName || "Report Card"}</div></div></div>
<div class="info">
<div><label>Student Name</label><span>${studentName}</span></div>
<div><label>Class</label><span>${selectedResult.classId} – ${selectedResult.sectionId}</span></div>
<div><label>Period</label><span>${examStartDate || ""}–${examEndDate || ""}</span></div>
<div><label>Year</label><span>${new Date().getFullYear()}</span></div>
</div>
<div class="tbl"><table>
<thead><tr><th>Subject</th><th style="text-align:right">Max Marks</th><th style="text-align:right">Obtained</th></tr></thead>
<tbody>${rows}</tbody>
</table></div>
<div class="sum">
<div class="sb"><div class="sl">Total Score</div><div class="sv">${totalObtained}<span style="font-size:16px;color:#9ca3af"> / ${totalMax}</span></div></div>
<div class="sb"><div class="sl">Percentage</div><div class="sv">${percentage}%</div></div>
<div class="sb"><div class="sl">Overall Grade</div><div class="sv">${overallGrade}</div></div>
</div>
<div class="sigs">
<div><div class="sline"></div><div class="sname">Class Teacher</div></div>
<div><div class="sline"></div><div class="sname">Principal</div></div>
<div><div class="sline"></div><div class="sname">Parent / Guardian</div></div>
</div></body></html>`;

        const pw = window.open("", "_blank", "width=860,height=700");
        if (!pw) { alert("Please allow popups to download as PDF"); return; }
        pw.document.write(html);
        pw.document.close();
        pw.focus();
        setTimeout(() => pw.print(), 600);
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

    const isNewFormat = selectedResult && [
        "Unit Test", "Term Exam", "Annual Exam"
    ].includes((selectedResult as any).examType || "");

    if (selectedResult) {
        const { marks, totalObtained, totalMax, percentage, overallGrade, examName, examStartDate } = selectedResult;
        const markEntries = Object.values(marks);

        return (
            <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6 print:p-0 print:m-0 print:max-w-none print:w-full">
                <div className="flex items-center justify-between no-print mb-6">
                    <Button variant="outline" onClick={() => setSelectedResult(null)}>
                        &larr; Back to all results
                    </Button>
                    <div className="flex gap-2">
                        {isNewFormat ? (
                            <Button
                                onClick={() => handleDownloadLandscapePDF(selectedResult)}
                                className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
                            >
                                <LayoutTemplate className="mr-1 h-4 w-4" /> Download Landscape PDF / Print
                            </Button>
                        ) : (
                            <Button onClick={handleDownloadPDF} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                                <Download className="mr-2 h-4 w-4" /> Download PDF / Print
                            </Button>
                        )}
                    </div>
                </div>

                <Card className="border-border shadow-md bg-white text-black overflow-hidden print:overflow-visible print:shadow-none print:border-none print:m-0 print:p-0" ref={reportCardRef}>
                    <CardContent className="p-0 print:p-0">
                        <div className="bg-[#1a2e4c] text-white p-8 md:p-12 pb-16 print:p-10 print:pb-10 relative overflow-hidden print:overflow-visible flex items-center justify-between print:break-inside-avoid print:rounded-t-2xl border-b print:border-b-[#1a2e4c]">
                            <div className="absolute inset-0 opacity-10 print:hidden" style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.4) 0%, transparent 50%)` }} />
                            <div className="relative z-10 flex gap-6 items-center">
                                <div className="bg-white/10 backdrop-blur-md print:backdrop-blur-none print:bg-transparent rounded-2xl flex items-center justify-center border border-white/20 print:border-white/40 shadow-xl print:shadow-none shrink-0" style={{ width: '80px', height: '80px' }}>
                                    <School size={40} color="#d4af37" />
                                </div>
                                <div>
                                    <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white mb-2 shadow-sm">International Access School</h1>
                                    <p className="text-blue-100/80 font-medium text-lg tracking-wide uppercase">{examName || "Official Report Card"}</p>
                                </div>
                            </div>
                        </div>

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
                                            {examStartDate ? new Date(examStartDate).toLocaleDateString() : "N/A"}
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
                                <div className="flex-1 bg-gradient-to-br from-[#d4af37]/20 to-[#d4af37]/5 border border-[#d4af37]/30 print:border-gray-200 print:bg-white p-6 rounded-2xl shadow-sm flex flex-col justify-center print:p-6 print:shadow-none">
                                    <p className="text-[#a68a2b] print:text-gray-500 text-sm font-bold uppercase tracking-widest mb-1">Overall Grade</p>
                                    <span className="text-5xl font-black text-[#8c7423] print:text-[#1a2e4c] drop-shadow-sm print:drop-shadow-none">{overallGrade}</span>
                                </div>
                            </div>

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
                        @page { margin: 10mm; size: A4 portrait; }
                        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                        .no-print { display: none !important; }
                        body { background: white !important; margin: 0; padding: 0; }
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
                            <CardTitle className="text-xl line-clamp-1">{res.examName || res.examId}</CardTitle>
                            <CardDescription>
                                {res.overallGrade} Grade • Class {res.classId}-{res.sectionId}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center justify-between text-sm pt-4 border-t border-dashed border-gray-200">
                                <span className="text-muted-foreground">
                                    {res.examStartDate ? new Date(res.examStartDate).toLocaleDateString() : "View details"}
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
