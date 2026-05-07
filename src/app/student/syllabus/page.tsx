"use client";

import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { BookOpen, Loader2, CheckCircle2, Clock, Circle, ChevronDown } from "lucide-react";

type ChapterStatus = "upcoming" | "ongoing" | "completed";
type ExamType = "unit_test_1" | "half_yearly" | "unit_test_2" | "annual";

const EXAMS: { key: ExamType; label: string; color: string; bg: string; border: string; badge: string }[] = [
    { key: "unit_test_1", label: "Unit Test 1",  color: "text-indigo-700",  bg: "bg-indigo-50",  border: "border-indigo-200",  badge: "bg-indigo-100 text-indigo-700"  },
    { key: "half_yearly", label: "Half Yearly",  color: "text-amber-700",   bg: "bg-amber-50",   border: "border-amber-200",   badge: "bg-amber-100 text-amber-700"    },
    { key: "unit_test_2", label: "Unit Test 2",  color: "text-purple-700",  bg: "bg-purple-50",  border: "border-purple-200",  badge: "bg-purple-100 text-purple-700"  },
    { key: "annual",      label: "Annual Exam",  color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", badge: "bg-emerald-100 text-emerald-700" },
];

interface Chapter {
    id: string; title: string; duration: string; durationUnit: string;
    description: string; status: ChapterStatus; order: number; exam: ExamType;
}

const STATUS_CONFIG: Record<ChapterStatus, { label: string; icon: any; color: string; bg: string; border: string }> = {
    upcoming:  { label: "Upcoming",  icon: Circle,       color: "text-gray-500",    bg: "bg-gray-50",    border: "border-gray-200"    },
    ongoing:   { label: "Ongoing",   icon: Clock,        color: "text-amber-600",   bg: "bg-amber-50",   border: "border-amber-200"   },
    completed: { label: "Completed", icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
};

const docId = (cls: string, subject: string) => `${cls}_${subject.replace(/\s+/g, "_")}`;

export default function StudentSyllabusPage() {
    const [studentClass, setStudentClass] = useState("");
    const [classSubjects, setClassSubjects] = useState<string[]>([]);
    const [selectedSubject, setSelectedSubject] = useState("");
    const [chapters, setChapters] = useState<Chapter[]>([]);
    const [loading, setLoading] = useState(false);
    const [openExams, setOpenExams] = useState<Set<ExamType>>(new Set(["unit_test_1"]));

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (user) => {
            if (!user) return;
            try {
                const snap = await getDoc(doc(db, "studentLookup", user.uid));
                if (snap.exists()) {
                    const d = snap.data();
                    const cls = d.class || d.className || "";
                    setStudentClass(cls);
                    if (cls) {
                        const subSnap = await getDoc(doc(db, "classSubjects", cls));
                        const subs: string[] = subSnap.exists()
                            ? (subSnap.data().subjects || []).map((s: any) => s.name as string) : [];
                        setClassSubjects(subs);
                        if (subs.length > 0) setSelectedSubject(subs[0]);
                    }
                }
            } catch { }
        });
        return () => unsub();
    }, []);

    useEffect(() => {
        if (!studentClass || !selectedSubject) return;
        setLoading(true);
        getDoc(doc(db, "syllabus", docId(studentClass, selectedSubject))).then(snap => {
            if (snap.exists()) {
                const raw: any[] = snap.data().chapters || [];
                setChapters(raw.map(c => ({ ...c, exam: c.exam || "unit_test_1" })).sort((a, b) => a.order - b.order));
            } else setChapters([]);
        }).catch(() => setChapters([])).finally(() => setLoading(false));
    }, [studentClass, selectedSubject]);

    const toggleExam = (exam: ExamType) => {
        setOpenExams(prev => {
            const next = new Set(prev);
            next.has(exam) ? next.delete(exam) : next.add(exam);
            return next;
        });
    };

    const totalCompleted = chapters.filter(c => c.status === "completed").length;
    const totalOngoing   = chapters.filter(c => c.status === "ongoing").length;

    return (
        <div className="space-y-6">
            <div className="rounded-2xl bg-gradient-to-br from-navy to-navy-light p-6 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.2) 0%, transparent 50%)` }} />
                <div className="relative z-10">
                    <p className="text-white/50 text-sm">Student Portal</p>
                    <h1 className="text-2xl font-bold text-white mt-1">📚 My Syllabus</h1>
                    <p className="text-white/40 text-sm mt-2">
                        {studentClass ? `Class ${studentClass} · Exam-wise chapter progress` : "Loading your class…"}
                    </p>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Select Subject</label>
                <div className="relative max-w-xs">
                    <select value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-navy bg-white appearance-none pr-8">
                        {classSubjects.length > 0
                            ? classSubjects.map(s => <option key={s}>{s}</option>)
                            : <option value="">No subjects configured</option>}
                    </select>
                    <ChevronDown className="absolute right-2 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
                {chapters.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                        <div className="flex justify-between text-xs mb-2">
                            <span className="font-semibold text-gray-600">{selectedSubject} Progress</span>
                            <span className="font-bold text-emerald-600">{Math.round((totalCompleted / chapters.length) * 100)}% completed</span>
                        </div>
                        <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden flex">
                            <div className="bg-emerald-500 h-full" style={{ width: `${(totalCompleted / chapters.length) * 100}%` }} />
                            <div className="bg-amber-400 h-full" style={{ width: `${(totalOngoing / chapters.length) * 100}%` }} />
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1">{totalCompleted} completed · {totalOngoing} ongoing · {chapters.length - totalCompleted - totalOngoing} upcoming</p>
                    </div>
                )}
            </div>

            {loading ? (
                <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-navy" /></div>
            ) : (
                <div className="space-y-4">
                    {EXAMS.map(exam => {
                        const examChapters = chapters.filter(c => c.exam === exam.key);
                        const examCompleted = examChapters.filter(c => c.status === "completed").length;
                        const isOpen = openExams.has(exam.key);
                        return (
                            <div key={exam.key} className={`rounded-2xl border ${exam.border} overflow-hidden shadow-sm`}>
                                <button onClick={() => toggleExam(exam.key)}
                                    className={`w-full flex flex-col sm:flex-row items-start sm:items-center justify-between px-5 py-4 ${exam.bg} hover:opacity-90 transition-opacity gap-3 sm:gap-0`}>
                                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                                        <span className={`text-base font-bold ${exam.color}`}>{exam.label}</span>
                                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${exam.badge}`}>{examChapters.length} chapters</span>
                                        {examChapters.length > 0 && <span className="text-xs text-gray-500 font-medium">{examCompleted}/{examChapters.length} done</span>}
                                    </div>
                                    <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                                        {examChapters.length > 0 && (
                                            <div className="w-20 h-1.5 bg-white/60 rounded-full overflow-hidden block">
                                                <div className="bg-emerald-500 h-full rounded-full transition-all" style={{ width: `${(examCompleted / examChapters.length) * 100}%` }} />
                                            </div>
                                        )}
                                        <ChevronDown className={`w-4 h-4 ${exam.color} transition-transform ${isOpen ? "rotate-180" : ""}`} />
                                    </div>
                                </button>
                                {isOpen && (
                                    <div className="p-4 space-y-2 bg-white">
                                        {examChapters.length === 0 ? (
                                            <div className="py-8 text-center">
                                                <p className="text-xs text-gray-400">No chapters for {exam.label} yet.</p>
                                            </div>
                                        ) : examChapters.map((ch, idx) => {
                                            const cfg = STATUS_CONFIG[ch.status];
                                            const Icon = cfg.icon;
                                            return (
                                                <div key={ch.id} className={`rounded-xl border p-4 ${ch.status === "upcoming" ? "bg-white border-gray-100" : `${cfg.bg} ${cfg.border}`}`}>
                                                    <div className="flex items-start gap-3">
                                                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 font-bold text-xs ${ch.status === "completed" ? "bg-emerald-100 text-emerald-700" : ch.status === "ongoing" ? "bg-amber-100 text-amber-700" : `${exam.bg} ${exam.color}`}`}>
                                                            {ch.status === "completed" ? <CheckCircle2 className="w-3.5 h-3.5" /> : idx + 1}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className={`font-bold ${ch.status === "completed" ? "text-emerald-700" : "text-navy"}`}>{ch.title}</span>
                                                                <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.color}`}>
                                                                    <Icon className="w-3 h-3" /> {cfg.label}
                                                                </span>
                                                            </div>
                                                            <p className="text-xs text-gray-400 mt-0.5">{ch.duration} {ch.durationUnit}</p>
                                                            {ch.description && <p className="text-xs text-gray-500 mt-1 leading-relaxed">{ch.description}</p>}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
