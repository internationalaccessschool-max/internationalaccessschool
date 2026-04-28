"use client";

import { useState, useEffect } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { BookOpen, Loader2, CheckCircle2, Clock, Circle, ChevronDown } from "lucide-react";
import toast from "react-hot-toast";

const SUBJECTS = ["Mathematics", "Physics", "Chemistry", "Biology", "English", "Hindi", "History", "Geography", "Civics", "Computer Science", "Economics", "Accountancy", "Business Studies", "Physical Education", "Art", "Science", "Social Science", "Urdu", "Sanskrit", "Other"];
const CLASSES = ["NUR", "LKG", "UKG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
const STATUSES = ["upcoming", "ongoing", "completed"] as const;
type ChapterStatus = typeof STATUSES[number];

interface Chapter {
    id: string; title: string; duration: string; durationUnit: string;
    description: string; status: ChapterStatus; order: number;
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
    const [selectedSubject, setSelectedSubject] = useState("");
    const [chapters, setChapters] = useState<Chapter[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

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
        if (!selectedClass || !selectedSubject) return;
        const fetch = async () => {
            setLoading(true);
            try {
                const snap = await getDoc(doc(db, "syllabus", docId(selectedClass, selectedSubject)));
                if (snap.exists()) setChapters((snap.data().chapters || []).sort((a: Chapter, b: Chapter) => a.order - b.order));
                else setChapters([]);
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

    const completed = chapters.filter(c => c.status === "completed").length;
    const ongoing   = chapters.filter(c => c.status === "ongoing").length;
    const mySubjects: string[] = teacherData?.subjects || [];

    return (
        <div className="space-y-6">
            <div className="rounded-2xl gradient-navy p-6 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.2) 0%, transparent 50%)` }} />
                <div className="relative z-10">
                    <p className="text-white/50 text-sm">Teacher Portal</p>
                    <h1 className="text-2xl font-bold text-white mt-1">📚 Syllabus</h1>
                    <p className="text-white/40 text-sm mt-2">View and update syllabus progress for your classes.</p>
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
                                {(mySubjects.length > 0 ? mySubjects : SUBJECTS).map(s => <option key={s}>{s}</option>)}
                            </select>
                            <ChevronDown className="absolute right-2 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
                        </div>
                    </div>
                </div>
            </div>

            {selectedClass && selectedSubject && chapters.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
                    <div className="flex justify-between text-xs mb-2">
                        <span className="font-semibold text-gray-600">Class {selectedClass} · {selectedSubject}</span>
                        <span className="font-bold text-emerald-600">{Math.round((completed / chapters.length) * 100)}% done</span>
                    </div>
                    <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden flex">
                        <div className="bg-emerald-500 h-full" style={{ width: `${(completed / chapters.length) * 100}%` }} />
                        <div className="bg-amber-400 h-full" style={{ width: `${(ongoing / chapters.length) * 100}%` }} />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1.5">{completed} completed · {ongoing} ongoing · {chapters.length - completed - ongoing} upcoming</p>
                </div>
            )}

            {!selectedClass || !selectedSubject ? (
                <div className="bg-white rounded-2xl border border-dashed border-gray-200 py-14 text-center">
                    <BookOpen className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                    <p className="text-sm text-gray-400">Select a class and subject to view syllabus</p>
                </div>
            ) : loading ? (
                <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-navy" /></div>
            ) : chapters.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-gray-200 py-14 text-center">
                    <BookOpen className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                    <p className="text-sm text-gray-400">No syllabus added by admin yet</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {chapters.map((ch, idx) => {
                        const cfg = STATUS_CONFIG[ch.status];
                        const Icon = cfg.icon;
                        return (
                            <div key={ch.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                                <div className="flex items-start gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-navy/5 flex items-center justify-center shrink-0 font-bold text-navy text-sm">{idx + 1}</div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-bold text-navy">{ch.title}</span>
                                            <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
                                                <Icon className="w-3 h-3" /> {cfg.label}
                                            </span>
                                            <span className="text-xs text-gray-400">{ch.duration} {ch.durationUnit}</span>
                                        </div>
                                        {ch.description && <p className="text-xs text-gray-500 mt-1.5">{ch.description}</p>}
                                        {/* Teacher can update status */}
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
}
