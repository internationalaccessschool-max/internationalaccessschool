"use client";

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
    doc, setDoc, serverTimestamp, collection,
    onSnapshot, query, orderBy, deleteDoc, updateDoc
} from "firebase/firestore";
import { db, firebaseConfig } from "@/lib/firebase";
import Link from "next/link";
import { CloudinaryUpload } from "@/components/ui/cloudinary-upload";
import { FileViewerTrigger } from "@/components/ui/file-viewer";

// ── Constants ──────────────────────────────────────────────────────────────
const CLASSES = ["Class 1", "Class 2", "Class 3", "Class 4", "Class 5",
    "Class 6", "Class 7", "Class 8", "Class 9", "Class 10", "Class 11", "Class 12"];
const SECTIONS = ["A", "B", "C", "D", "E"];
const SUBJECTS = ["Mathematics", "Physics", "Chemistry", "Biology", "English",
    "Hindi", "History", "Geography", "Civics", "Computer Science",
    "Economics", "Accountancy", "Business Studies", "Physical Education", "Art", "Other"];
const STREAMS = ["General", "Science", "Commerce", "Arts", "Vocational"];
const SENIOR_CLASSES = ["Class 11", "Class 12"];

const teacherSchema = z.object({
    firstName: z.string().min(2, "First name required"),
    lastName: z.string().min(1, "Last name required"),
    email: z.string().email("Invalid email"),
    phone: z.string().min(10, "Valid phone required"),
    qualification: z.string().optional(),
    password: z.string().min(6, "Min 6 characters"),
});
type TeacherForm = z.infer<typeof teacherSchema>;

interface ClassSectionMap { [cls: string]: string[] } // e.g. { "Class 6": ["A","B"] }
interface Assignment {
    classSections: ClassSectionMap;
    subjects: string[];
    streams: string[];
}

interface Teacher {
    id: string; uid?: string; firstName: string; lastName: string;
    email: string; phone: string; subjects?: string[]; qualification?: string;
    assignment?: Assignment; createdAt?: any; role?: string;
}

const emptyAssignment = (): Assignment => ({ classSections: {}, subjects: [], streams: [] });

export default function AdminTeachersPage() {
    const [teachers, setTeachers] = useState<Teacher[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [showForm, setShowForm] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [createdInfo, setCreatedInfo] = useState<{ name: string; email: string; password: string } | null>(null);
    const [showPass, setShowPass] = useState(false);
    const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);

    const [assigningTeacher, setAssigningTeacher] = useState<Teacher | null>(null);
    const [assignment, setAssignment] = useState<Assignment>(emptyAssignment());
    const [savingAssign, setSavingAssign] = useState(false);

    // Edit Teacher
    const EMPTY_EDIT = {
        firstName: "", lastName: "", phone: "", qualification: "", subjects: [] as string[],
        dob: "", gender: "", bloodGroup: "", socialCategory: "", fatherName: "", permanentAddress: "", emergencyContact: "",
        panNumber: "", aadhaarNumber: "",
        panCardUrl: "", panCardName: "", aadhaarUrl: "", aadhaarName: "",
        bankName: "", bankAccountNumber: "", ifscCode: "", uanNumber: "", epfNumber: "",
        designation: "", joiningDate: "", basicSalary: "",
        newEmail: "", newPassword: "",
    };
    const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
    const [editTab, setEditTab] = useState<"basic" | "personal" | "documents" | "bank" | "credentials">("basic");
    const [editData, setEditData] = useState(EMPTY_EDIT);
    const [savingEdit, setSavingEdit] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);

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
            dob: d.dob || "",
            gender: d.gender || "",
            bloodGroup: d.bloodGroup || "",
            socialCategory: d.socialCategory || "",
            fatherName: d.fatherName || "",
            permanentAddress: d.permanentAddress || "",
            emergencyContact: d.emergencyContact || "",
            panNumber: d.panNumber || "",
            aadhaarNumber: d.aadhaarNumber || "",
            panCardUrl: d.panCardUrl || "",
            panCardName: d.panCardName || "",
            aadhaarUrl: d.aadhaarUrl || "",
            aadhaarName: d.aadhaarName || "",
            bankName: d.bankName || "",
            bankAccountNumber: d.bankAccountNumber || "",
            ifscCode: d.ifscCode || "",
            uanNumber: d.uanNumber || "",
            epfNumber: d.epfNumber || "",
            designation: d.designation || "",
            joiningDate: d.joiningDate || "",
            basicSalary: d.basicSalary || "",
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
                const credRes = await fetch("/api/admin/update-user-credentials", {
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
            const { newEmail, newPassword, ...firestoreFields } = editData;
            const effectiveEmail = newEmail.trim() || editingTeacher.email;
            const update = { ...firestoreFields, email: effectiveEmail, name: `${editData.firstName} ${editData.lastName}` };
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

    // ── Create Teacher ─────────────────────────────────────────────────────
    const onCreateTeacher = async (data: TeacherForm) => {
        setCreating(true);
        setFormError(null);
        if (selectedSubjects.length === 0) {
            setFormError("Please select at least one subject.");
            setCreating(false); return;
        }
        const appName = `secondary_${Date.now()}`;
        let secondaryApp: any = null;
        try {
            secondaryApp = initializeApp(firebaseConfig, appName);
            const secondaryAuth = getAuth(secondaryApp);
            const cred = await createUserWithEmailAndPassword(secondaryAuth, data.email, data.password);
            const uid = cred.user.uid;
            const teacherDoc = {
                uid, firstName: data.firstName, lastName: data.lastName,
                email: data.email, phone: data.phone,
                subjects: selectedSubjects, qualification: data.qualification || "",
                role: "teacher",
                assignment: emptyAssignment(),
                createdAt: serverTimestamp(),
            };
            await setDoc(doc(db, "teachers", uid), teacherDoc);
            await setDoc(doc(db, "users", uid), { ...teacherDoc, name: `${data.firstName} ${data.lastName}` });
            setCreatedInfo({ name: `${data.firstName} ${data.lastName}`, email: data.email, password: data.password });
            reset(); setSelectedSubjects([]); setShowForm(false);
        } catch (err: any) {
            setFormError(err.code === "auth/email-already-in-use"
                ? "A teacher with this email already exists."
                : "Failed to create account. Ensure Email/Password sign-in is enabled in Firebase.");
        } finally {
            if (secondaryApp) await deleteApp(secondaryApp);
            setCreating(false);
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Delete teacher ${name}? This will also remove their login access.`)) return;

        try {
            // First, delete from Firebase Auth via Admin API
            const res = await fetch("/api/admin/delete-user", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ uid: id })
            });

            const data = await res.json();
            if (!res.ok) {
                console.error("Auth deletion failed:", data.error);
                alert(`Warning: Could not delete from Auth: ${data.error}`);
            }

            // Then delete from Firestore
            await deleteDoc(doc(db, "teachers", id));
            await deleteDoc(doc(db, "users", id));
        } catch (error) {
            console.error("Error deleting teacher:", error);
            alert("Failed to delete the teacher fully.");
        }
    };

    // ── Assignment helpers ────────────────────────────────────────────────
    const startAssign = (teacher: Teacher) => {
        setAssigningTeacher(teacher);
        // Migrate old flat format if needed
        const a = teacher.assignment as any;
        if (a && !a.classSections && a.classes) {
            const cs: ClassSectionMap = {};
            (a.classes || []).forEach((c: string) => { cs[c] = a.sections || []; });
            setAssignment({ classSections: cs, subjects: a.subjects || [], streams: a.streams || [] });
        } else {
            setAssignment(a && a.classSections ? a : emptyAssignment());
        }
    };

    const toggleSection = (cls: string, sec: string) => {
        setAssignment(prev => {
            const current = prev.classSections[cls] || [];
            const updated = current.includes(sec) ? current.filter(s => s !== sec) : [...current, sec];
            const newMap = { ...prev.classSections };
            if (updated.length === 0) delete newMap[cls]; else newMap[cls] = updated;
            return { ...prev, classSections: newMap };
        });
    };

    const toggleClass = (cls: string) => {
        setAssignment(prev => {
            const newMap = { ...prev.classSections };
            if (newMap[cls]) delete newMap[cls]; else newMap[cls] = [];
            return { ...prev, classSections: newMap };
        });
    };

    const toggleSubject = (s: string) =>
        setAssignment(prev => ({
            ...prev, subjects: prev.subjects.includes(s)
                ? prev.subjects.filter(x => x !== s) : [...prev.subjects, s]
        }));

    const toggleStream = (s: string) =>
        setAssignment(prev => ({
            ...prev, streams: prev.streams.includes(s)
                ? prev.streams.filter(x => x !== s) : [...prev.streams, s]
        }));

    const saveAssignment = async () => {
        if (!assigningTeacher) return;
        setSavingAssign(true);
        await updateDoc(doc(db, "teachers", assigningTeacher.id), { assignment });
        await updateDoc(doc(db, "users", assigningTeacher.id), { assignment });
        setSavingAssign(false);
        setAssigningTeacher(null);
    };

    const hasSeniorClass = Object.keys(assignment.classSections).some(c => SENIOR_CLASSES.includes(c));
    const assignedClassCount = Object.keys(assignment.classSections).length;
    const assignedSectionCount = Object.values(assignment.classSections).reduce((a, s) => a + s.length, 0);

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
                        <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">Manage Teachers</h1>
                        <p className="text-white/40 text-sm mt-1">{teachers.length} teacher{teachers.length !== 1 ? "s" : ""} registered</p>
                    </div>
                    <div className="flex gap-3">
                        <Link href="/admin/teachers/import"
                            className="px-4 py-2.5 rounded-xl border border-white/20 text-white text-sm font-semibold hover:bg-white/10 transition-colors">
                            Bulk Import
                        </Link>
                        <button onClick={() => { setShowForm(true); setCreatedInfo(null); setFormError(null); }}
                            className="flex items-center gap-2 px-5 py-2.5 bg-gold hover:bg-gold/90 text-navy rounded-xl font-semibold text-sm transition-all">
                            <Plus className="w-4 h-4" /> Add Teacher
                        </button>
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
                                        <div className="w-11 h-11 rounded-xl bg-navy/10 flex items-center justify-center font-bold text-navy text-base shrink-0">
                                            {(teacher.firstName || "T").charAt(0).toUpperCase()}
                                        </div>
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

                                {/* Assignment chips */}
                                <div className="flex flex-wrap gap-1.5 mb-4 min-h-[24px]">
                                    {classCount > 0 ? (
                                        <>
                                            <span className="text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{classCount} class{classCount > 1 ? "es" : ""}</span>
                                            {sectionCount > 0 && <span className="text-[11px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">{sectionCount} section{sectionCount > 1 ? "s" : ""}</span>}
                                            {(a?.subjects || []).slice(0, 2).map((s: string) => (
                                                <span key={s} className="text-[11px] bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">{s}</span>
                                            ))}
                                        </>
                                    ) : (
                                        <span className="text-[11px] text-gray-300 italic">No classes assigned yet</span>
                                    )}
                                </div>

                                <div className="flex gap-2 pt-3 border-t border-gray-50">
                                    <button onClick={() => startAssign(teacher)}
                                        className="flex-1 py-2 rounded-xl text-xs font-semibold bg-navy text-white hover:bg-navy/90 flex items-center justify-center gap-1.5">
                                        <Pencil className="w-3.5 h-3.5" /> Assign
                                    </button>
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

            {/* ── Assignment Modal ─────────────────────────────────────────── */}
            {assigningTeacher && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setAssigningTeacher(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="gradient-navy px-6 py-5 flex items-center justify-between shrink-0">
                            <div>
                                <h2 className="font-bold text-white text-lg">Assign — {assigningTeacher.firstName} {assigningTeacher.lastName}</h2>
                                <p className="text-white/50 text-xs mt-0.5">Select classes, sections, and subjects</p>
                            </div>
                            <button onClick={() => setAssigningTeacher(null)} className="text-white/50 hover:text-white"><X className="w-5 h-5" /></button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-7">
                            {/* Stats */}
                            {(assignedClassCount > 0 || assignment.subjects.length > 0) && (
                                <div className="flex gap-3 flex-wrap">
                                    {assignedClassCount > 0 && <span className="text-xs bg-blue-50 text-blue-700 border border-blue-100 px-3 py-1 rounded-full font-semibold">{assignedClassCount} classe{assignedClassCount > 1 ? "s" : ""} · {assignedSectionCount} section{assignedSectionCount !== 1 ? "s" : ""}</span>}
                                    {assignment.subjects.length > 0 && <span className="text-xs bg-purple-50 text-purple-700 border border-purple-100 px-3 py-1 rounded-full font-semibold">{assignment.subjects.length} subject{assignment.subjects.length !== 1 ? "s" : ""}</span>}
                                </div>
                            )}

                            {/* Classes & Sections */}
                            <div>
                                <p className="text-sm font-bold text-navy mb-3 flex items-center gap-2">
                                    <span className="text-base">📚</span> Classes & Sections
                                    <span className="text-xs text-gray-400 font-normal">(click class to add, then pick sections)</span>
                                </p>
                                <div className="space-y-3">
                                    {CLASSES.map(cls => {
                                        const isClassSelected = !!assignment.classSections[cls];
                                        const selectedSections = assignment.classSections[cls] || [];
                                        return (
                                            <div key={cls} className={`rounded-xl border transition-all ${isClassSelected ? "border-blue-200 bg-blue-50" : "border-gray-100 bg-gray-50"}`}>
                                                <button type="button" onClick={() => toggleClass(cls)}
                                                    className={`w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold rounded-xl transition-all ${isClassSelected ? "text-blue-700" : "text-gray-500 hover:text-gray-700"}`}>
                                                    <span className="flex items-center gap-2">
                                                        {isClassSelected && <span className="w-4 h-4 rounded-full bg-blue-500 text-white text-[10px] flex items-center justify-center">✓</span>}
                                                        {cls}
                                                    </span>
                                                    {isClassSelected && selectedSections.length > 0 && (
                                                        <span className="text-[11px] text-blue-500">Sec: {selectedSections.join(", ")}</span>
                                                    )}
                                                </button>
                                                {isClassSelected && (
                                                    <div className="flex gap-2 px-4 pb-3">
                                                        {SECTIONS.map(sec => (
                                                            <button key={sec} type="button" onClick={() => toggleSection(cls, sec)}
                                                                className={`w-9 h-9 rounded-lg text-xs font-bold border transition-all ${selectedSections.includes(sec) ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-400 border-gray-200 hover:border-blue-300"}`}>
                                                                {sec}
                                                            </button>
                                                        ))}
                                                        <span className="self-center text-xs text-gray-400 ml-1">
                                                            {selectedSections.length === 0 ? "Select sections →" : `${selectedSections.length} selected`}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Subjects */}
                            <div>
                                <p className="text-sm font-bold text-navy mb-3">📖 Subjects Taught</p>
                                <div className="flex flex-wrap gap-2">
                                    {SUBJECTS.map(s => (
                                        <button key={s} type="button" onClick={() => toggleSubject(s)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${assignment.subjects.includes(s) ? "bg-purple-50 border-purple-200 text-purple-700" : "bg-gray-50 border-gray-200 text-gray-400 hover:border-gray-300"}`}>
                                            {assignment.subjects.includes(s) && "✓ "}{s}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Stream — only show if Class 11 or 12 selected */}
                            {hasSeniorClass && (
                                <div>
                                    <p className="text-sm font-bold text-navy mb-2">🎓 Stream <span className="text-xs text-amber-600 font-normal">(for Class 11/12)</span></p>
                                    <div className="flex flex-wrap gap-2">
                                        {STREAMS.map(s => (
                                            <button key={s} type="button" onClick={() => toggleStream(s)}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${assignment.streams.includes(s) ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-gray-50 border-gray-200 text-gray-400 hover:border-gray-300"}`}>
                                                {assignment.streams.includes(s) && "✓ "}{s}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end bg-gray-50 shrink-0">
                            <button onClick={() => setAssigningTeacher(null)} className="px-5 py-2.5 rounded-xl border text-sm text-gray-500">Cancel</button>
                            <button onClick={saveAssignment} disabled={savingAssign}
                                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-navy text-white text-sm font-semibold disabled:opacity-60">
                                {savingAssign ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                {savingAssign ? "Saving..." : "Save Assignment"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Edit Teacher Modal ── */}
            {editingTeacher && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setEditingTeacher(null)}>
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
                        <div className="flex border-b border-gray-100 shrink-0 px-6 overflow-x-auto">
                            {(["basic", "personal", "documents", "bank", "credentials"] as const).map(tab => (
                                <button key={tab} onClick={() => setEditTab(tab)}
                                    className={`px-4 py-3 text-xs font-semibold capitalize border-b-2 transition-colors -mb-px whitespace-nowrap ${editTab === tab
                                        ? tab === "credentials" ? "border-amber-500 text-amber-600" : "border-navy text-navy"
                                        : "border-transparent text-gray-400 hover:text-gray-600"
                                        }`}>{tab === "credentials" ? "🔑 Credentials" : tab}</button>
                            ))}
                        </div>
                        {/* Body */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-4">
                            {editTab === "basic" && (<>
                                <div className="grid grid-cols-2 gap-4">
                                    <FormField label="First Name"><input value={editData.firstName} onChange={e => setEditData(p => ({ ...p, firstName: e.target.value }))} className={inputCls} placeholder="First name" /></FormField>
                                    <FormField label="Last Name"><input value={editData.lastName} onChange={e => setEditData(p => ({ ...p, lastName: e.target.value }))} className={inputCls} placeholder="Last name" /></FormField>
                                    <FormField label="Phone"><input value={editData.phone} onChange={e => setEditData(p => ({ ...p, phone: e.target.value }))} className={inputCls} placeholder="Mobile" /></FormField>
                                    <FormField label="Qualification"><input value={editData.qualification} onChange={e => setEditData(p => ({ ...p, qualification: e.target.value }))} className={inputCls} placeholder="e.g. B.Ed" /></FormField>
                                    <FormField label="Designation"><input value={editData.designation} onChange={e => setEditData(p => ({ ...p, designation: e.target.value }))} className={inputCls} placeholder="e.g. PGT, TGT" /></FormField>
                                    <FormField label="Joining Date"><input type="date" value={editData.joiningDate} onChange={e => setEditData(p => ({ ...p, joiningDate: e.target.value }))} className={inputCls} /></FormField>
                                    <FormField label="Basic Salary"><input value={editData.basicSalary} onChange={e => setEditData(p => ({ ...p, basicSalary: e.target.value }))} className={inputCls} placeholder="e.g. 25000" /></FormField>
                                </div>
                                <FormField label="Subjects Taught">
                                    <div className="flex flex-wrap gap-2">
                                        {SUBJECTS.map(s => (
                                            <button key={s} type="button"
                                                onClick={() => setEditData(p => ({ ...p, subjects: p.subjects.includes(s) ? p.subjects.filter(x => x !== s) : [...p.subjects, s] }))}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${editData.subjects.includes(s) ? "bg-purple-50 border-purple-200 text-purple-700" : "bg-gray-50 border-gray-200 text-gray-400 hover:border-gray-300"
                                                    }`}>
                                                {editData.subjects.includes(s) && "✓ "}{s}
                                            </button>
                                        ))}
                                    </div>
                                    {editData.subjects.length > 0 && <p className="text-xs text-purple-600 mt-1">{editData.subjects.length} selected</p>}
                                </FormField>
                            </>)}
                            {editTab === "personal" && (
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
                            )}
                            {editTab === "documents" && (
                                <div className="space-y-5">
                                    <div className="grid grid-cols-2 gap-4">
                                        <FormField label="PAN Number"><input value={editData.panNumber} onChange={e => setEditData(p => ({ ...p, panNumber: e.target.value }))} className={inputCls} placeholder="ABCDE1234F" /></FormField>
                                        <FormField label="Aadhaar Number"><input value={editData.aadhaarNumber} onChange={e => setEditData(p => ({ ...p, aadhaarNumber: e.target.value }))} className={inputCls} placeholder="12 digits" /></FormField>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        {/* PAN Card Upload */}
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">PAN Card Upload</label>
                                            {editData.panCardUrl ? (
                                                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl">
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-xs font-medium text-green-800 truncate">{editData.panCardName || "PAN Card"}</p>
                                                        <p className="text-[10px] text-green-600 mt-0.5">Uploaded ✓</p>
                                                    </div>
                                                    <div className="flex gap-1 shrink-0">
                                                        <FileViewerTrigger url={editData.panCardUrl} fileName={editData.panCardName || "pan-card"} label="View" className="text-xs" />
                                                        <button type="button" onClick={() => setEditData(p => ({ ...p, panCardUrl: "", panCardName: "" }))} className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50">Remove</button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <CloudinaryUpload
                                                    folder="admin-docs"
                                                    subFolder="staff-docs"
                                                    onUpload={(url, _id, name) => setEditData(p => ({ ...p, panCardUrl: url, panCardName: name }))}
                                                    acceptedFileTypes="all"
                                                    maxSizeMB={2}
                                                />
                                            )}
                                        </div>
                                        {/* Aadhaar Upload */}
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Aadhaar Upload</label>
                                            {editData.aadhaarUrl ? (
                                                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl">
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-xs font-medium text-green-800 truncate">{editData.aadhaarName || "Aadhaar"}</p>
                                                        <p className="text-[10px] text-green-600 mt-0.5">Uploaded ✓</p>
                                                    </div>
                                                    <div className="flex gap-1 shrink-0">
                                                        <FileViewerTrigger url={editData.aadhaarUrl} fileName={editData.aadhaarName || "aadhaar"} label="View" className="text-xs" />
                                                        <button type="button" onClick={() => setEditData(p => ({ ...p, aadhaarUrl: "", aadhaarName: "" }))} className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50">Remove</button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <CloudinaryUpload
                                                    folder="admin-docs"
                                                    subFolder="staff-docs"
                                                    onUpload={(url, _id, name) => setEditData(p => ({ ...p, aadhaarUrl: url, aadhaarName: name }))}
                                                    acceptedFileTypes="all"
                                                    maxSizeMB={2}
                                                />
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                            {editTab === "bank" && (
                                <div className="grid grid-cols-2 gap-4">
                                    <FormField label="Bank Name"><input value={editData.bankName} onChange={e => setEditData(p => ({ ...p, bankName: e.target.value }))} className={inputCls} placeholder="e.g. SBI" /></FormField>
                                    <FormField label="Account Number"><input value={editData.bankAccountNumber} onChange={e => setEditData(p => ({ ...p, bankAccountNumber: e.target.value }))} className={inputCls} /></FormField>
                                    <FormField label="IFSC Code"><input value={editData.ifscCode} onChange={e => setEditData(p => ({ ...p, ifscCode: e.target.value }))} className={inputCls} /></FormField>
                                    <FormField label="UAN Number"><input value={editData.uanNumber} onChange={e => setEditData(p => ({ ...p, uanNumber: e.target.value }))} className={inputCls} /></FormField>
                                    <FormField label="EPF Number"><input value={editData.epfNumber} onChange={e => setEditData(p => ({ ...p, epfNumber: e.target.value }))} className={inputCls} /></FormField>
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
            )}
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
