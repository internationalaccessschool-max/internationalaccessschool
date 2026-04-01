"use client";

import { useState, useEffect, use } from "react";
import { collection, query, where, getDocs, doc, getDoc, collectionGroup } from "firebase/firestore";
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

                // 3. Fetch all profiles to map students and find sections
                const profilesSnap = await getDocs(collectionGroup(db, "profiles"));
                const profilesMap: Record<string, any> = {};
                const classSectionsMap: Record<string, Set<string>> = {};

                profilesSnap.docs.forEach(d => {
                    const data = d.data();
                    profilesMap[d.id] = data;
                    if (data.className && data.section) {
                        if (!classSectionsMap[data.className]) {
                            classSectionsMap[data.className] = new Set();
                        }
                        classSectionsMap[data.className].add(data.section);
                    }
                });

                const loadedResults: AdminResultView[] = [];
                const seenStudentIds = new Set<string>();

                // 4. Fetch results from the new nested path
                for (const cls of classesApplicable) {
                    const sections = classSectionsMap[cls] ? Array.from(classSectionsMap[cls]) : [];
                    for (const sec of sections) {
                        const resultsRef = collection(db, "results", examId, "classes", cls, "sections", sec, "students");
                        const snap = await getDocs(resultsRef);
                        snap.docs.forEach(docSnap => {
                            const data = docSnap.data() as Result;
                            const studentId = docSnap.id;
                            if (!seenStudentIds.has(studentId)) {
                                const profile = profilesMap[studentId] || {};
                                loadedResults.push({
                                    id: docSnap.id,
                                    studentName: profile.firstName ? `${profile.firstName} ${profile.lastName || ""}`.trim() : "Unknown Student",
                                    admissionNumber: profile.admissionNumber || "N/A",
                                    ...data
                                });
                                seenStudentIds.add(studentId);
                            }
                        });
                    }
                }

                // 5. Fallback: Check old flat collection
                try {
                    // This query might need an index if not present, but we catch errors
                    const oldResultsSnap = await getDocs(query(collection(db, "results"), where("examId", "==", examId)));
                    oldResultsSnap.forEach(docSnap => {
                        const data = docSnap.data() as Result;
                        if (data.studentId && !seenStudentIds.has(data.studentId)) {
                            const profile = profilesMap[data.studentId] || {};
                            loadedResults.push({
                                id: docSnap.id,
                                studentName: profile.firstName ? `${profile.firstName} ${profile.lastName || ""}`.trim() : "Unknown Student",
                                admissionNumber: profile.admissionNumber || "N/A",
                                ...data
                            });
                            seenStudentIds.add(data.studentId);
                        }
                    });
                } catch (e) {
                    console.log("Old flat results query failed, skipping (might be missing index)", e);
                }

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

    const handlePrint = (res: AdminResultView) => {
        const markEntries = Object.values(res.marks || {});
        
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

        const eName = res.examName || examName || "Report Card";
        const eStart = res.examStartDate || examStartDate || "";
        const eEnd = res.examEndDate || examEndDate || "";
        const periodStr = eStart ? `${eStart} - ${eEnd}` : "N/A";

        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>Report Card - ${res.studentName}</title>
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
<div class="exam">${eName}</div></div></div>
<div class="info">
<div><label>Student Name</label><span>${res.studentName}</span></div>
<div><label>Class</label><span>${res.classId} – ${res.sectionId}</span></div>
<div><label>Period</label><span>${periodStr}</span></div>
<div><label>Year</label><span>${new Date().getFullYear()}</span></div>
</div>
<div class="tbl"><table>
<thead><tr><th>Subject</th><th style="text-align:right">Max Marks</th><th style="text-align:right">Obtained</th></tr></thead>
<tbody>${rows}</tbody>
</table></div>
<div class="sum">
<div class="sb"><div class="sl">Total Score</div><div class="sv">${res.totalObtained}<span style="font-size:16px;color:#9ca3af"> / ${res.totalMax}</span></div></div>
<div class="sb"><div class="sl">Percentage</div><div class="sv">${res.percentage}%</div></div>
<div class="sb"><div class="sl">Overall Grade</div><div class="sv">${res.overallGrade}</div></div>
</div>
<div class="sigs">
<div><div class="sline"></div><div class="sname">Class Teacher</div></div>
<div><div class="sline"></div><div class="sname">Principal</div></div>
<div><div class="sline"></div><div class="sname">Parent / Guardian</div></div>
</div></body></html>`;

        const iframe = document.createElement("iframe");
        iframe.style.display = "none";
        document.body.appendChild(iframe);
        iframe.contentDocument?.write(html);
        iframe.contentDocument?.close();
        setTimeout(() => {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            setTimeout(() => {
                document.body.removeChild(iframe);
            }, 1000);
        }, 500);
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
                                <SelectItem key={sec} value={sec}>Section {sec}</SelectItem>
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
