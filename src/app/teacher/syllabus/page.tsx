"use client";

import { useState, useEffect } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { BookOpen, Loader2, CheckCircle2, Clock, Circle, ChevronDown } from "lucide-react";
import toast from "react-hot-toast";

const CLASSES = ["NUR", "LKG", "UKG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
const STATUSES = ["upcoming", "ongoing", "completed"] as const;
type ChapterStatus = typeof STATUSES[number];
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

const STATUS_CONFIG: Record<ChapterStatus, { label: string; icon: any; color: string; bg: string }> = {
    upcoming:  { label: "Upcoming",  icon: Circle,       color: "text-gray-500",    bg: "bg-gray-100"    },
    ongoing:   { label: "Ongoing",   icon: Clock,        color: "text-amber-600",   bg: "bg-amber-100"   },
    completed: { label: "Completed", icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-100" },
};

const docId = (cls: string, subject: string) => `${cls}_${subject.replace(/\s+/g, "_")}`;

export default function TeacherSyllabusPage() {
    const [teacherData, setTeacherData] = useState<any>(null);
    const [selectedClass, setSelectedClass] = useState("");
    const [classSubjects, setClassSubjects] = useState<string[]>([]);
    const [selectedSubject, setSelectedSubject] = useState("");
    const [chapters, setChapters] = useState<Chapter[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [openExams, setOpenExams] = useState<Set<ExamType>>(new Set(["unit_test_1"]));

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (user) => {
            if (!user) return;
            const snap = await getDoc(doc(db, "teachers", user.uid));
            if (snap.exists()) {
                const d = snap.data();
                setTeacherData(d);
                const subjects: string[] = d.subjects || [];
                if (subjects.length > 0) setSelectedSubject(subjects[0]);
            }
        });
        return () => unsub();
    }, []);

    useEffect(() => {
        if (!selectedClass) return;
        setSelectedSubject("");
        setChapters([]);
        getDoc(doc(db, "classSubjects", selectedClass)).then(snap => {
            const subs: string[] = snap.exists()
                ? (snap.data().subjects || []).map((s: any) => s.name as string)
                : [];
            const mySubjects: string[] = teacherData?.subjects || [];
            const filtered = mySubjects.length > 0 ? subs.filter(s => mySubjects.includes(s)) : subs;
            setClassSubjects(filtered.length > 0 ? filtered : subs);
            if (filtered.length > 0) setSelectedSubject(filtered[0]);
            else if (subs.length > 0) setSelectedSubject(subs[0]);
        }).catch(() => setClassSubjects([]));
    }, [selectedClass, teacherData]);

    useEffect(() => {
        if (!selectedClass || !selectedSubject) return;
        const fetch = async () => {
            setLoading(true);
            try {
                const snap = await getDoc(doc(db, "syllabus", docId(selectedClass, selectedSubject)));
                if (snap.exists()) {
                    const raw: any[] = snap.data().chapters || [];
                    setChapters(raw.map(c => ({ ...c, exam: c.exam || "unit_test_1" })).sort((a, b) => a.order - b.order));
                } else setChapters([]);
            } catch { } finally { setLoading(false); }
        };
        fetch();
    }, [selectedClass, selectedSubject]);

    const changeStatus = async (id: string, status: ChapterStatus) => {
        const updated = chapters.map(c => c.id === id ? { ...c, status } : c);
        setSaving(true);
        try {
            await setDoc(doc(db, "syllabus", docId(selectedClass, selectedSubject)), {
                class: selectedClass, subject: selectedSubject,
                chapters: updated, updatedAt: serverTimestamp(),
            });
            setChapters(updated);
            toast.success("Status updated");
        } catch { toast.error("Failed to update"); }
        finally { setSaving(false); }
    };

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
            <div className="rounded-2xl gradient-navy p-6 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.2) 0%, transparent 50%)` }} />
                <div className="relative z-10">
                    <p className="text-white/50 text-sm">Teacher Portal</p>
                    <h1 className="text-2xl font-bold text-white mt-1">📚 Syllabus</h1>
                    <p className="text-white/40 text-sm mt-2">View and update chapter progress exam-wise.</p>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex flex-wrap gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5">Class</label>
                        <div className="relative">
                            <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)}
                                className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-navy bg-white pr-8 appearance-none min-w-[100px]">
                                <option value="">Select</option>
                                {CLASSES.map(c => <option key={c}>{c}</option>)}
                            </select>
                            <ChevronDown className="absolute right-2 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
                        </div>
                    </div>
                    <div className="flex-1 min-w-[200px]">
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5">Subject</label>
                        <div className="relative">
                            <select value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-navy bg-white pr-8 appearance-none">
                                <option value="">Select</option>
                                {classSubjects.map(s => <option key={s}>{s}</option>)}
                            </select>
                            <ChevronDown className="absolute right-2 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
                        </div>
                    </div>
                </div>
                {chapters.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                        <div className="flex justify-between text-xs mb-2">
                            <span className="font-semibold text-gray-600">Overall Progress</span>
                            <span className="font-bold text-emerald-600">{Math.round((totalCompleted / chapters.length) * 100)}% done</span>
                        </div>
                        <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden flex">
                            <div className="bg-emerald-500 h-full" style={{ width: `${(totalCompleted / chapters.length) * 100}%` }} />
                            <div className="bg-amber-400 h-full" style={{ width: `${(totalOngoing / chapters.length) * 100}%` }} />
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1">{totalCompleted} completed · {totalOngoing} ongoing · {chapters.length - totalCompleted - totalOngoing} upcoming</p>
                    </div>
                )}
            </div>

            {!selectedClass || !selectedSubject ? (
                <div className="bg-white rounded-2xl border border-dashed border-gray-200 py-14 text-center">
                    <BookOpen className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                    <p className="text-sm text-gray-400">Select a class and subject to view syllabus</p>
                </div>
            ) : loading ? (
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
                                    className={`w-full flex items-center justify-between px-5 py-4 ${exam.bg} hover:opacity-90 transition-opacity`}>
                                    <div className="flex items-center gap-3">
                                        <span className={`text-base font-bold ${exam.color}`}>{exam.label}</span>
                                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${exam.badge}`}>{examChapters.length} chapters</span>
                                        {examChapters.length > 0 && <span className="text-xs text-gray-500">{examCompleted}/{examChapters.length} done</span>}
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {examChapters.length > 0 && (
                                            <div className="w-20 h-1.5 bg-white/60 rounded-full overflow-hidden hidden sm:block">
                                                <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${examChapters.length > 0 ? (examCompleted / examChapters.length) * 100 : 0}%` }} />
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
                                                <div key={ch.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                                                    <div className="flex items-start gap-3">
                                                        <div className={`w-7 h-7 rounded-lg ${exam.bg} flex items-center justify-center shrink-0 font-bold ${exam.color} text-xs`}>{idx + 1}</div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className="font-bold text-navy">{ch.title}</span>
                                                                <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
                                                                    <Icon className="w-3 h-3" /> {cfg.label}
                                                                </span>
                                                                <span className="text-xs text-gray-400">{ch.duration} {ch.durationUnit}</span>
                                                            </div>
                                                            {ch.description && <p className="text-xs text-gray-500 mt-1.5">{ch.description}</p>}
                                                            <div className="flex gap-1 mt-2">
                                                                {STATUSES.map(s => (
                                                                    <button key={s} onClick={() => changeStatus(ch.id, s)} disabled={saving}
                                                                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border transition-colors ${ch.status === s ? `${STATUS_CONFIG[s].bg} ${STATUS_CONFIG[s].color} border-transparent` : "bg-white text-gray-400 border-gray-200 hover:border-gray-300"}`}>
                                                                        {STATUS_CONFIG[s].label}
                                                                    </button>
                                                                ))}
                                                            </div>
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
