import { NextResponse } from "next/server";
import { adminDb, adminMessaging } from "@/lib/firebase-admin";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { date, students } = body;

        if (!students || !Array.isArray(students)) {
            return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
        }

        const dateDisplay = new Date(date + "T00:00:00").toLocaleDateString("en-IN", {
            day: "numeric", month: "long", year: "numeric"
        });

        console.log(`[Notifications] Processing ${students.length} students for date ${date}`);

        const absentOrLate = students.filter((s: any) => s.status === "absent" || s.status === "late");
        console.log(`[Notifications] ${absentOrLate.length} students to notify:`, absentOrLate.map((s: any) => `${s.name}(${s.id}):${s.status}`));

        const promises = absentOrLate.map(async (student: any) => {
            const title = student.status === "absent" ? "🚨 Attendance Alert" : "⚠️ Late Arrival";
            const bodyText = student.status === "absent"
                ? `You have been marked ABSENT for today (${dateDisplay}).`
                : `You arrived LATE to school today (${dateDisplay}).`;

            // Strategy 1: Direct UID lookup in users collection
            let fcmToken: string | null = null;
            
            try {
                const directSnap = await adminDb.collection("users").doc(student.id).get();
                if (directSnap.exists) {
                    const data = directSnap.data();
                    fcmToken = data?.fcmToken || null;
                    console.log(`[Notifications] Strategy1 (direct UID) for ${student.name}: ${fcmToken ? "token found" : "no token"}`);
                }
            } catch (e: any) {
                console.error(`[Notifications] Strategy1 failed for ${student.name}:`, e.message);
            }

            // Strategy 2: Search by admissionNumber (regNo) if no token found
            if (!fcmToken && student.regNo && student.regNo !== "—") {
                try {
                    const regSnap = await adminDb.collection("users")
                        .where("admissionNumber", "==", student.regNo)
                        .limit(1)
                        .get();
                    if (!regSnap.empty) {
                        const data = regSnap.docs[0].data();
                        fcmToken = data?.fcmToken || null;
                        console.log(`[Notifications] Strategy2 (admissionNumber=${student.regNo}) for ${student.name}: ${fcmToken ? "token found, uid=" + regSnap.docs[0].id : "no token"}`);
                    } else {
                        console.log(`[Notifications] Strategy2: No user found with admissionNumber=${student.regNo}`);
                    }
                } catch (e: any) {
                    console.error(`[Notifications] Strategy2 failed:`, e.message);
                }
            }

            // Strategy 3: Search by name
            if (!fcmToken && student.name) {
                try {
                    const nameSnap = await adminDb.collection("users")
                        .where("role", "==", "student")
                        .where("name", "==", student.name)
                        .limit(1)
                        .get();
                    if (!nameSnap.empty) {
                        const data = nameSnap.docs[0].data();
                        fcmToken = data?.fcmToken || null;
                        console.log(`[Notifications] Strategy3 (name) for ${student.name}: ${fcmToken ? "token found" : "no token"}`);
                    }
                } catch (e: any) {
                    console.error(`[Notifications] Strategy3 failed:`, e.message);
                }
            }

            if (!fcmToken) {
                console.warn(`[Notifications] No FCM token found for ${student.name} (id: ${student.id}). Student may not have enabled notifications.`);
                return;
            }

            try {
                const messageId = await adminMessaging.send({
                    token: fcmToken,
                    notification: { title, body: bodyText },
                    webpush: {
                        notification: {
                            title,
                            body: bodyText,
                            icon: "/icons/icon-192x192.png",
                            badge: "/icons/icon-72x72.png",
                            requireInteraction: true,
                        },
                        fcmOptions: {
                            link: "/student/attendance"
                        }
                    }
                });
                console.log(`[Notifications] ✅ Sent to ${student.name}: messageId=${messageId}`);
            } catch (e: any) {
                console.error(`[Notifications] ❌ FCM send failed for ${student.name}:`, e.message);
                // If token is invalid/expired, remove it from Firestore so it doesn't keep failing
                if (e.code === "messaging/registration-token-not-registered" || 
                    e.code === "messaging/invalid-registration-token") {
                    // Try to clean up the stale token
                    try {
                        const regSnap = await adminDb.collection("users")
                            .where("fcmToken", "==", fcmToken).limit(1).get();
                        if (!regSnap.empty) {
                            await regSnap.docs[0].ref.update({ fcmToken: null });
                            console.log(`[Notifications] Cleared stale token for ${student.name}`);
                        }
                    } catch (_) {}
                }
            }
        });

        await Promise.allSettled(promises);
        return NextResponse.json({ success: true, message: `Notifications processed for ${absentOrLate.length} students` });

    } catch (error: any) {
        console.error("[Notifications] Attendance Notification Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
