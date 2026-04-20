"use client";

import { useState, useEffect, useCallback } from "react";
import {
    doc, getDoc, getDocs, collection, collectionGroup, query, where
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
    X, Printer, Loader2, User, CreditCard, FileText, Image as ImageIcon,
    Phone, Mail, MapPin, BookOpen, Calendar, GraduationCap, RefreshCw,
    ChevronRight, Award, AlertCircle
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Student {
    id: string;
    firstName?: string;
    middleName?: string;
    lastName?: string;
    admissionNumber?: string;
    currentClass?: string | number;
    section?: string;
    fatherName?: string;
    motherName?: string;
    guardianName?: string;
    mobileNo?: string;
    contact2?: string;
    email?: string;
    notificationEmail?: string;
    dob?: string;
    gender?: string;
    address?: string;
    pinCode?: string;
    religion?: string;
    category?: string;
    bloodGroup?: string;
    transport?: string;
    dateOfAdmission?: string;
    session?: string;
    childPhotoUrl?: string;
    aadharNo?: string;
    pen?: string;
    aparId?: string;
    cbseEnrolmentNo?: string;
    previousSchool?: string;
    udise?: string;
    rollNo?: string;
    rollNumber?: string;
    house?: string;
    fatherOccupation?: string;
    annualIncome?: string;
    motherQualification?: string;
    fatherQualification?: string;
    economicallyWeakSection?: string;
    freeScheme?: string;
    [key: string]: any;
}

interface FeeRecord {
    month: number;
    status: string;
    amount: number;
    totalAmount: number;
    receiptNo: string | null;
    paidOn: Date | null;
    paymentMode: string;
    previousDues: number;
}

interface ExamResult {
    examName: string;
    examId: string;
    session: string;
    examType: string;
    classId: string;
    sectionId: string;
    totalObtained: number;
    totalMax: number;
    percentage: number;
    overallGrade: string;
    marks: Record<string, { subjectId: string; obtained: number | null; total: number }>;
}

interface Document {
    name: string;
    url: string;
    type: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const safeStr = (v: any): string => {
    if (v == null) return "";
    if (typeof v === "string") return v;
    if (typeof v === "number") return String(v);
    return String(v);
};

const getDisplayName = (s: Student) =>
    `${safeStr(s.firstName)} ${safeStr(s.middleName || "")} ${safeStr(s.lastName)}`.replace(/\s+/g, " ").trim() || "Student";

const getClass = (s: Student): string => {
    const cls = s.currentClass;
    if (cls === 0 || cls === "0") return "NUR";
    const raw = safeStr(cls).trim();
    if (!raw) return "—";
    const upper = raw.toUpperCase();
    if (upper === "LKG" || upper === "UKG" || upper === "NUR") return upper;
    return raw;
};

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const fmtDate = (d: Date | null | string | undefined): string => {
    if (!d) return "—";
    if (typeof d === "string") {
        if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
            const [y, m, day] = d.split("-");
            return `${day} ${MONTHS_SHORT[parseInt(m) - 1]} ${y}`;
        }
        return d;
    }
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

const toDate = (ts: any): Date | null => {
    if (!ts) return null;
    if (ts.toDate) return ts.toDate();
    if (ts instanceof Date) return ts;
    return null;
};

const CURRENT_YEAR = new Date().getFullYear();

// ─── Tab type ──────────────────────────────────────────────────────────────────

type TabKey = "profile" | "fees" | "results" | "documents";

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: "profile", label: "Profile", icon: User },
    { key: "fees", label: "Fees", icon: CreditCard },
    { key: "results", label: "Results", icon: GraduationCap },
    { key: "documents", label: "Documents", icon: FileText },
];

// ─── Props ─────────────────────────────────────────────────────────────────────

interface Props {
    student: Student;
    onClose: () => void;
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function StudentProfileModal({ student, onClose }: Props) {
    const [activeTab, setActiveTab] = useState<TabKey>("profile");
    const [feeYear, setFeeYear] = useState(CURRENT_YEAR);
    const YEAR_OPTIONS = Array.from({ length: CURRENT_YEAR - 2023 }, (_, i) => 2024 + i).concat([CURRENT_YEAR + 1]);

    // ── Fee records
    const [feeRecords, setFeeRecords] = useState<FeeRecord[]>([]);
    const [feeLoading, setFeeLoading] = useState(false);
    const [feeFetched, setFeeFetched] = useState(false);

    // ── Exam results
    const [examResults, setExamResults] = useState<ExamResult[]>([]);
    const [resultsLoading, setResultsLoading] = useState(false);
    const [resultsFetched, setResultsFetched] = useState(false);

    // ── Subjects map
    const [subjectsMap, setSubjectsMap] = useState<Record<string, string>>({});

    // ── Documents (from student profile fields)
    const docFields: Document[] = [
        { name: "Child Photo", url: student.childPhotoUrl || "", type: "image" },
        { name: "Transfer Certificate", url: student.tcUrl || "", type: "pdf" },
        { name: "Aadhar Card", url: student.aadharUrl || "", type: "image" },
        { name: "Birth Certificate", url: student.birthCertUrl || "", type: "pdf" },
        { name: "Previous School TC", url: student.prevTcUrl || "", type: "pdf" },
    ].filter(d => !!d.url);

    // ── Load fee records ──────────────────────────────────────────────────────

    const loadFees = useCallback(async () => {
        setFeeLoading(true);
        try {
            const months = Array.from({ length: 12 }, (_, i) => i + 1);
            const schoolQ = query(
                collectionGroup(db, "records"),
                where("studentId", "==", student.id),
                where("year", "==", feeYear)
            );
            const schoolSnap = await getDocs(schoolQ);
            const schoolMap = new Map<number, any>();
            for (const d of schoolSnap.docs) {
                const data = d.data() as any;
                const m = data.month as number;
                if (!m || m < 1 || m > 12) continue;
                const existing = schoolMap.get(m);
                if (!existing || data.status === "paid") schoolMap.set(m, d);
            }

            const result: FeeRecord[] = months.map(m => {
                const snap = schoolMap.get(m) ?? null;
                if (!snap || !snap.exists()) {
                    return { month: m, status: "not_generated", amount: 0, totalAmount: 0, receiptNo: null, paidOn: null, paymentMode: "", previousDues: 0 };
                }
                const d = snap.data() as any;
                return {
                    month: m,
                    status: d.status || "pending",
                    amount: d.amount || 0,
                    totalAmount: d.totalAmount || d.amount || 0,
                    receiptNo: d.receiptNo || null,
                    paidOn: toDate(d.paidOn),
                    paymentMode: d.paymentMode || "",
                    previousDues: d.previousDues || 0,
                };
            });
            setFeeRecords(result);
        } catch (e) {
            console.error("[StudentProfileModal] Fee load error", e);
        } finally {
            setFeeLoading(false);
            setFeeFetched(true);
        }
    }, [student.id, feeYear]);

    // ── Load exam results ─────────────────────────────────────────────────────

    const loadResults = useCallback(async () => {
        setResultsLoading(true);
        try {
            // Load subjects map first
            const classSubjectsSnap = await getDocs(collection(db, "classSubjects"));
            const sMap: Record<string, string> = {};
            classSubjectsSnap.docs.forEach(d => {
                const subs = d.data().subjects || [];
                subs.forEach((s: any) => { if (s.id && s.name) sMap[s.id] = s.name; });
            });
            const subjectsSnap = await getDocs(collection(db, "subjects"));
            subjectsSnap.docs.forEach(d => { sMap[d.id] = (d.data() as any).name || d.id; });
            setSubjectsMap(sMap);

            // Load exams
            const examsSnap = await getDocs(collection(db, "exams"));
            const exams = examsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

            const cls = getClass(student);
            const sec = safeStr(student.section);

            const results: ExamResult[] = [];
            for (const exam of exams) {
                try {
                    const resultsRef = collection(db, "results", exam.id, "classes", cls, "sections", sec, "students");
                    const snap = await getDocs(resultsRef);
                    const studentDoc = snap.docs.find(d => d.id === student.id);
                    if (studentDoc) {
                        const data = studentDoc.data() as any;
                        results.push({
                            examName: exam.name || "Exam",
                            examId: exam.id,
                            session: exam.session || "",
                            examType: exam.examType || "Standard",
                            classId: data.classId || cls,
                            sectionId: data.sectionId || sec,
                            totalObtained: data.totalObtained || 0,
                            totalMax: data.totalMax || 0,
                            percentage: data.percentage || 0,
                            overallGrade: data.overallGrade || "—",
                            marks: data.marks || {},
                        });
                    }
                } catch { /* skip */ }
            }

            // Sort newest session first
            results.sort((a, b) => (b.session || "").localeCompare(a.session || ""));
            setExamResults(results);
        } catch (e) {
            console.error("[StudentProfileModal] Results load error", e);
        } finally {
            setResultsLoading(false);
            setResultsFetched(true);
        }
    }, [student.id, student.currentClass, student.section]);

    // Load fees on tab click
    useEffect(() => {
        if (activeTab === "fees" && !feeFetched) loadFees();
    }, [activeTab, feeFetched, loadFees]);

    useEffect(() => {
        if (activeTab === "fees" && feeFetched) {
            setFeeFetched(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [feeYear]);

    useEffect(() => {
        if (activeTab === "fees" && !feeFetched) loadFees();
    }, [activeTab, feeFetched, loadFees]);

    useEffect(() => {
        if (activeTab === "results" && !resultsFetched) loadResults();
    }, [activeTab, resultsFetched, loadResults]);

    // ── A4 Print ──────────────────────────────────────────────────────────────

    const handlePrint = () => {
        const studentName = getDisplayName(student);
        const cls = getClass(student);
        const sec = safeStr(student.section);

        const feeSummaryRows = feeRecords.filter(r => r.status !== "not_generated").map(r => {
            const statusColor = r.status === "paid" ? "#059669" : r.status === "pending" ? "#d97706" : "#dc2626";
            return `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;">${MONTHS_FULL[r.month - 1]}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;text-align:right;">₹${r.totalAmount.toLocaleString("en-IN")}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;text-align:center;">
          <span style="color:${statusColor};font-weight:700;font-size:11px;">${r.status.replace("_", " ").toUpperCase()}</span>
        </td>
        <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-size:11px;color:#6b7280;">${r.receiptNo || "—"}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-size:11px;color:#6b7280;">${r.paidOn ? fmtDate(r.paidOn) : "—"}</td>
      </tr>`;
        }).join("");

        const resultRows = examResults.map(r => {
            const colorMap: Record<string, string> = {
                "A1": "#059669", "A2": "#059669", "B1": "#0369a1", "B2": "#0369a1",
                "C1": "#d97706", "C2": "#d97706", "D": "#ea580c", "E": "#dc2626", "—": "#6b7280"
            };
            const gradeColor = colorMap[r.overallGrade] || "#374151";
            return `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;">${r.examName}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;text-align:center;">${r.session}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;text-align:right;">${r.totalObtained}/${r.totalMax}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;text-align:center;">${r.percentage}%</td>
        <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;text-align:center;font-weight:800;color:${gradeColor};">${r.overallGrade}</td>
      </tr>`;
        }).join("");

        const paidCount = feeRecords.filter(r => r.status === "paid").length;
        const unpaidCount = feeRecords.filter(r => r.status !== "paid" && r.status !== "not_generated").length;
        const totalDue = feeRecords.filter(r => r.status !== "paid" && r.status !== "not_generated").reduce((s, r) => s + r.totalAmount, 0);

        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>Student Profile — ${studentName}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#111;font-size:13px;}
@page{size:A4 portrait;margin:10mm;}
.page-break{page-break-before:always;}
/* Header */
.header{background:#0f2044;padding:22px 28px;display:flex;align-items:center;gap:16px;}
.avatar{width:56px;height:56px;border-radius:50%;background:rgba(255,255,255,.15);border:2px solid rgba(255,255,255,.3);overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800;color:#fff;flex-shrink:0;}
.avatar img{width:100%;height:100%;object-fit:cover;}
.header-info{flex:1;}
.header-name{font-size:20px;font-weight:800;color:#fff;}
.header-sub{font-size:12px;color:rgba(255,255,255,.6);margin-top:3px;}
.badge{display:inline-block;padding:2px 10px;border-radius:20px;font-size:10px;font-weight:700;background:rgba(200,169,81,.25);color:#f0c040;border:1px solid rgba(200,169,81,.4);margin-top:5px;}
/* Sections */
.section{margin:16px 20px 0;}
.section-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;border-bottom:2px solid #e5e7eb;padding-bottom:6px;margin-bottom:10px;}
/* Info grid */
.info-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;}
.info-item label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#9ca3af;display:block;margin-bottom:2px;}
.info-item span{font-size:12px;font-weight:600;color:#111827;}
/* Fee table */
.fee-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px;}
.stat-box{padding:10px 14px;border-radius:8px;border:1px solid #e5e7eb;}
.stat-box .sl{font-size:9px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:2px;}
.stat-box .sv{font-size:18px;font-weight:800;color:#0f2044;}
.data-table{width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;font-size:12px;}
.data-table th{padding:8px 10px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;background:#f9fafb;text-align:left;}
.data-table th:not(:first-child){text-align:center;}
.data-table td{vertical-align:middle;}
/* Footer */
.footer{margin:24px 20px 0;border-top:1px solid #e5e7eb;padding-top:14px;display:flex;justify-content:space-between;align-items:center;}
.footer-text{font-size:10px;color:#9ca3af;}
.sig-row{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin:20px 20px 0;}
.sig-box{text-align:center;}
.sig-line{border-bottom:2px dashed #d1d5db;height:32px;margin-bottom:6px;}
.sig-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;}
</style></head><body>
<!-- HEADER -->
<div class="header">
  <div class="avatar">${student.childPhotoUrl ? `<img src="${student.childPhotoUrl}" />` : studentName.charAt(0)}</div>
  <div class="header-info">
    <div class="header-name">${studentName}</div>
    <div class="header-sub">ENR: ${student.admissionNumber || "—"} &nbsp;·&nbsp; Class ${cls} – ${sec || "—"} &nbsp;·&nbsp; ${student.gender || "—"}</div>
    <div class="badge">${student.status === "LEFT" ? "LEFT STUDENT" : "ACTIVE STUDENT"}</div>
  </div>
  <div style="text-align:right;">
    <div style="color:rgba(255,255,255,.4);font-size:10px;">International Access School</div>
    <div style="color:rgba(255,255,255,.4);font-size:10px;margin-top:2px;">Student Profile</div>
    <div style="color:rgba(255,255,255,.4);font-size:10px;margin-top:2px;">${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</div>
  </div>
</div>

<!-- PERSONAL INFO -->
<div class="section">
  <div class="section-title">Personal Information</div>
  <div class="info-grid">
    <div class="info-item"><label>Date of Birth</label><span>${fmtDate(student.dob)}</span></div>
    <div class="info-item"><label>Religion</label><span>${student.religion || "—"}</span></div>
    <div class="info-item"><label>Category</label><span>${student.category || "—"}</span></div>
    <div class="info-item"><label>Blood Group</label><span>${student.bloodGroup || "—"}</span></div>
    <div class="info-item"><label>Aadhar No.</label><span>${student.aadharNo || "—"}</span></div>
    <div class="info-item"><label>PEN No.</label><span>${student.pen || "—"}</span></div>
    <div class="info-item"><label>APAAR ID</label><span>${student.aparId || "—"}</span></div>
    <div class="info-item"><label>Roll No.</label><span>${student.rollNumber || student.rollNo || "—"}</span></div>
    <div class="info-item"><label>House</label><span>${student.house || "—"}</span></div>
    <div class="info-item"><label>Transport</label><span>${student.transport || "—"}</span></div>
    <div class="info-item"><label>Date of Admission</label><span>${fmtDate(student.dateOfAdmission)}</span></div>
    <div class="info-item"><label>Session</label><span>${student.session || "—"}</span></div>
  </div>
</div>

<!-- FAMILY -->
<div class="section" style="margin-top:14px;">
  <div class="section-title">Family Information</div>
  <div class="info-grid">
    <div class="info-item"><label>Father's Name</label><span>${student.fatherName || "—"}</span></div>
    <div class="info-item"><label>Father's Occupation</label><span>${student.fatherOccupation || "—"}</span></div>
    <div class="info-item"><label>Father's Qualification</label><span>${student.fatherQualification || "—"}</span></div>
    <div class="info-item"><label>Mother's Name</label><span>${student.motherName || "—"}</span></div>
    <div class="info-item"><label>Mother's Qualification</label><span>${student.motherQualification || "—"}</span></div>
    <div class="info-item"><label>Annual Income</label><span>${student.annualIncome || "—"}</span></div>
    <div class="info-item"><label>Mobile No.</label><span>${student.mobileNo || "—"}</span></div>
    <div class="info-item"><label>Contact 2</label><span>${student.contact2 || "—"}</span></div>
    <div class="info-item" style="grid-column:span 2;"><label>Address</label><span>${student.address || "—"}${student.pinCode ? ` – ${student.pinCode}` : ""}</span></div>
    <div class="info-item"><label>Email</label><span>${student.notificationEmail || student.email || "—"}</span></div>
    <div class="info-item"><label>Previous School</label><span>${student.previousSchool || "—"}</span></div>
  </div>
</div>

${feeSummaryRows || resultRows ? `<div class="page-break"></div>` : ""}

${feeSummaryRows ? `
<!-- FEE SUMMARY -->
<div class="section" style="margin-top:16px;">
  <div class="section-title">Fee Summary — ${feeYear}</div>
  <div class="fee-stats">
    <div class="stat-box"><div class="sl">Paid Months</div><div class="sv" style="color:#059669;">${paidCount}</div></div>
    <div class="stat-box"><div class="sl">Pending Months</div><div class="sv" style="color:#d97706;">${unpaidCount}</div></div>
    <div class="stat-box"><div class="sl">Total Due</div><div class="sv" style="color:#dc2626;">₹${totalDue.toLocaleString("en-IN")}</div></div>
  </div>
  <table class="data-table">
    <thead><tr>
      <th>Month</th>
      <th style="text-align:right;">Amount</th>
      <th style="text-align:center;">Status</th>
      <th style="text-align:left;">Receipt No.</th>
      <th style="text-align:left;">Paid On</th>
    </tr></thead>
    <tbody>${feeSummaryRows}</tbody>
  </table>
</div>
` : ""}

${resultRows ? `
<!-- RESULTS -->
<div class="section" style="margin-top:16px;">
  <div class="section-title">Examination Results</div>
  <table class="data-table">
    <thead><tr>
      <th>Exam</th>
      <th style="text-align:center;">Session</th>
      <th style="text-align:right;">Score</th>
      <th style="text-align:center;">Percentage</th>
      <th style="text-align:center;">Grade</th>
    </tr></thead>
    <tbody>${resultRows}</tbody>
  </table>
</div>
` : ""}

<!-- SIGNATURES -->
<div class="sig-row">
  <div class="sig-box"><div class="sig-line"></div><div class="sig-label">Class Teacher</div></div>
  <div class="sig-box"><div class="sig-line"></div><div class="sig-label">Principal</div></div>
  <div class="sig-box"><div class="sig-line"></div><div class="sig-label">Parent / Guardian</div></div>
</div>

<!-- FOOTER -->
<div class="footer">
  <div class="footer-text">International Access School — Confidential Student Record</div>
  <div class="footer-text">Printed on ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</div>
</div>
</body></html>`;

        const iframe = document.createElement("iframe");
        iframe.style.display = "none";
        document.body.appendChild(iframe);
        iframe.contentDocument?.write(html);
        iframe.contentDocument?.close();
        setTimeout(() => {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            setTimeout(() => document.body.removeChild(iframe), 1200);
        }, 500);
    };

    // ── Render ────────────────────────────────────────────────────────────────

    const cls = getClass(student);
    const sec = safeStr(student.section);
    const studentName = getDisplayName(student);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-[3px]">
            <div className="bg-white rounded-3xl shadow-[0_24px_80px_rgb(0,0,0,0.18)] w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">

                {/* ── Header ─────────────────────────────────────────────────── */}
                <div className="flex items-center gap-4 px-6 py-4 bg-[#0f2044] shrink-0">
                    {/* Avatar */}
                    <div className="w-12 h-12 rounded-full bg-white/10 border-2 border-white/20 overflow-hidden flex items-center justify-center shrink-0">
                        {student.childPhotoUrl
                            ? <img src={student.childPhotoUrl} alt={studentName} className="w-full h-full object-cover" />
                            : <span className="text-white font-bold text-lg">{studentName.charAt(0)}</span>
                        }
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className="text-white font-bold text-lg leading-tight truncate">{studentName}</h2>
                        <p className="text-white/60 text-xs mt-0.5">
                            ENR: <span className="font-mono font-bold text-white/80">{student.admissionNumber || "—"}</span>
                            <span className="mx-2 text-white/30">·</span>
                            Class {cls}{sec ? ` – ${sec}` : ""}
                            <span className="mx-2 text-white/30">·</span>
                            {student.gender || "—"}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            onClick={handlePrint}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-all"
                        >
                            <Printer className="w-3.5 h-3.5" strokeWidth={2.5} />
                            Print A4
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-all"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* ── Tabs ───────────────────────────────────────────────────── */}
                <div className="flex gap-0 border-b border-slate-200 bg-white shrink-0">
                    {TABS.map(tab => {
                        const Icon = tab.icon;
                        const active = activeTab === tab.key;
                        return (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={`flex items-center gap-2 px-5 py-3.5 text-sm font-bold border-b-2 transition-all ${active
                                    ? "border-[#0f2044] text-[#0f2044]"
                                    : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                                }`}
                            >
                                <Icon className="w-4 h-4" strokeWidth={2} />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                {/* ── Content ────────────────────────────────────────────────── */}
                <div className="flex-1 overflow-y-auto">

                    {/* PROFILE TAB */}
                    {activeTab === "profile" && (
                        <div className="p-6 space-y-6">
                            {/* Personal */}
                            <InfoSection title="Personal Information" icon={User}>
                                <InfoGrid>
                                    <InfoItem label="First Name" value={student.firstName} />
                                    <InfoItem label="Middle Name" value={student.middleName} />
                                    <InfoItem label="Last Name" value={student.lastName} />
                                    <InfoItem label="Date of Birth" value={fmtDate(student.dob)} />
                                    <InfoItem label="Gender" value={student.gender} />
                                    <InfoItem label="Blood Group" value={student.bloodGroup} />
                                    <InfoItem label="Religion" value={student.religion} />
                                    <InfoItem label="Category" value={student.category} />
                                    <InfoItem label="House" value={student.house} />
                                    <InfoItem label="Transport" value={student.transport} />
                                    <InfoItem label="EWS" value={student.economicallyWeakSection} />
                                    <InfoItem label="Free Scheme" value={student.freeScheme} />
                                </InfoGrid>
                            </InfoSection>

                            {/* Academic */}
                            <InfoSection title="Academic Details" icon={BookOpen}>
                                <InfoGrid>
                                    <InfoItem label="Admission No." value={student.admissionNumber} mono />
                                    <InfoItem label="Date of Admission" value={fmtDate(student.dateOfAdmission)} />
                                    <InfoItem label="Session" value={student.session} />
                                    <InfoItem label="Current Class" value={cls} />
                                    <InfoItem label="Section" value={sec} />
                                    <InfoItem label="Roll No." value={student.rollNumber || student.rollNo} />
                                    <InfoItem label="Class at Admission" value={student.classAtAdmission} />
                                    <InfoItem label="Aadhar No." value={student.aadharNo} mono />
                                    <InfoItem label="PEN No." value={student.pen} mono />
                                    <InfoItem label="APAAR ID" value={student.aparId} mono />
                                    <InfoItem label="CBSE Enr. No." value={student.cbseEnrolmentNo} mono />
                                    <InfoItem label="UDISE No." value={student.udise} mono />
                                </InfoGrid>
                            </InfoSection>

                            {/* Family */}
                            <InfoSection title="Family Information" icon={User}>
                                <InfoGrid>
                                    <InfoItem label="Father's Name" value={student.fatherName} />
                                    <InfoItem label="Father's Occupation" value={student.fatherOccupation} />
                                    <InfoItem label="Father's Qualification" value={student.fatherQualification} />
                                    <InfoItem label="Mother's Name" value={student.motherName} />
                                    <InfoItem label="Mother's Qualification" value={student.motherQualification} />
                                    <InfoItem label="Annual Income" value={student.annualIncome} />
                                    <InfoItem label="Guardian Name" value={student.guardianName} />
                                    <InfoItem label="Guardian Relation" value={student.guardianRelation} />
                                    <InfoItem label="Guardian Qualification" value={student.guardianQualification} />
                                </InfoGrid>
                            </InfoSection>

                            {/* Contact */}
                            <InfoSection title="Contact Details" icon={Phone}>
                                <InfoGrid>
                                    <InfoItem label="Mobile No." value={student.mobileNo} mono />
                                    <InfoItem label="Contact 2" value={student.contact2} mono />
                                    <InfoItem label="Email" value={student.email} />
                                    <InfoItem label="Notification Email" value={student.notificationEmail} />
                                    <InfoItem label="Address" value={student.address} wide />
                                    <InfoItem label="Pin Code" value={student.pinCode} mono />
                                    <InfoItem label="Block" value={student.block} />
                                    <InfoItem label="Previous School" value={student.previousSchool} wide />
                                </InfoGrid>
                            </InfoSection>
                        </div>
                    )}

                    {/* FEES TAB */}
                    {activeTab === "fees" && (
                        <div className="p-6 space-y-4">
                            {/* Year selector */}
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-bold text-slate-700">Fee Records</h3>
                                <div className="flex items-center gap-2">
                                    <select
                                        value={feeYear}
                                        onChange={e => { setFeeYear(Number(e.target.value)); setFeeFetched(false); }}
                                        className="px-3 py-1.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 focus:outline-none focus:border-[#0f2044] bg-slate-50"
                                    >
                                        {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
                                    </select>
                                    <button
                                        onClick={() => { setFeeFetched(false); }}
                                        disabled={feeLoading}
                                        className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500 transition-colors disabled:opacity-40"
                                    >
                                        <RefreshCw className={`w-4 h-4 ${feeLoading ? "animate-spin" : ""}`} />
                                    </button>
                                </div>
                            </div>

                            {feeLoading ? (
                                <div className="flex flex-col items-center justify-center py-20 gap-3">
                                    <Loader2 className="w-8 h-8 animate-spin text-[#0f2044]" />
                                    <p className="text-sm text-slate-400 font-medium">Loading fee records…</p>
                                </div>
                            ) : (
                                <>
                                    {/* Fee summary stats */}
                                    {feeRecords.some(r => r.status !== "not_generated") && (
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                            {[
                                                { label: "Paid", value: feeRecords.filter(r => r.status === "paid").length, color: "emerald" },
                                                { label: "Pending/Overdue", value: feeRecords.filter(r => r.status !== "paid" && r.status !== "not_generated").length, color: "amber" },
                                                { label: "Total Due", value: `₹${feeRecords.filter(r => r.status !== "paid" && r.status !== "not_generated").reduce((s, r) => s + r.totalAmount, 0).toLocaleString("en-IN")}`, color: "rose" },
                                            ].map(stat => (
                                                <div key={stat.label} className={`p-4 rounded-2xl border border-${stat.color}-200 bg-${stat.color}-50`}>
                                                    <p className={`text-xs font-bold text-${stat.color}-600 uppercase tracking-wider mb-1`}>{stat.label}</p>
                                                    <p className={`text-2xl font-black text-${stat.color}-700`}>{stat.value}</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Fee table */}
                                    <div className="rounded-2xl border border-slate-200 overflow-hidden">
                                        <table className="w-full text-sm">
                                            <thead className="bg-slate-50 border-b border-slate-200">
                                                <tr>
                                                    {["Month", "Amount", "Status", "Receipt No.", "Paid On", "Mode"].map(h => (
                                                        <th key={h} className="h-11 px-4 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {feeRecords.map(r => {
                                                    const statusMap: Record<string, { label: string; cls: string }> = {
                                                        paid: { label: "Paid", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
                                                        pending: { label: "Pending", cls: "bg-amber-50 text-amber-700 border-amber-200" },
                                                        overdue: { label: "Overdue", cls: "bg-rose-50 text-rose-700 border-rose-200" },
                                                        carried_forward: { label: "Arrear", cls: "bg-purple-50 text-purple-700 border-purple-200" },
                                                        not_generated: { label: "—", cls: "bg-slate-50 text-slate-400 border-slate-200" },
                                                    };
                                                    const cfg = statusMap[r.status] || statusMap.not_generated;
                                                    return (
                                                        <tr key={r.month} className={r.status === "not_generated" ? "opacity-40" : "hover:bg-slate-50/60"}>
                                                            <td className="px-4 py-3 font-semibold text-slate-700">{MONTHS_FULL[r.month - 1]}</td>
                                                            <td className="px-4 py-3 font-bold text-slate-800">
                                                                {r.status === "not_generated" ? "—" : `₹${r.totalAmount.toLocaleString("en-IN")}`}
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${cfg.cls}`}>
                                                                    {cfg.label}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.receiptNo || "—"}</td>
                                                            <td className="px-4 py-3 text-xs text-slate-500">{r.paidOn ? fmtDate(r.paidOn) : "—"}</td>
                                                            <td className="px-4 py-3 text-xs text-slate-500 font-medium">{r.paymentMode || "—"}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* RESULTS TAB */}
                    {activeTab === "results" && (
                        <div className="p-6 space-y-4">
                            {resultsLoading ? (
                                <div className="flex flex-col items-center justify-center py-20 gap-3">
                                    <Loader2 className="w-8 h-8 animate-spin text-[#0f2044]" />
                                    <p className="text-sm text-slate-400 font-medium">Loading results…</p>
                                </div>
                            ) : examResults.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-20 gap-3">
                                    <GraduationCap className="w-12 h-12 text-slate-200" />
                                    <p className="text-slate-500 text-sm font-bold">No exam results found</p>
                                    <p className="text-slate-400 text-xs">Results will appear here once marks are entered and published</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {examResults.map((result, idx) => {
                                        const gradeColorMap: Record<string, string> = {
                                            A1: "emerald", A2: "emerald", B1: "blue", B2: "blue",
                                            C1: "amber", C2: "amber", D: "orange", E: "red",
                                        };
                                        const gc = gradeColorMap[result.overallGrade] || "slate";
                                        const markEntries = Object.values(result.marks || {});
                                        return (
                                            <div key={idx} className="rounded-2xl border border-slate-200 overflow-hidden">
                                                {/* Exam header */}
                                                <div className="flex items-center justify-between px-5 py-3.5 bg-slate-50 border-b border-slate-200">
                                                    <div>
                                                        <p className="font-bold text-slate-900 text-sm">{result.examName}</p>
                                                        <p className="text-xs text-slate-400 mt-0.5">Session {result.session} · {result.examType}</p>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <div className="text-right">
                                                            <p className="text-xs text-slate-400">Score</p>
                                                            <p className="font-bold text-slate-700 text-sm">{result.totalObtained}/{result.totalMax}</p>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-xs text-slate-400">Percentage</p>
                                                            <p className="font-bold text-slate-700 text-sm">{result.percentage}%</p>
                                                        </div>
                                                        <div className={`w-12 h-12 rounded-2xl bg-${gc}-50 border border-${gc}-200 flex items-center justify-center`}>
                                                            <span className={`text-xl font-black text-${gc}-600`}>{result.overallGrade}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                {/* Subject marks */}
                                                {markEntries.length > 0 && (
                                                    <table className="w-full text-sm">
                                                        <thead>
                                                            <tr className="border-b border-slate-100">
                                                                <th className="px-5 py-2 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Subject</th>
                                                                <th className="px-5 py-2 text-center text-[11px] font-bold text-slate-400 uppercase tracking-wider">Max</th>
                                                                <th className="px-5 py-2 text-center text-[11px] font-bold text-slate-400 uppercase tracking-wider">Obtained</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-50">
                                                            {markEntries.map((m, mi) => {
                                                                const obtained = m.obtained !== null ? m.obtained : "ABSENT";
                                                                const isAbsent = m.obtained === null;
                                                                return (
                                                                    <tr key={mi} className="hover:bg-slate-50/50">
                                                                        <td className="px-5 py-2.5 text-slate-700 font-medium">
                                                                            {subjectsMap[m.subjectId] || m.subjectId}
                                                                        </td>
                                                                        <td className="px-5 py-2.5 text-center text-slate-400">{m.total}</td>
                                                                        <td className="px-5 py-2.5 text-center">
                                                                            <span className={`font-bold ${isAbsent ? "text-rose-500" : "text-slate-800"}`}>
                                                                                {obtained}
                                                                            </span>
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* DOCUMENTS TAB */}
                    {activeTab === "documents" && (
                        <div className="p-6">
                            {docFields.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-20 gap-3">
                                    <FileText className="w-12 h-12 text-slate-200" />
                                    <p className="text-slate-500 text-sm font-bold">No documents uploaded</p>
                                    <p className="text-slate-400 text-xs">Upload documents from the student edit panel</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {docFields.map((doc, i) => (
                                        <a
                                            key={i}
                                            href={doc.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-4 p-4 rounded-2xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all group"
                                        >
                                            <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                                                {doc.type === "image" ? <ImageIcon className="w-5 h-5 text-blue-500" /> : <FileText className="w-5 h-5 text-blue-500" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold text-slate-800 text-sm group-hover:text-blue-600 transition-colors">{doc.name}</p>
                                                <p className="text-xs text-slate-400 mt-0.5 truncate">{doc.url.split("/").pop()}</p>
                                            </div>
                                            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-colors shrink-0" />
                                        </a>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

function InfoSection({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
    return (
        <div>
            <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-[#0f2044]/8 flex items-center justify-center">
                    <Icon className="w-3.5 h-3.5 text-[#0f2044]" strokeWidth={2} />
                </div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">{title}</h3>
            </div>
            <div className="bg-slate-50/60 rounded-2xl border border-slate-200/60 p-4">
                {children}
            </div>
        </div>
    );
}

function InfoGrid({ children }: { children: React.ReactNode }) {
    return <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-3">{children}</div>;
}

function InfoItem({ label, value, mono, wide }: { label: string; value?: any; mono?: boolean; wide?: boolean }) {
    const display = value == null || value === "" ? "—" : String(value);
    return (
        <div className={wide ? "col-span-2" : ""}>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
            <p className={`text-sm font-semibold text-slate-800 ${mono ? "font-mono" : ""} ${display === "—" ? "text-slate-300" : ""}`}>
                {display}
            </p>
        </div>
    );
}
