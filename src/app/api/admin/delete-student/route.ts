import { NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { customInitApp } from "@/lib/firebase-admin";

export async function DELETE(request: Request) {
    try {
        const { uid } = await request.json();

        if (!uid) {
            return NextResponse.json({ error: "Student UID is required." }, { status: 400 });
        }

        customInitApp();
        const db = getFirestore();
        const auth = getAuth();

        // 1. Delete Firebase Auth account
        try {
            await auth.deleteUser(uid);
        } catch (authErr: any) {
            if (authErr.code !== "auth/user-not-found") {
                console.error("Auth delete failed:", authErr.message);
                // Don't stop — still try to clean firestore
            }
        }

        // 2. Find and delete Firestore profile documents for this uid
        //    The nested path is: users/classes/{className}/sections/{sectionName}/students/profiles/{uid}
        //    We use collectionGroup to find the doc regardless of class/section
        const profilesSnap = await db.collectionGroup("profiles").get();
        const toDelete = profilesSnap.docs.filter(doc => doc.id === uid);

        if (toDelete.length > 0) {
            const batch = db.batch();
            toDelete.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
        }

        return NextResponse.json({ success: true, deleted: toDelete.length });
    } catch (error: any) {
        console.error("Delete student error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
