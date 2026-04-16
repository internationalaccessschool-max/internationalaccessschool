import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * GET /api/cron/late-fee
 *
 * Applies a ₹100 late fine to every fee record that is:
 *   - Status: "pending" OR "overdue"
 *   - Current month's record (based on today's IST date)
 *   - Today > 15th of the month
 *   - lateFine not already applied (lateFine missing or 0)
 *
 * Called by Vercel Cron every night at 18:30 UTC (00:00 IST).
 * Uses Firebase Admin SDK to bypass Firestore security rules.
 */
export async function GET(req: Request) {
    // ── Security check ───────────────────────────────────────────────────────
    const authHeader = req.headers.get("authorization");
    const providedSecret = authHeader?.replace("Bearer ", "") ?? "";

    if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Date check: only run after the 15th (IST) ────────────────────────────
    const now = new Date();
    const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    const todayIST    = ist.getUTCDate();
    const currentMonth = ist.getUTCMonth() + 1;
    const currentYear  = ist.getUTCFullYear();

    if (todayIST <= 15) {
        return NextResponse.json({
            success: true,
            message: `Skipped — today is the ${todayIST}th. Late fines only apply after the 15th.`,
            processed: 0,
        });
    }

    const LATE_FINE_AMOUNT = 100;

    try {
        // ── Get all class IDs from fee structure ──────────────────────────────
        const classesSnap = await adminDb
            .collection("fees").doc("structure").collection("classes")
            .get();
        const classIds = classesSnap.docs.map(d => d.id);

        let totalProcessed = 0;
        let totalSkipped   = 0;
        const affectedStudents: {
            admissionNumber: string;
            studentName: string;
            month: number;
            year: number;
            fineAmount: number;
        }[] = [];

        for (const classId of classIds) {
            const recordsRef = adminDb
                .collection("feeRecords")
                .doc(String(currentYear))
                .collection("months")
                .doc(String(currentMonth))
                .collection("classes")
                .doc(classId)
                .collection("records");

            const snap = await recordsRef.get();

            for (const docSnap of snap.docs) {
                const data = docSnap.data();

                // Skip already paid, carried forward, or fine already applied
                if (
                    data.status === "paid" ||
                    data.status === "carried_forward" ||
                    (data.lateFine && data.lateFine > 0)
                ) {
                    totalSkipped++;
                    continue;
                }

                // Apply fine to pending / overdue records only
                if (data.status === "pending" || data.status === "overdue") {
                    const currentTotal = data.totalAmount || data.amount || 0;

                    await docSnap.ref.update({
                        lateFine: LATE_FINE_AMOUNT,
                        totalAmount: currentTotal + LATE_FINE_AMOUNT,
                        status: "overdue",
                        lateFineAppliedOn: new Date(),
                    });

                    totalProcessed++;

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

        // ── Push notifications ────────────────────────────────────────────────
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
                // Non-fatal — fine already applied to Firestore
            }
        }

        console.log(`[LateFee Cron] ${currentYear}-${currentMonth} | Applied: ${totalProcessed} | Skipped: ${totalSkipped}`);

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
