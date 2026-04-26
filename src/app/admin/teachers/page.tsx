"use client";

import toast from "react-hot-toast";
import { useState, useEffect } from "react";
import {
    Plus, Search, X, Loader2, User, Mail,
    Phone, GraduationCap, Pencil, Save, Trash2,
    CheckCircle2, Eye, EyeOff, BookOpen
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import {
    doc, setDoc, serverTimestamp, collection, addDoc,
    onSnapshot, query, orderBy, deleteDoc, updateDoc, getDocs
} from "firebase/firestore";
import { db, firebaseConfig } from "@/lib/firebase";
import Link from "next/link";
import { CloudinaryUpload } from "@/components/ui/cloudinary-upload";
import { FileViewerTrigger } from "@/components/ui/file-viewer";
import { authFetch } from "@/lib/auth-fetch";

// ── Constants ──────────────────────────────────────────────────────────────
const CLASSES = ["NUR", "LKG", "UKG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
const SECTIONS = ["A", "B", "C", "D", "E"];
const SUBJECTS = ["Mathematics", "Physics", "Chemistry", "Biology", "English",
    "Hindi", "History", "Geography", "Civics", "Computer Science",
    "Economics", "Accountancy", "Business Studies", "Physical Education", "Art", "Other"];
const STREAMS = ["General", "Science", "Commerce", "Arts", "Vocational"];
const SENIOR_CLASSES = ["11", "12"];

const teacherSchema = z.object({
    firstName: z.string().min(2, "First name required"),
    lastName: z.string().min(1, "Last name required"),
    email: z.string().email("Invalid email"),
    phone: z.string().min(10, "Valid phone required"),
    qualification: z.string().optional(),
    password: z.string().min(6, "Min 6 characters"),
});
type TeacherForm = z.infer<typeof teacherSchema>;

interface ClassSectionMap { [cls: string]: string[] } // e.g. { "6": ["A","B"] }
interface Assignment {
    classSections: ClassSectionMap;
    subjects: string[];
    streams: string[];
}

interface Teacher {
    id: string; uid?: string; firstName: string; lastName: string;
    email: string; phone: string; subjects?: string[]; qualification?: string;
    assignment?: Assignment; createdAt?: any; role?: string; photoUrl?: string;
}

const emptyAssignment = (): Assignment => ({ classSections: {}, subjects: [], streams: [] });

export default function AdminTeachersPage() {
    const [staffTab, setStaffTab] = useState<"teachers" | "nts">("teachers");
    const [teachers, setTeachers] = useState<Teacher[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [showForm, setShowForm] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [createdInfo, setCreatedInfo] = useState<{ name: string; email: string; password: string } | null>(null);
    const [showPass, setShowPass] = useState(false);
    const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);



    // Edit Teacher
    const EMPTY_EDIT = {
        // Basic + Personal (merged)
        firstName: "", lastName: "", phone: "", qualification: "", subjects: [] as string[],
        designation: "", joiningDate: "",
        dob: "", gender: "", bloodGroup: "", socialCategory: "",
        fatherName: "", permanentAddress: "", emergencyContact: "",
        // Salary
        basicSalary: "", hra: "", da: "", otherAllowances: "",
        // Bank
        bankName: "", branchName: "", cinNumber: "", bankAccountNumber: "", ifscCode: "",
        // Photo
        photoUrl: "", photoName: "",
        // Documents
        panNumber: "", aadhaarNumber: "",
        panCardUrl: "", panCardName: "",
        aadhaarUrl: "", aadhaarName: "",
        drivingLicenceUrl: "", drivingLicenceName: "",
        passportUrl: "", passportName: "",
        // PF & ESIC
        pfPct: "", esicPct: "",
        uanNumber: "", epfAccountNumber: "", pfJoiningDate: "", pfExitDate: "",
        esicIpNumber: "", esicJoiningDate: "", esicExitDate: "", esicDispensary: "",
        // Credentials
        newEmail: "", newPassword: "",
    };
    const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
    const [editTab, setEditTab] = useState<"basic" | "salary" | "bank" | "documents" | "pf" | "credentials">("basic");
    const [editData, setEditData] = useState(EMPTY_EDIT);
    const [savingEdit, setSavingEdit] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);

    // ── Non-Teaching Staff ─────────────────────────────────────────────────────
    const [ntsStaff, setNtsStaff] = useState<any[]>([]);
    const [ntsLoading, setNtsLoading] = useState(false);
    const [ntsSearch, setNtsSearch] = useState("");
    const [ntsModal, setNtsModal] = useState(false);
    const [ntsEditing, setNtsEditing] = useState<any | null>(null);
    const [ntsSaving, setNtsSaving] = useState(false);
    const [ntsCreatedInfo, setNtsCreatedInfo] = useState<{ name: string; email: string; password: string } | null>(null);
    const EMPTY_NTS = { name: "", designation: "", phone: "", email: "", password: "", basicSalary: "", hra: "0", da: "0", otherAllowances: "0", photoUrl: "", photoName: "" };
    const [ntsForm, setNtsForm] = useState(EMPTY_NTS);

    const openEdit = (teacher: Teacher) => {
        const d = teacher as any;
        setEditingTeacher(teacher);
        setEditTab("basic");
        setEditData({
            firstName: d.firstName || "",
            lastName: d.lastName || "",
            phone: d.phone || "",
            qualification: d.qualification || "",
            subjects: d.subjects || [],
            designation: d.designation || "",
            joiningDate: d.joiningDate || "",
            dob: d.dob || "",
            gender: d.gender || "",
            bloodGroup: d.bloodGroup || "",
            socialCategory: d.socialCategory || "",
            fatherName: d.fatherName || "",
            permanentAddress: d.permanentAddress || "",
            emergencyContact: d.emergencyContact || "",
            // Salary
            basicSalary: d.basicSalary || "",
            hra: d.hra || "",
            da: d.da || "",
            otherAllowances: d.otherAllowances || "",
            // Bank
            bankName: d.bankName || "",
            branchName: d.branchName || "",
            cinNumber: d.cinNumber || "",
            bankAccountNumber: d.bankAccountNumber || "",
            ifscCode: d.ifscCode || "",
            // Photo
            photoUrl: d.photoUrl || "",
            photoName: d.photoName || "",
            // Documents
            panNumber: d.panNumber || "",
            aadhaarNumber: d.aadhaarNumber || "",
            panCardUrl: d.panCardUrl || "",
            panCardName: d.panCardName || "",
            aadhaarUrl: d.aadhaarUrl || "",
            aadhaarName: d.aadhaarName || "",
            drivingLicenceUrl: d.drivingLicenceUrl || "",
            drivingLicenceName: d.drivingLicenceName || "",
            passportUrl: d.passportUrl || "",
            passportName: d.passportName || "",
            // PF & ESIC
            pfPct: d.pfPct != null ? String(d.pfPct) : "",
            esicPct: d.esicPct != null ? String(d.esicPct) : "",
            uanNumber: d.uanNumber || "",
            epfAccountNumber: d.epfAccountNumber || d.epfNumber || "",
            pfJoiningDate: d.pfJoiningDate || "",
            pfExitDate: d.pfExitDate || "",
            esicIpNumber: d.esicIpNumber || "",
            esicJoiningDate: d.esicJoiningDate || "",
            esicExitDate: d.esicExitDate || "",
            esicDispensary: d.esicDispensary || "",
            newEmail: "",
            newPassword: "",
        });
        setEditError(null);
    };

    const handleSaveEdit = async () => {
        if (!editingTeacher) return;
        if (!editData.firstName || !editData.lastName) { setEditError("Name is required."); return; }
        setSavingEdit(true);
        setEditError(null);
        try {
            // Update credentials first if provided
            const hasCredChange = editData.newEmail.trim() || editData.newPassword.trim();
            if (hasCredChange) {
                if (editData.newPassword && editData.newPassword.length < 6) {
                    setEditError("Password must be at least 6 characters."); setSavingEdit(false); return;
                }
                const credRes = await authFetch("/api/admin/update-user-credentials", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        uid: editingTeacher.id,
                        newEmail: editData.newEmail.trim() || undefined,
                        newPassword: editData.newPassword.trim() || undefined,
                    }),
                });
                const credData = await credRes.json();
                if (!credRes.ok) { setEditError(credData.error || "Failed to update credentials."); setSavingEdit(false); return; }
            }

            // Build Firestore update — omit credential-specific fields
            const { newEmail, newPassword, pfPct, esicPct, ...firestoreFields } = editData;
            const effectiveEmail = newEmail.trim() || editingTeacher.email;
            const update = {
                ...firestoreFields,
                email: effectiveEmail,
                name: `${editData.firstName} ${editData.lastName}`,
                pfPct: pfPct !== "" ? Number(pfPct) : 0,
                esicPct: esicPct !== "" ? Number(esicPct) : 0,
            };
            await updateDoc(doc(db, "teachers", editingTeacher.id), update);
            await updateDoc(doc(db, "users", editingTeacher.id), update);
            setEditingTeacher(null);
        } catch (e) {
            setEditError("Failed to save. Try again.");
        } finally {
            setSavingEdit(false);
        }
    };

    const { register, handleSubmit, formState: { errors }, reset } = useForm<TeacherForm>({
        resolver: zodResolver(teacherSchema),
    });

    useEffect(() => {
        const q = query(collection(db, "teachers"), orderBy("createdAt", "desc"));
        return onSnapshot(q, snap => {
            setTeachers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Teacher)));
            setLoading(false);
        }, () => setLoading(false));
    }, []);

    const fetchNts = async () => {
        setNtsLoading(true);
        try {
            const snap = await getDocs(collection(db, "nonTeachingStaff"));
            setNtsStaff(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch { } finally { setNtsLoading(false); }
    };

    useEffect(() => { if (staffTab === "nts") fetchNts(); }, [staffTab]);

    const openNtsCreate = () => { setNtsEditing(null); setNtsForm(EMPTY_NTS); setNtsModal(true); setNtsCreatedInfo(null); };
    const openNtsEdit = (s: any) => {
        setNtsEditing(s);
        setNtsForm({ name: s.name || "", designation: s.designation || "", phone: s.phone || "", email: s.email || "", password: "", basicSalary: s.basicSalary || "", hra: s.hra || "0", da: s.da || "0", otherAllowances: s.otherAllowances || "0", photoUrl: s.photoUrl || "", photoName: s.photoName || "" });
        setNtsModal(true); setNtsCreatedInfo(null);
    };

    const saveNts = async () => {
        if (!ntsForm.name.trim()) { toast.error("Name is required"); return; }
        setNtsSaving(true);
        try {
            const payload: any = {
                name: ntsForm.name.trim(),
                designation: ntsForm.designation.trim(),
                phone: ntsForm.phone.trim(),
                email: ntsForm.email.trim().toLowerCase(),
                basicSalary: Number(ntsForm.basicSalary) || 0,
                hra: Number(ntsForm.hra) || 0,
                da: Number(ntsForm.da) || 0,
                otherAllowances: Number(ntsForm.otherAllowances) || 0,
                photoUrl: ntsForm.photoUrl,
                photoName: ntsForm.photoName,
                role: "staff",
            };

            if (ntsEditing) {
                await updateDoc(doc(db, "nonTeachingStaff", ntsEditing.id), payload);
                if (ntsEditing.uid) await updateDoc(doc(db, "users", ntsEditing.uid), payload);
                toast.success("Staff updated");
                setNtsModal(false);
            } else {
                if (ntsForm.email && ntsForm.password) {
                    const res = await authFetch("/api/admin/create-teacher", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: ntsForm.email, password: ntsForm.password, displayName: ntsForm.name.trim() }) });
                    const apiData = await res.json();
                    if (!res.ok) { toast.error(apiData.error || "Failed to create login"); setNtsSaving(false); return; }
                    const uid = apiData.uid;
                    payload.uid = uid;
                    const docRef = doc(db, "nonTeachingStaff", uid);
                    await setDoc(docRef, { ...payload, createdAt: serverTimestamp() });
                    await setDoc(doc(db, "users", uid), { ...payload, createdAt: serverTimestamp() });
                    setNtsCreatedInfo({ name: ntsForm.name, email: ntsForm.email, password: ntsForm.password });
                } else {
                    await addDoc(collection(db, "nonTeachingStaff"), { ...payload, createdAt: serverTimestamp() });
                    toast.success("Staff member added");
                    setNtsModal(false);
                }
            }
            fetchNts();
        } catch (e) {
            toast.error("Failed to save. Try again.");
        } finally {
            setNtsSaving(false);
        }
    };

    const deleteNts = async (s: any) => {
        if (!confirm(`Delete ${s.name}? This cannot be undone.`)) return;
        try {
            await deleteDoc(doc(db, "nonTeachingStaff", s.id));
            if (s.uid) { await authFetch("/api/admin/delete-user", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uid: s.uid }) }); await deleteDoc(doc(db, "users", s.uid)); }
            toast.success("Staff deleted");
            fetchNts();
        } catch { toast.error("Failed to delete"); }
    };

    // ── Create Teacher ─────────────────────────────────────────────────────
    const onCreateTeacher = async (data: TeacherForm) => {
        setCreating(true);
        setFormError(null);
        if (selectedSubjects.length === 0) {
            setFormError("Please select at least one subject.");
            setCreating(false); return;
        }

        try {
            // Use the admin API which handles duplicate email checks across roles
            const res = await authFetch("/api/admin/create-teacher", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: data.email,
                    password: data.password,
                    displayName: `${data.firstName} ${data.lastName}`
                }),
            });
            const apiData = await res.json();

            if (!res.ok) {
                throw new Error(apiData.error || "Failed to create teacher account.");
            }

            const uid = apiData.uid;

            // Create Firestore documents
            const teacherDoc = {
                uid, firstName: data.firstName, lastName: data.lastName,
                email: data.email, phone: data.phone,
                subjects: selectedSubjects, qualification: data.qualification || "",
                role: "teacher",
                assignment: emptyAssignment(),
                createdAt: serverTimestamp(),
            };

            try {
                await setDoc(doc(db, "teachers", uid), teacherDoc);
                await setDoc(doc(db, "users", uid), { ...teacherDoc, name: `${data.firstName} ${data.lastName}` });
            } catch (firestoreErr) {
                // Roll back — delete orphaned Auth user
                await authFetch("/api/admin/delete-user", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ uid }),
                }).catch(() => {});
                throw new Error("Failed to save teacher profile. Please try again.");
            }

            setCreatedInfo({ name: `${data.firstName} ${data.lastName}`, email: data.email, password: data.password });
            reset(); setSelectedSubjects([]); setShowForm(false);
        } catch (err: any) {
            setFormError(err.message || "Failed to create account.");
        } finally {
            setCreating(false);
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Delete teacher ${name}?\n\nThis will permanently remove their login access.`)) return;

        try {
            // Step 1: Remove from Firebase Auth — revokes login immediately
            const res = await authFetch("/api/admin/delete-user", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ uid: id }),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(`Could not remove login access: ${data.error}`);
            }

            // Step 2: Remove from Firestore only after Auth is cleared
            await deleteDoc(doc(db, "teachers", id));
            await deleteDoc(doc(db, "users", id));
        } catch (error: any) {
            console.error("Error deleting teacher:", error);
            toast.error("Error deleting teacher: " + error.message);
        }
    };



    const filtered = teachers.filter(t =>
        `${t.firstName} ${t.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
        (t.subjects || []).join(" ").toLowerCase().includes(search.toLowerCase()) ||
        t.email?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="rounded-2xl gradient-navy p-6 md:p-8 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.2) 0%, transparent 50%)` }} />
                <div className="relative z-10 flex items-center justify-between gap-4 flex-wrap">
                    <div>
                        <p className="text-white/50 text-sm">Admin Console</p>
                        <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">Manage Staff</h1>
                        <p className="text-white/40 text-sm mt-1">
                            {staffTab === "teachers" ? `${teachers.length} teacher${teachers.length !== 1 ? "s" : ""} registered` : `${ntsStaff.length} non-teaching staff`}
                        </p>
                    </div>
                    <div className="flex gap-3">
                        {staffTab === "teachers" ? (<>
                            <Link href="/admin/teachers/import" className="px-4 py-2.5 rounded-xl border border-white/20 text-white text-sm font-semibold hover:bg-white/10 transition-colors">Bulk Import</Link>
                            <button onClick={() => { setShowForm(true); setCreatedInfo(null); setFormError(null); }} className="flex items-center gap-2 px-5 py-2.5 bg-gold hover:bg-gold/90 text-navy rounded-xl font-semibold text-sm transition-all"><Plus className="w-4 h-4" /> Add Teacher</button>
                        </>) : (
                            <button onClick={openNtsCreate} className="flex items-center gap-2 px-5 py-2.5 bg-gold hover:bg-gold/90 text-navy rounded-xl font-semibold text-sm transition-all"><Plus className="w-4 h-4" /> Add Staff</button>
                        )}
                    </div>
                </div>
            </div>

            {createdInfo && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <p className="font-bold text-emerald-800">Account created for {createdInfo.name}!</p>
                        <div className="mt-2 bg-white border border-emerald-100 rounded-xl p-3 grid grid-cols-2 gap-2 text-sm">
                            <div><span className="text-gray-400">Email:</span> <span className="font-semibold text-navy">{createdInfo.email}</span></div>
                            <div><span className="text-gray-400">Password:</span> <span className="font-semibold text-navy">{createdInfo.password}</span></div>
                        </div>
                    </div>
                    <button onClick={() => setCreatedInfo(null)} className="text-gray-300 hover:text-gray-500"><X className="w-4 h-4" /></button>
                </div>
            )}

            {/* ── Tab Switcher ── */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
                <button onClick={() => setStaffTab("teachers")} className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${staffTab === "teachers" ? "bg-white text-navy shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>Teaching Staff</button>
                <button onClick={() => setStaffTab("nts")} className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${staffTab === "nts" ? "bg-white text-navy shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>Non-Teaching Staff</button>
            </div>

            {staffTab === "nts" ? (
                /* ── Non-Teaching Staff ── */
                <>
                    <div className="relative max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input type="search" placeholder="Search non-teaching staff…" value={ntsSearch} onChange={e => setNtsSearch(e.target.value)} className="pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm w-full focus:outline-none focus:border-navy" />
                    </div>
                    {ntsCreatedInfo && (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-start gap-3">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <p className="font-bold text-emerald-800">Account created for {ntsCreatedInfo.name}!</p>
                                <p className="text-xs text-emerald-600 mt-1">Email: <b>{ntsCreatedInfo.email}</b> · Password: <b>{ntsCreatedInfo.password}</b></p>
                            </div>
                            <button onClick={() => setNtsCreatedInfo(null)} className="text-gray-300 hover:text-gray-500"><X className="w-4 h-4" /></button>
                        </div>
                    )}
                    {ntsLoading ? (
                        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-navy" /></div>
                    ) : (
                        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {ntsStaff.filter(s => !ntsSearch || s.name?.toLowerCase().includes(ntsSearch.toLowerCase()) || s.designation?.toLowerCase().includes(ntsSearch.toLowerCase())).map(s => (
                                <div key={s.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="flex items-center gap-3">
                                            {s.photoUrl ? (
                                                <img src={s.photoUrl} alt={s.name} className="w-11 h-11 rounded-xl object-cover border border-gray-200 shrink-0" />
                                            ) : (
                                                <div className="w-11 h-11 rounded-xl bg-orange-50 flex items-center justify-center font-bold text-orange-400 text-base shrink-0">{(s.name || "S").charAt(0).toUpperCase()}</div>
                                            )}
                                            <div className="min-w-0">
                                                <p className="font-bold text-navy text-sm">{s.name}</p>
                                                <p className="text-xs text-gray-400">{s.designation || "Staff"}</p>
                                                {s.uid && <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full font-medium">Has Login</span>}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-1 text-xs text-gray-500 mb-4">
                                        {s.phone && <div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 shrink-0" />{s.phone}</div>}
                                        {s.email && <div className="flex items-center gap-2"><Mail className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{s.email}</span></div>}
                                        {(s.basicSalary || 0) > 0 && <div className="flex items-center gap-2"><BookOpen className="w-3.5 h-3.5 shrink-0" />Gross: ₹{(Number(s.basicSalary || 0) + Number(s.hra || 0) + Number(s.da || 0) + Number(s.otherAllowances || 0)).toLocaleString("en-IN")}/mo</div>}
                                    </div>
                                    <div className="flex gap-2 pt-3 border-t border-gray-50">
                                        <button onClick={() => openNtsEdit(s)} className="flex-1 py-2 rounded-xl text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center justify-center gap-1.5"><Pencil className="w-3.5 h-3.5" /> Edit</button>
                                        <button onClick={() => deleteNts(s)} className="py-2 px-3 rounded-xl text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                                    </div>
                                </div>
                            ))}
                            {ntsStaff.length === 0 && !ntsLoading && (
                                <div className="col-span-full bg-white rounded-2xl border border-dashed border-gray-200 p-16 text-center">
                                    <User className="w-10 h-10 text-gray-200 mx-auto mb-3" /><p className="text-sm font-semibold text-gray-400">No non-teaching staff yet</p>
                                </div>
                            )}
                        </div>
                    )}
                    {/* NTS Modal */}
                    {ntsModal && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
                                <div className="flex items-center justify-between p-5 border-b border-gray-100">
                                    <h3 className="font-bold text-navy">{ntsEditing ? "Edit Staff Member" : "Add Non-Teaching Staff"}</h3>
                                    <button onClick={() => setNtsModal(false)}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
                                </div>
                                <div className="p-5 space-y-4">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="col-span-2"><label className="block text-xs font-semibold text-gray-500 mb-1">Full Name *</label><input value={ntsForm.name} onChange={e => setNtsForm(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-navy" placeholder="Full name" /></div>
                                        <div><label className="block text-xs font-semibold text-gray-500 mb-1">Designation</label><input value={ntsForm.designation} onChange={e => setNtsForm(p => ({ ...p, designation: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-navy" placeholder="e.g. Peon, Guard" /></div>
                                        <div><label className="block text-xs font-semibold text-gray-500 mb-1">Phone</label><input value={ntsForm.phone} onChange={e => setNtsForm(p => ({ ...p, phone: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-navy" placeholder="Phone number" /></div>
                                    </div>
                                    <div className="border-t border-gray-100 pt-3">
                                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Salary Components</p>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div><label className="block text-xs font-semibold text-gray-500 mb-1">Basic Salary (₹)</label><input type="number" value={ntsForm.basicSalary} onChange={e => setNtsForm(p => ({ ...p, basicSalary: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-navy" placeholder="0" /></div>
                                            <div><label className="block text-xs font-semibold text-gray-500 mb-1">HRA (₹)</label><input type="number" value={ntsForm.hra} onChange={e => setNtsForm(p => ({ ...p, hra: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-navy" placeholder="0" /></div>
                                            <div><label className="block text-xs font-semibold text-gray-500 mb-1">DA (₹)</label><input type="number" value={ntsForm.da} onChange={e => setNtsForm(p => ({ ...p, da: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-navy" placeholder="0" /></div>
                                            <div><label className="block text-xs font-semibold text-gray-500 mb-1">Other Allowances (₹)</label><input type="number" value={ntsForm.otherAllowances} onChange={e => setNtsForm(p => ({ ...p, otherAllowances: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-navy" placeholder="0" /></div>
                                        </div>
                                    </div>
                                    <div className="border-t border-gray-100 pt-3">
                                        <p className="text-xs font-bold text-blue-500 uppercase tracking-wide mb-1">Login Access (Optional)</p>
                                        <p className="text-[10px] text-gray-400 mb-2">Fill email + password to give this staff member portal login access.</p>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div><label className="block text-xs font-semibold text-gray-500 mb-1">Email</label><input type="email" value={ntsForm.email} onChange={e => setNtsForm(p => ({ ...p, email: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-navy" placeholder="staff@school.com" /></div>
                                            {!ntsEditing && <div><label className="block text-xs font-semibold text-gray-500 mb-1">Password</label><input type="password" value={ntsForm.password} onChange={e => setNtsForm(p => ({ ...p, password: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-navy" placeholder="Min 6 chars" /></div>}
                                        </div>
                                    </div>
                                    <div className="border-t border-gray-100 pt-3">
                                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Profile Photo</p>
                                        {ntsForm.photoUrl ? (
                                            <div className="flex items-center gap-3">
                                                <img src={ntsForm.photoUrl} alt="Photo" className="w-14 h-14 rounded-xl object-cover border border-gray-200" />
                                                <button type="button" onClick={() => setNtsForm(p => ({ ...p, photoUrl: "", photoName: "" }))} className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50">Remove</button>
                                            </div>
                                        ) : (
                                            <CloudinaryUpload folder="admin-docs" subFolder="teacher-photos" onUpload={(u, _id, n) => setNtsForm(p => ({ ...p, photoUrl: u, photoName: n ?? "" }))} acceptedFileTypes="images" maxSizeMB={1} />
                                        )}
                                    </div>
                                </div>
                                <div className="flex gap-3 p-5 border-t border-gray-100">
                                    <button onClick={() => setNtsModal(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
                                    <button onClick={saveNts} disabled={ntsSaving} className="flex-1 py-2.5 rounded-xl bg-navy text-white text-sm font-semibold hover:bg-navy/90 disabled:opacity-70 flex items-center justify-center gap-2">
                                        {ntsSaving && <Loader2 className="w-4 h-4 animate-spin" />}{ntsEditing ? "Save Changes" : "Add Staff"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            ) : (
            /* ── Teacher section (existing) ── */
            <>
            <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="search" placeholder="Search by name, subject or email..."
                    value={search} onChange={e => setSearch(e.target.value)}
                    className="pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm w-full focus:outline-none focus:border-navy" />
            </div>

            {/* Grid */}
            {loading ? (
                <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-navy" /></div>
            ) : filtered.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-16 text-center">
                    <User className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-gray-400">No teachers yet</p>
                </div>
            ) : (
                <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filtered.map(teacher => {
                        const a = teacher.assignment as any;
                        const cs: ClassSectionMap = a?.classSections || {};
                        const classCount = Object.keys(cs).length;
                        const sectionCount = Object.values(cs).reduce((acc: number, s: any) => acc + (s?.length || 0), 0);
                        return (
                            <div key={teacher.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        {(teacher as any).photoUrl ? (
                                            <img src={(teacher as any).photoUrl} alt={teacher.firstName} className="w-11 h-11 rounded-xl object-cover border border-gray-200 shrink-0" />
                                        ) : (
                                            <div className="w-11 h-11 rounded-xl bg-navy/10 flex items-center justify-center font-bold text-navy text-base shrink-0">
                                                {(teacher.firstName || "T").charAt(0).toUpperCase()}
                                            </div>
                                        )}
                                        <div className="min-w-0">
                                            <p className="font-bold text-navy text-sm">{teacher.firstName} {teacher.lastName}</p>
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {(teacher.subjects || []).slice(0, 2).map(s => (
                                                    <span key={s} className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">{s}</span>
                                                ))}
                                                {(teacher.subjects || []).length > 2 && <span className="text-[10px] text-gray-400">+{(teacher.subjects || []).length - 2}</span>}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-1.5 text-xs text-gray-500 mb-4">
                                    <div className="flex items-center gap-2"><Mail className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{teacher.email}</span></div>
                                    <div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 shrink-0" />{teacher.phone}</div>
                                    {teacher.qualification && <div className="flex items-center gap-2"><GraduationCap className="w-3.5 h-3.5 shrink-0" />{teacher.qualification}</div>}
                                </div>

                                <div className="flex gap-2 pt-3 border-t border-gray-50">
                                    <Link href="/admin/timetable"
                                        className="flex-1 py-2 rounded-xl text-xs font-semibold bg-navy text-white hover:bg-navy/90 flex items-center justify-center gap-1.5">
                                        <BookOpen className="w-3.5 h-3.5" /> View Timetable
                                    </Link>
                                    <button onClick={() => openEdit(teacher)}
                                        className="py-2 px-3 rounded-xl text-gray-400 hover:text-navy hover:bg-navy/5 border border-gray-100 hover:border-navy/10 transition-colors" title="Edit Profile">
                                        <BookOpen className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={() => handleDelete(teacher.id, `${teacher.firstName} ${teacher.lastName}`)}
                                        className="py-2 px-3 rounded-xl text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Add Teacher Modal */}
            {showForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setShowForm(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white z-10">
                            <h2 className="font-bold text-navy text-lg">Add New Teacher</h2>
                            <button onClick={() => setShowForm(false)} className="p-2 rounded-xl hover:bg-gray-50 text-gray-400"><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleSubmit(onCreateTeacher)} className="p-5 space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <FormField label="First Name" error={errors.firstName?.message}>
                                    <input {...register("firstName")} placeholder="First name" className={inputCls} />
                                </FormField>
                                <FormField label="Last Name" error={errors.lastName?.message}>
                                    <input {...register("lastName")} placeholder="Last name" className={inputCls} />
                                </FormField>
                            </div>
                            <FormField label="Email" error={errors.email?.message}>
                                <input {...register("email")} type="email" placeholder="teacher@school.edu" className={inputCls} />
                            </FormField>
                            <FormField label="Phone" error={errors.phone?.message}>
                                <input {...register("phone")} placeholder="Mobile number" className={inputCls} />
                            </FormField>
                            <FormField label="Subjects Taught">
                                <div className="flex flex-wrap gap-2">
                                    {SUBJECTS.map(s => (
                                        <button key={s} type="button"
                                            onClick={() => setSelectedSubjects(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s])}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${selectedSubjects.includes(s) ? "bg-purple-50 border-purple-200 text-purple-700" : "bg-gray-50 border-gray-200 text-gray-400 hover:border-gray-300"}`}>
                                            {selectedSubjects.includes(s) && "✓ "}{s}
                                        </button>
                                    ))}
                                </div>
                                {selectedSubjects.length > 0 && <p className="text-xs text-purple-600 mt-2">{selectedSubjects.length} selected</p>}
                            </FormField>
                            <FormField label="Qualification (optional)">
                                <input {...register("qualification")} placeholder="e.g. B.Ed, M.Sc" className={inputCls} />
                            </FormField>
                            <FormField label="Temporary Password" error={errors.password?.message}>
                                <div className="relative">
                                    <input {...register("password")} type={showPass ? "text" : "password"} placeholder="Min 6 characters" className={`${inputCls} pr-10`} />
                                    <button type="button" onClick={() => setShowPass(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                                        {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </FormField>
                            {formError && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl">{formError}</div>}
                            <div className="flex gap-3 pt-3 border-t">
                                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-xl border text-sm text-gray-500">Cancel</button>
                                <button type="submit" disabled={creating} className="flex-1 py-2.5 rounded-xl bg-navy text-white text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
                                    {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                    {creating ? "Creating..." : "Create Account"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {/* ── Edit Teacher Modal ── */}
            {
                editingTeacher && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                            {/* Header */}
                            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
                                <div>
                                    <h2 className="font-bold text-navy text-lg">Edit Teacher</h2>
                                    <p className="text-xs text-gray-400">{editingTeacher.email}</p>
                                </div>
                                <button onClick={() => setEditingTeacher(null)} className="p-2 rounded-xl hover:bg-gray-50 text-gray-400"><X className="w-5 h-5" /></button>
                            </div>
                            {/* Tab Nav */}
                            <div className="flex border-b border-gray-100 shrink-0 px-2 overflow-x-auto">
                                {(["basic", "salary", "bank", "documents", "pf", "credentials"] as const).map(tab => (
                                    <button key={tab} onClick={() => setEditTab(tab)}
                                        className={`px-3 py-3 text-xs font-semibold capitalize border-b-2 transition-colors -mb-px whitespace-nowrap ${editTab === tab
                                            ? tab === "credentials" ? "border-amber-500 text-amber-600" : tab === "pf" ? "border-indigo-500 text-indigo-600" : "border-navy text-navy"
                                            : "border-transparent text-gray-400 hover:text-gray-600"
                                            }`}>
                                        {tab === "credentials" ? "🔑 Login" : tab === "pf" ? "📋 PF & ESIC" : tab === "salary" ? "💰 Salary" : tab === "basic" ? "👤 Basic & Personal" : tab === "bank" ? "🏦 Bank" : "📄 Documents"}
                                    </button>
                                ))}
                            </div>
                            {/* Body */}
                            <div className="flex-1 overflow-y-auto p-6 space-y-4">

                                {/* ── Tab: Basic & Personal (merged) ── */}
                                {editTab === "basic" && (<>
                                    <div className="col-span-2 mb-1">
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-1">Professional Info</p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <FormField label="First Name"><input value={editData.firstName} onChange={e => setEditData(p => ({ ...p, firstName: e.target.value }))} className={inputCls} placeholder="First name" /></FormField>
                                        <FormField label="Last Name"><input value={editData.lastName} onChange={e => setEditData(p => ({ ...p, lastName: e.target.value }))} className={inputCls} placeholder="Last name" /></FormField>
                                        <FormField label="Phone"><input value={editData.phone} onChange={e => setEditData(p => ({ ...p, phone: e.target.value }))} className={inputCls} placeholder="Mobile" /></FormField>
                                        <FormField label="Qualification"><input value={editData.qualification} onChange={e => setEditData(p => ({ ...p, qualification: e.target.value }))} className={inputCls} placeholder="e.g. B.Ed, M.Sc" /></FormField>
                                        <FormField label="Designation"><input value={editData.designation} onChange={e => setEditData(p => ({ ...p, designation: e.target.value }))} className={inputCls} placeholder="e.g. PGT, TGT, Lecturer" /></FormField>
                                        <FormField label="Joining Date"><input type="date" value={editData.joiningDate} onChange={e => setEditData(p => ({ ...p, joiningDate: e.target.value }))} className={inputCls} /></FormField>
                                    </div>

                                    <div className="mt-2">
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-1 mb-3">Personal Details</p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <FormField label="Date of Birth"><input type="date" value={editData.dob} onChange={e => setEditData(p => ({ ...p, dob: e.target.value }))} className={inputCls} /></FormField>
                                        <FormField label="Gender">
                                            <select value={editData.gender} onChange={e => setEditData(p => ({ ...p, gender: e.target.value }))} className={inputCls}>
                                                <option value="">Select</option>
                                                {["Male", "Female", "Other"].map(o => <option key={o}>{o}</option>)}
                                            </select>
                                        </FormField>
                                        <FormField label="Blood Group">
                                            <select value={editData.bloodGroup} onChange={e => setEditData(p => ({ ...p, bloodGroup: e.target.value }))} className={inputCls}>
                                                <option value="">Select</option>
                                                {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map(o => <option key={o}>{o}</option>)}
                                            </select>
                                        </FormField>
                                        <FormField label="Social Category">
                                            <select value={editData.socialCategory} onChange={e => setEditData(p => ({ ...p, socialCategory: e.target.value }))} className={inputCls}>
                                                <option value="">Select</option>
                                                {["General", "OBC", "SC", "ST", "Other"].map(o => <option key={o}>{o}</option>)}
                                            </select>
                                        </FormField>
                                        <FormField label="Father's Name"><input value={editData.fatherName} onChange={e => setEditData(p => ({ ...p, fatherName: e.target.value }))} className={inputCls} /></FormField>
                                        <FormField label="Emergency Contact"><input value={editData.emergencyContact} onChange={e => setEditData(p => ({ ...p, emergencyContact: e.target.value }))} className={inputCls} /></FormField>
                                        <div className="col-span-2">
                                            <FormField label="Permanent Address"><input value={editData.permanentAddress} onChange={e => setEditData(p => ({ ...p, permanentAddress: e.target.value }))} className={inputCls} /></FormField>
                                        </div>
                                    </div>
                                </>)}

                                {/* ── Tab: Salary ── */}
                                {editTab === "salary" && (
                                    <div className="space-y-4">
                                        <div>
                                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-1 mb-3">Monthly Salary Breakdown</p>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <FormField label="Basic Salary (₹)"><input value={editData.basicSalary} onChange={e => setEditData(p => ({ ...p, basicSalary: e.target.value }))} className={inputCls} placeholder="e.g. 25000" /></FormField>
                                            <FormField label="HRA – House Rent Allowance (₹)"><input value={editData.hra} onChange={e => setEditData(p => ({ ...p, hra: e.target.value }))} className={inputCls} placeholder="e.g. 5000" /></FormField>
                                            <FormField label="DA – Dearness Allowance (₹)"><input value={editData.da} onChange={e => setEditData(p => ({ ...p, da: e.target.value }))} className={inputCls} placeholder="e.g. 2000" /></FormField>
                                            <FormField label="Other Allowances (₹)"><input value={editData.otherAllowances} onChange={e => setEditData(p => ({ ...p, otherAllowances: e.target.value }))} className={inputCls} placeholder="Medical, transport, etc." /></FormField>
                                        </div>
                                        {/* Gross Total preview */}
                                        {(editData.basicSalary || editData.hra || editData.da || editData.otherAllowances) && (
                                            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100">
                                                <p className="text-xs text-emerald-600 font-semibold">Gross Monthly Salary</p>
                                                <p className="text-2xl font-bold text-emerald-700 mt-0.5">
                                                    ₹{(
                                                        (Number(editData.basicSalary) || 0) +
                                                        (Number(editData.hra) || 0) +
                                                        (Number(editData.da) || 0) +
                                                        (Number(editData.otherAllowances) || 0)
                                                    ).toLocaleString("en-IN")}
                                                </p>
                                                <p className="text-[10px] text-emerald-500 mt-1">Basic + HRA + DA + Other Allowances</p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* ── Tab: Bank ── */}
                                {editTab === "bank" && (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="col-span-2">
                                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-1">Bank Account Details</p>
                                        </div>
                                        <FormField label="Bank Name"><input value={editData.bankName} onChange={e => setEditData(p => ({ ...p, bankName: e.target.value }))} className={inputCls} placeholder="e.g. State Bank of India" /></FormField>
                                        <FormField label="Branch Name"><input value={editData.branchName} onChange={e => setEditData(p => ({ ...p, branchName: e.target.value }))} className={inputCls} placeholder="e.g. Connaught Place, New Delhi" /></FormField>
                                        <FormField label="Account Number"><input value={editData.bankAccountNumber} onChange={e => setEditData(p => ({ ...p, bankAccountNumber: e.target.value }))} className={inputCls} placeholder="Bank account number" /></FormField>
                                        <FormField label="IFSC Code"><input value={editData.ifscCode} onChange={e => setEditData(p => ({ ...p, ifscCode: e.target.value }))} className={inputCls} placeholder="e.g. SBIN0001234" /></FormField>
                                        <FormField label="CIN / Customer ID"><input value={editData.cinNumber} onChange={e => setEditData(p => ({ ...p, cinNumber: e.target.value }))} className={inputCls} placeholder="Bank Customer ID No." /></FormField>
                                    </div>
                                )}

                                {/* ── Tab: Documents ── */}
                                {editTab === "documents" && (
                                    <div className="space-y-5">
                                        {/* Profile Photo */}
                                        <div>
                                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 pb-1 mb-3">📷 Profile Photo</p>
                                            {editData.photoUrl ? (
                                                <div className="flex items-center gap-4">
                                                    <img src={editData.photoUrl} alt="Profile" className="w-20 h-20 rounded-xl object-cover border border-gray-200 shadow-sm" />
                                                    <div>
                                                        <p className="text-xs font-medium text-gray-700 mb-1">{editData.photoName || "Photo uploaded"}</p>
                                                        <button type="button" onClick={() => setEditData(p => ({ ...p, photoUrl: "", photoName: "" }))} className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50">Remove Photo</button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <CloudinaryUpload
                                                    folder="admin-docs"
                                                    subFolder="teacher-photos"
                                                    onUpload={(u, _id, n) => setEditData(p => ({ ...p, photoUrl: u, photoName: n ?? "" }))}
                                                    acceptedFileTypes="images"
                                                    maxSizeMB={1}
                                                />
                                            )}
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <FormField label="PAN Number"><input value={editData.panNumber} onChange={e => setEditData(p => ({ ...p, panNumber: e.target.value }))} className={inputCls} placeholder="ABCDE1234F" /></FormField>
                                            <FormField label="Aadhaar Number"><input value={editData.aadhaarNumber} onChange={e => setEditData(p => ({ ...p, aadhaarNumber: e.target.value }))} className={inputCls} placeholder="12-digit Aadhaar" /></FormField>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <DocUploadSlot label="PAN Card" url={editData.panCardUrl} name={editData.panCardName || "pan-card"} onUpload={(url, name) => setEditData(p => ({ ...p, panCardUrl: url, panCardName: name }))} onRemove={() => setEditData(p => ({ ...p, panCardUrl: "", panCardName: "" }))} />
                                            <DocUploadSlot label="Aadhaar Card" url={editData.aadhaarUrl} name={editData.aadhaarName || "aadhaar"} onUpload={(url, name) => setEditData(p => ({ ...p, aadhaarUrl: url, aadhaarName: name }))} onRemove={() => setEditData(p => ({ ...p, aadhaarUrl: "", aadhaarName: "" }))} />
                                            <DocUploadSlot label="Driving Licence" url={editData.drivingLicenceUrl} name={editData.drivingLicenceName || "driving-licence"} onUpload={(url, name) => setEditData(p => ({ ...p, drivingLicenceUrl: url, drivingLicenceName: name }))} onRemove={() => setEditData(p => ({ ...p, drivingLicenceUrl: "", drivingLicenceName: "" }))} />
                                            <DocUploadSlot label="Passport" url={editData.passportUrl} name={editData.passportName || "passport"} onUpload={(url, name) => setEditData(p => ({ ...p, passportUrl: url, passportName: name }))} onRemove={() => setEditData(p => ({ ...p, passportUrl: "", passportName: "" }))} />
                                        </div>
                                    </div>
                                )}

                                {/* ── Tab: PF & ESIC ── */}
                                {editTab === "pf" && (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="col-span-2">
                                            <p className="text-xs font-bold text-indigo-500 uppercase tracking-wider border-b border-indigo-100 pb-1">🏦 Provident Fund (PF / EPF)</p>
                                            <p className="text-[10px] text-gray-400 mt-1">UAN is the 12-digit portable ID. EPF Account No. is employer-linked (e.g. DL/CPM/0012345/000/0000001). These are different numbers.</p>
                                        </div>
                                        <FormField label="PF Deduction %">
                                            <input type="number" min={0} max={100} step={0.01} value={editData.pfPct} onChange={e => setEditData(p => ({ ...p, pfPct: e.target.value }))} className={inputCls} placeholder="e.g. 12" />
                                            <p className="text-[10px] text-gray-400 mt-0.5">Employee PF contribution % of gross salary (typically 12%)</p>
                                        </FormField>
                                        <FormField label="ESIC Deduction %">
                                            <input type="number" min={0} max={100} step={0.01} value={editData.esicPct} onChange={e => setEditData(p => ({ ...p, esicPct: e.target.value }))} className={inputCls} placeholder="e.g. 0.75" />
                                            <p className="text-[10px] text-gray-400 mt-0.5">Employee ESIC contribution % of gross salary (typically 0.75%)</p>
                                        </FormField>
                                        <FormField label="UAN Number"><input value={editData.uanNumber} onChange={e => setEditData(p => ({ ...p, uanNumber: e.target.value }))} className={inputCls} placeholder="12-digit e.g. 100234567890" /></FormField>
                                        <FormField label="EPF Account Number"><input value={editData.epfAccountNumber} onChange={e => setEditData(p => ({ ...p, epfAccountNumber: e.target.value }))} className={inputCls} placeholder="e.g. DL/CPM/0012345/000/0000001" /></FormField>
                                        <div className="col-span-2 mt-1">
                                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-1">PF Dates</p>
                                        </div>
                                        <FormField label="PF Joining Date"><input type="date" value={editData.pfJoiningDate} onChange={e => setEditData(p => ({ ...p, pfJoiningDate: e.target.value }))} className={inputCls} /></FormField>
                                        <FormField label="PF Exit Date (if applicable)"><input type="date" value={editData.pfExitDate} onChange={e => setEditData(p => ({ ...p, pfExitDate: e.target.value }))} className={inputCls} /></FormField>
                                        <div className="col-span-2 mt-3">
                                            <p className="text-xs font-bold text-emerald-500 uppercase tracking-wider border-b border-emerald-100 pb-1">🏥 ESIC (Employee State Insurance)</p>
                                            <p className="text-[10px] text-gray-400 mt-1">IP Number is the 17-digit Insured Person number. ESIC applies if gross salary ≤ ₹21,000/month.</p>
                                        </div>
                                        <FormField label="ESIC IP Number"><input value={editData.esicIpNumber} onChange={e => setEditData(p => ({ ...p, esicIpNumber: e.target.value }))} className={inputCls} placeholder="17-digit IP Number" /></FormField>
                                        <FormField label="ESIC Dispensary / Hospital"><input value={editData.esicDispensary} onChange={e => setEditData(p => ({ ...p, esicDispensary: e.target.value }))} className={inputCls} placeholder="Assigned ESIC clinic name" /></FormField>
                                        <div className="col-span-2">
                                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-1">ESIC Dates</p>
                                        </div>
                                        <FormField label="ESIC Joining Date"><input type="date" value={editData.esicJoiningDate} onChange={e => setEditData(p => ({ ...p, esicJoiningDate: e.target.value }))} className={inputCls} /></FormField>
                                        <FormField label="ESIC Exit Date (if applicable)"><input type="date" value={editData.esicExitDate} onChange={e => setEditData(p => ({ ...p, esicExitDate: e.target.value }))} className={inputCls} /></FormField>
                                    </div>
                                )}
                                {editTab === "credentials" && (
                                    <div className="space-y-5">
                                        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                                            ⚠️ Changes here update the teacher's <strong>Firebase login credentials</strong>. Leave a field blank to keep it unchanged.
                                        </div>
                                        <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Current Email</p>
                                            <p className="text-sm font-medium text-navy">{editingTeacher.email}</p>
                                        </div>
                                        <FormField label="New Email Address">
                                            <input
                                                type="email"
                                                value={editData.newEmail}
                                                onChange={e => setEditData(p => ({ ...p, newEmail: e.target.value }))}
                                                className={inputCls}
                                                placeholder="Leave blank to keep current email"
                                            />
                                        </FormField>
                                        <FormField label="New Password">
                                            <div className="relative">
                                                <input
                                                    type="password"
                                                    value={editData.newPassword}
                                                    onChange={e => setEditData(p => ({ ...p, newPassword: e.target.value }))}
                                                    className={inputCls}
                                                    placeholder="Leave blank to keep current password"
                                                />
                                            </div>
                                            <p className="text-xs text-gray-400 mt-1.5">Minimum 6 characters.</p>
                                        </FormField>
                                    </div>
                                )}
                                {editError && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl">{editError}</div>}
                            </div>
                            {/* Footer */}
                            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end shrink-0 bg-gray-50">
                                <button type="button" onClick={() => setEditingTeacher(null)} className="px-5 py-2.5 rounded-xl border text-sm text-gray-500">Cancel</button>
                                <button onClick={handleSaveEdit} disabled={savingEdit}
                                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-navy text-white text-sm font-semibold disabled:opacity-60">
                                    {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    {savingEdit ? "Saving..." : "Save All Changes"}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
            </> // end teacher tab
            )} {/* end staffTab ternary */}
        </div>
    );
}

const inputCls = "w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/10 bg-white";
function FormField({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">{label}</label>
            {children}
            {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
        </div>
    );
}

function DocUploadSlot({ label, url, name, onUpload, onRemove }: {
    label: string; url: string; name: string;
    onUpload: (url: string, name: string) => void;
    onRemove: () => void;
}) {
    return (
        <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">{label}</label>
            {url ? (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl">
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-green-800 truncate">{name}</p>
                        <p className="text-[10px] text-green-600 mt-0.5">Uploaded ✓</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                        <FileViewerTrigger url={url} fileName={name} label="View" className="text-xs" />
                        <button type="button" onClick={onRemove} className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50">Remove</button>
                    </div>
                </div>
            ) : (
                <CloudinaryUpload
                    folder="admin-docs"
                    subFolder="staff-docs"
                    onUpload={(u, _id, n) => onUpload(u, n ?? "")}
                    acceptedFileTypes="all"
                    maxSizeMB={1}
                />
            )}
        </div>
    );
}

