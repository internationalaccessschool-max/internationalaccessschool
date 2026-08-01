"use client";

import { authFetch } from "@/lib/auth-fetch";

import { useState, useEffect, useCallback } from "react";
import { collection, getDocs, doc, updateDoc, setDoc, getDoc, query, where, orderBy, limit, Timestamp, collectionGroup, deleteField, writeBatch, arrayUnion } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import {
    Banknote, Search, CheckCircle2, AlertCircle, Clock,
    Mail, Loader2, RefreshCw, Bus, School, X, RotateCcw, AlertTriangle
} from "lucide-react";

import toast from "react-hot-toast";
import FeeReceiptModal from "@/components/accountant/FeeReceiptModal";
import { getNextReceiptNo } from "@/lib/receipt-counter";

interface FeeRecord {
    id: string;
    path: string;
    studentId?: string;
    studentName: string;
    rollNo: string;
    admissionNumber?: string;  // may be stored separately from rollNo
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
    lateFine?: number;
}

type MarkPaidType = "school" | "transport" | "both";

/**
 * One unpaid past month shown in the Mark-Paid dialog's arrear list.
 * `key` is stable (`s:2026-4` / `t:2026-4`) so tick state survives re-renders,
 * and the same key is used when deciding which past records to settle.
 */
interface ArrearItem {
    key: string;
    kind: "school" | "transport";
    label: string;      // "Apr 2026"
    month: number;
    year: number;
    amount: number;
    status: string;     // carried_forward | pending | overdue
    path?: string;      // school records live under varying class folders
}

const arrearKey = (kind: "school" | "transport", year: number, month: number) => `${kind[0]}:${year}-${month}`;

/**
 * Written onto a bill the moment it is collected, so the payment can later be
 * undone completely instead of leaving half-reversed records behind.
 * Older payments have no log — those still reverse the single record only.
 */
interface ReverseLog {
    receiptNo?: string;
    /** Arrear months this receipt auto-settled — paths, class-change safe. */
    settled?: string[];
    /** Later bills whose previousDues this payment reduced, and by how much. */
    adjusted?: { path: string; delta: number }[];
    /** The bill's own values before it was marked paid. */
    prevStatus?: string;
    prevPreviousDues?: number;
    prevTotalAmount?: number;
}

/**
 * Puts back everything a payment changed elsewhere:
 *   • arrear months auto-settled by the same receipt → back to arrear
 *   • later bills whose previousDues were reduced → topped back up
 * A record touched by some other receipt in the meantime is left alone, and a
 * later bill that has since been collected is never re-billed.
 */
async function reversePaymentCascade(log: ReverseLog, mainDocId: string) {
    let restoredArrears = 0;
    let readjusted = 0;

    for (const path of log.settled || []) {
        try {
            const ref = doc(db, path);
            const snap = await getDoc(ref);
            if (!snap.exists()) continue;
            const d = snap.data() as any;
            if (log.receiptNo && d.receiptNo !== log.receiptNo) continue; // settled by a different receipt since
            await updateDoc(ref, {
                status: "carried_forward",
                paidOn: deleteField(),
                receiptNo: deleteField(),
                paymentMode: deleteField(),
                totalAmountPaid: deleteField(),
                markedBy: deleteField(),
                note: deleteField(),
            });
            restoredArrears++;
        } catch (e) {
            console.error("Reverse: could not restore arrear month", path, e);
        }
    }

    for (const adj of log.adjusted || []) {
        if (!adj?.path || !adj.delta) continue;
        try {
            const ref = doc(db, adj.path);
            const snap = await getDoc(ref);
            if (!snap.exists()) continue;
            const d = snap.data() as any;
            if (d.status === "paid") continue; // already collected — never re-bill it
            const newPrev = (d.previousDues || 0) + adj.delta;
            await updateDoc(ref, {
                previousDues: newPrev,
                totalAmount: (d.amount || 0) + newPrev,
                ...(Array.isArray(d.arrearsDetails) ? { arrearsDetails: arrayUnion(mainDocId) } : {}),
            });
            readjusted++;
        } catch (e) {
            console.error("Reverse: could not restore later bill", adj.path, e);
        }
    }

    return { restoredArrears, readjusted };
}

const sumArrears = (items: ArrearItem[], excluded: Set<string>) =>
    items.reduce((sum, a) => (excluded.has(a.key) ? sum : sum + a.amount), 0);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string; icon: any }> = {
    paid: { label: "Paid", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", icon: CheckCircle2 },
    pending: { label: "Pending", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", icon: Clock },
    overdue: { label: "Overdue", bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200", icon: AlertCircle },
    carried_forward: { label: "Arrear", bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200", icon: AlertCircle },
};

const LATE_FINE_AMOUNT = 100;

const nextMonthOf = (month: number, year: number) =>
    month >= 12 ? { month: 1, year: year + 1 } : { month: month + 1, year };

/**
 * Fee record path: feeRecords/{year}/months/{month}/classes/{classId}/records/{studentId}
 * → split gives [feeRecords, year, months, month, classes, classId, records, studentId]
 */
const classIdFromPath = (path: string) => path.split("/")[5] || "";

/**
 * Finds the SAME student's record for the month right after `record`.
 * Tries the direct path first; falls back to a group query because a student
 * may sit under a different class folder after a promotion/transfer.
 */
async function findNextMonthRecord(record: FeeRecord) {
    const { month, year } = nextMonthOf(record.month, record.year);
    const studentId = record.studentId || record.id;

    const classId = classIdFromPath(record.path);
    if (classId) {
        try {
            const ref = doc(db, "feeRecords", String(year), "months", String(month), "classes", classId, "records", studentId);
            const snap = await getDoc(ref);
            if (snap.exists()) return { ref, data: snap.data() as any };
        } catch { /* fall through to the query */ }
    }

    try {
        const qs = await getDocs(query(
            collectionGroup(db, "records"),
            where("studentId", "==", studentId),
            where("year", "==", year),
            where("month", "==", month),
            limit(1),
        ));
        if (!qs.empty) return { ref: qs.docs[0].ref, data: qs.docs[0].data() as any };
    } catch (err) {
        console.warn("findNextMonthRecord query failed for", studentId, err);
    }

    return null;
}

/** The late fine must also show up on the next month's bill, exactly like the nightly cron does. */
const finePropagationPayload = (nextData: any) => ({
    previousDues: (nextData.previousDues || 0) + LATE_FINE_AMOUNT,
    totalAmount: (nextData.totalAmount || 0) + LATE_FINE_AMOUNT,
});

/**
 * Month-wise arrear list with a tick box per month.
 * Unticked months are excluded from this payment and stay due on the next bill.
 */
function ArrearPicker({ items, excluded, onToggle, onSetAll, residual, label }: {
    items: ArrearItem[];
    excluded: Set<string>;
    onToggle: (key: string) => void;
    onSetAll: (keys: string[], exclude: boolean) => void;
    residual: number;          // dues we could not map to a month — always charged
    label: string;             // "school" | "transport" wording for the residual line
}) {
    if (items.length === 0 && residual <= 0) return null;

    const pickedItems = items.filter(a => !excluded.has(a.key));
    const skippedItems = items.filter(a => excluded.has(a.key));
    const collecting = pickedItems.reduce((s, a) => s + a.amount, 0) + residual;
    const staying = skippedItems.reduce((s, a) => s + a.amount, 0);
    const allTicked = skippedItems.length === 0;
    const keys = items.map(a => a.key);

    return (
        <div className="mt-2 ml-6 rounded-lg border border-rose-100 bg-rose-50/60 overflow-hidden">
            <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-rose-100">
                <span className="text-[11px] font-semibold text-rose-700">
                    Which months to collect now?
                </span>
                {items.length > 1 && (
                    <button
                        type="button"
                        onClick={() => onSetAll(keys, allTicked)}
                        className="text-[10px] font-semibold text-rose-600 hover:text-rose-800 underline underline-offset-2"
                    >
                        {allTicked ? "Untick all" : "Tick all"}
                    </button>
                )}
            </div>

            <div className="divide-y divide-rose-100/70">
                {items.map(a => {
                    const on = !excluded.has(a.key);
                    return (
                        <label
                            key={a.key}
                            className={`flex items-center gap-2 px-2.5 py-1.5 cursor-pointer transition-colors ${on ? "hover:bg-rose-100/50" : "bg-gray-50/80"}`}
                        >
                            <input
                                type="checkbox"
                                checked={on}
                                onChange={() => onToggle(a.key)}
                                className="w-3.5 h-3.5 accent-rose-500 shrink-0"
                            />
                            <span className={`text-xs font-medium flex-1 ${on ? "text-rose-700" : "text-gray-400 line-through"}`}>
                                {a.label}
                            </span>
                            {a.status === "overdue" && (
                                <span className="text-[9px] font-bold uppercase px-1 py-0.5 rounded bg-rose-100 text-rose-600">Overdue</span>
                            )}
                            <span className={`text-xs font-semibold tabular-nums ${on ? "text-rose-600" : "text-gray-400 line-through"}`}>
                                ₹{a.amount.toLocaleString()}
                            </span>
                        </label>
                    );
                })}

                {residual > 0 && (
                    <div className="flex items-center gap-2 px-2.5 py-1.5 bg-rose-50">
                        <span className="w-3.5 shrink-0" />
                        <span className="text-xs font-medium text-rose-700 flex-1">
                            Other older {label} dues
                            <span className="block text-[10px] text-rose-400 font-normal">Not tied to a single month — always collected</span>
                        </span>
                        <span className="text-xs font-semibold text-rose-600 tabular-nums">₹{residual.toLocaleString()}</span>
                    </div>
                )}
            </div>

            <div className="flex items-center justify-between px-2.5 py-1.5 bg-white border-t border-rose-100">
                <span className="text-[11px] font-semibold text-navy">Collecting now</span>
                <span className="text-xs font-bold text-navy tabular-nums">₹{collecting.toLocaleString()}</span>
            </div>
            {staying > 0 && (
                <div className="flex items-center justify-between px-2.5 py-1.5 bg-amber-50 border-t border-amber-100">
                    <span className="text-[11px] font-semibold text-amber-700">
                        Staying due ({skippedItems.length} month{skippedItems.length > 1 ? "s" : ""})
                    </span>
                    <span className="text-xs font-bold text-amber-700 tabular-nums">₹{staying.toLocaleString()}</span>
                </div>
            )}
        </div>
    );
}

export default function ManageFeesPage() {
    const { user, role } = useAuth();
    const isAdmin = role === "admin";
    const [records, setRecords] = useState<FeeRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [selectedReceipt, setSelectedReceipt] = useState<FeeRecord | null>(null);

    // Mark Paid Dialog
    const [markPaidRecord, setMarkPaidRecord] = useState<FeeRecord | null>(null);
    const [markPaidType, setMarkPaidType] = useState<MarkPaidType>("school");
    const [paymentMode, setPaymentMode] = useState<"CASH" | "UPI">("CASH");
    // Date the payment was actually received — defaults to today, but editable
    // so back-dated payments (e.g. received Saturday, marked paid Monday) tally correctly.
    const [paymentDate, setPaymentDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
    const [markPaidLoading, setMarkPaidLoading] = useState(false);
    // Discount
    const [discountType, setDiscountType] = useState<"none" | "fixed" | "percent">("none");
    const [discountValue, setDiscountValue] = useState<number>(0);
    // Notification email override
    const [notifEmail, setNotifEmail] = useState<string>("");
    const [isFetchingEmail, setIsFetchingEmail] = useState(false);

    // Arrear Details Fetch for Mark Paid — one entry per unpaid past month so the
    // accountant can see exactly which months are due and tick/untick each one.
    const [arrearMonthsLoading, setArrearMonthsLoading] = useState(false);
    const [schoolArrears, setSchoolArrears] = useState<ArrearItem[]>([]);
    const [transportArrears, setTransportArrears] = useState<ArrearItem[]>([]);
    // Keys the accountant has UNticked — stored as exclusions so newly loaded
    // arrears are included by default.
    const [excludedArrears, setExcludedArrears] = useState<Set<string>>(new Set());

    const toggleArrear = (key: string) =>
        setExcludedArrears(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });

    const setAllArrears = (keys: string[], exclude: boolean) =>
        setExcludedArrears(prev => {
            const next = new Set(prev);
            keys.forEach(k => (exclude ? next.add(k) : next.delete(k)));
            return next;
        });

    // Undo (reverse paid) — admin only
    const [undoRecord, setUndoRecord] = useState<{ record: FeeRecord; type: "school" | "transport" | "both" } | null>(null);
    const [undoLoading, setUndoLoading] = useState(false);
    // What the reverse will actually touch — read from the logs written at collection time
    const [undoPreview, setUndoPreview] = useState<{ loading: boolean; school: ReverseLog | null; transport: ReverseLog | null }>({
        loading: false, school: null, transport: null,
    });

    // Bulk "Mark All Overdue" — two-step confirmation before touching many records
    const [bulkOpen, setBulkOpen] = useState(false);
    const [bulkStep, setBulkStep] = useState<1 | 2>(1);
    const [bulkConfirmText, setBulkConfirmText] = useState("");
    const [bulkLoading, setBulkLoading] = useState(false);
    const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });

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
            const allSchoolDocs = snapshots.flatMap(snap =>
                snap.docs.map(d => ({ id: d.id, path: d.ref.path, ...d.data() } as FeeRecord))
            );

            // Deduplicate: same student may have records in multiple class folders
            // (e.g. after class change or accidental re-generation).
            // Keep one per studentId — prefer paid > overdue > carried_forward > pending.
            const statusRank: Record<string, number> = { paid: 4, overdue: 3, carried_forward: 2, pending: 1 };
            const schoolRecordMap = new Map<string, FeeRecord>();
            for (const rec of allSchoolDocs) {
                const uid = rec.studentId || rec.id;
                const existing = schoolRecordMap.get(uid);
                if (!existing || (statusRank[rec.status] ?? 0) > (statusRank[existing.status] ?? 0)) {
                    schoolRecordMap.set(uid, rec);
                }
            }
            const schoolRecords = Array.from(schoolRecordMap.values());


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
                // NOTE: Do NOT skip carried_forward transport records here.
                // A transport record for this month may be carried_forward if a later month
                // absorbed its dues during generation — but we still need to display it
                // (e.g. show the transport receipt for this month if it was paid before carry-forward).
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
                const an = parseInt(a.admissionNumber || "0");
                const bn = parseInt(b.admissionNumber || "0");
                return an - bn;
            });

            setRecords(merged);
        } catch (err: any) {
            toast.error("Failed to load fee records");
        } finally {
            setLoading(false);
        }
    }, [filterMonth, filterYear]);

    useEffect(() => {
        if (!markPaidRecord) {
            setSchoolArrears([]);
            setTransportArrears([]);
            setExcludedArrears(new Set());
            return;
        }

        const fetchArrearMonths = async () => {
            setArrearMonthsLoading(true);
            setExcludedArrears(new Set()); // fresh dialog → everything ticked
            try {
                const sItems: ArrearItem[] = [];
                const tItems: ArrearItem[] = [];
                const studentId = markPaidRecord.studentId || markPaidRecord.id;
                const feeMonth = markPaidRecord.month;
                const feeYear = markPaidRecord.year;

                // 1. School arrears — one collectionGroup query instead of a class-path
                //    scan, so records that moved to another class folder (promotion)
                //    are listed here exactly as the settle step will find them.
                try {
                    const cgSnap = await getDocs(
                        query(collectionGroup(db, "records"), where("studentId", "==", studentId))
                    );
                    for (const d of cgSnap.docs) {
                        const data = d.data() as any;
                        if (data.status !== "carried_forward") continue;
                        const isOlder = data.year < feeYear || (data.year === feeYear && data.month < feeMonth);
                        if (!isOlder) continue;
                        sItems.push({
                            key: arrearKey("school", data.year, data.month),
                            kind: "school",
                            label: `${MONTHS[(data.month || 1) - 1]} ${data.year}`,
                            month: data.month,
                            year: data.year,
                            amount: data.amount || 0,
                            status: data.status,
                            path: d.ref.path,
                        });
                    }
                    sItems.sort((a, b) => (a.year - b.year) || (a.month - b.month));
                } catch (err) {
                    console.error("School arrear scan failed:", err);
                }

                // 2. Fetch Transport Arrears — ALWAYS scan (don't gate on transportPreviousDues
                //    because that Firestore field can be stale/missing even when arrears exist)
                if ((markPaidRecord.transportFeeAmount || 0) > 0) {
                    for (let offset = 1; offset <= 12; offset++) {
                        let prevMonth = feeMonth - offset;
                        let prevYear = feeYear;
                        if (prevMonth <= 0) { prevMonth += 12; prevYear -= 1; }

                        const prevSnap = await getDoc(
                            doc(db, "transportFeeRecords", prevYear.toString(), "months", prevMonth.toString(), "students", studentId)
                        );
                        if (!prevSnap.exists()) continue;
                        const prevData = prevSnap.data() as any;

                        if (prevData.status === "paid") {
                            break; // chain ends — fully paid, stop scanning
                        }
                        if (prevData.status === "carried_forward" ||
                            prevData.status === "pending" ||
                            prevData.status === "overdue") {
                            // Any unpaid previous month = arrear
                            const amt = prevData.totalAmount || prevData.amount || 0;
                            tItems.unshift({
                                key: arrearKey("transport", prevYear, prevMonth),
                                kind: "transport",
                                label: `${MONTHS[prevMonth - 1]} ${prevYear}`,
                                month: prevMonth,
                                year: prevYear,
                                amount: amt,
                                status: prevData.status,
                            });
                        }
                    }
                }

                setSchoolArrears(sItems);
                setTransportArrears(tItems);
            } catch (err) {
                console.error("Error fetching arrear months:", err);
            }
            setArrearMonthsLoading(false);
        };

        fetchArrearMonths();
    }, [markPaidRecord?.id, markPaidRecord?.month, markPaidRecord?.year]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { fetchRecords(); }, [fetchRecords]);

    // Load the reverse logs when the Undo dialog opens, so the accountant sees
    // exactly what will change before confirming.
    useEffect(() => {
        if (!undoRecord) {
            setUndoPreview({ loading: false, school: null, transport: null });
            return;
        }
        const { record } = undoRecord;
        const studentUid = record.studentId || record.id;
        setUndoPreview({ loading: true, school: null, transport: null });

        (async () => {
            let school: ReverseLog | null = null;
            let transport: ReverseLog | null = null;
            try {
                if (record.status === "paid" && record.path) {
                    const snap = await getDoc(doc(db, record.path));
                    school = (snap.data() as any)?.reverseLog || null;
                }
                if (record.transportStatus === "paid") {
                    const snap = await getDoc(doc(db, "transportFeeRecords", record.year.toString(), "months", record.month.toString(), "students", studentUid));
                    transport = (snap.data() as any)?.reverseLog || null;
                }
            } catch (e) {
                console.error("Could not read reverse log:", e);
            }
            setUndoPreview({ loading: false, school, transport });
        })();
    }, [undoRecord]);

    // ---------- Mark Paid Logic ----------
    const openMarkPaidDialog = async (record: FeeRecord) => {
        // hasTransport: only if a real transport record exists (transportFeeAmount set from transportFeeRecords)
        const hasTransport = (record.transportFeeAmount || 0) > 0;
        const schoolAlreadyPaid = record.status === "paid";
        const transportAlreadyPaid = record.transportStatus === "paid";
        // Pre-select the most relevant payment type
        if (schoolAlreadyPaid && !transportAlreadyPaid && hasTransport) {
            setMarkPaidType("transport"); // School done, only transport remains
        } else {
            setMarkPaidType(hasTransport ? "both" : "school");
        }
        setMarkPaidRecord(record);
        setPaymentMode("CASH");
        setPaymentDate(new Date().toISOString().split("T")[0]);
        setDiscountType("none");
        setDiscountValue(0);
        // Pre-fill notification email if stored on record (parentEmail that's not an auth email)
        const stored = record.parentEmail || "";
        const isAuthEmail = stored.includes("@ias.edu") || stored.includes("@school.");
        setNotifEmail(isAuthEmail ? "" : stored);
        
        // Fetch fresh notification email from student profile using direct Firestore path
        setIsFetchingEmail(true);
        try {
            const studentUid = record.studentId || record.id;
            const directPath = `users/classes/${record.class}/sections/${record.section}/students/profiles/${studentUid}`;
            const profileSnap = await getDoc(doc(db, directPath));
            if (profileSnap.exists()) {
                const data = profileSnap.data() as any;
                const email = data.notificationEmail || data.parentEmail || "";
                if (email && !email.includes("@ias.edu") && !email.includes("@school.")) {
                    setNotifEmail(email);
                }
            }
        } catch (e) {
            console.error("Failed to fetch profile email:", e);
        } finally {
            setIsFetchingEmail(false);
        }
    };

    // ── Payable totals for the Mark-Paid dialog ──────────────────────────────
    // Single source of truth for the bill summary, the "which fee" options, the
    // discount base and the settle step — these must never disagree, so every
    // one of them reads from here instead of recomputing.
    const payTotals = (() => {
        const r = markPaidRecord;
        if (!r) return null;

        const schoolPaid = r.status === "paid";
        const schoolCF   = r.status === "carried_forward";
        const schoolBase = r.amount;
        // Anything the generated bill charges beyond base + arrears — today that
        // is the ₹100 late fine. Always billed; it is not an arrear month.
        const schoolExtras = Math.max(0, (r.totalAmount || 0) - schoolBase - (r.previousDues || 0));
        // previousDues may exceed the months we could list (dues from before the
        // scan window). Bill the difference as one always-included line so the
        // total still matches the generated bill.
        const schoolListed   = schoolArrears.reduce((s, a) => s + a.amount, 0);
        const schoolResidual = Math.max(0, (r.previousDues || 0) - schoolListed);
        const schoolPicked   = sumArrears(schoolArrears, excludedArrears);
        const schoolArrearsDue = schoolCF ? 0 : schoolPicked + schoolResidual;
        const schoolTotal = (schoolPaid || schoolCF)
            ? schoolBase
            : schoolBase + schoolExtras + schoolArrearsDue;

        const transportPaid = r.transportStatus === "paid";
        const transportCF   = r.transportStatus === "carried_forward";
        const transportBase = r.transportFeeAmount || 0;
        // The live scan is authoritative; fall back to the stored field only when
        // the scan found no months at all.
        const transportResidual = transportArrears.length === 0 ? (r.transportPreviousDues || 0) : 0;
        const transportPicked   = sumArrears(transportArrears, excludedArrears);
        const transportArrearsDue = transportCF ? 0 : transportPicked + transportResidual;
        const transportTotal = (transportPaid || transportCF)
            ? transportBase
            : transportBase + transportArrearsDue;

        const payable =
            markPaidType === "school"    ? (schoolPaid ? 0 : schoolTotal) :
            markPaidType === "transport" ? (transportPaid ? 0 : transportTotal) :
            (schoolPaid ? 0 : schoolTotal) + (transportPaid ? 0 : transportTotal);

        return {
            schoolPaid, schoolCF, schoolBase, schoolExtras, schoolResidual,
            schoolArrearsDue, schoolTotal,
            transportPaid, transportCF, transportBase, transportResidual,
            transportArrearsDue, transportTotal,
            payable,
            // Months that will actually be settled by this payment
            schoolPicks:    schoolArrears.filter(a => !excludedArrears.has(a.key)),
            schoolSkips:    schoolArrears.filter(a => excludedArrears.has(a.key)),
            transportPicks: transportArrears.filter(a => !excludedArrears.has(a.key)),
            transportSkips: transportArrears.filter(a => excludedArrears.has(a.key)),
        };
    })();

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
            // Use the admin-selected payment date (defaults to today) at noon local
            // time to avoid UTC date-shift when Firestore stores it as a Timestamp.
            const paymentDateObj = paymentDate ? new Date(`${paymentDate}T12:00:00`) : new Date();
            const paymentDateDisplay = paymentDateObj.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

            if (markPaidType === "school" || markPaidType === "both") {
                const receiptNo = await getNextReceiptNo();
                // CF records: only charge base fee — their previousDues have already
                // been absorbed (and separately billed) in the next live month's bill.
                const isRecordCF = record.status === "carried_forward";
                // Charge exactly what the dialog showed: base + fine + the arrear
                // months the accountant left ticked.
                const schoolBaseTotal = payTotals?.schoolTotal ?? (isRecordCF ? record.amount : (record.totalAmount || record.amount));
                const pickedSchool = payTotals?.schoolPicks ?? [];
                const skippedSchool = payTotals?.schoolSkips ?? [];
                const pickedSchoolKeys = new Set(pickedSchool.map(a => a.key));
                // Unticked months stay unpaid. Once THIS month is marked paid, the fee
                // generator would otherwise stop scanning here and never see them again
                // — so the record itself carries a note of what is still owed behind it.
                // Doc ids don't contain the class, so this survives promotions.
                const unclearedSchoolArrears = skippedSchool.reduce((s, a) => s + a.amount, 0);
                const unclearedSchoolIds = skippedSchool.map(a =>
                    a.path?.split("/").pop() || `${studentUid}_${a.year}_${String(a.month).padStart(2, "0")}`
                );
                const schoolDiscount = computeDiscount(schoolBaseTotal);
                const schoolTotalPaid = schoolBaseTotal - schoolDiscount;
                const discountFields = discountType !== "none" && schoolDiscount > 0 ? {
                    discountType,
                    discountAmount: schoolDiscount,
                    discountPercent: discountType === "percent" ? discountValue : parseFloat(((schoolDiscount / schoolBaseTotal) * 100).toFixed(2)),
                } : {};
                // When arrear months were unticked, this bill only carried the ticked
                // ones — rewrite previousDues/totalAmount so the settled record shows
                // what was actually charged. The skipped months stay carried_forward
                // and the forward cascade below leaves them in the next live bill.
                const billedArrears = isRecordCF ? (record.previousDues || 0) : (payTotals?.schoolArrearsDue ?? (record.previousDues || 0));
                const arrearRewrite = (!isRecordCF && skippedSchool.length > 0) ? {
                    previousDues: billedArrears,
                    totalAmount: schoolBaseTotal,
                } : {};

                // Snapshot of this bill before the payment touches it, plus a running
                // list of everything the cascades change — together they let Undo put
                // the whole chain back exactly as it was.
                const schoolLog: ReverseLog = {
                    receiptNo,
                    settled: [],
                    adjusted: [],
                    prevStatus: record.status,
                    prevPreviousDues: record.previousDues || 0,
                    prevTotalAmount: record.totalAmount || record.amount,
                };

                await updateDoc(doc(db, record.path), {
                    status: "paid",
                    paidOn: paymentDateObj,
                    receiptNo,
                    paymentMode,
                    markedBy: user?.uid || "",
                    totalAmountPaid: schoolTotalPaid,
                    ...arrearRewrite,
                    ...(pickedSchool.length > 0 ? { arrearsPaidMonths: pickedSchool.map(a => a.label) } : {}),
                    ...(skippedSchool.length > 0 ? { arrearsSkippedMonths: skippedSchool.map(a => a.label) } : {}),
                    // Always written (0 when nothing was skipped) so a stale note from an
                    // earlier partial payment can never linger on this record.
                    unclearedArrears: unclearedSchoolArrears,
                    unclearedRecordIds: unclearedSchoolIds,
                    ...discountFields,
                });
                setRecords(prev => prev.map(r =>
                    r.id === record.id ? { ...r, status: "paid", receiptNo, paidOn: { toDate: () => new Date() }, ...arrearRewrite } : r
                ));
                toast.success(`School fee marked paid! Receipt: ${receiptNo}`);

                // ── FETCH ALL STUDENT RECORDS (class-change safe) ──────────────
                // Single collectionGroup query finds records regardless of which
                // class folder they live in — this matters after promotion when
                // old class records (e.g. 6A) and new class records (7A) coexist.
                let allStudentRecords: { ref: any; data: any; id: string }[] = [];
                try {
                    const cgSnap = await getDocs(
                        query(collectionGroup(db, "records"), where("studentId", "==", studentUid))
                    );
                    allStudentRecords = cgSnap.docs.map(d => ({ ref: d.ref, data: d.data() as any, id: d.id }));
                } catch (e) {
                    console.error("collectionGroup fetch failed, falling back to class-path scan:", e);
                }

                // ── BACKWARD CASCADE (Mark Ticked Arrears as Paid) ────────────
                // Settles the older `carried_forward` records the accountant kept
                // ticked, even if they belong to a different class path (promotion
                // case). Unticked months are left untouched so they stay due.
                try {
                    const olderCF = allStudentRecords.filter(r => {
                        if (r.data.status !== "carried_forward") return false;
                        if (!pickedSchoolKeys.has(arrearKey("school", r.data.year, r.data.month))) return false;
                        if (r.data.year < record.year) return true;
                        if (r.data.year === record.year && r.data.month < record.month) return true;
                        return false;
                    });

                    for (const past of olderCF) {
                        await updateDoc(past.ref, {
                            status: "paid",
                            paidOn: paymentDateObj,
                            receiptNo,
                            paymentMode,
                            markedBy: user?.uid || "",
                            totalAmountPaid: past.data.amount || 0,
                            note: `Auto-paid via consolidated bill ${receiptNo}`
                        });
                        schoolLog.settled!.push(past.ref.path);
                    }
                } catch (e) {
                    console.error("School backward cascade failed", e);
                }

                // ── UNIFIED CASCADE DEDUCTION (Forward) ───────────────────────
                // When any month is paid, scan FORWARD through the chain:
                //   1. For each intermediate carried_forward month → clear its stale
                //      previousDues so it shows only its own base fee (not stale total).
                //   2. For the first LIVE (pending/overdue) month → deduct the paid
                //      amount from its previousDues so the active bill is correct.
                // Example: April paid → May(CF, fix dues→0) → June(pending, deduct) ✅
                try {
                    // Deduct only what this payment actually cleared — unticked arrear
                    // months must remain in the next live bill.
                    const paidAmount = schoolBaseTotal;
                    const newerSorted = allStudentRecords
                        .filter(r => {
                            if (r.data.year > record.year) return true;
                            if (r.data.year === record.year && r.data.month > record.month) return true;
                            return false;
                        })
                        .sort((a, b) => (a.data.year - b.data.year) || (a.data.month - b.data.month));

                    for (const next of newerSorted) {
                        const nextData = next.data;
                        if (nextData.status === "paid") break; // already paid — stop

                        if (nextData.status === "carried_forward") {
                            // ── Fix stale CF record ──────────────────────────────────
                            const oldPrev = nextData.previousDues || 0;
                            if (oldPrev > 0) {
                                const newPrev = Math.max(0, oldPrev - paidAmount);
                                const newTotal = (nextData.amount || 0) + newPrev;
                                const cfArrears: string[] = nextData.arrearsDetails || [];
                                const newCfArrears = cfArrears.filter((id: string) => id !== record.id);
                                try {
                                    await updateDoc(next.ref, {
                                        previousDues: newPrev,
                                        totalAmount: newTotal,
                                        arrearsDetails: newCfArrears,
                                    });
                                    schoolLog.adjusted!.push({ path: next.ref.path, delta: oldPrev - newPrev });
                                    setRecords(prev => prev.map(r =>
                                        r.id === next.id
                                            ? { ...r, previousDues: newPrev, totalAmount: newTotal }
                                            : r
                                    ));
                                } catch { /* best-effort */ }
                            }
                            continue; // keep scanning to find the live bill
                        }

                        // ── Found the LIVE bill (pending / overdue) — deduct here ──
                        if ((nextData.previousDues || 0) > 0) {
                            const newPrevDues = Math.max(0, (nextData.previousDues || 0) - paidAmount);
                            const newTotal = (nextData.amount || 0) + newPrevDues;
                            const nextArrears: string[] = nextData.arrearsDetails || [];
                            const newArrearsDetails = nextArrears.filter((id: string) => id !== record.id);

                            await updateDoc(next.ref, {
                                previousDues: newPrevDues,
                                totalAmount: newTotal,
                                arrearsDetails: newArrearsDetails,
                            });
                            schoolLog.adjusted!.push({ path: next.ref.path, delta: (nextData.previousDues || 0) - newPrevDues });
                            setRecords(prev => prev.map(r =>
                                r.id === next.id
                                    ? { ...r, previousDues: newPrevDues, totalAmount: newTotal }
                                    : r
                            ));
                        }
                        break; // processed the live bill — stop
                    }
                } catch { /* best-effort */ }
                // ── END CASCADE DEDUCTION ────────────────────────────────────────

                // Store the reverse log now that both cascades know what they touched.
                try {
                    await updateDoc(doc(db, record.path), { reverseLog: schoolLog });
                } catch (e) {
                    console.error("Could not save reverse log — Undo will reset this record only", e);
                }



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

                // Late fine / other charges billed on top of base + arrears
                if ((payTotals?.schoolExtras || 0) > 0) {
                    schoolBreakdownItems.push({ label: "Late Fine / Other Charges", amount: payTotals!.schoolExtras });
                }

                // Add Previous Dues line — only the arrear months actually collected
                if (billedArrears > 0) {
                    const months = pickedSchool.map(a => a.label).join(", ");
                    schoolBreakdownItems.push({
                        label: months ? `Previous Dues (${months})` : "Previous Dues (Arrears)",
                        amount: billedArrears,
                    });
                }

                // Add discount line item (negative)
                const schoolDiscountAmt = computeDiscount(schoolBaseTotal);
                if (schoolDiscountAmt > 0) {
                    const pct = discountType === "percent" ? ` (${discountValue}%)` : ``;
                    schoolBreakdownItems.push({ label: `Discount Applied${pct}`, amount: -schoolDiscountAmt });
                }

                authFetch("/api/send-receipt", {
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
                            paidOn: paymentDateDisplay,
                            feeMonth: `${MONTHS[(record.month || 1) - 1]} ${record.year}`,
                            lineItems: schoolBreakdownItems,
                            totalAmount: schoolTotalPaid,
                            paymentMode
                        }
                    })
                }).catch(console.error);
            }

            if (markPaidType === "transport" || markPaidType === "both") {
                const transportReceiptNo = await getNextReceiptNo();
                const isTranspCF = record.transportStatus === "carried_forward";
                // Same rule as school: charge base + the ticked arrear months only.
                const transpBaseTotal = payTotals?.transportTotal ?? (isTranspCF
                    ? record.transportFeeAmount || 0
                    : record.transportTotalAmount || record.transportFeeAmount || 0);
                const pickedTransport = payTotals?.transportPicks ?? [];
                const skippedTransport = payTotals?.transportSkips ?? [];
                const pickedTransportKeys = new Set(pickedTransport.map(a => a.key));
                // Same note as the school side — what stays owed behind this bill.
                const unclearedTransportArrears = skippedTransport.reduce((s, a) => s + a.amount, 0);
                const transportPath = `transportFeeRecords/${record.year}/months/${record.month}/students/${studentUid}`;
                const transportLog: ReverseLog = {
                    receiptNo: transportReceiptNo,
                    settled: [],
                    adjusted: [],
                    prevStatus: record.transportStatus || "pending",
                    prevPreviousDues: record.transportPreviousDues || 0,
                    prevTotalAmount: record.transportTotalAmount || record.transportFeeAmount || 0,
                };
                const billedTransportArrears = isTranspCF ? 0 : (payTotals?.transportArrearsDue ?? (record.transportPreviousDues || 0));
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
                    previousDues: billedTransportArrears,
                    totalAmount: transpBaseTotal,
                    totalAmountPaid: transpTotalPaid,
                    ...(pickedTransport.length > 0 ? { arrearsPaidMonths: pickedTransport.map(a => a.label) } : {}),
                    ...(skippedTransport.length > 0 ? { arrearsSkippedMonths: skippedTransport.map(a => a.label) } : {}),
                    unclearedArrears: unclearedTransportArrears,
                    month: record.month,
                    year: record.year,
                    dueDate: record.dueDate,
                    status: "paid",
                    paidOn: paymentDateObj,
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

                // ── BACKWARD TRANSPORT CASCADE ────────────────────────────────
                // Settles exactly the past months that were billed here (ticked in
                // the dialog). Unticked months keep their unpaid status so they
                // remain due on the next bill.
                try {
                    for (const past of pickedTransport) {
                        const prevTransRef = doc(
                            db, "transportFeeRecords",
                            past.year.toString(), "months", past.month.toString(), "students", studentUid
                        );
                        const prevTransSnap = await getDoc(prevTransRef);
                        if (!prevTransSnap.exists()) continue;
                        const prevNtd = prevTransSnap.data() as any;
                        if (prevNtd.status === "paid") continue;

                        await updateDoc(prevTransRef, {
                            status: "paid",
                            paidOn: paymentDateObj,
                            receiptNo: transportReceiptNo,
                            paymentMode,
                            markedBy: user?.uid || "",
                            totalAmountPaid: prevNtd.totalAmount || prevNtd.amount || 0,
                            note: `Auto-paid via consolidated bill ${transportReceiptNo}`
                        });
                        transportLog.settled!.push(prevTransRef.path);
                    }
                } catch (e) {
                    console.error("Transport backward cascade failed", e);
                }

                // ── UNIFIED TRANSPORT CASCADE DEDUCTION ───────────────────────
                // Same logic as the school fee cascade:
                //   1. Walk FORWARD through every transport month in the chain
                //   2. For each carried_forward month  → clear its stale previousDues
                //      so it shows only its own base transport fee
                //   3. For the first LIVE (pending/overdue) month → deduct the paid
                //      transport fee so the active bill is correct
                //
                // Example (April paid, Sep is live):
                //   May(CF, fix) → Jun(CF, fix) → Jul(CF, fix) → Aug(CF, fix) → Sep(deduct) ✅
                try {
                    // Deduct exactly what was paid into the base fee / arrears
                    const transpPaidAmount = transpBaseTotal;

                    for (let offset = 1; offset <= 12; offset++) {
                        let nextTMonth = (record.month || 1) + offset;
                        let nextTYear = record.year;
                        while (nextTMonth > 12) { nextTMonth -= 12; nextTYear += 1; }

                        const nextTransRef = doc(
                            db, "transportFeeRecords",
                            nextTYear.toString(), "months", nextTMonth.toString(), "students", studentUid
                        );
                        const nextTransSnap = await getDoc(nextTransRef);

                        if (!nextTransSnap.exists()) break; // chain ends — nothing further
                        const ntd = nextTransSnap.data() as any;

                        if (ntd.status === "paid") break; // already cleared — stop

                        if (ntd.status === "carried_forward") {
                            // Fix stale CF transport record ───────────────────────────
                            // Clear the portion of previousDues that came from the month
                            // just paid so this record accurately shows its own base fee.
                            const oldPrev = ntd.previousDues || 0;
                            if (oldPrev > 0) {
                                const newPrev = Math.max(0, oldPrev - transpPaidAmount);
                                const newTotal = (ntd.amount || 0) + newPrev;
                                try {
                                    await updateDoc(nextTransRef, {
                                        previousDues: newPrev,
                                        totalAmount: newTotal,
                                    });
                                    transportLog.adjusted!.push({ path: nextTransRef.path, delta: oldPrev - newPrev });
                                    // Also refresh local state for merge display
                                    setRecords(prev => prev.map(r =>
                                        (r.studentId || r.id) === studentUid && r.month === nextTMonth && r.year === nextTYear
                                            ? { ...r, transportPreviousDues: newPrev, transportTotalAmount: newTotal }
                                            : r
                                    ));
                                } catch { /* best-effort */ }
                            }
                            continue; // keep scanning for the live bill
                        }

                        // ── Found the LIVE transport bill — deduct here ────────────
                        if ((ntd.previousDues || 0) > 0) {
                            const newPrevDues = Math.max(0, (ntd.previousDues || 0) - transpPaidAmount);
                            const newTotal = (ntd.amount || 0) + newPrevDues;
                            await updateDoc(nextTransRef, {
                                previousDues: newPrevDues,
                                totalAmount: newTotal,
                            });
                            transportLog.adjusted!.push({ path: nextTransRef.path, delta: (ntd.previousDues || 0) - newPrevDues });
                            setRecords(prev => prev.map(r =>
                                (r.studentId || r.id) === studentUid && r.month === nextTMonth && r.year === nextTYear
                                    ? { ...r, transportPreviousDues: newPrevDues, transportTotalAmount: newTotal }
                                    : r
                            ));
                        }
                        break; // processed the live bill — stop
                    }
                } catch { /* best-effort */ }
                // ── END TRANSPORT CASCADE ─────────────────────────────────────────

                try {
                    await updateDoc(doc(db, transportPath), { reverseLog: transportLog });
                } catch (e) {
                    console.error("Could not save transport reverse log", e);
                }




                const transportLineItems: { label: string; amount: number }[] = [
                    { label: "Transport / Bus Fee (Current Month)", amount: record.transportFeeAmount || 0 },
                ];
                if (billedTransportArrears > 0) {
                    const tMonths = pickedTransport.map(a => a.label).join(", ");
                    transportLineItems.push({
                        label: tMonths ? `Previous Transport Dues (${tMonths})` : "Previous Transport Dues (Arrears)",
                        amount: billedTransportArrears,
                    });
                }
                // Discount line for transport
                const transpDiscountAmt2 = computeDiscount(transpBaseTotal);
                if (transpDiscountAmt2 > 0) {
                    const pct = discountType === "percent" ? ` (${discountValue}%)` : ``;
                    transportLineItems.push({ label: `Discount Applied${pct}`, amount: -transpDiscountAmt2 });
                }

                authFetch("/api/send-receipt", {
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
                            paidOn: paymentDateDisplay,
                            feeMonth: `${MONTHS[(record.month || 1) - 1]} ${record.year}`,
                            lineItems: transportLineItems,
                            totalAmount: transpTotalPaid,
                            paymentMode
                        }
                    })
                }).catch(console.error);
            }

            // Save notification email back to student profile
            if (notifEmail) {
                try {
                    const directPath = `users/classes/${record.class}/sections/${record.section}/students/profiles/${studentUid}`;
                    const profileSnap = await getDoc(doc(db, directPath));
                    if (profileSnap.exists()) {
                        const existing = (profileSnap.data() as any).notificationEmail;
                        if (existing !== notifEmail) {
                            await updateDoc(doc(db, directPath), { notificationEmail: notifEmail });
                        }
                    }
                } catch (e) {
                    console.error("Failed to update student notification email", e);
                }
            }

            setMarkPaidRecord(null);
        } catch {
            toast.error("Failed to mark as paid");
        } finally {
            setMarkPaidLoading(false);
        }
    };

    // Mark fee as overdue — also applies ₹100 late fine if not already applied
    const handleMarkOverdue = async (record: FeeRecord) => {
        setActionLoading(record.id + "_overdue");
        try {
            const alreadyFined = record.lateFine && (record.lateFine as number) > 0;
            const updatePayload: Record<string, any> = { status: "overdue" };

            if (!alreadyFined) {
                updatePayload.lateFine = LATE_FINE_AMOUNT;
                updatePayload.totalAmount = (record.totalAmount || record.amount || 0) + LATE_FINE_AMOUNT;
                updatePayload.lateFineAppliedOn = new Date();
            }

            await updateDoc(doc(db, record.path), updatePayload);
            setRecords(prev => prev.map(r =>
                r.id === record.id ? { ...r, status: "overdue", ...updatePayload } : r
            ));

            // Carry the new fine into next month's bill (same as the nightly cron).
            let propagated = false;
            if (!alreadyFined) {
                try {
                    const next = await findNextMonthRecord(record);
                    if (next && next.data.status !== "paid") {
                        await updateDoc(next.ref, finePropagationPayload(next.data));
                        propagated = true;
                    }
                } catch (err) {
                    console.warn("Fine propagation failed for", record.id, err);
                }
            }

            toast.success(
                alreadyFined
                    ? "Marked as overdue"
                    : `Marked as overdue + ₹100 late fine applied${propagated ? " (added to next month's bill too)" : ""}`
            );
        } catch {
            toast.error("Failed to update status");
        } finally {
            setActionLoading(null);
        }
    };

    // ── Bulk: mark every currently filtered unpaid record as overdue ──────────
    // Same rules as the single-record button: paid / arrear records are never
    // touched, and the ₹100 fine is only added where none was charged before.
    const closeBulkDialog = () => {
        if (bulkLoading) return;
        setBulkOpen(false);
        setBulkStep(1);
        setBulkConfirmText("");
        setBulkProgress({ done: 0, total: 0 });
    };

    /**
     * Loads every fee record of the given month in one sweep (a dozen collection
     * reads) so the fine can be propagated without firing one query per student.
     * Returns studentId → { path, data }.
     */
    const loadMonthRecordMap = async (year: number, month: number) => {
        const map = new Map<string, { path: string; data: any }>();
        try {
            const classesSnap = await getDocs(collection(db, "fees", "structure", "classes"));
            const classIds = classesSnap.docs.map(d => d.id);
            const snaps = await Promise.all(classIds.map(cid =>
                getDocs(collection(db, `feeRecords/${year}/months/${month}/classes/${cid}/records`))
                    .catch(() => null)
            ));
            snaps.forEach(snap => snap?.docs.forEach(d => {
                const data = d.data() as any;
                const sid = data.studentId || d.id;
                // Prefer an unpaid record if the student appears in two class folders.
                const existing = map.get(sid);
                if (!existing || (existing.data.status === "paid" && data.status !== "paid")) {
                    map.set(sid, { path: d.ref.path, data });
                }
            }));
        } catch (err) {
            console.error("loadMonthRecordMap failed:", err);
        }
        return map;
    };

    const handleBulkMarkOverdue = async () => {
        const targets = bulkTargets;
        if (targets.length === 0) return;

        setBulkLoading(true);
        setBulkProgress({ done: 0, total: targets.length });

        const appliedOn = new Date();
        const applied = new Map<string, Record<string, any>>();
        let failedCount = 0;
        let propagatedCount = 0;

        try {
            // Next month's records — needed so each new fine also lands on the
            // following month's bill, exactly like the nightly cron does.
            const { month: nextMonth, year: nextYear } = nextMonthOf(filterMonth, filterYear);
            const nextMonthMap = await loadMonthRecordMap(nextYear, nextMonth);

            // Build a flat list of writes first, then commit in batches. Each target
            // can produce two writes (its own update + next month's propagation).
            type PendingWrite = { path: string; payload: Record<string, any>; recordId?: string };
            const writes: PendingWrite[] = [];

            for (const r of targets) {
                const isNewFine = !(r.lateFine && r.lateFine > 0);
                const payload: Record<string, any> = { status: "overdue" };

                if (isNewFine) {
                    payload.lateFine = LATE_FINE_AMOUNT;
                    payload.totalAmount = (r.totalAmount || r.amount || 0) + LATE_FINE_AMOUNT;
                    payload.lateFineAppliedOn = appliedOn;
                }
                writes.push({ path: r.path, payload, recordId: r.id });

                if (isNewFine) {
                    const next = nextMonthMap.get(r.studentId || r.id);
                    if (next && next.data.status !== "paid") {
                        writes.push({ path: next.path, payload: finePropagationPayload(next.data) });
                        propagatedCount++;
                    }
                }
            }

            // Firestore allows 500 writes per batch — stay comfortably under it.
            const CHUNK = 400;
            for (let i = 0; i < writes.length; i += CHUNK) {
                const slice = writes.slice(i, i + CHUNK);
                const batch = writeBatch(db);
                slice.forEach(w => batch.update(doc(db, w.path), w.payload));

                try {
                    await batch.commit();
                    slice.forEach(w => { if (w.recordId) applied.set(w.recordId, w.payload); });
                } catch (err) {
                    console.error("Bulk overdue batch failed:", err);
                    failedCount += slice.filter(w => w.recordId).length;
                }

                setBulkProgress({
                    done: Math.min(Math.round(((i + CHUNK) / writes.length) * targets.length), targets.length),
                    total: targets.length,
                });
            }

            setRecords(prev => prev.map(r =>
                applied.has(r.id) ? { ...r, ...applied.get(r.id) } as FeeRecord : r
            ));

            const okCount = applied.size;
            const finesApplied = targets.filter(r => !(r.lateFine && r.lateFine > 0) && applied.has(r.id)).length;
            if (okCount > 0) {
                toast.success(
                    `${okCount} record${okCount === 1 ? "" : "s"} marked overdue` +
                    (finesApplied > 0 ? ` — ₹${(finesApplied * LATE_FINE_AMOUNT).toLocaleString()} in late fines applied` : "") +
                    (propagatedCount > 0 ? `, carried into ${propagatedCount} next-month bill${propagatedCount === 1 ? "" : "s"}` : "")
                );
            }
            if (failedCount > 0) {
                toast.error(`${failedCount} record${failedCount === 1 ? "" : "s"} could not be updated. Please retry.`);
            }

            setBulkOpen(false);
            setBulkStep(1);
            setBulkConfirmText("");
        } catch (err) {
            console.error("Bulk overdue failed:", err);
            toast.error("Bulk update failed. Please try again.");
        } finally {
            setBulkLoading(false);
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

    // ── Undo Handler (Admin only) ──────────────────────────────────────────
    const handleConfirmUndo = async () => {
        if (!undoRecord) return;
        const { record, type } = undoRecord;
        setUndoLoading(true);
        try {
            const studentUid = record.studentId || record.id;

            // Fields a payment writes — all of them must go, otherwise the record
            // still looks half-collected after the reverse.
            const paymentFields = {
                paidOn: deleteField(),
                receiptNo: deleteField(),
                paymentMode: deleteField(),
                totalAmountPaid: deleteField(),
                markedBy: deleteField(),
                discountType: deleteField(),
                discountAmount: deleteField(),
                discountPercent: deleteField(),
                arrearsPaidMonths: deleteField(),
                arrearsSkippedMonths: deleteField(),
                unclearedArrears: deleteField(),
                unclearedRecordIds: deleteField(),
                reverseLog: deleteField(),
            };

            if ((type === "school" || type === "both") && record.status === "paid" && record.path) {
                const ref = doc(db, record.path);
                const snap = await getDoc(ref);
                const log: ReverseLog = (snap.data() as any)?.reverseLog || {};

                // Undo the chain first, then the bill itself.
                const { restoredArrears, readjusted } = await reversePaymentCascade(log, record.id);

                const restoredDues = log.prevPreviousDues;
                const restoredTotal = log.prevTotalAmount;
                await updateDoc(ref, {
                    status: log.prevStatus || "pending",
                    ...(restoredDues !== undefined ? { previousDues: restoredDues } : {}),
                    ...(restoredTotal !== undefined ? { totalAmount: restoredTotal } : {}),
                    ...paymentFields,
                });
                setRecords(prev => prev.map(r =>
                    r.id === record.id
                        ? {
                            ...r,
                            status: (log.prevStatus as FeeRecord["status"]) || "pending",
                            receiptNo: null,
                            paidOn: null,
                            ...(restoredDues !== undefined ? { previousDues: restoredDues } : {}),
                            ...(restoredTotal !== undefined ? { totalAmount: restoredTotal } : {}),
                        }
                        : r
                ));
                toast.success(
                    restoredArrears || readjusted
                        ? `School fee reversed — ${restoredArrears} arrear month(s) restored, ${readjusted} later bill(s) updated`
                        : `School fee wapas pending — ${record.studentName}`
                );
            }

            if ((type === "transport" || type === "both") && record.transportStatus === "paid") {
                const trRef = doc(db, "transportFeeRecords", record.year.toString(), "months", record.month.toString(), "students", studentUid);
                const trSnap = await getDoc(trRef);
                const trLog: ReverseLog = (trSnap.data() as any)?.reverseLog || {};

                const { restoredArrears, readjusted } = await reversePaymentCascade(trLog, studentUid);

                await updateDoc(trRef, {
                    status: trLog.prevStatus || "pending",
                    ...(trLog.prevPreviousDues !== undefined ? { previousDues: trLog.prevPreviousDues } : {}),
                    ...(trLog.prevTotalAmount !== undefined ? { totalAmount: trLog.prevTotalAmount } : {}),
                    ...paymentFields,
                });
                setRecords(prev => prev.map(r =>
                    r.id === record.id
                        ? {
                            ...r,
                            transportStatus: (trLog.prevStatus as FeeRecord["transportStatus"]) || "pending",
                            transportReceiptNo: null,
                            ...(trLog.prevPreviousDues !== undefined ? { transportPreviousDues: trLog.prevPreviousDues } : {}),
                            ...(trLog.prevTotalAmount !== undefined ? { transportTotalAmount: trLog.prevTotalAmount } : {}),
                        }
                        : r
                ));
                toast.success(
                    restoredArrears || readjusted
                        ? `Transport fee reversed — ${restoredArrears} arrear month(s) restored, ${readjusted} later bill(s) updated`
                        : `Transport fee wapas pending — ${record.studentName}`
                );
            }

            setUndoRecord(null);
        } catch (err: any) {
            toast.error(err.message || "Reverse karne mein error aaya");
        } finally {
            setUndoLoading(false);
        }
    };

    // Filter records
    const classes = [...new Set(records.map(r => r.class).filter(c => c != null && c !== ""))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const filtered = records.filter(r => {
        if (filterStatus !== "all" && r.status !== filterStatus) return false;
        if (filterClass !== "all" && r.class !== filterClass) return false;
        if (search) {
            const q = search.toLowerCase();
            const matchName = r.studentName?.toLowerCase().includes(q);
            const matchRoll = r.rollNo?.toLowerCase().includes(q);
            const matchAdm  = r.admissionNumber?.toLowerCase().includes(q);
            if (!matchName && !matchRoll && !matchAdm) return false;
        }
        return true;
    });

    // Bulk-overdue targets: only what is currently on screen, and only real unpaid
    // school-fee rows (paid / arrear / transport-only rows are never touched).
    const bulkTargets = filtered.filter(r =>
        !!r.path && !r.isTransportOnly && (r.status === "pending" || r.status === "overdue")
    );
    const bulkFineCount = bulkTargets.filter(r => !(r.lateFine && r.lateFine > 0)).length;

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
                        <option value="carried_forward">Arrear (Carried Fwd)</option>
                    </select>
                    <select value={filterClass} onChange={e => setFilterClass(e.target.value)}
                        className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-gold outline-none">
                        <option value="all">All Classes</option>
                        {classes.map(c => <option key={c} value={c}>Class {c}</option>)}
                    </select>
                    <div className="flex-1 min-w-[160px] relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="Search by name or admission number..."
                            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-gold outline-none" />
                    </div>
                    <button onClick={fetchRecords}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:border-navy hover:text-navy transition-colors">
                        <RefreshCw className="w-4 h-4" />Refresh
                    </button>
                </div>

                {/* Bulk overdue — acts on the filtered list shown below */}
                {bulkTargets.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-3">
                        <button
                            onClick={() => { setBulkStep(1); setBulkConfirmText(""); setBulkOpen(true); }}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-sm font-semibold text-rose-700 hover:bg-rose-100 transition-colors"
                        >
                            <AlertTriangle className="w-4 h-4" />
                            Mark All Overdue ({bulkTargets.length})
                        </button>
                        <p className="text-xs text-gray-400">
                            Applies to the {bulkTargets.length} unpaid record{bulkTargets.length === 1 ? "" : "s"} currently shown
                            ({MONTHS[filterMonth - 1]} {filterYear}
                            {filterClass !== "all" ? `, Class ${filterClass}` : ""}).
                            {bulkFineCount > 0 && ` ₹100 late fine will be added to ${bulkFineCount} of them.`}
                        </p>
                    </div>
                )}
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
                                                        {/* CF records: only show base fee — their previousDues
                                                            are already absorbed into the next live bill */}
                                                        <div className="font-bold text-navy">
                                                            ₹{(record.status === "carried_forward"
                                                                ? record.amount
                                                                : (record.totalAmount || record.amount)
                                                            )?.toLocaleString()}
                                                        </div>
                                                        {record.status === "carried_forward" && (
                                                            <div className="text-xs text-purple-500 mt-0.5 font-medium">
                                                                Arrear — {MONTHS[(record.month || 1) - 1]} {record.year}
                                                                <span className="text-gray-400 font-normal block">dues merged into next bill</span>
                                                            </div>
                                                        )}
                                                        {record.status !== "carried_forward" && (record.previousDues || 0) > 0 && (
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
                                                                {/* Show base fee for CF records (stale totalAmount is misleading) */}
                                                                <span>School: ₹{(record.status === "carried_forward" ? record.amount : (record.totalAmount || record.amount)).toLocaleString()}</span>
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
                                                    {/* Mark Paid / Pay Transport / Pay Arrear button
                                                         Show if school is unpaid OR transport is still pending.
                                                         The old '&& record.status !== paid' check was wrong — it
                                                         blocked the button when school was paid but transport pending. */}
                                                    {(!schoolPaid || (isBusStudent && !transportPaid)) && (
                                                        <button
                                                            onClick={() => openMarkPaidDialog(record)}
                                                            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                                                record.status === "carried_forward"
                                                                    ? "bg-purple-50 text-purple-700 hover:bg-purple-100"
                                                                    : schoolPaid && !transportPaid
                                                                        ? "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                                                                        : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                                            }`}
                                                        >
                                                            <CheckCircle2 className="w-3 h-3" />
                                                            {record.status === "carried_forward"
                                                                ? "Pay Arrear"
                                                                : (schoolPaid && !transportPaid)
                                                                    ? "Pay Transport"
                                                                    : "Mark Paid"}
                                                        </button>
                                                    )}
                                                    {(record.status === "pending" || record.status === "overdue") && (
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
                                                    {(!schoolPaid || (isBusStudent && !transportPaid)) && (
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
                                                    {/* Undo (admin only) */}
                                                    {isAdmin && (record.status === "paid" || record.transportStatus === "paid") && (
                                                        <button
                                                            onClick={() => {
                                                                const schoolPaid = record.status === "paid";
                                                                const trpPaid = record.transportStatus === "paid";
                                                                setUndoRecord({
                                                                    record,
                                                                    type: schoolPaid && trpPaid ? "both" : schoolPaid ? "school" : "transport",
                                                                });
                                                            }}
                                                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-50 text-rose-600 text-xs font-medium hover:bg-rose-100 transition-colors"
                                                        >
                                                            <RotateCcw className="w-3 h-3" />
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
                    </div>
                )}
            </div>

            {/* Receipt Modal */}
            <FeeReceiptModal
                record={selectedReceipt}
                onClose={() => setSelectedReceipt(null)}
            />

            {/* ── Undo (Reverse Paid) Dialog ─────────────────────────────────── */}
            {undoRecord && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
                            <div>
                                <h3 className="text-lg font-bold text-rose-600">Reverse Payment</h3>
                                <p className="text-sm text-gray-400 mt-0.5">
                                    {undoRecord.record.studentName} · {MONTHS[undoRecord.record.month - 1]} {undoRecord.record.year}
                                </p>
                            </div>
                            <button onClick={() => setUndoRecord(null)} className="p-2 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="px-6 py-5 space-y-4">
                            <p className="text-sm text-gray-600">
                                Yeh action fee ko wapas <strong>Pending</strong> kar dega aur receipt delete ho jaayegi. Confirm karo?
                            </p>

                            {/* What else this reverse will touch */}
                            {(() => {
                                if (undoPreview.loading) {
                                    return (
                                        <div className="flex items-center gap-2 text-xs text-gray-400">
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking what this payment changed…
                                        </div>
                                    );
                                }

                                const logs = [
                                    ...(undoRecord.type !== "transport" && undoPreview.school ? [undoPreview.school] : []),
                                    ...(undoRecord.type !== "school" && undoPreview.transport ? [undoPreview.transport] : []),
                                ];
                                const settled = logs.reduce((n, l) => n + (l.settled?.length || 0), 0);
                                const adjusted = logs.reduce((n, l) => n + (l.adjusted?.length || 0), 0);
                                const addedBack = logs.reduce((n, l) => n + (l.adjusted || []).reduce((s, a) => s + (a.delta || 0), 0), 0);

                                // No log at all → payment was collected before full reverse existed
                                const hasAnyLog =
                                    (undoRecord.type !== "transport" && undoRecord.record.status === "paid" && undoPreview.school) ||
                                    (undoRecord.type !== "school" && undoRecord.record.transportStatus === "paid" && undoPreview.transport);

                                if (!hasAnyLog) {
                                    return (
                                        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
                                            <p className="text-xs font-semibold text-amber-800">Purana payment</p>
                                            <p className="text-xs text-amber-700 mt-1">
                                                Ye payment full-reverse feature se pehle liya gaya tha, isliye sirf yahi record
                                                pending hoga. Purane arrear months aur aage ke bill manually check kar lena.
                                            </p>
                                        </div>
                                    );
                                }

                                if (settled === 0 && adjusted === 0) {
                                    return (
                                        <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3">
                                            <p className="text-xs text-gray-600">
                                                Is payment ne sirf yahi bill badla tha — koi arrear month ya aage ka bill affect nahi hua.
                                            </p>
                                        </div>
                                    );
                                }

                                return (
                                    <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 space-y-1.5">
                                        <p className="text-xs font-semibold text-blue-800">Yeh sab wapas hoga:</p>
                                        {settled > 0 && (
                                            <p className="text-xs text-blue-700">
                                                • <strong>{settled}</strong> purane arrear month wapas <strong>Arrear</strong> ho jayenge
                                            </p>
                                        )}
                                        {adjusted > 0 && (
                                            <p className="text-xs text-blue-700">
                                                • <strong>{adjusted}</strong> aage ke bill me <strong>₹{addedBack.toLocaleString()}</strong> wapas jud jayega
                                            </p>
                                        )}
                                        <p className="text-[11px] text-blue-500 pt-0.5">
                                            Jo bill beech me collect ho chuka hai use haath nahi lagaya jayega.
                                        </p>
                                    </div>
                                );
                            })()}
                            {/* Toggle — only if both school and transport are paid */}
                            {undoRecord.record.status === "paid" && undoRecord.record.transportStatus === "paid" && (
                                <div className="flex gap-2">
                                    {(["both", "school", "transport"] as const).map((t) => (
                                        <button
                                            key={t}
                                            onClick={() => setUndoRecord({ ...undoRecord, type: t })}
                                            className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                                                undoRecord.type === t
                                                    ? "bg-rose-600 text-white border-rose-600"
                                                    : "bg-white text-gray-600 border-gray-200 hover:border-rose-300"
                                            }`}
                                        >
                                            {t === "both" ? "Dono" : t === "school" ? "School Only" : "Transport Only"}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <div className="flex gap-3 pt-1">
                                <button
                                    onClick={() => setUndoRecord(null)}
                                    className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleConfirmUndo}
                                    disabled={undoLoading}
                                    className="flex-1 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {undoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                                    {undoLoading ? "Reversing..." : "Confirm Reverse"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Mark Paid Dialog ───────────────────────────────────────────── */}
            {markPaidRecord && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden max-h-[95vh] flex flex-col">
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

                        {/* ── Two-column body ── */}
                        <div className="flex flex-col md:flex-row overflow-y-auto flex-1 min-h-0">

                        {/* LEFT: Bill Summary */}
                        <div className="px-6 py-4 bg-gray-50 md:w-[48%] md:border-r border-b md:border-b-0 border-gray-100 overflow-y-auto">
                            <div className="space-y-1.5">
                                {(() => {
                                    const bd = markPaidRecord.breakdown || {};
                                    const t = payTotals!;
                                    const transportFee = t.transportBase;
                                    const schoolFeeBase = t.schoolBase;
                                    const schoolPrevDues = t.schoolArrearsDue;
                                    const isCF = t.schoolCF;
                                    const schoolAlreadyPaid = t.schoolPaid;
                                    const isTranspCF = t.transportCF;
                                    const transportPrevDues = t.transportArrearsDue;
                                    const transportTotal = t.transportTotal;
                                    const transportAlreadyPaid = t.transportPaid;
                                    const totalPayable = t.payable;
                                    // Build breakdown lines (only show non-zero items)
                                    const breakdownLines: { label: string; amount: number }[] = [
                                        { label: "Tuition Fee",      amount: bd.tuitionFee      || 0 },
                                        { label: "Annual Fee",       amount: bd.annualFee        || 0 },
                                        { label: "Registration Fee", amount: bd.registrationFee  || 0 },
                                        { label: "Sports Fee",       amount: bd.sportsFee        || 0 },
                                        { label: "Misc Fee",         amount: bd.miscFee          || 0 },
                                    ].filter(l => l.amount > 0);
                                    const hasBreakdown = breakdownLines.length > 0;
                                    return (
                                        <>
                                            {!markPaidRecord.isTransportOnly && (
                                                <>
                                                    {/* School fee header — show 'Already Paid ✓' when school done */}
                                                    <div className="flex justify-between text-sm font-semibold text-navy">
                                                        <span className="flex items-center gap-1.5"><School className="w-4 h-4" /> School Fee (Current Month)</span>
                                                        {schoolAlreadyPaid ? (
                                                            <span className="flex items-center gap-1 text-emerald-600 font-medium text-xs">
                                                                <CheckCircle2 className="w-3.5 h-3.5" /> Already Paid
                                                            </span>
                                                        ) : (
                                                            <span>₹{schoolFeeBase.toLocaleString()}</span>
                                                        )}
                                                    </div>
                                                    {/* Breakdown details */}
                                                    {hasBreakdown && (
                                                        <div className="ml-6 space-y-1 py-1">
                                                            {breakdownLines.map(l => (
                                                                <div key={l.label} className="flex justify-between text-xs text-gray-500">
                                                                    <span>{l.label}</span>
                                                                    <span>₹{l.amount.toLocaleString()}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {!hasBreakdown && (
                                                        <div className="ml-6 text-xs text-gray-400">No breakdown available</div>
                                                    )}
                                                    {/* Late fine / other charges billed on top of base + arrears */}
                                                    {!isCF && !schoolAlreadyPaid && t.schoolExtras > 0 && (
                                                        <div className="flex justify-between text-xs text-amber-600 ml-6 pt-1">
                                                            <span>Late Fine / Other Charges</span>
                                                            <span className="font-semibold">₹{t.schoolExtras.toLocaleString()}</span>
                                                        </div>
                                                    )}
                                                    {/* Previous dues: hidden for CF records (dues already in next live bill) */}
                                                    {!isCF && !schoolAlreadyPaid && (schoolArrears.length > 0 || t.schoolResidual > 0 || arrearMonthsLoading) && (
                                                        <div className="flex flex-col text-sm border-t border-dashed border-gray-200 mt-2 pt-2">
                                                            <div className="flex justify-between">
                                                                <span className="flex items-center gap-1.5 text-rose-500"><AlertCircle className="w-4 h-4" /> Previous School Dues (Arrears)</span>
                                                                <span className="font-semibold text-rose-600">₹{schoolPrevDues.toLocaleString()}</span>
                                                            </div>
                                                            {arrearMonthsLoading ? (
                                                                <span className="text-xs text-rose-400 mt-1 ml-6 flex items-center gap-1">
                                                                    <Loader2 className="w-3 h-3 animate-spin" /> Verifying past bills...
                                                                </span>
                                                            ) : (
                                                                <ArrearPicker
                                                                    items={schoolArrears}
                                                                    excluded={excludedArrears}
                                                                    onToggle={toggleArrear}
                                                                    onSetAll={setAllArrears}
                                                                    residual={t.schoolResidual}
                                                                    label="school"
                                                                />
                                                            )}
                                                        </div>
                                                    )}
                                                    {/* CF notice: inform accountant this is an arrear-only payment */}
                                                    {isCF && (
                                                        <div className="flex items-start gap-1.5 text-xs text-purple-700 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 mt-1">
                                                            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                                            <span>This is an arrear month — previous dues are already included in the current active bill. Paying here clears only this month&apos;s base fee.</span>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                            {transportFee > 0 && (
                                                <>
                                                    {/* ── Transport Fee: Split into 2 parts ── */}
                                                    <div className="flex justify-between text-sm font-semibold text-navy mt-1">
                                                        <span className="flex items-center gap-1.5"><Bus className="w-4 h-4" /> Transport Fee (Current Month)</span>
                                                        {transportAlreadyPaid ? (
                                                            <span className="flex items-center gap-1 text-emerald-600 font-medium text-xs">
                                                                <CheckCircle2 className="w-3.5 h-3.5" /> Already Paid
                                                            </span>
                                                        ) : (
                                                            <span>₹{transportFee.toLocaleString()}</span>
                                                        )}
                                                    </div>
                                                    {/* Part 2 — Transport Arrears (if any) */}
                                                    {!isTranspCF && !transportAlreadyPaid && (transportArrears.length > 0 || t.transportResidual > 0 || arrearMonthsLoading) && (
                                                        <div className="border-t border-dashed border-gray-200 mt-2 pt-2 space-y-1">
                                                            {/* Base transport fee line */}
                                                            <div className="flex justify-between text-xs text-gray-500 ml-6">
                                                                <span>Base (this month)</span>
                                                                <span>₹{transportFee.toLocaleString()}</span>
                                                            </div>
                                                            {/* Arrears line */}
                                                            <div className="flex flex-col">
                                                                <div className="flex justify-between text-sm">
                                                                    <span className="flex items-center gap-1.5 text-rose-500"><AlertCircle className="w-4 h-4" /> Transport Arrears (Prev. Dues)</span>
                                                                    <span className="font-semibold text-rose-600">₹{transportPrevDues.toLocaleString()}</span>
                                                                </div>
                                                                {arrearMonthsLoading ? (
                                                                    <span className="text-xs text-rose-400 mt-1 ml-6 flex items-center gap-1">
                                                                        <Loader2 className="w-3 h-3 animate-spin" /> Verifying past bills...
                                                                    </span>
                                                                ) : (
                                                                    <ArrearPicker
                                                                        items={transportArrears}
                                                                        excluded={excludedArrears}
                                                                        onToggle={toggleArrear}
                                                                        onSetAll={setAllArrears}
                                                                        residual={t.transportResidual}
                                                                        label="transport"
                                                                    />
                                                                )}
                                                            </div>
                                                            {/* Total transport payable */}
                                                            <div className="flex justify-between text-sm font-semibold text-navy border-t border-gray-100 pt-1.5 mt-0.5">
                                                                <span className="ml-6">Transport Total</span>
                                                                <span>₹{transportTotal.toLocaleString()}</span>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {isTranspCF && (
                                                        <div className="flex items-start gap-1.5 text-xs text-purple-700 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 mt-1">
                                                            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                                            <span>This is a transport arrear month — previous dues are already included in the current active bill. Paying here clears only this month&apos;s base transport fee.</span>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                            <div className="flex justify-between font-bold text-navy border-t border-gray-200 pt-2 mt-1">
                                                <span>Total Payable</span>
                                                <span>₹{totalPayable.toLocaleString()}</span>
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                        </div>{/* end left bill summary */}

                        {/* RIGHT: Options + Discount + Email */}
                        <div className="px-6 py-5 space-y-3 md:flex-1 overflow-y-auto">
                            <p className="text-sm font-semibold text-gray-700 mb-3">Which fee has been paid?</p>

                            {(() => {
                                // All numbers come from payTotals so the options always
                                // reflect the arrear months currently ticked.
                                const _sBase = payTotals!.schoolBase;
                                const _sPrevDues = payTotals!.schoolArrearsDue;
                                const _isSCF = payTotals!.schoolCF;
                                const _sAlreadyPaid = isSchoolPaid(markPaidRecord);
                                const _schoolTotal = payTotals!.schoolTotal;

                                const _tBase = payTotals!.transportBase;
                                const _tPrevDues = payTotals!.transportArrearsDue;
                                const _isTranspCF = payTotals!.transportCF;
                                const _tAlreadyPaid = isTransportPaid(markPaidRecord);
                                const _transportTotal = payTotals!.transportTotal;

                                const _schoolDesc = _sAlreadyPaid
                                    ? `Already Paid`
                                    : _sPrevDues > 0 && !_isSCF
                                        ? `₹${_sBase.toLocaleString()} + ₹${_sPrevDues.toLocaleString()} arrears = ₹${_schoolTotal.toLocaleString()}`
                                        : `₹${_schoolTotal.toLocaleString()}`;

                                const _transportDesc = _tAlreadyPaid
                                    ? `Already Paid`
                                    : _tPrevDues > 0 && !_isTranspCF
                                        ? `₹${_tBase.toLocaleString()} + ₹${_tPrevDues.toLocaleString()} arrears = ₹${_transportTotal.toLocaleString()}`
                                        : `₹${_transportTotal.toLocaleString()}`;

                                const _bothTotal = (_sAlreadyPaid ? 0 : _schoolTotal) + (_tAlreadyPaid ? 0 : _transportTotal);
                                const _bothDesc = `₹${_bothTotal.toLocaleString()}`;

                                const opts: { value: MarkPaidType; label: string; desc: string; icon: any; disabled: boolean }[] = [
                                    ...(!markPaidRecord.isTransportOnly ? [
                                        { value: "school" as MarkPaidType, label: "School Fee Only", desc: _schoolDesc, icon: School, disabled: _sAlreadyPaid },
                                    ] : []),
                                    ...(hasTransportFee(markPaidRecord) ? [
                                        { value: "transport" as MarkPaidType, label: "Transport Fee Only", desc: _transportDesc, icon: Bus, disabled: _tAlreadyPaid },
                                        ...(!markPaidRecord.isTransportOnly ? [
                                            { value: "both" as MarkPaidType, label: "Both (School + Transport)", desc: _bothDesc, icon: CheckCircle2, disabled: _sAlreadyPaid || _tAlreadyPaid },
                                        ] : []),
                                    ] : []),
                                ];
                                return opts.map(opt => (
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
                            ));
                            })()}
                            
                            <div className="pt-3 mt-3 border-t border-gray-100">
                                <p className="text-sm font-semibold text-gray-700 mb-2">Payment Date</p>
                                <input
                                    type="date"
                                    value={paymentDate}
                                    max={new Date().toISOString().split("T")[0]}
                                    onChange={e => setPaymentDate(e.target.value)}
                                    className="w-full px-3 py-2.5 rounded-xl border-2 border-gray-100 text-sm font-medium text-gray-700 focus:border-emerald-400 focus:outline-none"
                                />
                                <p className="text-xs text-gray-400 mt-1">Defaults to today — change this if the payment was actually received on an earlier date.</p>
                            </div>

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
                                // Same source as the bill summary — includes only the
                                // arrear months left ticked.
                                const baseTotal = payTotals!.payable;
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

                        {/* Receipt Email — inside right column */}
                        <div className="px-6 pb-4 pt-3 border-t border-gray-100">
                            <p className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                                <Mail className="w-4 h-4 text-gray-400" /> Receipt Email
                                {isFetchingEmail && <Loader2 className="w-3 h-3 text-gray-400 animate-spin ml-1" />}
                            </p>
                            {/* Status banner */}
                            {!notifEmail && (
                                <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl mb-2">
                                    <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                                    <span className="text-xs text-amber-600">No notification email — receipt will not be emailed</span>
                                </div>
                            )}
                            {/* Always-visible input */}
                            <div className={`flex items-center gap-2 border-2 rounded-xl px-3 transition-colors ${notifEmail ? "border-emerald-400 bg-emerald-50" : "border-gray-200 bg-white"}`}>
                                {notifEmail && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                                <input
                                    type="email"
                                    value={notifEmail}
                                    onChange={e => setNotifEmail(e.target.value)}
                                    placeholder="Add parent/guardian email (optional)"
                                    className="flex-1 py-2.5 text-sm outline-none bg-transparent placeholder-gray-300"
                                />
                                {notifEmail && (
                                    <button
                                        type="button"
                                        onClick={() => setNotifEmail("")}
                                        className="text-gray-400 hover:text-rose-500 transition-colors shrink-0"
                                        title="Clear email"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </div>

                        </div>{/* end right column */}
                        </div>{/* end two-column body */}

                        {/* Actions — full width footer */}
                        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
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
                        </div>{/* end actions */}

                    </div>
                </div>
            )}

            {/* ── Bulk Mark Overdue — two-step confirmation ── */}
            {bulkOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center shrink-0">
                                <AlertTriangle className="w-4 h-4 text-rose-600" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-navy">Mark All Overdue</h3>
                                <p className="text-xs text-gray-400">Step {bulkStep} of 2</p>
                            </div>
                        </div>

                        <div className="px-6 py-5 space-y-4">
                            {bulkStep === 1 ? (
                                <>
                                    <p className="text-sm text-gray-600">
                                        This will update the records currently shown in the list:
                                    </p>
                                    <div className="rounded-xl border border-gray-100 bg-gray-50 divide-y divide-gray-100 text-sm">
                                        <div className="flex justify-between px-4 py-2.5">
                                            <span className="text-gray-500">Month</span>
                                            <span className="font-semibold text-navy">{MONTHS[filterMonth - 1]} {filterYear}</span>
                                        </div>
                                        <div className="flex justify-between px-4 py-2.5">
                                            <span className="text-gray-500">Class</span>
                                            <span className="font-semibold text-navy">{filterClass === "all" ? "All classes" : `Class ${filterClass}`}</span>
                                        </div>
                                        <div className="flex justify-between px-4 py-2.5">
                                            <span className="text-gray-500">Records to mark overdue</span>
                                            <span className="font-semibold text-rose-700">{bulkTargets.length}</span>
                                        </div>
                                        <div className="flex justify-between px-4 py-2.5">
                                            <span className="text-gray-500">₹100 late fine will be added to</span>
                                            <span className="font-semibold text-rose-700">{bulkFineCount} records</span>
                                        </div>
                                        <div className="flex justify-between px-4 py-2.5">
                                            <span className="text-gray-500">Total fine amount</span>
                                            <span className="font-semibold text-rose-700">₹{(bulkFineCount * 100).toLocaleString()}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-50 border border-blue-200">
                                        <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                                        <p className="text-xs text-blue-700">
                                            Each new fine is also added to the student&apos;s{" "}
                                            <strong>{MONTHS[nextMonthOf(filterMonth, filterYear).month - 1]} {nextMonthOf(filterMonth, filterYear).year}</strong>{" "}
                                            bill as previous dues, so it is never missed at collection time.
                                        </p>
                                    </div>
                                    <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200">
                                        <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                                        <p className="text-xs text-amber-700">
                                            Paid and arrear (carried forward) records are never touched. Records that already
                                            have a late fine will be marked overdue without charging a second fine.
                                            <strong className="block mt-1">There is no bulk undo — each record must be fixed one by one.</strong>
                                        </p>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <p className="text-sm text-gray-600">
                                        You are about to charge <strong className="text-rose-700">₹{(bulkFineCount * 100).toLocaleString()}</strong> in
                                        late fines across <strong className="text-rose-700">{bulkTargets.length}</strong> records
                                        for <strong>{MONTHS[filterMonth - 1]} {filterYear}</strong>.
                                    </p>
                                    <div>
                                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                            Type <span className="font-mono text-rose-700">OVERDUE</span> to confirm
                                        </label>
                                        <input
                                            autoFocus
                                            value={bulkConfirmText}
                                            onChange={e => setBulkConfirmText(e.target.value)}
                                            placeholder="OVERDUE"
                                            disabled={bulkLoading}
                                            className="mt-1.5 w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 text-sm font-mono tracking-widest outline-none focus:border-rose-400 disabled:bg-gray-50"
                                        />
                                    </div>
                                    {bulkLoading && bulkProgress.total > 0 && (
                                        <p className="text-xs text-gray-500">
                                            Updating {bulkProgress.done} of {bulkProgress.total} records…
                                        </p>
                                    )}
                                </>
                            )}
                        </div>

                        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
                            <button
                                onClick={bulkStep === 2 && !bulkLoading ? () => setBulkStep(1) : closeBulkDialog}
                                disabled={bulkLoading}
                                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-60"
                            >
                                {bulkStep === 2 ? "Back" : "Cancel"}
                            </button>
                            {bulkStep === 1 ? (
                                <button
                                    onClick={() => setBulkStep(2)}
                                    className="flex-1 px-4 py-2.5 rounded-xl bg-navy text-white text-sm font-semibold hover:bg-navy/90 transition-colors"
                                >
                                    Continue
                                </button>
                            ) : (
                                <button
                                    onClick={handleBulkMarkOverdue}
                                    disabled={bulkLoading || bulkConfirmText.trim().toUpperCase() !== "OVERDUE"}
                                    className="flex-1 px-4 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {bulkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
                                    Mark {bulkTargets.length} Overdue
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
