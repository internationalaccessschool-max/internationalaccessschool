import type { Subject } from "@/types";

// ─── Shared report card ──────────────────────────────────────────────────────
// The admin landscape page generates the cards and "publishes" one snapshot per
// student to  reportCards/{studentUid}/cards/{session}_{reportType}.
// The admin View page and the student portal only read those snapshots and
// render them with the same builder below — no re-fetching of marks/attendance.

// ─── Grading ─────────────────────────────────────────────────────────────────
export function getGrade(pct: number): string {
  if (pct >= 90.5) return "A1";
  if (pct >= 81)   return "A2";
  if (pct >= 71)   return "B1";
  if (pct >= 61)   return "B2";
  if (pct >= 51)   return "C1";
  if (pct >= 41)   return "C2";
  if (pct >= 33)   return "D";
  return "E";
}

export const CO_SCHOLASTIC_ITEMS = [
  { id: "workEd",  label: "Work Education" },
  { id: "artEd",   label: "Art Education" },
  { id: "sports",  label: "Sports / Yoga / NCC" },
];

// ─── Types ────────────────────────────────────────────────────────────────────
export type ReportType = "unit1" | "halfYearly" | "unit2" | "annual";

export type MarksEntry = {
  obtained: number | null;
  total: number;
  perTest?: number | null;
  noteBook?: number | null;
  sea?: number | null;
  /** Absent in this subject only */
  absent?: boolean;
};

export type StudentResult = {
  id: string;
  /** Auth UID of the student (profile.uid, falls back to the profile doc id). */
  uid?: string;
  name: string;
  admissionNumber: string;
  rollNo?: string;
  dob?: string;
  fatherName?: string;
  motherName?: string;
  examMarks: Record<string, Record<string, MarksEntry>>;
  /** Exam ids where the teacher marked the student ABSENT — printed as "AB". */
  absentExams?: string[];
  coScholastic?: Record<string, { hy?: string; annual?: string }>;
  attendance: {
    t1WD: number; t1P: number;
    hyWD: number; hyP: number;
    t2WD: number; t2P: number;
    yrlWD: number; yrlP: number;
  };
  rank?: number;
};

export type ReportCardContext = {
  reportType: ReportType;
  session: string;
  className: string;
  section: string;
  subjects: Subject[];
  unit1Id: string; hyId: string; unit2Id: string; annualId: string;
  signatures: { classTeacher: string; examController: string; principal: string };
};

export type PublishedReportCard = {
  cardKey: string;
  studentId: string;
  uid: string;
  session: string;
  reportType: ReportType;
  className: string;
  section: string;
  student: StudentResult;
  ctx: ReportCardContext;
  summary: { total: number; max: number; percentage: number; grade: string; rank: number | null };
  publishedAt: number;
};

// Grade denominator per report type
export const MAX_PER_SUBJECT: Record<ReportType, number> = {
  unit1:      20,
  halfYearly: 100,
  unit2:      120,   // cumulative: Unit I(20) + HY(80) + Unit II(20)
  annual:     200,
};

export const REPORT_LABEL: Record<ReportType, string> = {
  unit1:      "1st Unit Test",
  halfYearly: "Half-Yearly",
  unit2:      "2nd Unit Test",
  annual:     "Full Annual",
};

export const REPORT_ORDER: ReportType[] = ["unit1", "halfYearly", "unit2", "annual"];

/** Doc id of a published card — one per student per session per report type. */
export const reportCardKey = (session: string | undefined, reportType: ReportType) =>
  `${(session || "NA").replace(/\//g, "-")}_${reportType}`;

/** Default report type for an exam (same rule the generator uses). */
export function detectReportType(exam: { examType?: string; name?: string } | null | undefined): ReportType {
  if (exam?.examType === "Unit Test" && /unit[\s-]*(i|1)(?![i\d])/i.test(exam.name || "")) return "unit1";
  if (exam?.examType === "Unit Test") return "unit2";
  if (exam?.examType === "Term Exam") return "halfYearly";
  return "annual";
}

/** Total / percentage / grade exactly as printed on the card. */
export function calcCardSummary(s: StudentResult, ctx: ReportCardContext) {
  const { reportType, subjects, unit1Id, hyId, unit2Id, annualId } = ctx;
  const num = (eId: string, sid: string, field: keyof MarksEntry) => {
    const v = eId ? s.examMarks[eId]?.[sid]?.[field] : null;
    return v !== undefined && v !== null ? Number(v) : 0;
  };
  let total = 0;
  subjects.forEach(sub => {
    const sid = String(sub.id || sub.name);
    const u1 = unit1Id ? num(unit1Id, sid, "perTest") + num(unit1Id, sid, "noteBook") + num(unit1Id, sid, "sea") : 0;
    const t1 = u1 + (hyId ? num(hyId, sid, "obtained") : 0);
    const u2 = unit2Id ? num(unit2Id, sid, "perTest") + num(unit2Id, sid, "noteBook") + num(unit2Id, sid, "sea") : 0;
    const t2 = u2 + (annualId ? num(annualId, sid, "obtained") : 0);
    total +=
      reportType === "unit1"      ? u1 :
      reportType === "halfYearly" ? t1 :
      reportType === "unit2"      ? t1 + u2 :
      t1 + t2;
  });
  const max = subjects.length * MAX_PER_SUBJECT[reportType];
  const percentage = max > 0 ? (total / max) * 100 : 0;
  return { total, max, percentage, grade: getGrade(percentage) };
}

// ─── HTML builder (one A4-landscape page per student) ────────────────────────
export function buildReportCardPage(s: StudentResult, ctx: ReportCardContext, logoSrc: string): string {
  const { reportType, subjects, unit1Id, hyId, unit2Id, annualId, signatures } = ctx;
  const selectedClass = ctx.className;
  const selectedSection = ctx.section;
  const session = ctx.session || "—";
  const n = subjects.length;

  const showU1  = true;
  const showHY  = ["halfYearly","unit2","annual"].includes(reportType);
  const showU2  = ["unit2","annual"].includes(reportType);
  const showAnn = reportType === "annual";

  // Grade denominator per report type
  const maxPerSub = MAX_PER_SUBJECT[reportType];

  // Below 33% of max = fail → red
  const F = (v: number, max: number) => max > 0 && (v / max) * 100 < 33 ? " fail" : "";

  const sRank = s.rank ?? "—";
  let grandTotalObt = 0;
  // Column totals for the TOTAL row
  const colSum = { u1Tot: 0, hy: 0, t1: 0, u2Tot: 0, an: 0, t2: 0 };

  const getV = (eId: string, sid: string, field: "obtained"|"perTest"|"noteBook"|"sea") => {
    if (!eId) return null;
    const v = s.examMarks[eId]?.[sid]?.[field];
    return (v !== undefined && v !== null) ? Number(v) : null;
  };
  const isAB = (eId: string) => !!eId && (s.absentExams ?? []).includes(eId);

  const subRows = subjects.map(sub => {
    const sid = String(sub.id || sub.name);

    const u1PT  = getV(unit1Id, sid, "perTest")  ?? 0;
    const u1NB  = getV(unit1Id, sid, "noteBook") ?? 0;
    const u1SEA = getV(unit1Id, sid, "sea")      ?? 0;
    const u1Tot = unit1Id ? u1PT + u1NB + u1SEA : 0;

    const hyObt = hyId ? (getV(hyId, sid, "obtained") ?? 0) : 0;
    const t1Tot = u1Tot + hyObt;   // Term-1 total = Unit I + HY

    const u2PT  = getV(unit2Id, sid, "perTest")  ?? 0;
    const u2NB  = getV(unit2Id, sid, "noteBook") ?? 0;
    const u2SEA = getV(unit2Id, sid, "sea")      ?? 0;
    const u2Tot = unit2Id ? u2PT + u2NB + u2SEA : 0;

    const anObt = annualId ? (getV(annualId, sid, "obtained") ?? 0) : 0;
    const t2Tot = u2Tot + anObt;   // Term-2 total = Unit II + Annual

    // Subject contribution based on report type
    const subContrib =
      reportType === "unit1"      ? u1Tot :
      reportType === "halfYearly" ? t1Tot :
      reportType === "unit2"      ? t1Tot + u2Tot :   // cumulative: T1 + Unit II
      t1Tot + t2Tot;                                    // annual: full

    grandTotalObt += subContrib;

    colSum.u1Tot += u1Tot; colSum.hy += hyObt; colSum.t1 += t1Tot;
    colSum.u2Tot += u2Tot; colSum.an += anObt; colSum.t2 += t2Tot;

    // Helpers
    // Absent for the whole exam, or only in this subject
    const subAB = (eId: string) => isAB(eId) || s.examMarks[eId]?.[sid]?.absent === true;
    const D  = (v: number | null, show: boolean, eId: string) =>
      !show || !eId ? "" : subAB(eId) ? "AB" : v !== null ? String(v) : "0";
    const DB = (v: number, show: boolean, eId: string) =>
      !show || !eId ? "" : subAB(eId) ? "AB" : String(v);

    // For Unit II: CUMULATIVE TOTAL = T1 + U2 (no annual yet)
    const cumulativeTotal = reportType === "unit2" ? String(t1Tot + u2Tot) : "";

    const subGrade = getGrade(maxPerSub > 0 ? (subContrib / maxPerSub) * 100 : 0);
    const gradeCls = `ctr grade${F(subContrib, maxPerSub)}`;

    return `<tr>
      <td class="subj-name">${sub.name}</td>
      ${showU1 && unit1Id ? `
        <td class="ctr bdr-l${F(u1PT, 10)}">${D(u1PT, showU1, unit1Id)}</td>
        <td class="ctr${F(u1NB, 5)}">${D(u1NB, showU1, unit1Id)}</td>
        <td class="ctr${F(u1SEA, 5)}">${D(u1SEA, showU1, unit1Id)}</td>
        <td class="ctr bold${F(u1Tot, 20)}">${DB(u1Tot, showU1, unit1Id)}</td>
      ` : ""}
      ${showHY && hyId ? `<td class="ctr${F(hyObt, 80)}">${D(hyObt, showHY, hyId)}</td>` : ""}
      ${showHY ? `<td class="ctr bold bdr-r${F(t1Tot, 100)}">${String(t1Tot)}</td>` : showU1 ? `<td class="ctr bold bdr-r${F(u1Tot, 20)}">${DB(u1Tot, true, unit1Id)}</td>` : ""}
      ${showU2 && unit2Id ? `
        <td class="ctr bdr-l${F(u2PT, 10)}">${D(u2PT, showU2, unit2Id)}</td>
        <td class="ctr${F(u2NB, 5)}">${D(u2NB, showU2, unit2Id)}</td>
        <td class="ctr${F(u2SEA, 5)}">${D(u2SEA, showU2, unit2Id)}</td>
        <td class="ctr bold${reportType === "unit2" ? " bdr-r" : ""}${F(u2Tot, 20)}">${DB(u2Tot, showU2, unit2Id)}</td>
      ` : ""}
      ${showAnn && annualId ? `<td class="ctr${F(anObt, 80)}">${D(anObt, showAnn, annualId)}</td>` : ""}
      ${showAnn ? `<td class="ctr bold bdr-r${F(t2Tot, 100)}">${String(t2Tot)}</td><td class="ctr bold grand${F(t1Tot + t2Tot, 200)}">${t1Tot + t2Tot}</td><td class="${gradeCls}">${subGrade}</td>`
        : showU2 ? `<td class="ctr bold grand${F(t1Tot + u2Tot, 120)}">${cumulativeTotal}</td><td class="${gradeCls}">${subGrade}</td>`
        : `<td class="${gradeCls}">${subGrade}</td>`}
    </tr>`;
  }).join("");

  const overallPct   = n * maxPerSub > 0 ? (grandTotalObt / (n * maxPerSub)) * 100 : 0;
  const overallGrade = getGrade(overallPct);
  const displayMax   = n * maxPerSub;

  // Co-scholastic rows
  const coRows = CO_SCHOLASTIC_ITEMS.map(cs => {
    const hyG  = s.coScholastic?.[cs.id]?.hy    ?? "—";
    const annG = s.coScholastic?.[cs.id]?.annual ?? "—";
    return `<tr><td>${cs.label}</td><td class="ctr">${hyG}</td><td class="ctr">${annG}</td></tr>`;
  }).join("");

  // Attendance rows — based on report type
  const att = s.attendance;
  const pct = (p: number, wd: number) => wd > 0 ? (p / wd * 100).toFixed(1) + "%" : "—";
  let attRows = `<tr><td>1st Unit Test</td><td class="ctr">${att.t1WD}</td><td class="ctr">${att.t1P}</td><td class="ctr bold">${pct(att.t1P, att.t1WD)}</td></tr>`;
  if (showHY) attRows += `<tr><td>Half Yearly</td><td class="ctr">${att.hyWD}</td><td class="ctr">${att.hyP}</td><td class="ctr bold">${pct(att.hyP, att.hyWD)}</td></tr>`;
  if (showU2) attRows += `<tr><td>2nd Unit Test</td><td class="ctr">${att.t2WD}</td><td class="ctr">${att.t2P}</td><td class="ctr bold">${pct(att.t2P, att.t2WD)}</td></tr>`;
  if (showAnn) {
    attRows += `<tr><td>Annual</td><td class="ctr">${att.yrlWD}</td><td class="ctr">${att.yrlP}</td><td class="ctr bold">${pct(att.yrlP, att.yrlWD)}</td></tr>`;
    attRows += `<tr class="bold"><td>Total</td><td class="ctr">${att.yrlWD}</td><td class="ctr">${att.yrlP}</td><td class="ctr">${pct(att.yrlP, att.yrlWD)}</td></tr>`;
  }

  // Table header builder
  const buildHeader = () => {
    if (reportType === "unit1") return `
      <tr class="term-header">
        <th rowspan="3" class="subj-hd">Subjects</th>
        <th colspan="5" class="term-hd bdr-l bdr-r">UNIT I TEST (20 Marks)</th>
        <th rowspan="3" class="grade-hd">Grade</th>
      </tr>
      <tr class="sub-header">
        <th colspan="4" class="bdr-l">Unit I Components</th>
        <th rowspan="2" class="bdr-r">TOTAL<br/>/20</th>
      </tr>
      <tr class="sub-header2">
        <th class="bdr-l ctr">Per<br/>Test<br/>/10</th>
        <th class="ctr">Note<br/>Book<br/>/5</th>
        <th class="ctr">SEA<br/>/5</th>
        <th class="ctr bold">Total<br/>/20</th>
      </tr>`;

    if (reportType === "halfYearly") return `
      <tr class="term-header">
        <th rowspan="3" class="subj-hd">Subjects</th>
        <th colspan="6" class="term-hd bdr-l bdr-r">TERM-1 (100 Marks)</th>
        <th rowspan="3" class="grade-hd">Grade</th>
      </tr>
      <tr class="sub-header">
        <th colspan="4" class="bdr-l">1st Unit Test (20)</th>
        <th rowspan="2" class="bdr-l">Half<br/>Yearly<br/>/80</th>
        <th rowspan="2" class="bdr-r">TOTAL<br/>/100</th>
      </tr>
      <tr class="sub-header2">
        <th class="bdr-l ctr">Per<br/>Test<br/>/10</th>
        <th class="ctr">NB<br/>/5</th>
        <th class="ctr">SEA<br/>/5</th>
        <th class="ctr bold">/20</th>
      </tr>`;

    if (reportType === "unit2") return `
      <tr class="term-header">
        <th rowspan="3" class="subj-hd">Subjects</th>
        <th colspan="6" class="term-hd bdr-l bdr-r">TERM-1 (100 Marks)</th>
        <th colspan="4" class="term-hd bdr-r">UNIT II TEST (20 Marks)</th>
        <th rowspan="3" class="term-hd">Cumul.<br/>Total<br/>/120</th>
        <th rowspan="3" class="grade-hd">Grade</th>
      </tr>
      <tr class="sub-header">
        <th colspan="4" class="bdr-l">1st Unit Test (20)</th>
        <th rowspan="2" class="bdr-l">Half<br/>Yearly<br/>/80</th>
        <th rowspan="2" class="bdr-r">T-1<br/>TOTAL<br/>/100</th>
        <th colspan="4" class="bdr-l bdr-r">2nd Unit Test (20)</th>
      </tr>
      <tr class="sub-header2">
        <th class="bdr-l ctr">PT<br/>/10</th><th class="ctr">NB<br/>/5</th><th class="ctr">SEA<br/>/5</th><th class="ctr bold">/20</th>
        <th class="bdr-l ctr">PT<br/>/10</th><th class="ctr">NB<br/>/5</th><th class="ctr">SEA<br/>/5</th><th class="ctr bold bdr-r">/20</th>
      </tr>`;

    // Annual
    return `
      <tr class="term-header">
        <th rowspan="3" class="subj-hd">Subjects</th>
        <th colspan="6" class="term-hd bdr-l bdr-r">TERM-1 (100 Marks)</th>
        <th colspan="6" class="term-hd bdr-r">TERM-2 (100 Marks)</th>
        <th colspan="2" class="term-hd">Over All</th>
      </tr>
      <tr class="sub-header">
        <th colspan="4" class="bdr-l">1st Unit Test (20)</th>
        <th rowspan="2" class="bdr-l">Half<br/>Yearly<br/>/80</th>
        <th rowspan="2" class="bdr-r">TOTAL<br/>/100</th>
        <th colspan="4" class="bdr-l">2nd Unit Test (20)</th>
        <th rowspan="2" class="bdr-l">Annual<br/>Exam<br/>/80</th>
        <th rowspan="2" class="bdr-r">TOTAL<br/>/100</th>
        <th rowspan="2" class="grand">Grand<br/>Total<br/>/200</th>
        <th rowspan="2">Grade</th>
      </tr>
      <tr class="sub-header2">
        <th class="bdr-l ctr">PT<br/>/10</th><th class="ctr">NB<br/>/5</th><th class="ctr">SEA<br/>/5</th><th class="ctr bold">/20</th>
        <th class="bdr-l ctr">PT<br/>/10</th><th class="ctr">NB<br/>/5</th><th class="ctr">SEA<br/>/5</th><th class="ctr bold">/20</th>
      </tr>`;
  };

  // Totals row — column-wise sums across all subjects
  const T = (v: number, max: number, cls = "", eId = "") => isAB(eId)
    ? `<td class="ctr bold fail${cls ? " " + cls : ""}">AB</td>`
    : `<td class="ctr bold${cls ? " " + cls : ""}${F(v, n * max)}">${v}</td>`;
  const u1Cells = unit1Id
    ? `<td class="bdr-l" colspan="3"></td>${T(colSum.u1Tot, 20, "", unit1Id)}`
    : `<td class="ctr bdr-l" colspan="4">—</td>`;
  const u2Cells = unit2Id
    ? `<td class="bdr-l" colspan="3"></td>${T(colSum.u2Tot, 20, reportType === "unit2" ? "bdr-r" : "", unit2Id)}`
    : `<td class="ctr bdr-l" colspan="4">—</td>`;
  const hyCell = hyId ? T(colSum.hy, 80, "", hyId) : `<td class="ctr">—</td>`;
  const anCell = annualId ? T(colSum.an, 80, "", annualId) : `<td class="ctr">—</td>`;
  const overallGradeCell = `<td class="ctr bold grade${F(overallPct, 100)}">${overallGrade}</td>`;

  const buildTotalsRow = () => {
    if (reportType === "unit1") return `<tr class="totals-row"><td class="bold">TOTAL</td>
      ${u1Cells}
      ${T(grandTotalObt, 20, "bdr-r")}
      ${overallGradeCell}</tr>`;

    if (reportType === "halfYearly") return `<tr class="totals-row"><td class="bold">TOTAL</td>
      ${u1Cells}
      ${hyCell}
      ${T(grandTotalObt, 100, "bdr-r")}
      ${overallGradeCell}</tr>`;

    if (reportType === "unit2") return `<tr class="totals-row"><td class="bold">TOTAL</td>
      ${u1Cells}${hyCell}
      ${T(colSum.t1, 100, "bdr-r")}
      ${u2Cells}
      ${T(grandTotalObt, 120, "grand")}
      ${overallGradeCell}</tr>`;

    return `<tr class="totals-row"><td class="bold">TOTAL</td>
      ${u1Cells}${hyCell}
      ${T(colSum.t1, 100, "bdr-r")}
      ${u2Cells}${anCell}
      ${T(colSum.t2, 100, "bdr-r")}
      ${T(grandTotalObt, 200, "grand")}
      ${overallGradeCell}</tr>`;
  };

  const reportLabel = REPORT_LABEL[reportType] ?? "Report Card";

  return `
<div class="page">
  <div class="report-header">
<img src="${logoSrc}" class="school-logo-img" alt="IAS Logo" />
<div class="header-text">
  <div class="school-name">INTERNATIONAL ACCESS SCHOOL</div>
  <div class="school-sub">Affiliated to CBSE(10+2) New Delhi &nbsp;|&nbsp; Aff. No: 330691 &nbsp;|&nbsp; School Code: 65688</div>
  <div class="school-sub">Siwan, Bihar – 841227 &nbsp;|&nbsp; Ph: +91 93477 76670, 84060 00830/33/40</div>
  <div class="school-sub">Email: info@iaschool.edu.in &nbsp;|&nbsp; www.iaschool.edu.in</div>
</div>
<div class="header-right">
  <div class="report-card-label">Report Card</div>
  <div class="session-label">Academic Session: ${session}</div>
  <div class="exam-label">${reportLabel.toUpperCase()}</div>
</div>
  </div>
  <div class="student-info">
<div class="info-group"><span class="info-lbl">Student Name</span><span class="info-val">${s.name}</span></div>
<div class="info-group"><span class="info-lbl">Class &amp; Section</span><span class="info-val">Class ${selectedClass} — ${selectedSection}</span></div>
<div class="info-group"><span class="info-lbl">Adm. No.</span><span class="info-val">${s.admissionNumber}</span></div>
<div class="info-group"><span class="info-lbl">Roll No.</span><span class="info-val">${s.rollNo ?? "—"}</span></div>
<div class="info-group"><span class="info-lbl">Date of Birth</span><span class="info-val">${s.dob ?? "—"}</span></div>
<div class="info-group"><span class="info-lbl">Father's Name</span><span class="info-val">${s.fatherName ?? "—"}</span></div>
  </div>
  <div class="marks-section">
<table class="marks-table">
  <thead>${buildHeader()}</thead>
  <tbody>${subRows}${buildTotalsRow()}</tbody>
</table>
  </div>
  <div class="bottom-section">
${reportType === "annual" ? `
<div class="co-scho-sec">
  <div class="sec-title">Co-Scholastic Activities</div>
  <table class="co-table">
    <thead><tr><th>Activity</th><th>Half Yearly</th><th>Annual</th></tr></thead>
    <tbody>${coRows}</tbody>
  </table>
</div>` : ""}
<div class="attendance-sec">
  <div class="sec-title">Attendance</div>
  <table class="att-table">
    <thead><tr><th>Period</th><th>W.D.</th><th>Present</th><th>%</th></tr></thead>
    <tbody>${attRows}</tbody>
  </table>
</div>
<div class="result-summary">
  <div class="sec-title">Result Summary</div>
  <div class="summary-grid">
    <div class="summary-item"><span class="s-lbl">Total Obtained</span><span class="s-val${F(overallPct, 100)}">${grandTotalObt} / ${displayMax}</span></div>
    <div class="summary-item"><span class="s-lbl">Percentage</span><span class="s-val${F(overallPct, 100)}">${overallPct.toFixed(1)}%</span></div>
    <div class="summary-item"><span class="s-lbl">Overall Grade</span><span class="s-val grade-big${F(overallPct, 100)}">${overallGrade}</span></div>
    <div class="summary-item"><span class="s-lbl">Class Position</span><span class="s-val">${sRank}</span></div>
  </div>
</div>
  </div>
  <div class="signatures">
<div class="sig-box"><div class="sig-line">${signatures.classTeacher ? `<img src="${signatures.classTeacher}" class="sig-img" alt="signature"/>` : ""}</div><div class="sig-name">Class Teacher</div></div>
<div class="sig-box"><div class="sig-line">${signatures.examController ? `<img src="${signatures.examController}" class="sig-img" alt="signature"/>` : ""}</div><div class="sig-name">Exam Controller</div></div>
<div class="sig-box"><div class="sig-line">${signatures.principal ? `<img src="${signatures.principal}" class="sig-img" alt="signature"/>` : ""}</div><div class="sig-name">Principal</div></div>
<div class="sig-box"><div class="sig-line"></div><div class="sig-name">Parent / Guardian</div></div>
  </div>
</div>`;
}

const REPORT_CARD_CSS = `
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:Arial,Helvetica,sans-serif;background:#f4f4f4;font-size:10px;}
.page{background:#fff;width:277mm;min-height:190mm;padding:5mm 6mm;margin:0 auto 8mm;page-break-after:always;page-break-inside:avoid;border:1px solid #ccc;}
.report-header{display:flex;align-items:center;gap:8px;border-bottom:3px double #1a2e4c;padding-bottom:5px;margin-bottom:5px;}
.school-logo-img{width:46px;height:46px;object-fit:contain;flex-shrink:0;}
.header-text{flex:1;text-align:center;}
.school-name{font-size:16px;font-weight:900;color:#15803d;letter-spacing:1px;text-transform:uppercase;}
.school-sub{font-size:7px;color:#000;margin-top:1px;line-height:1.3;}
.header-right{text-align:right;min-width:110px;flex-shrink:0;}
.report-card-label{font-size:12px;font-weight:900;color:#1a2e4c;border:2px solid #1a2e4c;padding:1px 6px;display:inline-block;letter-spacing:1px;}
.session-label{font-size:7.5px;color:#000;font-weight:bold;margin-top:2px;}
.exam-label{font-size:8px;color:#1a2e4c;font-weight:800;margin-top:1px;text-transform:uppercase;}
.student-info{display:flex;flex-wrap:wrap;gap:2px 10px;background:#f0f4f8;padding:4px 8px;border-radius:4px;margin-bottom:5px;border:1px solid #dde3ea;}
.info-group{display:flex;flex-direction:column;min-width:110px;max-width:160px;}
.info-lbl{font-size:7px;color:#000;text-transform:uppercase;font-weight:bold;letter-spacing:.5px;}
.info-val{font-size:10px;font-weight:700;color:#1a2e4c;}
.marks-section{margin-bottom:5px;}
.marks-table{width:100%;border-collapse:collapse;font-size:8.5px;}
.marks-table th,.marks-table td{border:1px solid #bbb;padding:1.5px 2px;vertical-align:middle;}
.marks-table thead th{background:#fff;color:#000;text-align:center;font-size:8px;}
.marks-table thead th.term-hd{font-size:9px;font-weight:bold;color:#15803d;}
.grade-hd{font-size:8px;font-weight:bold;}
.sub-header th,.sub-header2 th{font-size:7.5px;background:#fff;color:#000;}
.subj-hd{text-align:left!important;font-size:9px;vertical-align:middle;min-width:70px;}
.subj-name{text-align:left;padding-left:5px;font-size:8.5px;font-weight:500;}
.ctr{text-align:center;}
.bold{font-weight:bold;}
.bdr-l{border-left:2px solid #1a2e4c!important;}
.bdr-r{border-right:2px solid #1a2e4c!important;}
.grand{background:#fff8e1;font-weight:bold;}
.grade{background:#e8f5e9;font-weight:bold;color:#155724;}
.totals-row td{background:#f1f5fb;font-weight:bold;border-top:2px solid #1a2e4c;}
.fail{color:#dc2626!important;font-weight:bold;}
.bottom-section{display:flex;gap:6px;margin-bottom:5px;align-items:flex-start;}
.co-scho-sec{flex:1.4;}
.attendance-sec{flex:0.8;}
.result-summary{flex:1;}
.sec-title{font-size:8px;font-weight:bold;text-transform:uppercase;letter-spacing:.5px;color:#1a2e4c;border-bottom:2px solid #1a2e4c;margin-bottom:3px;padding-bottom:2px;}
.co-table,.att-table{width:100%;border-collapse:collapse;font-size:8px;}
.co-table th,.co-table td,.att-table th,.att-table td{border:1px solid #bbb;padding:2px 4px;}
.co-table thead th,.att-table thead th{background:#e8eef5;font-weight:bold;text-align:center;color:#1a2e4c;}
.summary-grid{display:grid;grid-template-columns:1fr 1fr;gap:3px;}
.summary-item{background:#f8fafc;border:1px solid #dde3ea;border-radius:3px;padding:3px 6px;display:flex;flex-direction:column;}
.s-lbl{font-size:7px;color:#000;text-transform:uppercase;letter-spacing:.5px;}
.s-val{font-size:14px;font-weight:900;color:#1a2e4c;}
.grade-big{color:#155724;font-size:20px;}
.signatures{display:flex;gap:10px;justify-content:space-around;padding-top:14px;border-top:1px solid #dde3ea;margin-top:10px;}
.sig-box{text-align:center;flex:1;}
.sig-line{border-bottom:1.5px dashed #aaa;margin:0 auto 4px;height:34px;display:flex;align-items:flex-end;justify-content:center;}
.sig-img{max-height:32px;max-width:90%;object-fit:contain;}
.sig-name{font-size:7.5px;text-transform:uppercase;letter-spacing:.5px;color:#000;font-weight:bold;}
@page{size:A4 landscape;margin:6mm;}
@media print{body{background:#fff;}.page{margin:0;box-shadow:none;border:none;width:100%;}}
`;

/** Wraps one or more pages from buildReportCardPage into a printable document. */
export function buildReportCardDocument(pagesHtml: string, title: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<title>${title}</title>
<style>${REPORT_CARD_CSS}</style></head><body>${pagesHtml}</body></html>`;
}

/** School logo as a data URL so it renders inside popup / iframe documents. */
export async function loadLogoDataUrl(): Promise<string> {
  try {
    const res = await fetch(window.location.origin + "/LOGO.png");
    const blob = await res.blob();
    return await new Promise(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    return "/LOGO.png";
  }
}

export function openPrintWindow(html: string) {
  const pw = window.open("", "_blank", "width=1200,height=800");
  if (!pw) { alert("Please allow popups to print."); return; }
  pw.document.write(html);
  pw.document.close();
  pw.focus();
  setTimeout(() => pw.print(), 900);
}
