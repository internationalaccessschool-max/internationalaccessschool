"use client";

import { useState, useEffect, use } from "react";
import { collection, getDocs, doc, getDoc, collectionGroup, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Result, Subject } from "@/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Loader2, Search, Printer, FileText, LayoutTemplate, Ticket } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

type AdminResultView = Result & {
    id: string;
    studentName: string;
    admissionNumber: string;
};

// Store exam metadata including examType
let cachedExamType: string | null = null;

export default function AdminViewResultsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id: examId } = use(params);

    const [isLoading, setIsLoading] = useState(true);
    const [examName, setExamName] = useState("");
    const [examStartDate, setExamStartDate] = useState("");
    const [examEndDate, setExamEndDate] = useState("");
    const [examType, setExamType] = useState<string>("Standard");

    const [allResults, setAllResults] = useState<AdminResultView[]>([]);
    const [filteredResults, setFilteredResults] = useState<AdminResultView[]>([]);
    const [subjectsMap, setSubjectsMap] = useState<Record<string, Subject>>({});

    // Filters
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedClass, setSelectedClass] = useState("all");
    const [selectedSection, setSelectedSection] = useState("all");
    const [availableClasses, setAvailableClasses] = useState<string[]>([]);
    const [availableSections, setAvailableSections] = useState<string[]>([]);

    useEffect(() => {
        if (!examId) return;

        const fetchData = async () => {
            try {
                // 1. Fetch Exam details
                const examSnap = await getDoc(doc(db, "exams", examId));
                let classesApplicable: string[] = [];
                if (examSnap.exists()) {
                    setExamName(examSnap.data().name || "Exam");
                    setExamStartDate(examSnap.data().startDate || "");
                    setExamEndDate(examSnap.data().endDate || "");
                    setExamType(examSnap.data().examType || "Standard");
                    classesApplicable = examSnap.data().classesApplicable || [];
                }

                // 2. Fetch all subjects across classes for the print template
                const classSubjectsSnap = await getDocs(collection(db, "classSubjects"));
                const globalSubjectsMap: Record<string, Subject> = {};
                classSubjectsSnap.docs.forEach(d => {
                    const subs = d.data().subjects || [];
                    subs.forEach((s: Subject) => {
                        if (s.id) globalSubjectsMap[s.id] = s;
                    });
                });
                
                // Fallback subjects from global
                const subjectsSnap = await getDocs(collection(db, "subjects"));
                subjectsSnap.docs.forEach(d => {
                    globalSubjectsMap[d.id] = { id: d.id, ...d.data() } as Subject;
                });
                setSubjectsMap(globalSubjectsMap);

                // 3. Fetch sections per class from classSubjects (already loaded above)
                const classSectionsMap: Record<string, string[]> = {};
                const classSubSnap = await getDocs(collection(db, "classes"));
                classSubSnap.docs.forEach(d => {
                    const data = d.data();
                    const cls = data.name || d.id;
                    const sections: string[] = data.sections || ["A"];
                    classSectionsMap[cls] = sections;
                });

                // 4. Fetch ALL results in parallel (no sequential loop)
                const seenStudentIds = new Set<string>();
                const rawResults: { studentId: string; data: Result }[] = [];

                await Promise.all(classesApplicable.map(async cls => {
                    const sections = classSectionsMap[cls] || ["A", "B", "C"];
                    await Promise.all(sections.map(async sec => {
                        try {
                            const snap = await getDocs(
                                collection(db, "results", examId, "classes", cls, "sections", sec, "students")
                            );
                            snap.docs.forEach(docSnap => {
                                if (!seenStudentIds.has(docSnap.id)) {
                                    seenStudentIds.add(docSnap.id);
                                    rawResults.push({ studentId: docSnap.id, data: docSnap.data() as Result });
                                }
                            });
                        } catch { /* section may not exist */ }
                    }));
                }));

                // 5. Fetch ONLY the student profiles we actually need (not all 528+)
                const profilesMap: Record<string, any> = {};
                await Promise.all(Array.from(seenStudentIds).map(async id => {
                    try {
                        const snap = await getDoc(doc(db, "studentLookup", id));
                        if (snap.exists()) profilesMap[id] = snap.data();
                    } catch { /* skip */ }
                }));

                const loadedResults: AdminResultView[] = rawResults.map(({ studentId, data }) => {
                    const profile = profilesMap[studentId] || {};
                    const firstName = profile.firstName || (data as any).studentName || "";
                    const lastName = profile.lastName || "";
                    return {
                        id: studentId,
                        studentName: firstName ? `${firstName} ${lastName}`.trim() : "Unknown Student",
                        admissionNumber: profile.admissionNumber || profile.admNo || "N/A",
                        ...data,
                    };
                });

                // Sort by class, section, name
                loadedResults.sort((a, b) => {
                    if (a.classId !== b.classId) return (a.classId || "").localeCompare(b.classId || "");
                    if (a.sectionId !== b.sectionId) return (a.sectionId || "").localeCompare(b.sectionId || "");
                    return (a.studentName || "").localeCompare(b.studentName || "");
                });

                // Extract unique classes
                const classesSet = new Set(loadedResults.map(r => r.classId).filter(Boolean));
                setAvailableClasses(Array.from(classesSet));

                const sectionsSet = new Set(loadedResults.map(r => r.sectionId).filter(Boolean));
                setAvailableSections(Array.from(sectionsSet));

                setAllResults(loadedResults);
                setFilteredResults(loadedResults);
            } catch (err) {
                console.error("Error fetching results:", err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [examId]);

    // Apply filters
    useEffect(() => {
        let result = allResults;
        
        if (selectedClass !== "all") {
            result = result.filter(r => r.classId === selectedClass);
        }
        
        // Update valid sections for the current class selection
        const sectionsSet = new Set(result.map(r => r.sectionId).filter(Boolean));
        setAvailableSections(Array.from(sectionsSet));

        if (selectedSection !== "all") {
            result = result.filter(r => r.sectionId === selectedSection);
        }
        
        if (searchQuery.trim()) {
            const queryLowercase = searchQuery.toLowerCase();
            result = result.filter(r => 
                (r.studentName || "").toLowerCase().includes(queryLowercase) ||
                (r.admissionNumber || "").toLowerCase().includes(queryLowercase)
            );
        }
        
        setFilteredResults(result);
    }, [allResults, searchQuery, selectedClass, selectedSection]);

    const handlePrint = async (res: AdminResultView) => {
        const markEntries = Object.values(res.marks || {});
        const eName = res.examName || examName || "Report Card";
        const session = (res as any).session || "";

        // Fetch logo as base64
        let logoSrc = "/LOGO.png";
        try {
            const r = await fetch(window.location.origin + "/LOGO.png");
            const blob = await r.blob();
            logoSrc = await new Promise(resolve => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
            });
        } catch { /* use URL fallback */ }

        const rows = markEntries.map((m, i) => {
            const subName = subjectsMap[m.subjectId]?.name || "Subject";
            const obtained = m.obtained !== null ? String(m.obtained) : "AB";
            const color = m.obtained !== null ? "#1a2e4c" : "#dc2626";
            return `<tr style="border-bottom:1px solid #bbb;">
                <td style="padding:3px 5px;font-size:8.5px;">${subName}</td>
                <td style="padding:3px 5px;text-align:center;font-size:8.5px;border-left:1px solid #bbb;">${m.total}</td>
                <td style="padding:3px 5px;text-align:center;font-size:8.5px;font-weight:700;color:${color};border-left:1px solid #bbb;">${obtained}</td>
            </tr>`;
        }).join("");

        const pct = typeof res.percentage === "number" ? res.percentage.toFixed(1) : res.percentage;

        const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<title>Report Card — ${res.studentName}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:Arial,Helvetica,sans-serif;background:#fff;font-size:10px;}
.page{width:277mm;min-height:190mm;padding:5mm 6mm;background:#fff;}
.report-header{display:flex;align-items:center;gap:8px;border-bottom:3px double #1a2e4c;padding-bottom:5px;margin-bottom:5px;}
.school-logo-img{width:46px;height:46px;object-fit:contain;flex-shrink:0;}
.header-text{flex:1;text-align:center;line-height:1.3;}
.school-name{font-size:16px;font-weight:900;color:#1a2e4c;letter-spacing:1px;text-transform:uppercase;}
.school-sub{font-size:7px;color:#444;margin-top:1px;}
.header-right{text-align:right;min-width:110px;flex-shrink:0;}
.report-card-label{font-size:12px;font-weight:900;color:#1a2e4c;border:2px solid #1a2e4c;padding:1px 6px;display:inline-block;letter-spacing:1px;}
.session-label{font-size:7.5px;color:#555;font-weight:bold;margin-top:2px;}
.exam-label{font-size:8px;color:#1a2e4c;font-weight:800;margin-top:1px;text-transform:uppercase;}
.student-info{display:flex;flex-wrap:wrap;gap:2px 10px;background:#f0f4f8;padding:4px 8px;border-radius:4px;margin-bottom:6px;border:1px solid #dde3ea;}
.info-group{display:flex;flex-direction:column;min-width:100px;}
.info-lbl{font-size:7px;color:#888;text-transform:uppercase;font-weight:bold;letter-spacing:.5px;}
.info-val{font-size:10px;font-weight:700;color:#1a2e4c;}
.marks-table{width:100%;border-collapse:collapse;border:1px solid #bbb;font-size:8.5px;margin-bottom:6px;}
.marks-table th{background:#1a2e4c;color:#fff;padding:4px 5px;text-align:center;font-size:8px;border:1px solid #1a2e4c;}
.marks-table th:first-child{text-align:left;min-width:80px;}
.bottom-section{display:flex;gap:8px;margin-bottom:6px;}
.summary-box{flex:1;border:1px solid #dde3ea;border-radius:4px;padding:6px 10px;}
.s-lbl{font-size:7px;color:#888;text-transform:uppercase;font-weight:bold;letter-spacing:.5px;display:block;}
.s-val{font-size:18px;font-weight:900;color:#1a2e4c;display:block;}
.grade-val{font-size:22px;font-weight:900;color:#155724;}
.signatures{display:flex;gap:10px;justify-content:space-around;padding-top:5px;border-top:1px solid #dde3ea;margin-top:4px;}
.sig-box{text-align:center;flex:1;}
.sig-line{border-bottom:1.5px dashed #aaa;margin:0 auto 3px;height:18px;}
.sig-name{font-size:7.5px;text-transform:uppercase;letter-spacing:.5px;color:#555;font-weight:bold;}
@page{size:A4 landscape;margin:6mm;}
@media print{body{background:#fff;}.page{width:100%;margin:0;}}
</style></head><body>
<div class="page">
  <div class="report-header">
    <img src="${logoSrc}" class="school-logo-img" alt="IAS Logo"/>
    <div class="header-text">
      <div class="school-name">INTERNATIONAL ACCESS SCHOOL</div>
      <div class="school-sub">Affiliated to CBSE(10+2) New Delhi &nbsp;|&nbsp; Aff. No: 330691 &nbsp;|&nbsp; School Code: 65688</div>
      <div class="school-sub">Siwan, Bihar – 841227 &nbsp;|&nbsp; Ph: +91 93477 76670, 84060 00830/33/40</div>
      <div class="school-sub">Email: info@iaschool.edu.in &nbsp;|&nbsp; www.iaschool.edu.in</div>
    </div>
    <div class="header-right">
      <div class="report-card-label">Report Card</div>
      <div class="session-label">Academic Session: ${session || new Date().getFullYear()}</div>
      <div class="exam-label">${eName.toUpperCase()}</div>
    </div>
  </div>
  <div class="student-info">
    <div class="info-group"><span class="info-lbl">Student Name</span><span class="info-val">${res.studentName}</span></div>
    <div class="info-group"><span class="info-lbl">Adm. No.</span><span class="info-val">${res.admissionNumber}</span></div>
    <div class="info-group"><span class="info-lbl">Class &amp; Sec</span><span class="info-val">${res.classId} — ${res.sectionId}</span></div>
    <div class="info-group"><span class="info-lbl">Exam</span><span class="info-val">${eName}</span></div>
  </div>
  <table class="marks-table">
    <thead><tr>
      <th style="text-align:left">Subject</th>
      <th>Max Marks</th>
      <th>Marks Obtained</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="bottom-section">
    <div class="summary-box"><span class="s-lbl">Total Score</span><span class="s-val">${res.totalObtained} <span style="font-size:11px;color:#9ca3af">/ ${res.totalMax}</span></span></div>
    <div class="summary-box"><span class="s-lbl">Percentage</span><span class="s-val">${pct}%</span></div>
    <div class="summary-box"><span class="s-lbl">Overall Grade</span><span class="grade-val">${res.overallGrade}</span></div>
    <div class="summary-box"><span class="s-lbl">Result</span><span class="s-val" style="color:${Number(pct) >= 33 ? "#155724" : "#dc2626"}">${Number(pct) >= 33 ? "PASS" : "FAIL"}</span></div>
  </div>
  <div class="signatures">
    <div class="sig-box"><div class="sig-line"></div><div class="sig-name">Class Teacher</div></div>
    <div class="sig-box"><div class="sig-line"></div><div class="sig-name">Exam Controller</div></div>
    <div class="sig-box"><div class="sig-line"></div><div class="sig-name">Principal</div></div>
    <div class="sig-box"><div class="sig-line"></div><div class="sig-name">Parent / Guardian</div></div>
  </div>
</div></body></html>`;

        const pw = window.open("", "_blank", "width=1100,height=750");
        if (!pw) { alert("Please allow popups to print."); return; }
        pw.document.write(html);
        pw.document.close();
        pw.focus();
        setTimeout(() => pw.print(), 800);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <Link href="/admin/exams">
                        <Button variant="ghost" size="icon" className="h-8 w-8">&larr;</Button>
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">View Generated Results</h1>
                        <p className="text-muted-foreground">
                            {examName} — View and print generated report cards
                            {examType && examType !== "Standard" && (
                                <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{examType}</span>
                            )}
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Link href={`/admin/exams/${examId}/admit-cards`}>
                        <Button variant="outline" className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50">
                            <Ticket className="h-4 w-4" />
                            Admit Cards
                        </Button>
                    </Link>
                    <Link href={`/admin/exams/${examId}/results/landscape`}>
                        <Button variant="outline" className="gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                            <LayoutTemplate className="h-4 w-4" />
                            Landscape Report Cards
                        </Button>
                    </Link>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 items-center bg-muted/20 p-4 rounded-xl border">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search student name or admission number..."
                        className="pl-9 bg-background"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                {availableClasses.length > 0 && (
                    <Select value={selectedClass} onValueChange={(val) => {
                        setSelectedClass(val);
                        setSelectedSection("all"); // Reset section when class changes
                    }}>
                        <SelectTrigger className="w-full sm:w-[150px] bg-background">
                            <SelectValue placeholder="Filter by class" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Classes</SelectItem>
                            {availableClasses.map(cls => (
                                <SelectItem key={cls} value={cls}>Class {cls}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
                
                {availableSections.length > 0 && (
                    <Select value={selectedSection} onValueChange={setSelectedSection}>
                        <SelectTrigger className="w-full sm:w-[150px] bg-background">
                            <SelectValue placeholder="Filter by section" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Sections</SelectItem>
                            {availableSections.map(sec => (
                                <SelectItem key={sec} value={sec}>{sec}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
            </div>

            <div className="flex justify-between items-center text-sm text-muted-foreground px-1">
                <span>Total results generated: <strong className="text-foreground">{allResults.length}</strong></span>
                <span>Showing: <strong className="text-foreground">{filteredResults.length}</strong></span>
            </div>

            {filteredResults.length === 0 ? (
                <div className="py-20 text-center text-muted-foreground border rounded-xl bg-muted/10">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-20" />
                    <p>No results found for the selected filters.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredResults.map(res => (
                        <div key={res.id} className="border rounded-xl p-4 flex flex-col gap-4 bg-card hover:shadow-md transition-shadow">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="font-semibold text-lg line-clamp-1">{res.studentName}</h3>
                                    <p className="text-sm text-muted-foreground">Adm No: {res.admissionNumber}</p>
                                </div>
                                <Badge variant="outline" className="bg-muted">Class {res.classId}-{res.sectionId}</Badge>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2 text-sm pt-2 border-t border-dashed">
                                {(res as any).absent === true ? (
                                    <div className="col-span-2 flex items-center justify-center py-1">
                                        <span className="px-3 py-1 rounded-full bg-red-100 text-red-700 font-bold text-sm">ABSENT</span>
                                    </div>
                                ) : (
                                    <>
                                        <div>
                                            <span className="text-muted-foreground block text-xs">Total Score</span>
                                            <span className="font-medium text-blue-600">{res.totalObtained} / {res.totalMax}</span>
                                        </div>
                                        <div>
                                            <span className="text-muted-foreground block text-xs">Percentage</span>
                                            <span className="font-medium">{res.percentage}%</span>
                                        </div>
                                        <div>
                                            <span className="text-muted-foreground block text-xs">Grade</span>
                                            <span className="font-bold whitespace-nowrap">{res.overallGrade}</span>
                                        </div>
                                    </>
                                )}
                            </div>
                            
                            <Button variant="outline" className="w-full gap-2 mt-2" onClick={() => handlePrint(res)}>
                                <Printer className="h-4 w-4 text-emerald-600" />
                                <span>Print Result</span>
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
