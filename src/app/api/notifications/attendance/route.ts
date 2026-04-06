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

        const promises = [];

        for (const student of students) {
            // Only alert for absent or late
            if (student.status === "present") continue;

            const title = student.status === "absent" ? "🚨 Attendance Alert" : "⚠️ Late Arrival";
            const bodyText = student.status === "absent" 
                ? `You have been marked ABSENT for today (${dateDisplay}).`
                : `You arrived LATE to school today (${dateDisplay}).`;

            const userP = adminDb.collection("users").doc(student.id).get().then((snap: any) => {
                if (snap.exists) {
                    const data = snap.data();
                    if (data?.fcmToken) {
                        return adminMessaging.send({
                            token: data.fcmToken,
                            notification: { title, body: bodyText }
                        }).catch((e: any) => {
                            console.error(`Failed to send to ${student.name}:`, e);
                        });
                    }
                }
            }).catch((e: any) => console.error("Error fetching user", e));

            promises.push(userP);
        }

        await Promise.allSettled(promises);
        return NextResponse.json({ success: true, message: "Notifications processed" });

    } catch (error: any) {
        console.error("Attendance Notification Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
