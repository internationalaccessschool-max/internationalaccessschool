"use client";

import { useState, useEffect } from "react";
import { collection, collectionGroup, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Download, FileCheck, School } from "lucide-react";

interface AdmitCard {
    id: string;
    examId: string;
    examName: string;
    startDate: string;
    endDate: string;
    admissionNumber: string;
    studentName: string;
    className: string;
    section: string;
    dob: string;
    fatherName: string;
    timing?: string;
    instructions?: string;
    timetable?: { subject: string; date: string; startTime: string; endTime: string; roomNo: string; }[];
    generatedAt: number;
}

export default function StudentAdmitCardPage() {
    const { user } = useAuth();
    const [admitCards, setAdmitCards] = useState<AdmitCard[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!user) return;
        const fetchCards = async () => {
            try {
                const q = query(
                    collectionGroup(db, "admitCards"),
                    where("studentId", "==", user.uid)
                );
                const snap = await getDocs(q);
                const cards = snap.docs.map(d => ({ id: d.id, ...d.data() }) as AdmitCard);
                cards.sort((a, b) => (b.generatedAt || 0) - (a.generatedAt || 0));
                setAdmitCards(cards);
            } catch (err) {
                console.error("Error fetching admit cards:", err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchCards();
    }, [user]);

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

    if (admitCards.length === 0) {
        return (
            <div className="p-6">
                <Card className="border-dashed bg-muted/10">
                    <CardContent className="flex flex-col items-center justify-center py-24 text-center">
                        <FileCheck className="h-16 w-16 text-muted-foreground/30 mb-4" />
                        <h2 className="text-2xl font-bold tracking-tight">No Admit Cards Available</h2>
                        <p className="text-muted-foreground mt-2 max-w-sm">
                            Your admit cards will appear here once they are generated by the school administration.
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                    <FileCheck className="h-6 w-6 text-primary" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold">My Admit Cards</h1>
                    <p className="text-muted-foreground text-sm">Download and print your examination admit cards</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {admitCards.map(card => (
                    <Card key={card.id} className="overflow-hidden hover:shadow-md transition-all">
                        <div className="h-2 bg-gradient-to-r from-[#1a2e4c] to-[#d4af37]" />
                        <CardContent className="p-6">
                            <div className="flex items-start justify-between gap-4 mb-4">
                                <div className="p-2.5 bg-blue-50 text-blue-700 rounded-xl">
                                    <School className="h-6 w-6" />
                                </div>
                                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                    Available
                                </Badge>
                            </div>
                            <h3 className="text-lg font-bold text-foreground mb-1">{card.examName}</h3>
                            <p className="text-sm text-muted-foreground mb-1">
                                {card.startDate} — {card.endDate}
                            </p>
                            {card.timing && (
                                <p className="text-xs font-medium text-amber-600 mb-4 bg-amber-50 inline-block px-2 py-1 rounded w-fit">
                                    ⏱ {card.timing}
                                </p>
                            )}
                            <div className="grid grid-cols-2 gap-3 text-sm mb-5 mt-3">
                                <div>
                                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Class</span>
                                    <p className="font-semibold">{card.className} – {card.section || "—"}</p>
                                </div>
                                <div>
                                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Adm. No</span>
                                    <p className="font-semibold">{card.admissionNumber || "—"}</p>
                                </div>
                            </div>
                            <Button
                                className="w-full bg-[#1a2e4c] hover:bg-[#1a2e4c]/90 text-white"
                                onClick={() => handlePrint(card)}
                            >
                                <Download className="mr-2 h-4 w-4" />
                                Print / Download Admit Card
                            </Button>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
