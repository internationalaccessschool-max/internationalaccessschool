"use client";

import { useState } from "react";
import { collectionGroup, getDocs, doc, getDoc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Search, Printer, Loader2, UserCircle2, Edit3, RotateCcw, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";

function safeStr(v: any): string {
  if (v == null) return "";
  return String(v).trim();
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

function toTitleCase(str: string) {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

interface Student {
  id: string;
  admissionNumber: string;
  firstName?: string;
  lastName?: string;
  fatherName?: string;
  motherName?: string;
  guardianName?: string;
  currentClass?: string | number;
  section?: string;
  gender?: string;
  dob?: string;
  dateOfAdmission?: string;
  serialNumber?: string;
  session?: string;
  [key: string]: any;
}

interface CCData {
  certNo: string;
  studentName: string;
  fatherName: string;
  motherName: string;
  classField: string;
  section: string;
  admissionNo: string;
  session: string;
  dob: string;
  gender: string;
  conduct: string;
  behaviour: string;
  purpose: string;
  issueDate: string;
  classTeacher: string;
  principalName: string;
}

const defaultCC = (): CCData => ({
  certNo: "",
  studentName: "",
  fatherName: "",
  motherName: "",
  classField: "",
  section: "",
  admissionNo: "",
  session: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
  dob: "",
  gender: "Male",
  conduct: "Good",
  behaviour: "satisfactory and disciplined",
  purpose: "further studies",
  issueDate: new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }),
  classTeacher: "",
  principalName: "Principal",
});

// ─── Build fully self-contained print HTML ────────────────────────────────────

function buildCCHtml(cc: CCData, logoUrl: string): string {
  const pronoun = cc.gender.toLowerCase().startsWith("f") ? "she" : "he";
  const pronounCap = pronoun.charAt(0).toUpperCase() + pronoun.slice(1);
  const possessive = cc.gender.toLowerCase().startsWith("f") ? "her" : "his";
  const relation = cc.gender.toLowerCase().startsWith("f") ? "daughter" : "son";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Character Certificate – ${cc.studentName}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:"Times New Roman",Times,serif;background:#fff;color:#000}
    @page{size:A4 portrait;margin:15mm 18mm}
    @media print{
      body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    }
    .page{width:100%;max-width:178mm;margin:0 auto}
    table{border-collapse:collapse;width:100%}
    .outer-border{border:6px double #1a1a5e;padding:24px;min-height:240mm}
  </style>
</head>
<body>
<div class="page">
<div class="outer-border">

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
        <div style="font-size:9px;color:#444">Barhan, Siwan, Bihar – 841227 &nbsp;&nbsp;Ph: +91-9934776670</div>
        <div style="font-size:9px;color:#444">Email: info@iaschool.edu.in &nbsp;|&nbsp; Web: www.iaschool.edu.in</div>
      </td>
      <td style="width:70px;text-align:right;vertical-align:top;font-size:8px;color:#666">
        <div style="border:1px solid #aaa;padding:2px 5px;display:inline-block;margin-bottom:3px">ISO 9001·2005</div><br/>
        <div style="border:1px solid #aaa;padding:2px 5px;display:inline-block">CBSE</div>
      </td>
    </tr>
  </table>

  <div style="border-top:2px solid #1a1a5e;margin-bottom:12px"></div>

  <!-- Certificate Title -->
  <div style="text-align:center;font-size:17px;font-weight:bold;letter-spacing:3px;text-decoration:underline;color:#1a1a5e;margin-bottom:16px">
    CHARACTER CERTIFICATE
  </div>

  <!-- Cert No & Date -->
  <table style="width:100%;margin-bottom:20px">
    <tr>
      <td style="font-size:11px">Cert. No.: <b>${cc.certNo || "______"}</b></td>
      <td style="font-size:11px;text-align:right">Date: <b>${cc.issueDate}</b></td>
    </tr>
  </table>

  <!-- Body Text -->
  <div style="font-size:13px;line-height:2.0;text-align:justify">
    <p style="margin-bottom:16px">
      This is to certify that <b><u>${cc.studentName || "_______________"}</u></b> ${relation} of&nbsp;
      <b>${cc.fatherName || "_______________"}</b> and&nbsp;
      <b>${cc.motherName || "_______________"}</b> bearing
      Admission No. <b>${cc.admissionNo}</b> is / was a bonafide student of this school in
      <b>Class ${cc.classField}${cc.section ? ` &ldquo;${cc.section}&rdquo;` : ""}</b> during the session
      <b>${cc.session}</b>.
    </p>

    <p style="margin-bottom:16px">
      ${pronounCap} was born on <b>${cc.dob || "_______________"}</b> as per the school records.
    </p>

    <p style="margin-bottom:16px">
      During ${possessive} stay in this school, ${pronoun} has shown <b>${cc.conduct}</b> conduct and
      ${possessive} behaviour has been <b>${cc.behaviour}</b>.
      ${pronounCap} has never been involved in any indiscipline or misconduct.
    </p>

    <p style="margin-bottom:16px">
      This certificate is being issued to ${pronoun} on ${possessive} request for the purpose of
      <b>${cc.purpose}</b>.
    </p>

    <p>We wish ${pronoun} all the best for ${possessive} future endeavours.</p>
  </div>

  <!-- Signatures -->
  <table style="width:100%;margin-top:64px">
    <tr>
      <td style="text-align:center;width:50%">
        <div style="border-top:1px solid #000;width:150px;margin:0 auto;padding-top:5px;font-size:11px">
          ${cc.classTeacher || "Class Teacher"}
        </div>
      </td>
      <td style="text-align:center;width:50%">
        <div style="border-top:1px solid #000;width:170px;margin:0 auto;padding-top:5px;font-size:11px;font-weight:bold">
          ${cc.principalName}<br/>
          <span style="font-weight:normal;font-size:9.5px">International Access School</span><br/>
          <span style="font-weight:normal;font-size:9.5px">Barhan, Siwan, Bihar</span>
        </div>
      </td>
    </tr>
  </table>

  <!-- Stamp area -->
  <div style="text-align:center;margin-top:28px;font-size:9px;color:#bbb">[ School Seal / Stamp ]</div>

</div>
</div>
</body>
</html>`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CharacterCertificatePage() {
  const [enr, setEnr] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [student, setStudent] = useState<Student | null>(null);
  const [ccData, setCcData] = useState<CCData>(defaultCC());
  const [notFound, setNotFound] = useState(false);
  const [alreadyGenerated, setAlreadyGenerated] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string>("");

  const handleSearch = async () => {
    const trimmed = enr.trim();
    if (!trimmed) { toast.error("Enter an Admission Number"); return; }
    setIsSearching(true); setNotFound(false); setStudent(null); setAlreadyGenerated(false); setGeneratedAt("");
    try {
      const snap = await getDocs(collectionGroup(db, "profiles"));
      const found = snap.docs.find(d => safeStr(d.data().admissionNumber) === trimmed);
      if (!found) { setNotFound(true); return; }
      const s = { id: found.id, ...found.data() } as Student;
      setStudent(s);

      // Check if CC already generated
      const docKey = trimmed.replace(/\//g, "_");
      const existingSnap = await getDoc(doc(db, "generatedCC", docKey));
      if (existingSnap.exists()) {
        const saved = existingSnap.data();
        setCcData(saved.ccData as CCData);
        const at = saved.generatedAt?.toDate?.()?.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) || "";
        setGeneratedAt(at);
        setAlreadyGenerated(true);
        toast("Certificate already generated — showing saved copy.", { icon: "📋" });
        return;
      }
      const currentYear = new Date().getFullYear();
      const fullName = `${safeStr(s.firstName)} ${safeStr(s.lastName)}`.trim();
      const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });

      setCcData({
        certNo: safeStr(s.serialNumber),
        studentName: toTitleCase(fullName),
        fatherName: toTitleCase(safeStr(s.fatherName || s.guardianName)),
        motherName: toTitleCase(safeStr(s.motherName)),
        classField: safeStr(s.currentClass),
        section: safeStr(s.section),
        admissionNo: safeStr(s.admissionNumber),
        session: safeStr(s.session) || `${currentYear}-${currentYear + 1}`,
        dob: formatDate(safeStr(s.dob)),
        gender: safeStr(s.gender) || "Male",
        conduct: "Good",
        behaviour: "satisfactory and disciplined",
        purpose: "further studies",
        issueDate: today,
        classTeacher: "",
        principalName: "Principal",
      });

      toast.success("Student found! Customize fields then print.");
    } catch (err: any) {
      toast.error("Error: " + err.message);
    } finally {
      setIsSearching(false);
    }
  };

  const handlePrint = async () => {
    if (!student) return;
    const logoUrl = `${window.location.origin}/LOGO.png`;
    const html = buildCCHtml(ccData, logoUrl);
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) { toast.error("Pop-up blocked — please allow pop-ups."); return; }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.onload = () => { win.focus(); win.print(); };
    setTimeout(() => { try { win.focus(); win.print(); } catch { /* already printed */ } }, 1200);

    // Save to Firestore on first print
    if (!alreadyGenerated) {
      try {
        const docKey = student.admissionNumber.replace(/\//g, "_");
        await setDoc(doc(db, "generatedCC", docKey), {
          ccData,
          studentName: ccData.studentName,
          admissionNumber: student.admissionNumber,
          generatedAt: serverTimestamp(),
        });
        setAlreadyGenerated(true);
        setGeneratedAt(new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }));
      } catch { /* silent — print still works */ }
    }
  };

  const handleIssueNew = async () => {
    if (!student) return;
    if (!confirm("Issue a new Character Certificate for this student? The previous record will be removed.")) return;
    try {
      const docKey = student.admissionNumber.replace(/\//g, "_");
      await deleteDoc(doc(db, "generatedCC", docKey));
      setAlreadyGenerated(false);
      setGeneratedAt("");
      toast.success("Previous certificate cleared. You can now edit and print a new one.");
    } catch {
      toast.error("Failed to clear. Try again.");
    }
  };

  const field = (key: keyof CCData, label: string, multiline?: boolean) => (
    <div className="mb-1.5">
      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-0.5">{label}</label>
      {multiline ? (
        <textarea value={ccData[key]} onChange={e => !alreadyGenerated && setCcData(p => ({ ...p, [key]: e.target.value }))}
          readOnly={alreadyGenerated} rows={2}
          className={`w-full border rounded-lg px-2 py-1.5 text-xs font-medium focus:outline-none resize-none ${alreadyGenerated ? "bg-slate-50 border-slate-100 text-slate-500 cursor-not-allowed" : "border-slate-200 focus:border-navy focus:ring-1 focus:ring-navy/20"}`} />
      ) : (
        <input value={ccData[key]} onChange={e => !alreadyGenerated && setCcData(p => ({ ...p, [key]: e.target.value }))}
          readOnly={alreadyGenerated}
          className={`w-full border rounded-lg px-2 py-1.5 text-xs font-medium focus:outline-none ${alreadyGenerated ? "bg-slate-50 border-slate-100 text-slate-500 cursor-not-allowed" : "border-slate-200 focus:border-navy focus:ring-1 focus:ring-navy/20"}`} />
      )}
    </div>
  );

  // Live text preview helpers
  const pronoun = ccData.gender?.toLowerCase().startsWith("f") ? "she" : "he";
  const pronounCap = pronoun.charAt(0).toUpperCase() + pronoun.slice(1);
  const possessive = ccData.gender?.toLowerCase().startsWith("f") ? "her" : "his";
  const relation = ccData.gender?.toLowerCase().startsWith("f") ? "daughter" : "son";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl gradient-navy p-6 md:p-8 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.2) 0%, transparent 50%)` }} />
        <div className="relative z-10">
          <p className="text-white/50 text-sm font-medium">Admin Console</p>
          <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">Character Certificate</h1>
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
            <button onClick={() => { setStudent(null); setEnr(""); setCcData(defaultCC()); setNotFound(false); setAlreadyGenerated(false); setGeneratedAt(""); }}
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
              {(ccData.studentName || "S").charAt(0)}
            </div>
            <div>
              <p className="font-bold text-emerald-900">{ccData.studentName}</p>
              <p className="text-sm text-emerald-700">ENR: {student.admissionNumber} · Class: {ccData.classField} {ccData.section}</p>
            </div>
          </div>
        )}
      </div>

      {/* Already Generated Banner */}
      {student && alreadyGenerated && (
        <div className="flex items-center justify-between gap-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <p className="font-bold text-amber-800 text-sm">Certificate Already Generated</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Previously issued{generatedAt ? ` on ${generatedAt}` : ""}. Showing saved copy — you can only print it.
              </p>
            </div>
          </div>
          <button onClick={handleIssueNew}
            className="shrink-0 px-3 py-1.5 border border-amber-300 text-amber-700 text-xs font-semibold rounded-lg hover:bg-amber-100 transition-colors whitespace-nowrap">
            Issue New Certificate
          </button>
        </div>
      )}

      {student ? (
        <div className="grid xl:grid-cols-5 gap-6">
          {/* Edit Form */}
          <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-200/60 shadow-sm p-5 space-y-1">
            <div className="flex items-center gap-2 mb-3">
              <Edit3 className="w-4 h-4 text-navy" />
              <h2 className="font-bold text-navy text-sm">{alreadyGenerated ? "Certificate Fields (Read-only)" : "Customize Certificate Fields"}</h2>
            </div>
            {alreadyGenerated && (
              <div className="mb-3 p-2.5 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-700 font-medium">
                🔒 Fields are locked. Click "Issue New Certificate" above to make changes.
              </div>
            )}
            {field("certNo", "Certificate / Sl. No.")}
            {field("studentName", "Student Full Name")}
            {field("fatherName", "Father's Name")}
            {field("motherName", "Mother's Name")}
            <div className="grid grid-cols-2 gap-2">
              {field("classField", "Class")}
              {field("section", "Section")}
            </div>
            {field("admissionNo", "Admission No.")}
            {field("session", "Academic Session")}
            {field("dob", "Date of Birth")}
            {field("gender", "Gender (Male / Female)")}
            {field("conduct", "Conduct (e.g. Good / Excellent)")}
            {field("behaviour", "Behaviour Description", true)}
            {field("purpose", "Purpose of Certificate")}
            {field("issueDate", "Issue Date")}
            {field("classTeacher", "Class Teacher Name")}
            {field("principalName", "Principal / Signatory")}

            <button onClick={handlePrint}
              className="w-full mt-4 flex items-center justify-center gap-2 px-5 py-3 bg-navy text-white rounded-xl font-bold text-sm hover:bg-navy/90 transition-colors shadow-md shadow-navy/20">
              <Printer className="w-4 h-4" /> Print Character Certificate
            </button>
          </div>

          {/* On-screen Preview */}
          <div className="xl:col-span-3">
            <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-4 mb-3 flex items-center justify-between">
              <h2 className="font-bold text-navy text-sm flex items-center gap-2"><Printer className="w-4 h-4" /> Print Preview</h2>
              <button onClick={handlePrint}
                className="flex items-center gap-1.5 px-4 py-2 bg-navy text-white rounded-xl font-bold text-xs hover:bg-navy/90 transition-colors">
                <Printer className="w-3.5 h-3.5" /> Print
              </button>
            </div>

            {/* Preview — fixed A4 dimensions (210mm × 297mm) */}
            <div className="overflow-auto">
              <div style={{
                fontFamily: "'Times New Roman', Times, serif",
                width: "210mm",
                minHeight: "297mm",
                margin: "0 auto",
                background: "#fff",
                boxShadow: "0 0 12px rgba(0,0,0,0.15)",
                padding: "15mm 18mm",
                boxSizing: "border-box",
              }}>
              <div style={{ border: "6px double #1a1a5e", padding: "24px", minHeight: "240mm" }}>

                {/* Header */}
                <table style={{ width: "100%", marginBottom: "6px", borderCollapse: "collapse" }}>
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
                        <div style={{ fontSize: "8px", color: "#555" }}>Barhan, Siwan, Bihar – 841227  Ph: +91-9934776670</div>
                        <div style={{ fontSize: "8px", color: "#555" }}>Email: info@iaschool.edu.in | Web: www.iaschool.edu.in</div>
                      </td>
                      <td style={{ width: "60px", textAlign: "right", verticalAlign: "top", fontSize: "7px", color: "#888" }}>
                        <div style={{ border: "1px solid #ccc", padding: "2px 4px", display: "inline-block", marginBottom: "3px" }}>ISO 9001·2005</div><br />
                        <div style={{ border: "1px solid #ccc", padding: "2px 4px", display: "inline-block" }}>CBSE</div>
                      </td>
                    </tr>
                  </tbody>
                </table>

                <div style={{ borderTop: "2px solid #1a1a5e", marginBottom: "10px" }} />

                <div style={{ textAlign: "center", fontSize: "15px", fontWeight: "bold", letterSpacing: "3px", textDecoration: "underline", color: "#1a1a5e", marginBottom: "12px" }}>
                  CHARACTER CERTIFICATE
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", marginBottom: "14px" }}>
                  <span>Cert. No.: <b>{ccData.certNo || "______"}</b></span>
                  <span>Date: <b>{ccData.issueDate}</b></span>
                </div>

                <div style={{ fontSize: "12px", lineHeight: "1.9", textAlign: "justify" }}>
                  <p style={{ marginBottom: "12px" }}>
                    This is to certify that <b><u>{ccData.studentName || "_______________"}</u></b> {relation} of{" "}
                    <b>{ccData.fatherName || "_______________"}</b> and <b>{ccData.motherName || "_______________"}</b>{" "}
                    bearing Admission No. <b>{ccData.admissionNo}</b> is / was a bonafide student of this school in{" "}
                    <b>Class {ccData.classField} {ccData.section ? `"${ccData.section}"` : ""}</b> during the session <b>{ccData.session}</b>.
                  </p>
                  <p style={{ marginBottom: "12px" }}>
                    {pronounCap} was born on <b>{ccData.dob || "_______________"}</b> as per the school records.
                  </p>
                  <p style={{ marginBottom: "12px" }}>
                    During {possessive} stay in this school, {pronoun} has shown <b>{ccData.conduct}</b> conduct and {possessive} behaviour
                    has been <b>{ccData.behaviour}</b>. {pronounCap} has never been involved in any indiscipline or misconduct.
                  </p>
                  <p style={{ marginBottom: "12px" }}>
                    This certificate is being issued to {pronoun} on {possessive} request for the purpose of <b>{ccData.purpose}</b>.
                  </p>
                  <p>We wish {pronoun} all the best for {possessive} future endeavours.</p>
                </div>

                {/* Signatures */}
                <table style={{ width: "100%", marginTop: "40px", borderCollapse: "collapse" }}>
                  <tbody>
                    <tr>
                      <td style={{ textAlign: "center" }}>
                        <div style={{ borderTop: "1px solid #000", width: "140px", margin: "0 auto", paddingTop: "4px", fontSize: "10px" }}>
                          {ccData.classTeacher || "Class Teacher"}
                        </div>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <div style={{ borderTop: "1px solid #000", width: "160px", margin: "0 auto", paddingTop: "4px", fontSize: "10px", fontWeight: "bold" }}>
                          {ccData.principalName}<br />
                          <span style={{ fontWeight: "normal", fontSize: "9px" }}>International Access School</span><br />
                          <span style={{ fontWeight: "normal", fontSize: "9px" }}>Barhan, Siwan, Bihar</span>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>

                <div style={{ textAlign: "center", marginTop: "16px", fontSize: "8px", color: "#ccc" }}>[ School Seal / Stamp ]</div>
              </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        !isSearching && (
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="w-8 h-8 text-slate-300" />
            </div>
            <h3 className="font-bold text-slate-500 mb-1">Search for a Student</h3>
            <p className="text-slate-400 text-sm max-w-sm mx-auto">
              Enter ENR above to auto-fill the Character Certificate. Customize fields, then click Print.
            </p>
          </div>
        )
      )}
    </div>
  );
}
