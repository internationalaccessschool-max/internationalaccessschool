"use client";

import { useState, useEffect } from "react";
import {
    collection, getDocs, doc, setDoc, deleteDoc,
    serverTimestamp, query, orderBy, onSnapshot
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
    Users, Plus, Edit2, Trash2, Loader2, X,
    CheckCircle2, BookOpen, ChevronDown, ChevronRight
} from "lucide-react";
import toast from "react-hot-toast";

const CLASS_LIST = ["NUR", "LKG", "UKG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
const SECTIONS = ["A", "B", "C", "D", "E"];

interface ClassSection {
    cls: string;
    section: string;
    teacherName: string | null;
    teacherId: string | null;
    studentCount: number;
}

interface Teacher {
    id: string;
    firstName: string;
    lastName: string;
}

export default function AdminClassesPage() {
    const [data, setData] = useState<ClassSection[]>([]);
    const [teachers, setTeachers] = useState<Teacher[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<string[]>(["1"]);

    // Add / Edit modal
    const [editModal, setEditModal] = useState<{ cls: string; section: string } | null>(null);
    const [editTeacherId, setEditTeacherId] = useState("");
    const [saving, setSaving] = useState(false);

    // Fetch teachers
    useEffect(() => {
        const q = query(collection(db, "teachers"), orderBy("firstName"));
        return onSnapshot(q, snap => {
            setTeachers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Teacher)));
        });
    }, []);

    // Fetch class_teachers + student counts
    useEffect(() => {
        const fetch = async () => {
            setLoading(true);
            try {
                // 1. Get all class teacher assignments
                const ctSnap = await getDocs(collection(db, "class_teachers"));
                const ctMap: Record<string, { teacherName: string | null; teacherId: string | null }> = {};
                ctSnap.docs.forEach(d => {
                    const { cls, section, teacherName, teacherId } = d.data();
                    ctMap[`${cls}-${section}`] = { teacherName: teacherName || null, teacherId: teacherId || null };
                });

                // 2. Get student counts per class-section (only Active, exclude LEFT)
                const countMap: Record<string, number> = {};
                await Promise.all(CLASS_LIST.map(async cls => {
                    await Promise.all(SECTIONS.map(async section => {
                        try {
                            const snap = await getDocs(
                                collection(db, "users", "classes", cls, "sections", section, "students", "profiles")
                            );
                            const activeCount = snap.docs.filter(d => {
                                const status = (d.data().status || "").toString().toUpperCase();
                                return status !== "LEFT";
                            }).length;
                            if (activeCount > 0) countMap[`${cls}-${section}`] = activeCount;
                        } catch { /* section may not exist */ }
                    }));
                }));

                // 3. Build combined list — only include sections that have a teacher OR students
                const rows: ClassSection[] = [];
                CLASS_LIST.forEach(cls => {
                    SECTIONS.forEach(section => {
                        const key = `${cls}-${section}`;
                        const ct = ctMap[key];
                        const count = countMap[key] || 0;
                        if (ct || count > 0) {
                            rows.push({
                                cls,
                                section,
                                teacherName: ct?.teacherName || null,
                                teacherId: ct?.teacherId || null,
                                studentCount: count,
                            });
                        }
                    });
                });

                setData(rows);
            } catch (err) {
                console.error(err);
                toast.error("Failed to load classes");
            } finally {
                setLoading(false);
            }
        };
        fetch();
    }, []);

    const groupedClasses = CLASS_LIST.map(cls => ({
        cls,
        sections: data.filter(r => r.cls === cls),
    })).filter(g => g.sections.length > 0);

    const totalStudents = data.reduce((s, r) => s + r.studentCount, 0);
    const totalSections = data.length;
    const assignedTeachers = data.filter(r => r.teacherId).length;

    const toggleExpand = (cls: string) =>
        setExpanded(prev => prev.includes(cls) ? prev.filter(c => c !== cls) : [...prev, cls]);

    const openEdit = (cls: string, section: string, teacherId: string | null) => {
        setEditModal({ cls, section });
        setEditTeacherId(teacherId || "");
    };

    const handleSaveAssignment = async () => {
        if (!editModal) return;
        setSaving(true);
        const { cls, section } = editModal;
        const docId = `${cls}-${section}`.replace(/ /g, "_");
        try {
            const teacher = teachers.find(t => t.id === editTeacherId);
            const teacherName = teacher ? `${teacher.firstName} ${teacher.lastName}` : null;
            await setDoc(doc(db, "class_teachers", docId), {
                cls, section,
                teacherId: editTeacherId || null,
                teacherName: teacherName || null,
                updatedAt: serverTimestamp(),
            });
            setData(prev => prev.map(r =>
                r.cls === cls && r.section === section
                    ? { ...r, teacherId: editTeacherId || null, teacherName: teacherName || null }
                    : r
            ));
            toast.success(`Class ${cls}-${section} updated!`);
            setEditModal(null);
        } catch {
            toast.error("Failed to save");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="rounded-2xl gradient-navy p-6 md:p-8 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10"
                    style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.2) 0%, transparent 50%)` }} />
                <div className="relative z-10">
                    <p className="text-white/50 text-sm font-medium">Admin Console</p>
                    <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">Manage Classes</h1>
                    <p className="text-white/40 text-sm mt-1">View all active class sections and their assigned class teachers.</p>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
                {[
                    { label: "Total Sections", value: totalSections, icon: BookOpen },
                    { label: "Total Students", value: totalStudents, icon: Users },
                    { label: "Teachers Assigned", value: assignedTeachers, icon: CheckCircle2 },
                ].map(s => (
                    <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-navy/10 flex items-center justify-center">
                            <s.icon className="w-5 h-5 text-navy" />
                        </div>
                        <div>
                            <div className="text-xl font-bold text-navy">{loading ? "—" : s.value}</div>
                            <div className="text-xs text-gray-400">{s.label}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Class List */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-navy" />
                </div>
            ) : groupedClasses.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm text-center py-20 text-gray-400">
                    <Users className="w-10 h-10 mx-auto mb-3 opacity-20" />
                    <p className="text-sm font-medium">No class sections found</p>
                    <p className="text-xs mt-1">Students will appear here once they are registered and assigned to classes.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {groupedClasses.map(({ cls, sections }) => {
                        const isExpanded = expanded.includes(cls);
                        const totalInClass = sections.reduce((s, r) => s + r.studentCount, 0);
                        const assignedInClass = sections.filter(r => r.teacherId).length;

                        return (
                            <div key={cls} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                {/* Class Header */}
                                <button
                                    onClick={() => toggleExpand(cls)}
                                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50/60 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-navy/10 flex items-center justify-center text-navy font-extrabold text-sm">
                                            {cls}
                                        </div>
                                        <div className="text-left">
                                            <p className="font-bold text-navy">Class {cls}</p>
                                            <p className="text-xs text-gray-400">
                                                {sections.length} section{sections.length > 1 ? "s" : ""} · {totalInClass} students
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {assignedInClass > 0 && (
                                            <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 px-2.5 py-1 rounded-full font-semibold">
                                                {assignedInClass}/{sections.length} assigned
                                            </span>
                                        )}
                                        {isExpanded
                                            ? <ChevronDown className="w-4 h-4 text-gray-400" />
                                            : <ChevronRight className="w-4 h-4 text-gray-400" />}
                                    </div>
                                </button>

                                {/* Sections */}
                                {isExpanded && (
                                    <div className="border-t border-gray-50 divide-y divide-gray-50">
                                        {sections.map(row => (
                                            <div key={row.section} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50/40 transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${row.teacherId ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-500"}`}>
                                                        {row.section}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-semibold text-navy">
                                                            Class {row.cls} — {row.section}
                                                        </p>
                                                        <p className="text-xs text-gray-400">
                                                            Class Teacher:{" "}
                                                            <span className={row.teacherName ? "text-emerald-600 font-medium" : "text-gray-300"}>
                                                                {row.teacherName || "Not assigned"}
                                                            </span>
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <div className="text-right">
                                                        <p className="text-sm font-bold text-navy">{row.studentCount}</p>
                                                        <p className="text-xs text-gray-400">students</p>
                                                    </div>
                                                    <button
                                                        onClick={() => openEdit(row.cls, row.section, row.teacherId)}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:border-navy hover:text-navy transition-colors"
                                                    >
                                                        <Edit2 className="w-3 h-3" /> Edit
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Edit Modal */}
            {editModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                            <div>
                                <h3 className="font-bold text-navy">Edit Class Teacher</h3>
                                <p className="text-xs text-gray-400 mt-0.5">Class {editModal.cls} — {editModal.section}</p>
                            </div>
                            <button onClick={() => setEditModal(null)}
                                className="p-2 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Assign Class Teacher</label>
                                <select
                                    value={editTeacherId}
                                    onChange={e => setEditTeacherId(e.target.value)}
                                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-navy outline-none bg-white"
                                >
                                    <option value="">— No class teacher —</option>
                                    {teachers.map(t => (
                                        <option key={t.id} value={t.id}>
                                            {t.firstName} {t.lastName}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="px-5 pb-5 flex gap-3">
                            <button onClick={() => setEditModal(null)}
                                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                                Cancel
                            </button>
                            <button onClick={handleSaveAssignment} disabled={saving}
                                className="flex-1 px-4 py-2.5 rounded-xl bg-navy text-white text-sm font-semibold hover:bg-opacity-90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
