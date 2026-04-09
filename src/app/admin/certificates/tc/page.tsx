"use client";

import { useState, useRef } from "react";
import { collectionGroup, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Search, Printer, Loader2, UserCircle2, Edit3, RotateCcw } from "lucide-react";
import toast from "react-hot-toast";

// ─── Number to words (Indian system) ───────────────────────────────────────
const ones = ["", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE",
  "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN",
  "SEVENTEEN", "EIGHTEEN", "NINETEEN"];
const tens = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];

function numToWords(n: number): string {
  if (n === 0) return "ZERO";
  if (n < 20) return ones[n];
  if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
  if (n < 1000) return ones[Math.floor(n / 100)] + " HUNDRED" + (n % 100 ? " " + numToWords(n % 100) : "");
  return numToWords(Math.floor(n / 1000)) + " THOUSAND" + (n % 1000 ? " " + numToWords(n % 1000) : "");
}

function dateToWords(dateStr: string): string {
  if (!dateStr) return "";
  // Accept DD-MM-YYYY or YYYY-MM-DD
  let d: Date | null = null;
  if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
    const [dd, mm, yyyy] = dateStr.split("-");
    d = new Date(`${yyyy}-${mm}-${dd}`);
  } else {
    d = new Date(dateStr);
  }
  if (isNaN(d.getTime())) return dateStr;
  const months = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
    "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
  const day = d.getDate();
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `${numToWords(day)} ${month} ${numToWords(year)}`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
    const [dd, mm, yyyy] = dateStr.split("-");
    return `${dd}-${mm}-${yyyy}`;
  }
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
  religion?: string;
  udise?: string;
  tcNumber?: string;
  serialNumber?: string;
  economicallyWeakSection?: string;
  freeScheme?: string;
  cbseEnrolmentNo?: string;
  previousBoard?: string;
  nccCadet?: string;
  govtMinority?: string;
  sports?: string;
  applicationDate?: string;
  rollsDate?: string;
  issueDate?: string;
  [key: string]: any;
}

interface TCData {
  bookNo: string;
  slNo: string;
  udise: string;
  studentName: string;
  motherName: string;
  fatherName: string;
  dobFigures: string;
  dobWords: string;
  proofDob: string;
  nationality: string;
  category: string;
  classAtAdmission: string;
  admissionDate: string;
  lastClassFigures: string;
  lastClassWords: string;
  board: string;
  failed: string;
  subjects: string;
  qualified: string;
  ifSoClass: string;
  qualifiedClass: string;
  workingDays: string;
  presentDays: string;
  feeDueMonth: string;
  feeConcession: string;
  ncc: string;
  govtMinority: string;
  sports: string;
  applicationDate: string;
  rollsDate: string;
  issueDate: string;
  remarks: string;
}

const defaultTC = (): TCData => ({
  bookNo: "06",
  slNo: "",
  udise: "",
  studentName: "",
  motherName: "",
  fatherName: "",
  dobFigures: "",
  dobWords: "",
  proofDob: "AADHAAR",
  nationality: "INDIAN",
  category: "NO",
  classAtAdmission: "",
  admissionDate: "",
  lastClassFigures: "",
  lastClassWords: "",
  board: "AISSE - 2024 (QUALIFIED)",
  failed: "NO",
  subjects: "English, Hindi, Mathematics, Urdu, Science, Social Science, GK & Computer",
  qualified: "YES",
  ifSoClass: "",
  qualifiedClass: "",
  workingDays: "207",
  presentDays: "195",
  feeDueMonth: "MARCH - 2023",
  feeConcession: "NO",
  ncc: "YES",
  govtMinority: "NO",
  sports: "NO",
  applicationDate: "",
  rollsDate: "",
  issueDate: "",
  remarks: "",
});

export default function TransferCertificatePage() {
  const [enr, setEnr] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [student, setStudent] = useState<Student | null>(null);
  const [tcData, setTcData] = useState<TCData>(defaultTC());
  const [notFound, setNotFound] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const handleSearch = async () => {
    const trimmed = enr.trim();
    if (!trimmed) { toast.error("Please enter an Admission Number"); return; }
    setIsSearching(true);
    setNotFound(false);
    setStudent(null);
    try {
      const snap = await getDocs(collectionGroup(db, "profiles"));
      const found = snap.docs.find(d => safeStr(d.data().admissionNumber) === trimmed);
      if (!found) { setNotFound(true); return; }
      const s = { id: found.id, ...found.data() } as Student;
      setStudent(s);

      // Auto-fill TC data from student profile
      const today = new Date().toISOString().slice(0, 10);
      const lastCls = safeStr(s.lastClass || s.currentClass);
      const lastClsWords = lastCls ? numToWords(parseInt(lastCls) || 0) : "";

      setTcData({
        bookNo: "06",
        slNo: safeStr(s.serialNumber),
        udise: safeStr(s.udise),
        studentName: `${safeStr(s.firstName)} ${safeStr(s.lastName)}`.trim().toUpperCase(),
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
        lastClassWords: lastClsWords ? `(in words) ${lastClsWords}` : "",
        board: safeStr(s.previousBoard) || "AISSE - 2024 (QUALIFIED)",
        failed: "NO",
        subjects: "English, Hindi, Mathematics, Urdu, Science, Social Science, GK & Computer",
        qualified: "YES",
        ifSoClass: lastCls ? `STD - ${lastCls}` : "",
        qualifiedClass: lastClsWords ? `(in words) ${lastClsWords}` : "",
        workingDays: "207",
        presentDays: "195",
        feeDueMonth: "MARCH - " + new Date().getFullYear(),
        feeConcession: safeStr(s.freeScheme) === "Y" ? "YES" : "NO",
        ncc: safeStr(s.nccCadet) || "YES",
        govtMinority: safeStr(s.govtMinority) || "NO",
        sports: safeStr(s.sports) || "NO",
        applicationDate: formatDate(safeStr(s.applicationDate || today)),
        rollsDate: formatDate(safeStr(s.lastDate || today)),
        issueDate: formatDate(today),
        remarks: "",
      });

      toast.success("Student found! Review the details below.");
    } catch (err: any) {
      toast.error("Error fetching student: " + err.message);
    } finally {
      setIsSearching(false);
    }
  };

  const handlePrint = () => {
    const content = printRef.current?.innerHTML;
    if (!content) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Transfer Certificate - ${tcData.studentName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Times New Roman', Times, serif; font-size: 12px; color: #000; background: white; }
    @page { size: A4; margin: 10mm 14mm; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    .tc-wrapper { width: 100%; max-width: 180mm; margin: 0 auto; }
    .school-header { text-align: center; border-bottom: 2px solid #1a1a5e; padding-bottom: 8px; margin-bottom: 8px; }
    .school-name { font-size: 20px; font-weight: bold; color: #1a1a5e; letter-spacing: 1px; }
    .school-trust { font-size: 10px; color: #333; }
    .school-affiliation { font-size: 9px; color: #444; margin-top: 2px; }
    .school-address { font-size: 9px; color: #444; }
    .school-contact { font-size: 9px; color: #444; }
    .cert-title { text-align: center; font-size: 16px; font-weight: bold; letter-spacing: 2px; margin: 10px 0 6px; text-decoration: underline; color: #1a1a5e; }
    .meta-row { display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 6px; }
    .meta-item { }
    .udise-row { text-align: right; font-size: 10px; margin-bottom: 8px; font-weight: bold; }
    .tc-table { width: 100%; border-collapse: collapse; }
    .tc-table td { padding: 4px 6px; vertical-align: top; font-size: 11px; line-height: 1.5; }
    .tc-table .sno { font-weight: bold; width: 28px; }
    .tc-table .label { width: 55%; }
    .tc-table .colon { width: 10px; text-align: center; }
    .tc-table .value { font-weight: bold; }
    .tc-table tr:nth-child(odd) td { background: #f9f9ff; }
    .footer-row { display: flex; justify-content: space-between; margin-top: 18px; font-size: 10px; }
    .footer-sig { text-align: center; }
    .sig-line { border-top: 1px solid #000; margin-top: 30px; padding-top: 3px; width: 120px; text-align: center; font-size: 9px; }
    .watermark { position: fixed; bottom: 12mm; right: 14mm; font-size: 8px; color: #aaa; }
    .iso-badge { font-size: 8px; color: #666; border: 1px solid #aaa; padding: 1px 4px; display: inline-block; margin-top: 2px; }
  </style>
</head>
<body>
${content}
</body>
</html>`);
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); }, 400);
  };

  const f = (key: keyof TCData, label: string, multiline?: boolean) => (
    <div className="mb-1">
      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-0.5">{label}</label>
      {multiline ? (
        <textarea
          value={tcData[key]}
          onChange={e => setTcData(p => ({ ...p, [key]: e.target.value }))}
          rows={2}
          className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-medium focus:outline-none focus:border-navy focus:ring-1 focus:ring-navy/20 resize-none"
        />
      ) : (
        <input
          value={tcData[key]}
          onChange={e => setTcData(p => ({ ...p, [key]: e.target.value }))}
          className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-medium focus:outline-none focus:border-navy focus:ring-1 focus:ring-navy/20"
        />
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl gradient-navy p-6 md:p-8 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.2) 0%, transparent 50%)` }} />
        <div className="relative z-10">
          <p className="text-white/50 text-sm font-medium">Admin Console</p>
          <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">Transfer Certificate</h1>
          <p className="text-white/50 text-sm mt-1">Search by Admission Number (ENR) · Customize · Print</p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-5">
        <div className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1">
            <label className="text-xs font-bold text-slate-600 mb-1.5 block">Admission Number (ENR)</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={enr}
                onChange={e => setEnr(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSearch()}
                placeholder="e.g. IAS-12662 or 12662"
                className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
              />
            </div>
          </div>
          <button
            onClick={handleSearch}
            disabled={isSearching}
            className="flex items-center gap-2 px-5 py-2.5 bg-navy text-white rounded-xl font-bold text-sm hover:bg-navy/90 transition-colors disabled:opacity-60 shadow-md shadow-navy/20"
          >
            {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {isSearching ? "Searching..." : "Search Student"}
          </button>
          {student && (
            <button
              onClick={() => { setStudent(null); setEnr(""); setTcData(defaultTC()); setNotFound(false); }}
              className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-semibold text-sm hover:bg-slate-50 transition-colors"
            >
              <RotateCcw className="w-4 h-4" /> Reset
            </button>
          )}
        </div>

        {notFound && (
          <div className="mt-4 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm font-medium flex items-center gap-2">
            <UserCircle2 className="w-5 h-5" />
            No student found with admission number <strong>{enr}</strong>. Please check and try again.
          </div>
        )}

        {student && (
          <div className="mt-4 p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-200 flex items-center justify-center text-emerald-800 font-bold text-sm">
              {(tcData.studentName || "S").charAt(0)}
            </div>
            <div>
              <p className="font-bold text-emerald-900">{tcData.studentName}</p>
              <p className="text-sm text-emerald-700">ENR: {student.admissionNumber} · Class: {safeStr(student.lastClass || student.currentClass)} · Adm: {tcData.admissionDate}</p>
            </div>
          </div>
        )}
      </div>

      {student && (
        <div className="grid xl:grid-cols-5 gap-6">
          {/* ── Edit Form ── */}
          <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-200/60 shadow-sm p-5 space-y-3">
            <div className="flex items-center gap-2 mb-3">
              <Edit3 className="w-4 h-4 text-navy" />
              <h2 className="font-bold text-navy text-sm">Customize TC Fields</h2>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {f("bookNo", "Book No.")}
              {f("slNo", "Sl. No.")}
            </div>
            {f("udise", "UDISE No.")}
            {f("studentName", "Student Name")}
            {f("motherName", "Mother's Name")}
            {f("fatherName", "Father's / Guardian's Name")}
            <div className="grid grid-cols-2 gap-2">
              {f("dobFigures", "DOB (Figures)")}
            </div>
            {f("dobWords", "DOB (Words)")}
            {f("proofDob", "Proof for DOB")}
            {f("nationality", "Nationality")}
            {f("category", "Category (SC/ST/OBC)")}
            {f("classAtAdmission", "Class at Admission")}
            {f("admissionDate", "Date of Admission")}
            {f("lastClassFigures", "Last Class (Figures)")}
            {f("lastClassWords", "Last Class (Words)")}
            {f("board", "Board Exam Result")}
            {f("failed", "Failed? (YES/NO)")}
            {f("subjects", "Subjects Studied", true)}
            {f("qualified", "Qualified for Promotion?")}
            {f("ifSoClass", "If So, Class (Figures)")}
            {f("qualifiedClass", "Qualified Class (Words)")}
            <div className="grid grid-cols-2 gap-2">
              {f("workingDays", "Working Days")}
              {f("presentDays", "Present Days")}
            </div>
            {f("feeDueMonth", "Fee Due Up to Month")}
            {f("feeConcession", "Fee Concession?")}
            {f("ncc", "NCC Cadet?")}
            {f("govtMinority", "Govt/Minority?")}
            {f("sports", "Sports/Extracurricular")}
            {f("applicationDate", "Date of Application")}
            {f("rollsDate", "Date Struck from Rolls")}
            {f("issueDate", "Date of Issue")}
            {f("remarks", "Remarks")}

            <button
              onClick={handlePrint}
              className="w-full mt-4 flex items-center justify-center gap-2 px-5 py-3 bg-navy text-white rounded-xl font-bold text-sm hover:bg-navy/90 transition-colors shadow-md shadow-navy/20"
            >
              <Printer className="w-4 h-4" /> Print Transfer Certificate
            </button>
          </div>

          {/* ── Preview ── */}
          <div className="xl:col-span-3">
            <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-4 mb-3 flex items-center justify-between">
              <h2 className="font-bold text-navy text-sm flex items-center gap-2"><Printer className="w-4 h-4" /> Print Preview</h2>
              <button
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-4 py-2 bg-navy text-white rounded-xl font-bold text-xs hover:bg-navy/90 transition-colors"
              >
                <Printer className="w-3.5 h-3.5" /> Print
              </button>
            </div>

            {/* TC Document Preview */}
            <div
              ref={printRef}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
              style={{ fontFamily: "'Times New Roman', Times, serif" }}
            >
              <div className="tc-wrapper p-8 max-w-[680px] mx-auto text-[11px] leading-relaxed" style={{ minHeight: "297mm" }}>

                {/* School Header */}
                <div className="text-center border-b-2 border-[#1a1a5e] pb-3 mb-3">
                  <div className="flex items-start justify-between text-[9px] text-gray-500 mb-1">
                    <span className="border border-gray-400 px-1.5 py-0.5">ISO 9001 · 2005 Certified</span>
                    <span className="border border-gray-400 px-1.5 py-0.5">CBSE</span>
                  </div>
                  <div className="text-[20px] font-bold text-[#1a1a5e] tracking-wide">INTERNATIONAL ACCESS SCHOOL</div>
                  <div className="text-[9px] text-gray-600 mt-0.5">Managed by: International Board of Educational Research Trust (IBERT)</div>
                  <div className="text-[9px] text-gray-600">
                    Affiliated to CBSE(II) New Delhi Aff. No.: 330691 &nbsp;|&nbsp; School Code: 65688
                  </div>
                  <div className="text-[9px] text-gray-600">
                    Siwan, Bihar – 841227 Ph : +919934776670, 8406000829/30/31/40
                  </div>
                  <div className="text-[9px] text-gray-600">
                    Email : info@aschool.edu.in &nbsp;|&nbsp; http://www.iaschool.edu.in
                  </div>
                </div>

                {/* Book/SL/UDISE row */}
                <div className="flex justify-between text-[10px] mb-1">
                  <span>Book No. {tcData.bookNo} &nbsp;&nbsp; Sl. No. {tcData.slNo}</span>
                  <span className="font-bold">Admission No.: IAS – {student.admissionNumber}</span>
                </div>
                {tcData.udise && (
                  <div className="text-right text-[10px] font-bold mb-1">
                    UDISE No. {tcData.udise}
                  </div>
                )}

                {/* Title */}
                <div className="text-center text-[15px] font-bold tracking-widest underline text-[#1a1a5e] my-3">
                  TRANSFER CERTIFICATE
                </div>

                {/* TC Fields Table */}
                <table className="w-full text-[11px]" style={{ borderCollapse: "collapse" }}>
                  <tbody>
                    {[
                      ["1.", "Name of the Student", tcData.studentName],
                      ["2.", "Mother's Name :-", tcData.motherName],
                      ["3.", "Father's / Guardian's Name :-", tcData.fatherName],
                      ["4.", "Date of Birth (in Christian era) according to Admission & Withdrawal Register. (In figures)", tcData.dobFigures, `(in words) ${tcData.dobWords}`],
                      ["5.", "Proof for Date of Birth submitted at the time of admission", tcData.proofDob],
                      ["6.", "Nationality :-", tcData.nationality],
                      ["7.", "Whether the candidate belongs to Schedule Caste or Schedule Tribe or OBC :-", tcData.category],
                      ["8.", "Date of first admission in the school with class:", tcData.admissionDate, tcData.classAtAdmission ? `Class: ${tcData.classAtAdmission}` : ""],
                      ["9.", "Class in which the pupil last studied (In figures)", tcData.lastClassFigures, tcData.lastClassWords],
                      ["10.", "School/Board Annual Examination last taken with result;", tcData.board],
                      ["11.", "Whether failed, if so once/twice in the same class;", tcData.failed],
                      ["12.", "Subject Studied:", tcData.subjects],
                      ["13.", "Whether qualified for promotion to the higher class:", tcData.qualified, tcData.ifSoClass ? `If so, to which class (in fig) ${tcData.ifSoClass} ${tcData.qualifiedClass}` : ""],
                      ["14.", "Total No. of working days in the academic session:", tcData.workingDays],
                      ["15.", "Total No. of presence in the academic session:", tcData.presentDays],
                      ["16.", "Month up to which the people has paid school dues.", tcData.feeDueMonth],
                      ["17.", "Any fee concession availed of, if so, the nature of such concession", tcData.feeConcession],
                      ["18.", "Whether NCC Cadet/Boy Scout/Girl Guide (details may be given)", tcData.ncc],
                      ["19.", "Whether school is under Govt./Minority/Independent Category", tcData.govtMinority],
                      ["20.", "Games played on extracurricular activities in which the pupil usually took part (mention achievement level therein)", tcData.sports],
                      ["21.", "Date of application for certificate:", tcData.applicationDate],
                      ["22.", "Date on which pupils name was struck off the rolls of the school:", tcData.rollsDate],
                      ["23.", "Date of issue of certificate:", tcData.issueDate],
                      ["24.", "Any other remark.", tcData.remarks || "NO"],
                    ].map(([sno, label, val, extra], i) => (
                      <tr key={i} style={{ backgroundColor: i % 2 === 0 ? "#f9f9ff" : "#fff" }}>
                        <td style={{ padding: "3px 4px", verticalAlign: "top", fontWeight: "bold", width: "24px", whiteSpace: "nowrap" }}>{sno}</td>
                        <td style={{ padding: "3px 4px", verticalAlign: "top", width: "55%" }}>{label}</td>
                        <td style={{ padding: "3px 4px", verticalAlign: "top", textAlign: "center", width: "8px" }}>:</td>
                        <td style={{ padding: "3px 4px", verticalAlign: "top", fontWeight: "bold" }}>
                          {val}
                          {extra && <div className="font-normal text-[10px] mt-0.5">{extra}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Declaration */}
                <p className="text-[9.5px] mt-4 leading-snug text-gray-700 italic">
                  I declare that the above information including Name of the Candidate, Father's Name, Mother's Name and
                  Date of Birth furnished above is correct as per school records.
                </p>

                {/* Signatures */}
                <div className="flex justify-between items-end mt-8 text-[10px]">
                  <div className="text-center">
                    <div style={{ borderTop: "1px solid black", width: "120px", paddingTop: "3px" }}>Sign. of Class Teacher</div>
                  </div>
                  <div className="text-center">
                    <div style={{ borderTop: "1px solid black", width: "120px", paddingTop: "3px" }}>Checked by</div>
                  </div>
                  <div className="text-center">
                    <div style={{ borderTop: "1px solid black", width: "160px", paddingTop: "3px" }} className="font-bold">
                      Principal<br />
                      <span className="font-normal text-[9px]">International Access School Harhan (Siwan)</span>
                    </div>
                  </div>
                </div>

                {/* Page number */}
                <div className="text-center text-[10px] mt-6 text-gray-400">{tcData.slNo}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {!student && !isSearching && (
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <Printer className="w-8 h-8 text-slate-300" />
          </div>
          <h3 className="font-bold text-slate-500 mb-1">Search for a Student</h3>
          <p className="text-slate-400 text-sm max-w-sm mx-auto">
            Enter the student's Admission Number (ENR) above to auto-fill the Transfer Certificate. You can customize all fields before printing.
          </p>
        </div>
      )}
    </div>
  );
}
