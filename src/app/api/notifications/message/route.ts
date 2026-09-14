import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-guard";
import { adminDb } from "@/lib/firebase-admin";

const ONESIGNAL_APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID!;
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY!;

/**
 * Send push notification via OneSignal REST API to a specific external user ID.
 * External user ID = admissionNumber for students, email-local-part for staff
 * (matches the linkage `notification-bell.tsx` already sets up for every role).
 */
async function sendOneSignalNotification(
    externalUserId: string,
    title: string,
    body: string,
    url: string
): Promise<boolean> {
    try {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://internationalaccessschool.vercel.app";
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
                url: `${baseUrl}${url}`,
                chrome_web_icon: `${baseUrl}/LOGO.png`,
                chrome_web_badge: `${baseUrl}/LOGO.png`,
            }),
        });

        const data = await res.json();

        if (!res.ok || data.errors) {
            console.error(`[MessageNotif] Send failed for ${externalUserId}:`, data.errors || data);
            return false;
        }

        console.log(`[MessageNotif] ✅ Sent to ${externalUserId}: id=${data.id}, recipients=${data.recipients}`);
        return true;
    } catch (e: any) {
        console.error(`[MessageNotif] Request error for ${externalUserId}:`, e.message);
        return false;
    }
}

const emailPrefix = (email?: string | null) => (email ? email.split("@")[0] : "");

/**
 * POST /api/notifications/message
 * Fires when a chat message is sent in a student's conversation thread.
 * Parent -> notifies the concerned class teacher + every admin/supervisor.
 * Staff   -> notifies the parent (student's admissionNumber).
 * Body: { studentUid, admissionNumber, studentName, className, section, senderRole, senderName, text }
 */
export async function POST(req: NextRequest) {
    const authResult = await verifyAuth(req);
    if (authResult instanceof NextResponse) return authResult;

    try {
        const body = await req.json();
        const { admissionNumber, studentName, className, section, senderRole, senderName, text } = body;

        if (!text || typeof text !== "string" || !senderRole) {
            return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
        }

        if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
            console.error("[MessageNotif] Missing ONESIGNAL env vars!");
            return NextResponse.json({ error: "Notification service not configured" }, { status: 500 });
        }

        const preview = text.length > 140 ? `${text.slice(0, 140)}…` : text;
        const results: boolean[] = [];

        if (senderRole === "parent") {
            const title = `📩 New message — ${studentName || "Parent"}`;

            // Concerned class teacher
            if (className && section) {
                const docId = `${className}-${section}`.replace(/ /g, "_");
                const ctSnap = await adminDb.collection("class_teachers").doc(docId).get();
                const teacherEmail = ctSnap.exists ? ctSnap.data()?.teacherEmail : null;
                const teacherExternalId = emailPrefix(teacherEmail);
                if (teacherExternalId) {
                    results.push(await sendOneSignalNotification(teacherExternalId, title, preview, "/teacher/messages"));
                }
            }

            // Admin + Supervisor
            const staffSnap = await adminDb.collection("users").where("role", "in", ["admin", "supervisor"]).get();
            for (const staffDoc of staffSnap.docs) {
                const externalId = emailPrefix(staffDoc.data()?.email);
                if (!externalId) continue;
                results.push(await sendOneSignalNotification(externalId, title, preview, "/admin/messages"));
            }
        } else {
            const title = `📩 New message from ${senderName || "School"}`;
            if (admissionNumber) {
                results.push(await sendOneSignalNotification(admissionNumber, title, preview, "/student/messages"));
            }
        }

        return NextResponse.json({ success: true, sent: results.filter(Boolean).length });
    } catch (error: any) {
        console.error("[MessageNotif] Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
