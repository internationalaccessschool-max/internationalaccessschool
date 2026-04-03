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
import { CloudinaryUpload } from "@/components/ui/cloudinary-upload";

interface Student {
    id: string;
    firstName?: string;
    middleName?: string;
    lastName?: string;
    admissionNumber: string;
    serialNumber?: string;
    currentClass?: string | number;  // Stored as number in Firestore for class 0
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

// Helper: Safe string render
const safeStr = (val: any): string => {
    if (val == null) return "";           // null or undefined → empty string
    if (typeof val === 'string') return val;
    if (typeof val === 'number') return String(val);  // 0 → "0", not ""
    if (typeof val === 'object') {
        return val.name || val.label || val.id || JSON.stringify(val);
    }
    return String(val);
};

// Helper: get full display name
const getDisplayName = (s: Student) => {
    const n = `${safeStr(s.firstName)} ${safeStr(s.lastName)}`.trim();
    return n || "Unknown Student";
};

// Helper: get class display (handles numeric 0 and string "0")
const getClass = (s: Student): string => {
    const cls = s.currentClass;
    if (cls === 0 || cls === "0") return "0";   // explicit check for class 0
    return safeStr(cls) || "—";
};

export default function AdminStudentsPage() {
    const [isLoading, setIsLoading] = useState(true);
    const [students, setStudents] = useState<Student[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedClass, setSelectedClass] = useState("All");
    const [selectedSection, setSelectedSection] = useState("All");
    const [editingStudent, setEditingStudent] = useState<Student | null>(null);
    const [activeTab, setActiveTab] = useState<"active" | "left">("active");

    // Disable dialog state
    const [disableTarget, setDisableTarget] = useState<Student | null>(null);
    const [isDisabling, setIsDisabling] = useState(false);
    const [disableForm, setDisableForm] = useState({ lastClass: "", leftYear: "", lastDate: "", branch: "", remarks: "", tcUrl: "" });

    // When opening disable modal, auto-fill from student record
    const openDisableModal = (student: Student) => {
        const today = new Date().toISOString().slice(0, 10);
        setDisableForm({
            lastClass: safeStr(student.currentClass) || "",
            leftYear: new Date().getFullYear().toString(),
            lastDate: today,
            branch: safeStr(student.branch) || "",
            remarks: "",
            tcUrl: "",
        });
        setDisableTarget(student);
    };

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

    const STANDARD_CLASSES = ["Preschool", "Nursery", "LKG", "UKG", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

    const dbClasses = Array.from(new Set(
        (activeTab === "active" ? activeStudents : leftStudents)
            .map(s => getClass(s)).filter(c => c != null && c !== "" && c !== "—")
    ));

    const allClassesList = Array.from(new Set([...STANDARD_CLASSES, ...dbClasses]));

    const classes = ["All", ...allClassesList.sort((a, b) => {
        const indexA = STANDARD_CLASSES.indexOf(a);
        const indexB = STANDARD_CLASSES.indexOf(b);
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return a.localeCompare(b, undefined, { numeric: true });
    })];

    const sections = ["All", ...Array.from(new Set(
        (activeTab === "active" ? activeStudents : leftStudents)
            .filter(s => selectedClass === "All" || getClass(s) === selectedClass)
            .map(s => (s.section || "").trim())
            .filter(Boolean)
    )).sort()];

    const filterList = (list: Student[]) =>
        list.filter(s => {
            const name = getDisplayName(s).toLowerCase();
            const matchSearch = name.includes(searchTerm.toLowerCase()) ||
                (s.admissionNumber || "").toLowerCase().includes(searchTerm.toLowerCase());
            const matchClass = selectedClass === "All" || getClass(s) === selectedClass;
            const matchSection = selectedSection === "All" || (s.section || "").trim() === selectedSection;
            return matchSearch && matchClass && matchSection;
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

            const updatePayload: Record<string, any> = {
                status: "LEFT",
                disabledAt: new Date().toISOString(),
            };
            if (disableForm.lastClass) updatePayload.lastClass = disableForm.lastClass;
            if (disableForm.leftYear) updatePayload.leftYear = disableForm.leftYear;
            if (disableForm.lastDate) updatePayload.lastDate = disableForm.lastDate;
            if (disableForm.branch) updatePayload.branch = disableForm.branch;
            if (disableForm.remarks) updatePayload.remarks = disableForm.remarks;
            if (disableForm.tcUrl) updatePayload.tcUrl = disableForm.tcUrl;

            await updateDoc(docRef, updatePayload);

            setStudents(prev => prev.map(s =>
                s.id === disableTarget.id ? { ...s, status: "LEFT", ...updatePayload } : s
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
            "D. O. A": s.dateOfAdmission || "",
            "NAME": getDisplayName(s),
            "CONTACT": s.mobileNo || "",
            "CONTACT 2": s.contact2 || "",
            "EMAIL": s.email || "",
            "NOTIFICATION EMAIL": s.notificationEmail || "",
            "AADHAR": s.aadharNo || "",
            "APAAR ID": s.aparId || "",
            "P.E.N": s.pen || "",
            "FREE": s.freeScheme || "",
            "CAT": s.category || "",
            "REL": s.religion || "",
            "GEN": s.gender || "",
            "CL ADM": s.classAtAdmission || "",
            "CURRENT CLASS": s.currentClass || getClass(s) || "",
            "SEC": s.section || "",
            "HOUS": s.house || "",
            "UDISE": s.udise || "",
            "E-S": s.economicallyWeakSection || "",
            "CBSE": s.cbseEnrolmentNo || "",
            "D.O.B": s.dob || "",
            "TRP": s.transport || "",
            "Address": s.address || "",
            "PIN": s.pinCode || "",
            "Mother Name": s.motherName || "",
            "M QUAL": s.motherQualification || "",
            "Father Name": s.fatherName || "",
            "F QUAL": s.fatherQualification || "",
            "INC": s.annualIncome || "",
            "F OCC": s.fatherOccupation || "",
            "GUARDIAN'S NAME": s.guardianName || "",
            "RELATION": s.guardianRelation || "",
            "QUALIFICATION": s.guardianQualification || "",
            "BL GP": s.bloodGroup || "",
            "REM": s.remarks || "",
            "L.SCH. NAME": s.previousSchool || "",
            "ADDRESS": s.previousSchoolAddress || "",
            "BLOCK": s.block || "",
            "T.C": s.tcNumber || "",
            "M.S": s.minorityStatus || "",
            "L-CLS": s.lastClass || "",
            "L. DATE": s.lastDate || "",
            "LEFT": s.leftYear || "",
            "BR": s.branch || "",
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
            <div className="flex gap-1.5 p-1 rounded-2xl w-fit bg-slate-100/80 border border-slate-200/60 shadow-sm">
                {[
                    { key: "active", label: `Active Students (${activeStudents.length})` },
                    { key: "left", label: `Left Students (${leftStudents.length})` },
                ].map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => { setActiveTab(tab.key as any); setSelectedClass("All"); setSelectedSection("All"); setSearchTerm(""); }}
                        className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 outline-none ${activeTab === tab.key ? "bg-white shadow-[0_2px_10px_rgb(0,0,0,0.06)] text-navy ring-1 ring-slate-200/50" : "text-slate-500 hover:text-slate-800 hover:bg-slate-200/50"}`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 items-center bg-white p-4 rounded-3xl border border-slate-200/60 shadow-[0_2px_10px_rgb(0,0,0,0.02)]">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-slate-400" />
                    <Input type="search" placeholder="Search by name or admission number..." className="pl-11 py-5 border-slate-200/60 focus:border-black focus:ring-4 focus:ring-black/5 rounded-2xl bg-slate-50/50 hover:bg-white text-[15px] placeholder:text-slate-400 transition-all font-medium" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                    <Filter className="w-5 h-5 text-slate-400 hidden sm:block ml-2" />
                    <select className="px-4 py-3 rounded-2xl border border-slate-200/60 bg-slate-50/50 hover:bg-white text-[14px] font-semibold text-slate-700 focus:outline-none focus:border-black focus:ring-4 focus:ring-black/5 transition-all outline-none" value={selectedClass} onChange={e => { setSelectedClass(e.target.value); setSelectedSection("All"); }}>
                        {classes.map(c => <option key={c} value={c}>{c === "All" ? "All Classes" : `Class ${c}`}</option>)}
                    </select>
                    <select className="px-4 py-3 rounded-2xl border border-slate-200/60 bg-slate-50/50 hover:bg-white text-[14px] font-semibold text-slate-700 focus:outline-none focus:border-black focus:ring-4 focus:ring-black/5 transition-all outline-none" value={selectedSection} onChange={e => setSelectedSection(e.target.value)}>
                        {sections.map(s => <option key={s} value={s as string}>{s === "All" ? "All Sections" : `Section ${s}`}</option>)}
                    </select>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-3xl border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden flex flex-col">
                <div className="w-full overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                    <table className="w-full text-sm whitespace-nowrap">
                        <thead className="bg-slate-50/80 border-b border-slate-200/60">
                            <tr>
                                {activeTab === "active"
                                    ? ["S.N", "Student", "ENR", "Class & Sec", "Father's Name", "Mobile", "Actions"].map(h => (
                                        <th key={h} className={`h-14 px-5 text-left align-middle text-[11px] font-bold text-slate-500 uppercase tracking-wider ${h === "Actions" ? "text-right" : ""}`}>{h}</th>
                                    ))
                                    : ["S.N", "Student", "ENR", "Last Class", "Left Year", "Last Date", "Branch", "Remarks", "Actions"].map(h => (
                                        <th key={h} className={`h-14 px-5 text-left align-middle text-[11px] font-bold text-slate-500 uppercase tracking-wider ${h === "Actions" ? "text-right" : ""}`}>{h}</th>
                                    ))
                                }
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {isLoading ? (
                                <tr><td colSpan={9} className="p-20 text-center text-slate-400">
                                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-navy" />
                                    <p className="font-semibold text-sm tracking-wide">Loading Directory...</p>
                                </td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={9} className="p-20 text-center">
                                    <UserCircle2 className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                                    <p className="text-slate-500 text-sm font-bold tracking-wide">No students found</p>
                                </td></tr>
                            ) : filtered.map((student, idx) => (
                                <tr key={student.id} className="hover:bg-slate-50 transition-colors group">
                                    <td className="px-5 py-4 text-slate-400 text-xs font-mono font-bold">
                                        {student.serialNumber || idx + 1}
                                    </td>
                                    <td className="px-5 py-4 align-middle">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-xl overflow-hidden bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200">
                                                {student.childPhotoUrl
                                                    ? <img src={student.childPhotoUrl} alt={getDisplayName(student)} className="w-full h-full object-cover" />
                                                    : <span className="font-bold text-slate-400 text-sm">{(getDisplayName(student) || "S").charAt(0)}</span>
                                                }
                                            </div>
                                            <span className="font-bold text-slate-800 tracking-wide text-[15px]">{getDisplayName(student)}</span>
                                        </div>
                                    </td>
                                    <td className="px-5 py-4">
                                        <span className="px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold border border-slate-200 font-mono tracking-widest">{safeStr(student.admissionNumber) || "—"}</span>
                                    </td>
                                    {activeTab === "active" ? (
                                        <>
                                            <td className="px-5 py-4 text-slate-600 font-medium">{getClass(student)} <span className="text-slate-300 mx-1">·</span> {safeStr(student.section) || "—"}</td>
                                            <td className="px-5 py-4 text-slate-600">{safeStr(student.fatherName) || "—"}</td>
                                            <td className="px-5 py-4 text-slate-600 font-mono text-xs">{safeStr(student.mobileNo) || "—"}</td>
                                        </>
                                    ) : (
                                        <>
                                            <td className="px-5 py-4 text-slate-600 font-medium">{safeStr(student.lastClass) || getClass(student) || "—"}</td>
                                            <td className="px-5 py-4 text-slate-600 font-medium">{safeStr(student.leftYear) || "—"}</td>
                                            <td className="px-5 py-4 text-slate-500 font-mono text-xs">{safeStr(student.lastDate) || "—"}</td>
                                            <td className="px-5 py-4 text-slate-600 font-medium text-xs">{safeStr(student.branch) || "—"}</td>
                                            <td className="px-5 py-4 text-slate-400 text-xs max-w-[150px] truncate">{safeStr(student.remarks) || "—"}</td>
                                        </>
                                    )}
                                    <td className="px-5 py-4 text-right">
                                        <div className="flex items-center justify-end gap-2.5 transition-opacity">
                                            <button onClick={() => setEditingStudent(student)} className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 ring-1 ring-slate-200 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-slate-300">
                                                <Pencil className="w-3.5 h-3.5" strokeWidth={2.5} /> Edit
                                            </button>
                                            {activeTab === "active" ? (
                                                <button onClick={() => openDisableModal(student)} className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold text-red-600 bg-white hover:bg-red-50 ring-1 ring-slate-200 hover:ring-red-200 shadow-sm transition-all focus:outline-none">
                                                    <PowerOff className="w-3.5 h-3.5" strokeWidth={2.5} /> Disable
                                                </button>
                                            ) : (
                                                <button onClick={() => setReactivateTarget(student)} className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold text-emerald-600 bg-white hover:bg-emerald-50 ring-1 ring-slate-200 hover:ring-emerald-200 shadow-sm transition-all focus:outline-none">
                                                    <RotateCcw className="w-3.5 h-3.5" strokeWidth={2.5} /> Re-activate
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
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-[2px]">
                    <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] w-full max-w-md p-7 space-y-5">
                        <div className="flex flex-col items-center text-center gap-3 pt-2">
                            <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center border border-red-100">
                                <PowerOff className="w-7 h-7 text-red-500" strokeWidth={2.5} />
                            </div>
                            <h2 className="text-xl font-bold text-slate-900 mt-2">Disable Student?</h2>
                            <p className="text-sm text-slate-500 leading-relaxed font-medium">
                                <span className="font-bold text-slate-800">{getDisplayName(disableTarget)}</span> (ENR: <span className="font-mono font-bold text-slate-800">{disableTarget.admissionNumber}</span>) will be moved to Left Students.
                                <span className="text-slate-400 text-xs mt-1 block">Fill in details below (auto-filled from student record).</span>
                            </p>
                        </div>

                        {/* Auto-filled form fields */}
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-semibold text-slate-500 block mb-1">Last Class</label>
                                    <input value={disableForm.lastClass} onChange={e => setDisableForm(p => ({ ...p, lastClass: e.target.value }))}
                                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-red-300" placeholder="e.g. 5" />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-slate-500 block mb-1">Left Year</label>
                                    <input value={disableForm.leftYear} onChange={e => setDisableForm(p => ({ ...p, leftYear: e.target.value }))}
                                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-red-300" placeholder="e.g. 2025" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-semibold text-slate-500 block mb-1">Last Date</label>
                                    <input type="date" value={disableForm.lastDate} onChange={e => setDisableForm(p => ({ ...p, lastDate: e.target.value }))}
                                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-red-300" />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-slate-500 block mb-1">Branch</label>
                                    <input value={disableForm.branch} onChange={e => setDisableForm(p => ({ ...p, branch: e.target.value }))}
                                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-red-300" placeholder="e.g. ATR" />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500 block mb-1">Remarks (optional)</label>
                                <input value={disableForm.remarks} onChange={e => setDisableForm(p => ({ ...p, remarks: e.target.value }))}
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-red-300" placeholder="Reason for leaving..." />
                            </div>
                            {/* TC Upload */}
                            <div>
                                <label className="text-xs font-semibold text-slate-500 block mb-1">Transfer Certificate (TC) — Optional</label>
                                {disableForm.tcUrl ? (
                                    <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm">
                                        <span className="text-emerald-700 font-semibold">✓ TC Uploaded</span>
                                        <div className="flex gap-2">
                                            <a href={disableForm.tcUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline">View</a>
                                            <button onClick={() => setDisableForm(p => ({ ...p, tcUrl: "" }))} className="text-xs text-red-500 hover:underline">Remove</button>
                                        </div>
                                    </div>
                                ) : (
                                    <CloudinaryUpload
                                        folder="student-tcs"
                                        subFolder={disableTarget?.admissionNumber || "unknown"}
                                        acceptedFileTypes="all"
                                        label="Upload TC (PDF or Image)"
                                        onUpload={(url) => setDisableForm(p => ({ ...p, tcUrl: url }))}
                                    />
                                )}
                            </div>
                        </div>

                        <div className="flex gap-3 pt-1">
                            <button onClick={() => setDisableTarget(null)} disabled={isDisabling} className="flex-1 px-4 py-3 rounded-2xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-colors outline-none focus:ring-2 focus:ring-slate-200">
                                Cancel
                            </button>
                            <button onClick={handleDisable} disabled={isDisabling} className="flex-1 px-4 py-3 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-bold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2 outline-none focus:ring-2 focus:ring-red-500/50 shadow-sm border border-red-500">
                                {isDisabling ? <><Loader2 className="w-4 h-4 animate-spin" /> Disabling...</> : <><PowerOff className="w-4 h-4" strokeWidth={2.5} /> Yes, Disable</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Re-activate Confirmation Modal */}
            {reactivateTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-[2px]">
                    <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] w-full max-w-md p-7 space-y-6">
                        <div className="flex flex-col items-center text-center gap-3 pt-2">
                            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center border border-emerald-100">
                                <RotateCcw className="w-7 h-7 text-emerald-500" strokeWidth={2.5} />
                            </div>
                            <h2 className="text-xl font-bold text-slate-900 mt-2">Re-activate Student?</h2>
                            <p className="text-sm text-slate-500 font-medium">
                                <span className="font-bold text-slate-800">{getDisplayName(reactivateTarget)}</span> will be safely restored back to the Active Students directory.
                            </p>
                        </div>
                        <div className="flex gap-3 pt-2">
                            <button onClick={() => setReactivateTarget(null)} disabled={isReactivating} className="flex-1 px-4 py-3 rounded-2xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 outline-none focus:ring-2 focus:ring-slate-200">
                                Cancel
                            </button>
                            <button onClick={handleReactivate} disabled={isReactivating} className="flex-1 px-4 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2 outline-none focus:ring-2 focus:ring-emerald-500/50 shadow-sm border border-emerald-500">
                                {isReactivating ? <><Loader2 className="w-4 h-4 animate-spin" /> Activating...</> : <><RotateCcw className="w-4 h-4" strokeWidth={2.5} /> Yes, Re-activate</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
