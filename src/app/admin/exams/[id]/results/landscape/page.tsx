"use client";

import { useState, useEffect, use } from "react";
import { collection, getDocs, doc, getDoc, collectionGroup } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Exam, Subject } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, Printer } from "lucide-react";
import Link from "next/link";

// Grading scale
function getGrade(pct: number): string {
    if (pct >= 90.5) return "A1";
    if (pct >= 81) return "A2";
    if (pct >= 71) return "B1";
    if (pct >= 61) return "B2";
    if (pct >= 51) return "C1";
    if (pct >= 41) return "C2";
    if (pct >= 33) return "D";
    return "E";
}

const CO_SCHOLASTIC_ITEMS = [
    { id: "workEd", label: "Work Education" },
    { id: "artEd", label: "Art Education" },
    { id: "sports", label: "Sports / Yoga / NCC" },
];

type MarksEntry = {
    obtained: number | null;
    total: number;
    perTest?: number | null;
    noteBook?: number | null;
    sea?: number | null;
};

type StudentResult = {
    id: string;
    name: string;
    admissionNumber: string;
    rollNo?: string;
    dob?: string;
    fatherName?: string;
    // per examId -> per subjectId -> MarksEntry
    examMarks: Record<string, Record<string, MarksEntry>>;
    coScholastic?: Record<string, { hy?: string; annual?: string }>;
    // attendance per term
    attendance: {
        t1WorkingDays: number; t1Present: number;
        hyWorkingDays: number; hyPresent: number;
        t2WorkingDays: number; t2Present: number;
        yrlWorkingDays: number; yrlPresent: number;
    };
};

// Count attendance days within a date range
function countAttendance(
    records: { date: string; studentStatus: string }[],
    fromDate: string, toDate: string,
): { present: number; total: number } {
    const from = new Date(fromDate).getTime();
    const to = new Date(toDate).getTime();
    let total = 0, present = 0;
    for (const rec of records) {
        const d = new Date(rec.date).getTime();
        if (d >= from && d <= to) {
            total++;
            if (rec.studentStatus === "present") present++;
        }
    }
    return { present, total };
}

export default function LandscapeReportPage({ params }: { params: Promise<{ id: string }> }) {
    const { id: examId } = use(params);

    const [currentExam, setCurrentExam] = useState<Exam | null>(null);
    const [allSessionExams, setAllSessionExams] = useState<Exam[]>([]);

    // The 4 companion exam IDs for the session
    const [unitExamId, setUnitExamId] = useState("");
    const [hyExamId, setHyExamId] = useState("");
    const [unit2ExamId, setUnit2ExamId] = useState("");
    // Annual = current exam (examId)

    const [selectedClass, setSelectedClass] = useState("");
    const [selectedSection, setSelectedSection] = useState("");
    const [availableClasses, setAvailableClasses] = useState<string[]>([]);
    const [availableSections, setAvailableSections] = useState<string[]>([]);

    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [students, setStudents] = useState<StudentResult[]>([]);

    const [isLoadingMeta, setIsLoadingMeta] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [reportReady, setReportReady] = useState(false);

    // Load current exam + all exams in session
    useEffect(() => {
        const load = async () => {
            setIsLoadingMeta(true);
            try {
                const examSnap = await getDoc(doc(db, "exams", examId));
                if (!examSnap.exists()) return;
                const exam = { id: examSnap.id, ...examSnap.data() } as Exam;
                setCurrentExam(exam);

                // Find all exams from same session if available
                const allSnap = await getDocs(collection(db, "exams"));
                const all = allSnap.docs.map(d => ({ id: d.id, ...d.data() }) as Exam);

                let sessionExams: Exam[] = [];
                if (exam.session) {
                    sessionExams = all.filter(e => e.session === exam.session);
                } else {
                    sessionExams = all;
                }
                setAllSessionExams(sessionExams);

                // Auto-fill companion exams by name matching (more reliable than position)
                const unitTests = sessionExams
                    .filter(e => e.examType === "Unit Test")
                    .sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""));
                const unitI = unitTests.find(e => /unit[\s-]*(i|1)(?![i\d])/i.test(e.name || ""))
                    ?? unitTests[0];
                const unit2 = unitTests.find(e => /unit[\s-]*(ii|2)/i.test(e.name || ""))
                    ?? unitTests[1];
                const hy = sessionExams.find(e => e.examType === "Term Exam"
                    || /half[\s-]*year/i.test(e.name || ""));
                if (unitI) setUnitExamId(unitI.id!);
                if (hy) setHyExamId(hy.id!);
                if (unit2) setUnit2ExamId(unit2.id!);
                // If current exam IS the annual, we're fine. If not, set unit as current.
                if (exam.examType === "Unit Test" && !unitI) setUnitExamId(examId);

                // Load available classes from the current exam
                const classesApplicable = exam.classesApplicable || [];
                setAvailableClasses(classesApplicable);
                if (classesApplicable.length === 1) setSelectedClass(classesApplicable[0]);

                // Load sections from profiles
                const profSnap = await getDocs(collectionGroup(db, "profiles"));
                const classSecMap: Record<string, Set<string>> = {};
                profSnap.docs.forEach(d => {
                    const data = d.data();
                    const cn = data.className || data.currentClass || "";
                    const sec = data.section || "";
                    if (cn && sec) {
                        if (!classSecMap[cn]) classSecMap[cn] = new Set();
                        classSecMap[cn].add(sec);
                    }
                });
                // Section loading: scan profiles for section names matching accessible classes
                const allSec = new Set<string>();
                const classesApplicableNorms = classesApplicable.map(c => c.replace(/^class\s*/i, "").trim());
                profSnap.docs.forEach(d => {
                    // Try to get className from path parts first (most reliable)
                    const pathParts = d.ref.path.split("/");
                    const clsIdx = pathParts.indexOf("classes");
                    const secIdx = pathParts.indexOf("sections");
                    let cn = clsIdx >= 0 ? pathParts[clsIdx + 1] : (d.data().className || d.data().currentClass || "");
                    const sec = secIdx >= 0 ? pathParts[secIdx + 1] : (d.data().section || "");
                    const normCn = cn.replace(/^class\s*/i, "").trim();
                    if (sec && (classesApplicable.includes(cn) || classesApplicableNorms.includes(normCn)
                        || classesApplicable.includes(`Class ${normCn}`) || classesApplicableNorms.includes(normCn))) {
                        allSec.add(sec);
                    }
                });
                setAvailableSections(Array.from(allSec));
            } finally {
                setIsLoadingMeta(false);
            }
        };
        load();
    }, [examId]);

    // When class changes, load subjects
    useEffect(() => {
        if (!selectedClass) return;
        const loadSubjects = async () => {
            const normCls = selectedClass.replace(/^class\s*/i, "").trim();
            for (const key of [normCls, selectedClass]) {
                const subDoc = await getDoc(doc(db, "classSubjects", key));
                if (subDoc.exists()) {
                    const rawSubs = subDoc.data().subjects || [];
                    setSubjects(rawSubs.map((s: any) =>
                        typeof s === "object" ? s : { id: s, name: s, maxMarks: 100 }
                    ));
                    return;
                }
            }
            setSubjects([]);
        };
        loadSubjects();
    }, [selectedClass]);

    const handleGenerate = async () => {
        if (!selectedClass || !selectedSection) return;
        setIsGenerating(true);
        setReportReady(false);
        try {
            // 1. Fetch student profiles
            const normCls = selectedClass.replace(/^class\s*/i, "").trim();
            let allProfiles: any[] = [];

            for (const cls of [selectedClass, normCls]) {
                const snap = await getDocs(
                    collection(db, "users", "classes", cls, "sections", selectedSection, "students", "profiles")
                );
                if (snap.docs.length > 0) {
                    allProfiles = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                    break;
                }
            }
            if (allProfiles.length === 0) {
                // fallback 1: try "Class N" variant if tried "N", or vice versa
                const altCls = normCls !== selectedClass ? selectedClass : `Class ${normCls}`;
                const altSnap = await getDocs(
                    collection(db, "users", "classes", altCls, "sections", selectedSection, "students", "profiles")
                );
                if (altSnap.docs.length > 0) {
                    allProfiles = altSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                }
            }
            if (allProfiles.length === 0) {
                // fallback 2: query all users and filter
                const usersSnap = await getDocs(collection(db, "users"));
                allProfiles = usersSnap.docs
                    .map(d => ({ id: d.id, ...d.data() }))
                    .filter((d: any) =>
                        (d.role === "student") &&
                        (d.className === selectedClass || d.className === normCls ||
                         d.className === `Class ${normCls}` ||
                         d.currentClass === selectedClass || d.currentClass === normCls) &&
                        d.section === selectedSection
                    );
            }

            // 2. Fetch marks for all 4 exams
            const examIds: Record<string, string> = {
                unit1: unitExamId || "",
                hy: hyExamId || "",
                unit2: unit2ExamId || "",
                annual: examId,
            };

            const allMarksData: Record<string, Record<string, Record<string, MarksEntry>>> = {};
            for (const [key, eId] of Object.entries(examIds)) {
                if (!eId) continue;
                allMarksData[eId] = {};
                for (const cls of [normCls, selectedClass, `Class ${normCls}`]) {
                    try {
                        const snap = await getDocs(
                            collection(db, "results", eId, "classes", cls, "sections", selectedSection, "students")
                        );
                        snap.docs.forEach(d => {
                            const data = d.data();
                            if (!allMarksData[eId][d.id]) allMarksData[eId][d.id] = {};
                            Object.entries(data.marks || {}).forEach(([subId, m]: [string, any]) => {
                                allMarksData[eId][d.id][subId] = {
                                    obtained: m.obtained,
                                    total: m.total,
                                    perTest: m.perTest,
                                    noteBook: m.noteBook,
                                    sea: m.sea,
                                };
                            });
                        });
                        if (Object.keys(allMarksData[eId]).length > 0) break;
                    } catch { /* try next cls key */ }
                }
            }

            // 3. Fetch co-scholastic from annual exam marks
            const coSchoData: Record<string, Record<string, { hy?: string; annual?: string }>> = {};
            for (const cls of [normCls, selectedClass, `Class ${normCls}`]) {
                try {
                    const snap = await getDocs(
                        collection(db, "results", examId, "classes", cls, "sections", selectedSection, "students")
                    );
                    snap.docs.forEach(d => {
                        const data = d.data();
                        if (data.coScholastic) {
                            coSchoData[d.id] = data.coScholastic;
                        }
                    });
                    if (snap.docs.length > 0) break;
                } catch { /* next */ }
            }

            // 4. Fetch attendance for the class-section
            const attendanceSnap = await getDocs(collection(db, "attendance"));
            const attendancePerStudent: Record<string, { date: string; studentStatus: string }[]> = {};

            attendanceSnap.docs.forEach(d => {
                const data = d.data();
                const cls = data.cls || data.className || "";
                const sec = data.section || "";
                const normDataCls = cls.replace(/^class\s*/i, "").trim();

                if (
                    (cls === selectedClass || cls === normCls || normDataCls === normCls) &&
                    sec === selectedSection
                ) {
                    const dateStr = data.date || "";
                    const records = data.records || {};
                    Object.entries(records).forEach(([uid, status]: [string, any]) => {
                        if (!attendancePerStudent[uid]) attendancePerStudent[uid] = [];
                        attendancePerStudent[uid].push({ date: dateStr, studentStatus: status });
                    });
                }
            });

            // Determine date ranges for attendance
            const getExamEndDate = (eId: string) => {
                const e = allSessionExams.find(ex => ex.id === eId);
                return e?.endDate || "";
            };
            const sessionStart = currentExam?.session
                ? `${currentExam.session.split("-")[0]}-04-01`
                : (allSessionExams.reduce((min, e) => e.startDate < min ? e.startDate : min, "9999-12-31"));
            const unit1End = getExamEndDate(unitExamId);
            const hyEnd = getExamEndDate(hyExamId);
            const unit2End = getExamEndDate(unit2ExamId);
            const annualEnd = currentExam?.endDate || "";

            // 5. Build student result objects
            const studentResults: StudentResult[] = allProfiles.map(profile => {
                const uid = profile.id;
                const attList = attendancePerStudent[uid] || [];

                const att = {
                    t1WorkingDays: 0, t1Present: 0,
                    hyWorkingDays: 0, hyPresent: 0,
                    t2WorkingDays: 0, t2Present: 0,
                    yrlWorkingDays: 0, yrlPresent: 0,
                };

                if (sessionStart && unit1End) {
                    const r = countAttendance(attList, sessionStart, unit1End);
                    att.t1WorkingDays = r.total; att.t1Present = r.present;
                }
                if (unit1End && hyEnd) {
                    const r = countAttendance(attList, unit1End, hyEnd);
                    att.hyWorkingDays = r.total; att.hyPresent = r.present;
                }
                if (hyEnd && unit2End) {
                    const r = countAttendance(attList, hyEnd, unit2End);
                    att.t2WorkingDays = r.total; att.t2Present = r.present;
                }
                if (unit2End && annualEnd) {
                    const r = countAttendance(attList, unit2End, annualEnd);
                    att.yrlWorkingDays = r.total; att.yrlPresent = r.present;
                }

                const examMarks: Record<string, Record<string, MarksEntry>> = {};
                for (const [key, eId] of Object.entries(examIds)) {
                    if (eId && allMarksData[eId]) {
                        examMarks[eId] = allMarksData[eId][uid] || {};
                    }
                }

                return {
                    id: uid,
                    name: `${profile.firstName || ""} ${profile.lastName || ""}`.trim() || "Unknown",
                    admissionNumber: profile.admissionNumber || "—",
                    rollNo: profile.rollNo || profile.roll || "—",
                    dob: profile.dob || profile.dateOfBirth || "",
                    fatherName: profile.fatherName || profile.guardianName || "",
                    examMarks,
                    coScholastic: coSchoData[uid] || {},
                    attendance: att,
                };
            });

            studentResults.sort((a, b) => a.name.localeCompare(b.name));

            // Compute rank
            // For Unit Tests: obtained = PT+NB+SEA (saved by teacher). Use it, with fallback to recalculate.
            const calcUnitObt = (m: MarksEntry | undefined) =>
                m ? (m.obtained ?? ((m.perTest ?? 0) + (m.noteBook ?? 0) + (m.sea ?? 0))) : 0;
            const grandTotals = studentResults.map(s => {
                let total = 0;
                subjects.forEach(sub => {
                    const sid = (sub.id || sub.name) as string;
                    const u1 = unitExamId ? calcUnitObt(s.examMarks[unitExamId]?.[sid]) : 0;
                    const hy = hyExamId ? (s.examMarks[hyExamId]?.[sid]?.obtained ?? 0) : 0;
                    const u2 = unit2ExamId ? calcUnitObt(s.examMarks[unit2ExamId]?.[sid]) : 0;
                    const ann = s.examMarks[examId]?.[sid]?.obtained ?? 0;
                    total += (u1 + hy + u2 + ann);
                });
                return { id: s.id, total };
            });
            grandTotals.sort((a, b) => b.total - a.total);
            const rankMap: Record<string, number> = {};
            grandTotals.forEach((gt, idx) => { rankMap[gt.id] = idx + 1; });

            setStudents(studentResults.map(s => ({ ...s, rank: rankMap[s.id] })));
            setReportReady(true);
        } catch (err) {
            console.error("Generate error:", err);
            alert("Failed to generate report cards.");
        } finally {
            setIsGenerating(false);
        }
    };

    const handlePrint = () => {
        if (students.length === 0) return;

        const getVal = (s: StudentResult, eId: string, subId: string, field: "obtained" | "perTest" | "noteBook" | "sea"): string => {
            const v = s.examMarks[eId]?.[subId]?.[field];
            return (v !== undefined && v !== null) ? String(v) : "";
        };

        const pages = students.map(s => {
            const sRank = (s as any).rank || "—";
            let grandTotalObtained = 0;
            const maxGrandTotal = subjects.length * 200;

            const subjectRows = subjects.map(sub => {
                const sid = (sub.id || sub.name) as string;
                // Term 1
                const u1PT = Number(getVal(s, unitExamId, sid, "perTest") || 0);
                const u1NB = Number(getVal(s, unitExamId, sid, "noteBook") || 0);
                const u1SEA = Number(getVal(s, unitExamId, sid, "sea") || 0);
                const u1Total = unitExamId ? (u1PT + u1NB + u1SEA) : 0;
                const hyObt = Number(getVal(s, hyExamId, sid, "obtained") || 0);
                const t1Total = u1Total + hyObt;

                // Term 2
                const u2PT = Number(getVal(s, unit2ExamId, sid, "perTest") || 0);
                const u2NB = Number(getVal(s, unit2ExamId, sid, "noteBook") || 0);
                const u2SEA = Number(getVal(s, unit2ExamId, sid, "sea") || 0);
                const u2Total = unit2ExamId ? (u2PT + u2NB + u2SEA) : 0;
                const annObt = Number(getVal(s, examId, sid, "obtained") || 0);
                const t2Total = u2Total + annObt;

                const grandTotal = t1Total + t2Total;
                grandTotalObtained += grandTotal;

                const gradeForSub = getGrade(grandTotal > 0 ? (grandTotal / 200) * 100 : 0);

                const fmt = (v: number, eId: string, hideIfNoExam?: boolean) =>
                    hideIfNoExam && !eId ? "—" :
                        v > 0 ? String(v) : (eId ? "0" : "—");

                return `<tr>
                    <td class="subj-name">${sub.name}</td>
                    <td class="ctr bdr-l">${fmt(u1PT, unitExamId, true)}</td>
                    <td class="ctr">${fmt(u1NB, unitExamId, true)}</td>
                    <td class="ctr">${fmt(u1SEA, unitExamId, true)}</td>
                    <td class="ctr bold">${unitExamId ? u1Total : "—"}</td>
                    <td class="ctr">${hyExamId ? (hyObt > 0 ? hyObt : "0") : "—"}</td>
                    <td class="ctr bold bdr-r">${hyExamId || unitExamId ? t1Total : "—"}</td>
                    <td class="ctr bdr-l">${fmt(u2PT, unit2ExamId, true)}</td>
                    <td class="ctr">${fmt(u2NB, unit2ExamId, true)}</td>
                    <td class="ctr">${fmt(u2SEA, unit2ExamId, true)}</td>
                    <td class="ctr bold">${unit2ExamId ? u2Total : "—"}</td>
                    <td class="ctr">${annObt > 0 ? annObt : "0"}</td>
                    <td class="ctr bold bdr-r">${t2Total}</td>
                    <td class="ctr bold grand">${grandTotal}</td>
                    <td class="ctr grade">${gradeForSub}</td>
                </tr>`;
            }).join("");

            const overallPct = maxGrandTotal > 0 ? ((grandTotalObtained / maxGrandTotal) * 100) : 0;
            const overallGrade = getGrade(overallPct);
            const pctFormatted = overallPct.toFixed(1);

            const coSchoRows = CO_SCHOLASTIC_ITEMS.map(cs => {
                const hy = s.coScholastic?.[cs.id]?.hy || "—";
                const ann = s.coScholastic?.[cs.id]?.annual || "—";
                return `<tr><td>${cs.label}</td><td class="ctr">${hy}</td><td class="ctr">${ann}</td></tr>`;
            }).join("");

            const att = s.attendance;

            return `
<div class="page">
    <div class="report-header">
        <div class="school-name">International Access School</div>
        <div class="report-title">REPORT CARD — ${currentExam?.session ? `Session ${currentExam.session}` : "Academic Session"}</div>
    </div>
    
    <div class="student-info">
        <div class="info-group"><span class="info-lbl">Student Name</span><span class="info-val">${s.name}</span></div>
        <div class="info-group"><span class="info-lbl">Class &amp; Section</span><span class="info-val">${selectedClass} — ${selectedSection}</span></div>
        <div class="info-group"><span class="info-lbl">Adm. Number</span><span class="info-val">${s.admissionNumber}</span></div>
        <div class="info-group"><span class="info-lbl">Roll No.</span><span class="info-val">${s.rollNo || "—"}</span></div>
        <div class="info-group"><span class="info-lbl">Date of Birth</span><span class="info-val">${s.dob || "—"}</span></div>
        <div class="info-group"><span class="info-lbl">Father's Name</span><span class="info-val">${s.fatherName || "—"}</span></div>
    </div>

    <div class="marks-section">
        <table class="marks-table">
            <colgroup>
                <col style="width:120px">
                <col style="width:36px"><col style="width:36px"><col style="width:36px"><col style="width:40px"><col style="width:42px"><col style="width:42px">
                <col style="width:36px"><col style="width:36px"><col style="width:36px"><col style="width:40px"><col style="width:42px"><col style="width:42px">
                <col style="width:54px"><col style="width:40px">
            </colgroup>
            <thead>
                <tr class="term-header">
                    <th rowspan="3" class="subj-hd">Subjects</th>
                    <th colspan="6" class="term-hd bdr-l bdr-r">TERM-1 (100 Marks)</th>
                    <th colspan="6" class="term-hd bdr-r">TERM-2 (100 Marks)</th>
                    <th colspan="2" class="term-hd">Over All</th>
                </tr>
                <tr class="sub-header">
                    <th colspan="5" class="bdr-l">Unit I Test (20)</th>
                    <th rowspan="2" class="bdr-r">Half<br/>Yearly<br/>/80</th>
                    <th colspan="5" class="bdr-l">Unit II Test (20)</th>
                    <th rowspan="2" class="bdr-r">Yearly<br/>Exam<br/>/80</th>
                    <th rowspan="2" class="grand">Grand<br/>Total<br/>/200</th>
                    <th rowspan="2">Grade</th>
                </tr>
                <tr class="sub-header2">
                    <th class="bdr-l ctr">Per<br/>Test<br/>/10</th>
                    <th class="ctr">Note<br/>Book<br/>/5</th>
                    <th class="ctr">SEA<br/>/5</th>
                    <th class="ctr bold">Total<br/>/20</th>
                    <th class="ctr bdr-r">TOTAL<br/>/100</th>
                    <th class="bdr-l ctr">Per<br/>Test<br/>/10</th>
                    <th class="ctr">Note<br/>Book<br/>/5</th>
                    <th class="ctr">SEA<br/>/5</th>
                    <th class="ctr bold">Total<br/>/20</th>
                    <th class="ctr bdr-r">TOTAL<br/>/100</th>
                </tr>
            </thead>
            <tbody>
                ${subjectRows}
                <tr class="totals-row">
                    <td class="bold">TOTAL</td>
                    <td class="ctr bdr-l" colspan="5">—</td>
                    <td class="ctr bold bdr-r">—</td>
                    <td class="ctr bdr-l" colspan="5">—</td>
                    <td class="ctr bold bdr-r">—</td>
                    <td class="ctr bold grand">${grandTotalObtained}</td>
                    <td class="ctr grade bold">${overallGrade}</td>
                </tr>
            </tbody>
        </table>
    </div>

    <div class="bottom-section">
        <div class="co-scho-sec">
            <div class="sec-title">Co-Scholastic Activities</div>
            <table class="co-table">
                <thead><tr><th>Activity</th><th>Half Yearly</th><th>Annual</th></tr></thead>
                <tbody>${coSchoRows}</tbody>
            </table>
        </div>

        <div class="attendance-sec">
            <div class="sec-title">Attendance</div>
            <table class="att-table">
                <thead><tr><th>Term</th><th>WD</th><th>Present</th></tr></thead>
                <tbody>
                    <tr><td>T-1</td><td class="ctr">${att.t1WorkingDays}</td><td class="ctr">${att.t1Present}</td></tr>
                    <tr><td>HY</td><td class="ctr">${att.hyWorkingDays}</td><td class="ctr">${att.hyPresent}</td></tr>
                    <tr><td>T-2</td><td class="ctr">${att.t2WorkingDays}</td><td class="ctr">${att.t2Present}</td></tr>
                    <tr><td>YRLY</td><td class="ctr">${att.yrlWorkingDays}</td><td class="ctr">${att.yrlPresent}</td></tr>
                    <tr class="bold"><td>Total</td>
                        <td class="ctr">${att.t1WorkingDays + att.hyWorkingDays + att.t2WorkingDays + att.yrlWorkingDays}</td>
                        <td class="ctr">${att.t1Present + att.hyPresent + att.t2Present + att.yrlPresent}</td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div class="result-summary">
            <div class="sec-title">Result Summary</div>
            <div class="summary-grid">
                <div class="summary-item"><span class="s-lbl">Grand Total</span><span class="s-val">${grandTotalObtained} / ${subjects.length * 200}</span></div>
                <div class="summary-item"><span class="s-lbl">Percentage</span><span class="s-val">${pctFormatted}%</span></div>
                <div class="summary-item"><span class="s-lbl">Overall Grade</span><span class="s-val grade-big">${overallGrade}</span></div>
                <div class="summary-item"><span class="s-lbl">Class Position</span><span class="s-val">${sRank}</span></div>
            </div>
        </div>
    </div>

    <div class="signatures">
        <div class="sig-box"><div class="sig-line"></div><div class="sig-name">Class Teacher</div></div>
        <div class="sig-box"><div class="sig-line"></div><div class="sig-name">Examination Controller</div></div>
        <div class="sig-box"><div class="sig-line"></div><div class="sig-name">Principal</div></div>
        <div class="sig-box"><div class="sig-line"></div><div class="sig-name">Parent / Guardian</div></div>
    </div>
</div>`;
        }).join("");

        const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<title>Landscape Report Cards — ${selectedClass} ${selectedSection}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:Arial,sans-serif;background:#f4f4f4;font-size:10px;}
.page{background:#fff;width:297mm;min-height:210mm;padding:5mm;margin:0 auto 6mm;page-break-after:always;page-break-inside:avoid;}
.report-header{text-align:center;border-bottom:2px solid #1a2e4c;padding-bottom:4px;margin-bottom:4px;}
.school-name{font-size:16px;font-weight:900;color:#1a2e4c;letter-spacing:1px;}
.report-title{font-size:10px;color:#555;font-weight:bold;text-transform:uppercase;letter-spacing:1px;}
.student-info{display:flex;flex-wrap:wrap;gap:2px 12px;background:#f0f4f8;padding:4px 6px;border-radius:4px;margin-bottom:4px;}
.info-group{display:flex;flex-direction:column;min-width:120px;}
.info-lbl{font-size:7px;color:#888;text-transform:uppercase;font-weight:bold;letter-spacing:.5px;}
.info-val{font-size:10px;font-weight:700;color:#1a2e4c;}
.marks-section{margin-bottom:4px;}
.marks-table{width:100%;border-collapse:collapse;font-size:9px;}
.marks-table th,.marks-table td{border:1px solid #ccc;padding:1.5px 2px;vertical-align:middle;}
.marks-table thead th{background:#1a2e4c;color:#fff;text-align:center;font-size:8.5px;}
.term-hd{font-size:9px;font-weight:bold;}
.sub-header th,.sub-header2 th{font-size:7.5px;}
.subj-hd{text-align:left!important;font-size:9px;vertical-align:middle;}
.subj-name{text-align:left;padding-left:4px;font-size:8.5px;}
.ctr{text-align:center;}
.bold{font-weight:bold;}
.bdr-l{border-left:2px solid #1a2e4c!important;}
.bdr-r{border-right:2px solid #1a2e4c!important;}
.grand{background:#fff8e1;font-weight:bold;}
.grade{background:#e8f5e9;font-weight:bold;color:#1a6b2e;}
.totals-row td{background:#f8fafc;font-weight:bold;}
.bottom-section{display:flex;gap:6px;margin-bottom:4px;}
.co-scho-sec{flex:1.2;}
.attendance-sec{flex:.7;}
.result-summary{flex:1;}
.sec-title{font-size:8px;font-weight:bold;text-transform:uppercase;letter-spacing:.5px;color:#1a2e4c;border-bottom:1px solid #1a2e4c;margin-bottom:2px;padding-bottom:1px;}
.co-table,.att-table{width:100%;border-collapse:collapse;font-size:8.5px;}
.co-table th,.co-table td,.att-table th,.att-table td{border:1px solid #ccc;padding:2px 3px;}
.co-table thead th,.att-table thead th{background:#e8eef5;font-weight:bold;text-align:center;}
.summary-grid{display:grid;grid-template-columns:1fr 1fr;gap:3px;}
.summary-item{background:#f8fafc;border:1px solid #e5e7eb;border-radius:3px;padding:3px 5px;display:flex;flex-direction:column;}
.s-lbl{font-size:7px;color:#888;text-transform:uppercase;letter-spacing:.5px;}
.s-val{font-size:13px;font-weight:900;color:#1a2e4c;}
.grade-big{color:#1a6b2e;font-size:18px;}
.signatures{display:flex;gap:15px;justify-content:space-around;padding-top:4px;border-top:1px solid #e5e7eb;margin-top:4px;}
.sig-box{text-align:center;flex:1;}
.sig-line{border-bottom:2px dashed #aaa;margin:0 auto 3px;height:20px;}
.sig-name{font-size:7.5px;text-transform:uppercase;letter-spacing:.5px;color:#555;font-weight:bold;}
@page{size:A4 landscape;margin:5mm;}
@media print{
    body{background:#fff;}
    .page{margin:0;box-shadow:none;}
}
</style></head><body>${pages}</body></html>`;

        const pw = window.open("", "_blank", "width=1200,height=800");
        if (!pw) { alert("Please allow popups to print."); return; }
        pw.document.write(html);
        pw.document.close();
        pw.focus();
        setTimeout(() => pw.print(), 800);
    };

    if (isLoadingMeta) {
        return (
            <div className="flex items-center justify-center p-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    const examOptions = allSessionExams.filter(e => e.id !== examId);

    return (
        <div className="p-6 space-y-6 max-w-5xl">
            <div className="flex items-center gap-3">
                <Link href={`/admin/exams/${examId}/results/view`}>
                    <Button variant="ghost" size="icon" className="h-8 w-8">&larr;</Button>
                </Link>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Landscape Report Cards</h1>
                    <p className="text-muted-foreground">
                        {currentExam?.name}
                        {currentExam?.session && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">Session {currentExam.session}</span>}
                    </p>
                </div>
            </div>

            <Card className="border-border/50 shadow-sm">
                <CardHeader className="bg-muted/10 border-b pb-4">
                    <CardTitle className="text-lg">Setup — Companion Exams & Class</CardTitle>
                    <p className="text-sm text-muted-foreground">
                        Select the 3 companion exams for the 4-exam report card. Columns for unselected exams will appear blank.
                    </p>
                </CardHeader>
                <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Exam selectors */}
                    <div className="space-y-2">
                        <Label>Unit I Test (exam)</Label>
                        <Select value={unitExamId || "__none__"} onValueChange={v => setUnitExamId(v === "__none__" ? "" : v)}>
                            <SelectTrigger><SelectValue placeholder="Select Unit I exam" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__none__">— Leave blank —</SelectItem>
                                {allSessionExams.map(e => (
                                    <SelectItem key={e.id} value={e.id!}>{e.name} {e.examType ? `(${e.examType})` : ""}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Half Yearly (Term Exam)</Label>
                        <Select value={hyExamId || "__none__"} onValueChange={v => setHyExamId(v === "__none__" ? "" : v)}>
                            <SelectTrigger><SelectValue placeholder="Select Half Yearly exam" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__none__">— Leave blank —</SelectItem>
                                {allSessionExams.map(e => (
                                    <SelectItem key={e.id} value={e.id!}>{e.name} {e.examType ? `(${e.examType})` : ""}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Unit II Test (exam)</Label>
                        <Select value={unit2ExamId || "__none__"} onValueChange={v => setUnit2ExamId(v === "__none__" ? "" : v)}>
                            <SelectTrigger><SelectValue placeholder="Select Unit II exam" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__none__">— Leave blank —</SelectItem>
                                {allSessionExams.map(e => (
                                    <SelectItem key={e.id} value={e.id!}>{e.name} {e.examType ? `(${e.examType})` : ""}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Annual / Current Exam</Label>
                        <div className="px-3 py-2 rounded-md border bg-muted/10 text-sm font-medium text-muted-foreground">
                            {currentExam?.name} ← (current exam, auto-selected)
                        </div>
                    </div>

                    {/* Class & Section */}
                    <div className="space-y-2">
                        <Label>Class <span className="text-red-500">*</span></Label>
                        <Select value={selectedClass} onValueChange={v => { setSelectedClass(v); setSelectedSection(""); setReportReady(false); }}>
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
                        <Select value={selectedSection} onValueChange={v => { setSelectedSection(v); setReportReady(false); }}>
                            <SelectTrigger><SelectValue placeholder="Select section" /></SelectTrigger>
                            <SelectContent>
                                {availableSections.map(sec => (
                                    <SelectItem key={sec} value={sec}>{sec}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="md:col-span-2 flex gap-3">
                        <Button
                            onClick={handleGenerate}
                            disabled={!selectedClass || !selectedSection || isGenerating}
                            className="min-w-[180px]"
                        >
                            {isGenerating
                                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating...</>
                                : "Generate Report Cards"}
                        </Button>
                        {reportReady && (
                            <Button onClick={handlePrint} variant="outline" className="gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                                <Printer className="h-4 w-4" />
                                Print All {students.length} Report Cards (A4 Landscape)
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            {reportReady && students.length > 0 && (
                <Card className="border-border/50 shadow-sm">
                    <CardContent className="p-4">
                        <p className="text-sm text-muted-foreground mb-3">
                            Preview — {students.length} student(s) in Class {selectedClass} — {selectedSection}
                        </p>
                        <div className="divide-y">
                            {students.map((s, i) => {
                                let grandTotal = 0;
                                subjects.forEach(sub => {
                                    const sid = (sub.id || sub.name) as string;
                                    const u1 = (unitExamId ? s.examMarks[unitExamId]?.[sid]?.obtained : null) ?? 0;
                                    const hy = (hyExamId ? s.examMarks[hyExamId]?.[sid]?.obtained : null) ?? 0;
                                    const u2 = (unit2ExamId ? s.examMarks[unit2ExamId]?.[sid]?.obtained : null) ?? 0;
                                    const ann = s.examMarks[examId]?.[sid]?.obtained ?? 0;
                                    grandTotal += u1 + hy + u2 + ann;
                                });
                                const pct = subjects.length > 0 ? (grandTotal / (subjects.length * 200)) * 100 : 0;
                                return (
                                    <div key={s.id} className="py-3 flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-3">
                                            <span className="text-muted-foreground text-sm w-6 text-right">{i + 1}.</span>
                                            <div>
                                                <p className="font-semibold">{s.name}</p>
                                                <p className="text-xs text-muted-foreground">Adm: {s.admissionNumber}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-6 text-sm">
                                            <span><span className="text-muted-foreground text-xs">Grand Total: </span><strong>{grandTotal}</strong></span>
                                            <span><span className="text-muted-foreground text-xs">%: </span><strong>{pct.toFixed(1)}%</strong></span>
                                            <span className={`font-bold px-2 py-0.5 rounded text-xs ${
                                                pct >= 81 ? "bg-green-100 text-green-700" :
                                                pct >= 61 ? "bg-blue-100 text-blue-700" :
                                                pct >= 33 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                                            }`}>{getGrade(pct)}</span>
                                            <span className="text-muted-foreground text-xs">Rank: <strong>#{(s as any).rank}</strong></span>
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
                        No students found for Class {selectedClass} — {selectedSection}. Make sure students are enrolled and marks are entered.
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
