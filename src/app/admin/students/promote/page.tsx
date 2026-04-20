"use client";

import { useState, useEffect, useRef } from "react";
import {
    collectionGroup, getDocs, doc, setDoc, deleteDoc
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
    ArrowRight, Loader2, Save, RefreshCw, ChevronDown,
    Users, CheckCircle2, AlertCircle, Search, ArrowLeftRight
} from "lucide-react";
import toast from "react-hot-toast";

const CLASS_LIST = ["NUR", "LKG", "UKG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
const SECTIONS = ["A", "B", "C", "D", "E"];

const NEXT_CLASS: Record<string, string> = {
    NUR: "LKG", LKG: "UKG", UKG: "1",
    "1": "2", "2": "3", "3": "4", "4": "5", "5": "6",
    "6": "7", "7": "8", "8": "9", "9": "10", "10": "11", "11": "12",
};

interface Student {
    id: string;
    firstName?: string;
    lastName?: string;
    admissionNumber?: string;
    currentClass?: string;
    className?: string;
    section?: string;
    rollNumber?: string;
    status?: string;
    [key: string]: any;
}

interface EditRow {
    studentId: string;
    newClass: string;
    newSection: string;
    newRoll: string;
}

const getDisplayName = (s: Student) =>
    `${s.firstName || ""} ${s.lastName || ""}`.trim() || "Unknown";

const getClass = (s: Student) =>
    (s.className || s.currentClass || "").toString();

export default function PromotePage() {
    const [allStudents, setAllStudents] = useState<Student[]>([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [filterClass, setFilterClass] = useState("");
    const [filterSection, setFilterSection] = useState("All");
    const [search, setSearch] = useState("");

    // Edits: map studentId → row
    const [edits, setEdits] = useState<Record<string, EditRow>>({});
    const [saving, setSaving] = useState(false);
    const [savedCount, setSavedCount] = useState<number | null>(null);

    // Load all active students once
    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const snap = await getDocs(collectionGroup(db, "profiles"));
                const seen = new Set<string>();
                const data: Student[] = [];
                snap.docs.forEach(d => {
                    if (seen.has(d.id)) return;
                    seen.add(d.id);
                    const s = { id: d.id, ...d.data() } as Student;
                    if ((s.status || "").toUpperCase() !== "LEFT") data.push(s);
                });
                setStudents(data);
            } catch {
                toast.error("Students load karne mein error aaya");
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const setStudents = (data: Student[]) => setAllStudents(data);

    // Available sections for selected class
    const availableSections = ["All", ...Array.from(new Set(
        allStudents.filter(s => !filterClass || getClass(s) === filterClass)
            .map(s => s.section || "").filter(Boolean)
    )).sort()];

    // Filtered list
    const filtered = allStudents.filter(s => {
        if (filterClass && getClass(s) !== filterClass) return false;
        if (filterSection !== "All" && (s.section || "") !== filterSection) return false;
        if (search) {
            const q = search.toLowerCase();
            const name = getDisplayName(s).toLowerCase();
            const enr = (s.admissionNumber || "").toLowerCase();
            if (!name.includes(q) && !enr.includes(q)) return false;
        }
        return true;
    });

    // Get effective value for a student (edited or original)
    const getEdit = (s: Student): EditRow =>
        edits[s.id] || {
            studentId: s.id,
            newClass: getClass(s),
            newSection: s.section || "",
            newRoll: s.rollNumber || "",
        };

    const setEdit = (studentId: string, key: keyof Omit<EditRow, "studentId">, value: string) => {
        setEdits(prev => ({
            ...prev,
            [studentId]: {
                ...getEdit(allStudents.find(s => s.id === studentId)!),
                [key]: value,
            },
        }));
    };

    // Check if a row has pending changes
    const isDirty = (s: Student) => {
        const e = edits[s.id];
        if (!e) return false;
        return e.newClass !== getClass(s) || e.newSection !== (s.section || "") || e.newRoll !== (s.rollNumber || "");
    };

    const dirtyCount = filtered.filter(isDirty).length;

    // Promote all filtered students to next class
    const promoteAll = () => {
        const updates: Record<string, EditRow> = { ...edits };
        filtered.forEach(s => {
            const cls = getClass(s);
            const next = NEXT_CLASS[cls];
            if (!next) return;
            updates[s.id] = {
                studentId: s.id,
                newClass: next,
                newSection: s.section || "",
                newRoll: s.rollNumber || "",
            };
        });
        setEdits(updates);
        toast.success(`${filtered.length} students next class mein promote kiye (save karo)`);
    };

    // Set same section for all filtered
    const applyBulkSection = (section: string) => {
        const updates: Record<string, EditRow> = { ...edits };
        filtered.forEach(s => {
            updates[s.id] = { ...getEdit(s), newSection: section };
        });
        setEdits(updates);
    };

    // Clear all pending edits
    const clearEdits = () => {
        setEdits({});
        setSavedCount(null);
    };

    // Save all dirty rows
    const saveAll = async () => {
        const dirtyStudents = filtered.filter(isDirty);
        if (dirtyStudents.length === 0) return;

        setSaving(true);
        setSavedCount(null);
        let success = 0;
        let fail = 0;

        await Promise.all(dirtyStudents.map(async s => {
            const e = edits[s.id];
            if (!e) return;

            const oldClass = getClass(s);
            const oldSection = s.section || "";
            const classOrSectionChanged = e.newClass !== oldClass || e.newSection !== oldSection;

            try {
                const { id, ...studentData } = s;
                const updatedData = {
                    ...studentData,
                    currentClass: e.newClass,
                    className: e.newClass,
                    section: e.newSection,
                    rollNumber: e.newRoll,
                };

                const newDocRef = doc(db, "users", "classes", e.newClass, "sections", e.newSection, "students", "profiles", s.id);

                if (classOrSectionChanged) {
                    const oldDocRef = doc(db, "users", "classes", oldClass, "sections", oldSection, "students", "profiles", s.id);
                    await setDoc(newDocRef, updatedData, { merge: true });
                    await setDoc(
                        doc(db, "users", "classes", e.newClass, "sections", e.newSection, "students"),
                        { description: `Root for students in ${e.newClass} - ${e.newSection}`, updatedAt: new Date() },
                        { merge: true }
                    );
                    await deleteDoc(oldDocRef);
                } else {
                    await setDoc(newDocRef, { rollNumber: e.newRoll }, { merge: true });
                }

                // Update local state
                setAllStudents(prev => prev.map(st =>
                    st.id === s.id
                        ? { ...st, currentClass: e.newClass, className: e.newClass, section: e.newSection, rollNumber: e.newRoll }
                        : st
                ));
                success++;
            } catch {
                fail++;
            }
        }));

        setSaving(false);
        setSavedCount(success);

        // Clear saved rows from edits
        setEdits(prev => {
            const next = { ...prev };
            dirtyStudents.forEach(s => { delete next[s.id]; });
            return next;
        });

        if (fail > 0) toast.error(`${fail} students save nahi hue`);
        else toast.success(`${success} students successfully save ho gaye!`);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="rounded-2xl gradient-navy p-6 md:p-8 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10"
                    style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.2) 0%, transparent 50%)` }} />
                <div className="relative z-10">
                    <p className="text-white/50 text-sm font-medium">Admin Console</p>
                    <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">Promote / Transfer Students</h1>
                    <p className="text-white/40 text-sm mt-1">
                        Class, Section aur Roll Number bulk mein change karo.
                    </p>
                </div>
            </div>

            {/* Filters + Bulk Actions */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
                <div className="flex flex-wrap gap-3 items-end">
                    {/* Class filter */}
                    <div className="flex-1 min-w-[140px]">
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5">Class Filter</label>
                        <select
                            value={filterClass}
                            onChange={e => { setFilterClass(e.target.value); setFilterSection("All"); }}
                            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-navy outline-none bg-white"
                        >
                            <option value="">— All Classes —</option>
                            {CLASS_LIST.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>

                    {/* Section filter */}
                    <div className="flex-1 min-w-[120px]">
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5">Section Filter</label>
                        <select
                            value={filterSection}
                            onChange={e => setFilterSection(e.target.value)}
                            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-navy outline-none bg-white"
                        >
                            {availableSections.map(s => <option key={s} value={s}>{s === "All" ? "All Sections" : `Section ${s}`}</option>)}
                        </select>
                    </div>

                    {/* Search */}
                    <div className="flex-1 min-w-[180px] relative">
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5">Search Student</label>
                        <Search className="absolute left-3 bottom-[11px] w-4 h-4 text-gray-400" />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Name ya ENR..."
                            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-navy outline-none bg-white"
                        />
                    </div>
                </div>

                {/* Bulk action buttons */}
                <div className="flex flex-wrap gap-2 items-center border-t border-gray-50 pt-4">
                    <span className="text-xs font-semibold text-gray-400 mr-1">Bulk Actions:</span>

                    <button
                        onClick={promoteAll}
                        disabled={filtered.length === 0 || loading}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold hover:bg-emerald-100 transition-colors disabled:opacity-40"
                    >
                        <ArrowRight className="w-3.5 h-3.5" />
                        Promote to Next Class ({filtered.length})
                    </button>

                    {SECTIONS.map(sec => (
                        <button
                            key={sec}
                            onClick={() => applyBulkSection(sec)}
                            disabled={filtered.length === 0 || loading}
                            className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-gray-50 text-gray-600 border border-gray-200 text-xs font-semibold hover:bg-gray-100 transition-colors disabled:opacity-40"
                        >
                            Set All → {sec}
                        </button>
                    ))}

                    {dirtyCount > 0 && (
                        <button
                            onClick={clearEdits}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-50 text-red-600 border border-red-100 text-xs font-semibold hover:bg-red-100 transition-colors ml-auto"
                        >
                            <RefreshCw className="w-3.5 h-3.5" /> Reset Changes
                        </button>
                    )}
                </div>
            </div>

            {/* Stats bar */}
            {!loading && (
                <div className="flex items-center gap-4 px-1 text-sm text-gray-500">
                    <span className="flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-navy" />
                        <span className="font-semibold text-navy">{filtered.length}</span> students
                    </span>
                    {dirtyCount > 0 && (
                        <span className="flex items-center gap-1.5 text-amber-600 font-semibold">
                            <AlertCircle className="w-4 h-4" />
                            {dirtyCount} changes pending
                        </span>
                    )}
                    {savedCount !== null && (
                        <span className="flex items-center gap-1.5 text-emerald-600 font-semibold">
                            <CheckCircle2 className="w-4 h-4" />
                            {savedCount} saved
                        </span>
                    )}

                    {dirtyCount > 0 && (
                        <button
                            onClick={saveAll}
                            disabled={saving}
                            className="ml-auto inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-navy text-white text-sm font-semibold hover:bg-opacity-90 transition-colors disabled:opacity-60 shadow-sm"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            {saving ? "Saving..." : `Save ${dirtyCount} Changes`}
                        </button>
                    )}
                </div>
            )}

            {/* Table */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-8 h-8 animate-spin text-navy" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-16 text-gray-400">
                        <ArrowLeftRight className="w-10 h-10 mx-auto mb-3 opacity-20" />
                        <p className="text-sm font-medium">Koi student nahi mila</p>
                        <p className="text-xs mt-1">Filter change karo ya class select karo</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50/60">
                                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">#</th>
                                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Student</th>
                                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Current</th>
                                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">New Class</th>
                                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">New Section</th>
                                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Roll No</th>
                                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filtered.map((s, i) => {
                                    const e = getEdit(s);
                                    const dirty = isDirty(s);

                                    return (
                                        <tr key={s.id} className={`transition-colors ${dirty ? "bg-amber-50/50" : "hover:bg-gray-50/40"}`}>
                                            <td className="px-5 py-3 text-gray-400 text-xs font-mono">{i + 1}</td>
                                            <td className="px-5 py-3">
                                                <p className="font-semibold text-navy text-sm">{getDisplayName(s)}</p>
                                                <p className="text-xs text-gray-400 font-mono">{s.admissionNumber || "—"}</p>
                                            </td>
                                            <td className="px-5 py-3">
                                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 bg-gray-100 px-2 py-1 rounded-lg">
                                                    {getClass(s) || "—"} - {s.section || "—"}
                                                </span>
                                                {s.rollNumber && (
                                                    <p className="text-xs text-gray-400 mt-0.5">Roll: {s.rollNumber}</p>
                                                )}
                                            </td>
                                            <td className="px-5 py-3">
                                                <select
                                                    value={e.newClass}
                                                    onChange={ev => setEdit(s.id, "newClass", ev.target.value)}
                                                    className={`px-2.5 py-2 rounded-xl border text-xs font-semibold outline-none bg-white transition-colors ${
                                                        e.newClass !== getClass(s)
                                                            ? "border-amber-300 text-amber-700 bg-amber-50"
                                                            : "border-gray-200 text-gray-700"
                                                    }`}
                                                >
                                                    {CLASS_LIST.map(c => <option key={c} value={c}>{c}</option>)}
                                                </select>
                                            </td>
                                            <td className="px-5 py-3">
                                                <select
                                                    value={e.newSection}
                                                    onChange={ev => setEdit(s.id, "newSection", ev.target.value)}
                                                    className={`px-2.5 py-2 rounded-xl border text-xs font-semibold outline-none bg-white transition-colors ${
                                                        e.newSection !== (s.section || "")
                                                            ? "border-amber-300 text-amber-700 bg-amber-50"
                                                            : "border-gray-200 text-gray-700"
                                                    }`}
                                                >
                                                    {SECTIONS.map(sec => <option key={sec} value={sec}>{sec}</option>)}
                                                </select>
                                            </td>
                                            <td className="px-5 py-3">
                                                <input
                                                    type="text"
                                                    value={e.newRoll}
                                                    onChange={ev => setEdit(s.id, "newRoll", ev.target.value)}
                                                    placeholder="Roll no"
                                                    className={`w-20 px-2.5 py-2 rounded-xl border text-xs outline-none bg-white transition-colors ${
                                                        e.newRoll !== (s.rollNumber || "")
                                                            ? "border-amber-300 text-amber-700 bg-amber-50"
                                                            : "border-gray-200 text-gray-700"
                                                    }`}
                                                />
                                            </td>
                                            <td className="px-5 py-3">
                                                {dirty ? (
                                                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full">
                                                        <AlertCircle className="w-3 h-3" /> Pending
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-gray-300 font-medium">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Sticky save bar */}
            {dirtyCount > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
                    <div className="flex items-center gap-4 bg-navy text-white px-6 py-3.5 rounded-2xl shadow-2xl border border-white/10">
                        <AlertCircle className="w-4 h-4 text-amber-300" />
                        <span className="text-sm font-semibold">{dirtyCount} unsaved changes</span>
                        <button
                            onClick={clearEdits}
                            className="text-white/50 hover:text-white text-xs font-medium transition-colors"
                        >
                            Reset
                        </button>
                        <button
                            onClick={saveAll}
                            disabled={saving}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-navy text-sm font-bold hover:bg-gray-100 transition-colors disabled:opacity-60"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            {saving ? "Saving..." : "Save All"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
