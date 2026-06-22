"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import {
    collection, onSnapshot, query, orderBy, doc, getDoc, addDoc, deleteDoc, serverTimestamp, Timestamp
} from "firebase/firestore";
import { UserCheck, Plus, Trash2, Loader2, Users, BookOpen, X, Save, AlertCircle } from "lucide-react";

const CLASSES = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
const SECTIONS = ["A", "B", "C", "D", "E"];
const PERIODS_OPTIONS = ["1", "2", "3", "4", "5", "6", "7", "8"];

type Teacher = { id: string; firstName?: string; lastName?: string; name?: string; email?: string; subjects?: string[] };
type Assignment = {
    id: string;
    teacherId: string;
    teacherName: string;
    className: string;
    section: string;
    subject: string;
    periodsPerWeek: string;
    createdAt?: Timestamp;
};

export default function AssignTeachersPage() {
    const [teachers, setTeachers] = useState<Teacher[]>([]);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [classSubjects, setClassSubjects] = useState<string[]>([]);
    const [loadingSubjects, setLoadingSubjects] = useState(false);

    // Form state
    const [selTeacher, setSelTeacher] = useState("");
    const [selClass, setSelClass] = useState("");
    const [selSection, setSelSection] = useState("");
    const [selSubject, setSelSubject] = useState("");
    const [selPeriods, setSelPeriods] = useState("5");

    // Filter state
    const [filterClass, setFilterClass] = useState("all");

    useEffect(() => {
        const q = query(collection(db, "teachers"), orderBy("createdAt", "desc"));
        const unsub1 = onSnapshot(q, snap => {
            setTeachers(
                snap.docs
                    .filter(d => (d.data() as any).status !== "DISABLED")
                    .map(d => ({ id: d.id, ...d.data() } as Teacher))
            );
        });
        const q2 = query(collection(db, "teacherAssignments"), orderBy("createdAt", "desc"));
        const unsub2 = onSnapshot(q2, snap => {
            setAssignments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Assignment)));
            setLoading(false);
        }, () => setLoading(false));
        return () => { unsub1(); unsub2(); };
    }, []);

    // Load subjects for selected class
    useEffect(() => {
        if (!selClass) { setClassSubjects([]); return; }
        setLoadingSubjects(true);
        setSelSubject("");
        getDoc(doc(db, "classSubjects", selClass)).then(snap => {
            if (snap.exists()) {
                const rawSubjects = snap.data().subjects || [];
                // subjects are stored as objects {id, name, maxMarks, type} — extract name strings
                const subjectNames: string[] = rawSubjects.map((s: any) =>
                    typeof s === "string" ? s : (s.name || s.id || "")
                ).filter(Boolean);
                setClassSubjects(subjectNames);
            } else {
                setClassSubjects([]);
            }
            setLoadingSubjects(false);
        });
    }, [selClass]);


    const handleCreate = async () => {
        if (!selTeacher || !selClass || !selSection || !selSubject) {
            setFormError("Please fill all fields."); return;
        }
        setSaving(true); setFormError(null);
        const teacher = teachers.find(t => t.id === selTeacher);
        const teacherName = teacher ? [teacher.firstName, teacher.lastName].filter(Boolean).join(" ") || teacher.name || teacher.email || selTeacher : selTeacher;
        await addDoc(collection(db, "teacherAssignments"), {
            teacherId: selTeacher,
            teacherName,
            className: selClass,
            section: selSection,
            subject: selSubject,
            periodsPerWeek: selPeriods,
            createdAt: serverTimestamp(),
        });
        setSaving(false);
        setShowForm(false);
        setSelTeacher(""); setSelClass(""); setSelSection(""); setSelSubject(""); setSelPeriods("5");
    };

    const deleteAssignment = async (id: string) => {
        if (!confirm("Remove this assignment?")) return;
        await deleteDoc(doc(db, "teacherAssignments", id));
    };

    const filteredAssignments = filterClass === "all"
        ? assignments
        : assignments.filter(a => a.className === filterClass);

    // Group by class for display
    const grouped: Record<string, Assignment[]> = {};
    filteredAssignments.forEach(a => {
        const key = `Class ${a.className}`;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(a);
    });

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="rounded-2xl gradient-navy p-6 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.3) 0%, transparent 50%)` }} />
                <div className="relative z-10 flex items-start justify-between">
                    <div>
                        <p className="text-white/50 text-sm">Academic Management</p>
                        <h1 className="text-2xl font-bold text-white mt-1">Assign Teachers</h1>
                        <p className="text-white/40 text-sm mt-1">Assign teachers to Classes, Sections, Subjects and set weekly periods.</p>
                    </div>
                    <button onClick={() => setShowForm(true)}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gold text-navy font-semibold text-sm hover:bg-gold/90 transition-all shrink-0">
                        <Plus className="w-4 h-4" />
                        New Assignment
                    </button>
                </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-4">
                {[
                    { label: "Total Assignments", value: assignments.length, icon: UserCheck, color: "text-indigo-600", bg: "bg-indigo-50" },
                    { label: "Teachers Assigned", value: new Set(assignments.map(a => a.teacherId)).size, icon: Users, color: "text-emerald-600", bg: "bg-emerald-50" },
                    { label: "Classes Covered", value: new Set(assignments.map(a => a.className)).size, icon: BookOpen, color: "text-amber-600", bg: "bg-amber-50" },
                ].map(stat => (
                    <div key={stat.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl ${stat.bg} flex items-center justify-center shrink-0`}>
                            <stat.icon className={`w-5 h-5 ${stat.color}`} />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-navy">{stat.value}</p>
                            <p className="text-xs text-gray-400">{stat.label}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Filter bar */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3 flex-wrap">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Filter by class:</span>
                <button onClick={() => setFilterClass("all")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filterClass === "all" ? "bg-navy text-white" : "bg-gray-50 text-gray-500 hover:bg-gray-100"}`}>
                    All
                </button>
                {CLASSES.map(c => (
                    <button key={c} onClick={() => setFilterClass(c)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filterClass === c ? "bg-navy text-white" : "bg-gray-50 text-gray-500 hover:bg-gray-100"}`}>
                        Class {c}
                    </button>
                ))}
            </div>

            {/* Assignments list */}
            {loading ? (
                <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-gray-300" /></div>
            ) : filteredAssignments.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-20 text-center">
                    <UserCheck className="w-12 h-12 mx-auto text-gray-200 mb-3" />
                    <p className="text-gray-400 font-medium">No assignments yet</p>
                    <p className="text-gray-300 text-sm mt-1">Click "New Assignment" to assign a teacher to a class.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {Object.entries(grouped).sort(([a], [b]) => {
                        const na = parseInt(a);
                        const nb = parseInt(b);
                        return na - nb;
                    }).map(([classLabel, list]) => (
                        <div key={classLabel} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                            <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                                <BookOpen className="w-4 h-4 text-navy" />
                                <h3 className="font-bold text-navy text-sm">{classLabel}</h3>
                                <span className="ml-auto text-xs text-gray-400">{list.length} assignment{list.length !== 1 ? "s" : ""}</span>
                            </div>
                            <div className="divide-y divide-gray-50">
                                {list.map(a => (
                                    <div key={a.id} className="flex items-center gap-4 px-6 py-3.5 hover:bg-gray-50/50 transition-colors">
                                        <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                                            <Users className="w-4 h-4 text-indigo-600" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-navy truncate">{a.teacherName}</p>
                                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                <span className="text-xs text-gray-500">{a.subject}</span>
                                                <span className="text-gray-200">•</span>
                                                <span className="text-xs text-gray-400">{a.section}</span>
                                                <span className="text-gray-200">•</span>
                                                <span className="text-xs text-gray-400">{a.periodsPerWeek} periods/week</span>
                                            </div>
                                        </div>
                                        <button onClick={() => deleteAssignment(a.id)}
                                            className="p-2 rounded-xl text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ── New Assignment Modal ── */}
            {showForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setShowForm(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                            <h2 className="font-bold text-navy">New Teacher Assignment</h2>
                            <button onClick={() => setShowForm(false)} className="p-2 rounded-xl hover:bg-gray-50 text-gray-400"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            {/* Teacher */}
                            <div>
                                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Teacher</label>
                                <select value={selTeacher} onChange={e => setSelTeacher(e.target.value)} className={selectCls}>
                                    <option value="">Select teacher...</option>
                                    {teachers.map(t => (
                                        <option key={t.id} value={t.id}>
                                            {[t.firstName, t.lastName].filter(Boolean).join(" ") || t.name || t.email}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Class + Section row */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Class</label>
                                    <select value={selClass} onChange={e => setSelClass(e.target.value)} className={selectCls}>
                                        <option value="">Select class...</option>
                                        {CLASSES.map(c => <option key={c} value={c}>Class {c}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Section</label>
                                    <select value={selSection} onChange={e => setSelSection(e.target.value)} className={selectCls}>
                                        <option value="">Section...</option>
                                        {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                            </div>

                            {/* Subject */}
                            <div>
                                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Subject</label>
                                {!selClass ? (
                                    <div className="px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-400">Select a class first to see its subjects</div>
                                ) : loadingSubjects ? (
                                    <div className="px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 flex items-center gap-2 text-sm text-gray-400">
                                        <Loader2 className="w-4 h-4 animate-spin" /> Loading subjects...
                                    </div>
                                ) : classSubjects.length === 0 ? (
                                    <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-700 flex items-center gap-2">
                                        <AlertCircle className="w-4 h-4 shrink-0" />
                                        No subjects configured for Class {selClass}. Go to Manage Subjects first.
                                    </div>
                                ) : (
                                    <select value={selSubject} onChange={e => setSelSubject(e.target.value)} className={selectCls}>
                                        <option value="">Select subject...</option>
                                        {classSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                )}
                            </div>

                            {/* Periods */}
                            <div>
                                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Periods per Week</label>
                                <div className="flex gap-2 flex-wrap">
                                    {PERIODS_OPTIONS.map(p => (
                                        <button key={p} onClick={() => setSelPeriods(p)}
                                            className={`w-10 h-10 rounded-xl text-sm font-bold border transition-all ${selPeriods === p ? "bg-navy text-white border-navy" : "bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300"}`}>
                                            {p}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {formError && (
                                <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl">{formError}</div>
                            )}
                        </div>
                        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 bg-gray-50">
                            <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-xl border text-sm text-gray-500">Cancel</button>
                            <button onClick={handleCreate} disabled={saving}
                                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-navy text-white text-sm font-semibold disabled:opacity-60">
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                {saving ? "Saving..." : "Assign Teacher"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const selectCls = "w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/10 bg-white";
