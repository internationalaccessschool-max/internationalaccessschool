"use client";

import { useEffect, useState, useMemo } from "react";
import { collection, query, orderBy, onSnapshot, doc, updateDoc, serverTimestamp, deleteDoc } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
    FileText, Clock, CheckCircle2, XCircle, Search, ChevronDown,
    Loader2, CalendarDays, User, GraduationCap, X, Trash2
} from "lucide-react";
import toast from "react-hot-toast";

type LeaveStatus = "pending" | "approved" | "rejected";
type ApplicantType = "all" | "teacher" | "student";

interface LeaveApplication {
    id: string;
    applicantId: string;
    applicantName: string;
    applicantType: "teacher" | "student";
    class?: string;
    section?: string;
    admissionNumber?: string;
    designation?: string;
    leaveType: string;
    fromDate: string;
    toDate: string;
    totalDays: number;
    reason: string;
    status: LeaveStatus;
    adminNote?: string;
    submittedAt: any;
    reviewedAt?: any;
    reviewedBy?: string;
}

const STATUS_CONFIG: Record<LeaveStatus, { label: string; icon: any; color: string; bg: string; border: string }> = {
    pending:  { label: "Pending",  icon: Clock,        color: "text-amber-600",   bg: "bg-amber-50",   border: "border-amber-200"   },
    approved: { label: "Approved", icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
    rejected: { label: "Rejected", icon: XCircle,      color: "text-red-600",     bg: "bg-red-50",     border: "border-red-200"     },
};

export default function AdminLeavePage() {
    const [adminName, setAdminName] = useState("");
    const [applications, setApplications] = useState<LeaveApplication[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<LeaveStatus | "all">("all");
    const [typeFilter, setTypeFilter] = useState<ApplicantType>("all");
    const [reviewModal, setReviewModal] = useState<LeaveApplication | null>(null);
    const [adminNote, setAdminNote] = useState("");
    const [reviewing, setReviewing] = useState(false);

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, user => {
            if (user) setAdminName(user.displayName || user.email || "Admin");
        });
        return () => unsub();
    }, []);

    useEffect(() => {
        const q = query(collection(db, "leaveApplications"), orderBy("submittedAt", "desc"));
        const unsub = onSnapshot(q, snap => {
            setApplications(snap.docs.map(d => ({ id: d.id, ...d.data() } as LeaveApplication)));
            setLoading(false);
        }, () => setLoading(false));
        return () => unsub();
    }, []);

    const filtered = useMemo(() => {
        return applications.filter(a => {
            const matchStatus = statusFilter === "all" || a.status === statusFilter;
            const matchType   = typeFilter === "all"   || a.applicantType === typeFilter;
            const q = search.toLowerCase();
            const matchSearch = !q
                || a.applicantName.toLowerCase().includes(q)
                || a.leaveType.toLowerCase().includes(q)
                || (a.class || "").toLowerCase().includes(q)
                || (a.admissionNumber || "").toLowerCase().includes(q);
            return matchStatus && matchType && matchSearch;
        });
    }, [applications, statusFilter, typeFilter, search]);

    const counts = useMemo(() => ({
        all: applications.length,
        pending:  applications.filter(a => a.status === "pending").length,
        approved: applications.filter(a => a.status === "approved").length,
        rejected: applications.filter(a => a.status === "rejected").length,
        teachers: applications.filter(a => a.applicantType === "teacher").length,
        students: applications.filter(a => a.applicantType === "student").length,
    }), [applications]);

    const openReview = (app: LeaveApplication) => {
        setReviewModal(app);
        setAdminNote(app.adminNote || "");
    };

    const handleDelete = async (app: LeaveApplication) => {
        if (!confirm(`Delete leave application from ${app.applicantName}? This will remove it from their portal too.`)) return;
        try {
            await deleteDoc(doc(db, "leaveApplications", app.id));
            toast.success("Application deleted");
        } catch {
            toast.error("Failed to delete. Try again.");
        }
    };

    const handleDecision = async (decision: "approved" | "rejected") => {
        if (!reviewModal) return;
        setReviewing(true);
        try {
            await updateDoc(doc(db, "leaveApplications", reviewModal.id), {
                status: decision,
                adminNote: adminNote.trim(),
                reviewedAt: serverTimestamp(),
                reviewedBy: adminName,
            });
            toast.success(`Application ${decision === "approved" ? "approved" : "rejected"}`);
            setReviewModal(null);
        } catch {
            toast.error("Failed to update. Try again.");
        } finally {
            setReviewing(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="rounded-2xl bg-gradient-to-br from-navy to-navy-light p-6 md:p-8 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.2) 0%, transparent 50%)` }} />
                <div className="relative z-10">
                    <p className="text-white/50 text-sm font-medium">Admin Panel</p>
                    <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">Leave Applications</h1>
                    <p className="text-white/40 text-sm mt-2">Review and manage leave requests from teachers and students.</p>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                    { label: "Total",    count: counts.all,      color: "text-navy",         bg: "bg-navy/5"     },
                    { label: "Pending",  count: counts.pending,  color: "text-amber-600",    bg: "bg-amber-50"   },
                    { label: "Approved", count: counts.approved, color: "text-emerald-600",  bg: "bg-emerald-50" },
                    { label: "Rejected", count: counts.rejected, color: "text-red-600",      bg: "bg-red-50"     },
                    { label: "Teachers", count: counts.teachers, color: "text-blue-600",     bg: "bg-blue-50"    },
                    { label: "Students", count: counts.students, color: "text-purple-600",   bg: "bg-purple-50"  },
                ].map(s => (
                    <div key={s.label} className={`${s.bg} rounded-2xl p-3 text-center border border-gray-100`}>
                        <div className={`text-xl font-extrabold ${s.color}`}>{s.count}</div>
                        <div className="text-[10px] text-gray-500 mt-0.5 font-medium">{s.label}</div>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, class, type…"
                        className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-navy bg-white" />
                </div>
                {/* Status filter */}
                <div className="flex rounded-xl border border-gray-200 overflow-hidden">
                    {(["all", "pending", "approved", "rejected"] as const).map(s => (
                        <button key={s} onClick={() => setStatusFilter(s)}
                            className={`px-3 py-2 text-xs font-semibold capitalize transition-colors ${statusFilter === s ? "bg-navy text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
                            {s === "all" ? "All Status" : s}
                        </button>
                    ))}
                </div>
                {/* Type filter */}
                <div className="flex rounded-xl border border-gray-200 overflow-hidden">
                    {(["all", "teacher", "student"] as const).map(t => (
                        <button key={t} onClick={() => setTypeFilter(t)}
                            className={`px-3 py-2 text-xs font-semibold capitalize transition-colors ${typeFilter === t ? "bg-navy text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
                            {t === "all" ? "All" : t + "s"}
                        </button>
                    ))}
                </div>
            </div>

            {/* Applications list */}
            {loading ? (
                <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-navy" /></div>
            ) : filtered.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-gray-200 py-16 text-center">
                    <FileText className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-gray-400">No applications found</p>
                </div>
            ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="divide-y divide-gray-50">
                        {filtered.map(app => {
                            const cfg = STATUS_CONFIG[app.status];
                            const StatusIcon = cfg.icon;
                            return (
                                <div key={app.id} className="p-5 hover:bg-gray-50/50 transition-colors">
                                    <div className="flex items-start gap-4 flex-wrap">
                                        {/* Avatar */}
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${app.applicantType === "teacher" ? "bg-blue-50" : "bg-purple-50"}`}>
                                            {app.applicantType === "teacher"
                                                ? <User className="w-5 h-5 text-blue-500" />
                                                : <GraduationCap className="w-5 h-5 text-purple-500" />}
                                        </div>

                                        {/* Info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-bold text-navy">{app.applicantName}</span>
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${app.applicantType === "teacher" ? "bg-blue-50 text-blue-600" : "bg-purple-50 text-purple-600"}`}>
                                                    {app.applicantType}
                                                </span>
                                                {app.class && <span className="text-xs text-gray-400">Class {app.class}{app.section ? `-${app.section}` : ""}</span>}
                                            </div>
                                            <div className="flex items-center gap-3 mt-1 flex-wrap">
                                                <span className="text-sm font-semibold text-gray-700">{app.leaveType}</span>
                                                <span className="flex items-center gap-1 text-xs text-gray-500">
                                                    <CalendarDays className="w-3.5 h-3.5" />
                                                    {app.fromDate === app.toDate ? app.fromDate : `${app.fromDate} → ${app.toDate}`}
                                                    <span className="font-semibold text-navy ml-1">({app.totalDays}d)</span>
                                                </span>
                                            </div>
                                            <p className="text-sm text-gray-500 mt-1.5 line-clamp-2">{app.reason}</p>
                                            {app.adminNote && (
                                                <p className={`text-xs mt-1.5 px-2 py-1 rounded-lg ${cfg.bg} ${cfg.color} font-medium`}>
                                                    Note: {app.adminNote}
                                                </p>
                                            )}
                                        </div>

                                        {/* Right side */}
                                        <div className="flex flex-col items-end gap-2 shrink-0">
                                            <span className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                                                <StatusIcon className="w-3.5 h-3.5" /> {cfg.label}
                                            </span>
                                            <p className="text-[10px] text-gray-400">
                                                {app.submittedAt?.toDate?.()?.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) || "—"}
                                            </p>
                                            <div className="flex items-center gap-1.5">
                                                {app.status === "pending" ? (
                                                    <button onClick={() => openReview(app)}
                                                        className="px-3 py-1.5 bg-navy text-white text-xs font-semibold rounded-lg hover:bg-navy/90 transition-colors">
                                                        Review →
                                                    </button>
                                                ) : (
                                                    <button onClick={() => openReview(app)}
                                                        className="px-3 py-1.5 border border-gray-200 text-gray-500 text-xs font-semibold rounded-lg hover:bg-gray-50 transition-colors">
                                                        Edit Decision
                                                    </button>
                                                )}
                                                <button onClick={() => handleDelete(app)}
                                                    className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                                                    title="Delete application">
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Review Modal */}
            {reviewModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
                        <div className="flex items-center justify-between p-5 border-b border-gray-100">
                            <h3 className="font-bold text-navy text-lg">Review Leave Application</h3>
                            <button onClick={() => setReviewModal(null)}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
                        </div>
                        <div className="p-5 space-y-4">
                            {/* Applicant summary */}
                            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="font-bold text-navy">{reviewModal.applicantName}</span>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${reviewModal.applicantType === "teacher" ? "bg-blue-50 text-blue-600" : "bg-purple-50 text-purple-600"}`}>
                                        {reviewModal.applicantType}
                                    </span>
                                </div>
                                {reviewModal.class && <p className="text-xs text-gray-500">Class {reviewModal.class}{reviewModal.section ? `-${reviewModal.section}` : ""}</p>}
                                <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 mt-2">
                                    <div><span className="text-gray-400">Leave Type:</span> <span className="font-semibold">{reviewModal.leaveType}</span></div>
                                    <div><span className="text-gray-400">Duration:</span> <span className="font-semibold">{reviewModal.totalDays} day{reviewModal.totalDays !== 1 ? "s" : ""}</span></div>
                                    <div><span className="text-gray-400">From:</span> <span className="font-semibold">{reviewModal.fromDate}</span></div>
                                    <div><span className="text-gray-400">To:</span> <span className="font-semibold">{reviewModal.toDate}</span></div>
                                </div>
                                <div className="mt-2">
                                    <p className="text-xs text-gray-400 mb-1">Reason:</p>
                                    <p className="text-sm text-gray-700">{reviewModal.reason}</p>
                                </div>
                            </div>
                            {/* Admin Note */}
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Admin Note (Optional)</label>
                                <textarea value={adminNote} onChange={e => setAdminNote(e.target.value)} rows={3}
                                    placeholder="Add a note for the applicant (reason for rejection, instructions, etc.)…"
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-navy resize-none" />
                            </div>
                        </div>
                        <div className="flex gap-3 p-5 border-t border-gray-100">
                            <button onClick={() => setReviewModal(null)} className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
                            <button onClick={() => handleDecision("rejected")} disabled={reviewing}
                                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 disabled:opacity-60 flex items-center justify-center gap-2">
                                {reviewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />} Reject
                            </button>
                            <button onClick={() => handleDecision("approved")} disabled={reviewing}
                                className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60 flex items-center justify-center gap-2">
                                {reviewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Approve
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
