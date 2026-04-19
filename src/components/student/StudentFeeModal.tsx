"use client";

import { useState, useEffect, useCallback } from "react";
import {
    doc, getDoc, getDocs, updateDoc, setDoc,
    collectionGroup, query, where, deleteField
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import {
    X, Printer, CreditCard, CheckCircle2,
    Loader2, School, Bus, RefreshCw, RotateCcw
} from "lucide-react";
import { buildReceiptHTML, printReceiptHTML } from "@/lib/print-receipt";
import toast from "react-hot-toast";

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTHS_FULL = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: CURRENT_YEAR - 2023 }, (_, i) => 2024 + i).concat([CURRENT_YEAR + 1]);

const STATUS_CONFIG = {
    paid:             { label: "Paid",     bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500" },
    pending:          { label: "Pending",  bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200",   dot: "bg-amber-400"  },
    overdue:          { label: "Overdue",  bg: "bg-rose-50",    text: "text-rose-700",     border: "border-rose-200",    dot: "bg-rose-500"   },
    carried_forward:  { label: "Arrear",   bg: "bg-purple-50",  text: "text-purple-700",   border: "border-purple-200",  dot: "bg-purple-500" },
    not_generated:    { label: "—",        bg: "bg-slate-50",   text: "text-slate-400",    border: "border-slate-200",   dot: "bg-slate-300"  },
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────

interface Student {
    id: string;
    firstName?: string;
    middleName?: string;
    lastName?: string;
    admissionNumber?: string;
    currentClass?: string | number;
    section?: string;
    [key: string]: any;
}

type FeeStatus = "paid" | "pending" | "overdue" | "carried_forward" | "not_generated";

interface MonthRecord {
    month: number; // 1–12
    // School fee
    schoolExists: boolean;
    schoolDocPath: string;
    schoolDocId: string;
    schoolStatus: FeeStatus;
    schoolAmount: number;          // base fee
    schoolTotalAmount: number;     // base + previousDues
    schoolPreviousDues: number;
    schoolReceiptNo: string | null;
    schoolPaidOn: Date | null;
    schoolPaymentMode: string;
    schoolBreakdown: Record<string, number>;
    // Transport fee
    transportExists: boolean;
    transportStatus: FeeStatus;
    transportAmount: number;
    transportTotalAmount: number;
    transportPreviousDues: number;
    transportReceiptNo: string | null;
    transportPaidOn: Date | null;
    transportPaymentMode: string;
}

interface PayDialog {
    month: number;
    type: "school" | "transport" | "both";
    schoolUnpaid: boolean;
    transportUnpaid: boolean;
    schoolTotal: number;
    transportTotal: number;
}

interface Props {
    student: Student;
    onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const safeStr = (v: any): string => {
    if (v == null) return "";
    if (typeof v === "string") return v;
    if (typeof v === "number") return String(v);
    return String(v);
};

const getDisplayName = (s: Student) =>
    `${safeStr(s.firstName)} ${safeStr(s.lastName)}`.trim() || "Student";

const fmtDate = (d: Date | null): string =>
    d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

const genReceiptNo = (prefix: "REC" | "TRP") => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const timeStr = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const rnd = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `${prefix}-${dateStr}-${timeStr}-${rnd}`;
};

const toFirestoreDate = (ts: any): Date | null => {
    if (!ts) return null;
    if (ts.toDate) return ts.toDate();
    if (ts instanceof Date) return ts;
    return null;
};

// ─── Component ────────────────────────────────────────────────────────────────

export function StudentFeeModal({ student, onClose }: Props) {
    const { user } = useAuth();
    const classId = safeStr(student.currentClass);
    const studentId = student.id;

    const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
    const [records, setRecords] = useState<MonthRecord[]>([]);
    const [loading, setLoading] = useState(true);

    // Pay dialog
    const [payDialog, setPayDialog] = useState<PayDialog | null>(null);
    const [payMode, setPayMode] = useState<"CASH" | "UPI">("CASH");
    const [payLoading, setPayLoading] = useState(false);

    // Undo (reverse paid) dialog
    const [undoDialog, setUndoDialog] = useState<{ month: number; type: "school" | "transport" | "both" } | null>(null);
    const [undoLoading, setUndoLoading] = useState(false);

    // ─── Load Data ─────────────────────────────────────────────────────────

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            // Fetch 12 months in parallel (school + transport)
            const months = Array.from({ length: 12 }, (_, i) => i + 1);

            // School: one collectionGroup query finds ALL records for this student+year
            // regardless of which class folder they live in (handles promotions correctly)
            // Also handles both docId formats (standard + admission) automatically
            const schoolQuery = query(
                collectionGroup(db, "records"),
                where("studentId", "==", studentId),
                where("year", "==", selectedYear)
            );
            const [schoolQuerySnap, transportSnaps] = await Promise.all([
                getDocs(schoolQuery),
                // Transport: 12 direct reads by studentId (already student-scoped)
                Promise.all(months.map(m =>
                    getDoc(doc(
                        db,
                        "transportFeeRecords", selectedYear.toString(),
                        "months", m.toString(),
                        "students", studentId
                    ))
                )),
            ]);

            // Build month → best doc map (prefer paid when duplicates exist)
            const schoolDocMap = new Map<number, typeof schoolQuerySnap.docs[0]>();
            for (const d of schoolQuerySnap.docs) {
                const data = d.data() as any;
                const m = data.month as number;
                if (!m || m < 1 || m > 12) continue;
                const existing = schoolDocMap.get(m);
                if (!existing || data.status === "paid") {
                    schoolDocMap.set(m, d);
                }
            }

            const result: MonthRecord[] = months.map((m, i) => {
                const schoolSnap = schoolDocMap.get(m) ?? null;
                const transportSnap = transportSnaps[i];
                const docPath = schoolSnap ? schoolSnap.ref.path : "";
                const docId   = schoolSnap ? schoolSnap.id : `${studentId}_${selectedYear}_${String(m).padStart(2, "0")}`;

                // ── School ──
                let schoolExists = false;
                let schoolStatus: FeeStatus = "not_generated";
                let schoolAmount = 0;
                let schoolTotalAmount = 0;
                let schoolPreviousDues = 0;
                let schoolReceiptNo: string | null = null;
                let schoolPaidOn: Date | null = null;
                let schoolPaymentMode = "";
                let schoolBreakdown: Record<string, number> = {};

                if (schoolSnap && schoolSnap.exists()) {
                    const d = schoolSnap.data() as any;
                    schoolExists = true;
                    schoolStatus = (d.status || "pending") as FeeStatus;
                    schoolAmount = d.amount || 0;
                    schoolTotalAmount = d.totalAmount || d.amount || 0;
                    schoolPreviousDues = d.previousDues || 0;
                    schoolReceiptNo = d.receiptNo || null;
                    schoolPaidOn = toFirestoreDate(d.paidOn);
                    schoolPaymentMode = d.paymentMode || "";
                    schoolBreakdown = d.breakdown || {};
                }

                // ── Transport ──
                let transportExists = false;
                let transportStatus: FeeStatus = "not_generated";
                let transportAmount = 0;
                let transportTotalAmount = 0;
                let transportPreviousDues = 0;
                let transportReceiptNo: string | null = null;
                let transportPaidOn: Date | null = null;
                let transportPaymentMode = "";

                if (transportSnap.exists()) {
                    const d = transportSnap.data() as any;
                    transportExists = true;
                    transportStatus = (d.status || "pending") as FeeStatus;
                    transportAmount = d.amount || 0;
                    transportTotalAmount = d.totalAmount || d.amount || 0;
                    transportPreviousDues = d.previousDues || 0;
                    transportReceiptNo = d.receiptNo || null;
                    transportPaidOn = toFirestoreDate(d.paidOn);
                    transportPaymentMode = d.paymentMode || "";
                }

                return {
                    month: m,
                    schoolExists, schoolDocPath: docPath, schoolDocId: docId,
                    schoolStatus, schoolAmount, schoolTotalAmount,
                    schoolPreviousDues, schoolReceiptNo, schoolPaidOn,
                    schoolPaymentMode, schoolBreakdown,
                    transportExists,
                    transportStatus, transportAmount, transportTotalAmount,
                    transportPreviousDues, transportReceiptNo, transportPaidOn,
                    transportPaymentMode,
                };
            });

            setRecords(result);
        } catch (err) {
            console.error("[StudentFeeModal] Load error:", err);
            toast.error("Failed to load fee records");
        } finally {
            setLoading(false);
        }
    }, [studentId, classId, selectedYear]);

    useEffect(() => { loadData(); }, [loadData]);

    // ─── Open Pay Dialog ────────────────────────────────────────────────────

    const openPayDialog = (rec: MonthRecord) => {
        const schoolUnpaid = rec.schoolExists && rec.schoolStatus !== "paid";
        const transportUnpaid = rec.transportExists && rec.transportStatus !== "paid";
        if (!schoolUnpaid && !transportUnpaid) return;

        let type: "school" | "transport" | "both" = "school";
        if (schoolUnpaid && transportUnpaid) type = "both";
        else if (transportUnpaid) type = "transport";

        setPayDialog({
            month: rec.month,
            type,
            schoolUnpaid,
            transportUnpaid,
            schoolTotal: rec.schoolTotalAmount,
            transportTotal: rec.transportTotalAmount,
        });
        setPayMode("CASH");
    };

    // ─── Mark Paid ──────────────────────────────────────────────────────────

    const handleConfirmPay = async () => {
        if (!payDialog) return;
        const rec = records[payDialog.month - 1];
        setPayLoading(true);
        try {
            const schoolReceiptNo = genReceiptNo("REC");
            const transportReceiptNo = genReceiptNo("TRP");
            const paidOn = new Date();
            const markedBy = user?.uid || "";

            const paySchool = payDialog.type === "school" || payDialog.type === "both";
            const payTransport = payDialog.type === "transport" || payDialog.type === "both";

            // ── 1. Mark School Fee Paid ──────────────────────────────────────
            if (paySchool && rec.schoolExists && rec.schoolStatus !== "paid") {
                await updateDoc(doc(db, rec.schoolDocPath), {
                    status: "paid",
                    paidOn,
                    receiptNo: schoolReceiptNo,
                    paymentMode: payMode,
                    markedBy,
                    totalAmountPaid: rec.schoolTotalAmount,
                });

                // Extract classId from the actual doc path (correct even for promoted students)
                // Path: feeRecords/{year}/months/{month}/classes/{classId}/records/{docId}
                const pathParts = rec.schoolDocPath.split("/");
                const recordClassId = pathParts[6] || classId;

                // Backward cascade: mark previous carried_forward school records as paid
                try {
                    for (let offset = 1; offset <= 12; offset++) {
                        let prevM = rec.month - offset;
                        let prevY = selectedYear;
                        if (prevM <= 0) { prevM += 12; prevY -= 1; }
                        const prevMPad = String(prevM).padStart(2, "0");
                        const prevDocId = `${studentId}_${prevY}_${prevMPad}`;
                        const prevRef = doc(db, `feeRecords/${prevY}/months/${prevM}/classes/${recordClassId}/records`, prevDocId);
                        const prevSnap = await getDoc(prevRef);
                        if (!prevSnap.exists()) continue;
                        const prevData = prevSnap.data() as any;
                        if (prevData.status === "carried_forward") {
                            await updateDoc(prevRef, {
                                status: "paid", paidOn, receiptNo: schoolReceiptNo,
                                paymentMode: payMode, markedBy,
                                totalAmountPaid: prevData.amount || 0,
                                note: `Auto-paid via consolidated bill ${schoolReceiptNo}`,
                            });
                        }
                    }
                } catch (e) { console.error("[SchoolBackwardCascade]", e); }

                // Forward cascade: deduct paid amount from next month's previousDues
                try {
                    const paidAmount = rec.schoolTotalAmount;
                    for (let offset = 1; offset <= 12; offset++) {
                        let nextM = rec.month + offset;
                        let nextY = selectedYear;
                        if (nextM > 12) { nextM -= 12; nextY += 1; }
                        const nextMPad = String(nextM).padStart(2, "0");
                        const nextDocId = `${studentId}_${nextY}_${nextMPad}`;
                        const nextRef = doc(db, `feeRecords/${nextY}/months/${nextM}/classes/${recordClassId}/records`, nextDocId);
                        const nextSnap = await getDoc(nextRef);
                        if (!nextSnap.exists()) break;
                        const nextData = nextSnap.data() as any;
                        if (nextData.status === "paid") break;
                        if (nextData.status === "carried_forward") {
                            const oldPrev = nextData.previousDues || 0;
                            if (oldPrev > 0) {
                                await updateDoc(nextRef, {
                                    previousDues: Math.max(0, oldPrev - paidAmount),
                                    totalAmount: (nextData.amount || 0) + Math.max(0, oldPrev - paidAmount),
                                });
                            }
                            continue;
                        }
                        if ((nextData.previousDues || 0) > 0) {
                            const newPrev = Math.max(0, (nextData.previousDues || 0) - paidAmount);
                            await updateDoc(nextRef, {
                                previousDues: newPrev,
                                totalAmount: (nextData.amount || 0) + newPrev,
                            });
                        }
                        break;
                    }
                } catch (e) { console.error("[SchoolForwardCascade]", e); }
            }

            // ── 2. Mark Transport Fee Paid ───────────────────────────────────
            if (payTransport && rec.transportExists && rec.transportStatus !== "paid") {
                const transportRef = doc(
                    db, "transportFeeRecords", selectedYear.toString(),
                    "months", rec.month.toString(), "students", studentId
                );
                await setDoc(transportRef, {
                    status: "paid",
                    paidOn,
                    receiptNo: transportReceiptNo,
                    paymentMode: payMode,
                    markedBy,
                    totalAmountPaid: rec.transportTotalAmount,
                }, { merge: true });

                // Backward cascade: mark previous carried_forward transport records as paid
                try {
                    for (let offset = 1; offset <= 12; offset++) {
                        let prevM = rec.month - offset;
                        let prevY = selectedYear;
                        if (prevM <= 0) { prevM += 12; prevY -= 1; }
                        const prevRef = doc(
                            db, "transportFeeRecords", prevY.toString(),
                            "months", prevM.toString(), "students", studentId
                        );
                        const prevSnap = await getDoc(prevRef);
                        if (!prevSnap.exists()) continue;
                        const prevData = prevSnap.data() as any;
                        if (prevData.status === "carried_forward") {
                            await updateDoc(prevRef, {
                                status: "paid", paidOn, receiptNo: transportReceiptNo,
                                paymentMode: payMode, markedBy,
                                totalAmountPaid: prevData.amount || 0,
                                note: `Auto-paid via consolidated bill ${transportReceiptNo}`,
                            });
                        }
                    }
                } catch (e) { console.error("[TransportBackwardCascade]", e); }

                // Forward cascade: deduct from next month's transport previousDues
                try {
                    const transpPaid = rec.transportTotalAmount;
                    for (let offset = 1; offset <= 12; offset++) {
                        let nextM = rec.month + offset;
                        let nextY = selectedYear;
                        if (nextM > 12) { nextM -= 12; nextY += 1; }
                        const nextRef = doc(
                            db, "transportFeeRecords", nextY.toString(),
                            "months", nextM.toString(), "students", studentId
                        );
                        const nextSnap = await getDoc(nextRef);
                        if (!nextSnap.exists()) break;
                        const nextData = nextSnap.data() as any;
                        if (nextData.status === "paid") break;
                        if (nextData.status === "carried_forward") {
                            const oldPrev = nextData.previousDues || 0;
                            if (oldPrev > 0) {
                                await updateDoc(nextRef, {
                                    previousDues: Math.max(0, oldPrev - transpPaid),
                                    totalAmount: (nextData.amount || 0) + Math.max(0, oldPrev - transpPaid),
                                });
                            }
                            continue;
                        }
                        if ((nextData.previousDues || 0) > 0) {
                            const newPrev = Math.max(0, (nextData.previousDues || 0) - transpPaid);
                            await updateDoc(nextRef, {
                                previousDues: newPrev,
                                totalAmount: (nextData.amount || 0) + newPrev,
                            });
                        }
                        break;
                    }
                } catch (e) { console.error("[TransportForwardCascade]", e); }
            }

            toast.success(`Fee marked as paid for ${MONTHS_SHORT[rec.month - 1]} ${selectedYear}`);

            // Update local state
            setRecords(prev => prev.map(r => {
                if (r.month !== rec.month) return r;
                return {
                    ...r,
                    ...(paySchool && r.schoolExists && r.schoolStatus !== "paid" ? {
                        schoolStatus: "paid" as FeeStatus,
                        schoolReceiptNo,
                        schoolPaidOn: paidOn,
                        schoolPaymentMode: payMode,
                    } : {}),
                    ...(payTransport && r.transportExists && r.transportStatus !== "paid" ? {
                        transportStatus: "paid" as FeeStatus,
                        transportReceiptNo,
                        transportPaidOn: paidOn,
                        transportPaymentMode: payMode,
                    } : {}),
                };
            }));

            setPayDialog(null);

            // Print receipt after marking paid
            printCombinedReceipt(
                rec,
                paySchool ? schoolReceiptNo : null,
                payTransport ? transportReceiptNo : null,
                paidOn,
                payMode
            );
        } catch (err: any) {
            console.error("[StudentFeeModal] Pay error:", err);
            toast.error(err.message || "Failed to mark as paid");
        } finally {
            setPayLoading(false);
        }
    };

    // ─── Print Receipt ──────────────────────────────────────────────────────

    const printCombinedReceipt = (
        rec: MonthRecord,
        schoolReceiptNo: string | null,
        transportReceiptNo: string | null,
        paidOn: Date,
        paymentMode: string
    ) => {
        const studentName = getDisplayName(student);
        const classSection = `Class ${classId}${student.section ? ` - ${student.section}` : ""}`;
        const feeMonth = `${MONTHS_FULL[rec.month - 1]} ${selectedYear}`;
        const paidOnStr = feeMonth && paidOn
            ? paidOn.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
            : "—";

        const parts: string[] = [];

        if (schoolReceiptNo) {
            const breakdown = rec.schoolBreakdown || {};
            const lineItems: { label: string; amount: number }[] = [
                { label: "Tuition Fee", amount: breakdown.tuitionFee || 0 },
                { label: "Annual Fee", amount: breakdown.annualFee || 0 },
                { label: "Admission Fee", amount: breakdown.admissionFee || 0 },
                { label: "Registration Fee", amount: breakdown.registrationFee || 0 },
                { label: "Sports Fee", amount: breakdown.sportsFee || 0 },
                { label: "Miscellaneous Fee", amount: breakdown.miscFee || 0 },
            ].filter(x => x.amount > 0);
            if (lineItems.length === 0) lineItems.push({ label: "School Fee", amount: rec.schoolAmount });
            if (rec.schoolPreviousDues > 0) lineItems.push({ label: "Previous Dues (Arrears)", amount: rec.schoolPreviousDues });

            parts.push(buildReceiptHTML({
                title: "School Fee Receipt",
                receiptNo: schoolReceiptNo,
                studentName,
                classSection,
                rollNo: student.admissionNumber,
                paidOn: paidOnStr,
                feeMonth,
                lineItems,
                totalAmount: rec.schoolTotalAmount,
                paymentMode,
            }));
        }

        if (transportReceiptNo) {
            const lineItems: { label: string; amount: number }[] = [
                { label: "Transport / Bus Fee", amount: rec.transportAmount },
            ];
            if (rec.transportPreviousDues > 0) lineItems.push({ label: "Previous Dues (Arrears)", amount: rec.transportPreviousDues });

            parts.push(buildReceiptHTML({
                title: "Transport Fee Receipt",
                receiptNo: transportReceiptNo,
                studentName,
                classSection,
                rollNo: student.admissionNumber,
                paidOn: paidOnStr,
                feeMonth,
                lineItems,
                totalAmount: rec.transportTotalAmount,
                paymentMode,
            }));
        }

        if (parts.length === 0) return;

        const combined = parts.join(`
<div style="page-break-before:always;margin:60px 0 40px;border-top:2px dashed #d1d5db;"></div>
`);
        printReceiptHTML(combined, `Fee Receipt — ${MONTHS_SHORT[rec.month - 1]} ${selectedYear}`);
    };

    const printExistingReceipt = (rec: MonthRecord) => {
        const hasSchoolPaid = rec.schoolStatus === "paid" && rec.schoolReceiptNo;
        const hasTransportPaid = rec.transportStatus === "paid" && rec.transportReceiptNo;

        printCombinedReceipt(
            rec,
            hasSchoolPaid ? rec.schoolReceiptNo : null,
            hasTransportPaid ? rec.transportReceiptNo : null,
            rec.schoolPaidOn || rec.transportPaidOn || new Date(),
            rec.schoolPaymentMode || rec.transportPaymentMode || "CASH"
        );
    };

    // ─── Undo (Reverse Paid → Pending) ─────────────────────────────────────

    const handleConfirmUndo = async () => {
        if (!undoDialog) return;
        const rec = records[undoDialog.month - 1];
        setUndoLoading(true);
        try {
            const undoSchool = undoDialog.type === "school" || undoDialog.type === "both";
            const undoTransport = undoDialog.type === "transport" || undoDialog.type === "both";

            // ── School fee reverse ───────────────────────────────────────────
            if (undoSchool && rec.schoolExists && rec.schoolStatus === "paid") {
                await updateDoc(doc(db, rec.schoolDocPath), {
                    status: "pending",
                    paidOn: deleteField(),
                    receiptNo: deleteField(),
                    paymentMode: deleteField(),
                    totalAmountPaid: deleteField(),
                    markedBy: deleteField(),
                });
            }

            // ── Transport fee reverse ────────────────────────────────────────
            if (undoTransport && rec.transportExists && rec.transportStatus === "paid") {
                const transportRef = doc(
                    db, "transportFeeRecords", selectedYear.toString(),
                    "months", rec.month.toString(), "students", studentId
                );
                await updateDoc(transportRef, {
                    status: "pending",
                    paidOn: deleteField(),
                    receiptNo: deleteField(),
                    paymentMode: deleteField(),
                    totalAmountPaid: deleteField(),
                    markedBy: deleteField(),
                });
            }

            // Update local state
            setRecords(prev => prev.map(r => {
                if (r.month !== rec.month) return r;
                return {
                    ...r,
                    ...(undoSchool && r.schoolStatus === "paid" ? {
                        schoolStatus: "pending" as FeeStatus,
                        schoolReceiptNo: null,
                        schoolPaidOn: null,
                        schoolPaymentMode: "",
                    } : {}),
                    ...(undoTransport && r.transportStatus === "paid" ? {
                        transportStatus: "pending" as FeeStatus,
                        transportReceiptNo: null,
                        transportPaidOn: null,
                        transportPaymentMode: "",
                    } : {}),
                };
            }));

            toast.success(`Fee wapas pending kar di — ${MONTHS_SHORT[rec.month - 1]} ${selectedYear}`);
            setUndoDialog(null);
        } catch (err: any) {
            console.error("[StudentFeeModal] Undo error:", err);
            toast.error(err.message || "Reverse karne mein error aaya");
        } finally {
            setUndoLoading(false);
        }
    };

    // ─── Derived Summary ────────────────────────────────────────────────────

    const summary = records.reduce(
        (acc, r) => {
            if (r.schoolStatus === "paid") acc.paid++;
            else if (r.schoolExists) acc.unpaid++;
            if (r.schoolStatus === "overdue" || r.schoolStatus === "carried_forward") acc.overdue++;
            return acc;
        },
        { paid: 0, unpaid: 0, overdue: 0 }
    );

    const currentMonthNum = new Date().getMonth() + 1;
    const currentMonthRec = selectedYear === CURRENT_YEAR ? records[currentMonthNum - 1] : null;

    // ─── UI ─────────────────────────────────────────────────────────────────

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-[3px]">
            <div className="bg-white rounded-3xl shadow-[0_24px_80px_rgb(0,0,0,0.18)] w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">

                {/* ── Header ───────────────────────────────────────────────── */}
                <div className="flex items-center justify-between px-7 py-5 border-b border-slate-100 shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="w-11 h-11 rounded-2xl bg-navy/5 flex items-center justify-center">
                            <CreditCard className="w-5 h-5 text-navy" strokeWidth={2} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">{getDisplayName(student)}</h2>
                            <p className="text-xs text-slate-400 font-medium mt-0.5">
                                ENR: <span className="font-mono font-bold text-slate-600">{student.admissionNumber || "—"}</span>
                                <span className="mx-2 text-slate-200">·</span>
                                Class {classId}{student.section ? ` · ${student.section}` : ""}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Year selector */}
                        <select
                            value={selectedYear}
                            onChange={e => setSelectedYear(Number(e.target.value))}
                            className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/10 bg-slate-50"
                        >
                            {YEAR_OPTIONS.map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                        <button
                            onClick={loadData}
                            disabled={loading}
                            className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500 transition-colors disabled:opacity-40"
                            title="Refresh"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500 transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* ── Summary Stats ─────────────────────────────────────────── */}
                <div className="flex items-center gap-5 px-7 py-4 bg-slate-50/60 border-b border-slate-100 shrink-0">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="text-xs font-bold text-slate-600">{summary.paid} Paid</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-amber-400" />
                        <span className="text-xs font-bold text-slate-600">{summary.unpaid} Unpaid</span>
                    </div>
                    {summary.overdue > 0 && (
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-rose-500" />
                            <span className="text-xs font-bold text-rose-600">{summary.overdue} Overdue/Arrear</span>
                        </div>
                    )}
                    {currentMonthRec && (
                        <>
                            <div className="h-4 w-px bg-slate-200 mx-1" />
                            <span className="text-xs font-medium text-slate-400">
                                Current month ({MONTHS_SHORT[currentMonthNum - 1]}):{" "}
                                <span className={`font-bold ${currentMonthRec.schoolStatus === "paid" ? "text-emerald-600" : "text-amber-600"}`}>
                                    {currentMonthRec.schoolExists
                                        ? STATUS_CONFIG[currentMonthRec.schoolStatus].label
                                        : "Not Generated"}
                                </span>
                            </span>
                        </>
                    )}
                </div>

                {/* ── Table ─────────────────────────────────────────────────── */}
                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-24 gap-3">
                            <Loader2 className="w-8 h-8 animate-spin text-navy" />
                            <p className="text-sm text-slate-400 font-medium">Loading fee records…</p>
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50/80 border-b border-slate-200 sticky top-0">
                                <tr>
                                    {["Month", "School Fee", "Transport Fee", "Actions"].map(h => (
                                        <th key={h} className={`h-12 px-6 text-left align-middle text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap ${h === "Actions" ? "text-right" : ""}`}>
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {records.map(rec => {
                                    const isCurrentMonth = selectedYear === CURRENT_YEAR && rec.month === currentMonthNum;
                                    const schoolCfg = STATUS_CONFIG[rec.schoolStatus];
                                    const trpCfg = STATUS_CONFIG[rec.transportStatus];

                                    const schoolUnpaid = rec.schoolExists && rec.schoolStatus !== "paid";
                                    const transportUnpaid = rec.transportExists && rec.transportStatus !== "paid";
                                    const anyUnpaid = schoolUnpaid || transportUnpaid;
                                    const anyPaid = rec.schoolStatus === "paid" || rec.transportStatus === "paid";

                                    return (
                                        <tr
                                            key={rec.month}
                                            className={`transition-colors ${isCurrentMonth ? "bg-blue-50/40" : "hover:bg-slate-50/60"}`}
                                        >
                                            {/* Month */}
                                            <td className="px-6 py-3.5 whitespace-nowrap">
                                                <div className="flex items-center gap-2.5">
                                                    <span className={`text-sm font-bold ${isCurrentMonth ? "text-navy" : "text-slate-700"}`}>
                                                        {MONTHS_FULL[rec.month - 1]}
                                                    </span>
                                                    {isCurrentMonth && (
                                                        <span className="px-1.5 py-0.5 rounded-md bg-navy/10 text-navy text-[10px] font-bold">NOW</span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* School Fee */}
                                            <td className="px-6 py-3.5">
                                                {!rec.schoolExists ? (
                                                    <span className="text-slate-300 text-xs font-medium">Not generated</span>
                                                ) : (
                                                    <div className="flex flex-col gap-0.5">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${schoolCfg.bg} ${schoolCfg.text} ${schoolCfg.border}`}>
                                                                <span className={`w-1.5 h-1.5 rounded-full ${schoolCfg.dot}`} />
                                                                {schoolCfg.label}
                                                            </span>
                                                            <span className="text-xs font-bold text-slate-600">
                                                                ₹{rec.schoolTotalAmount.toLocaleString("en-IN")}
                                                            </span>
                                                        </div>
                                                        {rec.schoolPreviousDues > 0 && (
                                                            <span className="text-[11px] text-purple-500 font-medium ml-1">
                                                                +₹{rec.schoolPreviousDues.toLocaleString("en-IN")} arrears
                                                            </span>
                                                        )}
                                                        {rec.schoolStatus === "paid" && rec.schoolPaidOn && (
                                                            <span className="text-[11px] text-slate-400 ml-1">
                                                                {fmtDate(rec.schoolPaidOn)} · {rec.schoolPaymentMode || "CASH"}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </td>

                                            {/* Transport Fee */}
                                            <td className="px-6 py-3.5">
                                                {!rec.transportExists ? (
                                                    <span className="text-slate-300 text-xs font-medium">N/A</span>
                                                ) : (
                                                    <div className="flex flex-col gap-0.5">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${trpCfg.bg} ${trpCfg.text} ${trpCfg.border}`}>
                                                                <span className={`w-1.5 h-1.5 rounded-full ${trpCfg.dot}`} />
                                                                {trpCfg.label}
                                                            </span>
                                                            <span className="text-xs font-bold text-slate-600">
                                                                ₹{rec.transportTotalAmount.toLocaleString("en-IN")}
                                                            </span>
                                                        </div>
                                                        {rec.transportPreviousDues > 0 && (
                                                            <span className="text-[11px] text-purple-500 font-medium ml-1">
                                                                +₹{rec.transportPreviousDues.toLocaleString("en-IN")} arrears
                                                            </span>
                                                        )}
                                                        {rec.transportStatus === "paid" && rec.transportPaidOn && (
                                                            <span className="text-[11px] text-slate-400 ml-1">
                                                                {fmtDate(rec.transportPaidOn)} · {rec.transportPaymentMode || "CASH"}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </td>

                                            {/* Actions */}
                                            <td className="px-6 py-3.5 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    {anyUnpaid && (
                                                        <button
                                                            onClick={() => openPayDialog(rec)}
                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-navy hover:bg-navy/90 shadow-sm transition-all"
                                                        >
                                                            <CreditCard className="w-3 h-3" strokeWidth={2.5} />
                                                            Pay
                                                        </button>
                                                    )}
                                                    {anyPaid && (
                                                        <button
                                                            onClick={() => printExistingReceipt(rec)}
                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 bg-white hover:bg-slate-50 ring-1 ring-slate-200 shadow-sm transition-all"
                                                        >
                                                            <Printer className="w-3 h-3" strokeWidth={2.5} />
                                                            Print
                                                        </button>
                                                    )}
                                                    {anyPaid && (
                                                        <button
                                                            onClick={() => {
                                                                const schoolPaid = rec.schoolStatus === "paid";
                                                                const trpPaid = rec.transportStatus === "paid";
                                                                setUndoDialog({
                                                                    month: rec.month,
                                                                    type: schoolPaid && trpPaid ? "both" : schoolPaid ? "school" : "transport",
                                                                });
                                                            }}
                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-rose-600 bg-white hover:bg-rose-50 ring-1 ring-slate-200 hover:ring-rose-200 shadow-sm transition-all"
                                                            title="Galti se paid hua? Wapas pending karo"
                                                        >
                                                            <RotateCcw className="w-3 h-3" strokeWidth={2.5} />
                                                            Undo
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* ── Pay Dialog ─────────────────────────────────────────────────── */}
            {payDialog && (() => {
                const rec = records[payDialog.month - 1];
                const feeMonth = `${MONTHS_FULL[payDialog.month - 1]} ${selectedYear}`;
                const grandTotal =
                    (payDialog.type !== "transport" && payDialog.schoolUnpaid ? payDialog.schoolTotal : 0) +
                    (payDialog.type !== "school" && payDialog.transportUnpaid ? payDialog.transportTotal : 0);

                return (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-[2px]">
                        <div className="bg-white rounded-3xl shadow-[0_8px_40px_rgb(0,0,0,0.15)] w-full max-w-md p-7 space-y-5">
                            {/* Title */}
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900">Confirm Payment</h3>
                                    <p className="text-xs text-slate-400 mt-0.5">{feeMonth} · {getDisplayName(student)}</p>
                                </div>
                                <button onClick={() => setPayDialog(null)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            {/* What to pay toggle */}
                            {payDialog.schoolUnpaid && payDialog.transportUnpaid && (
                                <div className="flex gap-1 p-1 rounded-2xl bg-slate-100">
                                    {(["both", "school", "transport"] as const).map(t => (
                                        <button
                                            key={t}
                                            onClick={() => setPayDialog(d => d ? { ...d, type: t } : d)}
                                            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${payDialog.type === t ? "bg-white shadow text-navy ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-700"}`}
                                        >
                                            {t === "both" ? "Both" : t === "school" ? "School Only" : "Transport Only"}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Fee breakdown */}
                            <div className="rounded-2xl border border-slate-200 overflow-hidden">
                                {(payDialog.type === "school" || payDialog.type === "both") && payDialog.schoolUnpaid && (
                                    <div className="flex items-center justify-between px-4 py-3 bg-blue-50/50 border-b border-slate-100 last:border-0">
                                        <div className="flex items-center gap-2">
                                            <School className="w-4 h-4 text-navy" strokeWidth={2} />
                                            <span className="text-sm font-semibold text-slate-700">School Fee</span>
                                            {rec.schoolPreviousDues > 0 && (
                                                <span className="text-[11px] text-purple-600 font-medium">(incl. ₹{rec.schoolPreviousDues.toLocaleString("en-IN")} arrears)</span>
                                            )}
                                        </div>
                                        <span className="text-sm font-bold text-slate-900">₹{payDialog.schoolTotal.toLocaleString("en-IN")}</span>
                                    </div>
                                )}
                                {(payDialog.type === "transport" || payDialog.type === "both") && payDialog.transportUnpaid && (
                                    <div className="flex items-center justify-between px-4 py-3 bg-purple-50/30 border-b border-slate-100 last:border-0">
                                        <div className="flex items-center gap-2">
                                            <Bus className="w-4 h-4 text-purple-600" strokeWidth={2} />
                                            <span className="text-sm font-semibold text-slate-700">Transport Fee</span>
                                            {rec.transportPreviousDues > 0 && (
                                                <span className="text-[11px] text-purple-600 font-medium">(incl. ₹{rec.transportPreviousDues.toLocaleString("en-IN")} arrears)</span>
                                            )}
                                        </div>
                                        <span className="text-sm font-bold text-slate-900">₹{payDialog.transportTotal.toLocaleString("en-IN")}</span>
                                    </div>
                                )}
                                <div className="flex items-center justify-between px-4 py-3 bg-slate-50">
                                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Payable</span>
                                    <span className="text-lg font-black text-navy">₹{grandTotal.toLocaleString("en-IN")}</span>
                                </div>
                            </div>

                            {/* Payment mode */}
                            <div>
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Payment Mode</p>
                                <div className="flex gap-2">
                                    {(["CASH", "UPI"] as const).map(mode => (
                                        <button
                                            key={mode}
                                            onClick={() => setPayMode(mode)}
                                            className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all ${payMode === mode ? "bg-navy text-white border-navy shadow-sm" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}
                                        >
                                            {mode}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3 pt-1">
                                <button
                                    onClick={() => setPayDialog(null)}
                                    disabled={payLoading}
                                    className="flex-1 px-4 py-3 rounded-2xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-colors outline-none disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleConfirmPay}
                                    disabled={payLoading}
                                    className="flex-1 px-4 py-3 rounded-2xl bg-navy hover:bg-navy/90 text-white font-bold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm"
                                >
                                    {payLoading
                                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
                                        : <><CheckCircle2 className="w-4 h-4" strokeWidth={2.5} /> Confirm & Pay</>
                                    }
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ── Undo Dialog ────────────────────────────────────────────────── */}
            {undoDialog && (() => {
                const rec = records[undoDialog.month - 1];
                const feeMonth = `${MONTHS_FULL[undoDialog.month - 1]} ${selectedYear}`;
                return (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-[2px]">
                        <div className="bg-white rounded-3xl shadow-[0_8px_40px_rgb(0,0,0,0.15)] w-full max-w-sm p-7 space-y-5">
                            {/* Icon + Title */}
                            <div className="flex flex-col items-center text-center gap-3 pt-1">
                                <div className="w-14 h-14 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center">
                                    <RotateCcw className="w-6 h-6 text-rose-500" strokeWidth={2.5} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900">Fee Wapas Pending Karo?</h3>
                                    <p className="text-xs text-slate-400 mt-1">{feeMonth} · {getDisplayName(student)}</p>
                                </div>
                            </div>

                            {/* What will happen */}
                            <div className="rounded-2xl bg-rose-50 border border-rose-100 px-4 py-3 space-y-1.5">
                                <p className="text-xs font-bold text-rose-700">Yeh sab hoga:</p>
                                {(undoDialog.type === "school" || undoDialog.type === "both") && rec.schoolStatus === "paid" && (
                                    <p className="text-xs text-rose-600 flex items-center gap-1.5">
                                        <School className="w-3.5 h-3.5 shrink-0" />
                                        School fee → Pending · Receipt delete
                                    </p>
                                )}
                                {(undoDialog.type === "transport" || undoDialog.type === "both") && rec.transportStatus === "paid" && (
                                    <p className="text-xs text-rose-600 flex items-center gap-1.5">
                                        <Bus className="w-3.5 h-3.5 shrink-0" />
                                        Transport fee → Pending · Receipt delete
                                    </p>
                                )}
                                <p className="text-[11px] text-rose-400 pt-0.5">Note: Arrear cascade reverse nahi hoga — sirf yeh month reset hoga.</p>
                            </div>

                            {/* Both paid — toggle */}
                            {rec.schoolStatus === "paid" && rec.transportStatus === "paid" && (
                                <div className="flex gap-1 p-1 rounded-2xl bg-slate-100">
                                    {(["both", "school", "transport"] as const).map(t => (
                                        <button
                                            key={t}
                                            onClick={() => setUndoDialog(d => d ? { ...d, type: t } : d)}
                                            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${undoDialog.type === t ? "bg-white shadow text-rose-600 ring-1 ring-rose-200" : "text-slate-500 hover:text-slate-700"}`}
                                        >
                                            {t === "both" ? "Dono" : t === "school" ? "School Only" : "Transport Only"}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Buttons */}
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setUndoDialog(null)}
                                    disabled={undoLoading}
                                    className="flex-1 px-4 py-3 rounded-2xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-colors outline-none disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleConfirmUndo}
                                    disabled={undoLoading}
                                    className="flex-1 px-4 py-3 rounded-2xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm"
                                >
                                    {undoLoading
                                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Reversing…</>
                                        : <><RotateCcw className="w-4 h-4" strokeWidth={2.5} /> Haan, Reverse Karo</>
                                    }
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}
