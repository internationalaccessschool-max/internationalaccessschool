"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import {
    Plus, Search, Filter, Loader2, Pencil, UserCircle2,
    AlertTriangle, FileDown, PowerOff, RotateCcw, Wallet, Eye, ArrowLeftRight, Trash2,
    ChevronUp, ChevronDown, ChevronsUpDown
} from "lucide-react";
import {
    collectionGroup, getDocs, doc, updateDoc, deleteDoc, getDoc
} from "firebase/firestore";
import { authFetch } from "@/lib/auth-fetch";
import { db } from "@/lib/firebase";
import Link from "next/link";
import { StudentEditModal } from "@/components/student/StudentEditModal";
import { StudentFeeModal } from "@/components/student/StudentFeeModal";
import { StudentProfileModal } from "@/components/student/StudentProfileModal";
import { ChangeClassModal } from "@/components/student/ChangeClassModal";
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
    const raw = safeStr(cls).trim();
    if (!raw) return "—";
    // Normalize LKG / UKG regardless of casing stored in Firestore
    const upper = raw.toUpperCase();
    if (upper === "LKG" || upper === "UKG") return upper;
    return raw;
};

export default function AdminStudentsPage() {
    const [isLoading, setIsLoading] = useState(true);
    const [students, setStudents] = useState<Student[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedClass, setSelectedClass] = useState("All");
    const [selectedSection, setSelectedSection] = useState("All");
    const [editingStudent, setEditingStudent] = useState<Student | null>(null);
    const [viewFeeStudent, setViewFeeStudent] = useState<Student | null>(null);
    const [viewProfileStudent, setViewProfileStudent] = useState<Student | null>(null);
    const [changeClassStudent, setChangeClassStudent] = useState<Student | null>(null);
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

    // Permanent delete dialog state (left students only)
    const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Sort state
    const [sortKey, setSortKey] = useState<string | null>(null);
    const [sortAsc, setSortAsc] = useState(true);

    const handleSort = (key: string) => {
        if (sortKey === key) setSortAsc(prev => !prev);
        else { setSortKey(key); setSortAsc(true); }
    };

    useEffect(() => {
        const fetchStudents = async () => {
            setIsLoading(true);
            try {
                const snap = await getDocs(collectionGroup(db, "profiles"));
                let data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Student));
                // Deduplicate
                const seen = new Set<string>();
                data = data.filter(s => { if (seen.has(s.id)) return false; seen.add(s.id); return true; });
                data.sort((a, b) => parseInt(a.admissionNumber || "0") - parseInt(b.admissionNumber || "0"));
                setStudents(data);
            } catch (err) { console.error(err); toast.error("Failed to load students."); }
            finally { setIsLoading(false); }
        };
        fetchStudents();
    }, []);

    // Split into active / left
    const activeStudents = students.filter(s => (s.status || "").toUpperCase() !== "LEFT");
    const leftStudents = students.filter(s => (s.status || "").toUpperCase() === "LEFT");

    const classes = ["All", ...Array.from(new Set(
        (activeTab === "active" ? activeStudents : leftStudents)
            .map(s => getClass(s)).filter(c => c != null && c !== "" && c !== "—")
    )).sort((a, b) => {
        // LKG and UKG always go first
        const order: Record<string, number> = { LKG: -2, UKG: -1 };
        const aKey = a.toUpperCase();
        const bKey = b.toUpperCase();
        if (order[aKey] !== undefined && order[bKey] !== undefined) return order[aKey] - order[bKey];
        if (order[aKey] !== undefined) return -1;
        if (order[bKey] !== undefined) return 1;
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

    const filtered = (() => {
        const list = filterList(activeTab === "active" ? activeStudents : leftStudents);
        if (!sortKey) return list;
        return [...list].sort((a, b) => {
            let av = "", bv = "";
            if (sortKey === "sn")       { av = String(a.serialNumber || ""); bv = String(b.serialNumber || ""); }
            else if (sortKey === "name"){ av = getDisplayName(a); bv = getDisplayName(b); }
            else if (sortKey === "enr") { av = a.admissionNumber || ""; bv = b.admissionNumber || ""; }
            else if (sortKey === "class"){ av = `${getClass(a)}${a.section||""}`; bv = `${getClass(b)}${b.section||""}`; }
            else if (sortKey === "father"){ av = a.fatherName || ""; bv = b.fatherName || ""; }
            else if (sortKey === "mobile"){ av = a.mobileNo || ""; bv = b.mobileNo || ""; }
            else if (sortKey === "lastClass"){ av = String(a.lastClass||a.currentClass||""); bv = String(b.lastClass||b.currentClass||""); }
            else if (sortKey === "leftYear"){ av = String(a.leftYear||""); bv = String(b.leftYear||""); }
            else if (sortKey === "lastDate"){ av = a.lastDate||""; bv = b.lastDate||""; }
            const cmp = av.localeCompare(bv, undefined, { numeric: true });
            return sortAsc ? cmp : -cmp;
        });
    })();

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

    // ─── Permanent Delete (left students only) ───
    const handlePermanentDelete = async () => {
        if (!deleteTarget) return;
        setIsDeleting(true);
        try {
            // 1. Delete Firebase Auth account
            const authRes = await authFetch("/api/admin/delete-user", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ uid: deleteTarget.id }),
            });
            if (!authRes.ok) {
                const err = await authRes.json();
                throw new Error(err.error || "Failed to delete auth account");
            }

            // 2. Delete profile doc (find via collectionGroup)
            const snap = await getDocs(collectionGroup(db, "profiles"));
            const profileDoc = snap.docs.find(d => d.id === deleteTarget.id);
            if (profileDoc) await deleteDoc(profileDoc.ref);

            // 3. Delete studentLookup doc
            await deleteDoc(doc(db, "studentLookup", deleteTarget.id)).catch(() => {});

            // 4. Delete users/{uid} doc
            await deleteDoc(doc(db, "users", deleteTarget.id)).catch(() => {});

            setStudents(prev => prev.filter(s => s.id !== deleteTarget.id));
            toast.success(`${getDisplayName(deleteTarget)} permanently deleted.`);
            setDeleteTarget(null);
        } catch (err: any) {
            toast.error(err.message || "Failed to delete student");
        } finally { setIsDeleting(false); }
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
            <div className="rounded-2xl md:rounded-3xl gradient-navy p-5 md:p-8 relative overflow-hidden shadow-sm">
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.2) 0%, transparent 50%)` }} />
                <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <p className="text-white/50 text-xs md:text-sm font-medium">Admin Console</p>
                        <h1 className="text-2xl md:text-3xl font-bold text-white mt-0.5">Student Directory</h1>
                        <p className="text-white/40 text-xs md:text-sm mt-1.5 flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold text-xs border border-emerald-500/30">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                {activeStudents.length} Active
                            </span>
                            <span className="text-white/30">·</span>
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-semibold text-xs border border-rose-500/30">
                                {leftStudents.length} Left
                            </span>
                        </p>
                    </div>
                    <div className="grid grid-cols-2 sm:flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
                        <button
                            onClick={() => exportToExcel(filtered)}
                            disabled={filtered.length === 0}
                            className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-white/20 text-white text-xs sm:text-sm font-semibold hover:bg-white/10 transition-colors disabled:opacity-40"
                        >
                            <FileDown className="w-4 h-4 shrink-0" />
                            <span className="truncate">Export ({filtered.length})</span>
                        </button>
                        <Link
                            href="/admin/students/import"
                            className="flex items-center justify-center px-3.5 py-2.5 rounded-xl border border-white/20 text-white text-xs sm:text-sm font-semibold hover:bg-white/10 transition-colors text-center"
                        >
                            Bulk Import
                        </Link>
                        <Link
                            href="/admissions"
                            className="col-span-2 sm:col-span-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gold text-navy text-xs sm:text-sm font-bold hover:bg-gold/90 transition-colors shadow-sm"
                        >
                            <Plus className="w-4 h-4" /> Add Student
                        </Link>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="grid grid-cols-2 sm:flex gap-1.5 p-1 rounded-2xl w-full sm:w-fit bg-slate-100/80 border border-slate-200/60 shadow-sm">
                {[
                    { key: "active", label: `Active Students (${activeStudents.length})` },
                    { key: "left", label: `Left Students (${leftStudents.length})` },
                ].map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => { setActiveTab(tab.key as any); setSelectedClass("All"); setSelectedSection("All"); setSearchTerm(""); }}
                        className={`px-3 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all duration-300 outline-none text-center ${activeTab === tab.key ? "bg-white shadow-[0_2px_10px_rgb(0,0,0,0.06)] text-navy ring-1 ring-slate-200/50" : "text-slate-500 hover:text-slate-800 hover:bg-slate-200/50"}`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 items-stretch sm:items-center bg-white p-3.5 sm:p-4 rounded-2xl sm:rounded-3xl border border-slate-200/60 shadow-[0_2px_10px_rgb(0,0,0,0.02)]">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-3.5 sm:left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-slate-400" />
                    <Input
                        type="search"
                        placeholder="Search by name or admission number..."
                        className="pl-10 sm:pl-11 pr-4 py-2.5 sm:py-5 border-slate-200/60 focus:border-black focus:ring-4 focus:ring-black/5 rounded-xl sm:rounded-2xl bg-slate-50/50 hover:bg-white text-sm sm:text-[15px] placeholder:text-slate-400 transition-all font-medium h-11 sm:h-auto"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="grid grid-cols-2 sm:flex items-center gap-2 sm:gap-2.5 w-full sm:w-auto shrink-0">
                    <div className="hidden sm:flex items-center pl-1">
                        <Filter className="w-4 h-4 text-slate-400" />
                    </div>
                    <select
                        className="w-full sm:w-auto px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border border-slate-200/60 bg-slate-50/50 hover:bg-white text-xs sm:text-[14px] font-semibold text-slate-700 focus:outline-none focus:border-black focus:ring-4 focus:ring-black/5 transition-all cursor-pointer"
                        value={selectedClass}
                        onChange={e => { setSelectedClass(e.target.value); setSelectedSection("All"); }}
                    >
                        {classes.map(c => <option key={c} value={c}>{c === "All" ? "All Classes" : `Class ${c}`}</option>)}
                    </select>
                    <select
                        className="w-full sm:w-auto px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border border-slate-200/60 bg-slate-50/50 hover:bg-white text-xs sm:text-[14px] font-semibold text-slate-700 focus:outline-none focus:border-black focus:ring-4 focus:ring-black/5 transition-all cursor-pointer"
                        value={selectedSection}
                        onChange={e => setSelectedSection(e.target.value)}
                    >
                        {sections.map(s => <option key={s} value={s as string}>{s === "All" ? "All Sections" : `Sec ${s}`}</option>)}
                    </select>
                </div>
            </div>

            {/* Filter Result Info */}
            {(searchTerm || selectedClass !== "All" || selectedSection !== "All") && (
                <div className="flex items-center justify-between px-2 text-xs text-slate-500 font-medium">
                    <span>Showing <strong className="text-slate-800 font-bold">{filtered.length}</strong> matching students</span>
                    <button
                        onClick={() => { setSearchTerm(""); setSelectedClass("All"); setSelectedSection("All"); }}
                        className="text-blue-600 hover:underline font-semibold"
                    >
                        Clear filters
                    </button>
                </div>
            )}

            {/* ─── MOBILE CARD VIEW (< md) ─── */}
            <div className="block md:hidden space-y-3">
                {isLoading ? (
                    <div className="bg-white rounded-2xl border border-slate-200/60 p-12 text-center text-slate-400">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-navy" />
                        <p className="font-semibold text-sm tracking-wide">Loading Directory...</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-slate-200/60 p-12 text-center">
                        <UserCircle2 className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                        <p className="text-slate-500 text-sm font-bold tracking-wide">No students found</p>
                    </div>
                ) : (
                    filtered.map((student, idx) => (
                        <div
                            key={student.id}
                            className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_2px_8px_rgba(0,0,0,0.03)] p-4 space-y-3 hover:border-slate-300 transition-all"
                        >
                            {/* Header Row: Photo + Name + ENR / Roll + Class Pill */}
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-11 h-11 rounded-xl overflow-hidden bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200 shadow-sm">
                                        {student.childPhotoUrl ? (
                                            <img src={student.childPhotoUrl} alt={getDisplayName(student)} className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="font-bold text-slate-500 text-base">{(getDisplayName(student) || "S").charAt(0)}</span>
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="font-bold text-slate-900 text-base leading-snug truncate">
                                            {getDisplayName(student)}
                                        </h3>
                                        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] font-bold font-mono">
                                                #{student.serialNumber || idx + 1}
                                            </span>
                                            <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[11px] font-bold font-mono border border-blue-100/80">
                                                ENR: {safeStr(student.admissionNumber) || "—"}
                                            </span>
                                            {activeTab === "left" && (
                                                <span className="px-2 py-0.5 rounded-md bg-red-50 text-red-600 text-[10px] font-bold">
                                                    LEFT
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                {activeTab === "active" ? (
                                    <span className="px-2.5 py-1 rounded-xl bg-slate-900 text-white text-xs font-bold shrink-0 shadow-sm">
                                        {getClass(student)}{student.section ? ` · ${student.section}` : ""}
                                    </span>
                                ) : (
                                    <span className="px-2.5 py-1 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold shrink-0 border border-slate-200">
                                        Last: {safeStr(student.lastClass) || getClass(student) || "—"}
                                    </span>
                                )}
                            </div>

                            {/* Details Grid */}
                            <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50/80 rounded-xl p-3 border border-slate-100">
                                {activeTab === "active" ? (
                                    <>
                                        <div>
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Father's Name</span>
                                            <span className="font-semibold text-slate-700 truncate block mt-0.5">
                                                {safeStr(student.fatherName) || "—"}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Mobile No.</span>
                                            {student.mobileNo ? (
                                                <a href={`tel:${student.mobileNo}`} className="font-mono font-bold text-blue-600 hover:underline block mt-0.5">
                                                    {student.mobileNo}
                                                </a>
                                            ) : (
                                                <span className="font-medium text-slate-400 block mt-0.5">—</span>
                                            )}
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div>
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Left Year / Date</span>
                                            <span className="font-semibold text-slate-700 truncate block mt-0.5">
                                                {safeStr(student.leftYear) || "—"} {student.lastDate ? `· ${student.lastDate}` : ""}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Branch</span>
                                            <span className="font-semibold text-slate-700 truncate block mt-0.5">
                                                {safeStr(student.branch) || "—"}
                                            </span>
                                        </div>
                                        {student.remarks && (
                                            <div className="col-span-2 pt-1 border-t border-slate-200/60">
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Remarks</span>
                                                <span className="text-slate-600 text-xs block mt-0.5">
                                                    {student.remarks}
                                                </span>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            {/* Actions Grid */}
                            <div className="grid grid-cols-4 gap-1.5 pt-1">
                                <button
                                    onClick={() => setViewProfileStudent(student)}
                                    className="flex items-center justify-center gap-1 py-2 px-1.5 rounded-xl text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 ring-1 ring-emerald-200 active:scale-95 transition-all"
                                >
                                    <Eye className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} />
                                    <span>View</span>
                                </button>
                                <button
                                    onClick={() => setEditingStudent(student)}
                                    className="flex items-center justify-center gap-1 py-2 px-1.5 rounded-xl text-xs font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 ring-1 ring-slate-200 active:scale-95 transition-all"
                                >
                                    <Pencil className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} />
                                    <span>Edit</span>
                                </button>
                                {activeTab === "active" ? (
                                    <>
                                        <button
                                            onClick={() => setChangeClassStudent(student)}
                                            className="flex items-center justify-center gap-1 py-2 px-1.5 rounded-xl text-xs font-bold text-violet-700 bg-violet-50 hover:bg-violet-100 ring-1 ring-violet-200 active:scale-95 transition-all"
                                        >
                                            <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} />
                                            <span>Transfer</span>
                                        </button>
                                        <button
                                            onClick={() => openDisableModal(student)}
                                            className="flex items-center justify-center gap-1 py-2 px-1.5 rounded-xl text-xs font-bold text-red-600 bg-red-50/60 hover:bg-red-100 ring-1 ring-red-200 active:scale-95 transition-all"
                                        >
                                            <PowerOff className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} />
                                            <span>Disable</span>
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button
                                            onClick={() => setReactivateTarget(student)}
                                            className="flex items-center justify-center gap-1 py-2 px-1 rounded-xl text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 ring-1 ring-emerald-200 active:scale-95 transition-all"
                                        >
                                            <RotateCcw className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} />
                                            <span>Restore</span>
                                        </button>
                                        <button
                                            onClick={() => setDeleteTarget(student)}
                                            className="flex items-center justify-center gap-1 py-2 px-1 rounded-xl text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 ring-1 ring-red-200 active:scale-95 transition-all"
                                        >
                                            <Trash2 className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} />
                                            <span>Delete</span>
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* ─── DESKTOP & TABLET TABLE VIEW (>= md) ─── */}
            <div className="hidden md:flex bg-white rounded-3xl border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden flex-col">
                <div className="w-full overflow-auto max-h-[calc(100vh-280px)] min-h-[300px] pb-2 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent relative">
                    <table className="w-full text-sm whitespace-nowrap min-w-[880px]">
                        <thead className="bg-slate-50 border-b border-slate-200/60 sticky top-0 z-20 shadow-sm">
                            <tr>
                                {(activeTab === "active"
                                    ? [
                                        { label: "S.N", key: "sn" },
                                        { label: "Student", key: "name" },
                                        { label: "ENR", key: "enr" },
                                        { label: "Class & Sec", key: "class" },
                                        { label: "Father's Name", key: "father" },
                                        { label: "Mobile", key: "mobile" },
                                        { label: "Actions", key: null },
                                    ]
                                    : [
                                        { label: "S.N", key: "sn" },
                                        { label: "Student", key: "name" },
                                        { label: "ENR", key: "enr" },
                                        { label: "Last Class", key: "lastClass" },
                                        { label: "Left Year", key: "leftYear" },
                                        { label: "Last Date", key: "lastDate" },
                                        { label: "Branch", key: null },
                                        { label: "Remarks", key: null },
                                        { label: "Actions", key: null },
                                    ]
                                ).map(({ label, key }) => (
                                    <th
                                        key={label}
                                        onClick={() => key && handleSort(key)}
                                        className={`h-14 px-5 text-left align-middle text-[11px] font-bold text-slate-500 uppercase tracking-wider
                                            ${label === "Actions" ? "text-right sticky right-0 z-30 bg-slate-50 shadow-[-12px_0_15px_-4px_rgba(0,0,0,0.05)] border-l border-slate-100" : ""}
                                            ${key ? "cursor-pointer hover:text-slate-800 hover:bg-slate-100 select-none transition-colors" : ""}`}
                                    >
                                        <span className="inline-flex items-center gap-1">
                                            {label}
                                            {key && (
                                                sortKey === key
                                                    ? sortAsc
                                                        ? <ChevronUp className="w-3 h-3 text-navy" />
                                                        : <ChevronDown className="w-3 h-3 text-navy" />
                                                    : <ChevronsUpDown className="w-3 h-3 opacity-30" />
                                            )}
                                        </span>
                                    </th>
                                ))}
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
                                    <td className="px-5 py-4 text-right sticky right-0 bg-white shadow-[-12px_0_15px_-4px_rgba(0,0,0,0.02)] z-10 group-hover:bg-slate-50 transition-colors border-l border-slate-100">
                                        <div className="flex items-center justify-end gap-2.5 transition-opacity">
                                            <button onClick={() => setViewProfileStudent(student)} className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 ring-1 ring-emerald-200 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-emerald-300">
                                                <Eye className="w-3.5 h-3.5" strokeWidth={2.5} /> View
                                            </button>
                                            <button onClick={() => setEditingStudent(student)} className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 ring-1 ring-slate-200 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-slate-300">
                                                <Pencil className="w-3.5 h-3.5" strokeWidth={2.5} /> Edit
                                            </button>
                                            {activeTab === "active" && (
                                                <button onClick={() => setChangeClassStudent(student)} className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold text-violet-700 bg-violet-50 hover:bg-violet-100 ring-1 ring-violet-200 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-violet-300">
                                                    <ArrowLeftRight className="w-3.5 h-3.5" strokeWidth={2.5} /> Transfer
                                                </button>
                                            )}
                                            {activeTab === "active" ? (
                                                <button onClick={() => openDisableModal(student)} className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold text-red-600 bg-white hover:bg-red-50 ring-1 ring-slate-200 hover:ring-red-200 shadow-sm transition-all focus:outline-none">
                                                    <PowerOff className="w-3.5 h-3.5" strokeWidth={2.5} /> Disable
                                                </button>
                                            ) : (
                                                <>
                                                    <button onClick={() => setReactivateTarget(student)} className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold text-emerald-600 bg-white hover:bg-emerald-50 ring-1 ring-slate-200 hover:ring-emerald-200 shadow-sm transition-all focus:outline-none">
                                                        <RotateCcw className="w-3.5 h-3.5" strokeWidth={2.5} /> Re-activate
                                                    </button>
                                                    <button onClick={() => setDeleteTarget(student)} className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 ring-1 ring-red-200 shadow-sm transition-all focus:outline-none">
                                                        <Trash2 className="w-3.5 h-3.5" strokeWidth={2.5} /> Delete
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Student Profile Modal */}
            {viewProfileStudent && (
                <StudentProfileModal
                    student={viewProfileStudent}
                    onClose={() => setViewProfileStudent(null)}
                />
            )}

            {/* Fee Record Modal */}
            {viewFeeStudent && (
                <StudentFeeModal
                    student={viewFeeStudent}
                    onClose={() => setViewFeeStudent(null)}
                />
            )}

            {/* Edit Modal */}
            {editingStudent && (
                <StudentEditModal
                    student={editingStudent}
                    role="admin"
                    onClose={() => setEditingStudent(null)}
                    onSaved={updated => { handleSaved(updated); }}
                />
            )}

            {/* Change Class / Section / Roll No Modal */}
            {changeClassStudent && (
                <ChangeClassModal
                    student={changeClassStudent}
                    onClose={() => setChangeClassStudent(null)}
                    onSaved={updated => { handleSaved(updated); setChangeClassStudent(null); }}
                />
            )}

            {/* Disable Confirmation Modal */}
            {disableTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-[2px]">
                    <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] w-full max-w-md p-5 sm:p-7 space-y-5 max-h-[90vh] overflow-y-auto">
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
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] w-full max-w-md p-5 sm:p-7 space-y-6 max-h-[90vh] overflow-y-auto">
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

            {/* ─── Permanent Delete Modal ─── */}
            {deleteTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-[2px]">
                    <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] w-full max-w-md p-5 sm:p-7 space-y-6 max-h-[90vh] overflow-y-auto">
                        <div className="flex flex-col items-center text-center gap-3 pt-2">
                            <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center border border-red-100">
                                <Trash2 className="w-7 h-7 text-red-500" strokeWidth={2.5} />
                            </div>
                            <h2 className="text-xl font-bold text-slate-900 mt-2">Permanently Delete?</h2>
                            <p className="text-sm text-slate-500 font-medium leading-relaxed">
                                <span className="font-bold text-slate-800">{getDisplayName(deleteTarget)}</span> (ENR: <span className="font-mono font-bold text-slate-800">{deleteTarget.admissionNumber}</span>) ka <span className="text-red-600 font-bold">sara data aur login account hamesha ke liye delete</span> ho jaayega.
                            </p>
                            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700 font-medium w-full text-left">
                                ⚠️ Ye action undo nahi ho sakta. Fees, attendance, results — sab delete ho jaayega.
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setDeleteTarget(null)} disabled={isDeleting} className="flex-1 px-4 py-3 rounded-2xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 outline-none">
                                Cancel
                            </button>
                            <button onClick={handlePermanentDelete} disabled={isDeleting} className="flex-1 px-4 py-3 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2 outline-none shadow-sm">
                                {isDeleting ? <><Loader2 className="w-4 h-4 animate-spin" /> Deleting...</> : <><Trash2 className="w-4 h-4" strokeWidth={2.5} /> Yes, Delete Forever</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
