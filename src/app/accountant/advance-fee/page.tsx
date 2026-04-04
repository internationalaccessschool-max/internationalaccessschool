"use client";

import { useState, useCallback, useEffect } from "react";
import {
    collection, collectionGroup, getDocs, doc, getDoc, setDoc, query, orderBy
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import {
    Search, Loader2, X, CheckCircle2, CreditCard,
    School, Bus, User, ChevronDown, ChevronUp, AlertCircle,
    Printer, RefreshCw, Calendar, Filter
} from "lucide-react";
import toast from "react-hot-toast";
import { buildReceiptHTML, printReceiptHTML } from "@/lib/print-receipt";

// ─── Bus Types (for transport fee lookup) ─────────────────────────────────────
interface BusRoute {
    id: string;
    routeName: string;
    monthlyFee: number;
}
interface TransportBus {
    id: string;
    busNumber: string;
    routes?: BusRoute[];
    routeDetails?: string;
    monthlyFee?: number;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface StudentProfile {
    id: string;
    studentName: string;
    rollNo: string;
    class: string;          // normalised classId e.g. "7"
    section: string;
    parentEmail: string;
    parentPhone: string;
    busId?: string;
    busNumber?: string;
    routeDetails?: string;
    transportFee?: number;  // from student profile if stored
}

interface FeeStructure {
    monthly: number;
    dueDay: number;
    tuitionFee: number;
    annualFee: number;
    admissionFee: number;
    registrationFee: number;
    sportsFee: number;
    miscFee: number;
    transportFee: number;
}

// Per-month editable fee breakdown
interface MonthFeeRow {
    month: number;   // 1–12
    year: number;
    // School fee breakdown — each editable (Annual Fee excluded — handled via Annual Fees module)
    tuitionFee: number;
    admissionFee: number;
    registrationFee: number;
    sportsFee: number;
    miscFee: number;
    // Transport
    transportFee: number;   // 0 if school-only
    // Derived
    schoolTotal: number;
    grandTotal: number;
    // Status from Firestore (pre-existing)
    schoolAlreadyPaid: boolean;
    transportAlreadyPaid: boolean;
}

type FeeType = "school" | "transport" | "both";

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_FULL  = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const YEARS        = Array.from({ length: 2050 - 2024 + 1 }, (_, i) => 2024 + i);
const CURRENT_YEAR = new Date().getFullYear();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function genSchoolReceiptNo(year: number, month: number) {
    const seq = Math.floor(Math.random() * 900000) + 100000;
    return `ADV-${year}-${String(month).padStart(2, "0")}-${seq}`;
}

function genTransportReceiptNo(year: number, month: number) {
    const seq = Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 5).toUpperCase();
    return `TADV-${year}-${String(month).padStart(2, "0")}-${seq}`;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdvanceFeePage() {
    const { user } = useAuth();

    // ── Step 1: Student search ─────────────────────────────────────────────
    const [searchQuery, setSearchQuery]     = useState("");
    const [filterClass, setFilterClass]     = useState("");
    const [filterSection, setFilterSection] = useState("");
    const [allStudents, setAllStudents]     = useState<StudentProfile[]>([]);
    const [allBuses, setAllBuses]           = useState<TransportBus[]>([]);
    const [studentsLoading, setStudentsLoading] = useState(true);
    const [selectedStudent, setSelectedStudent] = useState<StudentProfile | null>(null);
    const [feeStructure, setFeeStructure]   = useState<FeeStructure | null>(null);
    const [loadingStructure, setLoadingStructure] = useState(false);

    // ── Fetch all students and buses on mount ─────────────────────────────
    useEffect(() => {
        const fetchAllProfiles = async () => {
            setStudentsLoading(true);
            try {
                // Fetch buses for transport fee lookup
                const busSnap = await getDocs(query(collection(db, "transport_buses"), orderBy("busNumber")));
                const buses = busSnap.docs.map(d => ({ id: d.id, ...d.data() } as TransportBus));
                setAllBuses(buses);

                const snap = await getDocs(collectionGroup(db, "profiles"));
                const results: StudentProfile[] = [];
                snap.docs.forEach(d => {
                    const data = d.data() as any;

                    // ── Filter: only active students ──────────────────────
                    const studentStatus = (data.status || "").toUpperCase();
                    if (studentStatus === "LEFT" || studentStatus === "TC" || studentStatus === "INACTIVE") return;

                    const rawClass = (data.className || data.currentClass || data.class || "").toString();
                    const classId  = rawClass.replace(/^class\s*/i, "").trim();
                    const fullName = (
                        data.name || data.fullName ||
                        `${data.firstName || ""} ${data.middleName || ""} ${data.lastName || ""}`.replace(/\s+/g, " ").trim() ||
                        "Unknown"
                    );
                    const rollNo = data.rollNo || data.admissionNumber || "";

                    // ── Resolve transport info from 'transport' field ───────
                    // transport field: "busId::routeId" or "busId" or "BUS" or "NONE"
                    const transportStr = (data.transport || "").trim();
                    let resolvedBusId = "";
                    let resolvedRouteId = "";
                    const isBusStudent = transportStr === "BUS" || transportStr.toUpperCase().startsWith("BUS");
                    if (isBusStudent && transportStr.includes("::")) {
                        [resolvedBusId, resolvedRouteId] = transportStr.split("::");
                    } else if (isBusStudent) {
                        resolvedBusId = transportStr;
                    }

                    // Resolve bus number and route details for display
                    const assignedBus = buses.find(b => b.id === resolvedBusId) || null;
                    const busNumber = assignedBus?.busNumber || (data.busNumber || "");
                    let routeDetails = data.routeDetails || "";
                    if (assignedBus && resolvedRouteId && assignedBus.routes) {
                        const rt = assignedBus.routes.find(r => r.id === resolvedRouteId);
                        if (rt) routeDetails = rt.routeName;
                    }

                    results.push({
                        id: d.id,
                        studentName: fullName,
                        rollNo,
                        class: classId,
                        section: data.section || "",
                        parentEmail: data.parentEmail || data.fatherEmail || data.email || "",
                        parentPhone: data.mobileNo || data.fatherMobile || data.phone || "",
                        busId: resolvedBusId || (isBusStudent ? "BUS" : ""),
                        busNumber,
                        routeDetails,
                        // Store the full transport string and routeId for fee lookup later
                        transportFee: 0, // will be resolved on-demand
                        // Extra fields for fee lookup
                        ...(resolvedRouteId ? { _resolvedRouteId: resolvedRouteId } : {}),
                        ...(resolvedBusId   ? { _resolvedBusId: resolvedBusId }     : {}),
                    } as any);
                });
                results.sort((a, b) => a.studentName.localeCompare(b.studentName));
                setAllStudents(results);
            } catch {
                toast.error("Failed to load students");
            } finally {
                setStudentsLoading(false);
            }
        };
        fetchAllProfiles();
    }, []);

    // ── Derived class/section lists for filter dropdowns ──────────────────
    const allClasses = Array.from(new Set(allStudents.map(s => s.class).filter(Boolean)))
        .sort((a, b) => {
            const na = parseInt(a), nb = parseInt(b);
            if (!isNaN(na) && !isNaN(nb)) return na - nb;
            return a.localeCompare(b);
        });
    const allSections = Array.from(new Set(
        allStudents.filter(s => !filterClass || s.class === filterClass).map(s => s.section).filter(Boolean)
    )).sort();

    const filteredStudents = allStudents.filter(s => {
        if (filterClass && s.class !== filterClass) return false;
        if (filterSection && s.section !== filterSection) return false;
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return s.studentName.toLowerCase().includes(q) || 
               s.rollNo.toLowerCase().includes(q) ||          // rollNo = admission number
               s.class.includes(q) ||
               (s.busNumber || "").toLowerCase().includes(q);
    });

    // ── Step 2: Month selection ────────────────────────────────────────────
    const [selectedMonths, setSelectedMonths] = useState<{ month: number; year: number }[]>([]);
    const [monthYear, setMonthYear] = useState(CURRENT_YEAR);  // shared year for month picker

    // ── Step 3: Fee type + editable rows ──────────────────────────────────
    const [feeType, setFeeType]    = useState<FeeType>("school");
    const [monthRows, setMonthRows] = useState<MonthFeeRow[]>([]);
    const [loadingRows, setLoadingRows] = useState(false);
    const [expandedRow, setExpandedRow] = useState<string | null>(null); // "month-year"

    // ── Step 4: Payment ───────────────────────────────────────────────────
    const [paymentMode, setPaymentMode] = useState<"CASH" | "UPI">("CASH");
    const [paying, setPaying]           = useState(false);
    const [paidResult, setPaidResult]   = useState<{ receipts: { month: number; year: number; schoolReceiptNo?: string; transportReceiptNo?: string; schoolTotal: number; transportTotal: number }[]; discountAmount: number } | null>(null);
    // Discount
    const [discountType, setDiscountType] = useState<"none" | "fixed" | "percent">("none");
    const [discountValue, setDiscountValue] = useState<number>(0);

    // ── Receipt modal ──────────────────────────────────────────────────────
    const [showReceipt, setShowReceipt] = useState(false);

    // ─── Select student → fetch fee structure ─────────────────────────────
    const handleSelectStudent = async (student: StudentProfile) => {
        setSelectedStudent(student);
        setSelectedMonths([]);
        setMonthRows([]);
        setPaidResult(null);
        setFeeStructure(null);

        if (!student.class) { toast.error("Student has no class assigned"); return; }
        setLoadingStructure(true);
        try {
            const structRef = doc(db, "fees", "structure", "classes", student.class);
            const structSnap = await getDoc(structRef);
            if (!structSnap.exists()) {
                toast.error(`No fee structure found for Class ${student.class}`);
            } else {
                setFeeStructure(structSnap.data() as FeeStructure);
            }
        } catch {
            toast.error("Failed to load fee structure");
        } finally {
            setLoadingStructure(false);
        }
    };

    // ─── Toggle month selection ────────────────────────────────────────────
    const toggleMonth = (month: number, year: number) => {
        setSelectedMonths(prev => {
            const exists = prev.find(m => m.month === month && m.year === year);
            if (exists) return prev.filter(m => !(m.month === month && m.year === year));
            return [...prev, { month, year }].sort((a, b) =>
                a.year !== b.year ? a.year - b.year : a.month - b.month
            );
        });
    };

    // ─── Build editable rows when user proceeds to next step ──────────────
    const handleBuildRows = async () => {
        if (!selectedStudent || !feeStructure || selectedMonths.length === 0) return;
        setLoadingRows(true);
        try {
            const rows: MonthFeeRow[] = await Promise.all(
                selectedMonths.map(async ({ month, year }) => {
                    // Check if already paid (school)
                    let schoolAlreadyPaid = false;
                    let transportAlreadyPaid = false;

                    try {
                        const recordId = `${selectedStudent.id}_${year}_${String(month).padStart(2, "0")}`;
                        const schoolRef = doc(db, `feeRecords/${year}/months/${month}/classes/${selectedStudent.class}/records`, recordId);
                        const schoolSnap = await getDoc(schoolRef);
                        if (schoolSnap.exists() && schoolSnap.data()?.status === "paid") schoolAlreadyPaid = true;
                    } catch { /* ignore */ }

                    try {
                        const trRef = doc(db, "transportFeeRecords", year.toString(), "months", month.toString(), "students", selectedStudent.id);
                        const trSnap = await getDoc(trRef);
                        if (trSnap.exists() && trSnap.data()?.status === "paid") transportAlreadyPaid = true;
                    } catch { /* ignore */ }

                    // Resolve transport fee from bus route or existing transport record
                    let existingTransportFee = 0;
                    if (selectedStudent.busId) {
                        try {
                            // 1) Try existing transport fee record for this month (most accurate)
                            const trRef = doc(db, "transportFeeRecords", year.toString(), "months", month.toString(), "students", selectedStudent.id);
                            const trSnap = await getDoc(trRef);
                            if (trSnap.exists() && trSnap.data()?.amount) {
                                existingTransportFee = trSnap.data().amount;
                            } else {
                                // 2) Resolve from bus route in transport_buses collection
                                const resolvedBusId   = (selectedStudent as any)._resolvedBusId || selectedStudent.busId;
                                const resolvedRouteId = (selectedStudent as any)._resolvedRouteId || "";
                                const assignedBus = allBuses.find(b => b.id === resolvedBusId);
                                if (assignedBus) {
                                    if (resolvedRouteId && assignedBus.routes) {
                                        const rt = assignedBus.routes.find(r => r.id === resolvedRouteId);
                                        existingTransportFee = rt?.monthlyFee || 0;
                                    } else if (assignedBus.routes && assignedBus.routes.length > 0) {
                                        existingTransportFee = assignedBus.routes[0].monthlyFee || 0;
                                    } else {
                                        existingTransportFee = assignedBus.monthlyFee || 0;
                                    }
                                }
                                // 3) Fallback to fee structure transport fee
                                if (!existingTransportFee) existingTransportFee = feeStructure.transportFee || 0;
                            }
                        } catch { existingTransportFee = feeStructure.transportFee || 0; }
                    }

                    const tFee = (feeType === "transport" || feeType === "both") && selectedStudent.busId
                        ? existingTransportFee
                        : 0;

                    const row: MonthFeeRow = {
                        month,
                        year,
                        tuitionFee:      feeStructure.tuitionFee      || 0,
                        admissionFee:    feeStructure.admissionFee     || 0,
                        registrationFee: feeStructure.registrationFee  || 0,
                        sportsFee:       feeStructure.sportsFee        || 0,
                        miscFee:         feeStructure.miscFee          || 0,
                        transportFee:    tFee,
                        schoolTotal:     0,
                        grandTotal:      0,
                        schoolAlreadyPaid,
                        transportAlreadyPaid,
                    };

                    row.schoolTotal = row.tuitionFee + row.admissionFee +
                        row.registrationFee + row.sportsFee + row.miscFee;
                    row.grandTotal  = row.schoolTotal + row.transportFee;

                    return row;
                })
            );
            setMonthRows(rows);
        } catch {
            toast.error("Failed to load payment details");
        } finally {
            setLoadingRows(false);
        }
    };

    // ─── Auto-recalculate totals when a row field changes ─────────────────
    const updateRowField = (
        idx: number,
        field: keyof Pick<MonthFeeRow, "tuitionFee" | "admissionFee" | "registrationFee" | "sportsFee" | "miscFee" | "transportFee">,
        value: number
    ) => {
        setMonthRows(prev => {
            const rows = [...prev];
            const row = { ...rows[idx], [field]: value };
            row.schoolTotal = row.tuitionFee + row.admissionFee +
                row.registrationFee + row.sportsFee + row.miscFee;
            row.grandTotal  = row.schoolTotal + row.transportFee;
            rows[idx] = row;
            return rows;
        });
    };

    // ─── Grand summary totals ──────────────────────────────────────────────
    const grandSchoolTotal    = monthRows.filter(r => !r.schoolAlreadyPaid || feeType === "transport").reduce((s, r) => s + (feeType !== "transport" ? r.schoolTotal : 0), 0);
    const grandTransportTotal = monthRows.filter(r => !r.transportAlreadyPaid).reduce((s, r) => s + r.transportFee, 0);
    const grandTotal          = grandSchoolTotal + grandTransportTotal;

    // Computed discount amount on grandTotal
    const computedDiscountAmt = discountType === "fixed"
        ? Math.min(discountValue, grandTotal)
        : discountType === "percent"
            ? Math.min((discountValue / 100) * grandTotal, grandTotal)
            : 0;
    const netPayableTotal = grandTotal - computedDiscountAmt;

    // ─── Confirm payment ──────────────────────────────────────────────────
    const handleConfirmPayment = async () => {
        if (!selectedStudent || monthRows.length === 0) return;
        setPaying(true);
        const paidOn = new Date();
        const receipts: { month: number; year: number; schoolReceiptNo?: string; transportReceiptNo?: string; schoolTotal: number; transportTotal: number }[] = [];

        try {
            for (const row of monthRows) {
                const { month, year } = row;
                let schoolReceiptNo: string | undefined;
                let transportReceiptNo: string | undefined;

                // ── School fee ──────────────────────────────────────────
                if (feeType !== "transport" && !row.schoolAlreadyPaid && row.schoolTotal > 0) {
                    schoolReceiptNo = genSchoolReceiptNo(year, month);
                    const recordId = `${selectedStudent.id}_${year}_${String(month).padStart(2, "0")}`;
                    const recordRef = doc(
                        db,
                        `feeRecords/${year}/months/${month}/classes/${selectedStudent.class}/records`,
                        recordId
                    );
                    const dueDate = new Date(year, month - 1, feeStructure?.dueDay || 10);

                    await setDoc(recordRef, {
                        studentId:   selectedStudent.id,
                        studentName: selectedStudent.studentName,
                        rollNo:      selectedStudent.rollNo,
                        class:       selectedStudent.class,
                        section:     selectedStudent.section,
                        parentEmail: selectedStudent.parentEmail,
                        parentPhone: selectedStudent.parentPhone,
                        amount:      row.schoolTotal,
                        breakdown: {
                            tuitionFee:      row.tuitionFee,
                            admissionFee:    row.admissionFee,
                            registrationFee: row.registrationFee,
                            sportsFee:       row.sportsFee,
                            miscFee:         row.miscFee,
                        },
                        month,
                        year,
                        dueDate,
                        status:      "paid",
                        paidOn,
                        receiptNo:   schoolReceiptNo,
                        paymentMode,
                        markedBy:    user?.uid || "",
                        createdAt:   paidOn,
                        isAdvancePayment: true,
                    }, { merge: true });
                }

                // ── Transport fee ───────────────────────────────────────
                if (feeType !== "school" && !row.transportAlreadyPaid && row.transportFee > 0 && selectedStudent.busId) {
                    transportReceiptNo = genTransportReceiptNo(year, month);
                    const trRef = doc(
                        db,
                        "transportFeeRecords", year.toString(), "months", month.toString(), "students", selectedStudent.id
                    );
                    const dueDate = new Date(year, month - 1, feeStructure?.dueDay || 10);

                    await setDoc(trRef, {
                        studentId:    selectedStudent.id,
                        studentName:  selectedStudent.studentName,
                        className:    selectedStudent.class,
                        section:      selectedStudent.section,
                        busId:        selectedStudent.busId || "BUS",
                        busNumber:    selectedStudent.busNumber || "—",
                        routeDetails: selectedStudent.routeDetails || "",
                        amount:       row.transportFee,
                        month,
                        year,
                        dueDate,
                        status:      "paid",
                        paidOn,
                        receiptNo:   transportReceiptNo,
                        paymentMode,
                        parentEmail: selectedStudent.parentEmail,
                        markedBy:    user?.uid || "",
                        isAdvancePayment: true,
                    }, { merge: true });
                }

                receipts.push({
                    month,
                    year,
                    schoolReceiptNo,
                    transportReceiptNo,
                    schoolTotal:    feeType !== "transport" && !row.schoolAlreadyPaid ? row.schoolTotal : 0,
                    transportTotal: feeType !== "school"  && !row.transportAlreadyPaid ? row.transportFee : 0,
                });
            }

            setPaidResult({ receipts, discountAmount: computedDiscountAmt });
            toast.success(`Advance payment recorded for ${monthRows.length} month${monthRows.length > 1 ? "s" : ""}!`);

            // --- SEND COMBINED EMAIL RECEIPT ---
            const lineItems: { label: string; amount: number }[] = [];
            receipts.forEach(r => {
                const monthLabel = `${MONTHS_FULL[r.month - 1]} ${r.year}`;
                if (r.schoolTotal > 0)    lineItems.push({ label: `School Fee — ${monthLabel}`,    amount: r.schoolTotal });
                if (r.transportTotal > 0) lineItems.push({ label: `Transport Fee — ${monthLabel}`, amount: r.transportTotal });
            });
            // Add discount line at the end
            if (computedDiscountAmt > 0) {
                const pct = discountType === "percent" ? ` (${discountValue}%)` : ``;
                lineItems.push({ label: `Discount Applied${pct}`, amount: -computedDiscountAmt });
            }

            const allSchoolReceipts    = receipts.map(r => r.schoolReceiptNo).filter(Boolean).join(", ");
            const allTransportReceipts = receipts.map(r => r.transportReceiptNo).filter(Boolean).join(", ");

            fetch("/api/send-receipt", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    studentId: selectedStudent.id,
                    receiptData: {
                        title:        "Advance Fee Payment Receipt",
                        receiptNo:    allSchoolReceipts || allTransportReceipts || "ADV-MULTI",
                        studentName:  selectedStudent.studentName,
                        classSection: `Class ${selectedStudent.class}${selectedStudent.section ? ` - ${selectedStudent.section}` : ""}`,
                        rollNo:       selectedStudent.rollNo || undefined,
                        extraInfo: [
                            { label: "Payment Type",  value: feeType === "both" ? "School + Transport" : feeType === "transport" ? "Transport Only" : "School Only" },
                            { label: "Months Covered", value: receipts.map(r => `${MONTHS_SHORT[r.month - 1]} ${r.year}`).join(", ") },
                            ...(allSchoolReceipts    ? [{ label: "School Receipt Nos",    value: allSchoolReceipts }] : []),
                            ...(allTransportReceipts ? [{ label: "Transport Receipt Nos", value: allTransportReceipts }] : []),
                        ],
                        paidOn:       new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
                        feeMonth:     "Multiple Months (Advance)",
                        lineItems,
                        totalAmount:  lineItems.reduce((s, i) => s + i.amount, 0),
                        paymentMode,
                    }
                })
            }).catch(console.error);
            // -----------------------------------

        } catch (err: any) {
            console.error(err);
            toast.error("Payment failed: " + (err?.message || "Unknown error"));
        } finally {
            setPaying(false);
        }
    };

    // ─── Print combined receipt ───────────────────────────────────────────
    const handlePrintSummaryReceipt = () => {
        if (!paidResult || !selectedStudent) return;

        const lineItems: { label: string; amount: number }[] = [];
        paidResult.receipts.forEach(r => {
            const monthLabel = `${MONTHS_FULL[r.month - 1]} ${r.year}`;
            if (r.schoolTotal > 0)    lineItems.push({ label: `School Fee — ${monthLabel}`,    amount: r.schoolTotal });
            if (r.transportTotal > 0) lineItems.push({ label: `Transport Fee — ${monthLabel}`, amount: r.transportTotal });
        });

        const allSchoolReceipts    = paidResult.receipts.map(r => r.schoolReceiptNo).filter(Boolean).join(", ");
        const allTransportReceipts = paidResult.receipts.map(r => r.transportReceiptNo).filter(Boolean).join(", ");

        const html = buildReceiptHTML({
            title:        "Advance Fee Payment Receipt",
            receiptNo:    allSchoolReceipts || allTransportReceipts || "ADV-MULTI",
            studentName:  selectedStudent.studentName,
            classSection: `Class ${selectedStudent.class}${selectedStudent.section ? ` - ${selectedStudent.section}` : ""}`,
            rollNo:       selectedStudent.rollNo || undefined,
            extraInfo: [
                { label: "Payment Type",  value: feeType === "both" ? "School + Transport" : feeType === "transport" ? "Transport Only" : "School Only" },
                { label: "Months Covered", value: paidResult.receipts.map(r => `${MONTHS_SHORT[r.month - 1]} ${r.year}`).join(", ") },
                ...(allSchoolReceipts    ? [{ label: "School Receipt Nos",    value: allSchoolReceipts }] : []),
                ...(allTransportReceipts ? [{ label: "Transport Receipt Nos", value: allTransportReceipts }] : []),
            ],
            paidOn:       new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
            feeMonth:     "Multiple Months (Advance)",
            lineItems,
            totalAmount:  lineItems.reduce((s, i) => s + i.amount, 0),
            paymentMode,
        });

        printReceiptHTML(html, "Advance Fee Receipt");
    };

    // ─── Reset everything ─────────────────────────────────────────────────
    const handleReset = () => {
        setSelectedStudent(null);
        setFeeStructure(null);
        setSelectedMonths([]);
        setMonthRows([]);
        setPaidResult(null);
        setSearchQuery("");
    };

    // ─── UI helpers ───────────────────────────────────────────────────────
    const step = !selectedStudent ? 1 : paidResult ? 4 : monthRows.length > 0 ? 3 : 2;

    return (
        <div className="space-y-6">
            {/* ── Header ── */}
            <div className="rounded-2xl gradient-navy p-6 md:p-8 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10"
                    style={{ backgroundImage: "radial-gradient(circle at 80% 50%, rgba(200,169,81,0.25) 0%, transparent 60%)" }}
                />
                <div className="relative z-10 flex items-start justify-between">
                    <div>
                        <p className="text-white/50 text-sm font-medium">Finance Portal</p>
                        <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">Advance Fee Payment</h1>
                        <p className="text-white/40 text-sm mt-2">
                            Collect multiple months' fees in one transaction — school, transport, or both.
                        </p>
                    </div>
                    {selectedStudent && (
                        <button onClick={handleReset}
                            className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 text-white text-sm hover:bg-white/20 transition-colors">
                            <RefreshCw className="w-4 h-4" /> New Payment
                        </button>
                    )}
                </div>
            </div>

            {/* ── Step Indicator ── */}
            <div className="flex items-center gap-2">
                {["Select Student", "Choose Months", "Review & Pay", "Done"].map((label, i) => (
                    <div key={label} className="flex items-center gap-2 flex-1 min-w-0">
                        <div className={`flex items-center gap-2 flex-1 min-w-0 ${i < step - 1 ? "opacity-100" : i === step - 1 ? "opacity-100" : "opacity-40"}`}>
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0
                                ${i < step - 1 ? "bg-emerald-500 text-white" : i === step - 1 ? "bg-navy text-white" : "bg-gray-200 text-gray-500"}`}>
                                {i < step - 1 ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                            </div>
                            <span className="text-xs font-semibold text-gray-600 truncate hidden sm:block">{label}</span>
                        </div>
                        {i < 3 && <div className={`h-px flex-1 mx-1 ${i < step - 1 ? "bg-emerald-300" : "bg-gray-200"}`} />}
                    </div>
                ))}
            </div>

            {/* ══════════════════════════════════════════════════════════
                STEP 1 — Student Search
            ══════════════════════════════════════════════════════════ */}
            {!selectedStudent && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
                    <div>
                        <h2 className="font-bold text-navy text-lg">Search Student</h2>
                        <p className="text-xs text-gray-400 mt-0.5">Search by name, roll no, bus, or filter by class &amp; section</p>
                    </div>

                    {/* Search + Filters row */}
                    <div className="flex flex-wrap gap-3">
                        <div className="flex-1 min-w-[200px] relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Search by name or admission number…"
                                className="w-full pl-9 pr-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-navy focus:ring-1 focus:ring-navy outline-none"
                            />
                        </div>
                        {/* Class filter */}
                        <div className="relative">
                            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <select
                                value={filterClass}
                                onChange={e => { setFilterClass(e.target.value); setFilterSection(""); }}
                                className="pl-9 pr-8 py-3 rounded-xl border border-gray-200 text-sm focus:border-navy outline-none appearance-none bg-white min-w-[130px]"
                            >
                                <option value="">All Classes</option>
                                {allClasses.map(c => (
                                    <option key={c} value={c}>Class {c}</option>
                                ))}
                            </select>
                        </div>
                        {/* Section filter */}
                        <div className="relative">
                            <select
                                value={filterSection}
                                onChange={e => setFilterSection(e.target.value)}
                                disabled={!filterClass}
                                className="px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-navy outline-none appearance-none bg-white min-w-[120px] disabled:opacity-50"
                            >
                                <option value="">All Sections</option>
                                {allSections.map(s => (
                                    <option key={s} value={s}>Section {s}</option>
                                ))}
                            </select>
                        </div>
                        {/* Clear filters */}
                        {(filterClass || filterSection || searchQuery) && (
                            <button
                                onClick={() => { setFilterClass(""); setFilterSection(""); setSearchQuery(""); }}
                                className="flex items-center gap-1.5 px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
                            >
                                <X className="w-4 h-4" /> Clear
                            </button>
                        )}
                    </div>
                    {/* Filter summary */}
                    {(filterClass || filterSection) && (
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                            <span className="font-semibold">{filteredStudents.length}</span> student{filteredStudents.length !== 1 ? "s" : ""} found
                            {filterClass && <span className="px-2 py-0.5 rounded-full bg-navy/10 text-navy font-semibold">Class {filterClass}</span>}
                            {filterSection && <span className="px-2 py-0.5 rounded-full bg-navy/10 text-navy font-semibold">Section {filterSection}</span>}
                        </div>
                    )}

                    {/* Results */}
                    {studentsLoading ? (
                        <div className="flex flex-col items-center justify-center py-12">
                            <Loader2 className="w-8 h-8 animate-spin text-navy mb-3" />
                            <p className="text-sm text-gray-500 font-medium">Loading students...</p>
                        </div>
                    ) : filteredStudents.length > 0 ? (
                        <div className="border border-gray-100 rounded-xl overflow-y-auto max-h-[450px] divide-y divide-gray-50 mb-2">
                            {filteredStudents.map(student => (
                                <button
                                    key={student.id}
                                    onClick={() => handleSelectStudent(student)}
                                    className="w-full flex sm:items-center gap-4 px-5 py-4 hover:bg-emerald-50/50 transition-colors text-left group">
                                    <div className="w-10 h-10 rounded-xl bg-navy/5 flex items-center justify-center shrink-0 group-hover:bg-emerald-100 transition-colors hidden sm:flex">
                                        <User className="w-5 h-5 text-navy group-hover:text-emerald-700 transition-colors" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-navy text-[15px]">{student.studentName}</div>
                                        <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                                            <span><strong className="text-gray-400 font-medium">Class:</strong> {student.class}{student.section ? ` - ${student.section}` : ""}</span>
                                            {student.rollNo && <span><strong className="text-gray-400 font-medium">Adm No:</strong> {student.rollNo}</span>}
                                        </div>
                                    </div>
                                    {student.busId && (
                                        <span className="shrink-0 inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100 hidden sm:inline-flex">
                                            <Bus className="w-3.5 h-3.5" /> Bus {student.busNumber}
                                        </span>
                                    )}
                                    <div className="shrink-0 text-emerald-600 border border-emerald-200 bg-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm group-hover:bg-emerald-50 transition-colors">
                                        Select
                                    </div>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-12 text-gray-400 bg-gray-50/50 rounded-xl border border-gray-100 border-dashed">
                            <User className="w-10 h-10 mx-auto mb-3 opacity-20" />
                            <p className="text-sm font-medium text-gray-500">No students found</p>
                            <p className="text-xs mt-1">Try adjusting your search query</p>
                        </div>
                    )}
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════
                STEP 2 — Select Months
            ══════════════════════════════════════════════════════════ */}
            {selectedStudent && !paidResult && monthRows.length === 0 && (
                <>
                    {/* Student Card */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-navy/10 flex items-center justify-center shrink-0">
                            <User className="w-6 h-6 text-navy" />
                        </div>
                        <div className="flex-1">
                            <div className="font-bold text-navy text-lg">{selectedStudent.studentName}</div>
                            <div className="text-sm text-gray-500">
                                Class {selectedStudent.class}{selectedStudent.section ? ` - ${selectedStudent.section}` : ""}
                                {selectedStudent.rollNo && ` · Adm No: ${selectedStudent.rollNo}`}
                            </div>
                            {selectedStudent.busId && (
                                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full mt-1.5 bg-indigo-50 text-indigo-700">
                                    <Bus className="w-3 h-3" /> Bus Student · {selectedStudent.busNumber}
                                </span>
                            )}
                        </div>
                        {loadingStructure && <Loader2 className="w-5 h-5 animate-spin text-gray-400" />}
                        {feeStructure && (
                            <div className="text-right text-sm">
                                <div className="text-xs text-gray-400">Monthly Fee</div>
                                <div className="font-bold text-navy text-lg">₹{feeStructure.monthly?.toLocaleString()}</div>
                            </div>
                        )}
                    </div>

                    {feeStructure && (
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
                            <div>
                                <h2 className="font-bold text-navy text-lg">Select Months</h2>
                                <p className="text-xs text-gray-400 mt-0.5">Select one or more months for advance payment</p>
                            </div>

                            {/* Fee Type */}
                            <div>
                                <p className="text-sm font-semibold text-gray-700 mb-3">Fee Type</p>
                                <div className="grid grid-cols-3 gap-3">
                                    {([
                                        { value: "school" as FeeType,    label: "School Only",         icon: School,        disabled: false },
                                        { value: "transport" as FeeType, label: "Transport Only",       icon: Bus,           disabled: !selectedStudent.busId },
                                        { value: "both" as FeeType,      label: "School + Transport",  icon: CreditCard,    disabled: !selectedStudent.busId },
                                    ]).map(opt => (
                                        <button
                                            key={opt.value}
                                            disabled={opt.disabled}
                                            onClick={() => setFeeType(opt.value)}
                                            className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 text-sm font-semibold transition-all
                                                ${opt.disabled ? "opacity-30 cursor-not-allowed border-gray-100 text-gray-400" :
                                                    feeType === opt.value
                                                        ? "border-navy bg-navy/5 text-navy"
                                                        : "border-gray-100 hover:border-gray-300 text-gray-600"}`}>
                                            <opt.icon className="w-5 h-5" />
                                            <span className="text-xs">{opt.label}</span>
                                        </button>
                                    ))}
                                </div>
                                {!selectedStudent.busId && (
                                    <p className="text-xs text-amber-600 mt-2 flex items-center gap-1.5">
                                        <AlertCircle className="w-3.5 h-3.5" />
                                        This student has no bus assigned. Only school fee options are available.
                                    </p>
                                )}
                            </div>

                            {/* Year + Month Grid */}
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <p className="text-sm font-semibold text-gray-700">Select Months</p>
                                    <select value={monthYear} onChange={e => setMonthYear(Number(e.target.value))}
                                        className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:border-navy outline-none">
                                        {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                                    </select>
                                </div>
                                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                                    {MONTHS_SHORT.map((m, i) => {
                                        const month = i + 1;
                                        const isSelected = selectedMonths.some(s => s.month === month && s.year === monthYear);
                                        return (
                                            <button
                                                key={m}
                                                onClick={() => toggleMonth(month, monthYear)}
                                                className={`py-2.5 rounded-xl text-sm font-semibold border-2 transition-all
                                                    ${isSelected
                                                        ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                                                        : "border-gray-100 hover:border-gray-300 text-gray-600"}`}>
                                                {m}
                                            </button>
                                        );
                                    })}
                                </div>
                                {selectedMonths.length > 0 && (
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {selectedMonths.map(({ month, year }) => (
                                            <span key={`${month}-${year}`}
                                                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
                                                <Calendar className="w-3 h-3" />
                                                {MONTHS_SHORT[month - 1]} {year}
                                                <button onClick={() => toggleMonth(month, year)}
                                                    className="ml-0.5 hover:text-rose-500 transition-colors">
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={handleBuildRows}
                                disabled={selectedMonths.length === 0 || loadingRows}
                                className="w-full py-3 rounded-xl bg-navy text-white font-semibold text-sm hover:bg-navy/90 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                                {loadingRows ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronDown className="w-4 h-4" />}
                                {loadingRows ? "Loading fee details…" : `Review ${selectedMonths.length} month${selectedMonths.length !== 1 ? "s" : ""} →`}
                            </button>
                        </div>
                    )}
                </>
            )}

            {/* ══════════════════════════════════════════════════════════
                STEP 3 — Review & Editable Fee Rows
            ══════════════════════════════════════════════════════════ */}
            {selectedStudent && monthRows.length > 0 && !paidResult && (
                <>
                    {/* Student card compact */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-5 py-3.5 flex items-center gap-3">
                        <User className="w-4 h-4 text-navy shrink-0" />
                        <span className="font-semibold text-navy text-sm">{selectedStudent.studentName}</span>
                        <span className="text-xs text-gray-400">Class {selectedStudent.class}{selectedStudent.section ? ` - ${selectedStudent.section}` : ""}</span>
                        <span className="ml-auto text-xs px-2 py-1 rounded-full bg-navy/10 text-navy font-semibold">
                            {feeType === "school" ? "School Only" : feeType === "transport" ? "Transport Only" : "School + Transport"}
                        </span>
                    </div>

                    {/* Month rows */}
                    <div className="space-y-3">
                        {monthRows.map((row, idx) => {
                            const rowKey = `${row.month}-${row.year}`;
                            const isExpanded = expandedRow === rowKey;
                            const schoolSkipped    = row.schoolAlreadyPaid && feeType !== "transport";
                            const transportSkipped = row.transportAlreadyPaid && feeType !== "school";

                            return (
                                <div key={rowKey} className={`bg-white rounded-2xl shadow-sm border transition-all
                                    ${row.schoolAlreadyPaid && row.transportAlreadyPaid ? "border-gray-100 opacity-60" : "border-gray-100"}`}>

                                    {/* Row header */}
                                    <button
                                        onClick={() => setExpandedRow(isExpanded ? null : rowKey)}
                                        className="w-full flex items-center justify-between px-5 py-4 text-left">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-navy/8 flex items-center justify-center shrink-0">
                                                <Calendar className="w-5 h-5 text-navy" />
                                            </div>
                                            <div>
                                                <div className="font-bold text-navy">{MONTHS_FULL[row.month - 1]} {row.year}</div>
                                                <div className="text-xs text-gray-400 space-x-2">
                                                    {feeType !== "transport" && (
                                                        <span>
                                                            {row.schoolAlreadyPaid
                                                                ? "School: Already Paid"
                                                                : `School: ₹${row.schoolTotal.toLocaleString()}`}
                                                        </span>
                                                    )}
                                                    {feeType !== "school" && row.transportFee > 0 && (
                                                        <span>
                                                            {row.transportAlreadyPaid
                                                                ? "Transport: Already Paid"
                                                                : `Transport: ₹${row.transportFee.toLocaleString()}`}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            {(schoolSkipped || transportSkipped) && (
                                                <span className="text-xs px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-semibold">
                                                    Partially Paid
                                                </span>
                                            )}
                                            <div className="text-right">
                                                <div className="text-xs text-gray-400">Amount Due</div>
                                                <div className="font-bold text-navy">
                                                    ₹{(
                                                        (!row.schoolAlreadyPaid && feeType !== "transport" ? row.schoolTotal : 0) +
                                                        (!row.transportAlreadyPaid && feeType !== "school" ? row.transportFee : 0)
                                                    ).toLocaleString()}
                                                </div>
                                            </div>
                                            {isExpanded
                                                ? <ChevronUp className="w-4 h-4 text-gray-400" />
                                                : <ChevronDown className="w-4 h-4 text-gray-400" />}
                                        </div>
                                    </button>

                                    {/* Expanded breakdown — editable */}
                                    {isExpanded && (
                                        <div className="px-5 pb-5 border-t border-gray-50 pt-4">
                                            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                                                Fee Breakdown — Edit amounts if needed
                                            </div>

                                            {/* School breakdown */}
                                            {feeType !== "transport" && (
                                                <div className="space-y-2 mb-4">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <School className="w-3.5 h-3.5 text-navy" />
                                                        <span className="text-xs font-bold text-navy uppercase tracking-wide">School Fee</span>
                                                        {row.schoolAlreadyPaid && (
                                                            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Already Paid</span>
                                                        )}
                                                    </div>
                                                    {([
                                                        { field: "tuitionFee" as const,      label: "Tuition Fee" },
                                                        { field: "admissionFee" as const,     label: "Admission Fee" },
                                                        { field: "registrationFee" as const,  label: "Registration Fee" },
                                                        { field: "sportsFee" as const,        label: "Sports Fee" },
                                                        { field: "miscFee" as const,          label: "Miscellaneous Fee" },
                                                    ]).map(item => (
                                                        <div key={item.field} className="flex items-center gap-3">
                                                            <label className="text-xs text-gray-500 flex-1">{item.label}</label>
                                                            <div className="relative">
                                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">₹</span>
                                                                <input
                                                                    type="number"
                                                                    min={0}
                                                                    value={row[item.field]}
                                                                    disabled={row.schoolAlreadyPaid}
                                                                    onChange={e => updateRowField(idx, item.field, parseFloat(e.target.value) || 0)}
                                                                    className="w-28 pl-6 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:border-navy outline-none text-right disabled:bg-gray-50 disabled:text-gray-400"
                                                                />
                                                            </div>
                                                        </div>
                                                    ))}
                                                    <div className="flex justify-between text-sm font-bold text-navy border-t border-gray-100 pt-2 mt-1">
                                                        <span>School Subtotal</span>
                                                        <span>₹{row.schoolTotal.toLocaleString()}</span>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Transport breakdown */}
                                            {feeType !== "school" && (
                                                <div className="space-y-2">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <Bus className="w-3.5 h-3.5 text-indigo-600" />
                                                        <span className="text-xs font-bold text-indigo-700 uppercase tracking-wide">Transport Fee</span>
                                                        {row.transportAlreadyPaid && (
                                                            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Already Paid</span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <label className="text-xs text-gray-500 flex-1">Bus / Transport Fee</label>
                                                        <div className="relative">
                                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">₹</span>
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                value={row.transportFee}
                                                                disabled={row.transportAlreadyPaid}
                                                                onChange={e => updateRowField(idx, "transportFee", parseFloat(e.target.value) || 0)}
                                                                className="w-28 pl-6 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:border-navy outline-none text-right disabled:bg-gray-50 disabled:text-gray-400"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Summary + Payment Mode + Confirm */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
                        {/* Summary */}
                        <div>
                            <h3 className="font-bold text-navy mb-3">Payment Summary</h3>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between text-gray-600">
                                    <span>Months Selected</span>
                                    <span className="font-semibold text-navy">{monthRows.length}</span>
                                </div>
                                {feeType !== "transport" && (
                                    <div className="flex justify-between text-gray-600">
                                        <span>School Fee Total</span>
                                        <span className="font-semibold">₹{grandSchoolTotal.toLocaleString()}</span>
                                    </div>
                                )}
                                {feeType !== "school" && (
                                    <div className="flex justify-between text-gray-600">
                                        <span>Transport Fee Total</span>
                                        <span className="font-semibold">₹{grandTransportTotal.toLocaleString()}</span>
                                    </div>
                                )}
                                <div className="flex justify-between font-bold text-navy border-t border-gray-100 pt-2 mt-1 text-base">
                                    <span>Grand Total</span>
                                    <span>₹{grandTotal.toLocaleString()}</span>
                                </div>
                            </div>
                        </div>

                        {/* Payment Mode */}
                        <div>
                            <p className="text-sm font-semibold text-gray-700 mb-3">Payment Mode</p>
                            <div className="grid grid-cols-2 gap-3">
                                {(["CASH", "UPI"] as const).map(mode => (
                                    <label key={mode}
                                        className={`flex justify-center items-center gap-2 py-3 rounded-xl border-2 cursor-pointer font-semibold text-sm transition-all
                                            ${paymentMode === mode ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-100 hover:border-gray-300 text-gray-600"}`}>
                                        <input type="radio" name="pm" value={mode} checked={paymentMode === mode} onChange={() => setPaymentMode(mode)} className="hidden" />
                                        {mode === "CASH" ? "💵 Cash" : "📱 UPI"}
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* ── Discount Section ── */}
                        <div className="pt-3 mt-1 border-t border-gray-100">
                            <p className="text-sm font-semibold text-gray-700 mb-2">Discount <span className="font-normal text-gray-400">(Optional)</span></p>
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
                                        max={discountType === "percent" ? 100 : grandTotal}
                                        value={discountValue || ""}
                                        onChange={e => setDiscountValue(parseFloat(e.target.value) || 0)}
                                        placeholder={discountType === "fixed" ? "Enter amount" : "Enter %"}
                                        className="flex-1 px-3 py-2 border-2 border-violet-200 rounded-xl text-sm outline-none focus:border-violet-500 bg-violet-50/50"
                                    />
                                </div>
                            )}
                            <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 space-y-1.5 text-sm">
                                <div className="flex justify-between text-gray-500">
                                    <span>Subtotal</span><span>₹{grandTotal.toLocaleString()}</span>
                                </div>
                                {computedDiscountAmt > 0 && (
                                    <div className="flex justify-between text-violet-600 font-medium">
                                        <span>Discount {discountType === "percent" ? `(${discountValue}%)` : "(Fixed)"}</span>
                                        <span>−₹{computedDiscountAmt.toLocaleString()}</span>
                                    </div>
                                )}
                                <div className="flex justify-between font-bold text-navy border-t border-gray-200 pt-1.5 mt-1">
                                    <span>Net Payable</span><span>₹{netPayableTotal.toLocaleString()}</span>
                                </div>
                            </div>
                        </div>

                        {/* Buttons */}
                        <div className="flex gap-3">
                            <button onClick={() => setMonthRows([])}
                                className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                                ← Back
                            </button>
                            <button
                                onClick={handleConfirmPayment}
                                disabled={paying || grandTotal === 0}
                                className="flex-1 py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                                {paying ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                {paying ? "Processing…" : `Confirm Payment · ₹${netPayableTotal.toLocaleString()}`}
                            </button>
                        </div>
                    </div>
                </>
            )}

            {/* ══════════════════════════════════════════════════════════
                STEP 4 — Payment Done
            ══════════════════════════════════════════════════════════ */}
            {paidResult && selectedStudent && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="bg-emerald-50 border-b border-emerald-100 px-6 py-5 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                            <CheckCircle2 className="w-7 h-7 text-emerald-600" />
                        </div>
                        <div>
                            <h2 className="font-bold text-emerald-800 text-lg">Payment Recorded Successfully!</h2>
                            <p className="text-emerald-600 text-sm">
                                {paidResult.receipts.length} month{paidResult.receipts.length !== 1 ? "s" : ""} paid for {selectedStudent.studentName}
                            </p>
                        </div>
                    </div>

                    <div className="p-6">
                        {/* Receipts table */}
                        <div className="overflow-x-auto mb-6">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wider">
                                    <tr>
                                        <th className="px-4 py-3 text-left font-semibold">Month</th>
                                        <th className="px-4 py-3 text-left font-semibold">School Receipt</th>
                                        <th className="px-4 py-3 text-left font-semibold">Transport Receipt</th>
                                        <th className="px-4 py-3 text-right font-semibold">Total</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {paidResult.receipts.map(r => (
                                        <tr key={`${r.month}-${r.year}`} className="hover:bg-gray-50/40">
                                            <td className="px-4 py-3 font-medium text-navy">
                                                {MONTHS_FULL[r.month - 1]} {r.year}
                                            </td>
                                            <td className="px-4 py-3 font-mono text-xs text-gray-500">
                                                {r.schoolReceiptNo || <span className="text-gray-300">—</span>}
                                            </td>
                                            <td className="px-4 py-3 font-mono text-xs text-indigo-500">
                                                {r.transportReceiptNo || <span className="text-gray-300">—</span>}
                                            </td>
                                            <td className="px-4 py-3 text-right font-bold text-navy">
                                                ₹{(r.schoolTotal + r.transportTotal).toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="bg-gray-50 border-t border-gray-200">
                                    {paidResult.discountAmount > 0 && (
                                        <tr>
                                            <td colSpan={3} className="px-4 py-2 text-right text-violet-600 text-xs font-semibold">
                                                Discount Applied {discountType === "percent" ? `(${discountValue}%)` : "(Fixed)"}
                                            </td>
                                            <td className="px-4 py-2 text-right text-violet-600 font-semibold text-sm">−₹{paidResult.discountAmount.toLocaleString()}</td>
                                        </tr>
                                    )}
                                    <tr>
                                        <td colSpan={3} className="px-4 py-3 text-right font-bold text-navy uppercase text-xs tracking-wider">Grand Total Paid</td>
                                        <td className="px-4 py-3 text-right font-extrabold text-navy text-base">
                                            ₹{(paidResult.receipts.reduce((s, r) => s + r.schoolTotal + r.transportTotal, 0) - (paidResult.discountAmount || 0)).toLocaleString()}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3 flex-wrap">
                            <button onClick={handlePrintSummaryReceipt}
                                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-navy text-white text-sm font-semibold hover:bg-navy/90 transition-colors">
                                <Printer className="w-4 h-4" /> Print Summary Receipt
                            </button>
                            <button onClick={handleReset}
                                className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                                <RefreshCw className="w-4 h-4" /> New Payment
                            </button>
                        </div>

                        <p className="text-xs text-gray-400 mt-4 flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5" />
                            All paid months will now show as <strong>Paid</strong> in Manage Fees and the student portal automatically.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
