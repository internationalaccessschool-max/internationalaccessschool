"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { AdmitCard } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, Download, School, Search } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function AdminViewAdmitCardsPage() {
    const params = useParams();
    const router = useRouter();
    const examId = params.id as string;

    const [admitCards, setAdmitCards] = useState<AdmitCard[]>([]);
    const [filteredCards, setFilteredCards] = useState<AdmitCard[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [examName, setExamName] = useState("");
    
    // Filters
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedClass, setSelectedClass] = useState("all");
    const [selectedSection, setSelectedSection] = useState("all");
    const [availableClasses, setAvailableClasses] = useState<string[]>([]);
    const [availableSections, setAvailableSections] = useState<string[]>([]);

    useEffect(() => {
        if (!examId) return;

        const fetchCards = async () => {
            try {
                // 1. Fetch Exam details
                const examSnap = await getDoc(doc(db, "exams", examId));
                let classesApplicable: string[] = [];
                if (examSnap.exists()) {
                    setExamName(examSnap.data().name || "Exam");
                    classesApplicable = examSnap.data().classesApplicable || [];
                }

                const allCards: AdmitCard[] = [];

                // 2. Fetch cards from the new path grouped by class
                for (const cls of classesApplicable) {
                    const cardsRef = collection(db, "exams", examId, "classes", cls, "admitCards");
                    const snap = await getDocs(cardsRef);
                    snap.docs.forEach(docSnap => {
                        allCards.push({ id: docSnap.id, ...docSnap.data() } as AdmitCard);
                    });
                }

                // Fallback: If no cards found in the new path, try the old flat path
                if (allCards.length === 0) {
                    const oldPathRef = collection(db, "exams", examId, "admitCards");
                    const snap = await getDocs(oldPathRef);
                    snap.docs.forEach(docSnap => {
                        allCards.push({ id: docSnap.id, ...docSnap.data() } as AdmitCard);
                    });
                }

                // Sort by class then student name
                allCards.sort((a, b) => {
                    if (a.className !== b.className) {
                        return (a.className || "").localeCompare(b.className || "");
                    }
                    if (a.section !== b.section) {
                        return (a.section || "").localeCompare(b.section || "");
                    }
                    return (a.studentName || "").localeCompare(b.studentName || "");
                });

                // Extract unique classes for filter
                const classesSet = new Set(allCards.map(c => c.className).filter(Boolean));
                setAvailableClasses(Array.from(classesSet));

                // Extract unique sections initially
                const sectionsSet = new Set(allCards.map(c => c.section).filter(Boolean));
                setAvailableSections(Array.from(sectionsSet));

                setAdmitCards(allCards);
                setFilteredCards(allCards);
            } catch (err) {
                console.error("Error fetching admit cards:", err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchCards();
    }, [examId]);

    // Apply filters
    useEffect(() => {
        let result = admitCards;
        
        if (selectedClass !== "all") {
            result = result.filter(c => c.className === selectedClass);
        }
        
        // Update valid sections for the current class selection
        const sectionsSet = new Set(result.map(c => c.section).filter(Boolean));
        setAvailableSections(Array.from(sectionsSet));

        if (selectedSection !== "all") {
            result = result.filter(c => c.section === selectedSection);
        }
        
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            result = result.filter(c => 
                (c.studentName || "").toLowerCase().includes(query) ||
                (c.admissionNumber || "").toLowerCase().includes(query)
            );
        }
        
        setFilteredCards(result);
    }, [admitCards, searchQuery, selectedClass, selectedSection]);

    const handlePrint = (card: AdmitCard) => {
        const html = `<!DOCTYPE html><html><head>
<meta charset="UTF-8"/>
<title>Admit Card - ${card.studentName}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:Arial,sans-serif;background:#fff;color:#111;padding:20px;}
.card{max-width:720px;margin:0 auto;border:2px solid #1a2e4c;border-radius:12px;overflow:hidden;}
.hdr{background:#1a2e4c;color:#fff;padding:22px 28px;display:flex;align-items:center;gap:16px;}
.logo{font-size:32px;}
.school{font-size:20px;font-weight:800;}
.sub{font-size:11px;color:#93c5fd;letter-spacing:1px;text-transform:uppercase;margin-top:3px;}
.title-bar{background:#f0f4ff;padding:14px 28px;text-align:center;border-bottom:1px solid #e5e7eb;}
.title-bar h2{font-size:18px;font-weight:700;color:#1a2e4c;text-transform:uppercase;letter-spacing:2px;}
.title-bar p{font-size:12px;color:#6b7280;margin-top:4px;}
.body{padding:24px 28px;}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:20px;}
.field label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;display:block;margin-bottom:4px;}
.field span{font-size:15px;font-weight:700;color:#1a2e4c;}
.exam-info{background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;margin-bottom:20px;}
.exam-info h3{font-size:13px;font-weight:700;color:#1a2e4c;margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px;}
.exam-row{display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px dashed #e5e7eb;}
.exam-row:last-child{border-bottom:none;}
.instructions{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 18px;font-size:12px;color:#78350f;}
.instructions strong{display:block;margin-bottom:6px;font-size:13px;}
.instructions ul{list-style:disc;padding-left:18px;line-height:1.7;}
.footer{border-top:1px solid #e5e7eb;margin-top:20px;padding-top:16px;display:grid;grid-template-columns:repeat(3,1fr);text-align:center;gap:16px;}
.sig-line{border-bottom:2px dashed #d1d5db;margin:0 auto 8px;width:75%;height:36px;}
.sig-name{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;}
.timetable{width:100%;border-collapse:collapse;margin:15px 0 20px;}
.timetable th{background:#f0f4ff;color:#1a2e4c;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;padding:8px;text-align:left;border:1px solid #e5e7eb;}
.timetable td{padding:8px;font-size:12px;border:1px solid #e5e7eb;color:#374151;}
.timetable tr:nth-child(even){background:#f8fafc;}
@page{size:A4 portrait;margin:8mm;}
</style></head><body>
<div class="card">
  <div class="hdr"><div class="logo">🏫</div>
  <div><div class="school">International Access School</div>
  <div class="sub">ADMIT CARD</div></div></div>
  <div class="title-bar">
    <h2>${card.examName}</h2>
    <p>Examination Period: ${card.startDate} — ${card.endDate}</p>
  </div>
  <div class="body">
    <div class="grid">
      <div class="field"><label>Student Name</label><span>${card.studentName}</span></div>
      <div class="field"><label>Admission No (ENR)</label><span>${card.admissionNumber || "-"}</span></div>
      <div class="field"><label>Class</label><span>${card.className} – ${card.section || "-"}</span></div>
      <div class="field"><label>Date of Birth</label><span>${card.dob || "-"}</span></div>
      <div class="field"><label>Father's Name</label><span>${card.fatherName || "-"}</span></div>
      <div class="field"><label>Academic Year</label><span>${new Date().getFullYear()}-${new Date().getFullYear() + 1}</span></div>
    </div>
    <div class="exam-info">
      <h3>Examination Details</h3>
      <div class="exam-row"><span>Exam Name</span><span><strong>${card.examName}</strong></span></div>
      <div class="exam-row"><span>Start Date</span><span>${card.startDate}</span></div>
      <div class="exam-row"><span>End Date</span><span>${card.endDate}</span></div>
      ${card.timing ? `<div class="exam-row"><span>Timing</span><span>${card.timing}</span></div>` : ''}
    </div>
    ${card.timetable && card.timetable.length > 0 ? `
    <table class="timetable">
      <thead>
        <tr>
          <th>Subject</th>
          <th>Exam Date</th>
          <th>Time</th>
          <th>Room</th>
        </tr>
      </thead>
      <tbody>
        ${card.timetable.map(t => `
        <tr>
          <td><strong>${t.subject}</strong></td>
          <td>${t.date || '-'}</td>
          <td>${t.startTime || '-'} ${t.endTime ? 'to ' + t.endTime : ''}</td>
          <td>${t.roomNo || '-'}</td>
        </tr>
        `).join('')}
      </tbody>
    </table>
    ` : ''}
    <div class="instructions">
      <strong>📋 Important Instructions:</strong>
      ${card.instructions 
        ? `<div style="white-space: pre-wrap; font-size: 11px;">${card.instructions}</div>` 
        : `<ul>
            <li>This admit card must be presented at the examination hall.</li>
            <li>Candidates should be seated 15 minutes before the exam starts.</li>
            <li>Mobile phones and electronic gadgets are strictly prohibited.</li>
            <li>This admit card is not transferable.</li>
            <li>In case of any discrepancy, report to the school office immediately.</li>
           </ul>`
      }
    </div>
    <div class="footer">
      <div><div class="sig-line"></div><div class="sig-name">Candidate Signature</div></div>
      <div><div class="sig-line"></div><div class="sig-name">Class Teacher</div></div>
      <div><div class="sig-line"></div><div class="sig-name">Principal</div></div>
    </div>
  </div>
</div></body></html>`;

        const pw = window.open("", "_blank", "width=820,height=750");
        if (!pw) { alert("Please allow popups to print admit card"); return; }
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

    return (
        <div className="p-6 space-y-6 max-w-7xl mx-auto">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => router.back()}>
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold">Generated Admit Cards</h1>
                    <p className="text-muted-foreground text-sm">
                        Viewing admit cards for <b>{examName}</b>
                    </p>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4 bg-muted/20 p-4 rounded-lg border">
                <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search student or admission no..."
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
                <p>Showing {filteredCards.length} {filteredCards.length === 1 ? 'card' : 'cards'}</p>
            </div>

            {admitCards.length === 0 ? (
                <Card className="border-dashed bg-muted/10">
                    <CardContent className="flex flex-col items-center justify-center py-20 text-center">
                        <School className="h-12 w-12 text-muted-foreground/30 mb-4" />
                        <h2 className="text-xl font-semibold mb-2">No admit cards found</h2>
                        <p className="text-muted-foreground max-w-sm">
                            Admit cards have not been generated for this exam yet. Go back and generate them first.
                        </p>
                    </CardContent>
                </Card>
            ) : filteredCards.length === 0 ? (
                <div className="py-20 text-center text-muted-foreground">
                    No matching cards found for your search.
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredCards.map(card => (
                        <Card key={card.id} className="overflow-hidden flex flex-col hover:border-primary/50 transition-colors">
                            <div className="h-1 bg-gradient-to-r from-blue-600 to-indigo-600" />
                            <CardContent className="p-5 flex flex-col flex-1">
                                <div className="flex justify-between items-start mb-3">
                                    <Badge variant="outline" className="bg-slate-50 text-slate-700">
                                        Class {card.className} {card.section ? `- ${card.section}` : ''}
                                    </Badge>
                                </div>
                                <h3 className="font-bold text-base truncate mb-1" title={card.studentName}>
                                    {card.studentName}
                                </h3>
                                <p className="text-xs text-muted-foreground mb-4">
                                    Adm No: {card.admissionNumber || "N/A"}
                                </p>
                                
                                <div className="mt-auto pt-4 border-t">
                                    <Button
                                        variant="default"
                                        size="sm"
                                        className="w-full bg-slate-900 hover:bg-slate-800"
                                        onClick={() => handlePrint(card)}
                                    >
                                        <Download className="mr-2 h-4 w-4" />
                                        Print Card
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
