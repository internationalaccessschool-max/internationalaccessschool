"use client";

import { useState, useEffect } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Plus, Trash2, Pencil, Save, X, ChevronUp, ChevronDown, BookOpen, Loader2, CheckCircle2, Clock, Circle } from "lucide-react";
import toast from "react-hot-toast";

const CLASSES = ["NUR", "LKG", "UKG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
const SUBJECTS = ["Mathematics", "Physics", "Chemistry", "Biology", "English", "Hindi", "History", "Geography", "Civics", "Computer Science", "Economics", "Accountancy", "Business Studies", "Physical Education", "Art", "Science", "Social Science", "Urdu", "Sanskrit", "Other"];
const DURATION_UNITS = ["Days", "Weeks", "Periods"];
const STATUSES = ["upcoming", "ongoing", "completed"] as const;
type ChapterStatus = typeof STATUSES[number];

interface Chapter {
    id: string;
    title: string;
    duration: string;
    durationUnit: string;
    description: string;
    status: ChapterStatus;
    order: number;
}

const STATUS_CONFIG: Record<ChapterStatus, { label: string; icon: any; color: string; bg: string }> = {
    upcoming:  { label: "Upcoming",  icon: Circle,       color: "text-gray-500",    bg: "bg-gray-100"    },
    ongoing:   { label: "Ongoing",   icon: Clock,        color: "text-amber-600",   bg: "bg-amber-100"   },
    completed: { label: "Completed", icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-100" },
};

const docId = (cls: string, subject: string) => `${cls}_${subject.replace(/\s+/g, "_")}`;

const EMPTY_CHAPTER = (): Omit<Chapter, "id" | "order"> => ({
    title: "", duration: "1", durationUnit: "Weeks", description: "", status: "upcoming"
});

export default function AdminSyllabusPage() {
    const [selectedClass, setSelectedClass] = useState("1");
    const [selectedSubject, setSelectedSubject] = useState("Mathematics");
    const [chapters, setChapters] = useState<Chapter[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState(EMPTY_CHAPTER());
    const [showAddForm, setShowAddForm] = useState(false);
    const [addForm, setAddForm] = useState(EMPTY_CHAPTER());

    const key = docId(selectedClass, selectedSubject);

    useEffect(() => {
        const fetch = async () => {
            setLoading(true);
            setEditingId(null);
            setShowAddForm(false);
            try {
                const snap = await getDoc(doc(db, "syllabus", key));
                if (snap.exists()) setChapters((snap.data().chapters || []).sort((a: Chapter, b: Chapter) => a.order - b.order));
                else setChapters([]);
            } catch { toast.error("Failed to load syllabus"); }
            finally { setLoading(false); }
        };
        fetch();
    }, [key]);

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

    const addChapter = async () => {
        if (!addForm.title.trim()) { toast.error("Chapter title required"); return; }
        const newChapter: Chapter = { ...addForm, id: Date.now().toString(), order: chapters.length + 1 };
        await save([...chapters, newChapter]);
        setAddForm(EMPTY_CHAPTER());
        setShowAddForm(false);
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
        const idx = chapters.findIndex(c => c.id === id);
        if (dir === "up" && idx === 0) return;
        if (dir === "down" && idx === chapters.length - 1) return;
        const arr = [...chapters];
        const swapIdx = dir === "up" ? idx - 1 : idx + 1;
        [arr[idx], arr[swapIdx]] = [arr[swapIdx], arr[idx]];
        const reordered = arr.map((c, i) => ({ ...c, order: i + 1 }));
        await save(reordered);
    };

    const changeStatus = async (id: string, status: ChapterStatus) => {
        const updated = chapters.map(c => c.id === id ? { ...c, status } : c);
        await save(updated);
    };

    const ChapterForm = ({ form, setForm, onSave, onCancel, label }: any) => (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Chapter Title *</label>
                    <input value={form.title} onChange={e => setForm((p: any) => ({ ...p, title: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-navy bg-white"
                        placeholder="e.g. Chapter 1: Real Numbers" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Duration</label>
                    <div className="flex gap-2">
                        <input type="number" min="1" value={form.duration} onChange={e => setForm((p: any) => ({ ...p, duration: e.target.value }))}
                            className="w-20 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-navy bg-white" />
                        <select value={form.durationUnit} onChange={e => setForm((p: any) => ({ ...p, durationUnit: e.target.value }))}
                            className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-navy bg-white">
                            {DURATION_UNITS.map(u => <option key={u}>{u}</option>)}
                        </select>
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Status</label>
                    <select value={form.status} onChange={e => setForm((p: any) => ({ ...p, status: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-navy bg-white">
                        {STATUSES.map(s => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
                    </select>
                </div>
                <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Description / Topics Covered</label>
                    <textarea value={form.description} onChange={e => setForm((p: any) => ({ ...p, description: e.target.value }))} rows={3}
                        placeholder="Topics, subtopics, learning objectives…"
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-navy bg-white resize-none" />
                </div>
            </div>
            <div className="flex gap-2">
                <button onClick={onSave} disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-2 bg-navy text-white text-xs font-semibold rounded-lg hover:bg-navy/90 disabled:opacity-60">
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} {label}
                </button>
                <button onClick={onCancel} className="px-4 py-2 border border-gray-200 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-50">Cancel</button>
            </div>
        </div>
    );

    const completed = chapters.filter(c => c.status === "completed").length;
    const ongoing   = chapters.filter(c => c.status === "ongoing").length;

    return (
        <div className="space-y-6">
            <div className="rounded-2xl bg-gradient-to-br from-navy to-navy-light p-6 md:p-8 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.2) 0%, transparent 50%)` }} />
                <div className="relative z-10">
                    <p className="text-white/50 text-sm">Admin Console</p>
                    <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">📚 Syllabus Manager</h1>
                    <p className="text-white/40 text-sm mt-2">Manage class-wise subject syllabus and chapter progress.</p>
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
                        <select value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-navy bg-white">
                            {SUBJECTS.map(s => <option key={s}>{s}</option>)}
                        </select>
                    </div>
                </div>
                {chapters.length > 0 && (
                    <div className="flex gap-4 mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500">
                        <span className="text-emerald-600 font-semibold">{completed} Completed</span>
                        <span className="text-amber-600 font-semibold">{ongoing} Ongoing</span>
                        <span className="text-gray-400">{chapters.length - completed - ongoing} Upcoming</span>
                        <span className="ml-auto text-gray-400">{chapters.length} total chapters</span>
                    </div>
                )}
            </div>

            {/* Progress bar */}
            {chapters.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
                    <div className="flex justify-between text-xs text-gray-500 mb-2">
                        <span className="font-semibold">Syllabus Progress — Class {selectedClass} · {selectedSubject}</span>
                        <span className="font-bold text-emerald-600">{Math.round((completed / chapters.length) * 100)}% completed</span>
                    </div>
                    <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden flex">
                        <div className="bg-emerald-500 h-full transition-all" style={{ width: `${(completed / chapters.length) * 100}%` }} />
                        <div className="bg-amber-400 h-full transition-all" style={{ width: `${(ongoing / chapters.length) * 100}%` }} />
                    </div>
                    <div className="flex gap-4 mt-2 text-[10px] text-gray-400">
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Completed</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Ongoing</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-200 inline-block" /> Upcoming</span>
                    </div>
                </div>
            )}

            {/* Chapters */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="font-bold text-navy">Chapters</h2>
                    <button onClick={() => { setShowAddForm(true); setAddForm(EMPTY_CHAPTER()); setEditingId(null); }}
                        className="flex items-center gap-1.5 px-4 py-2 bg-gold hover:bg-gold/90 text-navy text-xs font-semibold rounded-xl transition-colors">
                        <Plus className="w-3.5 h-3.5" /> Add Chapter
                    </button>
                </div>

                {showAddForm && (
                    <ChapterForm form={addForm} setForm={setAddForm} onSave={addChapter}
                        onCancel={() => setShowAddForm(false)} label="Add Chapter" />
                )}

                {loading ? (
                    <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-navy" /></div>
                ) : chapters.length === 0 && !showAddForm ? (
                    <div className="bg-white rounded-2xl border border-dashed border-gray-200 py-14 text-center">
                        <BookOpen className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                        <p className="text-sm font-semibold text-gray-400">No chapters yet</p>
                        <p className="text-xs text-gray-400 mt-1">Click "Add Chapter" to start building the syllabus</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {chapters.map((ch, idx) => {
                            const cfg = STATUS_CONFIG[ch.status];
                            const Icon = cfg.icon;
                            return (
                                <div key={ch.id}>
                                    {editingId === ch.id ? (
                                        <ChapterForm form={editForm} setForm={setEditForm}
                                            onSave={updateChapter} onCancel={() => setEditingId(null)} label="Save Changes" />
                                    ) : (
                                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition-shadow">
                                            <div className="flex items-start gap-3">
                                                {/* Order number */}
                                                <div className="w-8 h-8 rounded-lg bg-navy/5 flex items-center justify-center shrink-0 font-bold text-navy text-sm">{idx + 1}</div>
                                                {/* Content */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="font-bold text-navy">{ch.title}</span>
                                                        <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
                                                            <Icon className="w-3 h-3" /> {cfg.label}
                                                        </span>
                                                        <span className="text-xs text-gray-400">{ch.duration} {ch.durationUnit}</span>
                                                    </div>
                                                    {ch.description && <p className="text-xs text-gray-500 mt-1.5 line-clamp-2">{ch.description}</p>}
                                                    {/* Status changer */}
                                                    <div className="flex gap-1 mt-2">
                                                        {STATUSES.map(s => (
                                                            <button key={s} onClick={() => changeStatus(ch.id, s)}
                                                                className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border transition-colors ${ch.status === s ? `${STATUS_CONFIG[s].bg} ${STATUS_CONFIG[s].color} border-transparent` : "bg-white text-gray-400 border-gray-200 hover:border-gray-300"}`}>
                                                                {STATUS_CONFIG[s].label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                                {/* Actions */}
                                                <div className="flex flex-col gap-1 shrink-0">
                                                    <div className="flex gap-1">
                                                        <button onClick={() => moveChapter(ch.id, "up")} disabled={idx === 0} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 disabled:opacity-30"><ChevronUp className="w-3.5 h-3.5" /></button>
                                                        <button onClick={() => moveChapter(ch.id, "down")} disabled={idx === chapters.length - 1} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 disabled:opacity-30"><ChevronDown className="w-3.5 h-3.5" /></button>
                                                    </div>
                                                    <div className="flex gap-1">
                                                        <button onClick={() => { setEditingId(ch.id); setEditForm({ title: ch.title, duration: ch.duration, durationUnit: ch.durationUnit, description: ch.description, status: ch.status }); setShowAddForm(false); }}
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
                )}
            </div>
        </div>
    );
}
