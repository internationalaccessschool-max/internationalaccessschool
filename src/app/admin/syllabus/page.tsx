"use client";

import { useState, useEffect } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Plus, Trash2, Pencil, Save, X, ChevronUp, ChevronDown, BookOpen, Loader2, CheckCircle2, Clock, Circle, ChevronRight } from "lucide-react";
import toast from "react-hot-toast";

const CLASSES = ["NUR", "LKG", "UKG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
const DURATION_UNITS = ["Days", "Weeks", "Periods"];
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
    id: string;
    title: string;
    duration: string;
    durationUnit: string;
    description: string;
    status: ChapterStatus;
    order: number;
    exam: ExamType;
}

const STATUS_CONFIG: Record<ChapterStatus, { label: string; icon: any; color: string; bg: string }> = {
    upcoming:  { label: "Upcoming",  icon: Circle,       color: "text-gray-500",    bg: "bg-gray-100"    },
    ongoing:   { label: "Ongoing",   icon: Clock,        color: "text-amber-600",   bg: "bg-amber-100"   },
    completed: { label: "Completed", icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-100" },
};

const docId = (cls: string, subject: string) => `${cls}_${subject.replace(/\s+/g, "_")}`;
const EMPTY_CHAPTER = (): Omit<Chapter, "id" | "order" | "exam"> => ({
    title: "", duration: "1", durationUnit: "Weeks", description: "", status: "upcoming"
});

export default function AdminSyllabusPage() {
    const [selectedClass, setSelectedClass] = useState("1");
    const [classSubjects, setClassSubjects] = useState<string[]>([]);
    const [selectedSubject, setSelectedSubject] = useState("");
    const [subjectsLoading, setSubjectsLoading] = useState(false);
    const [chapters, setChapters] = useState<Chapter[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [openExams, setOpenExams] = useState<Set<ExamType>>(new Set(["unit_test_1"]));

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState(EMPTY_CHAPTER());
    const [addingExam, setAddingExam] = useState<ExamType | null>(null);
    const [addForm, setAddForm] = useState(EMPTY_CHAPTER());

    const key = docId(selectedClass, selectedSubject);

    useEffect(() => {
        setSubjectsLoading(true);
        setSelectedSubject("");
        setChapters([]);
        getDoc(doc(db, "classSubjects", selectedClass)).then(snap => {
            const subs: string[] = snap.exists()
                ? (snap.data().subjects || []).map((s: any) => s.name as string)
                : [];
            setClassSubjects(subs);
            if (subs.length > 0) setSelectedSubject(subs[0]);
        }).catch(() => setClassSubjects([])).finally(() => setSubjectsLoading(false));
    }, [selectedClass]);

    useEffect(() => {
        if (!selectedSubject) return;
        const fetch = async () => {
            setLoading(true);
            setEditingId(null);
            setAddingExam(null);
            try {
                const snap = await getDoc(doc(db, "syllabus", key));
                if (snap.exists()) {
                    const raw: any[] = snap.data().chapters || [];
                    // Backward compat: chapters without exam → unit_test_1
                    setChapters(raw.map(c => ({ ...c, exam: c.exam || "unit_test_1" })).sort((a, b) => a.order - b.order));
                } else setChapters([]);
            } catch { toast.error("Failed to load syllabus"); }
            finally { setLoading(false); }
        };
        fetch();
    }, [key, selectedSubject]);

    const save = async (updated: Chapter[]) => {
        setSaving(true);
        try {
            await setDoc(doc(db, "syllabus", key), {
                class: selectedClass, subject: selectedSubject,
                chapters: updated, updatedAt: serverTimestamp(),
            });
            setChapters(updated);
        } catch { toast.error("Failed to save"); }
        finally { setSaving(false); }
    };

    const addChapter = async (exam: ExamType) => {
        if (!addForm.title.trim()) { toast.error("Chapter title required"); return; }
        const examChapters = chapters.filter(c => c.exam === exam);
        const newChapter: Chapter = { ...addForm, id: Date.now().toString(), order: chapters.length + 1, exam };
        await save([...chapters, newChapter]);
        setAddForm(EMPTY_CHAPTER());
        setAddingExam(null);
        toast.success("Chapter added");
    };

    const updateChapter = async () => {
        if (!editForm.title.trim()) { toast.error("Chapter title required"); return; }
        const updated = chapters.map(c => c.id === editingId ? { ...c, ...editForm } : c);
        await save(updated);
        setEditingId(null);
        toast.success("Chapter updated");
    };

    const deleteChapter = async (id: string) => {
        if (!confirm("Delete this chapter?")) return;
        const updated = chapters.filter(c => c.id !== id).map((c, i) => ({ ...c, order: i + 1 }));
        await save(updated);
        toast.success("Chapter deleted");
    };

    const moveChapter = async (id: string, dir: "up" | "down") => {
        const examType = chapters.find(c => c.id === id)?.exam;
        if (!examType) return;
        const examChaps = chapters.filter(c => c.exam === examType);
        const idx = examChaps.findIndex(c => c.id === id);
        if (dir === "up" && idx === 0) return;
        if (dir === "down" && idx === examChaps.length - 1) return;
        const arr = [...examChaps];
        const swapIdx = dir === "up" ? idx - 1 : idx + 1;
        [arr[idx], arr[swapIdx]] = [arr[swapIdx], arr[idx]];
        const otherChaps = chapters.filter(c => c.exam !== examType);
        await save([...otherChaps, ...arr].map((c, i) => ({ ...c, order: i + 1 })));
    };

    const changeStatus = async (id: string, status: ChapterStatus) => {
        await save(chapters.map(c => c.id === id ? { ...c, status } : c));
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
            <div className="rounded-2xl bg-gradient-to-br from-navy to-navy-light p-6 md:p-8 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.2) 0%, transparent 50%)` }} />
                <div className="relative z-10">
                    <p className="text-white/50 text-sm">Admin Console</p>
                    <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">📚 Syllabus Manager</h1>
                    <p className="text-white/40 text-sm mt-2">Manage class-wise subject syllabus — exam section wise.</p>
                </div>
            </div>

            {/* Class + Subject selector */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex flex-wrap gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5">Class</label>
                        <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)}
                            className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-navy bg-white min-w-[100px]">
                            {CLASSES.map(c => <option key={c}>{c}</option>)}
                        </select>
                    </div>
                    <div className="flex-1 min-w-[200px]">
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5">Subject</label>
                        {subjectsLoading ? (
                            <div className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 text-sm text-gray-400">
                                <Loader2 className="w-4 h-4 animate-spin" /> Loading subjects…
                            </div>
                        ) : classSubjects.length === 0 ? (
                            <div className="px-4 py-2.5 border border-amber-200 rounded-xl bg-amber-50 text-xs text-amber-700">
                                No subjects configured. Go to <span className="font-semibold">Class Subjects</span> to add them.
                            </div>
                        ) : (
                            <select value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-navy bg-white">
                                {classSubjects.map(s => <option key={s}>{s}</option>)}
                            </select>
                        )}
                    </div>
                </div>
                {chapters.length > 0 && (
                    <div className="flex gap-4 mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500">
                        <span className="text-emerald-600 font-semibold">{totalCompleted} Completed</span>
                        <span className="text-amber-600 font-semibold">{totalOngoing} Ongoing</span>
                        <span className="text-gray-400">{chapters.length - totalCompleted - totalOngoing} Upcoming</span>
                        <span className="ml-auto text-gray-400">{chapters.length} total chapters</span>
                    </div>
                )}
            </div>

            {/* Overall progress */}
            {chapters.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
                    <div className="flex justify-between text-xs text-gray-500 mb-2">
                        <span className="font-semibold">Overall Progress — {selectedSubject}</span>
                        <span className="font-bold text-emerald-600">{Math.round((totalCompleted / chapters.length) * 100)}% completed</span>
                    </div>
                    <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden flex">
                        <div className="bg-emerald-500 h-full transition-all" style={{ width: `${(totalCompleted / chapters.length) * 100}%` }} />
                        <div className="bg-amber-400 h-full transition-all" style={{ width: `${(totalOngoing / chapters.length) * 100}%` }} />
                    </div>
                </div>
            )}

            {/* Exam Sections */}
            {loading ? (
                <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-navy" /></div>
            ) : !selectedSubject ? null : (
                <div className="space-y-4">
                    {EXAMS.map(exam => {
                        const examChapters = chapters.filter(c => c.exam === exam.key);
                        const examCompleted = examChapters.filter(c => c.status === "completed").length;
                        const isOpen = openExams.has(exam.key);

                        return (
                            <div key={exam.key} className={`rounded-2xl border ${exam.border} overflow-hidden shadow-sm`}>
                                {/* Section Header */}
                                <button
                                    onClick={() => toggleExam(exam.key)}
                                    className={`w-full flex flex-col sm:flex-row items-start sm:items-center justify-between px-5 py-4 ${exam.bg} hover:opacity-90 transition-opacity gap-3 sm:gap-0`}
                                >
                                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                                        <span className={`text-base font-bold ${exam.color}`}>{exam.label}</span>
                                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${exam.badge}`}>
                                            {examChapters.length} chapters
                                        </span>
                                        {examChapters.length > 0 && (
                                            <span className="text-xs text-gray-500 font-medium">
                                                {examCompleted}/{examChapters.length} done
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                                        {examChapters.length > 0 && (
                                            <div className="w-24 h-2 bg-white/60 rounded-full overflow-hidden block">
                                                <div className="bg-emerald-500 h-full rounded-full transition-all"
                                                    style={{ width: `${examChapters.length > 0 ? (examCompleted / examChapters.length) * 100 : 0}%` }} />
                                            </div>
                                        )}
                                        <ChevronDown className={`w-4 h-4 ${exam.color} transition-transform ${isOpen ? "rotate-180" : ""}`} />
                                    </div>
                                </button>

                                {/* Section Body */}
                                {isOpen && (
                                    <div className="p-4 space-y-3 bg-white">
                                        {/* Add Chapter button */}
                                        <div className="flex justify-end">
                                            <button
                                                onClick={() => { setAddingExam(exam.key); setAddForm(EMPTY_CHAPTER()); setEditingId(null); }}
                                                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors ${exam.border} ${exam.color} ${exam.bg} hover:opacity-80`}>
                                                <Plus className="w-3.5 h-3.5" /> Add Chapter
                                            </button>
                                        </div>

                                        {/* Add form */}
                                        {addingExam === exam.key && (
                                            <ChapterForm form={addForm} setForm={setAddForm}
                                                onSave={() => addChapter(exam.key)}
                                                onCancel={() => setAddingExam(null)}
                                                label="Add Chapter"
                                                examColor={`${exam.bg} border ${exam.border}`}
                                                saving={saving}
                                            />
                                        )}

                                        {/* Empty state */}
                                        {examChapters.length === 0 && addingExam !== exam.key && (
                                            <div className="py-8 text-center">
                                                <BookOpen className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                                                <p className="text-xs text-gray-400">No chapters added for {exam.label} yet.</p>
                                            </div>
                                        )}

                                        {/* Chapters list */}
                                        <div className="space-y-2">
                                            {examChapters.map((ch, idx) => {
                                                const cfg = STATUS_CONFIG[ch.status];
                                                const Icon = cfg.icon;
                                                return (
                                                    <div key={ch.id}>
                                                        {editingId === ch.id ? (
                                                            <ChapterForm form={editForm} setForm={setEditForm}
                                                                onSave={updateChapter} onCancel={() => setEditingId(null)}
                                                                label="Save Changes"
                                                                examColor={`${exam.bg} border ${exam.border}`}
                                                                saving={saving}
                                                            />
                                                        ) : (
                                                            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition-shadow">
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
                                                                        {ch.description && <p className="text-xs text-gray-500 mt-1.5 line-clamp-2">{ch.description}</p>}
                                                                        <div className="flex flex-wrap gap-1 mt-2">
                                                                            {STATUSES.map(s => (
                                                                                <button key={s} onClick={() => changeStatus(ch.id, s)}
                                                                                    className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border transition-colors ${ch.status === s ? `${STATUS_CONFIG[s].bg} ${STATUS_CONFIG[s].color} border-transparent` : "bg-white text-gray-400 border-gray-200 hover:border-gray-300"}`}>
                                                                                    {STATUS_CONFIG[s].label}
                                                                                </button>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex flex-col gap-1 shrink-0">
                                                                        <div className="flex gap-1">
                                                                            <button onClick={() => moveChapter(ch.id, "up")} disabled={idx === 0} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 disabled:opacity-30"><ChevronUp className="w-3.5 h-3.5" /></button>
                                                                            <button onClick={() => moveChapter(ch.id, "down")} disabled={idx === examChapters.length - 1} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 disabled:opacity-30"><ChevronDown className="w-3.5 h-3.5" /></button>
                                                                        </div>
                                                                        <div className="flex gap-1">
                                                                            <button onClick={() => { setEditingId(ch.id); setEditForm({ title: ch.title, duration: ch.duration, durationUnit: ch.durationUnit, description: ch.description, status: ch.status }); setAddingExam(null); }}
                                                                                className="p-1.5 rounded-lg hover:bg-navy/5 text-gray-400 hover:text-navy"><Pencil className="w-3.5 h-3.5" /></button>
                                                                            <button onClick={() => deleteChapter(ch.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
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

// ─── Chapter Form — defined OUTSIDE main component to prevent focus loss ──────

function ChapterForm({ form, setForm, onSave, onCancel, label, examColor, saving }: {
    form: any; setForm: any; onSave: () => void; onCancel: () => void;
    label: string; examColor: string; saving: boolean;
}) {
    return (
        <div className={`border rounded-xl p-4 space-y-3 ${examColor}`}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Chapter Title *</label>
                    <input
                        autoFocus
                        value={form.title}
                        onChange={e => setForm((p: any) => ({ ...p, title: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-navy bg-white"
                        placeholder="e.g. Chapter 1: Real Numbers"
                    />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Duration</label>
                    <div className="flex gap-2">
                        <input type="number" min="1" value={form.duration}
                            onChange={e => setForm((p: any) => ({ ...p, duration: e.target.value }))}
                            className="w-20 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-navy bg-white" />
                        <select value={form.durationUnit}
                            onChange={e => setForm((p: any) => ({ ...p, durationUnit: e.target.value }))}
                            className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-navy bg-white">
                            {["Days", "Weeks", "Periods"].map(u => <option key={u}>{u}</option>)}
                        </select>
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Status</label>
                    <select value={form.status}
                        onChange={e => setForm((p: any) => ({ ...p, status: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-navy bg-white">
                        {(["upcoming", "ongoing", "completed"] as const).map(s => (
                            <option key={s} value={s}>{s === "upcoming" ? "Upcoming" : s === "ongoing" ? "Ongoing" : "Completed"}</option>
                        ))}
                    </select>
                </div>
                <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Description / Topics Covered</label>
                    <textarea value={form.description}
                        onChange={e => setForm((p: any) => ({ ...p, description: e.target.value }))}
                        rows={2} placeholder="Topics, subtopics, learning objectives…"
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-navy bg-white resize-none" />
                </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 mt-4">
                <button onClick={onSave} disabled={saving}
                    className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 bg-navy text-white text-xs font-semibold rounded-lg hover:bg-navy/90 disabled:opacity-60">
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} {label}
                </button>
                <button onClick={onCancel} className="w-full sm:w-auto px-4 py-2 border border-gray-200 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-50">
                    Cancel
                </button>
            </div>
        </div>
    );
}
