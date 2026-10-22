"use client";

import { useState, useEffect, use } from "react";
import { collection, getDocs, doc, getDoc, collectionGroup, writeBatch } from "firebase/firestore";
import * as XLSX from "xlsx";
import { db } from "@/lib/firebase";
import { Exam, Subject } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { CloudinaryUpload } from "@/components/ui/cloudinary-upload";
import { Loader2, Printer, FileText, Users, BookOpen, CheckCircle2, FileSpreadsheet, Send } from "lucide-react";
import Link from "next/link";
import {
  getGrade, MAX_PER_SUBJECT, REPORT_LABEL, reportCardKey, detectReportType, calcCardSummary,
  buildReportCardPage, buildReportCardDocument, loadLogoDataUrl, openPrintWindow,
  type ReportType, type MarksEntry, type StudentResult, type ReportCardContext, type PublishedReportCard,
} from "@/lib/reportCard";

// ─── Attendance counter ───────────────────────────────────────────────────────
// isHoliday: true wale din ko working day mein count NAHI karte
function countAtt(
  records: { date: string; status: string; isHoliday?: boolean }[],
  from: string, to: string,
  fromExclusive = false
): { wd: number; p: number } {
  if (!from || !to) return { wd: 0, p: 0 };
  const f = new Date(from).getTime();
  const t = new Date(to).getTime();
  let wd = 0, p = 0;
  for (const r of records) {
    const d = new Date(r.date).getTime();
    const startOk = fromExclusive ? d > f : d >= f;
    if (startOk && d <= t) {
      if (r.isHoliday) continue; // ← Holiday: skip entirely
      wd++;
      if (r.status === "present" || r.status === "late") p++;
    }
  }
  return { wd, p };
}

// ─── Report type config ───────────────────────────────────────────────────────
const REPORT_TYPES: { key: ReportType; label: string; desc: string; color: string }[] = [
  { key: "unit1",      label: REPORT_LABEL.unit1,      desc: "Grade out of /20 per subject",                  color: "blue"    },
  { key: "halfYearly", label: REPORT_LABEL.halfYearly, desc: "Unit I + HY — grade /100 per subject",          color: "indigo"  },
  { key: "unit2",      label: REPORT_LABEL.unit2,      desc: "Unit I + HY + Unit II — grade /120 per subject", color: "orange"  },
  { key: "annual",     label: REPORT_LABEL.annual,     desc: "All 4 exams — grade /200 per subject",           color: "emerald" },
];

// ─── Class ordering (NUR → LKG → UKG → 1 … 12) ────────────────────────────────
const PRE_PRIMARY_ORDER: Record<string, number> = {
  PLAY: -5, PG: -5, PREP: -4, NUR: -3, NURSERY: -3, LKG: -2, UKG: -1,
};
function classRank(cls: string): number {
  const u = cls.replace(/^class\s*/i, "").trim().toUpperCase();
  if (u in PRE_PRIMARY_ORDER) return PRE_PRIMARY_ORDER[u];
  const n = parseInt(u, 10);
  return Number.isNaN(n) ? 999 : n;
}
function sortClasses(list: string[]): string[] {
  return [...list].sort((a, b) => {
    const d = classRank(a) - classRank(b);
    return d !== 0 ? d : a.localeCompare(b);
  });
}

const RT_COLOR: Record<string, string> = {
  blue:    "border-blue-500 bg-blue-50 text-blue-800",
  indigo:  "border-indigo-500 bg-indigo-50 text-indigo-800",
  orange:  "border-orange-500 bg-orange-50 text-orange-800",
  emerald: "border-emerald-500 bg-emerald-50 text-emerald-800",
};

// ─── Per-subject contribution (shared by print + Excel export) ────────────────
function calcSubjectContribution(
  s: StudentResult,
  sub: Subject,
  reportType: ReportType,
  unit1Id: string, hyId: string, unit2Id: string, annualId: string
): number {
  const sid = String(sub.id || sub.name);
  const u1m = s.examMarks[unit1Id]?.[sid];
  const hym = s.examMarks[hyId]?.[sid];
  const u2m = s.examMarks[unit2Id]?.[sid];
  const anm = s.examMarks[annualId]?.[sid];
  const u1o = u1m ? (u1m.obtained ?? ((u1m.perTest ?? 0) + (u1m.noteBook ?? 0) + (u1m.sea ?? 0))) : 0;
  const hyo = hym?.obtained ?? 0;
  const u2o = u2m ? (u2m.obtained ?? ((u2m.perTest ?? 0) + (u2m.noteBook ?? 0) + (u2m.sea ?? 0))) : 0;
  const ano = anm?.obtained ?? 0;
  if      (reportType === "unit1")      return u1o;
  else if (reportType === "halfYearly") return u1o + hyo;
  else if (reportType === "unit2")      return u1o + hyo + u2o;   // cumulative /120
  else                                   return u1o + hyo + u2o + ano;
}

// ─── Grand total calculator ───────────────────────────────────────────────────
function calcGrandTotal(
  s: StudentResult,
  subjects: Subject[],
  reportType: ReportType,
  unit1Id: string, hyId: string, unit2Id: string, annualId: string
): number {
  return subjects.reduce(
    (total, sub) => total + calcSubjectContribution(s, sub, reportType, unit1Id, hyId, unit2Id, annualId),
    0
  );
}

// ─── Signature picker — select an existing staff signature (from Staff → Documents)
// or upload one directly. Fully optional; leaving it blank keeps the printed
// line empty for a manual/wet signature. ─────────────────────────────────────
function ReportSignatureField({
  label, teacherList, value, onChange,
}: {
  label: string;
  teacherList: { id: string; name: string; signatureUrl: string; designation?: string }[];
  value: { name: string; url: string };
  onChange: (v: { name: string; url: string }) => void;
}) {
  return (
    <div className="space-y-2 p-3 rounded-lg border border-border bg-muted/5 min-w-0 overflow-hidden">
      <p className="text-xs font-semibold text-foreground">
        {label} <span className="text-muted-foreground font-normal">(optional)</span>
      </p>

      {value.url ? (
        // Preview + Remove ek row me, naam ka input neeche full width —
        // isse narrow column me bhi Remove button card ke andar hi rehta hai
        <div className="bg-white border rounded-lg p-2 space-y-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-12 w-20 flex items-center justify-center border rounded bg-white shrink-0">
              <img src={value.url} alt={label} className="max-h-[85%] max-w-[85%] object-contain" />
            </div>
            <button
              type="button"
              onClick={() => onChange({ name: "", url: "" })}
              className="ml-auto text-xs font-medium text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 shrink-0"
            >
              Remove
            </button>
          </div>
          <input
            value={value.name}
            onChange={e => onChange({ ...value, name: e.target.value })}
            placeholder="Name (for reference only)"
            className="w-full min-w-0 text-xs px-2 py-1.5 border rounded-md outline-none focus:border-primary"
          />
        </div>
      ) : (
        <>
          <Select
            value=""
            onValueChange={(v) => {
              const t = teacherList.find(t => t.id === v);
              if (t) onChange({ name: t.name, url: t.signatureUrl });
            }}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder={teacherList.length ? "Select from staff signatures" : "No staff signatures uploaded yet"} />
            </SelectTrigger>
            <SelectContent>
              {teacherList.map(t => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}{t.designation ? ` — ${t.designation}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <div className="flex-1 h-px bg-border" />or upload directly<div className="flex-1 h-px bg-border" />
          </div>
          <CloudinaryUpload
            folder="admin-docs"
            subFolder="report-signatures"
            acceptedFileTypes="images"
            maxSizeMB={1}
            label={`Upload ${label} Signature`}
            onUpload={(url) => onChange({ name: value.name, url })}
          />
        </>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function LandscapeReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: examId } = use(params);

  const [currentExam, setCurrentExam]         = useState<Exam | null>(null);
  const [allSessionExams, setAllSessionExams]  = useState<Exam[]>([]);

  const [unit1Id,  setUnit1Id]  = useState("");
  const [hyId,     setHyId]     = useState("");
  const [unit2Id,  setUnit2Id]  = useState("");
  const [annualId, setAnnualId] = useState("");

  const [reportType, setReportType]             = useState<ReportType>("annual");
  const [selectedClass,   setSelectedClass]     = useState("");
  const [selectedSection, setSelectedSection]   = useState("");
  const [availableClasses,  setAvailableClasses]  = useState<string[]>([]);
  const [availableSections, setAvailableSections] = useState<string[]>([]);
  const [classSectionMap, setClassSectionMap]   = useState<Record<string, string[]>>({});

  const [subjects,  setSubjects]  = useState<Subject[]>([]);
  const [students,  setStudents]  = useState<StudentResult[]>([]);
  const [isLoadingMeta, setIsLoadingMeta] = useState(true);
  const [isGenerating,  setIsGenerating]  = useState(false);
  const [reportReady,   setReportReady]   = useState(false);

  // ── Signatures (optional, printed on every report card) ────────────────────
  const [teacherSigList, setTeacherSigList] = useState<{ id: string; name: string; signatureUrl: string; designation?: string }[]>([]);
  const [classTeacherSig,   setClassTeacherSig]   = useState<{ name: string; url: string }>({ name: "", url: "" });
  const [examControllerSig, setExamControllerSig] = useState<{ name: string; url: string }>({ name: "", url: "" });
  const [principalSig,      setPrincipalSig]      = useState<{ name: string; url: string }>({ name: "", url: "" });

  useEffect(() => {
    const loadTeacherSignatures = async () => {
      try {
        const snap = await getDocs(collection(db, "teachers"));
        const list = snap.docs
          .map(d => {
            const data = d.data() as any;
            return {
              id: d.id,
              name: `${data.firstName || ""} ${data.lastName || ""}`.trim(),
              signatureUrl: data.signatureUrl || "",
              designation: data.designation || "",
            };
          })
          .filter(t => t.name && t.signatureUrl);
        list.sort((a, b) => a.name.localeCompare(b.name));
        setTeacherSigList(list);
      } catch { /* ignore — signatures are optional */ }
    };
    loadTeacherSignatures();
  }, []);

  // ── Load exam + session exams ───────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setIsLoadingMeta(true);
      try {
        const examSnap = await getDoc(doc(db, "exams", examId));
        if (!examSnap.exists()) return;
        const exam = { id: examSnap.id, ...examSnap.data() } as Exam;
        setCurrentExam(exam);

        const allSnap = await getDocs(collection(db, "exams"));
        const all = allSnap.docs.map(d => ({ id: d.id, ...d.data() }) as Exam);
        const sessionExams = exam.session ? all.filter(e => e.session === exam.session) : all;
        setAllSessionExams(sessionExams);

        // Auto-detect companion exams
        const unitTests = sessionExams
          .filter(e => e.examType === "Unit Test")
          .sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""));
        const u1  = unitTests.find(e => /unit[\s-]*(i|1)(?![i\d])/i.test(e.name || "")) ?? unitTests[0];
        const u2  = unitTests.find(e => /unit[\s-]*(ii|2)/i.test(e.name || "")) ?? unitTests[1];
        const hy  = sessionExams.find(e => e.examType === "Term Exam" || /half[\s-]*year/i.test(e.name || ""));
        const ann = sessionExams.find(e => e.examType === "Annual Exam");

        if (u1?.id)  setUnit1Id(u1.id);
        if (hy?.id)  setHyId(hy.id);
        if (u2?.id)  setUnit2Id(u2.id);
        setAnnualId(exam.examType === "Annual Exam" ? examId : (ann?.id ?? examId));

        // Auto-set report type
        setReportType(detectReportType(exam));

        // Build class→sections map
        const profSnap = await getDocs(collectionGroup(db, "profiles"));
        const csMap: Record<string, Set<string>> = {};
        profSnap.docs.forEach(d => {
          const data = d.data();
          if (["LEFT","TC","INACTIVE"].includes((data.status || "").toUpperCase())) return;
          const pathParts = d.ref.path.split("/");
          const clsIdx = pathParts.indexOf("classes");
          const secIdx = pathParts.indexOf("sections");
          const cn = (clsIdx >= 0 ? pathParts[clsIdx + 1] : (data.className || data.currentClass || ""))
            .replace(/^class\s*/i, "").trim();
          const sec = secIdx >= 0 ? pathParts[secIdx + 1] : (data.section || "");
          if (cn && sec) {
            if (!csMap[cn]) csMap[cn] = new Set();
            csMap[cn].add(sec);
          }
        });

        // Report cards har class ke liye ban sakte hain — isliye exam ke
        // classesApplicable tak limit NAHI karte. Jitni bhi classes me active
        // students hain wo sab + exam par configured classes, sabka union.
        const examClasses = (exam.classesApplicable || []).map((c: string) => c.replace(/^class\s*/i, "").trim());
        const applicable = sortClasses(
          Array.from(new Set([...Object.keys(csMap), ...examClasses].filter(Boolean)))
        );

        const secMapFinal: Record<string, string[]> = {};
        applicable.forEach((c: string) => { secMapFinal[c] = Array.from(csMap[c] ?? []).sort(); });

        setClassSectionMap(secMapFinal);
        setAvailableClasses(applicable);
        if (applicable.length === 1) setSelectedClass(applicable[0]);
      } finally {
        setIsLoadingMeta(false);
      }
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  useEffect(() => {
    if (!selectedClass) return;
    setAvailableSections(classSectionMap[selectedClass] ?? []);
    setSelectedSection("");
    setReportReady(false);
  }, [selectedClass, classSectionMap]);

  useEffect(() => {
    if (!selectedClass) return;
    const normCls = selectedClass.replace(/^class\s*/i, "").trim();
    const load = async () => {
      for (const key of [normCls, selectedClass, `Class ${normCls}`]) {
        const snap = await getDoc(doc(db, "classSubjects", key));
        if (snap.exists()) {
          const raw = snap.data().subjects || [];
          setSubjects(raw.map((s: any) => typeof s === "object" ? s : { id: s, name: s, maxMarks: 100 }));
          return;
        }
      }
      setSubjects([]);
    };
    load();
  }, [selectedClass]);

  // ── Generate report cards ───────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!selectedClass || !selectedSection) return;
    setIsGenerating(true);
    setReportReady(false);
    try {
      const normCls = selectedClass.replace(/^class\s*/i, "").trim();

      // 1. Fetch active student profiles
      let profiles: any[] = [];
      for (const cls of [normCls, selectedClass, `Class ${normCls}`]) {
        try {
          const snap = await getDocs(collection(db, "users", "classes", cls, "sections", selectedSection, "students", "profiles"));
          if (snap.docs.length > 0) { profiles = snap.docs.map(d => ({ id: d.id, ...d.data() })); break; }
        } catch { /* try next */ }
      }
      if (profiles.length === 0) {
        const usersSnap = await getDocs(collection(db, "users"));
        profiles = usersSnap.docs
          .map(d => ({ id: d.id, ...d.data() }) as any)
          .filter((d: any) =>
            d.role === "student" &&
            [normCls, selectedClass, `Class ${normCls}`].includes(d.className ?? d.currentClass ?? "") &&
            d.section === selectedSection
          );
      }
      profiles = profiles.filter((p: any) => !["LEFT","TC","INACTIVE"].includes((p.status || "").toUpperCase()));
      // Admission number order (numeric-aware); students without one go last
      profiles.sort((a: any, b: any) => {
        const aAdm = String(a.admissionNumber || "").trim();
        const bAdm = String(b.admissionNumber || "").trim();
        if (aAdm && bAdm) return aAdm.localeCompare(bAdm, undefined, { numeric: true });
        if (aAdm !== bAdm) return aAdm ? -1 : 1;
        return `${a.firstName}${a.lastName}`.localeCompare(`${b.firstName}${b.lastName}`);
      });

      // 2. Determine which exams to fetch
      const examIdsToFetch: string[] = [];
      if (reportType === "unit1")      examIdsToFetch.push(unit1Id);
      if (reportType === "halfYearly") examIdsToFetch.push(unit1Id, hyId);
      if (reportType === "unit2")      examIdsToFetch.push(unit1Id, hyId, unit2Id);
      if (reportType === "annual")     examIdsToFetch.push(unit1Id, hyId, unit2Id, annualId);

      // 3. Fetch marks
      const allMarks: Record<string, Record<string, Record<string, MarksEntry>>> = {};
      const absentExams: Record<string, string[]> = {};   // studentId → exam ids marked ABSENT
      for (const eId of examIdsToFetch.filter(Boolean)) {
        allMarks[eId] = {};
        for (const cls of [normCls, selectedClass, `Class ${normCls}`]) {
          try {
            const snap = await getDocs(collection(db, "results", eId, "classes", cls, "sections", selectedSection, "students"));
            snap.docs.forEach(d => {
              const data = d.data();
              if (data.absent === true) (absentExams[d.id] ??= []).push(eId);
              allMarks[eId][d.id] = {};
              Object.entries(data.marks || {}).forEach(([subId, m]: [string, any]) => {
                allMarks[eId][d.id][subId] = { obtained: m.obtained, total: m.total, perTest: m.perTest, noteBook: m.noteBook, sea: m.sea, absent: m.absent === true };
              });
            });
            if (Object.keys(allMarks[eId]).length > 0) break;
          } catch { /* try next */ }
        }
      }

      // 4. Co-scholastic (annual only)
      const coSchoData: Record<string, Record<string, { hy?: string; annual?: string }>> = {};
      if (reportType === "annual" && annualId) {
        for (const cls of [normCls, selectedClass, `Class ${normCls}`]) {
          try {
            const snap = await getDocs(collection(db, "results", annualId, "classes", cls, "sections", selectedSection, "students"));
            snap.docs.forEach(d => { const data = d.data(); if (data.coScholastic) coSchoData[d.id] = data.coScholastic; });
            if (snap.docs.length > 0) break;
          } catch { /* next */ }
        }
      }

      // 5. Attendance — fetch from new hierarchical structure:
      //    attendance/{year}/{cls}/{month}/{date}_{section}
      const sessionYear = currentExam?.session?.split("-")[0] ?? new Date().getFullYear().toString();
      const sessionStart = `${sessionYear}-04-01`;

      // getEnd: returns endDate, falls back to startDate, then empty string
      const getEnd = (eId: string) => {
        const ex = allSessionExams.find(e => e.id === eId);
        return ex?.endDate || ex?.startDate || "";
      };
      const u1End  = getEnd(unit1Id);
      const hyEnd  = getEnd(hyId);
      const u2End  = getEnd(unit2Id);
      // For current exam, also allow today as fallback if endDate missing
      const todayStr = new Date().toISOString().split("T")[0];
      const annEnd = currentExam?.examType === "Annual Exam"
        ? (currentExam?.endDate || currentExam?.startDate || todayStr)
        : getEnd(annualId);

      // Build list of YYYY-MM months covering the full academic year
      const academicMonths: string[] = [];
      const syNum = Number(sessionYear);
      for (let m = 4; m <= 12; m++) academicMonths.push(`${syNum}-${String(m).padStart(2, "0")}`);
      for (let m = 1; m <= 3; m++) academicMonths.push(`${syNum + 1}-${String(m).padStart(2, "0")}`);

      // Try both "Class N" and bare class name variants
      const clsVariants = [selectedClass, normCls, `Class ${normCls}`];

      const attPerStudent: Record<string, { date: string; status: string; isHoliday?: boolean }[]> = {};
      const holidayDates = new Set<string>(); // ← holiday dates collected here

      for (const clsVar of clsVariants) {
        let found = false;
        for (const monthStr of academicMonths) {
          const monthYear = monthStr.slice(0, 4);
          try {
            const monthCol = collection(db, "attendance", monthYear, clsVar, "months", monthStr);
            const monthSnap = await getDocs(monthCol);
            if (monthSnap.empty) continue;
            found = true;
            monthSnap.docs.forEach(d => {
              const data = d.data();
              const sec = data.section || "";
              if (sec && sec !== selectedSection) return;
              const dateStr = data.date || d.id.split("_")[0] || "";
              if (!dateStr) return;

              // ── Holiday: collect date, skip individual records ──
              if (data.isHoliday) {
                holidayDates.add(dateStr);
                return;
              }

              Object.entries(data.records || {}).forEach(([uid, st]: [string, any]) => {
                if (!attPerStudent[uid]) attPerStudent[uid] = [];
                attPerStudent[uid].push({ date: dateStr, status: st });
              });
            });
          } catch { /* month not found */ }
        }
        if (found) break; // stop trying class name variants once data found
      }

      // Inject holiday entries into every student's records so countAtt skips them
      if (holidayDates.size > 0) {
        const allStudentIds = profiles.map((p: any) => p.id);
        for (const uid of allStudentIds) {
          if (!attPerStudent[uid]) attPerStudent[uid] = [];
          for (const hDate of holidayDates) {
            attPerStudent[uid].push({ date: hDate, status: "holiday", isHoliday: true });
          }
        }
      }

      // 6. Build results
      const results: StudentResult[] = profiles.map((p: any) => {
        const uid  = p.id;
        const recs = attPerStudent[uid] ?? [];
        // Cumulative from April 1 → each exam's end date
        const t1  = countAtt(recs, sessionStart, u1End);
        const hy  = countAtt(recs, sessionStart, hyEnd);
        const t2  = countAtt(recs, sessionStart, u2End);
        const yrl = countAtt(recs, sessionStart, annEnd);

        const examMarks: Record<string, Record<string, MarksEntry>> = {};
        for (const eId of examIdsToFetch.filter(Boolean)) {
          examMarks[eId] = allMarks[eId]?.[uid] ?? {};
        }

        return {
          id: uid,
          uid: p.uid || uid,
          name: `${p.firstName || ""} ${p.lastName || ""}`.trim() || "Unknown",
          admissionNumber: p.admissionNumber || "—",
          rollNo: p.rollNumber || p.rollNo || p.roll || "—",
          dob: p.dob || p.dateOfBirth || "—",
          fatherName: p.fatherName || p.guardianName || "—",
          motherName: p.motherName || "—",
          examMarks,
          absentExams: absentExams[uid] ?? [],
          coScholastic: coSchoData[uid] ?? {},
          attendance: { t1WD: t1.wd, t1P: t1.p, hyWD: hy.wd, hyP: hy.p, t2WD: t2.wd, t2P: t2.p, yrlWD: yrl.wd, yrlP: yrl.p },
        };
      });

      // 7. Rank (standard competition ranking — ties share a rank, next rank skips accordingly)
      const ranked = [...results]
        .map(s => ({ id: s.id, gt: calcGrandTotal(s, subjects, reportType, unit1Id, hyId, unit2Id, annualId) }))
        .sort((a, b) => b.gt - a.gt);
      const rankMap: Record<string, number> = {};
      ranked.forEach((r, i) => {
        rankMap[r.id] = i > 0 && r.gt === ranked[i - 1].gt ? rankMap[ranked[i - 1].id] : i + 1;
      });

      setStudents(results.map(s => ({ ...s, rank: rankMap[s.id] })));
      setReportReady(true);
    } catch (err) {
      console.error("Generate error:", err);
      alert("Failed to generate report cards. Check console for details.");
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Print ───────────────────────────────────────────────────────────────────
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishedCount, setPublishedCount] = useState<number | null>(null);
  // New generation (or class/type change) → previous "published" status no longer applies
  useEffect(() => { if (!reportReady) setPublishedCount(null); }, [reportReady]);

  const buildContext = (): ReportCardContext => ({
    reportType,
    session: currentExam?.session ?? "",
    className: selectedClass,
    section: selectedSection,
    subjects,
    unit1Id, hyId, unit2Id, annualId,
    signatures: {
      classTeacher: classTeacherSig.url,
      examController: examControllerSig.url,
      principal: principalSig.url,
    },
  });

  const handlePrint = async () => {
    if (students.length === 0) return;
    const ctx = buildContext();
    const logoSrc = await loadLogoDataUrl();
    const pages = students.map(s => buildReportCardPage(s, ctx, logoSrc)).join("");
    openPrintWindow(buildReportCardDocument(pages, `Report Cards — ${selectedClass} ${selectedSection} | ${REPORT_LABEL[reportType]}`));
  };

  // ── Publish — save one snapshot per student; View page + student portal read only this ──
  const handlePublish = async () => {
    if (students.length === 0) return;
    if (!confirm(
      `Publish ${students.length} report card(s) for Class ${selectedClass} ${selectedSection} (${REPORT_LABEL[reportType]})?\n\n` +
      `Students will see exactly these cards on their portal. Publishing again replaces the old copy.`
    )) return;

    setIsPublishing(true);
    try {
      const ctx = buildContext();
      const cardKey = reportCardKey(ctx.session, reportType);
      const publishedAt = Date.now();

      // Firestore batches allow 500 writes — stay well under it
      for (let i = 0; i < students.length; i += 400) {
        const batch = writeBatch(db);
        students.slice(i, i + 400).forEach(s => {
          const ownerUid = s.uid || s.id;
          const summary = calcCardSummary(s, ctx);
          const card: PublishedReportCard = {
            cardKey,
            studentId: s.id,
            uid: ownerUid,
            session: ctx.session,
            reportType,
            className: selectedClass,
            section: selectedSection,
            student: s,
            ctx,
            summary: { ...summary, rank: s.rank ?? null },
            publishedAt,
          };
          // JSON round-trip drops undefined fields, which Firestore rejects
          batch.set(doc(db, "reportCards", ownerUid, "cards", cardKey), JSON.parse(JSON.stringify(card)));
        });
        await batch.commit();
      }
      setPublishedCount(students.length);
    } catch (err) {
      console.error("Publish error:", err);
      alert("Failed to publish report cards. Make sure the latest firestore.rules are deployed. Check console for details.");
    } finally {
      setIsPublishing(false);
    }
  };

  // ── Export to Excel ─────────────────────────────────────────────────────────
  const handleExportExcel = () => {
    if (students.length === 0) return;
    const maxPerSub = MAX_PER_SUBJECT[reportType];
    const showU2  = ["unit2", "annual"].includes(reportType);
    const showHY  = ["halfYearly", "unit2", "annual"].includes(reportType);
    const showAnn = reportType === "annual";
    const displayMax = subjects.length * maxPerSub;

    const rows = students.map((s, i) => {
      const row: Record<string, any> = {
        "S.No": i + 1,
        "Name": s.name,
        "Adm No": s.admissionNumber,
        "Roll No": s.rollNo ?? "",
        "Father's Name": s.fatherName ?? "",
      };

      let grandTotalObt = 0;
      subjects.forEach(sub => {
        const contrib = calcSubjectContribution(s, sub, reportType, unit1Id, hyId, unit2Id, annualId);
        grandTotalObt += contrib;
        row[`${sub.name} (/${maxPerSub})`] = contrib;
      });

      const overallPct = displayMax > 0 ? (grandTotalObt / displayMax) * 100 : 0;
      row["Total"] = grandTotalObt;
      row["Max"] = displayMax;
      row["Percentage"] = Number(overallPct.toFixed(2));
      row["Grade"] = getGrade(overallPct);
      row["Rank"] = s.rank ?? "";

      // Attendance for the period matching the selected report type
      const att = s.attendance;
      const wd = showAnn ? att.yrlWD : showU2 ? att.t2WD : showHY ? att.hyWD : att.t1WD;
      const p  = showAnn ? att.yrlP  : showU2 ? att.t2P  : showHY ? att.hyP  : att.t1P;
      row["Working Days"] = wd;
      row["Present"] = p;
      row["Attendance %"] = wd > 0 ? Number(((p / wd) * 100).toFixed(1)) : "";

      return row;
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0] ?? {}).map(key =>
      ["Name", "Father's Name"].includes(key) ? { wch: 24 } : { wch: 12 }
    );
    const wb = XLSX.utils.book_new();
    const sheetName = `${selectedClass}-${selectedSection}`.slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const reportLabel = (REPORT_TYPES.find(r => r.key === reportType)?.label ?? "Report").replace(/\s+/g, "_");
    XLSX.writeFile(wb, `ReportCards_${selectedClass}${selectedSection}_${reportLabel}.xlsx`);
  };

  // ── Preview helpers ─────────────────────────────────────────────────────────
  const maxPerSub = MAX_PER_SUBJECT[reportType];

  if (isLoadingMeta) {
    return (
      <div className="flex items-center justify-center p-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/admin/exams/${examId}/results/view`}>
          <Button variant="ghost" size="icon" className="h-8 w-8">←</Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="h-8 w-8 text-primary" /> Report Card Generator
          </h1>
          <p className="text-muted-foreground">
            {currentExam?.name}
            {currentExam?.session && (
              <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">
                Session {currentExam.session}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Setup Card */}
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="bg-muted/10 border-b pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" /> Setup — Report Type &amp; Class
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Select the report type, class, and section. Each report is cumulative — it includes all exams up to the selected point.
          </p>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          {/* Report Type */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Report Type <span className="text-red-500">*</span></Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {REPORT_TYPES.map(rt => (
                <button
                  key={rt.key}
                  onClick={() => { setReportType(rt.key); setReportReady(false); }}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    reportType === rt.key
                      ? `${RT_COLOR[rt.color]} shadow-sm`
                      : "border-border hover:border-primary/40 bg-white"
                  }`}
                >
                  <p className="font-bold text-sm leading-tight">{rt.label}</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-tight">{rt.desc}</p>
                  <p className="text-xs font-bold mt-2 text-primary">/{MAX_PER_SUBJECT[rt.key]} per subject</p>
                </button>
              ))}
            </div>
          </div>

          {/* Class + Section */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Class <span className="text-red-500">*</span></Label>
              <Select value={selectedClass} onValueChange={v => { setSelectedClass(v); setReportReady(false); }}>
                <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                <SelectContent>
                  {availableClasses.map(cls => (
                    <SelectItem key={cls} value={cls}>{cls}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Section <span className="text-red-500">*</span></Label>
              <Select value={selectedSection} onValueChange={v => { setSelectedSection(v); setReportReady(false); }} disabled={!selectedClass}>
                <SelectTrigger><SelectValue placeholder="Select section" /></SelectTrigger>
                <SelectContent>
                  {availableSections.map(sec => (
                    <SelectItem key={sec} value={sec}>{sec}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Auto-detected exams */}
          <div className="bg-muted/10 rounded-lg border p-3 text-xs space-y-1">
            <p className="font-semibold text-foreground text-sm mb-2">Auto-detected exam structure for session</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                Unit I: <strong>{allSessionExams.find(e => e.id === unit1Id)?.name ?? "—"}</strong>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-400 inline-block" />
                Half Yearly: <strong>{allSessionExams.find(e => e.id === hyId)?.name ?? "—"}</strong>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
                Unit II: <strong>{allSessionExams.find(e => e.id === unit2Id)?.name ?? "—"}</strong>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                Annual: <strong>{allSessionExams.find(e => e.id === annualId)?.name ?? "—"}</strong>
              </span>
            </div>
          </div>

          {/* Marks scope info */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
            <p className="font-semibold text-primary mb-1">
              {REPORT_TYPES.find(r => r.key === reportType)?.label} — Scope
            </p>
            <p className="text-muted-foreground text-xs">
              {reportType === "unit1"      && "Shows only 1st Unit Test marks (PT/10 + NB/5 + SEA/5). Grade out of 20 per subject."}
              {reportType === "halfYearly" && "Shows Unit I + Half-Yearly marks. TERM-1 TOTAL = Unit I(20) + HY(80) = 100. Grade out of 100 per subject."}
              {reportType === "unit2"      && "Cumulative: Unit I + HY + Unit II. Cumulative Total = T1(100) + Unit II(20) = 120. Grade out of 120 per subject."}
              {reportType === "annual"     && "Full annual: TERM-1(100) + TERM-2(100) = 200. Grade out of 200 per subject with co-scholastic activities."}
            </p>
          </div>

          {/* Signatures — optional, printed on every report card */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">
              Signatures <span className="text-muted-foreground font-normal text-xs">(optional — printed on every report card)</span>
            </Label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <ReportSignatureField label="Class Teacher" teacherList={teacherSigList} value={classTeacherSig} onChange={setClassTeacherSig} />
              <ReportSignatureField label="Exam Controller" teacherList={teacherSigList} value={examControllerSig} onChange={setExamControllerSig} />
              <ReportSignatureField label="Principal" teacherList={teacherSigList} value={principalSig} onChange={setPrincipalSig} />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 pt-1 flex-wrap">
            <Button
              onClick={handleGenerate}
              disabled={!selectedClass || !selectedSection || isGenerating}
              className="min-w-[200px]"
            >
              {isGenerating
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating...</>
                : <><Users className="mr-2 h-4 w-4" /> Generate Report Cards</>}
            </Button>
            {reportReady && (
              <Button onClick={handlePrint} variant="outline" className="gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                <Printer className="h-4 w-4" />
                Print All {students.length} Cards (A4 Landscape)
              </Button>
            )}
            {reportReady && (
              <Button onClick={handleExportExcel} variant="outline" className="gap-2 border-blue-300 text-blue-700 hover:bg-blue-50">
                <FileSpreadsheet className="h-4 w-4" />
                Export to Excel
              </Button>
            )}
            {reportReady && students.length > 0 && (
              <Button onClick={handlePublish} disabled={isPublishing} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                {isPublishing
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Publishing...</>
                  : <><Send className="h-4 w-4" /> Publish to Students</>}
              </Button>
            )}
          </div>
          {publishedCount !== null && (
            <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                {publishedCount} report card(s) published. Students and the View Results page now show these cards.
                If marks change later, generate and publish again.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview list */}
      {reportReady && students.length > 0 && (
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="pb-3 bg-emerald-50/50 border-b border-emerald-100">
            <CardTitle className="text-base flex items-center gap-2 text-emerald-800">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              {students.length} report card(s) ready — Class {selectedClass} {selectedSection}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {students.map((s, i) => {
                const gt    = calcGrandTotal(s, subjects, reportType, unit1Id, hyId, unit2Id, annualId);
                const pct   = subjects.length > 0 ? (gt / (subjects.length * maxPerSub)) * 100 : 0;
                const grade = getGrade(pct);
                return (
                  <div key={s.id} className="py-3 px-5 flex items-center justify-between gap-4 hover:bg-muted/5 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground text-sm w-7 text-right font-mono">{i + 1}.</span>
                      <div>
                        <p className="font-semibold">{s.name}</p>
                        <p className="text-xs text-muted-foreground">Adm: {s.admissionNumber} | Roll: {s.rollNo}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-5 text-sm">
                      <span><span className="text-muted-foreground text-xs">Total: </span><strong>{gt}/{subjects.length * maxPerSub}</strong></span>
                      <span><span className="text-muted-foreground text-xs">%: </span><strong>{pct.toFixed(1)}%</strong></span>
                      <span className={`font-bold px-2.5 py-1 rounded text-xs ${
                        pct >= 81 ? "bg-green-100 text-green-700" :
                        pct >= 61 ? "bg-blue-100 text-blue-700"  :
                        pct >= 33 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                      }`}>{grade}</span>
                      <span className="text-muted-foreground text-xs">Rank: <strong>#{s.rank}</strong></span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {reportReady && students.length === 0 && (
        <Card className="border-dashed bg-muted/10">
          <CardContent className="py-16 text-center text-muted-foreground">
            No active students found for Class {selectedClass} — {selectedSection}.<br/>
            Check that students are enrolled and not marked LEFT/TC/Inactive.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
