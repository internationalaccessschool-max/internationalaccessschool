import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/auth-guard";

export async function DELETE(request: NextRequest) {
    try {
        const auth = await verifyAuth(request, ["admin"]);
        if (auth instanceof NextResponse) return auth;

        const { uid } = await request.json();

        if (!uid) {
            return NextResponse.json({ error: "Student UID is required." }, { status: 400 });
        }

        // 1. Delete Firebase Auth account
        try {
            await adminAuth.deleteUser(uid);
        } catch (authErr: any) {
            if (authErr.code !== "auth/user-not-found") {
                console.error("Auth delete failed:", authErr.message);
            }
        }

        // 2. Use studentLookup to find class/section — avoids scanning ALL profiles
        let deleted = 0;
        const lookupDoc = await adminDb.collection("studentLookup").doc(uid).get();

        if (lookupDoc.exists) {
            const data = lookupDoc.data();
            const className = (data?.className || "").toString().trim();
            const section = (data?.section || "").toString().trim();

            if (className && section) {
                // Delete from targeted nested path
                const profileRef = adminDb
                    .collection("users").doc("classes")
                    .collection(className).doc("sections")
                    .collection(section).doc("students")
                    .collection("profiles").doc(uid);

                const profileDoc = await profileRef.get();
                if (profileDoc.exists) {
                    await profileRef.delete();
                    deleted++;
                }
            }

            // Delete lookup entry
            await adminDb.collection("studentLookup").doc(uid).delete();
        }

        // 3. Also delete from users collection if exists
        const userDocRef = adminDb.collection("users").doc(uid);
        const userDoc = await userDocRef.get();
        if (userDoc.exists) {
            await userDocRef.delete();
        }

        return NextResponse.json({ success: true, deleted });
    } catch (error: any) {
        console.error("Delete student error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
