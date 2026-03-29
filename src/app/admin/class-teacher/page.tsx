"use client";

import { useState, useEffect } from "react";
import { collectionGroup, collection, doc, getDocs, onSnapshot, query, orderBy, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Loader2, CheckCircle2, Users, ChevronDown, ChevronRight } from "lucide-react";

// Sort helper: NUR → LKG → UKG → 0 → 1 … 12
function classOrder(cls: string): number {
    const map: Record<string, number> = { NUR: -3, LKG: -2, UKG: -1 };
    const key = cls.toUpperCase();
    if (map[key] !== undefined) return map[key];
    const n = parseInt(cls, 10);
    return isNaN(n) ? 999 : n;
}

function sortClasses(classes: string[]): string[] {
    return [...classes].sort((a, b) => classOrder(a) - classOrder(b));
}

interface Teacher {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    subjects?: string[];
}

// Stored in Firestore as: class_teachers/{className}-{section} = { teacherId, teacherName, cls, section }
interface ClassTeacherMap {
    [cls: string]: {
        [section: string]: { teacherId: string; teacherName: string } | null;
    };
}

export default function ClassTeacherPage() {
    const [teachers, setTeachers] = useState<Teacher[]>([]);
    const [classTeachers, setClassTeachers] = useState<ClassTeacherMap>({});
    // classSectionMap: { "NUR": ["A","B"], "1": ["A"], … }
    const [classSectionMap, setClassSectionMap] = useState<Record<string, string[]>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    const [saved, setSaved] = useState<string | null>(null);
    const [conflictError, setConflictError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<string[]>([]);

    // Fetch teachers list
    useEffect(() => {
        const q = query(collection(db, "teachers"), orderBy("firstName"));
        return onSnapshot(q, snap => {
            setTeachers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Teacher)));
        });
    }, []);

    // Fetch classes + sections from student profiles in DB
    useEffect(() => {
        const fetchStructure = async () => {
            setLoading(true);
            try {
                // 1. Build class→sections map from actual student profiles
                const profilesSnap = await getDocs(collectionGroup(db, "profiles"));
                const map: Record<string, Set<string>> = {};
                profilesSnap.docs.forEach(d => {
                    const data = d.data();
                    // Only include active students
                    if ((data.status ?? "ACTIVE").toString().toUpperCase() === "LEFT") return;
                    const cls = (data.currentClass ?? data.className ?? "").toString().trim();
                    const sec = (data.section ?? "").toString().trim();
                    if (!cls || !sec) return;
                    if (!map[cls]) map[cls] = new Set();
                    map[cls].add(sec);
                });

                const sorted: Record<string, string[]> = {};
                sortClasses(Object.keys(map)).forEach(cls => {
                    sorted[cls] = [...map[cls]].sort();
                });
                setClassSectionMap(sorted);

                // Auto-expand first class
                const firstCls = Object.keys(sorted)[0];
                if (firstCls) setExpanded([firstCls]);

                // 2. Load existing class_teacher assignments
                const ctMap: ClassTeacherMap = {};
                const ctSnap = await getDocs(collection(db, "class_teachers"));
                ctSnap.docs.forEach(d => {
                    const { cls, section, teacherId, teacherName } = d.data();
                    if (!ctMap[cls]) ctMap[cls] = {};
                    ctMap[cls][section] = teacherId ? { teacherId, teacherName } : null;
                });
                setClassTeachers(ctMap);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetchStructure();
    }, []);

    const getAssigned = (cls: string, section: string) =>
        classTeachers[cls]?.[section] || null;

    const handleAssign = async (cls: string, section: string, teacherId: string) => {
        setConflictError(null);

        // Rule: a teacher can only be class teacher of ONE section in the entire school
        if (teacherId) {
            for (const [otherCls, sections] of Object.entries(classTeachers)) {
                for (const [otherSection, sectionData] of Object.entries(sections)) {
                    if (sectionData?.teacherId === teacherId) {
                        if (otherCls === cls && otherSection === section) continue;
                        const teacher = teachers.find(t => t.id === teacherId);
                        const tName = teacher ? `${teacher.firstName} ${teacher.lastName}` : "This teacher";
                        setConflictError(`${tName} is already Class Teacher of ${otherCls} – Section ${otherSection}. A teacher can only be Class Teacher of one section.`);
                        return;
                    }
                }
            }
        }

        const key = `${cls}-${section}`;
        setSaving(key);
        const teacher = teachers.find(t => t.id === teacherId);
        const teacherName = teacher ? `${teacher.firstName} ${teacher.lastName}` : "";

        try {
            const docId = `${cls}-${section}`.replace(/ /g, "_");
            if (teacherId) {
                await setDoc(doc(db, "class_teachers", docId), {
                    cls, section, teacherId, teacherName,
                    updatedAt: serverTimestamp(),
                });
                setClassTeachers(prev => ({
                    ...prev,
                    [cls]: { ...(prev[cls] || {}), [section]: { teacherId, teacherName } }
                }));
            } else {
                await setDoc(doc(db, "class_teachers", docId), {
                    cls, section, teacherId: null, teacherName: null,
                    updatedAt: serverTimestamp(),
                });
                setClassTeachers(prev => ({
                    ...prev,
                    [cls]: { ...(prev[cls] || {}), [section]: null }
                }));
            }
            setSaved(key);
            setTimeout(() => setSaved(null), 2000);
        } catch (e) { console.error(e); }
        setSaving(null);
    };

    const toggleExpand = (cls: string) =>
        setExpanded(prev => prev.includes(cls) ? prev.filter(c => c !== cls) : [...prev, cls]);

    const assignedCount = Object.values(classTeachers).reduce((total, sections) =>
        total + Object.values(sections).filter(v => v?.teacherId).length, 0);

    const allClasses = Object.keys(classSectionMap);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="rounded-2xl gradient-navy p-6 md:p-8 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.2) 0%, transparent 50%)` }} />
                <div className="relative z-10">
                    <p className="text-white/50 text-sm">Admin Console</p>
                    <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">Class Teachers</h1>
                    <p className="text-white/40 text-sm mt-1">
                        Assign one class teacher per class–section · {assignedCount} assignment{assignedCount !== 1 ? "s" : ""} made · {teachers.length} teachers available
                    </p>
                </div>
            </div>

            {/* Conflict Error */}
            {conflictError && (
                <div className="bg-red-50 border border-red-100 rounded-2xl px-5 py-4 flex items-start gap-3 text-sm text-red-600">
                    <span className="text-base shrink-0">⚠️</span>
                    <div>
                        <p className="font-semibold">Assignment blocked</p>
                        <p className="text-xs text-red-500 mt-0.5">{conflictError}</p>
                    </div>
                    <button onClick={() => setConflictError(null)} className="ml-auto text-red-300 hover:text-red-500 text-lg leading-none">×</button>
                </div>
            )}

            {/* Info */}
            <div className="bg-blue-50 border border-blue-100 rounded-2xl px-5 py-4 flex items-start gap-3 text-sm text-blue-700">
                <Users className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                    <p className="font-semibold">Rules</p>
                    <ul className="text-xs text-blue-500 mt-1 space-y-0.5 list-disc list-inside">
                        <li>Each section has <strong>one</strong> class teacher</li>
                        <li>A teacher can be class teacher of <strong>only one section</strong> in the school</li>
                        <li>Class teachers manage attendance &amp; exam marks for their section</li>
                    </ul>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-navy" /></div>
            ) : allClasses.length === 0 ? (
                <div className="text-center py-20 text-gray-400 text-sm">No classes found in the database.</div>
            ) : (
                <div className="space-y-3">
                    {allClasses.map(cls => {
                        const sections = classSectionMap[cls] || [];
                        const isExpanded = expanded.includes(cls);
                        const clsData = classTeachers[cls] || {};
                        const assignedInClass = sections.filter(s => clsData[s]?.teacherId).length;

                        return (
                            <div key={cls} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                {/* Class header */}
                                <button
                                    type="button"
                                    onClick={() => toggleExpand(cls)}
                                    className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl bg-navy/10 flex items-center justify-center text-navy font-bold text-sm">
                                            {cls}
                                        </div>
                                        <div>
                                            <p className="font-bold text-navy">
                                                {["NUR","LKG","UKG"].includes(cls.toUpperCase())
                                                    ? cls.toUpperCase()
                                                    : `Class ${cls}`}
                                            </p>
                                            <p className="text-xs text-gray-400">
                                                {assignedInClass > 0
                                                    ? `${assignedInClass} section${assignedInClass > 1 ? "s" : ""} assigned`
                                                    : "No class teachers assigned"}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {assignedInClass > 0 && (
                                            <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 px-2.5 py-1 rounded-full font-semibold">
                                                {assignedInClass}/{sections.length} sections
                                            </span>
                                        )}
                                        {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                                    </div>
                                </button>

                                {/* Section rows */}
                                {isExpanded && (
                                    <div className="border-t border-gray-50 divide-y divide-gray-50">
                                        {sections.map(section => {
                                            const key = `${cls}-${section}`;
                                            const assigned = getAssigned(cls, section);
                                            const isSaving = saving === key;
                                            const isSaved = saved === key;
                                            return (
                                                <div key={section} className="flex items-center gap-4 px-5 py-3.5">
                                                    {/* Section badge */}
                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${assigned?.teacherId ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-400"}`}>
                                                        {section}
                                                    </div>

                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-xs font-semibold text-gray-500 mb-1">Section {section}</p>
                                                        <select
                                                            value={assigned?.teacherId || ""}
                                                            onChange={e => handleAssign(cls, section, e.target.value)}
                                                            className="w-full max-w-xs px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-navy bg-white"
                                                        >
                                                            <option value="">— No class teacher —</option>
                                                            {teachers.map(t => {
                                                                let conflictLabel: string | null = null;
                                                                for (const [otherCls, secs] of Object.entries(classTeachers)) {
                                                                    for (const [otherSec, secData] of Object.entries(secs)) {
                                                                        if (secData?.teacherId === t.id) {
                                                                            if (otherCls === cls && otherSec === section) break;
                                                                            conflictLabel = `${otherCls}–${otherSec}`;
                                                                            break;
                                                                        }
                                                                    }
                                                                    if (conflictLabel) break;
                                                                }
                                                                return (
                                                                    <option key={t.id} value={t.id} disabled={!!conflictLabel}>
                                                                        {t.firstName} {t.lastName}
                                                                        {t.subjects?.length ? ` · ${t.subjects.slice(0, 1).join(", ")}` : ""}
                                                                        {conflictLabel ? ` ✗ (CT of ${conflictLabel})` : ""}
                                                                    </option>
                                                                );
                                                            })}
                                                        </select>
                                                    </div>

                                                    <div className="shrink-0 w-20 text-right">
                                                        {isSaving && <Loader2 className="w-4 h-4 animate-spin text-navy inline-block" />}
                                                        {isSaved && !isSaving && (
                                                            <span className="text-xs text-emerald-600 flex items-center gap-1 justify-end">
                                                                <CheckCircle2 className="w-3.5 h-3.5" /> Saved
                                                            </span>
                                                        )}
                                                        {!isSaving && !isSaved && assigned?.teacherName && (
                                                            <span className="text-[10px] text-gray-400 truncate block max-w-[80px] text-right">{assigned.teacherName.split(" ")[0]}</span>
                                                        )}
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
