"use client";

import { authFetch } from "@/lib/auth-fetch";

import { useState, useEffect } from "react";
import {
    Eye, Check, X, FileText, User, Phone, Mail,
    Trash2, Loader2, Clock, CheckCircle2, XCircle, Search,
    Save, Download
} from "lucide-react";
import {
    collection, query, orderBy, onSnapshot, doc,
    deleteDoc, setDoc, serverTimestamp, updateDoc
} from "firebase/firestore";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { db, firebaseConfig } from "@/lib/firebase";
import { format } from "date-fns";

interface Application {
    id: string;
    name: string;
    mobile: string;
    email: string;
    photoUrl?: string;
    cvUrl?: string;
    status: "Pending" | "Accepted" | "Rejected";
    createdAt: any;
}

// Full staff details collected on acceptance
interface StaffDetails {
    designation: string; subjects: string[]; qualification: string;
    dob: string; gender: string; joiningDate: string;
    fatherName: string; permanentAddress: string;
    bloodGroup: string; socialCategory: string;
    panNumber: string; aadhaarNumber: string;
    bankName: string; bankAccountNumber: string; ifscCode: string;
    basicSalary: string; password: string;
}

const STATUS_STYLES: Record<string, string> = {
    Pending: "bg-amber-50 text-amber-700 border-amber-100",
    Accepted: "bg-emerald-50 text-emerald-700 border-emerald-100",
    Rejected: "bg-red-50 text-red-600 border-red-100",
};
const STATUS_ICONS: Record<string, any> = { Pending: Clock, Accepted: CheckCircle2, Rejected: XCircle };

async function sendEmail(to: string, subject: string, html: string) {
    try {
        await authFetch("/api/send-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ to, subject, html }),
        });
    } catch (e) {
        console.error("Email failed:", e);
    }
}

const EMPTY_STAFF: StaffDetails = {
    designation: "", subjects: [], qualification: "", dob: "", gender: "",
    joiningDate: "", fatherName: "", permanentAddress: "", bloodGroup: "",
    socialCategory: "", panNumber: "", aadhaarNumber: "", bankName: "",
    bankAccountNumber: "", ifscCode: "", basicSalary: "", password: "",
};

const GENDER_OPTIONS = ["Male", "Female", "Other"];
const BLOOD_OPTIONS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const CATEGORY_OPTIONS = ["General", "OBC", "SC", "ST", "Other"];
const SUBJECTS = ["Mathematics", "Physics", "Chemistry", "Biology", "English",
    "Hindi", "History", "Geography", "Computer Science", "Economics",
    "Accountancy", "Business Studies", "Physical Education", "Art", "Other"];

export default function AdminApplicationsPage() {
    const [applications, setApplications] = useState<Application[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [filter, setFilter] = useState<"All" | "Pending" | "Accepted" | "Rejected">("All");
    const [search, setSearch] = useState("");

    // Detail view
    const [selectedApp, setSelectedApp] = useState<Application | null>(null);

    // Accept flow — staff details modal
    const [acceptingApp, setAcceptingApp] = useState<Application | null>(null);
    const [staffDetails, setStaffDetails] = useState<StaffDetails>(EMPTY_STAFF);
    const [staffError, setStaffError] = useState<string | null>(null);

    useEffect(() => {
        const q = query(collection(db, "job_applications"), orderBy("createdAt", "desc"));
        const unsub = onSnapshot(q, snap => {
            setApplications(snap.docs.map(d => ({ id: d.id, ...d.data() } as Application)));
            setLoading(false);
        });
        return () => unsub();
    }, []);

    /* ── Accept: open staff details form ── */
    const openAcceptForm = (app: Application) => {
        setAcceptingApp(app);
        setStaffDetails({ ...EMPTY_STAFF });
        setStaffError(null);
    };

    /* ── Accept: submit staff details ── */
    const handleAccept = async () => {
        if (!acceptingApp) return;
        if (!staffDetails.designation || !staffDetails.password) {
            setStaffError("Designation and Login Password are required.");
            return;
        }

        setActionLoading(acceptingApp.id);
        const appName = `secondary_${Date.now()}`;
        let secondaryApp: any = null;
        try {
            // Create Firebase Auth for the teacher
            secondaryApp = initializeApp(firebaseConfig, appName);
            const secondaryAuth = getAuth(secondaryApp);
            const cred = await createUserWithEmailAndPassword(secondaryAuth, acceptingApp.email, staffDetails.password);
            const uid = cred.user.uid;

            // Save to users + staff + teachers collections
            const fullRecord = {
                uid,
                name: acceptingApp.name,
                email: acceptingApp.email,
                mobile: acceptingApp.mobile,
                photoUrl: acceptingApp.photoUrl || "",
                cvUrl: acceptingApp.cvUrl || "",
                role: "teacher",
                status: "Active",
                ...staffDetails,
                subjects: staffDetails.subjects,
                password: "", // don't store password in DB
                createdAt: serverTimestamp(),
            };

            await setDoc(doc(db, "users", uid), fullRecord);
            await setDoc(doc(db, "teachers", uid), { ...fullRecord, assignment: { classes: [], sections: [], subjects: [], streams: [] } });
            await updateDoc(doc(db, "job_applications", acceptingApp.id), { status: "Accepted" });

            // Send acceptance email
            await sendEmail(
                acceptingApp.email,
                "🎉 Congratulations! Your Application — International Access School",
                `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
                    <div style="background:#1a2b4a;padding:28px;border-radius:12px 12px 0 0;text-align:center">
                        <h1 style="color:#c8a951;margin:0;font-size:22px">International Access School</h1>
                    </div>
                    <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:28px">
                        <h2 style="color:#1a2b4a">Dear ${acceptingApp.name},</h2>
                        <p style="color:#4b5563;line-height:1.7">
                            We are pleased to inform you that your application has been <strong style="color:#059669">accepted</strong>. 
                            You have been added to our staff as <strong>${staffDetails.designation}</strong>.
                        </p>
                        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:20px 0">
                            <p style="margin:0 0 8px;font-weight:bold;color:#065f46">Your Login Credentials:</p>
                            <p style="margin:4px 0;color:#065f46">📧 Email: <strong>${acceptingApp.email}</strong></p>
                            <p style="margin:4px 0;color:#065f46">🔑 Password: <strong>${staffDetails.password}</strong></p>
                            <p style="margin:8px 0 0;color:#065f46;font-size:13px">Login at: <strong>your school website → Login → Teacher</strong></p>
                        </div>
                        <p style="color:#4b5563">Welcome to the IAS family! We look forward to working with you.</p>
                        <p style="color:#9ca3af;font-size:13px;border-top:1px solid #e5e7eb;padding-top:16px;margin-top:24px">
                            International Access School | Shaping Global Leaders
                        </p>
                    </div>
                </div>`
            );

            setAcceptingApp(null);
            setSelectedApp(null);
        } catch (err: any) {
            if (err.code === "auth/email-already-in-use") {
                setStaffError("This email already has an account. Use a different email or check the teachers list.");
            } else {
                setStaffError("Failed to create account. Please try again.");
            }
            console.error(err);
        } finally {
            if (secondaryApp) await deleteApp(secondaryApp);
            setActionLoading(null);
        }
    };

    /* ── Reject ── */
    const handleReject = async (app: Application) => {
        if (!confirm(`Reject ${app.name}'s application and notify them by email?`)) return;
        setActionLoading(app.id);
        try {
            await updateDoc(doc(db, "job_applications", app.id), { status: "Rejected" });
            await sendEmail(
                app.email,
                "Your Application Status — International Access School",
                `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
                    <div style="background:#1a2b4a;padding:28px;border-radius:12px 12px 0 0;text-align:center">
                        <h1 style="color:#c8a951;margin:0;font-size:22px">International Access School</h1>
                    </div>
                    <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:28px">
                        <h2 style="color:#1a2b4a">Dear ${app.name},</h2>
                        <p style="color:#4b5563;line-height:1.7">Thank you for applying to International Access School. After careful consideration, we regret that we are unable to move forward with your application at this time.</p>
                        <p style="color:#4b5563">We appreciate your interest and wish you the very best in your career.</p>
                        <p style="color:#9ca3af;font-size:13px;border-top:1px solid #e5e7eb;padding-top:16px;margin-top:24px">International Access School | Shaping Global Leaders</p>
                    </div>
                </div>`
            );
            setSelectedApp(null);
        } catch (err) { console.error(err); } finally { setActionLoading(null); }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Permanently delete this application?")) return;
        await deleteDoc(doc(db, "job_applications", id));
        if (selectedApp?.id === id) setSelectedApp(null);
    };

    const filtered = applications.filter(a => {
        const matchStatus = filter === "All" || a.status === filter;
        const matchSearch = !search ||
            a.name?.toLowerCase().includes(search.toLowerCase()) ||
            a.email?.toLowerCase().includes(search.toLowerCase());
        return matchStatus && matchSearch;
    });

    const counts = {
        All: applications.length,
        Pending: applications.filter(a => a.status === "Pending").length,
        Accepted: applications.filter(a => a.status === "Accepted").length,
        Rejected: applications.filter(a => a.status === "Rejected").length,
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="rounded-2xl gradient-navy p-6 md:p-8 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.2) 0%, transparent 50%)` }} />
                <div className="relative z-10">
                    <p className="text-white/50 text-sm font-medium">Admin Console</p>
                    <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">Job Applications</h1>
                    <p className="text-white/40 text-sm mt-1">{counts.Pending} pending · {counts.Accepted} accepted · {counts.Rejected} rejected</p>
                </div>
            </div>

            {/* Filters + Search */}
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                <div className="flex gap-2 flex-wrap">
                    {(["All", "Pending", "Accepted", "Rejected"] as const).map(f => (
                        <button key={f} onClick={() => setFilter(f)}
                            className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-all ${filter === f ? "bg-navy text-white border-navy" : "bg-white text-gray-500 border-gray-200 hover:border-navy/30"}`}>
                            {f} <span className="ml-1 opacity-60">({counts[f]})</span>
                        </button>
                    ))}
                </div>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="search" placeholder="Search by name or email..." value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-9 pr-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/10 w-60" />
                </div>
            </div>

            {/* Cards Grid */}
            {loading ? (
                <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-navy" /></div>
            ) : filtered.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-20 flex flex-col items-center text-center">
                    <FileText className="w-10 h-10 text-gray-200 mb-3" />
                    <p className="text-sm font-semibold text-gray-400">No applications found</p>
                    <p className="text-xs text-gray-300 mt-1">Applications submitted at /career will appear here</p>
                </div>
            ) : (
                <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filtered.map(app => {
                        const StatusIcon = STATUS_ICONS[app.status] || Clock;
                        return (
                            <div key={app.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-xl bg-gray-100 overflow-hidden border border-gray-100 shrink-0">
                                            {app.photoUrl ? <img src={app.photoUrl} alt={app.name} className="w-full h-full object-cover" /> : <User className="w-6 h-6 m-3 text-gray-300" />}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-bold text-navy text-sm">{app.name}</p>
                                            <p className="text-xs text-gray-400">{app.createdAt?.seconds ? format(new Date(app.createdAt.seconds * 1000), "dd MMM yyyy") : "Recently"}</p>
                                        </div>
                                    </div>
                                    <span className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border shrink-0 ${STATUS_STYLES[app.status]}`}>
                                        <StatusIcon className="w-3 h-3" />{app.status}
                                    </span>
                                </div>

                                <div className="space-y-1.5 mb-4 text-xs text-gray-500">
                                    <div className="flex items-center gap-2"><Mail className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{app.email}</span></div>
                                    <div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 shrink-0" />{app.mobile}</div>
                                    {app.cvUrl && (
                                        <a href={app.cvUrl} target="_blank" rel="noopener noreferrer"
                                            className="flex items-center gap-2 text-navy hover:underline font-medium">
                                            <Download className="w-3.5 h-3.5 shrink-0" /> Download CV
                                        </a>
                                    )}
                                </div>

                                <div className="flex gap-2 pt-3 border-t border-gray-50">
                                    <button onClick={() => setSelectedApp(app)} className="flex-1 py-2 rounded-xl text-xs font-semibold border border-gray-200 text-gray-600 hover:border-navy hover:text-navy transition-colors flex items-center justify-center gap-1.5">
                                        <Eye className="w-3.5 h-3.5" /> View
                                    </button>
                                    {app.status === "Pending" && (
                                        <>
                                            <button onClick={() => openAcceptForm(app)} disabled={actionLoading === app.id}
                                                className="flex-1 py-2 rounded-xl text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-white transition-colors flex items-center justify-center gap-1 disabled:opacity-50">
                                                {actionLoading === app.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Accept
                                            </button>
                                            <button onClick={() => handleReject(app)} disabled={actionLoading === app.id}
                                                className="py-2 px-3 rounded-xl text-xs text-red-400 hover:bg-red-50 border border-gray-200 hover:border-red-100 transition-colors">
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </>
                                    )}
                                    {app.status !== "Pending" && (
                                        <button onClick={() => handleDelete(app.id)} className="py-2 px-3 rounded-xl text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* View Detail Modal */}
            {selectedApp && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setSelectedApp(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="gradient-navy p-5 flex items-center justify-between">
                            <h2 className="font-bold text-white">Application Details</h2>
                            <button onClick={() => setSelectedApp(null)} className="text-white/50 hover:text-white"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            {selectedApp.photoUrl && (
                                <img src={selectedApp.photoUrl} alt={selectedApp.name} className="w-20 h-20 rounded-xl object-cover mx-auto border-4 border-gray-100 shadow" />
                            )}
                            <div className="text-center">
                                <p className="font-bold text-navy text-lg">{selectedApp.name}</p>
                                <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${STATUS_STYLES[selectedApp.status]}`}>{selectedApp.status}</span>
                            </div>
                            <div className="space-y-2 text-sm">
                                <div className="flex items-center gap-2 text-gray-600"><Mail className="w-4 h-4 text-gray-400" />{selectedApp.email}</div>
                                <div className="flex items-center gap-2 text-gray-600"><Phone className="w-4 h-4 text-gray-400" />{selectedApp.mobile}</div>
                                {selectedApp.cvUrl && (
                                    <a href={selectedApp.cvUrl} target="_blank" rel="noopener noreferrer"
                                        className="flex items-center gap-2 text-navy font-semibold hover:underline">
                                        <FileText className="w-4 h-4" /> View / Download CV
                                    </a>
                                )}
                            </div>
                        </div>
                        {selectedApp.status === "Pending" && (
                            <div className="px-6 pb-6 flex gap-3">
                                <button onClick={() => handleReject(selectedApp)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-red-600 border border-red-100 hover:bg-red-50 transition-colors">Reject</button>
                                <button onClick={() => { setSelectedApp(null); openAcceptForm(selectedApp); }} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 text-white transition-colors flex items-center justify-center gap-2">
                                    <Check className="w-4 h-4" /> Accept & Add
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Accept → Staff Details Modal */}
            {acceptingApp && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setAcceptingApp(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="gradient-navy p-5 sticky top-0 z-10 flex items-center justify-between">
                            <div>
                                <h2 className="font-bold text-white text-lg">Add to Staff — {acceptingApp.name}</h2>
                                <p className="text-white/50 text-xs mt-0.5">Fill in the full details to create their account</p>
                            </div>
                            <button onClick={() => setAcceptingApp(null)} className="text-white/50 hover:text-white"><X className="w-5 h-5" /></button>
                        </div>

                        <div className="p-6 space-y-6">
                            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-700">
                                Pre-filled from application: <strong>{acceptingApp.name}</strong> · {acceptingApp.email} · {acceptingApp.mobile}
                            </div>

                            {/* Professional */}
                            <Section title="Professional Details">
                                <div className="grid sm:grid-cols-2 gap-4">
                                    <StaffInput label="Designation *" value={staffDetails.designation} onChange={v => setStaffDetails(p => ({ ...p, designation: v }))} placeholder="e.g. PGT, TGT, Lecturer" />
                                    <div className="sm:col-span-2">
                                        <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Subjects Taught</label>
                                        <div className="flex flex-wrap gap-2">
                                            {SUBJECTS.map(s => (
                                                <button key={s} type="button"
                                                    onClick={() => setStaffDetails(p => ({
                                                        ...p,
                                                        subjects: p.subjects.includes(s) ? p.subjects.filter(x => x !== s) : [...p.subjects, s]
                                                    }))}
                                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${staffDetails.subjects.includes(s)
                                                        ? "bg-purple-50 border-purple-200 text-purple-700"
                                                        : "bg-gray-50 border-gray-200 text-gray-400 hover:border-gray-300"
                                                        }`}>
                                                    {staffDetails.subjects.includes(s) && <span className="mr-1">✓</span>}
                                                    {s}
                                                </button>
                                            ))}
                                        </div>
                                        {staffDetails.subjects.length > 0 && (
                                            <p className="text-xs text-purple-600 mt-2 font-medium">{staffDetails.subjects.length} subject{staffDetails.subjects.length > 1 ? "s" : ""} selected</p>
                                        )}
                                    </div>
                                    <StaffInput label="Qualification" value={staffDetails.qualification} onChange={v => setStaffDetails(p => ({ ...p, qualification: v }))} placeholder="e.g. B.Ed, M.Sc" />
                                    <StaffInput label="Expected Joining Date" value={staffDetails.joiningDate} onChange={v => setStaffDetails(p => ({ ...p, joiningDate: v }))} type="date" />
                                    <StaffInput label="Basic Salary (₹)" value={staffDetails.basicSalary} onChange={v => setStaffDetails(p => ({ ...p, basicSalary: v }))} type="number" />
                                </div>
                            </Section>

                            {/* Personal */}
                            <Section title="Personal Details">
                                <div className="grid sm:grid-cols-2 gap-4">
                                    <StaffInput label="Date of Birth" value={staffDetails.dob} onChange={v => setStaffDetails(p => ({ ...p, dob: v }))} type="date" />
                                    <StaffSelect label="Gender" value={staffDetails.gender} onChange={v => setStaffDetails(p => ({ ...p, gender: v }))} options={GENDER_OPTIONS} />
                                    <StaffSelect label="Blood Group" value={staffDetails.bloodGroup} onChange={v => setStaffDetails(p => ({ ...p, bloodGroup: v }))} options={BLOOD_OPTIONS} />
                                    <StaffSelect label="Social Category" value={staffDetails.socialCategory} onChange={v => setStaffDetails(p => ({ ...p, socialCategory: v }))} options={CATEGORY_OPTIONS} />
                                    <StaffInput label="Father's Name" value={staffDetails.fatherName} onChange={v => setStaffDetails(p => ({ ...p, fatherName: v }))} />
                                    <StaffInput label="PAN Number" value={staffDetails.panNumber} onChange={v => setStaffDetails(p => ({ ...p, panNumber: v }))} placeholder="ABCDE1234F" />
                                    <StaffInput label="Aadhaar Number" value={staffDetails.aadhaarNumber} onChange={v => setStaffDetails(p => ({ ...p, aadhaarNumber: v }))} placeholder="12 digit number" />
                                    <div className="sm:col-span-2">
                                        <StaffInput label="Permanent Address" value={staffDetails.permanentAddress} onChange={v => setStaffDetails(p => ({ ...p, permanentAddress: v }))} />
                                    </div>
                                </div>
                            </Section>

                            {/* Bank */}
                            <Section title="Bank Details">
                                <div className="grid sm:grid-cols-3 gap-4">
                                    <StaffInput label="Bank Name" value={staffDetails.bankName} onChange={v => setStaffDetails(p => ({ ...p, bankName: v }))} />
                                    <StaffInput label="Account Number" value={staffDetails.bankAccountNumber} onChange={v => setStaffDetails(p => ({ ...p, bankAccountNumber: v }))} />
                                    <StaffInput label="IFSC Code" value={staffDetails.ifscCode} onChange={v => setStaffDetails(p => ({ ...p, ifscCode: v }))} />
                                </div>
                            </Section>

                            {/* Login */}
                            <Section title="Login Credentials">
                                <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-sm text-amber-700 mb-4">
                                    The teacher will use <strong>{acceptingApp.email}</strong> as their username. Set a temporary password below — it will be emailed to them.
                                </div>
                                <StaffInput label="Temporary Password *" value={staffDetails.password} onChange={v => setStaffDetails(p => ({ ...p, password: v }))} placeholder="Min 6 characters" />
                            </Section>

                            {staffError && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100">{staffError}</div>}
                        </div>

                        <div className="px-6 pb-6 flex gap-3 justify-end border-t border-gray-100 pt-4">
                            <button onClick={() => setAcceptingApp(null)} className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-500 hover:bg-gray-50">Cancel</button>
                            <button onClick={handleAccept} disabled={!!actionLoading}
                                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold disabled:opacity-60 transition-colors">
                                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                {actionLoading ? "Creating Account..." : "Accept & Create Account"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ── Helper Components ── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <h3 className="text-sm font-bold text-navy border-b border-gray-100 pb-2 mb-4">{title}</h3>
            {children}
        </div>
    );
}

function StaffInput({ label, value, onChange, type = "text", placeholder }: {
    label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
    return (
        <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">{label}</label>
            <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder || `Enter ${label.toLowerCase().replace(" *", "")}`}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/10 transition-all" />
        </div>
    );
}

function StaffSelect({ label, value, onChange, options }: {
    label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
    return (
        <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">{label}</label>
            <select value={value} onChange={e => onChange(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-navy bg-white transition-all">
                <option value="">Select {label}</option>
                {options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
        </div>
    );
}
