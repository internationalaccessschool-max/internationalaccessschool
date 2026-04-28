"use client";

import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { BookOpen, Loader2, CheckCircle2, Clock, Circle, ChevronDown } from "lucide-react";

const SUBJECTS = ["Mathematics", "Physics", "Chemistry", "Biology", "English", "Hindi", "History", "Geography", "Civics", "Computer Science", "Economics", "Accountancy", "Business Studies", "Physical Education", "Art", "Science", "Social Science", "Urdu", "Sanskrit", "Other"];
const STATUSES = ["upcoming", "ongoing", "completed"] as const;
type ChapterStatus = typeof STATUSES[number];

interface Chapter {
    id: string; title: string; duration: string; durationUnit: string;
    description: string; status: ChapterStatus; order: number;
}

const STATUS_CONFIG: Record<ChapterStatus, { label: string; icon: any; color: string; bg: string; border: string }> = {
    upcoming:  { label: "Upcoming",  icon: Circle,       color: "text-gray-500",    bg: "bg-gray-50",    border: "border-gray-200"    },
    ongoing:   { label: "Ongoing",   icon: Clock,        color: "text-amber-600",   bg: "bg-amber-50",   border: "border-amber-200"   },
    completed: { label: "Completed", icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
};

const docId = (cls: string, subject: string) => `${cls}_${subject.replace(/\s+/g, "_")}`;

export default function StudentSyllabusPage() {
    const [studentClass, setStudentClass] = useState("");
    const [selectedSubject, setSelectedSubject] = useState(SUBJECTS[0]);
    const [chapters, setChapters] = useState<Chapter[]>([]);
    const [loading, setLoading] = useState(false);
    const [studentName, setStudentName] = useState("");

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (user) => {
            if (!user) return;
            try {
                const snap = await getDoc(doc(db, "studentLookup", user.uid));
                if (snap.exists()) {
                    const d = snap.data();
                    const cls = d.class || d.className || "";
                    setStudentClass(cls);
                    setStudentName(d.name || user.displayName || "");
                }
            } catch { }
        });
        return () => unsub();
    }, []);

    useEffect(() => {
        if (!studentClass || !selectedSubject) return;
        const fetch = async () => {
            setLoading(true);
            try {
                const snap = await getDoc(doc(db, "syllabus", docId(studentClass, selectedSubject)));
                if (snap.exists()) setChapters((snap.data().chapters || []).sort((a: Chapter, b: Chapter) => a.order - b.order));
                else setChapters([]);
            } catch { } finally { setLoading(false); }
        };
        fetch();
    }, [studentClass, selectedSubject]);

    const completed = chapters.filter(c => c.status === "completed").length;
    const ongoing   = chapters.filter(c => c.status === "ongoing").length;

    return (
        <div className="space-y-6">
            <div className="rounded-2xl bg-gradient-to-br from-navy to-navy-light p-6 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.2) 0%, transparent 50%)` }} />
                <div className="relative z-10">
                    <p className="text-white/50 text-sm">Student Portal</p>
                    <h1 className="text-2xl font-bold text-white mt-1">📚 My Syllabus</h1>
                    <p className="text-white/40 text-sm mt-2">
                        {studentClass ? `Class ${studentClass} · Track your chapter progress` : "Loading your class…"}
                    </p>
                </div>
            </div>

            {/* Subject selector */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Select Subject</label>
                <div className="relative max-w-xs">
                    <select value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-navy bg-white appearance-none pr-8">
                        {SUBJECTS.map(s => <option key={s}>{s}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
                {studentClass && <p className="text-xs text-gray-400 mt-2">Showing syllabus for <span className="font-semibold text-navy">Class {studentClass}</span></p>}
            </div>

            {/* Progress */}
            {chapters.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
                    <div className="flex justify-between text-xs mb-2">
                        <span className="font-semibold text-gray-600">{selectedSubject} Progress</span>
                        <span className="font-bold text-emerald-600">{Math.round((completed / chapters.length) * 100)}% completed</span>
                    </div>
                    <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden flex">
                        <div className="bg-emerald-500 h-full transition-all" style={{ width: `${(completed / chapters.length) * 100}%` }} />
                        <div className="bg-amber-400 h-full transition-all" style={{ width: `${(ongoing / chapters.length) * 100}%` }} />
                    </div>
                    <div className="flex gap-4 mt-2 text-[10px] text-gray-400">
                        <span>{completed} completed</span>
                        <span>{ongoing} ongoing</span>
                        <span>{chapters.length - completed - ongoing} upcoming</span>
                    </div>
                </div>
            )}

            {/* Chapter list */}
            {loading ? (
                <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-navy" /></div>
            ) : chapters.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-gray-200 py-14 text-center">
                    <BookOpen className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                    <p className="text-sm text-gray-400">No syllabus available for this subject yet</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {chapters.map((ch, idx) => {
                        const cfg = STATUS_CONFIG[ch.status];
                        const Icon = cfg.icon;
                        return (
                            <div key={ch.id} className={`rounded-2xl border p-4 ${ch.status === "upcoming" ? "bg-white border-gray-100" : `${cfg.bg} ${cfg.border}`}`}>
                                <div className="flex items-start gap-3">
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-bold text-sm ${ch.status === "completed" ? "bg-emerald-100 text-emerald-700" : ch.status === "ongoing" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"}`}>
                                        {ch.status === "completed" ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`font-bold ${ch.status === "completed" ? "text-emerald-700" : "text-navy"}`}>{ch.title}</span>
                                            <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/60 ${cfg.color}`}>
                                                <Icon className="w-3 h-3" /> {cfg.label}
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-0.5">{ch.duration} {ch.durationUnit}</p>
                                        {ch.description && <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{ch.description}</p>}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
