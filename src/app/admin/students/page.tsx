"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import {
    Plus, Search, Filter, Loader2, Pencil, UserCircle2,
    AlertTriangle, FileDown, PowerOff, RotateCcw
} from "lucide-react";
import {
    collectionGroup, getDocs, doc, updateDoc
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import Link from "next/link";
import { StudentEditModal } from "@/components/student/StudentEditModal";
import * as XLSX from "xlsx";
import toast from "react-hot-toast";

interface Student {
    id: string;
    firstName?: string;
    middleName?: string;
    lastName?: string;
    name?: string;
    admissionNumber: string;
    serialNumber?: string;
    className?: string;
    currentClass?: string;
    section?: string;
    fatherName?: string;
    mobileNo?: string;
    status?: string;
    leftYear?: string;
    lastDate?: string;
    branch?: string;
    remarks?: string;
    lastClass?: string;
    dob?: string;
    gender?: string;
    session?: string;
    [key: string]: any;
}

// Helper: get full display name
const getDisplayName = (s: Student) =>
    s.name || `${s.firstName || ""} ${s.middleName || ""} ${s.lastName || ""}`.trim();

// Helper: get class display
const getClass = (s: Student) => s.currentClass || s.className || "—";

export default function AdminStudentsPage() {
    const [isLoading, setIsLoading] = useState(true);
    const [students, setStudents] = useState<Student[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedClass, setSelectedClass] = useState("All");
    const [editingStudent, setEditingStudent] = useState<Student | null>(null);
    const [activeTab, setActiveTab] = useState<"active" | "left">("active");

    // Disable dialog state
    const [disableTarget, setDisableTarget] = useState<Student | null>(null);
    const [isDisabling, setIsDisabling] = useState(false);

    // Re-activate dialog state
    const [reactivateTarget, setReactivateTarget] = useState<Student | null>(null);
    const [isReactivating, setIsReactivating] = useState(false);

    useEffect(() => {
        const fetchStudents = async () => {
            setIsLoading(true);
            try {
                const snap = await getDocs(collectionGroup(db, "profiles"));
                let data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Student));
                // Deduplicate
                const seen = new Set<string>();
                data = data.filter(s => { if (seen.has(s.id)) return false; seen.add(s.id); return true; });
                setStudents(data);
            } catch (err) { console.error(err); }
            finally { setIsLoading(false); }
        };
        fetchStudents();
    }, []);

    // Split into active / left
    const activeStudents = students.filter(s => (s.status || "").toUpperCase() !== "LEFT");
    const leftStudents = students.filter(s => (s.status || "").toUpperCase() === "LEFT");

    const classes = ["All", ...Array.from(new Set(
        (activeTab === "active" ? activeStudents : leftStudents)
            .map(s => getClass(s)).filter(Boolean)
    )).sort()];

    const filterList = (list: Student[]) =>
        list.filter(s => {
            const name = getDisplayName(s).toLowerCase();
            const matchSearch = name.includes(searchTerm.toLowerCase()) ||
                (s.admissionNumber || "").toLowerCase().includes(searchTerm.toLowerCase());
            const matchClass = selectedClass === "All" || getClass(s) === selectedClass;
            return matchSearch && matchClass;
        });

    const filtered = filterList(activeTab === "active" ? activeStudents : leftStudents);

    const handleSaved = (updated: Student) =>
        setStudents(prev => prev.map(s => s.id === updated.id ? updated : s));

    // ─── Disable Student ───
    const handleDisable = async () => {
        if (!disableTarget) return;
        setIsDisabling(true);
        try {
            // Find doc ref in Firestore via collectionGroup
            const snap = await getDocs(collectionGroup(db, "profiles"));
            const docRef = snap.docs.find(d => d.id === disableTarget.id)?.ref;
            if (!docRef) throw new Error("Student document not found");

            await updateDoc(docRef, {
                status: "LEFT",
                disabledAt: new Date().toISOString(),
            });

            setStudents(prev => prev.map(s =>
                s.id === disableTarget.id ? { ...s, status: "LEFT" } : s
            ));
            toast.success(`${getDisplayName(disableTarget)} moved to Left Students`);
            setDisableTarget(null);
        } catch (err: any) {
            toast.error(err.message || "Failed to disable student");
        } finally { setIsDisabling(false); }
    };

    // ─── Re-activate Student ───
    const handleReactivate = async () => {
        if (!reactivateTarget) return;
        setIsReactivating(true);
        try {
            const snap = await getDocs(collectionGroup(db, "profiles"));
            const docRef = snap.docs.find(d => d.id === reactivateTarget.id)?.ref;
            if (!docRef) throw new Error("Student document not found");

            await updateDoc(docRef, { status: "ACTIVE", disabledAt: null });
            setStudents(prev => prev.map(s =>
                s.id === reactivateTarget.id ? { ...s, status: "ACTIVE" } : s
            ));
            toast.success(`${getDisplayName(reactivateTarget)} re-activated!`);
            setReactivateTarget(null);
        } catch (err: any) {
            toast.error(err.message || "Failed to re-activate");
        } finally { setIsReactivating(false); }
    };

    // ─── Export ───
    const exportToExcel = (list: Student[]) => {
        if (list.length === 0) return;
        const rows = list.map((s, i) => ({
            "S.N": s.serialNumber || (i + 1),
            "STAT": s.status || "ACTIVE",
            "SESS": s.session || "",
            "ENR": s.admissionNumber || "",
            "Name": getDisplayName(s),
            "D.O.B": s.dob || "",
            "Gender": s.gender || "",
            "Class": getClass(s),
            "Section": s.section || "",
            "Contact": s.mobileNo || "",
            "Contact 2": s.contact2 || "",
            "Contact 3": s.contact3 || "",
            "Aadhaar": s.aadharNo || "",
            "APAR ID": s.aparId || "",
            "PEN": s.pen || "",
            "Category": s.category || "",
            "Religion": s.religion || "",
            "Blood Group": s.bloodGroup || "",
            "Father Name": s.fatherName || "",
            "Father Occ.": s.fatherOccupation || "",
            "F. Qual.": s.fatherQualification || "",
            "Mother Name": s.motherName || "",
            "M. Qual.": s.motherQualification || "",
            "Guardian": s.guardianName || "",
            "Relation": s.guardianRelation || "",
            "G. Qual.": s.guardianQualification || "",
            "Income": s.annualIncome || "",
            "Address": s.address || "",
            "Pin": s.pinCode || "",
            "House": s.house || "",
            "Transport": s.transport || "",
            "UDISE": s.udise || "",
            "CBSE": s.cbseEnrolmentNo || "",
            "Free Scheme": s.freeScheme || "",
            "EWS": s.economicallyWeakSection || "",
            "Minority": s.minorityStatus || "",
            "Class at Adm.": s.classAtAdmission || "",
            "Date of Adm.": s.dateOfAdmission || "",
            "Branch": s.branch || "",
            "Block": s.block || "",
            "TC No.": s.tcNumber || "",
            "Prev. School": s.previousSchool || "",
            "Last Class": s.lastClass || "",
            "Last Date": s.lastDate || "",
            "Left Year": s.leftYear || "",
            "Remarks": s.remarks || "",
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        ws["!cols"] = Object.keys(rows[0]).map(() => ({ wch: 18 }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, activeTab === "active" ? "Active Students" : "Left Students");
        const today = new Date().toISOString().slice(0, 10);
        const classTag = selectedClass !== "All" ? `_Class${selectedClass}` : "";
        XLSX.writeFile(wb, `students_${activeTab}${classTag}_${today}.xlsx`);
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
                        <p className="text-white/40 text-sm mt-1">
                            <span className="text-green-300 font-semibold">{activeStudents.length} active</span>
                            <span className="mx-2 text-white/30">·</span>
                            <span className="text-red-300 font-semibold">{leftStudents.length} left</span>
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <button
                            onClick={() => exportToExcel(filtered)}
                            disabled={filtered.length === 0}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/20 text-white text-sm font-semibold hover:bg-white/10 transition-colors disabled:opacity-40"
                        ><FileDown className="w-4 h-4" /> Export Excel ({filtered.length})</button>
                        <Link href="/admin/students/import" className="px-4 py-2.5 rounded-xl border border-white/20 text-white text-sm font-semibold hover:bg-white/10 transition-colors">
                            Bulk Import
                        </Link>
                        <Link href="/admissions" className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gold text-navy text-sm font-bold hover:bg-gold/90 transition-colors">
                            <Plus className="w-4 h-4" /> Add Student
                        </Link>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
                {[
                    { key: "active", label: `Active Students (${activeStudents.length})` },
                    { key: "left", label: `Left Students (${leftStudents.length})` },
                ].map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => { setActiveTab(tab.key as any); setSelectedClass("All"); setSearchTerm(""); }}
                        className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === tab.key ? "bg-white shadow-sm text-navy" : "text-gray-500 hover:text-gray-700"}`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 items-center bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input type="search" placeholder="Search by name or admission number..." className="pl-10 border-gray-200 focus:border-navy focus:ring-navy/10 rounded-xl" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Filter className="w-4 h-4 text-gray-400" />
                    <select className="px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:border-navy" value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
                        {classes.map(c => <option key={c} value={c}>{c === "All" ? "All Classes" : `Class ${c}`}</option>)}
                    </select>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="w-full overflow-x-auto">
                    <table className="w-full text-sm whitespace-nowrap">
                        <thead className="bg-gray-50 border-b border-gray-100">
                            <tr>
                                {activeTab === "active"
                                    ? ["S.N", "Student", "ENR", "Class & Sec", "Father's Name", "Mobile", "Actions"].map(h => (
                                        <th key={h} className={`h-12 px-4 text-left align-middle font-semibold text-navy text-xs uppercase tracking-wide ${h === "Actions" ? "text-right" : ""}`}>{h}</th>
                                    ))
                                    : ["S.N", "Student", "ENR", "Last Class", "Left Year", "Last Date", "Branch", "Remarks", "Actions"].map(h => (
                                        <th key={h} className={`h-12 px-4 text-left align-middle font-semibold text-navy text-xs uppercase tracking-wide ${h === "Actions" ? "text-right" : ""}`}>{h}</th>
                                    ))
                                }
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {isLoading ? (
                                <tr><td colSpan={9} className="p-16 text-center text-gray-400">
                                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-navy" />Loading...
                                </td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={9} className="p-16 text-center">
                                    <UserCircle2 className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                                    <p className="text-gray-400 text-sm font-medium">No students found</p>
                                </td></tr>
                            ) : filtered.map((student, idx) => (
                                <tr key={student.id} className="hover:bg-gray-50/60 transition-colors">
                                    <td className="px-4 py-3 text-gray-400 text-xs font-mono">
                                        {student.serialNumber || idx + 1}
                                    </td>
                                    <td className="px-4 py-4 align-middle">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg overflow-hidden bg-navy/10 flex items-center justify-center shrink-0">
                                                {student.childPhotoUrl
                                                    ? <img src={student.childPhotoUrl} alt={getDisplayName(student)} className="w-full h-full object-cover" />
                                                    : <span className="font-bold text-navy text-sm">{(getDisplayName(student) || "S").charAt(0)}</span>
                                                }
                                            </div>
                                            <span className="font-semibold text-navy">{getDisplayName(student)}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 text-xs font-bold border border-blue-100 font-mono">{student.admissionNumber || "—"}</span>
                                    </td>
                                    {activeTab === "active" ? (
                                        <>
                                            <td className="px-4 py-3 text-gray-600">{getClass(student)} <span className="text-gray-400">·</span> {student.section || "—"}</td>
                                            <td className="px-4 py-3 text-gray-600">{student.fatherName || "—"}</td>
                                            <td className="px-4 py-3 text-gray-600">{student.mobileNo || "—"}</td>
                                        </>
                                    ) : (
                                        <>
                                            <td className="px-4 py-3 text-gray-600">{student.lastClass || getClass(student) || "—"}</td>
                                            <td className="px-4 py-3 text-gray-600">{student.leftYear || "—"}</td>
                                            <td className="px-4 py-3 text-gray-600 text-xs">{student.lastDate || "—"}</td>
                                            <td className="px-4 py-3 text-gray-600 text-xs">{student.branch || "—"}</td>
                                            <td className="px-4 py-3 text-gray-500 text-xs max-w-[150px] truncate">{student.remarks || "—"}</td>
                                        </>
                                    )}
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button onClick={() => setEditingStudent(student)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-navy bg-navy/5 hover:bg-navy/10 border border-navy/10 transition-colors">
                                                <Pencil className="w-3.5 h-3.5" /> Edit
                                            </button>
                                            {activeTab === "active" ? (
                                                <button onClick={() => setDisableTarget(student)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-amber-600 bg-amber-50 hover:bg-amber-100 border border-amber-100 transition-colors">
                                                    <PowerOff className="w-3.5 h-3.5" /> Disable
                                                </button>
                                            ) : (
                                                <button onClick={() => setReactivateTarget(student)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-green-600 bg-green-50 hover:bg-green-100 border border-green-100 transition-colors">
                                                    <RotateCcw className="w-3.5 h-3.5" /> Re-activate
                                                </button>
                                            )}
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

            {/* Disable Confirmation Modal */}
            {disableTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
                        <div className="flex flex-col items-center text-center gap-3 pt-2">
                            <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center">
                                <PowerOff className="w-7 h-7 text-amber-600" />
                            </div>
                            <h2 className="text-xl font-bold text-gray-900">Disable Student?</h2>
                            <p className="text-sm text-gray-500 leading-relaxed">
                                <span className="font-semibold text-gray-800">{getDisplayName(disableTarget)}</span> (ENR: <span className="font-mono font-bold text-navy">{disableTarget.admissionNumber}</span>) will be marked as <span className="text-amber-600 font-semibold">LEFT</span> and moved to the Left Students panel.
                                <br /><span className="text-gray-400 text-xs">No data will be deleted. You can re-activate anytime.</span>
                            </p>
                        </div>
                        <div className="flex gap-3 pt-1">
                            <button onClick={() => setDisableTarget(null)} disabled={isDisabling} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50 transition-colors">
                                Cancel
                            </button>
                            <button onClick={handleDisable} disabled={isDisabling} className="flex-1 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                                {isDisabling ? <><Loader2 className="w-4 h-4 animate-spin" /> Disabling...</> : <><PowerOff className="w-4 h-4" /> Yes, Disable</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Re-activate Confirmation Modal */}
            {reactivateTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
                        <div className="flex flex-col items-center text-center gap-3 pt-2">
                            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
                                <RotateCcw className="w-7 h-7 text-green-600" />
                            </div>
                            <h2 className="text-xl font-bold text-gray-900">Re-activate Student?</h2>
                            <p className="text-sm text-gray-500">
                                <span className="font-semibold text-gray-800">{getDisplayName(reactivateTarget)}</span> will be moved back to Active Students.
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setReactivateTarget(null)} disabled={isReactivating} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50">
                                Cancel
                            </button>
                            <button onClick={handleReactivate} disabled={isReactivating} className="flex-1 px-4 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                                {isReactivating ? <><Loader2 className="w-4 h-4 animate-spin" /> Activating...</> : <><RotateCcw className="w-4 h-4" /> Yes, Re-activate</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
