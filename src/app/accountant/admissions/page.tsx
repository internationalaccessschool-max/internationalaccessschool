"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Search, X, Loader2, CheckCircle2, XCircle, Eye,
    GraduationCap, User, Users, Activity, CreditCard,
    Home, ClipboardList, Clock, UserCheck, Ban, Receipt, ChevronRight, Printer, Tag,
} from "lucide-react";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import {
    doc, setDoc, serverTimestamp, collection,
    collectionGroup, getCountFromServer,
    query, getDocs, orderBy, updateDoc, where, getDoc,
} from "firebase/firestore";
import { db, firebaseConfig } from "@/lib/firebase";
import { z } from "zod";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ─── Types ───────────────────────────────────────────────────────────────────

type TabStatus = "pending" | "test_pending" | "accepted" | "rejected";

interface AdmissionRequest {
    id: string;
    studentName: string;
    firstName?: string;
    lastName?: string;
    middleName?: string;
    gender: string;
    aadhaarNo?: string;
    enrollmentClass: string;
    session: string;
    mobileNo: string;
    motherName: string;
    motherQualification?: string;
    motherOccupation?: string;
    fatherName: string;
    fatherQualification?: string;
    fatherOccupation?: string;
    noOfBrothers: number;
    noOfSisters: number;
    annualIncome?: string;
    category: string;
    physicallyDisabled: string;
    bloodGroup?: string;
    dob: string;
    localAddress: string;
    permanentAddress: string;
    accountNumber?: string;
    accountHolderName?: string;
    ifscCode?: string;
    height?: string;
    weight?: string;
    allergies?: string;
    imageUrl?: string;
    childPhotoUrl?: string;
    status: TabStatus;
    submittedAt: any;
    // set when accepted
    assignedAdmissionNo?: string;
    assignedClass?: string;
    assignedSection?: string;
}

const acceptSchema = z.object({
    admissionNo: z.string().min(1, "Admission Number is required"),
    section: z.string()
        .min(1, "Required")
        .max(1, "1 letter only")
        .regex(/^[A-Za-z]$/, "Letters only"),
    class: z.string().min(1, "Class is required"),
});
type AcceptFormValues = z.infer<typeof acceptSchema>;

// ─── Tab config ──────────────────────────────────────────────────────────────

const TABS: { key: TabStatus; label: string; icon: any; color: string }[] = [
    { key: "pending", label: "Pending", icon: Clock, color: "amber" },
    { key: "test_pending", label: "Test Pending", icon: ClipboardList, color: "indigo" },
    { key: "accepted", label: "Accepted", icon: UserCheck, color: "emerald" },
    { key: "rejected", label: "Rejected", icon: Ban, color: "red" },
];

const TAB_STYLES: Record<string, string> = {
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    red: "bg-red-50 text-red-700 border-red-200",
};

// ─── Main Page ────────────────────────────────────────────────────────────────

interface TransportBus {
    id: string;
    busNumber: string;
    routeDetails?: string;
    routes?: { id: string; routeName: string; monthlyFee: number }[];
}

export default function AccountantAdmissionsPage() {
    const [allRequests, setAllRequests] = useState<AdmissionRequest[]>([]);
    const [activeTab, setActiveTab] = useState<TabStatus>("pending");
    const [selectedRequest, setSelectedRequest] = useState<AdmissionRequest | null>(null);
    const [isAccepting, setIsAccepting] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isFetching, setIsFetching] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [allClasses, setAllClasses] = useState<string[]>([]);
    const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
    const [buses, setBuses] = useState<TransportBus[]>([]);
    const [selectedTransport, setSelectedTransport] = useState<string>("NONE");

    // ── Current session (derived from today's date — April onwards = current year) ──
    const _now = new Date();
    const _nowMonth = _now.getMonth() + 1;
    const admSession = _nowMonth >= 4 ? _now.getFullYear().toString() : (_now.getFullYear() - 1).toString();

    // ── Multi-step admission state ──
    // step 1 = admission details form, step 2 = fee collection, step 3 = receipt
    const [admStep, setAdmStep] = useState<1 | 2 | 3>(1);
    const [admData, setAdmData] = useState<AcceptFormValues | null>(null); // saved after step 1
    const [feeStructure, setFeeStructure] = useState<any>(null);
    const [collectAdmFee, setCollectAdmFee] = useState(true);
    const [collectMonthlyFee, setCollectMonthlyFee] = useState(false);
    const [collectAnnualFee, setCollectAnnualFee] = useState(false);
    const [annualFeeCollectAmt, setAnnualFeeCollectAmt] = useState(0);
    const [discountAmt, setDiscountAmt] = useState(0);
    const [feePaymentMode, setFeePaymentMode] = useState<"CASH" | "UPI">("CASH");
    const [admReceipt, setAdmReceipt] = useState<{
        receiptNo: string; studentName: string; admissionNo: string;
        class: string; section: string; items: { label: string; amount: number }[];
        total: number; discount: number; paidOn: string; paymentMode: string;
    } | null>(null);

    const { register, handleSubmit, control, formState: { errors }, setValue, reset } = useForm<AcceptFormValues>({
        resolver: zodResolver(acceptSchema),
    });

    // ── Fetch ALL requests once ──
    const fetchAll = useCallback(async () => {
        setIsFetching(true);
        try {
            const snap = await getDocs(query(collection(db, "admission_requests"), orderBy("submittedAt", "desc")));
            setAllRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as AdmissionRequest)));
        } catch {
            try {
                const snap = await getDocs(collection(db, "admission_requests"));
                setAllRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as AdmissionRequest)));
            } catch (e) { console.error(e); }
        } finally { setIsFetching(false); }
    }, []);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    useEffect(() => {
        getDocs(query(collection(db, "transport_buses"), orderBy("busNumber")))
            .then(snap => setBuses(snap.docs.map(d => ({ id: d.id, ...d.data() } as TransportBus))))
            .catch(() => {});
    }, []);

    const showToast = (msg: string, type: "success" | "error" = "success") => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 4000);
    };

    // ── Fetch Classes for Dropdown ──
    useEffect(() => {
        const fetchClasses = async () => {
            try {
                const snap = await getDocs(collectionGroup(db, "profiles"));
                const classSet = new Set<string>(["NUR", "LKG", "UKG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]);
                snap.docs.forEach(d => {
                    const data = d.data();
                    if (data.className) classSet.add(data.className);
                });
                // Sort custom to put NUR/LKG/UKG first, then numbers
                const order: Record<string, number> = { NUR: -3, LKG: -2, UKG: -1 };
                const sorted = Array.from(classSet).sort((a, b) => {
                    const na = order[a.toUpperCase()] ?? (parseInt(a) || 99);
                    const nb = order[b.toUpperCase()] ?? (parseInt(b) || 99);
                    return na - nb;
                });
                setAllClasses(sorted);
            } catch (err) {
                setAllClasses(["NUR", "LKG", "UKG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]);
            }
        };
        fetchClasses();
    }, []);

    // ── Filtered list for active tab ──
    const tabRequests = allRequests
        .filter(r => r.status === activeTab)
        .filter(r =>
            !searchTerm ||
            (r.studentName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
            (r.enrollmentClass || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
            (r.fatherName || "").toLowerCase().includes(searchTerm.toLowerCase())
        );

    const counts = Object.fromEntries(TABS.map(t => [t.key, allRequests.filter(r => r.status === t.key).length]));

    // ── Get display name ──
    const getName = (req: AdmissionRequest) =>
        req.studentName ||
        `${req.firstName || ""} ${req.middleName ? req.middleName + " " : ""}${req.lastName || ""}`.replace(/\s+/g, " ").trim() ||
        "Unknown Student";

    // ── Accept for Test ──
    const handleAcceptForTest = async (req: AdmissionRequest) => {
        if (!confirm(`Move "${getName(req)}" to Test Pending?`)) return;
        setIsLoading(true);
        try {
            await updateDoc(doc(db, "admission_requests", req.id), { status: "test_pending" });
            setAllRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: "test_pending" } : r));
            setSelectedRequest(null);
            showToast(`✅ ${getName(req)} moved to Test Pending`);
        } catch { showToast("Failed to update. Try again.", "error"); }
        finally { setIsLoading(false); }
    };

    // ── Reject ──
    const handleReject = async (req: AdmissionRequest) => {
        if (!confirm(`Reject "${getName(req)}"'s application?`)) return;
        setIsLoading(true);
        try {
            await updateDoc(doc(db, "admission_requests", req.id), { status: "rejected" });
            setAllRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: "rejected" } : r));
            setSelectedRequest(null);
            showToast(`❌ ${getName(req)}'s application rejected`);
        } catch { showToast("Failed to reject. Try again.", "error"); }
        finally { setIsLoading(false); }
    };

    // ── Open accept form (step 1) ──
    const openAcceptForm = (req: AdmissionRequest) => {
        setIsAccepting(true);
        setAdmStep(1);
        setAdmData(null);
        setFeeStructure(null);
        setCollectAdmFee(true);
        setCollectMonthlyFee(false);
        setCollectAnnualFee(false);
        setAnnualFeeCollectAmt(0);
        setDiscountAmt(0);
        setFeePaymentMode("CASH");
        setAdmReceipt(null);
        setSelectedTransport("NONE");
        setValue("class", req.enrollmentClass || "");
        setError(null);
    };

    // ── Step 1 → Step 2: check uniqueness + fetch fee structure ──
    const onAcceptSubmit = async (data: AcceptFormValues) => {
        if (!selectedRequest) return;
        setIsLoading(true);
        setError(null);
        try {
            // Check admission number not already in use
            const admNoTrimmed = data.admissionNo.trim();
            const existing = await getDocs(
                query(collection(db, "studentLookup"), where("admissionNumber", "==", admNoTrimmed))
            );
            if (!existing.empty) {
                setError("This Admission Number is already used. Try a different one.");
                return;
            }

            const normClass = data.class.trim().replace(/^class\s*/i, "").trim();
            const fsDoc = await getDoc(doc(db, "fees", "structure", "classes", normClass));
            setFeeStructure(fsDoc.exists() ? fsDoc.data() : null);
            setAdmData({ ...data, class: normClass });
            setAdmStep(2);
        } catch (e: any) {
            setError("Failed: " + e.message);
        } finally {
            setIsLoading(false);
        }
    };

    // ── Step 2 → Step 3: create account + selected fee records ──
    const onFeeConfirm = async () => {
        if (!selectedRequest || !admData) return;
        setIsLoading(true);
        setError(null);

        const normClass = admData.class;
        const sectionStr = admData.section.trim().toUpperCase() || "A";
        let secondaryApp: any;
        try {
            secondaryApp = initializeApp(firebaseConfig, `adm_${Date.now()}`);
            const secondaryAuth = getAuth(secondaryApp);
            const email = `${admData.admissionNo}@ias.edu`;

            const rawDob = selectedRequest.dob || "";
            let password = rawDob;
            if (rawDob.match(/^\d{4}-\d{2}-\d{2}$/)) {
                const [y, m, d] = rawDob.split("-");
                password = `${d}-${m}-${y.slice(-2)}`;
            }
            if (!password.trim()) password = `ias${admData.admissionNo}`;

            const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
            const uid = cred.user.uid;

            const fullName = getName(selectedRequest);
            const nameParts = fullName.split(" ");
            const firstName = nameParts[0] || "Student";
            const lastName = nameParts.slice(1).join(" ");

            const snapshot = await getCountFromServer(collectionGroup(db, "profiles"));
            const newSerialNumber = String(snapshot.data().count + 1);

            // users doc
            await setDoc(doc(db, "users", uid), {
                uid, email, role: "student",
                name: fullName, firstName, lastName,
                className: normClass, currentClass: normClass,
                section: sectionStr, createdAt: serverTimestamp(),
            });

            // full student profile
            await setDoc(
                doc(db, "users", "classes", normClass, "sections", sectionStr, "students", "profiles", uid),
                {
                    id: uid, uid, email, role: "student",
                    name: fullName, firstName, lastName,
                    className: normClass, currentClass: normClass, classAtAdmission: normClass,
                    section: sectionStr,
                    admissionNumber: admData.admissionNo,
                    session: selectedRequest.session || "",
                    dateOfAdmission: new Date().toISOString().split("T")[0],
                    status: "ACTIVE",
                    dob: rawDob,
                    gender: selectedRequest.gender || "",
                    bloodGroup: selectedRequest.bloodGroup || "",
                    category: selectedRequest.category || "",
                    physicallyDisabled: selectedRequest.physicallyDisabled || "No",
                    mobileNo: selectedRequest.mobileNo || "",
                    fatherName: selectedRequest.fatherName || "",
                    fatherOccupation: selectedRequest.fatherOccupation || "",
                    fatherQualification: selectedRequest.fatherQualification || "",
                    motherName: selectedRequest.motherName || "",
                    motherOccupation: selectedRequest.motherOccupation || "",
                    motherQualification: selectedRequest.motherQualification || "",
                    guardianName: selectedRequest.fatherName || selectedRequest.motherName || "",
                    noOfBrothers: selectedRequest.noOfBrothers || 0,
                    noOfSisters: selectedRequest.noOfSisters || 0,
                    annualIncome: selectedRequest.annualIncome || "",
                    presentAddress: selectedRequest.localAddress || "",
                    permanentAddress: selectedRequest.permanentAddress || "",
                    aadharNo: selectedRequest.aadhaarNo || "",
                    height: selectedRequest.height || "",
                    weight: selectedRequest.weight || "",
                    allergies: selectedRequest.allergies || "",
                    accountHolderName: selectedRequest.accountHolderName || "",
                    bankAccountNumber: selectedRequest.accountNumber || "",
                    ifscCode: selectedRequest.ifscCode || "",
                    bankName: "",
                    childPhotoUrl: selectedRequest.imageUrl || selectedRequest.childPhotoUrl || "",
                    admissionRequestId: selectedRequest.id,
                    pen: "", aparId: "", udise: "", cbseEnrolmentNo: "",
                    house: "", transport: selectedTransport === "NONE" ? "" : selectedTransport, branch: "", block: "",
                    serialNumber: newSerialNumber, religion: "", contact2: "", contact3: "",
                    freeScheme: "", economicallyWeakSection: "No", minorityStatus: "",
                    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
                }
            );

            // hierarchy markers
            await setDoc(doc(db, "users", "classes"), { _marker: true }, { merge: true });
            await setDoc(doc(db, "users", "classes", normClass, "sections"), { _marker: true }, { merge: true });
            await setDoc(doc(db, "users", "classes", normClass, "sections", sectionStr, "students"), { _marker: true }, { merge: true });

            // studentLookup
            await setDoc(doc(db, "studentLookup", uid), {
                uid, admissionNumber: admData.admissionNo, name: fullName,
                className: normClass, section: sectionStr,
                status: "ACTIVE", mobileNo: selectedRequest.mobileNo || "", email,
            });

            // update admission request
            await updateDoc(doc(db, "admission_requests", selectedRequest.id), {
                status: "accepted", studentId: uid,
                assignedAdmissionNo: admData.admissionNo,
                assignedClass: normClass, assignedSection: sectionStr,
            });

            // ── Create fee record ONLY for fees selected to collect now ──────
            const receiptItems: { label: string; amount: number }[] = [];
            const fs = feeStructure || {};
            const now = new Date();
            const admMonth = now.getMonth() + 1;
            const admYear = now.getFullYear();
            const admSession = admMonth >= 4 ? admYear.toString() : (admYear - 1).toString();
            const dueDay = fs.dueDay || 10;
            const dueDate = new Date(admYear, admMonth - 1, dueDay);

            const admissionFeeAmt = collectAdmFee ? (fs.admissionFee || 0) : 0;
            const tuitionFeeAmt = fs.tuitionFee || 0;                           // only tuition, not monthly total
            const monthlyFeeAmt = collectMonthlyFee ? tuitionFeeAmt : 0;
            const annualFeeStructureAmt = fs.annualFee || 0;
            const annualFeeCollected = collectAnnualFee ? Math.min(annualFeeCollectAmt, annualFeeStructureAmt) : 0;
            const rawTotal = admissionFeeAmt + monthlyFeeAmt + annualFeeCollected;
            const discountApplied = Math.min(discountAmt, rawTotal);
            const totalCollected = rawTotal - discountApplied;

            if (collectAdmFee && admissionFeeAmt > 0)
                receiptItems.push({ label: "Admission Fee", amount: admissionFeeAmt });
            if (collectMonthlyFee && monthlyFeeAmt > 0)
                receiptItems.push({ label: "Tuition Fee (" + ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][admMonth-1] + ")", amount: monthlyFeeAmt });
            if (collectAnnualFee && annualFeeCollected > 0)
                receiptItems.push({ label: `Annual Fee (Session ${admSession})`, amount: annualFeeCollected });

            // ── Always create a fee record for the current month ─────────────
            // If tuition was collected → status: paid
            // If tuition was NOT collected → status: pending (so accountant can track it)
            const receiptSeq = Math.floor(Math.random() * 90000) + 10000;
            const receiptNo = `ADM-${admYear}-${String(admMonth).padStart(2, "0")}-${receiptSeq}`;
            const tuitionStatus = collectMonthlyFee && monthlyFeeAmt > 0 ? "paid" : "pending";

            // Idempotent doc ID — same as generate-fee-records route
            const feeDocId = `${uid}_${admMonth}_${admYear}_tuition`;

            await setDoc(
                doc(db, `feeRecords/${admYear}/months/${admMonth}/classes/${normClass}/records`, feeDocId),
                {
                    studentId: uid,
                    studentName: fullName,
                    class: normClass,
                    section: sectionStr,
                    admissionNumber: admData.admissionNo,
                    rollNo: "",
                    parentEmail: email,
                    month: admMonth,
                    year: admYear,
                    session: admSession,
                    dueDate,
                    feeType: "tuition",
                    amount: tuitionFeeAmt,              // always the full tuition amount
                    admissionFee: admissionFeeAmt,      // one-time, 0 if not collected
                    totalAmount: admissionFeeAmt + (tuitionStatus === "paid" ? tuitionFeeAmt : 0),
                    previousDues: 0,
                    breakdown: {
                        tuitionFee: tuitionFeeAmt,
                        annualFee: 0,
                        admissionFee: admissionFeeAmt,
                        registrationFee: fs.registrationFee || 0,
                        sportsFee: fs.sportsFee || 0,
                        miscFee: fs.miscFee || 0,
                    },
                    discount: discountApplied,
                    status: tuitionStatus,
                    ...(tuitionStatus === "paid" ? { paidOn: now, receiptNo, paymentMode: feePaymentMode } : {}),
                    markedBy: "system-admission",
                    admissionMonth: true,
                    createdAt: serverTimestamp(),
                }
            );

            // ── Create Annual Fee record in annualFeeRecords ─────────────────
            // Always create if annualFee > 0 in fee structure
            if (annualFeeStructureAmt > 0) {
                const annualRef = doc(db, `annualFeeRecords/${admSession}/students/${uid}`);
                const annualStatus = annualFeeCollected >= annualFeeStructureAmt ? "paid"
                    : annualFeeCollected > 0 ? "partial"
                    : "unpaid";
                const annualReceiptNo = annualFeeCollected > 0
                    ? `ANN-ADM-${admYear}-${Date.now().toString().slice(-6)}`
                    : "";
                await setDoc(annualRef, {
                    studentId: uid,
                    studentName: fullName,
                    class: normClass,
                    section: sectionStr,
                    admissionNumber: admData.admissionNo,
                    session: admSession,
                    totalFee: annualFeeStructureAmt,
                    amountPaid: annualFeeCollected,
                    balance: Math.max(0, annualFeeStructureAmt - annualFeeCollected),
                    status: annualStatus,
                    payments: annualFeeCollected > 0 ? [{
                        amount: annualFeeCollected,
                        date: now.toISOString(),
                        paymentMode: feePaymentMode,
                        receiptNo: annualReceiptNo,
                        markedBy: "system-admission",
                    }] : [],
                    generatedAt: serverTimestamp(),
                });
            }

            if (totalCollected > 0 || discountApplied > 0) {
                setAdmReceipt({
                    receiptNo,
                    studentName: fullName,
                    admissionNo: admData.admissionNo,
                    class: normClass,
                    section: sectionStr,
                    items: receiptItems,
                    total: totalCollected,
                    discount: discountApplied,
                    paidOn: now.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
                    paymentMode: feePaymentMode,
                });
            }

            setAllRequests(prev => prev.map(r =>
                r.id === selectedRequest.id
                    ? { ...r, status: "accepted", assignedAdmissionNo: admData.admissionNo, assignedClass: normClass, assignedSection: sectionStr }
                    : r
            ));

            setAdmStep((totalCollected > 0 || discountApplied > 0) ? 3 : 1);
            if (totalCollected === 0) {
                // No fees collected — close and show toast
                setSelectedRequest(null);
                setIsAccepting(false);
                reset();
                setActiveTab("accepted");
                showToast(`🎉 ${fullName} admitted! Email: ${email} | Password: ${password}`);
            } else {
                showToast(`🎉 ${fullName} admitted successfully!`);
                setActiveTab("accepted");
            }
        } catch (err: any) {
            if (err.code === "auth/email-already-in-use") {
                setError("This Admission Number is already used. Try a different one.");
            } else {
                setError("Failed: " + (err.message || "Please try again."));
            }
        } finally {
            if (secondaryApp) { try { await deleteApp(secondaryApp); } catch { } }
            setIsLoading(false);
        }
    };

    // ─── Render ───────────────────────────────────────────────────────────────
    return (
        <div className="space-y-6">

            {/* Toast */}
            {toast && (
                <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-semibold text-white animate-in slide-in-from-right-4 ${toast.type === "success" ? "bg-green-600" : "bg-red-600"}`}>
                    {toast.msg}
                </div>
            )}

            {/* Header */}
            <div className="rounded-2xl gradient-navy p-6 md:p-8 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 80% 50%, rgba(200,169,81,0.3) 0%, transparent 60%)" }} />
                <div className="relative z-10">
                    <p className="text-white/50 text-sm font-medium">Finance Portal</p>
                    <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">Admission Requests</h1>
                    <p className="text-white/40 text-sm mt-1">
                        {counts["pending"]} pending · {counts["test_pending"]} for test · {counts["accepted"]} accepted · {counts["rejected"]} rejected
                    </p>
                </div>
            </div>

            {/* Tabs + Search */}
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                <div className="flex gap-2 flex-wrap">
                    {TABS.map(tab => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.key;
                        return (
                            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold border transition-all ${isActive ? TAB_STYLES[tab.color] + " border" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"}`}>
                                <Icon className="w-3.5 h-3.5" />
                                {tab.label}
                                <span className={`ml-1 text-xs font-bold px-1.5 py-0.5 rounded-full ${isActive ? "bg-white/60" : "bg-gray-100"}`}>
                                    {counts[tab.key] ?? 0}
                                </span>
                            </button>
                        );
                    })}
                </div>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="search" placeholder="Search name / class..."
                        value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                        className="pl-9 pr-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/10 w-60 bg-white"
                    />
                </div>
            </div>

            {/* Table */}
            <Card className="border-gray-100 shadow-sm">
                <CardContent className="p-0">
                    <div className="relative w-full overflow-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50/50 border-b">
                                <tr>
                                    <th className="h-12 px-4 text-left font-medium text-gray-500">Student</th>
                                    <th className="h-12 px-4 text-left font-medium text-gray-500">Class Applied</th>
                                    <th className="h-12 px-4 text-left font-medium text-gray-500">Father</th>
                                    <th className="h-12 px-4 text-left font-medium text-gray-500">Contact</th>
                                    <th className="h-12 px-4 text-left font-medium text-gray-500">Date</th>
                                    {activeTab === "accepted" && <th className="h-12 px-4 text-left font-medium text-gray-500">Admission No</th>}
                                    <th className="h-12 px-4 text-left font-medium text-gray-500">Action</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-50">
                                {isFetching ? (
                                    <tr><td colSpan={7} className="p-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-navy mx-auto" /></td></tr>
                                ) : tabRequests.length === 0 ? (
                                    <tr><td colSpan={7} className="p-12 text-center text-gray-400 text-sm">No {activeTab.replace("_", " ")} requests found.</td></tr>
                                ) : tabRequests.map(req => (
                                    <tr key={req.id} className="hover:bg-gray-50/60 transition-colors">
                                        <td className="p-4">
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-9 h-9 rounded-full bg-gray-100 overflow-hidden border border-gray-200 shrink-0 flex items-center justify-center">
                                                    {req.imageUrl || req.childPhotoUrl
                                                        ? <img src={req.imageUrl || req.childPhotoUrl} alt="" className="w-full h-full object-cover" />
                                                        : <User className="w-4 h-4 text-gray-400" />}
                                                </div>
                                                <span className="font-semibold text-navy">{getName(req)}</span>
                                            </div>
                                        </td>
                                        <td className="p-4 text-gray-600">{req.enrollmentClass}</td>
                                        <td className="p-4 text-gray-600">{req.fatherName || "—"}</td>
                                        <td className="p-4 text-gray-600">{req.mobileNo || "—"}</td>
                                        <td className="p-4 text-gray-500 text-xs">{req.submittedAt?.toDate ? req.submittedAt.toDate().toLocaleDateString("en-IN") : "—"}</td>
                                        {activeTab === "accepted" && (
                                            <td className="p-4">
                                                <span className="text-xs font-mono bg-emerald-50 text-emerald-700 px-2 py-1 rounded-full border border-emerald-100">
                                                    {req.assignedAdmissionNo || "—"}
                                                </span>
                                            </td>
                                        )}
                                        <td className="p-4">
                                            <Button size="sm" onClick={() => { setSelectedRequest(req); setIsAccepting(false); setError(null); }}
                                                className="bg-navy hover:bg-navy-light text-white h-8 px-3 text-xs">
                                                <Eye className="w-3 h-3 mr-1.5" /> View
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* ── Detail / Action Modal ── */}
            {selectedRequest && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
                    onClick={() => { setSelectedRequest(null); setIsAccepting(false); }}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col"
                        onClick={e => e.stopPropagation()}>

                        {/* Modal Header */}
                        <div className="flex justify-between items-center p-5 border-b border-gray-100 gradient-navy">
                            <div>
                                <h2 className="text-lg font-bold text-white">{getName(selectedRequest)}</h2>
                                <p className="text-white/50 text-xs mt-0.5">
                                    {isAccepting ? "Confirm Admission Details" : "Application Details"}
                                </p>
                            </div>
                            <button onClick={() => { setSelectedRequest(null); setIsAccepting(false); }}
                                className="text-white/50 hover:text-white transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="flex-1 overflow-y-auto p-6">
                            {!isAccepting ? (
                                // ── View Details ──
                                <div className="space-y-6">
                                    {/* Student Photo + Basic */}
                                    <div className="flex flex-col md:flex-row gap-5">
                                        <div className="w-28 h-28 rounded-xl bg-gray-100 border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center">
                                            {selectedRequest.imageUrl || selectedRequest.childPhotoUrl
                                                ? <img src={selectedRequest.imageUrl || selectedRequest.childPhotoUrl} alt="" className="w-full h-full object-cover" />
                                                : <User className="w-10 h-10 text-gray-300" />}
                                        </div>
                                        <div className="flex-1 grid grid-cols-2 lg:grid-cols-4 gap-4">
                                            <DI label="Name" value={getName(selectedRequest)} />
                                            <DI label="Gender" value={selectedRequest.gender} />
                                            <DI label="DOB" value={selectedRequest.dob} />
                                            <DI label="Blood Group" value={selectedRequest.bloodGroup} />
                                            <DI label="Class Applied" value={selectedRequest.enrollmentClass} />
                                            <DI label="Session" value={selectedRequest.session} />
                                            <DI label="Category" value={selectedRequest.category} />
                                            <DI label="Physically Disabled" value={selectedRequest.physicallyDisabled} />
                                        </div>
                                    </div>

                                    {/* Family */}
                                    <Section title="Family Details" icon={Users} color="text-purple-600" bg="bg-purple-50">
                                        <div className="grid md:grid-cols-3 gap-6">
                                            <div>
                                                <p className="text-xs font-semibold text-gray-500 mb-2 uppercase">Father</p>
                                                <p className="font-medium text-navy text-sm">{selectedRequest.fatherName || "—"}</p>
                                                <p className="text-xs text-gray-500 mt-0.5">{selectedRequest.fatherQualification} {selectedRequest.fatherOccupation ? `· ${selectedRequest.fatherOccupation}` : ""}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs font-semibold text-gray-500 mb-2 uppercase">Mother</p>
                                                <p className="font-medium text-navy text-sm">{selectedRequest.motherName || "—"}</p>
                                                <p className="text-xs text-gray-500 mt-0.5">{selectedRequest.motherQualification} {selectedRequest.motherOccupation ? `· ${selectedRequest.motherOccupation}` : ""}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs font-semibold text-gray-500 mb-2 uppercase">Siblings</p>
                                                <p className="text-sm text-gray-600">Brothers: {selectedRequest.noOfBrothers} · Sisters: {selectedRequest.noOfSisters}</p>
                                                {selectedRequest.annualIncome && <p className="text-xs text-gray-500 mt-0.5">Income: {selectedRequest.annualIncome}</p>}
                                            </div>
                                        </div>
                                    </Section>

                                    {/* Contact & Address */}
                                    <Section title="Contact & Address" icon={Home} color="text-indigo-600" bg="bg-indigo-50">
                                        <div className="grid md:grid-cols-2 gap-4">
                                            <DI label="Mobile" value={selectedRequest.mobileNo} />
                                            <DI label="Aadhaar" value={selectedRequest.aadhaarNo} />
                                            <DI label="Local Address" value={selectedRequest.localAddress} full />
                                            <DI label="Permanent Address" value={selectedRequest.permanentAddress} full />
                                        </div>
                                    </Section>

                                    {/* Bank + Medical */}
                                    <div className="grid md:grid-cols-2 gap-4">
                                        <Section title="Bank Details" icon={CreditCard} color="text-green-600" bg="bg-green-50">
                                            <div className="space-y-2">
                                                <DI label="Account No" value={selectedRequest.accountNumber} />
                                                <DI label="IFSC" value={selectedRequest.ifscCode} />
                                                <DI label="Holder Name" value={selectedRequest.accountHolderName} full />
                                            </div>
                                        </Section>
                                        <Section title="Medical" icon={Activity} color="text-red-600" bg="bg-red-50">
                                            <div className="grid grid-cols-2 gap-2">
                                                <DI label="Height" value={selectedRequest.height} />
                                                <DI label="Weight" value={selectedRequest.weight} />
                                                <DI label="Allergies" value={selectedRequest.allergies} full />
                                            </div>
                                        </Section>
                                    </div>
                                </div>
                            ) : admStep === 1 ? (
                                // ── Step 1: Assign Admission Details ──
                                <div className="max-w-md mx-auto py-6">
                                    <div className="text-center mb-6">
                                        <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                                            <GraduationCap className="w-7 h-7 text-emerald-600" />
                                        </div>
                                        <h3 className="text-lg font-bold text-navy">Step 1 of 2 — Assign Details</h3>
                                        <p className="text-sm text-gray-500 mt-1">Assign registration number, class and section.</p>
                                    </div>

                                    <form onSubmit={handleSubmit(onAcceptSubmit)} className="space-y-4">
                                        <div>
                                            <Label>Admission / Registration Number *</Label>
                                            <Input {...register("admissionNo")} placeholder="e.g. 2025001" className="mt-1" />
                                            {errors.admissionNo && <p className="text-red-500 text-xs mt-1">{errors.admissionNo.message}</p>}
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <Label>Class *</Label>
                                                <div className="mt-1">
                                                    <Controller
                                                        name="class"
                                                        control={control}
                                                        render={({ field }) => (
                                                            <Select onValueChange={field.onChange} value={field.value || ""}>
                                                                <SelectTrigger className="w-full bg-white">
                                                                    <SelectValue placeholder="Select class" />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    {allClasses.map(cls => (
                                                                        <SelectItem key={cls} value={cls}>{cls}</SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        )}
                                                    />
                                                </div>
                                                {errors.class && <p className="text-red-500 text-xs mt-1">{errors.class.message}</p>}
                                            </div>
                                            <div>
                                                <Label>Section *</Label>
                                                <Input {...register("section")} placeholder="e.g. A" className="mt-1" maxLength={1} style={{ textTransform: "uppercase" }} />
                                                {errors.section && <p className="text-red-500 text-xs mt-1">{errors.section.message}</p>}
                                            </div>
                                        </div>
                                        {/* Transport Assignment */}
                                        <div>
                                            <Label>Transport <span className="text-gray-400 font-normal">(Optional)</span></Label>
                                            <select
                                                value={selectedTransport}
                                                onChange={e => setSelectedTransport(e.target.value)}
                                                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy bg-white"
                                            >
                                                <option value="NONE">No Transport (Walk / Self)</option>
                                                <option value="BUS">Uses Bus (Not Assigned Yet)</option>
                                                {buses.flatMap(b => {
                                                    const routes = b.routes && b.routes.length > 0
                                                        ? b.routes
                                                        : b.routeDetails
                                                            ? [{ id: "legacy", routeName: b.routeDetails, monthlyFee: 0 }]
                                                            : [];
                                                    return routes.map(r => (
                                                        <option key={`${b.id}::${r.id}`} value={`${b.id}::${r.id}`}>
                                                            Bus {b.busNumber} — {r.routeName}{r.monthlyFee ? ` (₹${r.monthlyFee}/mo)` : ""}
                                                        </option>
                                                    ));
                                                })}
                                            </select>
                                        </div>

                                        <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700">
                                            <p>🔐 Login will be created automatically:</p>
                                            <p className="font-mono mt-1">Email: <strong>{`{admissionNo}@ias.edu`}</strong></p>
                                            <p className="font-mono">Password: <strong>DOB in DD-MM-YY format</strong></p>
                                        </div>
                                        {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100">{error}</div>}
                                        <div className="flex gap-3 pt-2">
                                            <Button type="button" variant="outline" className="flex-1" onClick={() => setIsAccepting(false)}>
                                                Back
                                            </Button>
                                            <Button type="submit" disabled={isLoading} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white">
                                                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><ChevronRight className="w-4 h-4 mr-1" />Next: Fee Collection</>}
                                            </Button>
                                        </div>
                                    </form>
                                </div>

                            ) : admStep === 2 ? (
                                // ── Step 2: Fee Collection ──
                                <div className="max-w-md mx-auto py-6 space-y-5">
                                    <div className="text-center">
                                        <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-3">
                                            <CreditCard className="w-7 h-7 text-amber-600" />
                                        </div>
                                        <h3 className="text-lg font-bold text-navy">Step 2 of 2 — Fee Collection</h3>
                                        <p className="text-sm text-gray-500 mt-1">Select which fees are being collected right now.</p>
                                    </div>

                                    {/* Fee options */}
                                    <div className="space-y-3">
                                        {/* Admission Fee */}
                                        <label className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${
                                            collectAdmFee ? "border-emerald-400 bg-emerald-50" : "border-gray-200 bg-white hover:border-gray-300"
                                        }`}>
                                            <div className="flex items-center gap-3">
                                                <input type="checkbox" checked={collectAdmFee} onChange={e => setCollectAdmFee(e.target.checked)}
                                                    className="w-4 h-4 accent-emerald-600" />
                                                <div>
                                                    <p className="font-semibold text-navy text-sm">Admission Fee</p>
                                                    <p className="text-xs text-gray-500">One-time payment at admission</p>
                                                </div>
                                            </div>
                                            <span className="font-bold text-navy">₹{(feeStructure?.admissionFee || 0).toLocaleString()}</span>
                                        </label>

                                        {/* Monthly Fee */}
                                        <label className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${
                                            collectMonthlyFee ? "border-emerald-400 bg-emerald-50" : "border-gray-200 bg-white hover:border-gray-300"
                                        }`}>
                                            <div className="flex items-center gap-3">
                                                <input type="checkbox" checked={collectMonthlyFee} onChange={e => setCollectMonthlyFee(e.target.checked)}
                                                    className="w-4 h-4 accent-emerald-600" />
                                                <div>
                                                    <p className="font-semibold text-navy text-sm">Tuition Fee (Current Month)</p>
                                                    <p className="text-xs text-gray-500">Managed via Fees → Manage Fees</p>
                                                </div>
                                            </div>
                                            <span className="font-bold text-navy">₹{(feeStructure?.tuitionFee || 0).toLocaleString()}</span>
                                        </label>

                                        {/* Annual Fee - now selectable with partial amount */}
                                        <label className={`flex flex-col p-4 rounded-xl border-2 cursor-pointer transition-all ${
                                            collectAnnualFee ? "border-amber-400 bg-amber-50" : "border-gray-200 bg-white hover:border-gray-300"
                                        } ${!(feeStructure?.annualFee > 0) ? "opacity-50 pointer-events-none" : ""}`}>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <input type="checkbox"
                                                        checked={collectAnnualFee}
                                                        onChange={e => {
                                                            setCollectAnnualFee(e.target.checked);
                                                            if (e.target.checked) setAnnualFeeCollectAmt(feeStructure?.annualFee || 0);
                                                            else setAnnualFeeCollectAmt(0);
                                                        }}
                                                        className="w-4 h-4 accent-amber-500"
                                                    />
                                                    <div>
                                                        <p className="font-semibold text-navy text-sm">Annual Fee (Session {admSession})</p>
                                                        <p className="text-xs text-gray-500">Can collect full or partial amount</p>
                                                    </div>
                                                </div>
                                                <span className="font-bold text-navy">₹{(feeStructure?.annualFee || 0).toLocaleString()}</span>
                                            </div>
                                            {/* Amount input shown when checked */}
                                            {collectAnnualFee && (
                                                <div className="mt-3 flex items-center gap-2">
                                                    <span className="text-sm text-gray-500 whitespace-nowrap">Collecting Now (₹)</span>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        max={feeStructure?.annualFee || 0}
                                                        value={annualFeeCollectAmt || ""}
                                                        onChange={e => setAnnualFeeCollectAmt(Math.min(parseFloat(e.target.value) || 0, feeStructure?.annualFee || 0))}
                                                        onClick={e => e.preventDefault()}
                                                        className="flex-1 border-2 border-amber-200 rounded-xl px-3 py-2 text-sm font-bold text-navy outline-none focus:border-amber-500"
                                                        placeholder="0"
                                                    />
                                                    {annualFeeCollectAmt > 0 && annualFeeCollectAmt < (feeStructure?.annualFee || 0) && (
                                                        <span className="text-xs text-amber-600 whitespace-nowrap">Balance: ₹{((feeStructure?.annualFee || 0) - annualFeeCollectAmt).toLocaleString()}</span>
                                                    )}
                                                </div>
                                            )}
                                        </label>
                                    </div>

                                    {/* Discount */}
                                    {(() => {
                                        const rawFeeTotal = (collectAdmFee ? (feeStructure?.admissionFee || 0) : 0)
                                            + (collectMonthlyFee ? (feeStructure?.tuitionFee || 0) : 0)
                                            + (collectAnnualFee ? annualFeeCollectAmt : 0);
                                        return (
                                            <div className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${discountAmt > 0 ? "border-rose-300 bg-rose-50" : "border-dashed border-gray-200 bg-white hover:border-gray-300"}`}>
                                                <Tag className="w-4 h-4 text-rose-500 shrink-0" />
                                                <div className="flex-1">
                                                    <p className="font-semibold text-navy text-sm">Discount</p>
                                                    <p className="text-xs text-gray-500">Optional — deducted from total</p>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-sm font-bold text-rose-600">₹</span>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        max={rawFeeTotal}
                                                        value={discountAmt || ""}
                                                        onChange={e => setDiscountAmt(Math.min(parseFloat(e.target.value) || 0, rawFeeTotal))}
                                                        onClick={e => e.preventDefault()}
                                                        className="w-24 border-2 border-rose-200 rounded-xl px-3 py-2 text-sm font-bold text-rose-600 outline-none focus:border-rose-400 text-right"
                                                        placeholder="0"
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {/* Total */}
                                    {(() => {
                                        const rawFeeTotal = (collectAdmFee ? (feeStructure?.admissionFee || 0) : 0)
                                            + (collectMonthlyFee ? (feeStructure?.tuitionFee || 0) : 0)
                                            + (collectAnnualFee ? annualFeeCollectAmt : 0);
                                        const finalTotal = rawFeeTotal - Math.min(discountAmt, rawFeeTotal);
                                        return (
                                            <div className="bg-navy/5 rounded-xl p-4 space-y-2">
                                                {discountAmt > 0 && (
                                                    <div className="flex justify-between items-center text-sm">
                                                        <span className="text-gray-500">Subtotal</span>
                                                        <span className="font-medium text-gray-600">₹{rawFeeTotal.toLocaleString()}</span>
                                                    </div>
                                                )}
                                                {discountAmt > 0 && (
                                                    <div className="flex justify-between items-center text-sm">
                                                        <span className="text-rose-600 font-medium">Discount</span>
                                                        <span className="font-bold text-rose-600">− ₹{Math.min(discountAmt, rawFeeTotal).toLocaleString()}</span>
                                                    </div>
                                                )}
                                                <div className="flex justify-between items-center pt-1 border-t border-navy/10">
                                                    <span className="font-semibold text-navy">Collecting Now</span>
                                                    <span className="text-xl font-bold text-navy">₹{finalTotal.toLocaleString()}</span>
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {/* Payment Mode */}
                                    <div>
                                        <p className="text-sm font-semibold text-navy mb-2">Payment Mode</p>
                                        <div className="flex gap-3">
                                            {(["CASH", "UPI"] as const).map(mode => (
                                                <button key={mode} type="button"
                                                    onClick={() => setFeePaymentMode(mode)}
                                                    className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                                                        feePaymentMode === mode
                                                            ? "border-navy bg-navy text-white"
                                                            : "border-gray-200 text-gray-600 hover:border-gray-300"
                                                    }`}>
                                                    {mode}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {!collectAdmFee && !collectMonthlyFee && (
                                        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
                                            ⚠️ No fees selected — student will be admitted without any fee collection.
                                        </div>
                                    )}

                                    {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100">{error}</div>}

                                    <div className="flex gap-3 pt-2">
                                        <Button type="button" variant="outline" className="flex-1" onClick={() => { setAdmStep(1); setError(null); }}>
                                            Back
                                        </Button>
                                        <Button type="button" disabled={isLoading} onClick={onFeeConfirm}
                                            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white">
                                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle2 className="w-4 h-4 mr-1" />Confirm Admission</>}
                                        </Button>
                                    </div>
                                </div>

                            ) : admStep === 3 && admReceipt ? (
                                // ── Step 3: Receipt ──
                                <div className="max-w-sm mx-auto py-6">
                                    <div className="text-center mb-5">
                                        <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                                            <Receipt className="w-7 h-7 text-emerald-600" />
                                        </div>
                                        <h3 className="text-lg font-bold text-emerald-700">Admission Successful!</h3>
                                        <p className="text-sm text-gray-500 mt-1">Fee receipt generated below.</p>
                                    </div>

                                    {/* Receipt Card */}
                                    <div className="border border-gray-200 rounded-2xl overflow-hidden" id="adm-receipt">
                                        <div className="gradient-navy p-5 text-white">
                                            <p className="text-white/60 text-xs">International Access School</p>
                                            <h4 className="text-xl font-bold mt-1">Admission Fee Receipt</h4>
                                            <p className="text-white/60 text-sm font-mono">{admReceipt.receiptNo}</p>
                                        </div>
                                        <div className="p-5 space-y-2.5 text-sm">
                                            {[
                                                ["Student", admReceipt.studentName],
                                                ["Admission No.", admReceipt.admissionNo],
                                                ["Class", `${admReceipt.class} - ${admReceipt.section}`],
                                                ["Date", admReceipt.paidOn],
                                                ["Mode", admReceipt.paymentMode],
                                            ].map(([l, v]) => (
                                                <div key={l} className="flex justify-between border-b border-gray-50 pb-2">
                                                    <span className="text-gray-500">{l}</span>
                                                    <span className="font-semibold text-navy">{v}</span>
                                                </div>
                                            ))}
                                            <div className="pt-1 space-y-1.5">
                                                {admReceipt.items.map(item => (
                                                    <div key={item.label} className="flex justify-between text-sm">
                                                        <span className="text-gray-600">{item.label}</span>
                                                        <span className="font-medium text-navy">₹{item.amount.toLocaleString()}</span>
                                                    </div>
                                                ))}
                                                {admReceipt.discount > 0 && (
                                                    <div className="flex justify-between text-sm border-t border-dashed border-rose-200 pt-1.5">
                                                        <span className="text-rose-600 font-medium flex items-center gap-1">
                                                            <Tag className="w-3 h-3" /> Discount
                                                        </span>
                                                        <span className="font-bold text-rose-600">− ₹{admReceipt.discount.toLocaleString()}</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex justify-between items-center pt-3 mt-2 border-t-2 border-navy/20">
                                                <span className="font-bold text-navy">Total Paid</span>
                                                <span className="text-xl font-bold text-emerald-700">₹{admReceipt.total.toLocaleString()}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex gap-3 mt-5">
                                        <Button variant="outline" className="flex-1" onClick={() => window.print()}>
                                            <Printer className="w-4 h-4 mr-2" /> Print
                                        </Button>
                                        <Button className="flex-1 bg-navy text-white hover:bg-navy/90"
                                            onClick={() => { setSelectedRequest(null); setIsAccepting(false); reset(); }}
                                        >
                                            Done
                                        </Button>
                                    </div>
                                </div>
                            ) : null}
                        </div>

                        {/* Modal Footer Actions */}
                        {!isAccepting && (
                            <div className="p-5 border-t border-gray-100 bg-gray-50 flex flex-wrap justify-end gap-3">
                                {/* Pending → can go to Test or Directly Admit or Reject */}
                                {selectedRequest.status === "pending" && (
                                    <>
                                        <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50"
                                            onClick={() => handleReject(selectedRequest)} disabled={isLoading}>
                                            <XCircle className="w-4 h-4 mr-2" /> Reject
                                        </Button>
                                        <Button variant="outline" className="text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                                            onClick={() => handleAcceptForTest(selectedRequest)} disabled={isLoading}>
                                            <ClipboardList className="w-4 h-4 mr-2" /> Accept for Test
                                        </Button>
                                        <Button className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                            onClick={() => openAcceptForm(selectedRequest)} disabled={isLoading}>
                                            <CheckCircle2 className="w-4 h-4 mr-2" /> Admit Directly
                                        </Button>
                                    </>
                                )}
                                {/* Test Pending → can Admit or Reject */}
                                {selectedRequest.status === "test_pending" && (
                                    <>
                                        <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50"
                                            onClick={() => handleReject(selectedRequest)} disabled={isLoading}>
                                            <XCircle className="w-4 h-4 mr-2" /> Reject
                                        </Button>
                                        <Button className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                            onClick={() => openAcceptForm(selectedRequest)} disabled={isLoading}>
                                            <CheckCircle2 className="w-4 h-4 mr-2" /> Confirm Admission
                                        </Button>
                                    </>
                                )}
                                {/* Accepted / Rejected → just info, no actions */}
                                {(selectedRequest.status === "accepted" || selectedRequest.status === "rejected") && (
                                    <p className="text-sm text-gray-400 italic self-center">
                                        This application is already {selectedRequest.status}.
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Helper components ────────────────────────────────────────────────────────

function DI({ label, value, full }: { label: string; value?: string | number; full?: boolean }) {
    return (
        <div className={full ? "col-span-full" : ""}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
            <p className="text-sm font-medium text-navy mt-0.5 break-words">{value || "—"}</p>
        </div>
    );
}

function Section({ title, icon: Icon, color, bg, children }: {
    title: string; icon: any; color: string; bg: string; children: React.ReactNode;
}) {
    return (
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
            <div className="flex items-center gap-2 mb-3">
                <div className={`p-1.5 rounded-lg ${bg}`}>
                    <Icon className={`w-4 h-4 ${color}`} />
                </div>
                <h4 className="font-bold text-navy text-sm">{title}</h4>
            </div>
            {children}
        </div>
    );
}
