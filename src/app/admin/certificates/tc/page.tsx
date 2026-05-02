"use client";

import { useState } from "react";
import { collectionGroup, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Search, Printer, Loader2, UserCircle2, Edit3, RotateCcw } from "lucide-react";
import toast from "react-hot-toast";

// ─── Helpers ────────────────────────────────────────────────────────────────

const ONES = ["", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE",
  "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN",
  "SEVENTEEN", "EIGHTEEN", "NINETEEN"];
const TENS = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];

function numToWords(n: number): string {
  if (n === 0) return "ZERO";
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "");
  if (n < 1000) return ONES[Math.floor(n / 100)] + " HUNDRED" + (n % 100 ? " " + numToWords(n % 100) : "");
  return numToWords(Math.floor(n / 1000)) + " THOUSAND" + (n % 1000 ? " " + numToWords(n % 1000) : "");
}

function dateToWords(dateStr: string): string {
  if (!dateStr) return "";
  let d: Date;
  if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
    const [dd, mm, yyyy] = dateStr.split("-");
    d = new Date(`${yyyy}-${mm}-${dd}`);
  } else {
    d = new Date(dateStr);
  }
  if (isNaN(d.getTime())) return dateStr;
  const months = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
    "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
  return `${numToWords(d.getDate())} ${months[d.getMonth()]} ${numToWords(d.getFullYear())}`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) return dateStr;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [yyyy, mm, dd] = dateStr.split("-");
    return `${dd}-${mm}-${yyyy}`;
  }
  return dateStr;
}

function safeStr(v: any): string {
  if (v == null) return "";
  return String(v).trim();
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Student {
  id: string;
  admissionNumber: string;
  firstName?: string;
  lastName?: string;
  motherName?: string;
  fatherName?: string;
  guardianName?: string;
  dob?: string;
  dateOfAdmission?: string;
  nationality?: string;
  category?: string;
  classAtAdmission?: string;
  currentClass?: string | number;
  lastClass?: string;
  section?: string;
  lastDate?: string;
  gender?: string;
  serialNumber?: string;
  freeScheme?: string;
  nccCadet?: string;
  govtMinority?: string;
  sports?: string;
  previousBoard?: string;
  [key: string]: any;
}

interface TCData {
  bookNo: string; slNo: string; udise: string;
  studentName: string; pen: string; motherName: string; fatherName: string;
  dobFigures: string; dobWords: string; proofDob: string;
  nationality: string; category: string;
  classAtAdmission: string; admissionDate: string;
  lastClassFigures: string; lastClassWords: string;
  board: string; failed: string; subjects: string;
  qualified: string; ifSoClass: string; qualifiedClass: string;
  workingDays: string; presentDays: string;
  feeDueMonth: string; feeConcession: string;
  ncc: string; govtMinority: string; sports: string;
  applicationDate: string; rollsDate: string; issueDate: string;
  remarks: string;
}

const defaultTC = (): TCData => ({
  bookNo: "06", slNo: "", udise: "",
  studentName: "", pen: "", motherName: "", fatherName: "",
  dobFigures: "", dobWords: "", proofDob: "AADHAAR",
  nationality: "INDIAN", category: "NO",
  classAtAdmission: "", admissionDate: "",
  lastClassFigures: "", lastClassWords: "",
  board: "AISSE - " + new Date().getFullYear() + " (QUALIFIED)", failed: "NO",
  subjects: "English, Hindi, Mathematics, Urdu, Science, Social Science, GK & Computer",
  qualified: "YES", ifSoClass: "", qualifiedClass: "",
  workingDays: "207", presentDays: "195",
  feeDueMonth: "MARCH - " + new Date().getFullYear(),
  feeConcession: "NO", ncc: "YES", govtMinority: "NO", sports: "NO",
  applicationDate: "", rollsDate: "", issueDate: "", remarks: "",
});

// ─── Print generator (fully self-contained HTML) ────────────────────────────

function buildPrintHTML(tc: TCData, admNo: string, logoUrl: string, udiseSchool: string = "IAS", udiseCode: string = "10161506306"): string {
  const rows: [string, string, string, string][] = [
    ["1.", "Name of the Student", tc.studentName, ""],
    ["1a.", "Permanent Education Number (PEN)", tc.pen || "—", ""],
    ["2.", "Mother's Name :-", tc.motherName, ""],
    ["3.", "Father's / Guardian's Name :-", tc.fatherName, ""],
    ["4.", "Date of Birth (in Christian era) according to Admission & Withdrawal Register. (In figures)", tc.dobFigures, `(in words) ${tc.dobWords}`],
    ["5.", "Proof for Date of Birth submitted at the time of admission", tc.proofDob, ""],
    ["6.", "Nationality :-", tc.nationality, ""],
    ["7.", "Whether the candidate belongs to Schedule Caste or Schedule Tribe or OBC :-", tc.category, ""],
    ["8.", "Date of first admission in the school with class:", `${tc.admissionDate}${tc.classAtAdmission ? "   Class: " + tc.classAtAdmission : ""}`, ""],
    ["9.", "Class in which the pupil last studied (In figures)", tc.lastClassFigures, tc.lastClassWords],
    ["10.", "School/Board Annual Examination last taken with result;", tc.board, ""],
    ["11.", "Whether failed, if so once/twice in the same class;", tc.failed, ""],
    ["12.", "Subject Studied:", tc.subjects, ""],
    ["13.", "Whether qualified for promotion to the higher class:", tc.qualified, tc.ifSoClass ? `If so, to which class (in fig) ${tc.ifSoClass}  ${tc.qualifiedClass}` : ""],
    ["14.", "Total No. of working days in the academic session:", tc.workingDays, ""],
    ["15.", "Total No. of presence in the academic session:", tc.presentDays, ""],
    ["16.", "Month up to which the people has paid school dues.", tc.feeDueMonth, ""],
    ["17.", "Any fee concession availed of, if so, the nature of such concession", tc.feeConcession, ""],
    ["18.", "Whether NCC Cadet/Boy Scout/Girl Guide (details may be given)", tc.ncc, ""],
    ["19.", "Whether school is under Govt./Minority/Independent Category", tc.govtMinority, ""],
    ["20.", "Games played on extracurricular activities in which the pupil usually took part (mention achievement level therein)", tc.sports, ""],
    ["21.", "Date of application for certificate:", tc.applicationDate, ""],
    ["22.", "Date on which pupils name was struck off the rolls of the school:", tc.rollsDate, ""],
    ["23.", "Date of issue of certificate:", tc.issueDate, ""],
    ["24.", "Any other remark.", tc.remarks || "NO", ""],
  ];

  const rowsHtml = rows.map(([sno, label, val, extra], i) => {
    const bg = i % 2 === 0 ? "#f5f5ff" : "#ffffff";
    return `<tr style="background:${bg}">
      <td style="padding:3.5px 5px;vertical-align:top;font-weight:bold;white-space:nowrap;font-size:11px">${sno}</td>
      <td style="padding:3.5px 5px;vertical-align:top;font-size:11px;width:52%">${label}</td>
      <td style="padding:3.5px 5px;vertical-align:top;font-size:11px;text-align:center">:</td>
      <td style="padding:3.5px 5px;vertical-align:top;font-size:11px;font-weight:bold">
        ${val}
        ${extra ? `<div style="font-weight:normal;font-size:10px;margin-top:2px">${extra}</div>` : ""}
      </td>
    </tr>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Transfer Certificate – ${tc.studentName}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:"Times New Roman",Times,serif;background:#fff;color:#000}
    @page{size:A4 portrait;margin:12mm 16mm}
    @media print{
      body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .no-print{display:none}
    }
    .page{width:100%;max-width:178mm;margin:0 auto}
    table{border-collapse:collapse;width:100%}
  </style>
</head>
<body>
<div class="page">

  <!-- School Header -->
  <table style="width:100%;margin-bottom:6px">
    <tr>
      <td style="width:70px;text-align:center;vertical-align:middle;padding-right:8px">
        <img src="${logoUrl}" alt="IAS Logo" style="width:65px;height:65px;object-fit:contain"/>
      </td>
      <td style="text-align:center;vertical-align:middle">
        <div style="font-size:20px;font-weight:bold;color:#1a1a5e;letter-spacing:1px">INTERNATIONAL ACCESS SCHOOL</div>
        <div style="font-size:9px;color:#444;margin-top:2px">Managed by: International Board of Educational Research Trust (IBERT)</div>
        <div style="font-size:9px;color:#444">Affiliated to CBSE(10+2) New Delhi &nbsp;Aff. No.: 330691 &nbsp;|&nbsp; School Code: 65688</div>
        <div style="font-size:9px;color:#444">Siwan, Bihar – 841227 &nbsp;&nbsp;Ph: +91-9934776670, 8406000829/30/33/40</div>
        <div style="font-size:9px;color:#444">Email: info@iaschool.edu.in &nbsp;|&nbsp; Web: www.iaschool.edu.in</div>
      </td>
      <td style="width:70px;text-align:right;vertical-align:top;font-size:8px;color:#666">
        <div style="border:1px solid #aaa;padding:2px 5px;display:inline-block;margin-bottom:3px">ISO 9001·2005</div><br/>
        <div style="border:1px solid #aaa;padding:2px 5px;display:inline-block">CBSE</div>
      </td>
    </tr>
  </table>

  <div style="border-bottom:2px solid #1a1a5e;margin-bottom:6px"></div>

  <!-- Book / SL / Admission -->
  <table style="width:100%;margin-bottom:2px">
    <tr>
      <td style="font-size:10px">Book No. <b>${tc.bookNo}</b> &nbsp;&nbsp; Sl. No. <b>${tc.slNo}</b></td>
      <td style="font-size:10px;text-align:right">Admission No.: ${udiseSchool} – <b>${admNo}</b></td>
    </tr>
    <tr><td colspan="2" style="font-size:10px;font-weight:bold;text-align:right">UDISE – ${udiseSchool} – ${udiseCode}</td></tr>
  </table>

  <!-- Title -->
  <div style="text-align:center;font-size:15px;font-weight:bold;letter-spacing:3px;text-decoration:underline;color:#1a1a5e;margin:8px 0 10px">
    TRANSFER CERTIFICATE
  </div>

  <!-- TC Rows -->
  <table>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <!-- Declaration -->
  <p style="font-size:9.5px;margin-top:10px;line-height:1.5;font-style:italic">
    I declare that the above information including Name of the Candidate, Father's Name, Mother's Name and Date of Birth furnished above is correct as per school records.
  </p>

  <!-- Signatures -->
  <table style="width:100%;margin-top:36px">
    <tr>
      <td style="text-align:center;width:33%">
        <div style="border-top:1px solid #000;width:130px;margin:0 auto;padding-top:4px;font-size:10px">Sign. of Class Teacher</div>
      </td>
      <td style="text-align:center;width:33%">
        <div style="border-top:1px solid #000;width:130px;margin:0 auto;padding-top:4px;font-size:10px">Checked by</div>
      </td>
      <td style="text-align:center;width:33%">
        <div style="border-top:1px solid #000;width:160px;margin:0 auto;padding-top:4px;font-size:10px;font-weight:bold">
          Principal<br/>
          <span style="font-weight:normal;font-size:9px">International Access School (Siwan)</span>
        </div>
      </td>
    </tr>
  </table>

  <div style="text-align:center;font-size:10px;margin-top:14px;color:#888">${tc.slNo}</div>

</div>
</body>
</html>`;
}

// ─── Component ───────────────────────────────────────────────────────────────

const UDISE_CODES: Record<string, string> = {
  IAS: "10161506306",
  IPS: "10161202003",
};

export default function TransferCertificatePage() {
  const [enr, setEnr] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [student, setStudent] = useState<Student | null>(null);
  const [tcData, setTcData] = useState<TCData>(defaultTC());
  const [notFound, setNotFound] = useState(false);
  const [udiseSchool, setUdiseSchool] = useState<"IAS" | "IPS">("IAS");

  const handleSearch = async () => {
    const trimmed = enr.trim();
    if (!trimmed) { toast.error("Enter an Admission Number"); return; }
    setIsSearching(true); setNotFound(false); setStudent(null);
    try {
      const snap = await getDocs(collectionGroup(db, "profiles"));
      const found = snap.docs.find(d => safeStr(d.data().admissionNumber) === trimmed);
      if (!found) { setNotFound(true); return; }
      const s = { id: found.id, ...found.data() } as Student;
      setStudent(s);

      const today = new Date().toISOString().slice(0, 10);
      const todayFmt = formatDate(today);
      const lastCls = safeStr(s.lastClass || s.currentClass);
      const lastNum = parseInt(lastCls) || 0;

      // Fetch subjects from classSubjects collection for this student's class
      const classKey = safeStr(s.lastClass || s.currentClass || s.className);
      let subjectsStr = "English, Hindi, Mathematics, Urdu, Science, Social Science, GK & Computer";
      try {
        if (classKey) {
          const subSnap = await getDoc(doc(db, "classSubjects", classKey));
          if (subSnap.exists()) {
            const raw = subSnap.data().subjects || [];
            const names: string[] = raw.map((item: any) =>
              typeof item === "string" ? item : (item.name || item.id || "")
            ).filter(Boolean);
            if (names.length > 0) subjectsStr = names.join(", ");
          }
        }
      } catch { /* fallback to default */ }

      setTcData({
        bookNo: "06",
        slNo: safeStr(s.serialNumber),
        udise: safeStr(s.udise),
        studentName: `${safeStr(s.firstName)} ${safeStr(s.lastName)}`.trim().toUpperCase(),
        pen: safeStr(s.pen),
        motherName: safeStr(s.motherName).toUpperCase(),
        fatherName: safeStr(s.fatherName || s.guardianName).toUpperCase(),
        dobFigures: formatDate(safeStr(s.dob)),
        dobWords: dateToWords(safeStr(s.dob)),
        proofDob: "AADHAAR",
        nationality: safeStr(s.nationality).toUpperCase() || "INDIAN",
        category: safeStr(s.category) ? "YES" : "NO",
        classAtAdmission: safeStr(s.classAtAdmission || s.currentClass),
        admissionDate: formatDate(safeStr(s.dateOfAdmission)),
        lastClassFigures: lastCls ? `STD - ${lastCls}` : "",
        lastClassWords: lastNum ? `(in words) ${numToWords(lastNum)}` : "",
        board: safeStr(s.previousBoard) || "AISSE - " + new Date().getFullYear() + " (QUALIFIED)",
        failed: "NO",
        subjects: subjectsStr,
        qualified: "YES",
        ifSoClass: lastCls ? `STD - ${lastCls}` : "",
        qualifiedClass: lastNum ? `(in words) ${numToWords(lastNum)}` : "",
        workingDays: "207",
        presentDays: "195",
        feeDueMonth: "MARCH - " + new Date().getFullYear(),
        feeConcession: safeStr(s.freeScheme) === "Y" ? "YES" : "NO",
        ncc: safeStr(s.nccCadet) || "YES",
        govtMinority: safeStr(s.govtMinority) || "NO",
        sports: safeStr(s.sports) || "NO",
        applicationDate: todayFmt,
        rollsDate: formatDate(safeStr(s.lastDate || today)),
        issueDate: todayFmt,
        remarks: "",
      });

      toast.success("Student found! Customize fields then print.");
    } catch (err: any) {
      toast.error("Error: " + err.message);
    } finally {
      setIsSearching(false);
    }
  };

  const handlePrint = () => {
    if (!student) return;
    // Build absolute logo URL from current origin
    const logoUrl = `${window.location.origin}/LOGO.png`;
    const html = buildPrintHTML(tcData, student.admissionNumber, logoUrl, udiseSchool, UDISE_CODES[udiseSchool]);
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) { toast.error("Pop-up blocked — please allow pop-ups."); return; }
    win.document.open();
    win.document.write(html);
    win.document.close();
    // Wait for logo to load before printing
    win.onload = () => { win.focus(); win.print(); };
    setTimeout(() => { try { win.focus(); win.print(); } catch { /* already printed */ } }, 1200);
  };

  const field = (key: keyof TCData, label: string, multiline?: boolean) => (
    <div className="mb-1.5">
      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-0.5">{label}</label>
      {multiline ? (
        <textarea value={tcData[key]} onChange={e => setTcData(p => ({ ...p, [key]: e.target.value }))}
          rows={2} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-medium focus:outline-none focus:border-navy focus:ring-1 focus:ring-navy/20 resize-none" />
      ) : (
        <input value={tcData[key]} onChange={e => setTcData(p => ({ ...p, [key]: e.target.value }))}
          className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-medium focus:outline-none focus:border-navy focus:ring-1 focus:ring-navy/20" />
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="rounded-2xl gradient-navy p-6 md:p-8 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.2) 0%, transparent 50%)` }} />
        <div className="relative z-10">
          <p className="text-white/50 text-sm font-medium">Admin Console</p>
          <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">Transfer Certificate</h1>
          <p className="text-white/50 text-sm mt-1">Search by Admission No. (ENR) · Customize · Print</p>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-5">
        <div className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1">
            <label className="text-xs font-bold text-slate-600 mb-1.5 block">Admission Number (ENR)</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input value={enr} onChange={e => setEnr(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSearch()}
                placeholder="e.g. IAS - 12662  or  12662"
                className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/10" />
            </div>
          </div>
          <button onClick={handleSearch} disabled={isSearching}
            className="flex items-center gap-2 px-5 py-2.5 bg-navy text-white rounded-xl font-bold text-sm hover:bg-navy/90 disabled:opacity-60 shadow-md shadow-navy/20 transition-colors">
            {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {isSearching ? "Searching…" : "Search"}
          </button>
          {student && (
            <button onClick={() => { setStudent(null); setEnr(""); setTcData(defaultTC()); setNotFound(false); }}
              className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-semibold text-sm hover:bg-slate-50 transition-colors">
              <RotateCcw className="w-4 h-4" /> Reset
            </button>
          )}
        </div>

        {notFound && (
          <div className="mt-4 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm font-medium flex items-center gap-2">
            <UserCircle2 className="w-5 h-5" /> No student found with ENR <strong>{enr}</strong>.
          </div>
        )}
        {student && (
          <div className="mt-4 p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-200 flex items-center justify-center text-emerald-800 font-bold text-sm">
              {(tcData.studentName || "S").charAt(0)}
            </div>
            <div>
              <p className="font-bold text-emerald-900">{tcData.studentName}</p>
              <p className="text-sm text-emerald-700">ENR: {student.admissionNumber} · Last Class: {tcData.lastClassFigures} · Adm: {tcData.admissionDate}</p>
            </div>
          </div>
        )}
      </div>

      {/* Form + Preview */}
      {student ? (
        <div className="grid xl:grid-cols-5 gap-6">
          {/* Edit Panel */}
          <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-200/60 shadow-sm p-5 space-y-1">
            <div className="flex items-center gap-2 mb-3">
              <Edit3 className="w-4 h-4 text-navy" />
              <h2 className="font-bold text-navy text-sm">Customize TC Fields</h2>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {field("bookNo", "Book No.")}
              {field("slNo", "Sl. No.")}
            </div>
            <div className="mb-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-0.5">UDISE School</label>
              <select
                value={udiseSchool}
                onChange={e => setUdiseSchool(e.target.value as "IAS" | "IPS")}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-medium focus:outline-none focus:border-navy focus:ring-1 focus:ring-navy/20"
              >
                <option value="IAS">IAS — {UDISE_CODES.IAS}</option>
                <option value="IPS">IPS — {UDISE_CODES.IPS}</option>
              </select>
            </div>
            {field("studentName", "Student Name")}
            {field("pen", "PEN (Permanent Education Number)")}
            {field("motherName", "Mother's Name")}
            {field("fatherName", "Father's / Guardian's Name")}
            <div className="grid grid-cols-2 gap-2">
              {field("dobFigures", "DOB (Figures)")}
            </div>
            {field("dobWords", "DOB (Words)")}
            {field("proofDob", "Proof for DOB")}
            {field("nationality", "Nationality")}
            {field("category", "Category (SC/ST/OBC)")}
            {field("classAtAdmission", "Class at Admission")}
            {field("admissionDate", "Date of Admission")}
            {field("lastClassFigures", "Last Class (Figures)")}
            {field("lastClassWords", "Last Class (Words)")}
            {field("board", "Board Exam Result")}
            {field("failed", "Failed? (YES/NO)")}
            {field("subjects", "Subjects Studied", true)}
            {field("qualified", "Qualified for Promotion?")}
            {field("ifSoClass", "If So, Class (Figures)")}
            {field("qualifiedClass", "Qualified Class (Words)")}
            <div className="grid grid-cols-2 gap-2">
              {field("workingDays", "Working Days")}
              {field("presentDays", "Present Days")}
            </div>
            {field("feeDueMonth", "Fee Due Up to Month")}
            {field("feeConcession", "Fee Concession?")}
            {field("ncc", "NCC Cadet?")}
            {field("govtMinority", "Govt/Minority?")}
            {field("sports", "Sports / Extracurricular")}
            {field("applicationDate", "Date of Application")}
            {field("rollsDate", "Date Struck from Rolls")}
            {field("issueDate", "Date of Issue")}
            {field("remarks", "Remarks")}
            <button onClick={handlePrint}
              className="w-full mt-3 flex items-center justify-center gap-2 px-5 py-3 bg-navy text-white rounded-xl font-bold text-sm hover:bg-navy/90 transition-colors shadow-md shadow-navy/20">
              <Printer className="w-4 h-4" /> Print Transfer Certificate
            </button>
          </div>

          {/* On-screen preview */}
          <div className="xl:col-span-3">
            <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-4 mb-3 flex items-center justify-between">
              <h2 className="font-bold text-navy text-sm flex items-center gap-2"><Printer className="w-4 h-4" /> Print Preview</h2>
              <button onClick={handlePrint}
                className="flex items-center gap-1.5 px-4 py-2 bg-navy text-white rounded-xl font-bold text-xs hover:bg-navy/90 transition-colors">
                <Printer className="w-3.5 h-3.5" /> Print
              </button>
            </div>

            {/* Preview box — uses same inline-style layout as the print page */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 overflow-auto" style={{ fontFamily: "'Times New Roman', Times, serif" }}>
              {/* School Header */}
              <table style={{ width: "100%", marginBottom: "8px", borderCollapse: "collapse" }}>
                <tbody>
                  <tr>
                    <td style={{ width: "65px", textAlign: "center", verticalAlign: "middle", paddingRight: "8px" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/LOGO.png" alt="IAS Logo" style={{ width: "60px", height: "60px", objectFit: "contain" }} />
                    </td>
                    <td style={{ textAlign: "center", verticalAlign: "middle" }}>
                      <div style={{ fontSize: "18px", fontWeight: "bold", color: "#1a1a5e", letterSpacing: "1px" }}>INTERNATIONAL ACCESS SCHOOL</div>
                      <div style={{ fontSize: "8px", color: "#555", marginTop: "2px" }}>Managed by: International Board of Educational Research Trust (IBERT)</div>
                      <div style={{ fontSize: "8px", color: "#555" }}>Affiliated to CBSE(10+2) New Delhi Aff. No.: 330691 | School Code: 65688</div>
                      <div style={{ fontSize: "8px", color: "#555" }}>Siwan, Bihar – 841227  Ph: +91-9934776670, 8406000829/30/33/40</div>
                      <div style={{ fontSize: "8px", color: "#555" }}>Email: info@iaschool.edu.in | Web: www.iaschool.edu.in</div>
                    </td>
                    <td style={{ width: "65px", textAlign: "right", verticalAlign: "top", fontSize: "7px", color: "#888" }}>
                      <div style={{ border: "1px solid #ccc", padding: "2px 4px", display: "inline-block", marginBottom: "3px" }}>ISO 9001·2005</div><br />
                      <div style={{ border: "1px solid #ccc", padding: "2px 4px", display: "inline-block" }}>CBSE</div>
                    </td>
                  </tr>
                </tbody>
              </table>
              <div style={{ borderBottom: "2px solid #1a1a5e", marginBottom: "6px" }} />

              {/* Book/SL/Adm */}
              <table style={{ width: "100%", marginBottom: "4px", borderCollapse: "collapse" }}>
                <tbody>
                  <tr>
                    <td style={{ fontSize: "10px" }}>Book No. <b>{tcData.bookNo}</b> &nbsp; Sl. No. <b>{tcData.slNo}</b></td>
                    <td style={{ fontSize: "10px", textAlign: "right" }}>Admission No.: {udiseSchool} – <b>{student.admissionNumber}</b></td>
                  </tr>
                  <tr><td colSpan={2} style={{ fontSize: "10px", fontWeight: "bold", textAlign: "right" }}>UDISE – {udiseSchool} – {UDISE_CODES[udiseSchool]}</td></tr>
                </tbody>
              </table>

              {/* Title */}
              <div style={{ textAlign: "center", fontSize: "14px", fontWeight: "bold", letterSpacing: "3px", textDecoration: "underline", color: "#1a1a5e", margin: "8px 0" }}>
                TRANSFER CERTIFICATE
              </div>

              {/* Rows */}
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  {[
                    ["1.", "Name of the Student", tcData.studentName, ""],
                    ["1a.", "Permanent Education Number (PEN)", tcData.pen || "—", ""],
                    ["2.", "Mother's Name :-", tcData.motherName, ""],
                    ["3.", "Father's / Guardian's Name :-", tcData.fatherName, ""],
                    ["4.", "Date of Birth (In figures)", tcData.dobFigures, `(in words) ${tcData.dobWords}`],
                    ["5.", "Proof for Date of Birth", tcData.proofDob, ""],
                    ["6.", "Nationality :-", tcData.nationality, ""],
                    ["7.", "Category (SC/ST/OBC) :-", tcData.category, ""],
                    ["8.", "Date of first admission + class:", `${tcData.admissionDate}  ${tcData.classAtAdmission ? "Class: " + tcData.classAtAdmission : ""}`, ""],
                    ["9.", "Last class studied (Figures)", tcData.lastClassFigures, tcData.lastClassWords],
                    ["10.", "Board Exam last taken:", tcData.board, ""],
                    ["11.", "Whether failed:", tcData.failed, ""],
                    ["12.", "Subjects Studied:", tcData.subjects, ""],
                    ["13.", "Qualified for promotion:", tcData.qualified, tcData.ifSoClass ? `If so ${tcData.ifSoClass} ${tcData.qualifiedClass}` : ""],
                    ["14.", "Total Working Days:", tcData.workingDays, ""],
                    ["15.", "Total Present Days:", tcData.presentDays, ""],
                    ["16.", "Fee due up to month:", tcData.feeDueMonth, ""],
                    ["17.", "Fee Concession:", tcData.feeConcession, ""],
                    ["18.", "NCC / Scout / Guide:", tcData.ncc, ""],
                    ["19.", "Govt/Minority:", tcData.govtMinority, ""],
                    ["20.", "Sports / Extracurricular:", tcData.sports, ""],
                    ["21.", "Application date:", tcData.applicationDate, ""],
                    ["22.", "Struck from rolls:", tcData.rollsDate, ""],
                    ["23.", "Issue date:", tcData.issueDate, ""],
                    ["24.", "Any other remark:", tcData.remarks || "NO", ""],
                  ].map(([sno, label, val, extra], i) => (
                    <tr key={i} style={{ backgroundColor: i % 2 === 0 ? "#f5f5ff" : "#fff" }}>
                      <td style={{ padding: "3px 4px", verticalAlign: "top", fontWeight: "bold", fontSize: "10px", whiteSpace: "nowrap" }}>{sno}</td>
                      <td style={{ padding: "3px 4px", verticalAlign: "top", fontSize: "10px", width: "52%" }}>{label}</td>
                      <td style={{ padding: "3px 4px", textAlign: "center", fontSize: "10px" }}>:</td>
                      <td style={{ padding: "3px 4px", verticalAlign: "top", fontSize: "10px", fontWeight: "bold" }}>
                        {val}
                        {extra && <div style={{ fontWeight: "normal", fontSize: "9px", marginTop: "2px" }}>{extra}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <p style={{ fontSize: "8.5px", marginTop: "8px", lineHeight: "1.5", fontStyle: "italic" }}>
                I declare that the above information including Name of the Candidate, Father's Name, Mother's Name and Date of Birth furnished above is correct as per school records.
              </p>

              {/* Signatures */}
              <table style={{ width: "100%", marginTop: "28px", borderCollapse: "collapse" }}>
                <tbody>
                  <tr>
                    {["Sign. of Class Teacher", "Checked by", "Principal / International Access School (Siwan)"].map((s, i) => (
                      <td key={i} style={{ textAlign: "center" }}>
                        <div style={{ borderTop: "1px solid #000", width: i === 2 ? "160px" : "120px", margin: "0 auto", paddingTop: "3px", fontSize: "9px" }}>{s}</div>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        !isSearching && (
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <Printer className="w-8 h-8 text-slate-300" />
            </div>
            <h3 className="font-bold text-slate-500 mb-1">Search for a Student</h3>
            <p className="text-slate-400 text-sm max-w-sm mx-auto">
              Enter ENR above to auto-fill the TC. Customize fields, then click Print.
            </p>
          </div>
        )
      )}
    </div>
  );
}
