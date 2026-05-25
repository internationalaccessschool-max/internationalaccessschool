"use client";

import { useState, useEffect } from "react";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { Result, Exam, Subject } from "@/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Award, FileText, ChevronRight, School, LayoutTemplate, Download } from "lucide-react";
import { getStudentClassInfo } from "@/lib/utils/studentProfile";

// Grading scale matching the report card
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

type ExamWithResult = {
    exam: Exam;
    result: Result;
};

export default function StudentResultsPage() {
    const { user } = useAuth();
    const [examResults, setExamResults] = useState<ExamWithResult[]>([]);
    const [allExams, setAllExams] = useState<Exam[]>([]);
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [subjectsMap, setSubjectsMap] = useState<Record<string, Subject>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [selectedResult, setSelectedResult] = useState<ExamWithResult | null>(null);
    const [studentInfo, setStudentInfo] = useState<{ className: string; section: string; name: string }>({ className: "", section: "", name: "" });

    useEffect(() => {
        if (!user) return;

        const fetchData = async () => {
            try {
                let { className, section, name } = await getStudentClassInfo(user.uid);

                // Normalize class name — teacher saves marks using normalized form (e.g. "5" not "Class 5")
                const normClass = (cls: string) => cls.replace(/^class\s*/i, "").trim();

                const seenExamIds = new Set<string>();
                const loaded: ExamWithResult[] = [];

                const examsSnap = await getDocs(collection(db, "exams"));
                const exams = examsSnap.docs.map(d => ({ id: d.id, ...d.data() }) as Exam);
                setAllExams(exams);

                for (const exam of exams) {
                    if (seenExamIds.has(exam.id!)) continue;
                    let resultData: Result | null = null;

                    // Try multiple className variants — teacher may save as "5" even if profile has "Class 5"
                    const classVariants = className
                        ? [className, normClass(className), `Class ${normClass(className)}`]
                        : [];

                    for (const clsVariant of classVariants) {
                        if (!clsVariant || !section) break;
                        try {
                            const ref = doc(db, "results", exam.id!, "classes", clsVariant, "sections", section, "students", user.uid);
                            const snap = await getDoc(ref);
                            if (snap.exists()) {
                                resultData = { id: snap.id, ...snap.data() } as Result;
                                break;
                            }
                        } catch { /* try next variant */ }
                    }

                    // Fallback: old composite ID path
                    if (!resultData) {
                        try {
                            const oldRef = doc(db, "results", `${exam.id}_${user.uid}`);
                            const oldSnap = await getDoc(oldRef);
                            if (oldSnap.exists()) {
                                resultData = { id: oldSnap.id, ...oldSnap.data() } as Result;
                            }
                        } catch { /* ignore */ }
                    }

                    if (resultData) {
                        if (!resultData.examName) resultData.examName = exam.name;
                        if (!resultData.examStartDate) resultData.examStartDate = exam.startDate;
                        if (!resultData.examEndDate) resultData.examEndDate = exam.endDate;
                        loaded.push({ exam, result: resultData });
                        seenExamIds.add(exam.id!);
                    }
                }

                // FALLBACK: if getStudentClassInfo returned empty, extract class/section from the result docs
                if ((!className || !section) && loaded.length > 0) {
                    const firstResult = loaded[0].result;
                    className = firstResult.classId || className;
                    section = firstResult.sectionId || section;
                    name = name || (firstResult as any).studentName || "";
                }

                setStudentInfo({ className, section, name });

                loaded.sort((a, b) => {
                    const dateA = a.exam.endDate ? new Date(a.exam.endDate).getTime() : 0;
                    const dateB = b.exam.endDate ? new Date(b.exam.endDate).getTime() : 0;
                    return dateB - dateA;
                });

                setExamResults(loaded);

                // Load subjects — try multiple class name variants
                const classToTry = className || "";
                const normCls = normClass(classToTry);
                for (const key of [normCls, classToTry, `Class ${normCls}`]) {
                    if (!key) continue;
                    try {
                        const classSubDoc = await getDoc(doc(db, "classSubjects", key));
                        if (classSubDoc.exists()) {
                            const subjectList: Subject[] = (classSubDoc.data().subjects || []).map((s: any) =>
                                typeof s === "object" ? s : { id: s, name: s, maxMarks: 100 }
                            );
                            setSubjects(subjectList);
                            const subsMap: Record<string, Subject> = {};
                            subjectList.forEach(s => { subsMap[(s.id || s.name) as string] = s; });
                            setSubjectsMap(subsMap);
                            break;
                        }
                    } catch { /* try next */ }
                }
            } catch (err) {
                console.error("Error fetching student results:", err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [user]);

    // ── Helper: find companion exams in same session ──
    const getSessionExams = (session: string) => {
        if (!session) return { unit1: null, hy: null, unit2: null, annual: null };
        const sessionExams = allExams.filter(e => e.session === session);
        const unitTests = sessionExams.filter(e => e.examType === "Unit Test").sort((a, b) =>
            (a.startDate || "").localeCompare(b.startDate || ""));
        return {
            unit1: unitTests[0] || null,
            hy: sessionExams.find(e => e.examType === "Term Exam") || null,
            unit2: unitTests[1] || null,
            annual: sessionExams.find(e => e.examType === "Annual Exam") || null,
        };
    };

    // ── Helper: is this exam the Unit II (second Unit Test)? ──
    const isUnitII = (er: ExamWithResult): boolean => {
        if (er.exam.examType !== "Unit Test") return false;
        const se = getSessionExams(er.exam.session || "");
        return se.unit2?.id === er.exam.id;
    };

    // ── Helper: get marks for an exam from examResults ──
    const getMarksForExam = (examId: string): Record<string, any> => {
        const er = examResults.find(e => e.exam.id === examId);
        return er?.result?.marks || {};
    };

    // ── Helper: get co-scholastic from a result ──
    const getCoScholastic = (examId: string): Record<string, any> => {
        const er = examResults.find(e => e.exam.id === examId);
        return (er?.result as any)?.coScholastic || {};
    };

    // ── Print: Full Year Landscape Report Card (all 4 exams) ──
    const printFullYearReport = (er: ExamWithResult) => {
        const session = er.exam.session || "";
        const se = getSessionExams(session);
        const studentName = user?.displayName || studentInfo.name || "Student";

        const u1Marks = se.unit1 ? getMarksForExam(se.unit1.id!) : {};
        const hyMarks = se.hy ? getMarksForExam(se.hy.id!) : {};
        const u2Marks = se.unit2 ? getMarksForExam(se.unit2.id!) : {};
        const annMarks = se.annual ? getMarksForExam(se.annual.id!) : {};

        let grandTotalObt = 0;
        const maxGrand = subjects.length * 200;

        const subjectRows = subjects.map(sub => {
            const sid = sub.id || sub.name;
            const u1 = u1Marks[sid] || {} as any;
            const hy = hyMarks[sid] || {} as any;
            const u2 = u2Marks[sid] || {} as any;
            const ann = annMarks[sid] || {} as any;

            const u1PT = u1.perTest ?? 0, u1NB = u1.noteBook ?? 0, u1SEA = u1.sea ?? 0;
            const u1Total = u1PT + u1NB + u1SEA;
            const hyObt = hy.obtained ?? 0;
            const t1Total = u1Total + hyObt;

            const u2PT = u2.perTest ?? 0, u2NB = u2.noteBook ?? 0, u2SEA = u2.sea ?? 0;
            const u2Total = u2PT + u2NB + u2SEA;
            const annObt = ann.obtained ?? 0;
            const t2Total = u2Total + annObt;

            const gt = t1Total + t2Total;
            grandTotalObt += gt;
            const grade = getGrade(gt > 0 ? (gt / 200) * 100 : 0);

            return `<tr>
                <td class="sn">${sub.name}</td>
                <td class="c">${u1PT||"—"}</td><td class="c">${u1NB||"—"}</td><td class="c">${u1SEA||"—"}</td>
                <td class="c b">${u1Total||"—"}</td><td class="c">${hyObt||"—"}</td><td class="c b">${t1Total}</td>
                <td class="c">${u2PT||"—"}</td><td class="c">${u2NB||"—"}</td><td class="c">${u2SEA||"—"}</td>
                <td class="c b">${u2Total||"—"}</td><td class="c">${annObt||"—"}</td><td class="c b">${t2Total}</td>
                <td class="c b gt">${gt}</td><td class="c gr">${grade}</td>
            </tr>`;
        }).join("");

        const overallPct = maxGrand > 0 ? (grandTotalObt / maxGrand * 100) : 0;
        const overallGrade = getGrade(overallPct);

        // Co-scholastic from annual result
        const coScho = (er.result as any).coScholastic || {};
        const coRows = [
            { id: "workEd", label: "Work Education" },
            { id: "artEd", label: "Art Education" },
            { id: "sports", label: "Sports/Yoga/NCC" },
        ].map(cs => {
            const hy = coScho[cs.id]?.hy || "—";
            const ann = coScho[cs.id]?.annual || "—";
            return `<tr><td>${cs.label}</td><td class="c">${hy}</td><td class="c">${ann}</td></tr>`;
        }).join("");

        const html = buildLandscapeHTML({
            studentName, session, subjectRows, grandTotalObt, maxGrand, overallPct, overallGrade, coRows,
            cls: studentInfo.className, sec: studentInfo.section,
        });
        openPrintWindow(html, 1200, 800);
    };

    // ── Print: Term 1 Report Card (Unit I + Half Yearly) ──
    const printTerm1Report = (er: ExamWithResult) => {
        const session = er.exam.session || "";
        const se = getSessionExams(session);
        const studentName = user?.displayName || studentInfo.name || "Student";

        const u1Marks = se.unit1 ? getMarksForExam(se.unit1.id!) : {};
        const hyMarks = se.hy ? getMarksForExam(se.hy.id!) : {};

        let t1TotalObt = 0;
        const t1Max = subjects.length * 100;

        const subjectRows = subjects.map(sub => {
            const sid = sub.id || sub.name;
            const u1 = u1Marks[sid] || {} as any;
            const hy = hyMarks[sid] || {} as any;

            const pt = u1.perTest ?? 0, nb = u1.noteBook ?? 0, sea = u1.sea ?? 0;
            const unitTotal = pt + nb + sea;
            const hyObt = hy.obtained ?? 0;
            const total = unitTotal + hyObt;
            t1TotalObt += total;
            const grade = getGrade(total > 0 ? (total / 100) * 100 : 0);

            return `<tr>
                <td class="sn">${sub.name}</td>
                <td class="c">${pt||"—"}</td><td class="c">${nb||"—"}</td><td class="c">${sea||"—"}</td>
                <td class="c b">${unitTotal}</td><td class="c">${hyObt||"—"}</td>
                <td class="c b">${total}</td><td class="c gr">${grade}</td>
            </tr>`;
        }).join("");

        const pct = t1Max > 0 ? (t1TotalObt / t1Max * 100) : 0;

        const html = buildTermHTML({
            term: "TERM-1", studentName, session, subjectRows,
            totalObt: t1TotalObt, totalMax: t1Max, pct, grade: getGrade(pct),
            unitLabel: "Unit I Test", examLabel: "Half Yearly",
            cls: studentInfo.className, sec: studentInfo.section,
        });
        openPrintWindow(html, 1000, 700);
    };

    // ── Print: Unit I Test Only Report ──
    const printUnitTestReport = (er: ExamWithResult) => {
        const studentName = user?.displayName || studentInfo.name || "Student";
        const marks = er.result.marks || {};

        let totalObt = 0;
        const totalMax = subjects.length * 20;

        const subjectRows = subjects.map(sub => {
            const m = marks[sub.id || sub.name] || {} as any;
            const pt = m.perTest ?? 0, nb = m.noteBook ?? 0, sea = m.sea ?? 0;
            const total = pt + nb + sea;
            totalObt += total;
            const grade = getGrade(total > 0 ? (total / 20) * 100 : 0);

            return `<tr>
                <td class="sn">${sub.name}</td>
                <td class="c">${pt||"—"}</td><td class="c">${nb||"—"}</td><td class="c">${sea||"—"}</td>
                <td class="c b">${total}</td><td class="c gr">${grade}</td>
            </tr>`;
        }).join("");

        const pct = totalMax > 0 ? (totalObt / totalMax * 100) : 0;

        const html = buildUnitTestHTML({
            examName: er.exam.name, studentName, session: er.exam.session || "",
            subjectRows, totalObt, totalMax, pct, grade: getGrade(pct),
            cls: studentInfo.className, sec: studentInfo.section,
        });
        openPrintWindow(html, 900, 700);
    };

    // ── Print: Unit II Cumulative Report (U1 + HY + U2 = /120) ──
    const printUnitIIReport = (er: ExamWithResult) => {
        const session = er.exam.session || "";
        const se = getSessionExams(session);
        const studentName = user?.displayName || studentInfo.name || "Student";

        const u1Marks = se.unit1 ? getMarksForExam(se.unit1.id!) : {};
        const hyMarks = se.hy    ? getMarksForExam(se.hy.id!)    : {};
        const u2Marks = se.unit2 ? getMarksForExam(se.unit2.id!) : {};

        let totalObt = 0;
        const totalMax = subjects.length * 120;

        const subjectRows = subjects.map(sub => {
            const sid = sub.id || sub.name;
            const u1 = u1Marks[sid] || {} as any;
            const hy = hyMarks[sid] || {} as any;
            const u2 = u2Marks[sid] || {} as any;

            const u1PT = u1.perTest ?? 0, u1NB = u1.noteBook ?? 0, u1SEA = u1.sea ?? 0;
            const u1Tot = u1PT + u1NB + u1SEA;
            const hyObt = hy.obtained ?? 0;
            const t1Tot = u1Tot + hyObt;

            const u2PT = u2.perTest ?? 0, u2NB = u2.noteBook ?? 0, u2SEA = u2.sea ?? 0;
            const u2Tot = u2PT + u2NB + u2SEA;

            const cumulative = t1Tot + u2Tot;
            totalObt += cumulative;
            const grade = getGrade(cumulative > 0 ? (cumulative / 120) * 100 : 0);

            return `<tr>
                <td class="sn">${sub.name}</td>
                <td class="c">${u1PT||"—"}</td><td class="c">${u1NB||"—"}</td><td class="c">${u1SEA||"—"}</td>
                <td class="c b">${u1Tot}</td><td class="c">${hyObt||"—"}</td>
                <td class="c b bdr-r">${t1Tot}</td>
                <td class="c bdr-l">${u2PT||"—"}</td><td class="c">${u2NB||"—"}</td><td class="c">${u2SEA||"—"}</td>
                <td class="c b">${u2Tot}</td>
                <td class="c b grand">${cumulative}</td>
                <td class="c gr">${grade}</td>
            </tr>`;
        }).join("");

        const pct = totalMax > 0 ? (totalObt / totalMax * 100) : 0;

        const html = buildUnitIIHTML({
            studentName, session, subjectRows, totalObt, totalMax, pct,
            grade: getGrade(pct), cls: studentInfo.className, sec: studentInfo.section,
        });
        openPrintWindow(html, 1100, 750);
    };

    // ── Print: Standard (legacy) Report ──
    const printStandardReport = (er: ExamWithResult) => {
        const studentName = user?.displayName || studentInfo.name || "Student";
        const { marks, totalObtained, totalMax, percentage, overallGrade, examName, examStartDate, examEndDate } = er.result;
        const markEntries = Object.values(marks);

        const rows = markEntries.map(m => {
            const subName = subjectsMap[m.subjectId]?.name || "Unknown Subject";
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
*{box-sizing:border-box;margin:0;padding:0;}body{font-family:Arial,sans-serif;background:#fff;color:#111;}
.hdr{background:#1a2e4c;color:#fff;padding:28px 36px;display:flex;align-items:center;gap:18px;}
.logo{width:60px;height:60px;background:rgba(255,255,255,.15);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:26px;}
.school{font-size:24px;font-weight:800;}.exam{font-size:12px;color:#93c5fd;text-transform:uppercase;letter-spacing:1px;margin-top:4px;}
.info{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;padding:20px 36px;background:#f8fafc;border-bottom:1px solid #e5e7eb;}
.info label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;display:block;margin-bottom:3px;}
.info span{font-size:15px;font-weight:700;color:#1a2e4c;}
.tbl{margin:20px 36px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;}
table{width:100%;border-collapse:collapse;}th{padding:10px 16px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;background:#f8fafc;}
th:not(:first-child){text-align:right;}
.sum{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:0 36px 28px;}
.sb{padding:18px;border-radius:10px;border:1px solid #e5e7eb;}.sl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin-bottom:5px;}
.sv{font-size:30px;font-weight:900;color:#1a2e4c;}
.sigs{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin:32px 36px 0;padding-top:20px;border-top:1px solid #e5e7eb;text-align:center;}
.sline{border-bottom:2px dashed #d1d5db;margin:0 auto 8px;width:75%;height:36px;}
.sname{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;}
@page{size:A4 portrait;margin:8mm;}
</style></head><body>
<div class="hdr"><div class="logo">🏫</div><div><div class="school">International Access School</div><div class="exam">${examName||"Report Card"}</div></div></div>
<div class="info"><div><label>Student Name</label><span>${studentName}</span></div><div><label>Class</label><span>${er.result.classId} – ${er.result.sectionId}</span></div>
<div><label>Period</label><span>${examStartDate||""}–${examEndDate||""}</span></div><div><label>Year</label><span>${new Date().getFullYear()}</span></div></div>
<div class="tbl"><table><thead><tr><th>Subject</th><th style="text-align:right">Max Marks</th><th style="text-align:right">Obtained</th></tr></thead><tbody>${rows}</tbody></table></div>
<div class="sum"><div class="sb"><div class="sl">Total Score</div><div class="sv">${totalObtained}<span style="font-size:16px;color:#9ca3af"> / ${totalMax}</span></div></div>
<div class="sb"><div class="sl">Percentage</div><div class="sv">${percentage}%</div></div>
<div class="sb"><div class="sl">Overall Grade</div><div class="sv">${overallGrade}</div></div></div>
<div class="sigs"><div><div class="sline"></div><div class="sname">Class Teacher</div></div><div><div class="sline"></div><div class="sname">Principal</div></div>
<div><div class="sline"></div><div class="sname">Parent / Guardian</div></div></div></body></html>`;
        openPrintWindow(html, 860, 700);
    };

    // ── Decide which print to use ──
    const handlePrint = (er: ExamWithResult) => {
        const examType = er.exam.examType || (er.result as any).examType || "";
        if (examType === "Annual Exam") return printFullYearReport(er);
        if (examType === "Term Exam")   return printTerm1Report(er);
        if (examType === "Unit Test")   return isUnitII(er) ? printUnitIIReport(er) : printUnitTestReport(er);
        return printStandardReport(er);
    };

    // ── Group by session ──
    const groupedBySession = examResults.reduce((acc, er) => {
        const session = er.exam.session || "Other";
        if (!acc[session]) acc[session] = [];
        acc[session].push(er);
        return acc;
    }, {} as Record<string, ExamWithResult[]>);

    if (isLoading) {
        return (<div className="flex h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>);
    }

    if (examResults.length === 0) {
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

    // ── Detail View ──
    if (selectedResult) {
        const er = selectedResult;
        const examType = er.exam.examType || "";
        const { marks, totalObtained, totalMax, percentage, overallGrade, examName } = er.result;
        const markEntries = Object.values(marks);

        return (
            <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
                <div className="flex items-center justify-between mb-6">
                    <Button variant="outline" onClick={() => setSelectedResult(null)}>&larr; Back to all results</Button>
                    <Button onClick={() => handlePrint(er)} className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2">
                        {examType === "Annual Exam" ? <LayoutTemplate className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                        {examType === "Annual Exam" ? "Full Year Report Card" :
                         examType === "Term Exam"   ? "Term 1 Report Card" :
                         examType === "Unit Test" && isUnitII(er) ? "Unit II Cumulative Report (/120)" :
                         examType === "Unit Test" ? "Unit I Test Report (/20)" : "Download PDF"}
                    </Button>
                </div>

                <Card className="border-border shadow-md bg-white text-black overflow-hidden">
                    <CardContent className="p-0">
                        <div className="bg-[#1a2e4c] text-white p-8 md:p-12 pb-16 relative overflow-hidden flex items-center">
                            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.4) 0%, transparent 50%)` }} />
                            <div className="relative z-10 flex gap-6 items-center">
                                <div className="bg-white/10 rounded-2xl flex items-center justify-center border border-white/20" style={{ width: '80px', height: '80px' }}>
                                    <School size={40} color="#d4af37" />
                                </div>
                                <div>
                                    <h1 className="text-3xl font-bold tracking-tight text-white mb-2">International Access School</h1>
                                    <p className="text-blue-100/80 font-medium text-lg tracking-wide uppercase">{examName || "Report Card"}</p>
                                    {er.exam.session && <Badge className="bg-amber-500/20 text-amber-200 border-amber-400/30 mt-1">Session {er.exam.session}</Badge>}
                                </div>
                            </div>
                        </div>

                        <div className="px-8 md:px-12 -mt-8 relative z-20">
                            <Card className="border-0 shadow-xl ring-1 ring-black/5 bg-white p-6 rounded-2xl">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                    <div className="space-y-1">
                                        <p className="text-[11px] font-bold tracking-widest text-[#1a2e4c]/50 uppercase">Student Name</p>
                                        <p className="font-semibold text-lg text-[#1a2e4c]">{user?.displayName || "Student"}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[11px] font-bold tracking-widest text-[#1a2e4c]/50 uppercase">Class & Section</p>
                                        <p className="font-semibold text-lg text-[#1a2e4c]">{er.result.classId} - {er.result.sectionId}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[11px] font-bold tracking-widest text-[#1a2e4c]/50 uppercase">Exam Type</p>
                                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 mt-1 text-sm py-0.5 px-3">
                                            {examType || "Standard"}
                                        </Badge>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[11px] font-bold tracking-widest text-[#1a2e4c]/50 uppercase">Status</p>
                                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 mt-1 text-sm py-0.5 px-3">Published</Badge>
                                    </div>
                                </div>
                            </Card>
                        </div>

                        <div className="p-8 md:p-12 pt-10">
                            <div className="border border-gray-100 rounded-2xl overflow-x-auto shadow-sm">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-[#f8fafc] border-b border-gray-100">
                                            <th className="py-4 px-6 text-sm font-bold text-[#1a2e4c] w-1/3">Subject</th>
                                            {examType === "Unit Test" ? (
                                                <>
                                                    <th className="py-4 px-6 text-sm font-bold text-[#1a2e4c] text-center">Per Test /10</th>
                                                    <th className="py-4 px-6 text-sm font-bold text-[#1a2e4c] text-center">Note Book /5</th>
                                                    <th className="py-4 px-6 text-sm font-bold text-[#1a2e4c] text-center">SEA /5</th>
                                                    <th className="py-4 px-6 text-sm font-bold text-[#1a2e4c] text-center">Total /20</th>
                                                </>
                                            ) : (
                                                <>
                                                    <th className="py-4 px-6 text-sm font-bold text-[#1a2e4c] text-right">Max Marks</th>
                                                    <th className="py-4 px-6 text-sm font-bold text-[#1a2e4c] text-right">Obtained</th>
                                                </>
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50 bg-white">
                                        {(er.result as any).absent === true ? (
                                            <tr>
                                                <td colSpan={examType === "Unit Test" ? 5 : 3} className="py-8 text-center">
                                                    <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-100 text-red-700 font-bold text-base">
                                                        ABSENT
                                                    </span>
                                                    <p className="text-muted-foreground text-sm mt-2">Student was absent for this exam.</p>
                                                </td>
                                            </tr>
                                        ) : markEntries.map((m, idx) => {
                                            const subName = subjectsMap[m.subjectId]?.name || "Unknown Subject";
                                            if (examType === "Unit Test") {
                                                const pt = m.perTest ?? 0, nb = m.noteBook ?? 0, sea = m.sea ?? 0;
                                                return (
                                                    <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                                                        <td className="py-4 px-6 font-medium text-gray-900">{subName}</td>
                                                        <td className="py-4 px-6 text-center font-medium">{pt}</td>
                                                        <td className="py-4 px-6 text-center font-medium">{nb}</td>
                                                        <td className="py-4 px-6 text-center font-medium">{sea}</td>
                                                        <td className="py-4 px-6 text-center font-bold text-lg text-[#1a2e4c]">{pt + nb + sea}</td>
                                                    </tr>
                                                );
                                            }
                                            return (
                                                <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                                                    <td className="py-4 px-6 font-medium text-gray-900">{subName}</td>
                                                    <td className="py-4 px-6 text-gray-500 text-right font-medium">{m.total}</td>
                                                    <td className="py-4 px-6 text-[#1a2e4c] text-right font-bold text-lg">
                                                        {m.obtained !== null ? m.obtained : <span className="text-red-500 text-sm">AB</span>}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            <div className="mt-8 flex flex-col md:flex-row gap-6">
                                <div className="flex-1 bg-[#1a2e4c] text-white p-6 rounded-2xl shadow-md border border-[#2a4570]">
                                    <p className="text-blue-200 text-sm font-medium mb-1">Total Score</p>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-4xl font-bold tracking-tight text-[#d4af37]">{totalObtained}</span>
                                        <span className="text-xl text-blue-200/50">/ {totalMax}</span>
                                    </div>
                                </div>
                                <div className="flex-1 bg-white border border-gray-100 p-6 rounded-2xl shadow-sm">
                                    <p className="text-gray-500 text-sm font-medium mb-1">Percentage</p>
                                    <span className="text-4xl font-bold tracking-tight text-[#1a2e4c]">{percentage}%</span>
                                </div>
                                <div className="flex-1 bg-gradient-to-br from-[#d4af37]/20 to-[#d4af37]/5 border border-[#d4af37]/30 p-6 rounded-2xl shadow-sm">
                                    <p className="text-[#a68a2b] text-sm font-bold uppercase tracking-widest mb-1">Overall Grade</p>
                                    <span className="text-5xl font-black text-[#8c7423]">{overallGrade}</span>
                                </div>
                            </div>

                            {/* Info about combined report */}
                            {examType === "Unit Test" && !isUnitII(er) && (
                                <div className="mt-4 p-4 bg-violet-50 border border-violet-200 rounded-xl text-sm text-violet-800">
                                    💡 <strong>Unit I Report:</strong> Shows PT/10 + NB/5 + SEA/5 = Total/20 per subject. Grade calculated out of 20.
                                </div>
                            )}
                            {examType === "Unit Test" && isUnitII(er) && (
                                <div className="mt-4 p-4 bg-orange-50 border border-orange-200 rounded-xl text-sm text-orange-800">
                                    💡 <strong>Unit II Cumulative Report:</strong> Shows all marks up to Unit II — Unit I (20) + Half Yearly (80) + Unit II (20) = <strong>120 marks</strong> per subject. Grade calculated out of 120.
                                </div>
                            )}
                            {examType === "Term Exam" && (
                                <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
                                    💡 <strong>Tip:</strong> Click "Term 1 Report Card" above to generate a combined Term-1 marksheet showing Unit I + Half Yearly marks (/100 per subject).
                                </div>
                            )}
                            {examType === "Annual Exam" && (
                                <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-800">
                                    💡 <strong>Tip:</strong> Click "Full Year Report Card" above to generate the complete landscape report card with all 4 exams, Grand Total /200, and overall grade.
                                </div>
                            )}

                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // ── List View — Grouped by Session ──
    return (
        <div className="p-6 md:p-10 space-y-8 max-w-6xl mx-auto">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Academic Results</h1>
                <p className="text-muted-foreground mt-1">View and download your examination report cards.</p>
            </div>

            {Object.entries(groupedBySession).map(([session, ers]) => (
                <div key={session} className="space-y-4">
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-sm font-semibold">
                            {session === "Other" ? "General" : `Session ${session}`}
                        </Badge>
                        <div className="flex-1 h-px bg-border" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {ers.map((er) => {
                            const examType = er.exam.examType || "";
                            const typeColor = examType === "Unit Test" ? "bg-violet-50 text-violet-700 border-violet-200" :
                                examType === "Term Exam" ? "bg-blue-50 text-blue-700 border-blue-200" :
                                examType === "Annual Exam" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                "bg-gray-50 text-gray-700 border-gray-200";

                            return (
                                <Card
                                    key={er.result.id}
                                    className="overflow-hidden hover:shadow-lg transition-all duration-300 border-border group cursor-pointer"
                                    onClick={() => setSelectedResult(er)}
                                >
                                    <div className="h-2 bg-gradient-to-r from-[#1a2e4c] to-[#d4af37]" />
                                    <CardHeader className="pb-4">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="p-2.5 bg-blue-50 text-blue-700 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                                <FileText className="h-6 w-6" />
                                            </div>
                                            <div className="flex flex-col items-end gap-1">
                                                {(er.result as any).absent === true ? (
                                                    <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 font-bold">ABSENT</Badge>
                                                ) : (
                                                    <Badge variant="secondary" className="bg-[#1a2e4c]/5 text-[#1a2e4c] font-semibold border-none">
                                                        {er.result.percentage}%
                                                    </Badge>
                                                )}
                                                {examType && (
                                                    <Badge variant="outline" className={`text-xs ${typeColor}`}>{examType}</Badge>
                                                )}
                                            </div>
                                        </div>
                                        <CardTitle className="text-xl line-clamp-1">{er.result.examName || er.exam.name}</CardTitle>
                                        <CardDescription>
                                            {(er.result as any).absent === true ? "Absent" : `${er.result.overallGrade} Grade`} • Class {er.result.classId}-{er.result.sectionId}
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="flex items-center justify-between text-sm pt-4 border-t border-dashed border-gray-200">
                                            <span className="text-muted-foreground">
                                                {er.exam.startDate ? new Date(er.exam.startDate).toLocaleDateString() : "View details"}
                                            </span>
                                            <span className="text-primary font-medium flex items-center group-hover:translate-x-1 transition-transform">
                                                View Report <ChevronRight className="ml-1 h-4 w-4" />
                                            </span>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}

// ═══════ HTML Builders ═══════

function openPrintWindow(html: string, w: number, h: number) {
    const pw = window.open("", "_blank", `width=${w},height=${h}`);
    if (!pw) { alert("Please allow popups to print"); return; }
    pw.document.write(html);
    pw.document.close();
    pw.focus();
    setTimeout(() => pw.print(), 600);
}

function schoolHeader(session: string, examLabel: string) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `<div style="display:flex;align-items:center;gap:8px;border-bottom:3px double #1a2e4c;padding-bottom:5px;margin-bottom:5px;">
      <img src="${origin}/LOGO.png" style="width:46px;height:46px;object-fit:contain;flex-shrink:0;" alt="IAS"/>
      <div style="flex:1;text-align:center;line-height:1.3;">
        <div style="font-size:16px;font-weight:900;color:#1a2e4c;letter-spacing:1px;text-transform:uppercase;">INTERNATIONAL ACCESS SCHOOL</div>
        <div style="font-size:7px;color:#444;margin-top:1px;">Affiliated to CBSE(10+2) New Delhi &nbsp;|&nbsp; Aff. No: 330691 &nbsp;|&nbsp; School Code: 65688</div>
        <div style="font-size:7px;color:#444;">Siwan, Bihar – 841227 &nbsp;|&nbsp; Ph: +91 93477 76670, 84060 00830/33/40</div>
        <div style="font-size:7px;color:#444;">Email: info@iaschool.edu.in &nbsp;|&nbsp; www.iaschool.edu.in</div>
      </div>
      <div style="text-align:right;min-width:110px;flex-shrink:0;">
        <div style="font-size:12px;font-weight:900;color:#1a2e4c;border:2px solid #1a2e4c;padding:1px 6px;display:inline-block;letter-spacing:1px;">Report Card</div>
        <div style="font-size:7.5px;color:#555;font-weight:bold;margin-top:2px;">Academic Session: ${session || new Date().getFullYear()}</div>
        <div style="font-size:8px;color:#1a2e4c;font-weight:800;margin-top:1px;text-transform:uppercase;">${examLabel}</div>
      </div>
    </div>`;
}

function buildLandscapeHTML(p: {
    studentName: string; session: string; subjectRows: string;
    grandTotalObt: number; maxGrand: number; overallPct: number; overallGrade: string;
    coRows: string; cls: string; sec: string;
}) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Report Card - ${p.studentName}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}body{font-family:Arial,sans-serif;background:#fff;font-size:10px;}
.info{display:flex;gap:16px;flex-wrap:wrap;background:#f0f4f8;padding:5px 8px;border-radius:4px;margin-bottom:6px;border:1px solid #dde3ea;}
.ig{display:flex;flex-direction:column;min-width:100px;}.il{font-size:7px;color:#888;text-transform:uppercase;font-weight:bold;}.iv{font-size:11px;font-weight:700;color:#1a2e4c;}
table{width:100%;border-collapse:collapse;font-size:9px;margin-bottom:6px;}
th,td{border:1px solid #ccc;padding:2px 3px;vertical-align:middle;}
thead th{background:#1a2e4c;color:#fff;text-align:center;font-size:8px;}
.sn{text-align:left;padding-left:4px;font-size:9px;}.c{text-align:center;}.b{font-weight:bold;}
.gt{background:#fff8e1;}.gr{background:#e8f5e9;color:#1a6b2e;font-weight:bold;}
.bot{display:flex;gap:8px;margin-bottom:6px;}
.cosec{flex:1.2;}.attsec{flex:.7;}.ressec{flex:1;}
.stitle{font-size:8px;font-weight:bold;text-transform:uppercase;color:#1a2e4c;border-bottom:1px solid #1a2e4c;margin-bottom:2px;padding-bottom:1px;}
.ct,.at{width:100%;border-collapse:collapse;font-size:8.5px;}.ct th,.ct td,.at th,.at td{border:1px solid #ccc;padding:2px 3px;}
.ct thead th,.at thead th{background:#e8eef5;font-weight:bold;text-align:center;}
.sg{display:grid;grid-template-columns:1fr 1fr;gap:3px;}.si{background:#f8fafc;border:1px solid #e5e7eb;border-radius:3px;padding:3px 5px;}
.sl{font-size:7px;color:#888;text-transform:uppercase;}.sv{font-size:14px;font-weight:900;color:#1a2e4c;}
.sigs{display:flex;gap:15px;justify-content:space-around;padding-top:6px;border-top:1px solid #e5e7eb;margin-top:6px;}
.sigb{text-align:center;flex:1;}.sigl{border-bottom:2px dashed #aaa;margin:0 auto 3px;height:20px;}
.sign{font-size:7.5px;text-transform:uppercase;letter-spacing:.5px;color:#555;font-weight:bold;}
@page{size:A4 landscape;margin:5mm;}
</style></head><body>
${schoolHeader(p.session, "Annual Report")}
<div class="info">
<div class="ig"><span class="il">Student's Name</span><span class="iv">${p.studentName}</span></div>
<div class="ig"><span class="il">Class</span><span class="iv">${p.cls}</span></div>
<div class="ig"><span class="il">Section</span><span class="iv">${p.sec}</span></div>
</div>
<table>
<thead>
<tr><th rowspan="3" style="text-align:left;width:110px">Subjects</th>
<th colspan="6" style="border-left:2px solid #1a2e4c;border-right:2px solid #1a2e4c">TERM-1 (100 Marks)</th>
<th colspan="6" style="border-right:2px solid #1a2e4c">TERM-2 (100 Marks)</th>
<th colspan="2">Over All</th></tr>
<tr><th colspan="4" style="border-left:2px solid #1a2e4c">Unit I Test</th><th rowspan="2">Half<br/>Yearly<br/>/80</th><th rowspan="2" style="border-right:2px solid #1a2e4c">TOTAL<br/>/100</th>
<th colspan="4">Unit II Test</th><th rowspan="2">Yearly<br/>Exam<br/>/80</th><th rowspan="2" style="border-right:2px solid #1a2e4c">TOTAL<br/>/100</th>
<th rowspan="2" class="gt">GRAND<br/>TOTAL</th><th rowspan="2">Grd.</th></tr>
<tr><th style="border-left:2px solid #1a2e4c">Per<br/>Test<br/>/10</th><th>Note<br/>Book<br/>/5</th><th>SEA<br/>/5</th><th>Total<br/>/20</th>
<th>Per<br/>Test<br/>/10</th><th>Note<br/>Book<br/>/5</th><th>SEA<br/>/5</th><th>Total<br/>/20</th></tr>
</thead>
<tbody>${p.subjectRows}</tbody>
</table>
<div class="bot">
<div class="cosec"><div class="stitle">Co-Scholastic Area</div>
<table class="ct"><thead><tr><th>ACTIVITY</th><th>Half Yearly</th><th>Annual</th></tr></thead><tbody>${p.coRows}</tbody></table></div>
<div class="ressec"><div class="stitle">Result Summary</div><div class="sg">
<div class="si"><span class="sl">Overall Marks</span><span class="sv">${p.grandTotalObt} / ${p.maxGrand}</span></div>
<div class="si"><span class="sl">Overall Percentage</span><span class="sv">${p.overallPct.toFixed(2)}%</span></div>
<div class="si"><span class="sl">Overall Grade</span><span class="sv" style="color:#1a6b2e;font-size:18px">${p.overallGrade}</span></div>
</div></div></div>
<div class="sigs">
<div class="sigb"><div class="sigl"></div><div class="sign">Class Teacher</div></div>
<div class="sigb"><div class="sigl"></div><div class="sign">Principal</div></div>
<div class="sigb"><div class="sigl"></div><div class="sign">Parent / Guardian</div></div>
</div></body></html>`;
}

function buildTermHTML(p: {
    term: string; studentName: string; session: string; subjectRows: string;
    totalObt: number; totalMax: number; pct: number; grade: string;
    unitLabel: string; examLabel: string; cls: string; sec: string;
}) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>${p.term} Report - ${p.studentName}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}body{font-family:Arial,sans-serif;background:#fff;font-size:11px;}
.hdr{text-align:center;border-bottom:2px solid #1a2e4c;padding-bottom:6px;margin-bottom:8px;}
.school{font-size:20px;font-weight:900;color:#1a2e4c;}.title{font-size:12px;color:#555;font-weight:bold;text-transform:uppercase;letter-spacing:1px;margin-top:2px;}
.info{display:flex;gap:20px;flex-wrap:wrap;background:#f0f4f8;padding:8px 12px;border-radius:6px;margin-bottom:10px;}
.ig{display:flex;flex-direction:column;}.il{font-size:8px;color:#888;text-transform:uppercase;font-weight:bold;}.iv{font-size:13px;font-weight:700;color:#1a2e4c;}
table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:10px;}
th,td{border:1px solid #ccc;padding:4px 6px;}thead th{background:#1a2e4c;color:#fff;text-align:center;font-size:9px;}
.sn{text-align:left;padding-left:6px;}.c{text-align:center;}.b{font-weight:bold;}.gr{background:#e8f5e9;color:#1a6b2e;font-weight:bold;}
.sum{display:flex;gap:12px;margin-bottom:14px;}
.sb{flex:1;padding:12px;border:1px solid #e5e7eb;border-radius:8px;}.sl{font-size:8px;font-weight:bold;text-transform:uppercase;color:#888;margin-bottom:4px;}
.sv{font-size:26px;font-weight:900;color:#1a2e4c;}
.sigs{display:flex;gap:20px;justify-content:space-around;padding-top:10px;border-top:1px solid #e5e7eb;margin-top:14px;}
.sigb{text-align:center;flex:1;}.sigl{border-bottom:2px dashed #aaa;margin:0 auto 4px;height:28px;}
.sign{font-size:8px;text-transform:uppercase;letter-spacing:.5px;color:#555;font-weight:bold;}
@page{size:A4 landscape;margin:8mm;}
</style></head><body>
${schoolHeader(p.session, p.term)}
<div class="info">
<div class="ig"><span class="il">Student Name</span><span class="iv">${p.studentName}</span></div>
<div class="ig"><span class="il">Class</span><span class="iv">${p.cls} — ${p.sec}</span></div>
</div>
<table>
<thead>
<tr><th rowspan="2" style="text-align:left;width:140px">Subjects</th>
<th colspan="4">${p.unitLabel} (20 Marks)</th>
<th rowspan="2">${p.examLabel}<br/>/80</th>
<th rowspan="2">TOTAL<br/>/100</th><th rowspan="2">Grade</th></tr>
<tr><th>Per Test<br/>/10</th><th>Note Book<br/>/5</th><th>SEA<br/>/5</th><th>Total<br/>/20</th></tr>
</thead>
<tbody>${p.subjectRows}</tbody>
</table>
<div class="sum">
<div class="sb"><div class="sl">Total Score</div><div class="sv">${p.totalObt} <span style="font-size:14px;color:#9ca3af">/ ${p.totalMax}</span></div></div>
<div class="sb"><div class="sl">Percentage</div><div class="sv">${p.pct.toFixed(1)}%</div></div>
<div class="sb"><div class="sl">Overall Grade</div><div class="sv" style="color:#1a6b2e">${p.grade}</div></div>
</div>
<div class="sigs">
<div class="sigb"><div class="sigl"></div><div class="sign">Class Teacher</div></div>
<div class="sigb"><div class="sigl"></div><div class="sign">Principal</div></div>
<div class="sigb"><div class="sigl"></div><div class="sign">Parent / Guardian</div></div>
</div></body></html>`;
}

function buildUnitIIHTML(p: {
    studentName: string; session: string; subjectRows: string;
    totalObt: number; totalMax: number; pct: number; grade: string;
    cls: string; sec: string;
}) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Unit II Report - ${p.studentName}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}body{font-family:Arial,sans-serif;background:#fff;font-size:10px;}
.hdr{text-align:center;border-bottom:2px solid #1a2e4c;padding-bottom:5px;margin-bottom:6px;}
.school{font-size:18px;font-weight:900;color:#1a2e4c;}.title{font-size:10px;color:#555;font-weight:bold;text-transform:uppercase;letter-spacing:1px;margin-top:2px;}
.info{display:flex;gap:16px;flex-wrap:wrap;background:#f0f4f8;padding:5px 8px;border-radius:4px;margin-bottom:6px;}
.ig{display:flex;flex-direction:column;min-width:100px;}.il{font-size:7px;color:#888;text-transform:uppercase;font-weight:bold;}.iv{font-size:11px;font-weight:700;color:#1a2e4c;}
table{width:100%;border-collapse:collapse;font-size:9px;margin-bottom:8px;}
th,td{border:1px solid #ccc;padding:2px 3px;vertical-align:middle;}
thead th{background:#1a2e4c;color:#fff;text-align:center;font-size:8px;}
.sn{text-align:left;padding-left:5px;font-size:9px;}.c{text-align:center;}.b{font-weight:bold;}
.bdr-l{border-left:2px solid #1a2e4c!important;}.bdr-r{border-right:2px solid #1a2e4c!important;}
.grand{background:#fff8e1;font-weight:bold;}.gr{background:#e8f5e9;color:#1a6b2e;font-weight:bold;}
.sum{display:flex;gap:10px;margin-bottom:12px;}
.sb{flex:1;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;}
.sl{font-size:8px;font-weight:bold;text-transform:uppercase;color:#888;margin-bottom:3px;}
.sv{font-size:24px;font-weight:900;color:#1a2e4c;}
.sigs{display:flex;gap:15px;justify-content:space-around;padding-top:8px;border-top:1px solid #e5e7eb;}
.sigb{text-align:center;flex:1;}.sigl{border-bottom:2px dashed #aaa;margin:0 auto 3px;height:20px;}
.sign{font-size:7.5px;text-transform:uppercase;letter-spacing:.5px;color:#555;font-weight:bold;}
@page{size:A4 landscape;margin:6mm;}
</style></head><body>
<div class="hdr"><div class="school">International Access School</div>
<div class="title">UNIT II CUMULATIVE REPORT — Session ${p.session || new Date().getFullYear()}</div></div>
<div class="info">
<div class="ig"><span class="il">Student Name</span><span class="iv">${p.studentName}</span></div>
<div class="ig"><span class="il">Class</span><span class="iv">${p.cls}</span></div>
<div class="ig"><span class="il">Section</span><span class="iv">${p.sec}</span></div>
<div class="ig"><span class="il">Max Marks</span><span class="iv">${p.totalMax} (120/subject)</span></div>
</div>
<table>
<thead>
<tr>
  <th rowspan="3" style="text-align:left;width:110px">Subjects</th>
  <th colspan="6" style="border-left:2px solid #1a2e4c;border-right:2px solid #1a2e4c">TERM-1 (100 Marks)</th>
  <th colspan="5" style="border-right:2px solid #1a2e4c">UNIT II TEST (20 Marks)</th>
  <th rowspan="3" class="grand">Cumul.<br/>Total<br/>/120</th>
  <th rowspan="3">Grd.</th>
</tr>
<tr>
  <th colspan="4" style="border-left:2px solid #1a2e4c">Unit I Test (20)</th>
  <th rowspan="2">Half<br/>Yearly<br/>/80</th>
  <th rowspan="2" style="border-right:2px solid #1a2e4c">T-1<br/>Total<br/>/100</th>
  <th colspan="4" style="border-left:2px solid #1a2e4c">Unit II Components</th>
  <th rowspan="2" style="border-right:2px solid #1a2e4c">Total<br/>/20</th>
</tr>
<tr>
  <th style="border-left:2px solid #1a2e4c">PT<br/>/10</th><th>NB<br/>/5</th><th>SEA<br/>/5</th><th>/20</th>
  <th style="border-left:2px solid #1a2e4c">PT<br/>/10</th><th>NB<br/>/5</th><th>SEA<br/>/5</th><th>/20</th>
</tr>
</thead>
<tbody>${p.subjectRows}</tbody>
</table>
<div class="sum">
<div class="sb"><div class="sl">Cumulative Total</div><div class="sv">${p.totalObt} <span style="font-size:13px;color:#9ca3af">/ ${p.totalMax}</span></div></div>
<div class="sb"><div class="sl">Percentage</div><div class="sv">${p.pct.toFixed(1)}%</div></div>
<div class="sb"><div class="sl">Overall Grade</div><div class="sv" style="color:#1a6b2e">${p.grade}</div></div>
</div>
<div class="sigs">
<div class="sigb"><div class="sigl"></div><div class="sign">Class Teacher</div></div>
<div class="sigb"><div class="sigl"></div><div class="sign">Exam Controller</div></div>
<div class="sigb"><div class="sigl"></div><div class="sign">Principal</div></div>
<div class="sigb"><div class="sigl"></div><div class="sign">Parent / Guardian</div></div>
</div></body></html>`;
}

function buildUnitTestHTML(p: {
    examName: string; studentName: string; session: string;
    subjectRows: string; totalObt: number; totalMax: number; pct: number; grade: string;
    cls: string; sec: string;
}) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>${p.examName} - ${p.studentName}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}body{font-family:Arial,sans-serif;background:#fff;font-size:10px;}
.info{display:flex;gap:16px;flex-wrap:wrap;background:#f0f4f8;padding:5px 8px;border-radius:4px;margin-bottom:6px;border:1px solid #dde3ea;}
.ig{display:flex;flex-direction:column;min-width:100px;}.il{font-size:7px;color:#888;text-transform:uppercase;font-weight:bold;}.iv{font-size:11px;font-weight:700;color:#1a2e4c;}
table{width:100%;border-collapse:collapse;font-size:9px;margin-bottom:6px;}
th,td{border:1px solid #ccc;padding:2px 4px;vertical-align:middle;}
thead th{background:#1a2e4c;color:#fff;text-align:center;font-size:8px;}
.sn{text-align:left;padding-left:5px;}.c{text-align:center;}.b{font-weight:bold;}.gr{background:#e8f5e9;color:#1a6b2e;font-weight:bold;}
.sum{display:flex;gap:8px;margin-bottom:8px;}
.sb{flex:1;padding:8px;border:1px solid #e5e7eb;border-radius:6px;}
.sl{font-size:7px;font-weight:bold;text-transform:uppercase;color:#888;margin-bottom:3px;}
.sv{font-size:20px;font-weight:900;color:#1a2e4c;}
.sigs{display:flex;gap:15px;justify-content:space-around;padding-top:6px;border-top:1px solid #e5e7eb;margin-top:6px;}
.sigb{text-align:center;flex:1;}.sigl{border-bottom:2px dashed #aaa;margin:0 auto 3px;height:20px;}
.sign{font-size:7.5px;text-transform:uppercase;letter-spacing:.5px;color:#555;font-weight:bold;}
@page{size:A4 landscape;margin:6mm;}
@media print{body{background:#fff;}}
</style></head><body>
${schoolHeader(p.session, p.examName)}
<div class="info">
<div class="ig"><span class="il">Student Name</span><span class="iv">${p.studentName}</span></div>
<div class="ig"><span class="il">Class &amp; Section</span><span class="iv">${p.cls} — ${p.sec}</span></div>
</div>
<table>
<thead><tr>
  <th style="text-align:left;width:140px">Subject</th>
  <th>Per Test /10</th><th>Note Book /5</th><th>SEA /5</th>
  <th>Total /20</th><th>Grade</th>
</tr></thead>
<tbody>${p.subjectRows}</tbody>
</table>
<div class="sum">
<div class="sb"><div class="sl">Total Score</div><div class="sv">${p.totalObt} <span style="font-size:12px;color:#9ca3af">/ ${p.totalMax}</span></div></div>
<div class="sb"><div class="sl">Percentage</div><div class="sv">${p.pct.toFixed(1)}%</div></div>
<div class="sb"><div class="sl">Overall Grade</div><div class="sv" style="color:#1a6b2e;font-size:24px">${p.grade}</div></div>
<div class="sb"><div class="sl">Result</div><div class="sv" style="color:${p.pct >= 33 ? "#155724" : "#dc2626"}">${p.pct >= 33 ? "PASS" : "FAIL"}</div></div>
</div>
<div class="sigs">
<div class="sigb"><div class="sigl"></div><div class="sign">Class Teacher</div></div>
<div class="sigb"><div class="sigl"></div><div class="sign">Exam Controller</div></div>
<div class="sigb"><div class="sigl"></div><div class="sign">Principal</div></div>
<div class="sigb"><div class="sigl"></div><div class="sign">Parent / Guardian</div></div>
</div></body></html>`;
}
