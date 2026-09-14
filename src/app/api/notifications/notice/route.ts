import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-guard";

const ONESIGNAL_APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID!;
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY!;

const TITLES: Record<string, string> = {
    urgent: "🚨 Urgent Notice",
    warning: "⚠️ New Notice",
    info: "📢 New Notice",
};

/**
 * POST /api/notifications/notice
 * Broadcasts a push notification to every subscribed student/parent
 * when the admin publishes a new notice (or activates an existing one).
 * Body: { content: string, type: "info" | "warning" | "urgent" }
 */
export async function POST(req: NextRequest) {
    const authResult = await verifyAuth(req, ["admin", "supervisor"]);
    if (authResult instanceof NextResponse) return authResult;

    try {
        const body = await req.json();
        const { content, type } = body;

        if (!content || typeof content !== "string") {
            return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
        }

        if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
            console.error("[NoticeNotif] Missing ONESIGNAL env vars!");
            return NextResponse.json({ error: "Notification service not configured" }, { status: 500 });
        }

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://internationalaccessschool.vercel.app";

        const res = await fetch("https://onesignal.com/api/v1/notifications", {
            method: "POST",
            headers: {
                Authorization: `Basic ${ONESIGNAL_REST_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                app_id: ONESIGNAL_APP_ID,
                included_segments: ["Subscribed Users"],
                target_channel: "push",
                contents: { en: content.slice(0, 180) },
                headings: { en: TITLES[type] || TITLES.info },
                url: `${baseUrl}/student`,
                chrome_web_icon: `${baseUrl}/LOGO.png`,
                chrome_web_badge: `${baseUrl}/LOGO.png`,
            }),
        });

        const data = await res.json();

        if (!res.ok || data.errors) {
            console.error("[NoticeNotif] Send failed:", data.errors || data);
            return NextResponse.json({ error: "Failed to send notification" }, { status: 502 });
        }

        console.log(`[NoticeNotif] ✅ Broadcast sent: id=${data.id}, recipients=${data.recipients}`);
        return NextResponse.json({ success: true, recipients: data.recipients });
    } catch (error: any) {
        console.error("[NoticeNotif] Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
