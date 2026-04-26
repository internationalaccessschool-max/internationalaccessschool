"use client";

import { useEffect, useState } from "react";
import { collection, addDoc, query, where, onSnapshot, serverTimestamp } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { FileText, Clock, CheckCircle2, XCircle, Plus, X, Loader2, CalendarDays, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";

const LEAVE_TYPES = ["Sick Leave", "Casual Leave", "Emergency Leave", "Personal Leave", "Other"];

type LeaveStatus = "pending" | "approved" | "rejected";

interface LeaveApplication {
    id: string;
    leaveType: string;
    fromDate: string;
    toDate: string;
    totalDays: number;
    reason: string;
    status: LeaveStatus;
    adminNote?: string;
    submittedAt: any;
    reviewedAt?: any;
}

const STATUS_CONFIG: Record<LeaveStatus, { label: string; icon: any; color: string; bg: string }> = {
    pending:  { label: "Pending",  icon: Clock,         color: "text-amber-600",  bg: "bg-amber-50 border-amber-200"  },
    approved: { label: "Approved", icon: CheckCircle2,  color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" },
    rejected: { label: "Rejected", icon: XCircle,       color: "text-red-600",    bg: "bg-red-50 border-red-200"      },
};

function daysBetween(from: string, to: string): number {
    const d1 = new Date(from), d2 = new Date(to);
    if (isNaN(d1.getTime()) || isNaN(d2.getTime()) || d2 < d1) return 0;
    return Math.floor((d2.getTime() - d1.getTime()) / 86400000) + 1;
}

export default function TeacherLeavePage() {
    const [uid, setUid] = useState<string | null>(null);
    const [userName, setUserName] = useState("");
    const [applications, setApplications] = useState<LeaveApplication[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const today = new Date().toISOString().split("T")[0];
    const [form, setForm] = useState({ leaveType: LEAVE_TYPES[0], fromDate: today, toDate: today, reason: "" });

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (user) => {
            if (!user) return;
            setUid(user.uid);
            setUserName(user.displayName || "");
        });
        return () => unsub();
    }, []);

    useEffect(() => {
        if (!uid) return;
        const q = query(
            collection(db, "leaveApplications"),
            where("applicantId", "==", uid)
        );
        const unsub = onSnapshot(q, snap => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as LeaveApplication));
            list.sort((a, b) => (b.submittedAt?.seconds ?? 0) - (a.submittedAt?.seconds ?? 0));
            setApplications(list);
            setLoading(false);
        }, (err) => { console.error("Leave fetch error:", err); setLoading(false); });
        return () => unsub();
    }, [uid]);

    const totalDays = daysBetween(form.fromDate, form.toDate);

    const handleSubmit = async () => {
        if (!uid) return;
        if (!form.reason.trim()) { toast.error("Please write a reason"); return; }
        if (totalDays <= 0) { toast.error("Invalid date range"); return; }
        setSubmitting(true);
        try {
            await addDoc(collection(db, "leaveApplications"), {
                applicantId: uid,
                applicantName: userName,
                applicantType: "teacher",
                leaveType: form.leaveType,
                fromDate: form.fromDate,
                toDate: form.toDate,
                totalDays,
                reason: form.reason.trim(),
                status: "pending",
                submittedAt: serverTimestamp(),
            });
            toast.success("Leave application submitted!");
            setShowForm(false);
            setForm({ leaveType: LEAVE_TYPES[0], fromDate: today, toDate: today, reason: "" });
        } catch {
            toast.error("Failed to submit. Try again.");
        } finally {
            setSubmitting(false);
        }
    };

    const pending  = applications.filter(a => a.status === "pending").length;
    const approved = applications.filter(a => a.status === "approved").length;
    const rejected = applications.filter(a => a.status === "rejected").length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="rounded-2xl gradient-navy p-6 md:p-8 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.2) 0%, transparent 50%)` }} />
                <div className="relative z-10 flex items-center justify-between gap-4 flex-wrap">
                    <div>
                        <p className="text-white/50 text-sm font-medium">Teacher Portal</p>
                        <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">Leave Applications</h1>
                        <p className="text-white/40 text-sm mt-2">Apply for leave and track your application status.</p>
                    </div>
                    <button onClick={() => setShowForm(true)}
                        className="flex items-center gap-2 px-5 py-2.5 bg-gold hover:bg-gold/90 text-navy rounded-xl font-semibold text-sm transition-all">
                        <Plus className="w-4 h-4" /> Apply for Leave
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
                {[
                    { label: "Pending",  count: pending,  color: "text-amber-600",   bg: "bg-amber-50"   },
                    { label: "Approved", count: approved, color: "text-emerald-600", bg: "bg-emerald-50" },
                    { label: "Rejected", count: rejected, color: "text-red-600",     bg: "bg-red-50"     },
                ].map(s => (
                    <div key={s.label} className={`${s.bg} rounded-2xl p-4 text-center border border-gray-100`}>
                        <div className={`text-2xl font-extrabold ${s.color}`}>{s.count}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
                    </div>
                ))}
            </div>

            {/* Applications list */}
            {loading ? (
                <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-navy" /></div>
            ) : applications.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-gray-200 py-16 text-center">
                    <FileText className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-gray-400">No leave applications yet</p>
                    <p className="text-xs text-gray-400 mt-1">Click "Apply for Leave" to submit your first application</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {applications.map(app => {
                        const cfg = STATUS_CONFIG[app.status];
                        const Icon = cfg.icon;
                        return (
                            <div key={app.id} className={`bg-white rounded-2xl border p-5 ${app.status === "pending" ? "border-gray-100" : cfg.bg}`}>
                                <div className="flex items-start justify-between gap-3 flex-wrap">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-bold text-navy">{app.leaveType}</span>
                                            <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}>
                                                <Icon className="w-3 h-3" /> {cfg.label}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-gray-500 mt-1.5">
                                            <CalendarDays className="w-3.5 h-3.5" />
                                            <span>{app.fromDate === app.toDate ? app.fromDate : `${app.fromDate} → ${app.toDate}`}</span>
                                            <span className="font-semibold text-navy">({app.totalDays} day{app.totalDays !== 1 ? "s" : ""})</span>
                                        </div>
                                        <p className="text-sm text-gray-600 mt-2">{app.reason}</p>
                                        {app.adminNote && (
                                            <div className={`mt-2 p-2.5 rounded-lg text-xs font-medium border ${cfg.bg} ${cfg.color}`}>
                                                <span className="font-bold">Admin Note: </span>{app.adminNote}
                                            </div>
                                        )}
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-[10px] text-gray-400">
                                            {app.submittedAt?.toDate?.()?.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) || "—"}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Apply Form Modal */}
            {showForm && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
                        <div className="flex items-center justify-between p-5 border-b border-gray-100">
                            <h3 className="font-bold text-navy text-lg">Apply for Leave</h3>
                            <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Leave Type</label>
                                <div className="flex flex-wrap gap-2">
                                    {LEAVE_TYPES.map(t => (
                                        <button key={t} onClick={() => setForm(p => ({ ...p, leaveType: t }))}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${form.leaveType === t ? "bg-navy text-white border-navy" : "bg-white text-gray-600 border-gray-200 hover:border-navy/40"}`}>
                                            {t}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">From Date</label>
                                    <input type="date" value={form.fromDate} min={today}
                                        onChange={e => setForm(p => ({ ...p, fromDate: e.target.value, toDate: e.target.value > p.toDate ? e.target.value : p.toDate }))}
                                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-navy" />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">To Date</label>
                                    <input type="date" value={form.toDate} min={form.fromDate}
                                        onChange={e => setForm(p => ({ ...p, toDate: e.target.value }))}
                                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-navy" />
                                </div>
                            </div>
                            {totalDays > 0 && (
                                <div className="flex items-center gap-2 text-sm text-navy font-semibold bg-navy/5 px-3 py-2 rounded-lg">
                                    <CalendarDays className="w-4 h-4" /> {totalDays} day{totalDays !== 1 ? "s" : ""} selected
                                </div>
                            )}
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Reason <span className="text-red-400">*</span></label>
                                <textarea value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} rows={4}
                                    placeholder="Briefly explain your reason for leave…"
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-navy resize-none" />
                            </div>
                            <div className="flex items-start gap-2 text-xs text-amber-600 bg-amber-50 p-3 rounded-lg border border-amber-100">
                                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                <span>Once submitted, your application will be reviewed by the admin. You cannot edit it after submission.</span>
                            </div>
                        </div>
                        <div className="flex gap-3 p-5 border-t border-gray-100">
                            <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
                            <button onClick={handleSubmit} disabled={submitting || totalDays <= 0}
                                className="flex-1 py-2.5 rounded-xl bg-navy text-white text-sm font-semibold hover:bg-navy/90 disabled:opacity-60 flex items-center justify-center gap-2">
                                {submitting && <Loader2 className="w-4 h-4 animate-spin" />} Submit Application
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
