"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { collection, getDocs, doc, setDoc, getDoc, collectionGroup, updateDoc, writeBatch, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PlusCircle, Loader2, CheckCircle2, AlertCircle, AlertTriangle, Users, Bus, ArrowRight } from "lucide-react";
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
    const [progress, setProgress] = useState({ done: 0, total: 0 });
    const [result, setResult] = useState<{ created: number; skipped: number; total: number; withArrears: number; generatedStudents: {id: string; name: string; class: string; amount: number}[] } | null>(null);

    // Already-generated status for the selected month
    const [existing, setExisting] = useState<{ students: number; records: number; paid: number } | null>(null);
    const [checking, setChecking] = useState(true);

    // Admin and accountant share this page — keep the transport link on the
    // portal the user is actually browsing.
    const pathname = usePathname();
    const transportHref = pathname?.startsWith("/admin") ? "/admin/transport" : "/accountant/transport";

    /**
     * Counts fee records that already exist for the selected month.
     * Reads per class folder (same as the Manage Fees list) rather than a
     * collectionGroup query, which would need a year+month composite index.
     */
    const checkExisting = useCallback(async (monthIdx: number, year: number) => {
        setChecking(true);
        try {
            const targetMonth = monthIdx + 1;
            const classesSnap = await getDocs(collection(db, "fees", "structure", "classes"));
            const snaps = await Promise.all(
                classesSnap.docs.map(c =>
                    getDocs(collection(db, `feeRecords/${year}/months/${targetMonth}/classes/${c.id}/records`))
                        .catch(() => null)
                )
            );

            // A student can hold records in two class folders after a promotion —
            // count unique students so the number matches the real headcount.
            const seen = new Set<string>();
            let records = 0, paid = 0;
            for (const snap of snaps) {
                if (!snap) continue;
                for (const d of snap.docs) {
                    const data = d.data() as any;
                    records++;
                    seen.add(data.studentId || d.id);
                    if (data.status === "paid") paid++;
                }
            }
            setExisting({ students: seen.size, records, paid });
        } catch (err) {
            console.error("Existing-record check failed:", err);
            setExisting(null);
        } finally {
            setChecking(false);
        }
    }, []);

    useEffect(() => { checkExisting(selectedMonth, selectedYear); }, [selectedMonth, selectedYear, checkExisting]);

    // Guard against closing/reloading the tab mid-run — a half-finished run
    // leaves some students without a bill.
    useEffect(() => {
        if (!generating) return;
        const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [generating]);

    const handleGenerate = async () => {
        setGenerating(true);
        setResult(null);
        setProgress({ done: 0, total: 0 });

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
            const generatedList: {id: string; name: string; class: string; amount: number}[] = [];

            // 3. Process in batches of 10 for concurrent writes
            const BATCH_SIZE = 10;
            setProgress({ done: 0, total: activeStudents.length });
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

                    const dueDay = feeData.dueDay || 10;

                    const breakdown = {
                        tuitionFee: feeData.tuitionFee || 0,
                        // annualFee → Annual Fees page (once per session)
                        // admissionFee → collected at admission only
                        // registrationFee, sportsFee, miscFee → not part of monthly bill
                    };

                    // Monthly = tuition fee only.
                    // Fall back to feeData.monthly if tuitionFee is 0
                    // (handles fee structures saved before breakdown fields were added).
                    const monthlyAmount = breakdown.tuitionFee > 0
                        ? breakdown.tuitionFee
                        : (feeData.monthly || 0);

                    if (monthlyAmount === 0) { skipped++; return; }

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

                    // ── ARREARS LOGIC (class-change safe) ────────────────────────
                    // Fetch all records for this student in targetYear and targetYear-1
                    // using collectionGroup — works even if student changed class.
                    // Uses existing composite index: studentId ASC + year ASC
                    const [snapCurYear, snapPrevYear] = await Promise.all([
                        getDocs(query(collectionGroup(db, "records"), where("studentId", "==", student.id), where("year", "==", targetYear))),
                        getDocs(query(collectionGroup(db, "records"), where("studentId", "==", student.id), where("year", "==", targetYear - 1))),
                    ]);

                    // Map: "year_month" → { data, ref } — prefer paid/cf on duplicates
                    const studentRecordMap = new Map<string, { data: any; ref: any }>();
                    for (const snap of [snapCurYear, snapPrevYear]) {
                        for (const d of snap.docs) {
                            const data = d.data() as any;
                            if (!data.month || !data.year) continue;
                            const key = `${data.year}_${data.month}`;
                            const existing = studentRecordMap.get(key);
                            if (!existing || data.status === "paid" || data.status === "carried_forward") {
                                studentRecordMap.set(key, { data, ref: d.ref });
                            }
                        }
                    }

                    let previousDues = 0;
                    const carriedOverIds: string[] = [];
                    const carryForwardBatch = writeBatch(db);
                    let hasBatchOps = false;

                    for (let offset = 1; offset <= 12; offset++) {
                        let prevMonth = targetMonth - offset;
                        let prevYear = targetYear;
                        if (prevMonth <= 0) { prevMonth += 12; prevYear -= 1; }

                        const prevRecordId = `${student.id}_${prevYear}_${String(prevMonth).padStart(2, "0")}`;
                        const entry = studentRecordMap.get(`${prevYear}_${prevMonth}`);

                        if (!entry) continue; // month was skipped — keep scanning back

                        const prevData = entry.data;

                        if (prevData.status === "paid" || prevData.status === "carried_forward") {
                            break; // paid or already merged — stop
                        }

                        if (prevData.status === "pending" || prevData.status === "overdue") {
                            const prevTotal = prevData.totalAmount || prevData.amount || 0;
                            previousDues += prevTotal;
                            carriedOverIds.push(prevRecordId);
                            carryForwardBatch.update(entry.ref, { status: "carried_forward" });
                            hasBatchOps = true;
                        }
                    }

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
                        amount: monthlyAmount,       // current month fee
                        previousDues,               // sum of unpaid previous months
                        totalAmount: monthlyAmount + previousDues, // what the parent must pay
                        arrearsDetails: carriedOverIds, // for reference
                        breakdown,
                        session,                    // e.g. "2026"
                        month: targetMonth,
                        year: targetYear,
                        dueDate,
                        status: "pending",
                        paidOn: null,
                        receiptNo: null,
                        markedBy: null,
                        createdAt: new Date(),
                    });

                    generatedList.push({
                        id: student.id,
                        name: studentFullName,
                        class: classId,
                        amount: monthlyAmount + previousDues
                    });

                    created++;
                }));
                // Count actual failures (optional — results already tracked above)
                results.forEach(r => { if (r.status === "rejected") skipped++; });
                setProgress({ done: Math.min(i + BATCH_SIZE, activeStudents.length), total: activeStudents.length });
            }

            setResult({ created, skipped, total: activeStudents.length, withArrears, generatedStudents: generatedList });
            checkExisting(selectedMonth, selectedYear); // refresh the "already generated" banner
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

                {/* ── Already-generated status for the selected month ── */}
                {checking ? (
                    <div className="p-4 rounded-xl bg-gray-50 border border-gray-100 mb-4 flex items-center gap-3">
                        <Loader2 className="w-4 h-4 text-gray-400 animate-spin shrink-0" />
                        <p className="text-sm text-gray-500">
                            Checking whether {MONTHS[selectedMonth]} {selectedYear} is already generated…
                        </p>
                    </div>
                ) : existing && existing.students > 0 ? (
                    <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 mb-4 flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <p className="text-sm font-semibold text-emerald-800">
                                Already generated — {MONTHS[selectedMonth]} {selectedYear}
                            </p>
                            <p className="text-xs text-emerald-700 mt-0.5">
                                <strong>{existing.students}</strong> student{existing.students > 1 ? "s" : ""} ka bill ban chuka hai
                                {existing.paid > 0 && <> · <strong>{existing.paid}</strong> already paid</>}
                                {existing.records !== existing.students && <> · {existing.records} records</>}
                            </p>
                            <p className="text-[11px] text-emerald-600/80 mt-1.5">
                                Generate dobara chalane par existing records ko haath nahi lagega — sirf jin students ka
                                bill missing hai (naya admission, pehle skip hua) unka banega.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 mb-4 flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
                        <div>
                            <p className="text-sm font-semibold text-gray-700">
                                Not generated yet — {MONTHS[selectedMonth]} {selectedYear}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                                Is month ka koi fee record abhi tak nahi bana hai.
                            </p>
                        </div>
                    </div>
                )}

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

                {/* ── Do-not-leave warning — only while a run is in flight ── */}
                {generating && (
                    <div className="p-4 rounded-xl bg-rose-50 border-2 border-rose-300 mb-6 flex items-start gap-3 animate-pulse">
                        <AlertTriangle className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <p className="text-sm font-bold text-rose-800">
                                ⚠️ Do NOT leave this screen
                            </p>
                            <p className="text-xs text-rose-700 mt-1">
                                Fee generation chal raha hai. Page band, refresh ya dusre menu par jaana mat —
                                beech me rukne par kuch students ke bill adhoore reh jayenge aur unhe dobara
                                generate karna padega.
                            </p>
                            {progress.total > 0 && (
                                <div className="mt-2.5">
                                    <div className="flex justify-between text-[11px] font-semibold text-rose-700 mb-1">
                                        <span>Processing students…</span>
                                        <span>{progress.done} / {progress.total}</span>
                                    </div>
                                    <div className="w-full h-2 rounded-full bg-rose-100 overflow-hidden">
                                        <div
                                            className="h-full bg-rose-500 transition-all duration-300"
                                            style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

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

            {/* ── Transport fees live in their own module — jump straight there ── */}
            <Link
                href={transportHref}
                className={`block bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:border-violet-300 hover:shadow-md transition-all group ${generating ? "pointer-events-none opacity-50" : ""}`}
            >
                <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center shrink-0">
                        <Bus className="w-5 h-5 text-violet-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-navy">Transport Fees generate karni hai?</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                            Bus students ke monthly transport bill alag se banate hain — yahan se seedha jao.
                        </p>
                    </div>
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-violet-600 shrink-0 group-hover:gap-2.5 transition-all">
                        Generate Transport Fees
                        <ArrowRight className="w-4 h-4" />
                    </span>
                </div>
            </Link>

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

                    {result.generatedStudents.length > 0 && (
                        <div className="mt-8 border border-gray-100 rounded-xl overflow-hidden shadow-sm">
                            <div className="bg-gray-50/80 px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                                <h4 className="text-sm font-semibold text-navy flex items-center gap-2">
                                    <Users className="w-4 h-4 text-emerald-500" />
                                    Successfully Generated ({result.generatedStudents.length})
                                </h4>
                            </div>
                            <div className="max-h-[400px] overflow-y-auto">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-white sticky top-0 border-b border-gray-100">
                                        <tr>
                                            <th className="px-4 py-3 font-medium text-gray-500">Student Name</th>
                                            <th className="px-4 py-3 font-medium text-gray-500 w-24 text-center">Class</th>
                                            <th className="px-4 py-3 font-medium text-gray-500 w-32 text-right">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50 bg-white">
                                        {result.generatedStudents.map((stu, i) => (
                                            <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                                                <td className="px-4 py-3 font-medium text-navy">{stu.name}</td>
                                                <td className="px-4 py-3 text-gray-600 text-center">{stu.class}</td>
                                                <td className="px-4 py-3 text-emerald-600 font-semibold text-right">₹{stu.amount}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    <p className="text-xs text-gray-400 mt-6 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" />
                        Go to <strong className="text-navy">Manage Fees</strong> to view and manage all generated fee records.
                    </p>
                </div>
            )}
        </div>
    );
}
