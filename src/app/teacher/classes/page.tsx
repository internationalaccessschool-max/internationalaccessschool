"use client";

import { useState, useEffect } from "react";
import { Search, Loader2, Pencil, UserCircle2, Filter, Users } from "lucide-react";
import { collection, query, where, getDocs, collectionGroup } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { StudentEditModal } from "@/components/student/StudentEditModal";

interface Student {
    id: string;
    firstName: string;
    middleName?: string;
    lastName: string;
    admissionNumber: string;
    className: string;
    section: string;
    fatherName?: string;
    mobileNo?: string;
    [key: string]: any;
}

export default function TeacherClassesPage() {
    const [students, setStudents] = useState<Student[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [selectedClass, setSelectedClass] = useState("All");
    const [selectedSection, setSelectedSection] = useState("All");
    const [editingStudent, setEditingStudent] = useState<Student | null>(null);
    // classSections format: { "Class 6": ["A","B"], "Class 9": ["A"] }
    const [teacherAssignment, setTeacherAssignment] = useState<{ classSections: Record<string, string[]> } | null>(null);

    useEffect(() => {
        const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
            if (!user) return;

            // Get teacher's assignment — supports both old flat format and new classSections format
            const teacherSnap = await getDocs(query(collection(db, "teachers"), where("uid", "==", user.uid)));
            let classSections: Record<string, string[]> = {};
            if (!teacherSnap.empty) {
                const data = teacherSnap.docs[0].data();
                const a = data.assignment;
                if (a?.classSections) {
                    // New format
                    classSections = a.classSections;
                } else if (a?.classes?.length) {
                    // Old flat format — migrate on-the-fly
                    (a.classes as string[]).forEach((c: string) => { classSections[c] = a.sections || []; });
                }
            }
            setTeacherAssignment({ classSections });

            // Fetch students — try profiles sub-collection first (same as admin page), then users fallback
            try {
                let all: Student[] = [];

                // Primary: collectionGroup query on 'profiles'
                const profilesSnap = await getDocs(collectionGroup(db, "profiles"));
                all = profilesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Student));

                // Fallback: users collection with role=student
                if (all.length === 0) {
                    const usersSnap = await getDocs(query(collection(db, "users"), where("role", "==", "student")));
                    all = usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as Student));
                }

                const assignedClasses = Object.keys(classSections);
                console.log("[Teacher] assigned classSections:", classSections);
                console.log("[Teacher] total students found:", all.length);
                console.log("[Teacher] sample classNames:", all.slice(0, 3).map(s => s.className));

                const filtered = assignedClasses.length > 0
                    ? all.filter(s => {
                        // Normalize: trim and lowercase for comparison
                        const sCls = (s.className || "").trim();
                        const sSec = (s.section || "").trim().toUpperCase();
                        const matchCls = assignedClasses.find(c => c.trim() === sCls);
                        if (!matchCls) return false;
                        const allowedSections = (classSections[matchCls] || []).map(sec => sec.trim().toUpperCase());
                        return allowedSections.length === 0 || allowedSections.includes(sSec);
                    })
                    : all;

                console.log("[Teacher] filtered students:", filtered.length);
                setStudents(filtered);
            } catch (err) {
                console.error("[Teacher] student fetch error:", err);
            }
            setLoading(false);
        });
        return () => unsubscribeAuth();
    }, []);

    const classes = ["All", ...Array.from(new Set(students.map(s => s.className).filter(Boolean))).sort()];
    const sections = ["All", ...Array.from(new Set(students.map(s => s.section).filter(Boolean))).sort()];

    const filtered = students.filter(s => {
        const name = `${s.firstName || ""} ${s.middleName || ""} ${s.lastName || ""}`.toLowerCase();
        return (
            (name.includes(search.toLowerCase()) || (s.admissionNumber || "").includes(search)) &&
            (selectedClass === "All" || s.className === selectedClass) &&
            (selectedSection === "All" || s.section === selectedSection)
        );
    });

    const handleSaved = (updated: Student) => {
        setStudents(prev => prev.map(s => s.id === updated.id ? updated : s));
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="rounded-2xl gradient-navy p-6 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.2) 0%, transparent 50%)` }} />
                <div className="relative z-10">
                    <p className="text-white/50 text-sm font-medium">Teacher Panel</p>
                    <h1 className="text-2xl font-bold text-white mt-1">My Students</h1>
                    <p className="text-white/40 text-sm mt-1">
                        {loading ? "Loading..." : `${students.length} student${students.length !== 1 ? "s" : ""}`}
                        {teacherAssignment && Object.keys(teacherAssignment.classSections).length > 0
                            ? ` · Classes: ${Object.keys(teacherAssignment.classSections).join(", ")}`
                            : ""}
                    </p>
                </div>
            </div>

            {/* No assignment banner */}
            {!loading && teacherAssignment && Object.keys(teacherAssignment.classSections).length === 0 && (
                <div className="bg-amber-50 border border-amber-100 rounded-2xl px-5 py-4 flex items-center gap-3 text-amber-700 text-sm">
                    <Users className="w-5 h-5 shrink-0" />
                    <div>
                        <p className="font-semibold">No class assigned yet</p>
                        <p className="text-xs text-amber-600 mt-0.5">Ask your admin to assign you classes from the admin panel. Showing all students for now.</p>
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 items-center bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="search"
                        placeholder="Search by name or admission no..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
                    />
                </div>
                <div className="flex gap-2 shrink-0">
                    <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-gray-400" />
                        <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)}
                            className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-navy bg-white">
                            {classes.map(c => <option key={c} value={c}>{c === "All" ? "All Classes" : c}</option>)}
                        </select>
                    </div>
                    <select value={selectedSection} onChange={e => setSelectedSection(e.target.value)}
                        className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-navy bg-white">
                        {sections.map(s => <option key={s} value={s}>{s === "All" ? "All Sections" : `Section ${s}`}</option>)}
                    </select>
                </div>
            </div>

            {/* Student Grid */}
            {loading ? (
                <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-navy" /></div>
            ) : filtered.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-16 text-center">
                    <UserCircle2 className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-gray-400">No students found</p>
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="w-full overflow-x-auto">
                        <table className="w-full text-sm whitespace-nowrap">
                            <thead className="bg-gray-50 border-b border-gray-100">
                                <tr>
                                    {["Student", "Adm. No", "Class", "Father's Name", "Mobile", "Edit"].map(h => (
                                        <th key={h} className={`h-11 px-5 text-left align-middle font-semibold text-navy text-xs uppercase ${h === "Edit" ? "text-right" : ""}`}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filtered.map(s => (
                                    <tr key={s.id} className="hover:bg-gray-50/60 transition-colors">
                                        <td className="px-5 py-3.5 align-middle">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg overflow-hidden bg-navy/10 flex items-center justify-center shrink-0">
                                                    {s.childPhotoUrl
                                                        ? <img src={s.childPhotoUrl} alt={s.firstName} className="w-full h-full object-cover" />
                                                        : <span className="font-bold text-navy text-sm">{(s.firstName || "S").charAt(0)}</span>
                                                    }
                                                </div>
                                                <span className="font-semibold text-navy">{s.firstName} {s.middleName} {s.lastName}</span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3.5 align-middle">
                                            <span className="px-2 py-1 rounded-lg bg-blue-50 text-blue-700 text-xs font-bold">{s.admissionNumber || "—"}</span>
                                        </td>
                                        <td className="px-5 py-3.5 align-middle text-gray-600">
                                            {s.className} · <span className="text-gray-400">Sec {s.section}</span>
                                        </td>
                                        <td className="px-5 py-3.5 align-middle text-gray-600">{s.fatherName || "—"}</td>
                                        <td className="px-5 py-3.5 align-middle text-gray-600">{s.mobileNo || "—"}</td>
                                        <td className="px-5 py-3.5 align-middle text-right">
                                            <button
                                                onClick={() => setEditingStudent(s)}
                                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-navy bg-navy/5 hover:bg-navy/10 border border-navy/10 transition-colors"
                                            >
                                                <Pencil className="w-3.5 h-3.5" /> Edit
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="px-5 py-3 border-t border-gray-50 text-xs text-gray-400">
                        Showing {filtered.length} of {students.length} students
                    </div>
                </div>
            )}

            {/* Edit Modal — teacher role: locks admin fields */}
            {editingStudent && (
                <StudentEditModal
                    student={editingStudent}
                    role="teacher"
                    onClose={() => setEditingStudent(null)}
                    onSaved={handleSaved}
                />
            )}
        </div>
    );
}
