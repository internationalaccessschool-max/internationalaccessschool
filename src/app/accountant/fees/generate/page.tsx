"use client";

import { useState } from "react";
import { collection, getDocs, doc, setDoc, getDoc, collectionGroup, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PlusCircle, Loader2, CheckCircle2, AlertCircle, Users } from "lucide-react";
import toast from "react-hot-toast";

const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

/** Determine academic session year from month.
 *  School year: April–March. 
 *  April 2026 onwards → session "2026"
 *  Jan–March 2026 → session "2025" (still in 2025-26 year)
 */
function getSession(month: number, year: number): string {
    // month is 1-indexed
    if (month >= 4) return String(year);       // April to December → current year
    return String(year - 1);                   // Jan to March → previous year (session start)
}

export default function GenerateFeesPage() {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth(); // 0-indexed

    const [selectedMonth, setSelectedMonth] = useState(currentMonth);
    const [selectedYear, setSelectedYear] = useState(currentYear);
    const [generating, setGenerating] = useState(false);
    const [result, setResult] = useState<{ created: number; skipped: number; total: number; withArrears: number } | null>(null);

    const handleGenerate = async () => {
        setGenerating(true);
        setResult(null);

        try {
            // 1. Pre-fetch ALL fee structures upfront (one batch read instead of per-student)
            const feeStructSnap = await getDocs(collection(db, "fees", "structure", "classes"));
            const feeStructMap: Record<string, any> = {};
            feeStructSnap.docs.forEach(d => { feeStructMap[d.id] = d.data(); });

            // 2. Fetch all students from nested profiles
            const studentsSnap = await getDocs(collectionGroup(db, "profiles"));
            const students = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));

            // Filter only active students
            const activeStudents = students.filter(s => {
                const status = (s.status || "").toUpperCase();
                return status !== "LEFT" && status !== "TC" && status !== "INACTIVE";
            });

            const targetMonth = selectedMonth + 1; // convert to 1-indexed
            const targetYear = selectedYear;
            const session = getSession(targetMonth, targetYear);

            let created = 0;
            let skipped = 0;
            let withArrears = 0;

            // 3. Process in batches of 10 for concurrent writes
            const BATCH_SIZE = 10;
            for (let i = 0; i < activeStudents.length; i += BATCH_SIZE) {
                const batch = activeStudents.slice(i, i + BATCH_SIZE);
                const results = await Promise.allSettled(batch.map(async (student) => {
                    // Normalize className: "Class 7" → "7", "7" stays "7"
                    const rawClass = student.className?.toString() ||
                        student.currentClass?.toString() ||
                        student.class?.toString() || "";
                    const classId = rawClass.replace(/^class\s*/i, "").trim();

                    if (!classId) { skipped++; return; }

                    // Get fee structure from cached map (no Firestore read!)
                    const feeData = feeStructMap[classId];
                    if (!feeData) { skipped++; return; }

                    const amount = feeData.monthly || 0;
                    const dueDay = feeData.dueDay || 10;

                    const breakdown = {
                        tuitionFee: feeData.tuitionFee || 0,
                        annualFee: feeData.annualFee || 0,
                        admissionFee: 0, // one-time fee — charged at admission only, NOT in monthly generation
                        transportFee: feeData.transportFee || 0,
                        registrationFee: feeData.registrationFee || 0,
                        sportsFee: feeData.sportsFee || 0,
                        miscFee: feeData.miscFee || 0,
                    };

                    if (amount === 0) { skipped++; return; }

                    // Build due date
                    const dueDate = new Date(targetYear, targetMonth - 1, dueDay);

                    // Check if record already exists for this month
                    const recordId = `${student.id}_${targetYear}_${String(targetMonth).padStart(2, "0")}`;
                    const recordRef = doc(db, `feeRecords/${targetYear}/months/${targetMonth}/classes/${classId}/records`, recordId);
                    const existingRecord = await getDoc(recordRef);

                    if (existingRecord.exists()) {
                        skipped++;
                        return;
                    }

                    // ── ARREARS LOGIC ────────────────────────────────────────────
                    // Scan previous months (up to 12 months back) for unpaid school fee records
                    let previousDues = 0;
                    const carriedOverIds: string[] = [];
                    const carryForwardBatch = writeBatch(db);
                    let hasBatchOps = false;

                    // We only need to check recent months — go back up to 12 months
                    for (let offset = 1; offset <= 12; offset++) {
                        let prevMonth = targetMonth - offset;
                        let prevYear = targetYear;
                        if (prevMonth <= 0) {
                            prevMonth += 12;
                            prevYear -= 1;
                        }

                        const prevRecordId = `${student.id}_${prevYear}_${String(prevMonth).padStart(2, "0")}`;
                        const prevRef = doc(db, `feeRecords/${prevYear}/months/${prevMonth}/classes/${classId}/records`, prevRecordId);
                        const prevSnap = await getDoc(prevRef);

                        if (!prevSnap.exists()) break; // no record found, stop going further back

                        const prevData = prevSnap.data() as any;

                        if (prevData.status === "paid" || prevData.status === "carried_forward") {
                            break; // paid or already merged — stop scanning
                        }

                        if (prevData.status === "pending" || prevData.status === "overdue") {
                            // Use totalAmount if it exists (already had arrears), else amount
                            const prevTotal = prevData.totalAmount || prevData.amount || 0;
                            previousDues += prevTotal;
                            carriedOverIds.push(prevRecordId);

                            // Mark old record as carried_forward
                            carryForwardBatch.update(prevRef, { status: "carried_forward" });
                            hasBatchOps = true;
                        }
                    }

                    // Commit carry-forward status updates
                    if (hasBatchOps) {
                        await carryForwardBatch.commit();
                        withArrears++;
                    }
                    // ── END ARREARS LOGIC ─────────────────────────────────────────

                    // Build student name
                    const studentFullName =
                        student.name ||
                        student.fullName ||
                        `${student.firstName || ""} ${student.middleName || ""} ${student.lastName || ""}`.replace(/\s+/g, " ").trim() ||
                        "Unknown";

                    // Create fee record with arrears fields
                    await setDoc(recordRef, {
                        studentId: student.id,
                        studentName: studentFullName,
                        rollNo: student.rollNo || student.admissionNumber || "",
                        class: classId,
                        section: student.section || "",
                        parentEmail: student.notificationEmail || student.parentEmail || student.fatherEmail || student.email || "",
                        parentPhone: student.mobileNo || student.fatherMobile || student.phone || "",
                        amount,            // current month fee
                        previousDues,      // sum of unpaid previous months
                        totalAmount: amount + previousDues, // what the parent must pay
                        arrearsDetails: carriedOverIds, // for reference
                        breakdown,
                        session,           // e.g. "2026"
                        month: targetMonth,
                        year: targetYear,
                        dueDate,
                        status: "pending",
                        paidOn: null,
                        receiptNo: null,
                        markedBy: null,
                        createdAt: new Date(),
                    });

                    created++;
                }));
                // Count actual failures (optional — results already tracked above)
                results.forEach(r => { if (r.status === "rejected") skipped++; });
            }

            setResult({ created, skipped, total: activeStudents.length, withArrears });
            if (created > 0) {
                toast.success(`Generated ${created} fee records! (${withArrears} with previous dues)`);
            } else {
                toast("No new records created. They may already exist.", { icon: "ℹ️" });
            }
        } catch (err: any) {
            console.error(err);
            toast.error("Failed to generate fees: " + (err.message || "Unknown error"));
        } finally {
            setGenerating(false);
        }
    };

    // Generate years from 2024 to 2050
    const years = Array.from({ length: 2050 - 2024 + 1 }, (_, i) => 2024 + i);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="rounded-2xl gradient-navy p-6 md:p-8 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10"
                    style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.2) 0%, transparent 50%)` }}
                />
                <div className="relative z-10 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gold/20 flex items-center justify-center">
                        <PlusCircle className="w-6 h-6 text-gold" />
                    </div>
                    <div>
                        <p className="text-white/50 text-sm font-medium">Finance Portal</p>
                        <h1 className="text-2xl md:text-3xl font-bold text-white">Generate Monthly Fees</h1>
                        <p className="text-white/40 text-sm mt-1">Create fee records for all students. Previous unpaid dues are automatically carried forward.</p>
                    </div>
                </div>
            </div>

            {/* Generator Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h2 className="font-semibold text-navy mb-1">Select Month & Year</h2>
                <p className="text-xs text-gray-400 mb-6">
                    Fee records will be created for all active students. Students with unpaid previous months
                    will have their dues carried forward automatically into this month's bill.
                </p>

                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                    <div className="flex-1">
                        <label className="text-sm font-medium text-navy mb-1.5 block">Month</label>
                        <select
                            value={selectedMonth}
                            onChange={e => { setSelectedMonth(Number(e.target.value)); setResult(null); }}
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-gold focus:ring-1 focus:ring-gold outline-none text-sm bg-gray-50/50 focus:bg-white transition-all"
                        >
                            {MONTHS.map((m, i) => (
                                <option key={m} value={i}>{m}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex-1">
                        <label className="text-sm font-medium text-navy mb-1.5 block">Year</label>
                        <select
                            value={selectedYear}
                            onChange={e => { setSelectedYear(Number(e.target.value)); setResult(null); }}
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-gold focus:ring-1 focus:ring-gold outline-none text-sm bg-gray-50/50 focus:bg-white transition-all"
                        >
                            {years.map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 mb-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-medium text-blue-800">Arrears Carry-Forward is Active</p>
                        <p className="text-xs text-blue-600 mt-0.5">
                            If a student has unpaid/overdue fees from previous months, those dues will be automatically
                            included in this month's bill as "Previous Dues". Old pending records will be marked as carried forward.
                        </p>
                    </div>
                </div>

                <div className="p-4 rounded-xl bg-amber-50 border border-amber-100 mb-6 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-medium text-amber-800">Before you generate</p>
                        <p className="text-xs text-amber-600 mt-0.5">
                            Make sure you have set fee amounts in <strong>Fee Structure</strong> for all classes.
                            Students without a fee structure set will be skipped.
                        </p>
                    </div>
                </div>

                <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className={`w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-sm transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed ${result ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20" : "bg-navy text-white hover:bg-navy-light shadow-navy/20"
                        }`}
                >
                    {generating ? (
                        <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Generating...
                        </>
                    ) : result ? (
                        <>
                            <CheckCircle2 className="w-5 h-5" />
                            Generated Successfully!
                        </>
                    ) : (
                        <>
                            <PlusCircle className="w-5 h-5" />
                            Generate Fees for {MONTHS[selectedMonth]} {selectedYear}
                        </>
                    )}
                </button>
            </div>

            {/* Result */}
            {result && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <h3 className="font-semibold text-navy mb-4 flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                        Generation Complete
                    </h3>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100 text-center">
                            <div className="text-2xl font-bold text-emerald-600">{result.created}</div>
                            <div className="text-xs text-emerald-600 mt-1">Records Created</div>
                        </div>
                        <div className="p-4 rounded-xl bg-amber-50 border border-amber-100 text-center">
                            <div className="text-2xl font-bold text-amber-600">{result.skipped}</div>
                            <div className="text-xs text-amber-600 mt-1">Skipped / Already Exist</div>
                        </div>
                        <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 text-center">
                            <div className="text-2xl font-bold text-blue-600">{result.total}</div>
                            <div className="text-xs text-blue-600 mt-1">Total Students</div>
                        </div>
                        <div className="p-4 rounded-xl bg-rose-50 border border-rose-100 text-center">
                            <div className="text-2xl font-bold text-rose-600">{result.withArrears}</div>
                            <div className="text-xs text-rose-600 mt-1">With Previous Dues</div>
                        </div>
                    </div>
                    <p className="text-xs text-gray-400 mt-4 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" />
                        Go to <strong className="text-navy">Manage Fees</strong> to view and manage all generated fee records.
                    </p>
                </div>
            )}
        </div>
    );
}
