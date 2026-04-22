import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-guard";

const ONESIGNAL_APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID!;
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY!;
const CRON_SECRET = process.env.CRON_SECRET;

/**
 * Send a late-fee push notification via OneSignal REST API.
 * External user ID = student's admissionNumber (set during OneSignal.login())
 */
async function sendOneSignalNotification(
    externalUserId: string,
    title: string,
    body: string
): Promise<boolean> {
    try {
        const res = await fetch("https://onesignal.com/api/v1/notifications", {
            method: "POST",
            headers: {
                Authorization: `Basic ${ONESIGNAL_REST_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                app_id: ONESIGNAL_APP_ID,
                include_aliases: { external_id: [externalUserId] },
                target_channel: "push",
                contents: { en: body },
                headings: { en: title },
                url: `${process.env.NEXT_PUBLIC_BASE_URL || "https://internationalaccessschool.vercel.app"}/student/fees`,
                chrome_web_icon: `${process.env.NEXT_PUBLIC_BASE_URL || "https://internationalaccessschool.vercel.app"}/LOGO.png`,
                chrome_web_badge: `${process.env.NEXT_PUBLIC_BASE_URL || "https://internationalaccessschool.vercel.app"}/LOGO.png`,
            }),
        });

        const data = await res.json();

        if (!res.ok || data.errors) {
            console.error(`[LateFeeNotif] Send failed for ${externalUserId}:`, data.errors || data);
            return false;
        }

        console.log(`[LateFeeNotif] ✅ Sent to ${externalUserId}: id=${data.id}, recipients=${data.recipients}`);
        return true;
    } catch (e: any) {
        console.error(`[LateFeeNotif] Request error for ${externalUserId}:`, e.message);
        return false;
    }
}

/**
 * POST /api/notifications/late-fee
 * Body: { students: [{ admissionNumber, studentName, month, year, fineAmount }] }
 */
export async function POST(req: NextRequest) {
    // Accept CRON_SECRET (server-to-server) OR Firebase auth token (browser clients)
    const authHeader = req.headers.get("Authorization") ?? "";
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const isCron = CRON_SECRET && bearerToken === CRON_SECRET;

    if (!isCron) {
        const authResult = await verifyAuth(req, ["admin", "accountant"]);
        if (authResult instanceof NextResponse) return authResult;
    }

    try {
        const body = await req.json();
        const { students } = body;

        if (!students || !Array.isArray(students)) {
            return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
        }

        if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
            console.error("[LateFeeNotif] Missing ONESIGNAL env vars!");
            return NextResponse.json({ error: "Notification service not configured" }, { status: 500 });
        }

        const MONTHS = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
        ];

        console.log(`[LateFeeNotif] Processing ${students.length} students for late fee notifications`);

        const promises = students.map(async (student: any) => {
            const admNo = student.admissionNumber;
            if (!admNo) {
                console.warn(`[LateFeeNotif] No admissionNumber for ${student.studentName}, skipping`);
                return;
            }

            const monthName = MONTHS[(student.month || 1) - 1];
            const fineAmt = student.fineAmount || 100;

            const title = "⚠️ Late Payment Fine Applied";
            const bodyText = `₹${fineAmt} late fee added for ${monthName} ${student.year} fees. Fee unpaid after 15th. Please pay immediately to avoid further penalties.`;

            await sendOneSignalNotification(admNo, title, bodyText);
        });

        await Promise.allSettled(promises);

        return NextResponse.json({
            success: true,
            message: `Late fee notifications sent to ${students.length} students`,
        });
    } catch (error: any) {
        console.error("[LateFeeNotif] Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
