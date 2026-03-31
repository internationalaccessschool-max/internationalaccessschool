"use client";

import { useState, useEffect, useCallback } from "react";
import { db } from "@/lib/firebase";
import {
    collection, collectionGroup, getDocs, doc, setDoc, updateDoc,
    getDoc, Timestamp
} from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import {
    CalendarDays, Search, Loader2, ChevronDown, CheckCircle2,
    AlertCircle, Clock, IndianRupee, Plus, History, X
} from "lucide-react";
import toast from "react-hot-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

type AnnualFeeStatus = "unpaid" | "partial" | "paid";

interface AnnualPayment {
    amount: number;
    date: string;          // ISO string
    paymentMode: "CASH" | "UPI" | "CHEQUE";
    receiptNo: string;
    markedBy: string;
}

interface AnnualFeeRecord {
    id: string;            // studentId
    studentId: string;
    studentName: string;
    class: string;
    section: string;
    session: string;
    totalFee: number;
    amountPaid: number;
    balance: number;
    status: AnnualFeeStatus;
    payments: AnnualPayment[];
    generatedAt?: any;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SESSION_OPTIONS = Array.from({ length: 2050 - 2020 + 1 }, (_, i) => String(2020 + i));
const PAYMENT_MODES = ["CASH", "UPI", "CHEQUE"] as const;

const STATUS_STYLES: Record<AnnualFeeStatus, { bg: string; text: string; border: string; label: string }> = {
    unpaid:  { bg: "bg-rose-50",    text: "text-rose-700",    border: "border-rose-200",    label: "Unpaid" },
    partial: { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200",   label: "Partially Paid" },
    paid:    { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", label: "Paid" },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnnualFeesPage() {
    const { user } = useAuth();
    const [tab, setTab] = useState<"manage" | "generate">("manage");
    const [session, setSession] = useState("2026");
    const [records, setRecords] = useState<AnnualFeeRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");

    // Generate tab state
    const [genLoading, setGenLoading] = useState(false);
    const [genSession, setGenSession] = useState("2026");
    const [genResults, setGenResults] = useState<{ created: number; skipped: number; errors: number } | null>(null);

    // Payment modal state
    const [payModal, setPayModal] = useState<AnnualFeeRecord | null>(null);
    const [payAmount, setPayAmount] = useState<number>(0);
    const [payMode, setPayMode] = useState<"CASH" | "UPI" | "CHEQUE">("CASH");
    const [payLoading, setPayLoading] = useState(false);

    // History modal
    const [historyModal, setHistoryModal] = useState<AnnualFeeRecord | null>(null);

    // ── Fetch records ──────────────────────────────────────────────────────────
    const fetchRecords = useCallback(async () => {
        setLoading(true);
        try {
            const snap = await getDocs(collection(db, `annualFeeRecords/${session}/students`));
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as AnnualFeeRecord));
            data.sort((a, b) => a.class.localeCompare(b.class) || a.studentName.localeCompare(b.studentName));
            setRecords(data);
        } catch (e) {
            toast.error("Failed to load annual fee records");
        } finally {
            setLoading(false);
        }
    }, [session]);

    useEffect(() => { if (tab === "manage") fetchRecords(); }, [tab, session, fetchRecords]);

    // ── Generate Annual Fees ───────────────────────────────────────────────────
    const handleGenerate = async () => {
        setGenLoading(true);
        setGenResults(null);
        let created = 0, skipped = 0, errors = 0;

        try {
            // 1. Load ALL fee structures from correct path
            const feeStructSnap = await getDocs(collection(db, "fees", "structure", "classes"));
            const feeMap: Record<string, any> = {};
            feeStructSnap.docs.forEach(d => { feeMap[d.id] = d.data(); });

            // 2. Load all active students using collectionGroup (same as rest of app)
            const studentsSnap = await getDocs(collectionGroup(db, "profiles"));
            const allStudents = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));

            // Filter only active students
            const activeStudents = allStudents.filter(s => {
                const status = (s.status || "").toUpperCase();
                return status !== "LEFT" && status !== "TC" && status !== "INACTIVE";
            });

            for (const student of activeStudents) {
                const studentId = student.id;

                // Normalize class name: "Class 7" → "7", "NUR" stays "NUR"
                const rawClass = student.className?.toString() ||
                    student.currentClass?.toString() ||
                    student.class?.toString() || "";
                const classId = rawClass.replace(/^class\s*/i, "").trim();

                if (!classId) { skipped++; continue; }

                const feeData = feeMap[classId];
                if (!feeData) { skipped++; continue; }

                // annualFee field name matches fee structure
                const annualFeeAmt = feeData.annualFee || 0;
                if (annualFeeAmt <= 0) { skipped++; continue; }

                // Check if record already exists for this session
                const ref = doc(db, `annualFeeRecords/${genSession}/students/${studentId}`);
                const existing = await getDoc(ref);
                if (existing.exists()) { skipped++; continue; }

                const studentName = [student.firstName, student.middleName, student.lastName]
                    .filter(Boolean).join(" ") || student.name || "Unknown";

                await setDoc(ref, {
                    studentId,
                    studentName,
                    class: classId,
                    section: student.section || "",
                    session: genSession,
                    totalFee: annualFeeAmt,
                    amountPaid: 0,
                    balance: annualFeeAmt,
                    status: "unpaid" as AnnualFeeStatus,
                    payments: [],
                    generatedAt: Timestamp.now(),
                });
                created++;
            }

            setGenResults({ created, skipped, errors });
            toast.success(`Annual fees generated! ${created} created, ${skipped} skipped.`);
        } catch (e) {
            console.error("Annual fee generation error:", e);
            toast.error("Failed to generate annual fees");
            errors++;
            setGenResults({ created, skipped, errors });
        } finally {
            setGenLoading(false);
        }
    };


    // ── Record a Payment ──────────────────────────────────────────────────────
    const openPayModal = (record: AnnualFeeRecord) => {
        setPayModal(record);
        setPayAmount(record.balance); // default = remaining balance
        setPayMode("CASH");
    };

    const handleRecordPayment = async () => {
        if (!payModal || payAmount <= 0) return;
        if (payAmount > payModal.balance) {
            toast.error(`Amount cannot exceed balance of ₹${payModal.balance}`);
            return;
        }

        setPayLoading(true);
        try {
            const receiptNo = `ANN-${payModal.session}-${Date.now().toString().slice(-6)}`;
            const newPayment: AnnualPayment = {
                amount: payAmount,
                date: new Date().toISOString(),
                paymentMode: payMode,
                receiptNo,
                markedBy: user?.uid || "",
            };

            const newAmountPaid = payModal.amountPaid + payAmount;
            const newBalance    = payModal.totalFee - newAmountPaid;
            const newStatus: AnnualFeeStatus =
                newBalance <= 0 ? "paid" : newAmountPaid > 0 ? "partial" : "unpaid";

            const ref = doc(db, `annualFeeRecords/${payModal.session}/students/${payModal.studentId}`);
            await updateDoc(ref, {
                amountPaid: newAmountPaid,
                balance: Math.max(0, newBalance),
                status: newStatus,
                payments: [...payModal.payments, newPayment],
            });

            setRecords(prev => prev.map(r =>
                r.id === payModal.id
                    ? {
                        ...r,
                        amountPaid: newAmountPaid,
                        balance: Math.max(0, newBalance),
                        status: newStatus,
                        payments: [...r.payments, newPayment],
                    }
                    : r
            ));
            toast.success(`Payment of ₹${payAmount} recorded! Receipt: ${receiptNo}`);
            setPayModal(null);
        } catch (e) {
            toast.error("Failed to record payment");
        } finally {
            setPayLoading(false);
        }
    };

    // ── Filtered Records ──────────────────────────────────────────────────────
    const filtered = records.filter(r =>
        !search ||
        r.studentName.toLowerCase().includes(search.toLowerCase()) ||
        r.class.toLowerCase().includes(search.toLowerCase())
    );

    // ── Summary stats ─────────────────────────────────────────────────────────
    const totalBilled  = records.reduce((s, r) => s + r.totalFee, 0);
    const totalPaid    = records.reduce((s, r) => s + r.amountPaid, 0);
    const totalPending = records.reduce((s, r) => s + r.balance, 0);

    // ─── Render ───────────────────────────────────────────────────────────────

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-navy flex items-center gap-2">
                    <CalendarDays className="w-6 h-6 text-amber-500" />
                    Annual Fees (Session)
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                    Annual fees are charged once per academic session. Students can pay in installments at any time.
                </p>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
                {(["manage", "generate"] as const).map(t => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                            tab === t ? "bg-white shadow text-navy" : "text-gray-500 hover:text-navy"
                        }`}
                    >
                        {t === "manage" ? "Manage & Pay" : "Generate for Session"}
                    </button>
                ))}
            </div>

            {/* ── MANAGE TAB ────────────────────────────────────────────────── */}
            {tab === "manage" && (
                <div className="space-y-4">
                    {/* Controls */}
                    <div className="flex flex-wrap gap-3 items-center">
                        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2">
                            <CalendarDays className="w-4 h-4 text-gray-400" />
                            <select
                                value={session}
                                onChange={e => setSession(e.target.value)}
                                className="text-sm text-navy font-semibold outline-none bg-transparent"
                            >
                                {SESSION_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 flex-1 max-w-xs">
                            <Search className="w-4 h-4 text-gray-400" />
                            <input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search student or class..."
                                className="text-sm outline-none flex-1 bg-transparent"
                            />
                        </div>
                    </div>

                    {/* Stats */}
                    {records.length > 0 && (
                        <div className="grid grid-cols-3 gap-4">
                            {[
                                { label: "Total Billed", val: totalBilled, color: "text-navy" },
                                { label: "Total Collected", val: totalPaid, color: "text-emerald-600" },
                                { label: "Total Pending", val: totalPending, color: "text-rose-600" },
                            ].map(s => (
                                <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-4">
                                    <p className="text-xs text-gray-400 mb-1">{s.label}</p>
                                    <p className={`text-xl font-bold ${s.color}`}>₹{s.val.toLocaleString()}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Table */}
                    {loading ? (
                        <div className="flex items-center justify-center h-40">
                            <Loader2 className="w-6 h-6 animate-spin text-navy" />
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="bg-white rounded-xl border border-gray-100 py-16 text-center">
                            <CalendarDays className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                            <p className="text-gray-400 font-medium">
                                {records.length === 0
                                    ? `No annual fees generated for session ${session} yet.`
                                    : "No records match your search."}
                            </p>
                            {records.length === 0 && (
                                <button
                                    onClick={() => setTab("generate")}
                                    className="mt-3 text-sm text-amber-600 font-semibold hover:underline"
                                >
                                    → Go to Generate tab
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-100">
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Student</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Class</th>
                                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">Total Fee</th>
                                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">Paid</th>
                                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">Balance</th>
                                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400 uppercase">Status</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {filtered.map(record => {
                                        const sc = STATUS_STYLES[record.status];
                                        return (
                                            <tr key={record.id} className="hover:bg-gray-50/50">
                                                <td className="px-4 py-3 font-medium text-navy">{record.studentName}</td>
                                                <td className="px-4 py-3 text-gray-500">{record.class} {record.section}</td>
                                                <td className="px-4 py-3 text-right font-semibold text-navy">₹{record.totalFee.toLocaleString()}</td>
                                                <td className="px-4 py-3 text-right text-emerald-700 font-medium">₹{record.amountPaid.toLocaleString()}</td>
                                                <td className="px-4 py-3 text-right text-rose-600 font-semibold">₹{record.balance.toLocaleString()}</td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${sc.bg} ${sc.text} ${sc.border}`}>
                                                        {sc.label}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        {record.status !== "paid" && (
                                                            <button
                                                                onClick={() => openPayModal(record)}
                                                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg text-xs font-semibold hover:bg-amber-100 transition-colors"
                                                            >
                                                                <Plus className="w-3 h-3" /> Pay
                                                            </button>
                                                        )}
                                                        {record.payments.length > 0 && (
                                                            <button
                                                                onClick={() => setHistoryModal(record)}
                                                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-semibold hover:bg-gray-200 transition-colors"
                                                            >
                                                                <History className="w-3 h-3" /> History
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ── GENERATE TAB ──────────────────────────────────────────────── */}
            {tab === "generate" && (
                <div className="max-w-lg space-y-6">
                    <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
                        <div>
                            <h2 className="text-lg font-bold text-navy mb-1">Generate Annual Fees</h2>
                            <p className="text-sm text-gray-500">
                                This will create one annual fee record per student based on their class fee structure.
                                Students who already have a record for this session will be skipped.
                            </p>
                        </div>

                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                            <strong>Note:</strong> Annual fees are charged <em>once per session</em>. Running this again
                            for the same session is safe — existing records are skipped.
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Session Year</label>
                            <select
                                value={genSession}
                                onChange={e => setGenSession(e.target.value)}
                                className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-amber-400"
                            >
                                {SESSION_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>

                        <button
                            onClick={handleGenerate}
                            disabled={genLoading}
                            className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                        >
                            {genLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CalendarDays className="w-5 h-5" />}
                            {genLoading ? "Generating..." : `Generate Annual Fees for ${genSession}`}
                        </button>

                        {genResults && (
                            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-2 text-sm">
                                <div className="flex justify-between"><span className="text-gray-500">Records Created:</span> <span className="font-bold text-emerald-600">{genResults.created}</span></div>
                                <div className="flex justify-between"><span className="text-gray-500">Skipped (existing):</span> <span className="font-bold text-amber-600">{genResults.skipped}</span></div>
                                {genResults.errors > 0 && (
                                    <div className="flex justify-between"><span className="text-gray-500">Errors:</span> <span className="font-bold text-rose-600">{genResults.errors}</span></div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── PAYMENT MODAL ─────────────────────────────────────────────── */}
            {payModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
                        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
                            <div>
                                <h3 className="text-base font-bold text-navy">Record Annual Fee Payment</h3>
                                <p className="text-xs text-gray-400 mt-0.5">{payModal.studentName} · Session {payModal.session}</p>
                            </div>
                            <button onClick={() => setPayModal(null)} className="p-2 text-gray-400 hover:text-rose-500 rounded-xl">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 space-y-2">
                            <div className="flex justify-between text-sm"><span className="text-gray-500">Total Annual Fee</span><span className="font-bold text-navy">₹{payModal.totalFee.toLocaleString()}</span></div>
                            <div className="flex justify-between text-sm"><span className="text-gray-500">Already Paid</span><span className="font-semibold text-emerald-600">₹{payModal.amountPaid.toLocaleString()}</span></div>
                            <div className="flex justify-between text-sm border-t border-gray-200 pt-2 mt-1"><span className="font-bold text-gray-700">Remaining Balance</span><span className="font-bold text-rose-600">₹{payModal.balance.toLocaleString()}</span></div>
                        </div>

                        <div className="px-6 py-5 space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Amount Paying Now (₹)</label>
                                <input
                                    type="number"
                                    min={1}
                                    max={payModal.balance}
                                    value={payAmount || ""}
                                    onChange={e => setPayAmount(parseFloat(e.target.value) || 0)}
                                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-lg font-bold outline-none focus:border-amber-400"
                                    placeholder="0"
                                />
                                {payAmount > 0 && payAmount < payModal.balance && (
                                    <p className="text-xs text-amber-600 mt-1">
                                        Balance after this payment: ₹{(payModal.balance - payAmount).toLocaleString()}
                                    </p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Payment Mode</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {PAYMENT_MODES.map(m => (
                                        <button
                                            key={m}
                                            onClick={() => setPayMode(m)}
                                            className={`py-2 rounded-xl border-2 text-sm font-semibold transition-all ${
                                                payMode === m
                                                    ? "border-amber-500 bg-amber-50 text-amber-700"
                                                    : "border-gray-100 text-gray-500 hover:border-gray-300"
                                            }`}
                                        >
                                            {m}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="px-6 pb-6 flex gap-3">
                            <button onClick={() => setPayModal(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">
                                Cancel
                            </button>
                            <button
                                onClick={handleRecordPayment}
                                disabled={payLoading || payAmount <= 0 || payAmount > payModal.balance}
                                className="flex-1 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                            >
                                {payLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                Confirm Payment
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── HISTORY MODAL ─────────────────────────────────────────────── */}
            {historyModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
                        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
                            <div>
                                <h3 className="text-base font-bold text-navy">Payment History</h3>
                                <p className="text-xs text-gray-400 mt-0.5">{historyModal.studentName} · Session {historyModal.session}</p>
                            </div>
                            <button onClick={() => setHistoryModal(null)} className="p-2 text-gray-400 hover:text-rose-500 rounded-xl">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="px-6 py-4 max-h-80 overflow-y-auto space-y-3">
                            {historyModal.payments.map((p, i) => (
                                <div key={i} className="flex items-start justify-between p-3 bg-gray-50 rounded-xl">
                                    <div>
                                        <p className="text-xs text-gray-400">{new Date(p.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
                                        <p className="text-xs text-gray-500 mt-0.5">{p.paymentMode} · {p.receiptNo}</p>
                                    </div>
                                    <span className="font-bold text-emerald-700 text-sm">₹{p.amount.toLocaleString()}</span>
                                </div>
                            ))}
                        </div>

                        <div className="px-6 py-4 border-t border-gray-100 flex justify-between text-sm">
                            <span className="text-gray-500">Total Paid</span>
                            <span className="font-bold text-emerald-700">₹{historyModal.amountPaid.toLocaleString()}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
