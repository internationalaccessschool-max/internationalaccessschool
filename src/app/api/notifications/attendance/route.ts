import { NextResponse } from "next/server";

const ONESIGNAL_APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID!;
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY!;

/**
 * Send push notification via OneSignal REST API to a specific external user ID.
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
                url: "https://internationalaccessschool.vercel.app/student/attendance",
                chrome_web_icon: "https://internationalaccessschool.vercel.app/LOGO.png",
                chrome_web_badge: "https://internationalaccessschool.vercel.app/LOGO.png",
            }),
        });

        const data = await res.json();

        if (!res.ok || data.errors) {
            console.error(`[OneSignal] Send failed for ${externalUserId}:`, data.errors || data);
            return false;
        }

        console.log(`[OneSignal] ✅ Sent to ${externalUserId}: id=${data.id}, recipients=${data.recipients}`);
        return true;
    } catch (e: any) {
        console.error(`[OneSignal] Request error for ${externalUserId}:`, e.message);
        return false;
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { date, students } = body;

        if (!students || !Array.isArray(students)) {
            return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
        }

        if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
            console.error("[OneSignal] Missing ONESIGNAL env vars!");
            return NextResponse.json({ error: "Notification service not configured" }, { status: 500 });
        }

        const dateDisplay = new Date(date + "T00:00:00").toLocaleDateString("en-IN", {
            day: "numeric", month: "long", year: "numeric"
        });

        console.log(`[Notifications] Processing ${students.length} students for date ${date}`);

        const absentOrLate = students.filter((s: any) => s.status === "absent" || s.status === "late");
        console.log(`[Notifications] ${absentOrLate.length} students to notify`);

        const promises = absentOrLate.map(async (student: any) => {
            const title = student.status === "absent" ? "🚨 Attendance Alert" : "⚠️ Late Arrival";
            const bodyText = student.status === "absent"
                ? `You have been marked ABSENT for today (${dateDisplay}).`
                : `You arrived LATE to school today (${dateDisplay}).`;

            // The external user ID we set in OneSignal is the student's admissionNumber
            // Fallback chain: regNo → email prefix → student id
            const externalId = student.regNo || student.id;

            if (!externalId) {
                console.warn(`[Notifications] No external ID for ${student.name}, skipping`);
                return;
            }

            await sendOneSignalNotification(externalId, title, bodyText);
        });

        await Promise.allSettled(promises);
        return NextResponse.json({
            success: true,
            message: `Notifications processed for ${absentOrLate.length} students`,
        });

    } catch (error: any) {
        console.error("[Notifications] Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
