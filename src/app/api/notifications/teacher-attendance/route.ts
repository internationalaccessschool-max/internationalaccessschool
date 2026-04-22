import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-guard";

const ONESIGNAL_APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID!;
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY!;

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
                url: `${process.env.NEXT_PUBLIC_BASE_URL || "https://internationalaccessschool.vercel.app"}/teacher/my-attendance`,
                chrome_web_icon: `${process.env.NEXT_PUBLIC_BASE_URL || "https://internationalaccessschool.vercel.app"}/LOGO.png`,
                chrome_web_badge: `${process.env.NEXT_PUBLIC_BASE_URL || "https://internationalaccessschool.vercel.app"}/LOGO.png`,
            }),
        });

        const data = await res.json();

        if (!res.ok || data.errors) {
            console.error(`[TeacherAttendanceNotif] Send failed for ${externalUserId}:`, data.errors || data);
            return false;
        }

        console.log(`[TeacherAttendanceNotif] ✅ Sent to ${externalUserId}: id=${data.id}`);
        return true;
    } catch (e: any) {
        console.error(`[TeacherAttendanceNotif] Request error for ${externalUserId}:`, e.message);
        return false;
    }
}

export async function POST(req: NextRequest) {
    const authResult = await verifyAuth(req, ["admin", "supervisor"]);
    if (authResult instanceof NextResponse) return authResult;

    try {
        const body = await req.json();
        const { date, teachers } = body;

        if (!teachers || !Array.isArray(teachers)) {
            return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
        }

        if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
            console.error("[TeacherAttendanceNotif] Missing ONESIGNAL env vars!");
            return NextResponse.json({ error: "Notification service not configured" }, { status: 500 });
        }

        const dateDisplay = new Date(date + "T00:00:00").toLocaleDateString("en-IN", {
            day: "numeric", month: "long", year: "numeric"
        });

        const absentOrLate = teachers.filter((t: any) => t.status === "absent" || t.status === "late");
        console.log(`[TeacherAttendanceNotif] ${absentOrLate.length} teachers to notify`);

        const promises = absentOrLate.map(async (teacher: any) => {
            const title = teacher.status === "absent" ? "🚨 Attendance Alert" : "⚠️ Late Arrival";
            const bodyText = teacher.status === "absent"
                ? `You have been marked ABSENT for today (${dateDisplay}).`
                : `You arrived LATE to school today (${dateDisplay}).`;

            const externalId = teacher.id;
            if (!externalId) return;

            await sendOneSignalNotification(externalId, title, bodyText);
        });

        await Promise.allSettled(promises);
        return NextResponse.json({
            success: true,
            message: `Notifications processed for ${absentOrLate.length} teachers`,
        });

    } catch (error: any) {
        console.error("[TeacherAttendanceNotif] Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
