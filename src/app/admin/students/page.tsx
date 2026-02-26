"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Plus, Search, Filter, Loader2, Pencil, UserCircle2, Trash2, AlertTriangle } from "lucide-react";
import { collectionGroup, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Link from "next/link";
import { StudentEditModal } from "@/components/student/StudentEditModal";

interface Student {
    id: string;
    firstName: string;
    middleName?: string;
    lastName: string;
    admissionNumber: string;
    className: string;
    section: string;
    fatherName: string;
    mobileNo: string;
    [key: string]: any;
}

export default function AdminStudentsPage() {
    const [isLoading, setIsLoading] = useState(true);
    const [students, setStudents] = useState<Student[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedClass, setSelectedClass] = useState("All");
    const [editingStudent, setEditingStudent] = useState<Student | null>(null);
    // Delete confirmation state — step 1: show dialog, step 2: isDeleting
    const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
    const [deleteConfirmText, setDeleteConfirmText] = useState("");
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState("");

    useEffect(() => {
        const fetch = async () => {
            setIsLoading(true);
            try {
                // Try collectionGroup 'profiles' first (nested structure)
                const snap1 = await getDocs(collectionGroup(db, "profiles"));
                let data = snap1.docs.map(d => ({ id: d.id, ...d.data() } as Student));

                // Deduplicate by ID in case a student exists in multiple nested paths
                const uniqueIds = new Set();
                data = data.filter(student => {
                    if (uniqueIds.has(student.id)) return false;
                    uniqueIds.add(student.id);
                    return true;
                });

                setStudents(data);
            } catch (err) {
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };
        fetch();
    }, []);

    const classes = ["All", ...Array.from(new Set(students.map(s => s.className).filter(Boolean))).sort()];

    const filtered = students.filter(s => {
        const name = `${s.firstName || ""} ${s.middleName || ""} ${s.lastName || ""}`.toLowerCase();
        const matchSearch = name.includes(searchTerm.toLowerCase()) ||
            (s.admissionNumber || "").toLowerCase().includes(searchTerm.toLowerCase());
        const matchClass = selectedClass === "All" || s.className === selectedClass;
        return matchSearch && matchClass;
    });

    const handleSaved = (updated: Student) => {
        setStudents(prev => prev.map(s => s.id === updated.id ? updated : s));
    };

    const openDeleteDialog = (student: Student) => {
        setDeleteTarget(student);
        setDeleteConfirmText("");
        setDeleteError("");
    };

    const handleConfirmDelete = async () => {
        if (!deleteTarget) return;
        if (deleteConfirmText !== "DELETE") {
            setDeleteError('Type DELETE (all caps) to confirm.');
            return;
        }
        setIsDeleting(true);
        setDeleteError("");
        try {
            const res = await fetch("/api/admin/delete-student", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ uid: deleteTarget.id }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || "Failed to delete student.");
            // Remove from local state
            setStudents(prev => prev.filter(s => s.id !== deleteTarget.id));
            setDeleteTarget(null);
        } catch (err: any) {
            setDeleteError(err.message);
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="rounded-2xl gradient-navy p-6 md:p-8 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.2) 0%, transparent 50%)` }} />
                <div className="relative z-10 flex items-center justify-between gap-4 flex-wrap">
                    <div>
                        <p className="text-white/50 text-sm font-medium">Admin Console</p>
                        <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">Student Directory</h1>
                        <p className="text-white/40 text-sm mt-1">{students.length} student{students.length !== 1 ? "s" : ""} enrolled</p>
                    </div>
                    <div className="flex gap-3">
                        <Link href="/admin/students/import" className="px-4 py-2.5 rounded-xl border border-white/20 text-white text-sm font-semibold hover:bg-white/10 transition-colors">
                            Bulk Import
                        </Link>
                        <Link href="/admissions" className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gold text-navy text-sm font-bold hover:bg-gold/90 transition-colors">
                            <Plus className="w-4 h-4" /> Add Student
                        </Link>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 items-center bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                        type="search"
                        placeholder="Search by name or admission number..."
                        className="pl-10 border-gray-200 focus:border-navy focus:ring-navy/10 rounded-xl"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Filter className="w-4 h-4 text-gray-400" />
                    <select
                        className="px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:border-navy"
                        value={selectedClass}
                        onChange={e => setSelectedClass(e.target.value)}
                    >
                        {classes.map(c => <option key={c} value={c}>{c === "All" ? "All Classes" : c}</option>)}
                    </select>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="w-full overflow-x-auto">
                    <table className="w-full text-sm whitespace-nowrap">
                        <thead className="bg-gray-50 border-b border-gray-100">
                            <tr>
                                {["Student", "Adm. No", "Class & Sec", "Father's Name", "Mobile", "Actions"].map(h => (
                                    <th key={h} className={`h-12 px-5 text-left align-middle font-semibold text-navy text-xs uppercase tracking-wide ${h === "Actions" ? "text-right" : ""}`}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {isLoading ? (
                                <tr><td colSpan={6} className="p-16 text-center text-gray-400">
                                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-navy" />
                                    Loading students...
                                </td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={6} className="p-16 text-center">
                                    <UserCircle2 className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                                    <p className="text-gray-400 text-sm font-medium">No students found</p>
                                </td></tr>
                            ) : filtered.map(student => (
                                <tr key={student.id} className="hover:bg-gray-50/60 transition-colors">
                                    <td className="px-5 py-4 align-middle">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg overflow-hidden bg-navy/10 flex items-center justify-center shrink-0">
                                                {student.childPhotoUrl
                                                    ? <img src={student.childPhotoUrl} alt={student.firstName} className="w-full h-full object-cover" />
                                                    : <span className="font-bold text-navy text-sm">{(student.firstName || "S").charAt(0)}</span>
                                                }
                                            </div>
                                            <span className="font-semibold text-navy">
                                                {student.firstName} {student.middleName} {student.lastName}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-5 py-4 align-middle">
                                        <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 text-xs font-bold border border-blue-100">
                                            {student.admissionNumber || "—"}
                                        </span>
                                    </td>
                                    <td className="px-5 py-4 align-middle">
                                        <span className="font-medium text-navy">{student.className}</span>
                                        <span className="text-gray-400 mx-1">·</span>
                                        <span className="text-gray-600">Sec {student.section}</span>
                                    </td>
                                    <td className="px-5 py-4 align-middle text-gray-600">{student.fatherName || "—"}</td>
                                    <td className="px-5 py-4 align-middle text-gray-600">{student.mobileNo || "—"}</td>
                                    <td className="px-5 py-4 align-middle text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => setEditingStudent(student)}
                                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-navy bg-navy/5 hover:bg-navy/10 border border-navy/10 transition-colors"
                                            >
                                                <Pencil className="w-3.5 h-3.5" /> Edit
                                            </button>
                                            <button
                                                onClick={() => openDeleteDialog(student)}
                                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-100 transition-colors"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" /> Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Edit Modal */}
            {editingStudent && (
                <StudentEditModal
                    student={editingStudent}
                    role="admin"
                    onClose={() => setEditingStudent(null)}
                    onSaved={updated => { handleSaved(updated); }}
                />
            )}

            {/* Delete Confirmation Modal */}
            {deleteTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
                        {/* Icon + Title */}
                        <div className="flex flex-col items-center text-center gap-3 pt-2">
                            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center">
                                <AlertTriangle className="w-7 h-7 text-red-600" />
                            </div>
                            <h2 className="text-xl font-bold text-gray-900">Delete Student?</h2>
                            <p className="text-sm text-gray-500 leading-relaxed">
                                You are about to permanently delete{" "}
                                <span className="font-semibold text-gray-800">
                                    {deleteTarget.firstName} {deleteTarget.lastName}
                                </span>{" "}
                                (Adm. No: <span className="font-mono font-bold text-navy">{deleteTarget.admissionNumber}</span>).
                                <br />
                                This will <span className="text-red-600 font-semibold">remove their login access and all data</span> permanently.
                            </p>
                        </div>

                        {/* Divider */}
                        <div className="border-t border-dashed border-gray-200" />

                        {/* Type-to-confirm */}
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-gray-700">
                                Type <span className="font-mono bg-red-50 text-red-600 px-1.5 py-0.5 rounded">DELETE</span> to confirm:
                            </label>
                            <input
                                type="text"
                                value={deleteConfirmText}
                                onChange={e => { setDeleteConfirmText(e.target.value); setDeleteError(""); }}
                                placeholder="Type DELETE here..."
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 font-mono"
                            />
                            {deleteError && (
                                <p className="text-xs text-red-600 font-medium">{deleteError}</p>
                            )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-3 pt-1">
                            <button
                                onClick={() => setDeleteTarget(null)}
                                disabled={isDeleting}
                                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmDelete}
                                disabled={isDeleting || deleteConfirmText !== "DELETE"}
                                className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isDeleting ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" /> Deleting...</>
                                ) : (
                                    <><Trash2 className="w-4 h-4" /> Yes, Delete Student</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
