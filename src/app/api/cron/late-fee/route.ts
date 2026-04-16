import { NextResponse } from "next/server";
import { collection, getDocs, doc, updateDoc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * POST /api/cron/late-fee
 *
 * Applies a ₹100 late fine to every school fee record that is:
 *   - Status: "pending" OR "overdue"
 *   - Current month's record (based on today's date)
 *   - Today's date is > 15th
 *   - lateFine has NOT already been applied (lateFine field is missing/0)
 *
 * This is called by Vercel Cron every night at midnight IST (18:30 UTC).
 * It can also be triggered manually with the CRON_SECRET for testing.
 *
 * IMPORTANT: Fine is applied ONLY to the CURRENT month's record.
 * When next month's fee is generated via generate/page.tsx, the arrear
 * carry-forward logic picks up totalAmount (which includes the lateFine),
 * so the fine naturally rolls into the next month's previousDues.
 *
 * Example timeline:
 *   April (generated): amount=1400, totalAmount=1400, status=pending
 *   April 16th (cron):  lateFine=100, totalAmount=1500, status=overdue
 *   May  (generated):   amount=1400, previousDues=1500 (April's totalAmount),
 *                       totalAmount=2900, status=pending
 *   May  16th (cron):   lateFine=100, totalAmount=3000, status=overdue
 */
export async function GET(req: Request) {
    // ── Security check ───────────────────────────────────────────────────────
    const authHeader = req.headers.get("authorization");
    const providedSecret = authHeader?.replace("Bearer ", "") ?? "";

    if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Date check: only run after the 15th ──────────────────────────────────
    const now = new Date();
    // Adjust to IST (UTC+5:30)
    const istOffset = 5.5 * 60 * 60 * 1000;
    const ist = new Date(now.getTime() + istOffset);
    const todayIST = ist.getUTCDate();
    const currentMonth = ist.getUTCMonth() + 1; // 1-indexed
    const currentYear = ist.getUTCFullYear();

    if (todayIST <= 15) {
        return NextResponse.json({
            success: true,
            message: `Skipped — today is the ${todayIST}th. Late fines only apply after the 15th.`,
            processed: 0,
        });
    }

    const LATE_FINE_AMOUNT = 100;

    try {
        // ── Scan all classes for this month's records ─────────────────────────
        const classesSnap = await getDocs(collection(db, "fees", "structure", "classes"));
        const classIds = classesSnap.docs.map(d => d.id);

        let totalProcessed = 0;
        let totalSkipped = 0;
        const affectedStudents: { admissionNumber: string; studentName: string; month: number; year: number; fineAmount: number }[] = [];

        for (const classId of classIds) {
            const recordsRef = collection(
                db,
                `feeRecords/${currentYear}/months/${currentMonth}/classes/${classId}/records`
            );
            const snap = await getDocs(recordsRef);

            for (const docSnap of snap.docs) {
                const data = docSnap.data() as any;

                // Skip: already paid, carried_forward, or fine already applied
                if (
                    data.status === "paid" ||
                    data.status === "carried_forward" ||
                    (data.lateFine && data.lateFine > 0)
                ) {
                    totalSkipped++;
                    continue;
                }

                // Apply late fine to pending/overdue records
                if (data.status === "pending" || data.status === "overdue") {
                    const currentTotal = data.totalAmount || data.amount || 0;
                    const newTotal = currentTotal + LATE_FINE_AMOUNT;

                    await updateDoc(doc(db, docSnap.ref.path), {
                        lateFine: LATE_FINE_AMOUNT,
                        totalAmount: newTotal,
                        status: "overdue",
                        lateFineAppliedOn: new Date(),
                    });

                    totalProcessed++;

                    // Collect for push notification
                    const admNo = data.rollNo || data.admissionNumber || data.studentId || "";
                    if (admNo) {
                        affectedStudents.push({
                            admissionNumber: admNo,
                            studentName: data.studentName || "Student",
                            month: currentMonth,
                            year: currentYear,
                            fineAmount: LATE_FINE_AMOUNT,
                        });
                    }
                }
            }
        }

        // ── Send push notifications ───────────────────────────────────────────
        if (affectedStudents.length > 0) {
            try {
                const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://internationalaccessschool.vercel.app";
                await fetch(`${baseUrl}/api/notifications/late-fee`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ students: affectedStudents }),
                });
            } catch (notifErr) {
                console.error("[LateFee Cron] Notification failed:", notifErr);
                // Non-fatal: fine was already applied to Firestore — just log
            }
        }

        console.log(
            `[LateFee Cron] ${currentYear}-${currentMonth} | Applied: ${totalProcessed} | Skipped: ${totalSkipped}`
        );

        return NextResponse.json({
            success: true,
            message: `Late fine of ₹${LATE_FINE_AMOUNT} applied to ${totalProcessed} records.`,
            month: currentMonth,
            year: currentYear,
            processed: totalProcessed,
            skipped: totalSkipped,
        });
    } catch (err: any) {
        console.error("[LateFee Cron] Error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
