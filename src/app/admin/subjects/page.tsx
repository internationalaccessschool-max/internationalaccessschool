"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import {
    doc, getDoc, setDoc, collection, onSnapshot, query, orderBy
} from "firebase/firestore";
import { Plus, Trash2, Save, BookOpen, Loader2, ChevronDown } from "lucide-react";

const CLASSES = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

const PRESET_SUBJECTS = [
    "Mathematics", "Physics", "Chemistry", "Biology", "English", "Hindi",
    "History", "Geography", "Civics", "Political Science", "Economics",
    "Accountancy", "Business Studies", "Computer Science", "Physical Education",
    "Art", "Music", "Sanskrit", "Environmental Science", "Moral Science", "Other"
];

type ClassSubjects = {
    subjects: any[];
};

export default function ManageSubjectsPage() {
    // Helper: Safe string render
    const safeStr = (val: any): string => {
        if (!val) return "";
        if (typeof val === 'string') return val;
        if (typeof val === 'object') {
            return val.name || val.label || val.id || JSON.stringify(val);
        }
        return String(val);
    };
    const [selectedClass, setSelectedClass] = useState("1");
    const [subjects, setSubjects] = useState<any[]>([]);
    const [newSubject, setNewSubject] = useState("");
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(false);
    const [saved, setSaved] = useState(false);
    const [allClassData, setAllClassData] = useState<Record<string, string[]>>({});

    // Load all classes overview
    useEffect(() => {
        const unsubList: (() => void)[] = [];
        CLASSES.forEach(cls => {
            const ref = doc(db, "classSubjects", cls);
            const unsub = onSnapshot(ref, snap => {
                if (snap.exists()) {
                    setAllClassData(prev => ({ ...prev, [cls]: (snap.data() as ClassSubjects).subjects || [] }));
                } else {
                    setAllClassData(prev => ({ ...prev, [cls]: [] }));
                }
            });
            unsubList.push(unsub);
        });
        return () => unsubList.forEach(u => u());
    }, []);

    // Load selected class subjects
    useEffect(() => {
        setLoading(true);
        const ref = doc(db, "classSubjects", selectedClass);
        getDoc(ref).then(snap => {
            if (snap.exists()) {
                const raw = (snap.data() as ClassSubjects).subjects || [];
                const normalized = raw.map((s: any) => {
                    if (typeof s === "string") {
                        return { id: s.toLowerCase().replace(/\s+/g, "_"), name: s, type: "Core", maxMarks: 100 };
                    }
                    return s;
                });
                setSubjects(normalized);
            } else {
                setSubjects([]);
            }
            setLoading(false);
        });
        setSaved(false);
    }, [selectedClass]);

    const addSubject = (name: string) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        const exists = subjects.some(s => (s.name || s).toLowerCase() === trimmed.toLowerCase());
        if (exists) return;

        setSubjects(prev => [...prev, {
            id: trimmed.toLowerCase().replace(/\s+/g, "_"),
            name: trimmed,
            type: "Core",
            maxMarks: 100
        }]);
        setNewSubject("");
        setSaved(false);
    };

    const removeSubject = (subjectObj: any) => {
        setSubjects(prev => prev.filter(s => s.id !== subjectObj.id));
        setSaved(false);
    };

    const saveSubjects = async () => {
        setSaving(true);
        await setDoc(doc(db, "classSubjects", selectedClass), { subjects });
        setSaving(false);
        setSaved(true);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="rounded-2xl gradient-navy p-6 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.3) 0%, transparent 50%)` }} />
                <div className="relative z-10">
                    <p className="text-white/50 text-sm">Academic Setup</p>
                    <h1 className="text-2xl font-bold text-white mt-1">Manage Subjects</h1>
                    <p className="text-white/40 text-sm mt-1">Configure which subjects are taught in each class. These subjects appear in the Assign Teachers panel.</p>
                </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
                {/* Class Overview Panel */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                    <h2 className="font-bold text-navy text-sm mb-4 uppercase tracking-wider">All Classes</h2>
                    <div className="space-y-1">
                        {CLASSES.map(cls => (
                            <button key={cls}
                                onClick={() => setSelectedClass(cls)}
                                className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl transition-all text-sm ${selectedClass === cls
                                    ? "bg-navy text-white font-semibold"
                                    : "hover:bg-gray-50 text-gray-600"}`}>
                                <span>Class {cls}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${selectedClass === cls ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"}`}>
                                    {allClassData[cls]?.length || 0} subjects
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Subject Editor */}
                <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="font-bold text-navy text-lg">Class {selectedClass} — Subjects</h2>
                            <p className="text-xs text-gray-400 mt-0.5">{subjects.length} subjects configured</p>
                        </div>
                        <button onClick={saveSubjects} disabled={saving}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-navy text-white text-sm font-semibold disabled:opacity-60 hover:bg-navy/90 transition-all">
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            {saving ? "Saving..." : saved ? "✓ Saved" : "Save"}
                        </button>
                    </div>

                    {/* Add from presets */}
                    <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Add from preset subjects</p>
                        <div className="flex flex-wrap gap-2">
                            {PRESET_SUBJECTS.filter(s => !subjects.some(sub => (sub.name || sub) === s)).map(s => (
                                <button key={s} onClick={() => addSubject(s)}
                                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-50 border border-gray-200 text-gray-600 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-all">
                                    + {s}
                                </button>
                            ))}
                            {PRESET_SUBJECTS.filter(s => !subjects.some(sub => (sub.name || sub) === s)).length === 0 && (
                                <p className="text-xs text-gray-300">All presets added</p>
                            )}
                        </div>
                    </div>

                    {/* Add custom */}
                    <div className="flex gap-2">
                        <input
                            value={newSubject}
                            onChange={e => setNewSubject(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && addSubject(newSubject)}
                            placeholder="Type a custom subject name..."
                            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
                        />
                        <button onClick={() => addSubject(newSubject)}
                            className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-all">
                            <Plus className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Current subjects */}
                    {loading ? (
                        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
                    ) : subjects.length === 0 ? (
                        <div className="text-center py-10 text-gray-300">
                            <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-30" />
                            <p className="text-sm">No subjects configured for Class {selectedClass} yet</p>
                        </div>
                    ) : (
                        <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Configured subjects (drag to reorder coming soon)</p>
                            <div className="space-y-1.5">
                                {subjects.map((s, i) => (
                                    <div key={s.id || safeStr(s)} className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-100 group">
                                        <div className="flex items-center gap-3">
                                            <span className="text-xs font-bold text-gray-300 w-5">{i + 1}</span>
                                            <span className="text-sm font-medium text-navy">{safeStr(s.name || s)}</span>
                                        </div>
                                        <button onClick={() => removeSubject(s)}
                                            className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
