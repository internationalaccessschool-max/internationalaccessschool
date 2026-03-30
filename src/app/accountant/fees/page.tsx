"use client";

import { authFetch } from "@/lib/auth-fetch";

import { useState, useEffect, useCallback } from "react";
import { collection, getDocs, doc, updateDoc, setDoc, getDoc, query, where, orderBy, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import {
    Banknote, Search, CheckCircle2, AlertCircle, Clock,
    Mail, Loader2, RefreshCw, Bus, School, X
} from "lucide-react";

import toast from "react-hot-toast";
import FeeReceiptModal from "@/components/accountant/FeeReceiptModal";

interface FeeRecord {
    id: string;
    path: string;
    studentId?: string;
    studentName: string;
    rollNo: string;
    class: string;
    section: string;
    parentEmail: string;
    parentPhone?: string;
    amount: number;
    previousDues?: number;    // sum of unpaid previous months carried forward
    totalAmount?: number;     // amount + previousDues (what parent must pay)
    month: number;
    year: number;
    session?: string;         // e.g. "2026"
    dueDate: { toDate: () => Date } | null;
    status: "pending" | "paid" | "overdue" | "carried_forward";
    // Transport — only populated when a real transport record exists for this student+month+year
    transportStatus?: "pending" | "paid" | "overdue" | "carried_forward";
    transportFeeAmount?: number;   // from transportFeeRecords, NOT from breakdown
    transportPreviousDues?: number; // transport arrears from previous months
    transportTotalAmount?: number;  // transportFeeAmount + transportPreviousDues
    paidOn: { toDate: () => Date } | null;
    receiptNo: string | null;
    transportReceiptNo?: string | null;
    isTransportOnly?: boolean;     // true if student only has transport fee (no school fee record)
    receiptType?: "school" | "transport"; // used to select which receipt to show
    breakdown?: {
        tuitionFee?: number;
        annualFee?: number;
        admissionFee?: number;
        registrationFee?: number;
        sportsFee?: number;
        miscFee?: number;
    };
    paymentMode?: "CASH" | "UPI";
}

type MarkPaidType = "school" | "transport" | "both";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string; icon: any }> = {
    paid: { label: "Paid", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", icon: CheckCircle2 },
    pending: { label: "Pending", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", icon: Clock },
    overdue: { label: "Overdue", bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200", icon: AlertCircle },
    carried_forward: { label: "Carried Fwd", bg: "bg-gray-50", text: "text-gray-500", border: "border-gray-200", icon: AlertCircle },
};

export default function ManageFeesPage() {
    const { user } = useAuth();
    const [records, setRecords] = useState<FeeRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [selectedReceipt, setSelectedReceipt] = useState<FeeRecord | null>(null);

    // Mark Paid Dialog
    const [markPaidRecord, setMarkPaidRecord] = useState<FeeRecord | null>(null);
    const [markPaidType, setMarkPaidType] = useState<MarkPaidType>("school");
    const [paymentMode, setPaymentMode] = useState<"CASH" | "UPI">("CASH");
    const [markPaidLoading, setMarkPaidLoading] = useState(false);
    // Discount
    const [discountType, setDiscountType] = useState<"none" | "fixed" | "percent">("none");
    const [discountValue, setDiscountValue] = useState<number>(0);
    // Notification email override
    const [notifEmail, setNotifEmail] = useState<string>("");

    // Filters
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    const [filterMonth, setFilterMonth] = useState(currentMonth);
    const [filterYear, setFilterYear] = useState(currentYear);
    const [filterStatus, setFilterStatus] = useState<string>("all");
    const [filterClass, setFilterClass] = useState<string>("all");
    const [search, setSearch] = useState("");

    const fetchRecords = useCallback(async () => {
        setLoading(true);
        try {
            // ── 1. Fetch school fee records ───────────────────────────────────────
            const classesSnap = await getDocs(collection(db, "fees", "structure", "classes"));
            const classIds = classesSnap.docs.map(d => d.id);

            const promises = classIds.map(classId =>
                getDocs(collection(db, `feeRecords/${filterYear}/months/${filterMonth}/classes/${classId}/records`))
            );
            const snapshots = await Promise.all(promises);
            const schoolRecords = snapshots.flatMap(snap =>
                snap.docs
                    .map(d => ({ id: d.id, path: d.ref.path, ...d.data() } as FeeRecord))
                    .filter(r => r.status !== "carried_forward") // hide records merged into newer months
            );


            // ── 2. Fetch transport fee records for the SAME month+year ────────────
            const transportSnap = await getDocs(
                collection(db, "transportFeeRecords", filterYear.toString(), "months", filterMonth.toString(), "students")
            ).catch(() => ({ docs: [] as any[] }));

            // Map: studentUID → transport record data
            const transportMap: Record<string, {
                status: string;
                receiptNo: string | null;
                amount: number;
                previousDues: number;
                totalAmount: number;
                studentName: string;
                className: string;
                section: string;
                parentEmail: string;
                dueDate: any;
            }> = {};
            for (const d of transportSnap.docs) {
                const td = d.data();
                if (td.status === "carried_forward") continue; // skip old merged records
                transportMap[d.id] = {
                    status: td.status || "pending",
                    receiptNo: td.receiptNo || null,
                    amount: td.amount || 0,
                    previousDues: td.previousDues || 0,
                    totalAmount: td.totalAmount || td.amount || 0,
                    studentName: td.studentName || "",
                    className: td.className || "",
                    section: td.section || "",
                    parentEmail: td.parentEmail || "",
                    dueDate: td.dueDate || null,
                };
            }

            // ── 3. Merge transport into school records ────────────────────────────
            // Use studentId (UID) for lookup — this is what transport records are keyed by
            const schoolUids = new Set<string>();
            const merged: FeeRecord[] = schoolRecords.map(r => {
                const uid = r.studentId || r.id;
                schoolUids.add(uid);
                const t = transportMap[uid];
                if (t) {
                    return {
                        ...r,
                        transportStatus: t.status as any,
                        transportFeeAmount: t.amount,
                        transportPreviousDues: t.previousDues,
                        transportTotalAmount: t.totalAmount,
                        transportReceiptNo: t.receiptNo,
                    };
                }
                return r;
            });

            // ── 4. Add transport-ONLY students (in transport records but no school fee) ──
            for (const [uid, t] of Object.entries(transportMap)) {
                if (!schoolUids.has(uid)) {
                    merged.push({
                        id: uid,
                        path: "",
                        studentId: uid,
                        studentName: t.studentName,
                        rollNo: "",
                        class: t.className,
                        section: t.section,
                        parentEmail: t.parentEmail,
                        amount: 0,           // no school fee
                        month: filterMonth,
                        year: filterYear,
                        dueDate: t.dueDate,
                        status: "paid",      // placeholder — school fee doesn't exist
                        transportStatus: t.status as any,
                        transportFeeAmount: t.amount,
                        transportPreviousDues: t.previousDues,
                        transportTotalAmount: t.totalAmount,
                        transportReceiptNo: t.receiptNo,
                        paidOn: null,
                        receiptNo: null,
                        isTransportOnly: true,
                    });
                }
            }

            merged.sort((a, b) => {
                const cmp = (a.class || "").localeCompare(b.class || "", undefined, { numeric: true });
                if (cmp !== 0) return cmp;
                return (a.studentName || "").localeCompare(b.studentName || "");
            });

            setRecords(merged);
        } catch (err: any) {
            toast.error("Failed to load fee records");
        } finally {
            setLoading(false);
        }
    }, [filterMonth, filterYear]);

    useEffect(() => { fetchRecords(); }, [fetchRecords]);

    // ---------- Mark Paid Logic ----------
    const openMarkPaidDialog = (record: FeeRecord) => {
        // hasTransport: only if a real transport record exists (transportFeeAmount set from transportFeeRecords)
        const hasTransport = (record.transportFeeAmount || 0) > 0;
        setMarkPaidType(hasTransport ? "both" : "school");
        setMarkPaidRecord(record);
        setPaymentMode("CASH");
        setDiscountType("none");
        setDiscountValue(0);
        // Pre-fill notification email if stored on record (parentEmail that's not an auth email)
        const stored = record.parentEmail || "";
        const isAuthEmail = stored.includes("@ias.edu") || stored.includes("@school.");
        setNotifEmail(isAuthEmail ? "" : stored);
    };

    // Compute discount amount from current markPaidRecord
    const computeDiscount = (baseTotal: number) => {
        if (discountType === "fixed") return Math.min(discountValue, baseTotal);
        if (discountType === "percent") return Math.min((discountValue / 100) * baseTotal, baseTotal);
        return 0;
    };

    const handleConfirmMarkPaid = async () => {
        if (!markPaidRecord) return;
        const record = markPaidRecord;
        setMarkPaidLoading(true);
        try {
            const studentUid = record.studentId || record.id;

            if (markPaidType === "school" || markPaidType === "both") {
                const seq = Math.floor(Math.random() * 90000) + 10000;
                const receiptNo = `REC-${record.year}-${String(record.month).padStart(2, "0")}-${seq}`;
                const schoolBaseTotal = record.totalAmount || record.amount;
                const schoolDiscount = computeDiscount(schoolBaseTotal);
                const schoolTotalPaid = schoolBaseTotal - schoolDiscount;
                const discountFields = discountType !== "none" && schoolDiscount > 0 ? {
                    discountType,
                    discountAmount: schoolDiscount,
                    discountPercent: discountType === "percent" ? discountValue : parseFloat(((schoolDiscount / schoolBaseTotal) * 100).toFixed(2)),
                } : {};
                await updateDoc(doc(db, record.path), {
                    status: "paid",
                    paidOn: new Date(),
                    receiptNo,
                    paymentMode,
                    markedBy: user?.uid || "",
                    totalAmountPaid: schoolTotalPaid,
                    ...discountFields,
                });
                setRecords(prev => prev.map(r =>
                    r.id === record.id ? { ...r, status: "paid", receiptNo, paidOn: { toDate: () => new Date() } } : r
                ));
                toast.success(`School fee marked paid! Receipt: ${receiptNo}`);

                // ── CLEAR CARRIED-FORWARD ARREAR RECORDS ────────────────────
                // When April is paid (which includes March dues), also mark
                // March's "carried_forward" record as "paid" automatically.
                try {
                    const arrearsIds: string[] = (record as any).arrearsDetails || [];
                    if (arrearsIds.length > 0 && (record.previousDues || 0) > 0) {
                        for (const arrearId of arrearsIds) {
                            // arrearId format: "studentId_year_MM"
                            const parts = arrearId.split("_");
                            if (parts.length >= 3) {
                                // Reconstruct path: feeRecords/{year}/months/{month}/classes/{class}/records/{id}
                                // We scan backwards from current month to find it
                                let prevMonth = record.month - 1;
                                let prevYear = record.year;
                                if (prevMonth <= 0) { prevMonth = 12; prevYear -= 1; }

                                const prevRef = doc(
                                    db,
                                    `feeRecords/${prevYear}/months/${prevMonth}/classes/${record.class}/records`,
                                    arrearId
                                );
                                const prevSnap = await getDoc(prevRef);
                                if (prevSnap.exists() && prevSnap.data()?.status === "carried_forward") {
                                    await updateDoc(prevRef, {
                                        status: "paid",
                                        paidOn: new Date(),
                                        clearedViaReceiptNo: receiptNo,
                                        clearedViaMonth: record.month,
                                        clearedViaYear: record.year,
                                    });
                                    setRecords(prev => prev.map(r =>
                                        r.id === arrearId ? { ...r, status: "paid" } : r
                                    ));
                                }
                            }
                        }
                    }
                } catch { /* best-effort — previous dues clearing */ }
                // ── END CLEAR CARRIED-FORWARD ────────────────────────────────

                // ── RECONCILE STALE DUES (if March was paid BEFORE April) ────
                // If someone paid March separately first, April's record may
                // still have stale previousDues — deduct from next month.
                try {
                    const paidAmount = record.totalAmount || record.amount;
                    let nextMonth = record.month + 1;
                    let nextYear = record.year;
                    if (nextMonth > 12) { nextMonth = 1; nextYear += 1; }

                    const nextRecordId = `${studentUid}_${nextYear}_${String(nextMonth).padStart(2, "0")}`;
                    const nextRef = doc(db, `feeRecords/${nextYear}/months/${nextMonth}/classes/${record.class}/records`, nextRecordId);
                    const nextSnap = await getDoc(nextRef);

                    if (nextSnap.exists()) {
                        const nextData = nextSnap.data() as any;
                        if ((nextData.previousDues || 0) > 0 && nextData.status !== "paid") {
                            const newPrevDues = Math.max(0, (nextData.previousDues || 0) - paidAmount);
                            const newTotal = (nextData.amount || 0) + newPrevDues;
                            await updateDoc(nextRef, { previousDues: newPrevDues, totalAmount: newTotal });
                            setRecords(prev => prev.map(r =>
                                r.id === nextRecordId ? { ...r, previousDues: newPrevDues, totalAmount: newTotal } : r
                            ));
                        }
                    }
                } catch { /* best-effort */ }
                // ── END RECONCILE ────────────────────────────────────────────


                // Send Receipt via Email
                const schoolBreakdownItems: { label: string; amount: number }[] = [
                    { label: "Tuition Fee", amount: record.breakdown?.tuitionFee || 0 },
                    { label: "Annual Fee", amount: record.breakdown?.annualFee || 0 },
                    { label: "Admission Fee", amount: record.breakdown?.admissionFee || 0 },
                    { label: "Registration Fee", amount: record.breakdown?.registrationFee || 0 },
                    { label: "Sports Fee", amount: record.breakdown?.sportsFee || 0 },
                    { label: "Miscellaneous Fee", amount: record.breakdown?.miscFee || 0 },
                ].filter(item => item.amount > 0);
                if (schoolBreakdownItems.length === 0) schoolBreakdownItems.push({ label: "School Fee (Current Month)", amount: record.amount });

                // Add Previous Dues line if carried forward
                if ((record.previousDues || 0) > 0) {
                    schoolBreakdownItems.push({ label: "Previous Dues (Arrears)", amount: record.previousDues! });
                }

                // Add discount line item (negative)
                const schoolBaseTotal2 = record.totalAmount || record.amount;
                const schoolDiscountAmt = computeDiscount(schoolBaseTotal2);
                if (schoolDiscountAmt > 0) {
                    const pct = discountType === "percent" ? ` (${discountValue}%)` : ``;
                    schoolBreakdownItems.push({ label: `Discount Applied${pct}`, amount: -schoolDiscountAmt });
                }

                fetch("/api/send-receipt", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        studentId: studentUid,
                        ...(notifEmail ? { to: notifEmail } : {}),
                        receiptData: {
                            title: "School Fee Receipt",
                            receiptNo,
                            studentName: record.studentName,
                            classSection: `Class ${record.class}${record.section ? ` - ${record.section}` : ""}`,
                            rollNo: record.rollNo || undefined,
                            paidOn: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
                            feeMonth: `${MONTHS[(record.month || 1) - 1]} ${record.year}`,
                            lineItems: schoolBreakdownItems,
                            totalAmount: schoolTotalPaid,
                            paymentMode
                        }
                    })
                }).catch(console.error);
            }

            if (markPaidType === "transport" || markPaidType === "both") {
                const seq = Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 5).toUpperCase();
                const transportReceiptNo = `TRP-${record.year}-${String(record.month).padStart(2, "0")}-${seq}`;
                const transpBaseTotal = record.transportTotalAmount || record.transportFeeAmount || 0;
                const transpDiscount = computeDiscount(transpBaseTotal);
                const transpTotalPaid = transpBaseTotal - transpDiscount;
                const transpDiscountFields = discountType !== "none" && transpDiscount > 0 ? {
                    discountType,
                    discountAmount: transpDiscount,
                    discountPercent: discountType === "percent" ? discountValue : parseFloat(((transpDiscount / transpBaseTotal) * 100).toFixed(2)),
                } : {};
                await setDoc(doc(db, "transportFeeRecords", record.year.toString(), "months", record.month.toString(), "students", studentUid), {
                    studentId: studentUid,
                    studentName: record.studentName,
                    className: record.class,
                    section: record.section || "",
                    busId: "BUS",
                    busNumber: "—",
                    routeDetails: "",
                    amount: record.transportFeeAmount || 0,
                    previousDues: record.transportPreviousDues || 0,
                    totalAmount: transpBaseTotal,
                    totalAmountPaid: transpTotalPaid,
                    month: record.month,
                    year: record.year,
                    dueDate: record.dueDate,
                    status: "paid",
                    paidOn: new Date(),
                    receiptNo: transportReceiptNo,
                    paymentMode,
                    parentEmail: record.parentEmail || "",
                    markedBy: user?.uid || "",
                    ...transpDiscountFields,
                }, { merge: true });
                setRecords(prev => prev.map(r =>
                    r.id === record.id ? { ...r, transportStatus: "paid", transportReceiptNo } : r
                ));
                toast.success(`Transport fee marked paid! Receipt: ${transportReceiptNo}`);

                // ── CLEAR CARRIED-FORWARD TRANSPORT ARREARS ─────────────────
                // When April transport (with March dues) is paid, also mark
                // March's "carried_forward" transport record as "paid".
                try {
                    if ((record.transportPreviousDues || 0) > 0) {
                        let prevMonth = (record.month || 1) - 1;
                        let prevYear = record.year;
                        if (prevMonth <= 0) { prevMonth = 12; prevYear -= 1; }

                        const prevTransRef = doc(
                            db, "transportFeeRecords",
                            prevYear.toString(), "months", prevMonth.toString(), "students", studentUid
                        );
                        const prevTransSnap = await getDoc(prevTransRef);
                        if (prevTransSnap.exists() && prevTransSnap.data()?.status === "carried_forward") {
                            await updateDoc(prevTransRef, {
                                status: "paid",
                                paidOn: new Date(),
                                clearedViaReceiptNo: transportReceiptNo,
                                clearedViaMonth: record.month,
                                clearedViaYear: record.year,
                            });
                        }
                    }
                } catch { /* best-effort */ }
                // ── END CLEAR TRANSPORT CARRIED-FORWARD ──────────────────────

                // ── RECONCILE STALE TRANSPORT DUES (if paid separately first) 
                try {
                    const transpPaidAmount = transpBaseTotal;
                    let nextMonth = (record.month || 1) + 1;
                    let nextYear = record.year;
                    if (nextMonth > 12) { nextMonth = 1; nextYear += 1; }

                    const nextTransRef = doc(
                        db, "transportFeeRecords",
                        nextYear.toString(), "months", nextMonth.toString(), "students", studentUid
                    );
                    const nextTransSnap = await getDoc(nextTransRef);
                    if (nextTransSnap.exists()) {
                        const ntd = nextTransSnap.data() as any;
                        if ((ntd.previousDues || 0) > 0 && ntd.status !== "paid") {
                            const newPrevDues = Math.max(0, (ntd.previousDues || 0) - transpPaidAmount);
                            await updateDoc(nextTransRef, {
                                previousDues: newPrevDues,
                                totalAmount: (ntd.amount || 0) + newPrevDues,
                            });
                        }
                    }
                } catch { /* best-effort */ }
                // ── END RECONCILE TRANSPORT ──────────────────────────────────



                const transportLineItems: { label: string; amount: number }[] = [
                    { label: "Transport / Bus Fee (Current Month)", amount: record.transportFeeAmount || 0 },
                ];
                if ((record.transportPreviousDues || 0) > 0) {
                    transportLineItems.push({ label: "Previous Transport Dues (Arrears)", amount: record.transportPreviousDues! });
                }
                // Discount line for transport
                const transpDiscountAmt2 = computeDiscount(transpBaseTotal);
                if (transpDiscountAmt2 > 0) {
                    const pct = discountType === "percent" ? ` (${discountValue}%)` : ``;
                    transportLineItems.push({ label: `Discount Applied${pct}`, amount: -transpDiscountAmt2 });
                }

                fetch("/api/send-receipt", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        studentId: studentUid,
                        ...(notifEmail ? { to: notifEmail } : {}),
                        receiptData: {
                            title: "Transport Fee Receipt",
                            receiptNo: transportReceiptNo,
                            studentName: record.studentName,
                            classSection: `Class ${record.class}${record.section ? ` - ${record.section}` : ""}`,
                            rollNo: record.rollNo || undefined,
                            paidOn: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
                            feeMonth: `${MONTHS[(record.month || 1) - 1]} ${record.year}`,
                            lineItems: transportLineItems,
                            totalAmount: transpTotalPaid,
                            paymentMode
                        }
                    })
                }).catch(console.error);
            }

            setMarkPaidRecord(null);
        } catch {
            toast.error("Failed to mark as paid");
        } finally {
            setMarkPaidLoading(false);
        }
    };

    // Mark fee as overdue
    const handleMarkOverdue = async (record: FeeRecord) => {
        setActionLoading(record.id + "_overdue");
        try {
            await updateDoc(doc(db, record.path), { status: "overdue" });
            setRecords(prev => prev.map(r =>
                r.id === record.id ? { ...r, status: "overdue" } : r
            ));
            toast.success("Marked as overdue");
        } catch {
            toast.error("Failed to update status");
        } finally {
            setActionLoading(null);
        }
    };

    // Send email reminder
    const handleSendReminder = async (record: FeeRecord) => {
        if (!record.parentEmail) {
            toast.error("No parent email found for this student");
            return;
        }
        setActionLoading(record.id + "_email");
        try {
            const dueDate = record.dueDate?.toDate ? record.dueDate.toDate().toLocaleDateString("en-IN") : "N/A";
            const isOverdue = record.status === "overdue";

            const subject = isOverdue
                ? `⚠️ Fee Overdue — ${record.studentName} (Class ${record.class})`
                : `📌 Fee Reminder — ${record.studentName} (Class ${record.class})`;

            const html = `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; background: #f4f4f4; padding: 20px;">
  <div style="max-width: 520px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.08);">
    <div style="background: #0f2044; padding: 28px 32px; text-align: center;">
      <h2 style="color: white; margin: 0; font-size: 20px;">International Access School</h2>
      <p style="color: rgba(255,255,255,0.6); margin: 6px 0 0; font-size: 13px;">Finance Department</p>
    </div>
    <div style="padding: 28px 32px;">
      <p style="color: #333; font-size: 15px; margin-bottom: 20px;">Dear Parent/Guardian,</p>
      <p style="color: #555; font-size: 14px; line-height: 1.6;">
        ${isOverdue
                    ? `This is to inform you that the school fee for your child <strong>${record.studentName}</strong> is <span style="color: #e53e3e; font-weight: bold;">OVERDUE</span>. Please pay immediately to avoid any academic penalties.`
                    : `This is a friendly reminder that the school fee for your child <strong>${record.studentName}</strong> is due soon. Please ensure timely payment.`
                }
      </p>
      <div style="background: #f8f9fa; border-radius: 10px; padding: 18px; margin: 20px 0;">
        <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
          <tr><td style="color: #888; padding: 4px 0;">Student</td><td style="font-weight: bold; color: #0f2044;">${record.studentName}</td></tr>
          <tr><td style="color: #888; padding: 4px 0;">Class</td><td style="font-weight: bold; color: #0f2044;">Class ${record.class}${record.section ? " - " + record.section : ""}</td></tr>
          <tr><td style="color: #888; padding: 4px 0;">Month</td><td style="font-weight: bold; color: #0f2044;">${MONTHS[(record.month || 1) - 1]} ${record.year}</td></tr>
          <tr><td style="color: #888; padding: 4px 0;">Amount Due</td><td style="font-weight: bold; color: #0f2044; font-size: 16px;">₹${record.amount?.toLocaleString()}</td></tr>
          <tr><td style="color: #888; padding: 4px 0;">Due Date</td><td style="font-weight: bold; color: ${isOverdue ? "#e53e3e" : "#0f2044"};">${dueDate}</td></tr>
        </table>
      </div>
      <p style="color: #555; font-size: 13px;">Please visit the school office to complete your payment. For queries, contact us at ${process.env.EMAIL_USER || "school@example.com"}.</p>
    </div>
    <div style="background: #f8f9fa; padding: 16px 32px; text-align: center; border-top: 1px solid #eee;">
      <p style="color: #aaa; font-size: 12px; margin: 0;">International Access School — Finance Department</p>
    </div>
  </div>
</body>
</html>`;

            const res = await authFetch("/api/send-email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ to: record.parentEmail, subject, html }),
            });

            if (res.ok) {
                toast.success(`Reminder sent to ${record.parentEmail}`);
            } else {
                toast.error("Failed to send email");
            }
        } catch {
            toast.error("Failed to send reminder");
        } finally {
            setActionLoading(null);
        }
    };

    // Filter records
    const classes = [...new Set(records.map(r => r.class).filter(c => c != null && c !== ""))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const filtered = records.filter(r => {
        if (filterStatus !== "all" && r.status !== filterStatus) return false;
        if (filterClass !== "all" && r.class !== filterClass) return false;
        if (search && !r.studentName?.toLowerCase().includes(search.toLowerCase()) &&
            !r.rollNo?.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    });

    const stats = {
        total: records.length,
        paid: records.filter(r => r.status === "paid").length,
        pending: records.filter(r => r.status === "pending").length,
        overdue: records.filter(r => r.status === "overdue").length,
        collected: records.filter(r => r.status === "paid").reduce((sum, r) => sum + (r.amount || 0), 0),
        pending_amount: records.filter(r => r.status !== "paid").reduce((sum, r) => sum + (r.amount || 0), 0),
    };

    const years = Array.from({ length: 2050 - 2024 + 1 }, (_, i) => 2024 + i);

    // A student is a "bus student" ONLY if they have an actual transport record for this month/year
    // (transportFeeAmount is set from transportFeeRecords, NOT from breakdown)
    const hasTransportFee = (r: FeeRecord) => (r.transportFeeAmount || 0) > 0;
    const isSchoolPaid = (r: FeeRecord) => r.status === "paid";
    const isTransportPaid = (r: FeeRecord) => r.transportStatus === "paid";

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="rounded-2xl gradient-navy p-6 md:p-8 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10"
                    style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.2) 0%, transparent 50%)` }}
                />
                <div className="relative z-10">
                    <p className="text-white/50 text-sm font-medium">Finance Portal</p>
                    <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">Manage Fees</h1>
                    <p className="text-white/40 text-sm mt-2">View, track and manage fee payments for all students.</p>
                </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: "Total Collected", value: `₹${stats.collected.toLocaleString()}`, bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
                    { label: "Pending Amount", value: `₹${stats.pending_amount.toLocaleString()}`, bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
                    { label: "Paid", value: `${stats.paid} / ${stats.total}`, bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
                    { label: "Overdue", value: stats.overdue.toString(), bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
                ].map(s => (
                    <div key={s.label} className={`${s.bg} border ${s.border} rounded-2xl p-4`}>
                        <div className={`text-xl font-bold ${s.text}`}>{s.value}</div>
                        <div className={`text-xs ${s.text} opacity-70 mt-0.5`}>{s.label}</div>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <div className="flex flex-wrap gap-3">
                    <select value={filterMonth} onChange={e => setFilterMonth(Number(e.target.value))}
                        className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-gold outline-none">
                        {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                    </select>
                    <select value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}
                        className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-gold outline-none">
                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                        className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-gold outline-none">
                        <option value="all">All Status</option>
                        <option value="pending">Pending</option>
                        <option value="paid">Paid</option>
                        <option value="overdue">Overdue</option>
                    </select>
                    <select value={filterClass} onChange={e => setFilterClass(e.target.value)}
                        className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-gold outline-none">
                        <option value="all">All Classes</option>
                        {classes.map(c => <option key={c} value={c}>Class {c}</option>)}
                    </select>
                    <div className="flex-1 min-w-[160px] relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="Search student..."
                            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-gold outline-none" />
                    </div>
                    <button onClick={fetchRecords}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:border-navy hover:text-navy transition-colors">
                        <RefreshCw className="w-4 h-4" />Refresh
                    </button>
                </div>
            </div>

            {/* Records Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="font-semibold text-navy">
                        Fee Records — {MONTHS[filterMonth - 1]} {filterYear}
                    </h2>
                    <span className="text-xs text-gray-400">{filtered.length} records</span>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="w-8 h-8 animate-spin text-navy" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-16 text-gray-400">
                        <Banknote className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p className="text-sm font-medium">No fee records found</p>
                        <p className="text-xs mt-1">Try changing the month/year or generate fees first.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wider">
                                <tr>
                                    <th className="px-4 py-3 text-left font-semibold">Student</th>
                                    <th className="px-4 py-3 text-left font-semibold">Class</th>
                                    <th className="px-4 py-3 text-left font-semibold">Bill</th>
                                    <th className="px-4 py-3 text-left font-semibold">Due Date</th>
                                    <th className="px-4 py-3 text-left font-semibold">Status</th>
                                    <th className="px-4 py-3 text-left font-semibold">Receipt</th>
                                    <th className="px-4 py-3 text-left font-semibold">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filtered.map(record => {
                                    const statusCfg = STATUS_CONFIG[record.status] || STATUS_CONFIG.pending;
                                    const StatusIcon = statusCfg.icon;
                                    const transportFee = record.transportFeeAmount || 0;
                                    const isBusStudent = transportFee > 0 || record.isTransportOnly;
                                    const schoolFeeOnly = record.amount; // school amount never includes transport anymore
                                    const schoolPaid = isSchoolPaid(record);
                                    const transportPaid = isTransportPaid(record);
                                    return (
                                        <tr key={record.id} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="font-medium text-navy">{record.studentName}</div>
                                                {record.rollNo && <div className="text-xs text-gray-400">Roll: {record.rollNo}</div>}
                                            </td>
                                            <td className="px-4 py-3 text-gray-600">
                                                Class {record.class}{record.section ? ` - ${record.section}` : ""}
                                            </td>
                                            {/* Combined Bill Column */}
                                            <td className="px-4 py-3">
                                                {record.isTransportOnly ? (
                                                    // Transport-only student — no school fee record
                                                    <div className="text-xs text-indigo-500 font-medium">— (transport only)</div>
                                                ) : (
                                                    <div>
                                                        <div className="font-bold text-navy">₹{(record.totalAmount || record.amount)?.toLocaleString()}</div>
                                                        {(record.previousDues || 0) > 0 && (
                                                            <div className="text-xs text-rose-500 mt-0.5">
                                                                incl. ₹{record.previousDues?.toLocaleString()} prev. dues
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                {isBusStudent && (
                                                    <div className="text-xs text-gray-400 mt-0.5 space-y-0.5">
                                                        {!record.isTransportOnly && (
                                                            <div className="flex items-center gap-1">
                                                                <School className="w-2.5 h-2.5" />
                                                                <span>School: ₹{(record.totalAmount || record.amount).toLocaleString()}</span>
                                                                {schoolPaid && <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500" />}
                                                            </div>
                                                        )}
                                                        <div className="flex items-center gap-1">
                                                            <Bus className="w-2.5 h-2.5" />
                                                            <span>Transport: ₹{(record.transportTotalAmount || transportFee).toLocaleString()}</span>
                                                            {(record.transportPreviousDues || 0) > 0 && (
                                                                <span className="text-rose-400">(+₹{record.transportPreviousDues?.toLocaleString()} prev)</span>
                                                            )}
                                                            {transportPaid && <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500" />}
                                                        </div>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-gray-500 text-xs">
                                                {record.dueDate?.toDate ? record.dueDate.toDate().toLocaleDateString("en-IN") : "—"}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="space-y-1">
                                                    {/* School status — NOT generated for transport-only students */}
                                                    {record.isTransportOnly ? (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-gray-50 text-gray-400 border-gray-200">
                                                            <School className="w-3 h-3" />
                                                            School: Not Generated
                                                        </span>
                                                    ) : (
                                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}>
                                                            <StatusIcon className="w-3 h-3" />
                                                            {isBusStudent ? `School: ${statusCfg.label}` : statusCfg.label}
                                                        </span>
                                                    )}
                                                    {/* Transport status */}
                                                    {isBusStudent && (() => {
                                                        const tCfg = STATUS_CONFIG[record.transportStatus || "pending"] || STATUS_CONFIG.pending;
                                                        const TIcon = tCfg.icon;
                                                        return (
                                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${tCfg.bg} ${tCfg.text} ${tCfg.border}`}>
                                                                <Bus className="w-3 h-3" />
                                                                Transport: {tCfg.label}
                                                            </span>
                                                        );
                                                    })()}
                                                    {!record.isTransportOnly && record.status === "paid" && record.paidOn?.toDate && (
                                                        <div className="text-xs text-gray-400">
                                                            {record.paidOn.toDate().toLocaleDateString("en-IN")}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-xs font-mono space-y-1">
                                                {record.receiptNo
                                                    ? <div className="text-gray-400">{record.receiptNo}</div>
                                                    : <div className="text-gray-300">—</div>}
                                                {isBusStudent && record.transportReceiptNo && (
                                                    <div className="text-indigo-400">{record.transportReceiptNo}</div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    {/* Mark Paid — show if either school or transport is unpaid */}
                                                    {(!schoolPaid || (isBusStudent && !transportPaid)) && (
                                                        <button
                                                            onClick={() => openMarkPaidDialog(record)}
                                                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100 transition-colors"
                                                        >
                                                            <CheckCircle2 className="w-3 h-3" />
                                                            Mark Paid
                                                        </button>
                                                    )}
                                                    {record.status === "pending" && (
                                                        <button
                                                            onClick={() => handleMarkOverdue(record)}
                                                            disabled={actionLoading === record.id + "_overdue"}
                                                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-50 text-rose-700 text-xs font-medium hover:bg-rose-100 transition-colors disabled:opacity-50"
                                                        >
                                                            {actionLoading === record.id + "_overdue" ? (
                                                                <Loader2 className="w-3 h-3 animate-spin" />
                                                            ) : (
                                                                <AlertCircle className="w-3 h-3" />
                                                            )}
                                                            Overdue
                                                        </button>
                                                    )}
                                                    {record.status !== "paid" && (
                                                        <button
                                                            onClick={() => handleSendReminder(record)}
                                                            disabled={actionLoading === record.id + "_email"}
                                                            title={record.parentEmail || "No email on file"}
                                                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100 transition-colors disabled:opacity-50"
                                                        >
                                                            {actionLoading === record.id + "_email" ? (
                                                                <Loader2 className="w-3 h-3 animate-spin" />
                                                            ) : (
                                                                <Mail className="w-3 h-3" />
                                                            )}
                                                            Remind
                                                        </button>
                                                    )}
                                                    {record.status !== "paid" && (
                                                        <a
                                                            href={`https://wa.me/91${record.parentPhone || ""}?text=${encodeURIComponent(
                                                                `Dear Parent, school fee for ${record.studentName} (Class ${record.class}) of ₹${record.amount} for ${MONTHS[(record.month || 1) - 1]} ${record.year} is ${record.status}. Please pay at the earliest. - International Access School`
                                                            )}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-50 text-green-700 text-xs font-medium hover:bg-green-100 transition-colors"
                                                        >
                                                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                                                            </svg>
                                                            WhatsApp
                                                        </a>
                                                    )}
                                                    {/* School receipt */}
                                                    {!record.isTransportOnly && record.status === "paid" && (
                                                        <button
                                                            onClick={() => setSelectedReceipt({ ...record, receiptType: "school" })}
                                                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-medium hover:bg-gray-200 transition-colors"
                                                        >
                                                            <CheckCircle2 className="w-3 h-3" />
                                                            School Receipt
                                                        </button>
                                                    )}
                                                    {/* Transport receipt */}
                                                    {isBusStudent && record.transportStatus === "paid" && record.transportReceiptNo && (
                                                        <button
                                                            onClick={() => setSelectedReceipt({ ...record, receiptType: "transport" })}
                                                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-medium hover:bg-indigo-100 transition-colors"
                                                        >
                                                            <Bus className="w-3 h-3" />
                                                            Transport Receipt
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

            {/* Receipt Modal */}
            <FeeReceiptModal
                record={selectedReceipt}
                onClose={() => setSelectedReceipt(null)}
            />

            {/* ── Mark Paid Dialog ───────────────────────────────────────────── */}
            {markPaidRecord && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                        {/* Dialog Header */}
                        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
                            <div>
                                <h3 className="text-lg font-bold text-navy">Mark Fee as Paid</h3>
                                <p className="text-sm text-gray-400 mt-0.5">{markPaidRecord.studentName} · {MONTHS[markPaidRecord.month - 1]} {markPaidRecord.year}</p>
                            </div>
                            <button onClick={() => setMarkPaidRecord(null)} className="p-2 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Bill Summary */}
                        <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
                            <div className="space-y-2">
                                {(() => {
                                    const transportFee = markPaidRecord.transportFeeAmount || 0;
                                    const schoolFeeBase = markPaidRecord.amount;
                                    const schoolPrevDues = markPaidRecord.previousDues || 0;
                                    const schoolTotal = markPaidRecord.totalAmount || (schoolFeeBase + schoolPrevDues);
                                    const transportPrevDues = markPaidRecord.transportPreviousDues || 0;
                                    const transportTotal = markPaidRecord.transportTotalAmount || (transportFee + transportPrevDues);
                                    return (
                                        <>
                                            {!markPaidRecord.isTransportOnly && (
                                                <>
                                                    <div className="flex justify-between text-sm">
                                                        <span className="flex items-center gap-1.5 text-gray-600"><School className="w-4 h-4" /> School Fee (Current)</span>
                                                        <span className="font-semibold text-navy">₹{schoolFeeBase.toLocaleString()}</span>
                                                    </div>
                                                    {schoolPrevDues > 0 && (
                                                        <div className="flex justify-between text-sm">
                                                            <span className="flex items-center gap-1.5 text-rose-500"><AlertCircle className="w-4 h-4" /> Previous School Dues</span>
                                                            <span className="font-semibold text-rose-600">₹{schoolPrevDues.toLocaleString()}</span>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                            {transportFee > 0 && (
                                                <>
                                                    <div className="flex justify-between text-sm">
                                                        <span className="flex items-center gap-1.5 text-gray-600"><Bus className="w-4 h-4" /> Transport Fee (Current)</span>
                                                        <span className="font-semibold text-navy">₹{transportFee.toLocaleString()}</span>
                                                    </div>
                                                    {transportPrevDues > 0 && (
                                                        <div className="flex justify-between text-sm">
                                                            <span className="flex items-center gap-1.5 text-rose-500"><AlertCircle className="w-4 h-4" /> Previous Transport Dues</span>
                                                            <span className="font-semibold text-rose-600">₹{transportPrevDues.toLocaleString()}</span>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                            <div className="flex justify-between font-bold text-navy border-t border-gray-200 pt-2 mt-1">
                                                <span>Total Payable</span>
                                                <span>₹{(schoolTotal + transportTotal).toLocaleString()}</span>
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                        </div>

                        {/* Options */}
                        <div className="px-6 py-5 space-y-3">
                            <p className="text-sm font-semibold text-gray-700 mb-3">Which fee has been paid?</p>

                            {([
                                ...(!markPaidRecord.isTransportOnly ? [
                                    { value: "school" as MarkPaidType, label: "School Fee Only", desc: `₹${markPaidRecord.amount.toLocaleString()}`, icon: School, disabled: isSchoolPaid(markPaidRecord) },
                                ] : []),
                                ...(hasTransportFee(markPaidRecord) ? [
                                    { value: "transport" as MarkPaidType, label: "Transport Fee Only", desc: `₹${(markPaidRecord.transportFeeAmount || 0).toLocaleString()}`, icon: Bus, disabled: isTransportPaid(markPaidRecord) },
                                    ...(!markPaidRecord.isTransportOnly ? [
                                        { value: "both" as MarkPaidType, label: "Both (School + Transport)", desc: `₹${(markPaidRecord.amount + (markPaidRecord.transportFeeAmount || 0)).toLocaleString()}`, icon: CheckCircle2, disabled: isSchoolPaid(markPaidRecord) && isTransportPaid(markPaidRecord) },
                                    ] : []),
                                ] : []),
                            ] as { value: MarkPaidType; label: string; desc: string; icon: any; disabled: boolean }[]).map(opt => (
                                <label
                                    key={opt.value}
                                    className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${opt.disabled ? "opacity-40 cursor-not-allowed border-gray-100 bg-gray-50" : markPaidType === opt.value ? "border-emerald-400 bg-emerald-50" : "border-gray-100 hover:border-gray-300"}`}
                                >
                                    <input
                                        type="radio"
                                        name="markPaidType"
                                        value={opt.value}
                                        checked={markPaidType === opt.value}
                                        onChange={() => !opt.disabled && setMarkPaidType(opt.value)}
                                    />
                                    <opt.icon className={`w-5 h-5 shrink-0 ${markPaidType === opt.value ? "text-emerald-600" : "text-gray-400"}`} />
                                    <div className="flex-1">
                                        <p className={`text-sm font-semibold ${markPaidType === opt.value ? "text-emerald-700" : "text-gray-700"}`}>{opt.label}</p>
                                        <p className="text-xs text-gray-400">{opt.desc}{opt.disabled ? " — Already paid" : ""}</p>
                                    </div>
                                </label>
                            ))}
                            
                            <div className="pt-3 mt-3 border-t border-gray-100">
                                <p className="text-sm font-semibold text-gray-700 mb-3">Payment Mode</p>
                                <div className="grid grid-cols-2 gap-3">
                                    <label className={`flex justify-center items-center py-2.5 rounded-xl border-2 cursor-pointer font-semibold text-sm transition-all ${paymentMode === "CASH" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-100 hover:border-gray-300 text-gray-600"}`}>
                                        <input type="radio" name="paymentMode" value="CASH" checked={paymentMode === "CASH"} onChange={() => setPaymentMode("CASH")} className="hidden"/>
                                        💵 Cash
                                    </label>
                                    <label className={`flex justify-center items-center py-2.5 rounded-xl border-2 cursor-pointer font-semibold text-sm transition-all ${paymentMode === "UPI" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-100 hover:border-gray-300 text-gray-600"}`}>
                                        <input type="radio" name="paymentMode" value="UPI" checked={paymentMode === "UPI"} onChange={() => setPaymentMode("UPI")} className="hidden"/>
                                        📱 UPI
                                    </label>
                                </div>
                            </div>

                            {/* ── Discount Section ── */}
                            {(() => {
                                const baseTotal = (() => {
                                    const s = markPaidRecord!.totalAmount || markPaidRecord!.amount;
                                    const t = markPaidRecord!.transportTotalAmount || markPaidRecord!.transportFeeAmount || 0;
                                    if (markPaidType === "school") return s;
                                    if (markPaidType === "transport") return t;
                                    return s + t;
                                })();
                                const discAmt = discountType === "fixed"
                                    ? Math.min(discountValue, baseTotal)
                                    : discountType === "percent"
                                        ? Math.min((discountValue / 100) * baseTotal, baseTotal)
                                        : 0;
                                const netPayable = baseTotal - discAmt;
                                return (
                                    <div className="pt-3 mt-3 border-t border-gray-100">
                                        <p className="text-sm font-semibold text-gray-700 mb-2">Discount <span className="font-normal text-gray-400">(Optional)</span></p>
                                        {/* Type toggle */}
                                        <div className="flex gap-2 mb-2">
                                            {(["none", "fixed", "percent"] as const).map(t => (
                                                <button key={t} type="button"
                                                    onClick={() => { setDiscountType(t); setDiscountValue(0); }}
                                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all ${
                                                        discountType === t
                                                            ? "border-violet-500 bg-violet-50 text-violet-700"
                                                            : "border-gray-100 text-gray-500 hover:border-gray-300"
                                                    }`}>
                                                    {t === "none" ? "No Discount" : t === "fixed" ? "₹ Fixed" : "% Percent"}
                                                </button>
                                            ))}
                                        </div>
                                        {discountType !== "none" && (
                                            <div className="flex items-center gap-2 mb-3">
                                                <span className="text-sm font-bold text-gray-500">{discountType === "fixed" ? "₹" : "%"}</span>
                                                <input
                                                    type="number" min={0}
                                                    max={discountType === "percent" ? 100 : baseTotal}
                                                    value={discountValue || ""}
                                                    onChange={e => setDiscountValue(parseFloat(e.target.value) || 0)}
                                                    placeholder={discountType === "fixed" ? "Enter amount" : "Enter %"}
                                                    className="flex-1 px-3 py-2 border-2 border-violet-200 rounded-xl text-sm outline-none focus:border-violet-500 bg-violet-50/50"
                                                />
                                            </div>
                                        )}
                                        {/* Live total breakdown */}
                                        <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 space-y-1.5 text-sm">
                                            <div className="flex justify-between text-gray-500">
                                                <span>Subtotal</span><span>₹{baseTotal.toLocaleString()}</span>
                                            </div>
                                            {discAmt > 0 && (
                                                <div className="flex justify-between text-violet-600 font-medium">
                                                    <span>Discount {discountType === "percent" ? `(${discountValue}%)` : "(Fixed)"}</span>
                                                    <span>−₹{discAmt.toLocaleString()}</span>
                                                </div>
                                            )}
                                            <div className="flex justify-between font-bold text-navy border-t border-gray-200 pt-1.5 mt-1">
                                                <span>Net Payable</span><span>₹{netPayable.toLocaleString()}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>

                        {/* ── Notification Email Section ── */}
                        <div className="px-6 pb-2">
                            <div className="pt-3 border-t border-gray-100">
                                <p className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                                    <Mail className="w-4 h-4 text-gray-400" /> Receipt Email
                                </p>
                                {notifEmail ? (
                                    <div className="flex items-center gap-2 px-3 py-2.5 bg-emerald-50 border-2 border-emerald-200 rounded-xl">
                                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                        <span className="text-sm text-emerald-700 font-medium flex-1 truncate">{notifEmail}</span>
                                    </div>
                                ) : (
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-50 border-2 border-amber-200 rounded-xl">
                                            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                                            <span className="text-xs text-amber-600">No notification email — receipt will not be emailed</span>
                                        </div>
                                        <input
                                            type="email"
                                            value={notifEmail}
                                            onChange={e => setNotifEmail(e.target.value)}
                                            placeholder="Add parent/guardian email (optional)"
                                            className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 bg-white placeholder-gray-300 mt-1.5"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="px-6 pb-6 flex gap-3 mt-3">
                            <button onClick={() => setMarkPaidRecord(null)} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmMarkPaid}
                                disabled={markPaidLoading}
                                className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                            >
                                {markPaidLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                Confirm Payment
                            </button>
                        </div>

                    </div>
                </div>
            )}
        </div>
    );
}
