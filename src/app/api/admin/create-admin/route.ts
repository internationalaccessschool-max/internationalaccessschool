import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/auth-guard";

export async function POST(request: NextRequest) {
    try {
        const auth = await verifyAuth(request, ["admin"]);
        if (auth instanceof NextResponse) return auth;

        const { email, password, displayName } = await request.json();

        if (!email || !password || !displayName) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        if (password.length < 6) {
            return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
        }

        // ── Duplicate email check across ALL roles ────────────────────────────
        const usersRef = adminDb.collection("users");
        const existing = await usersRef.where("email", "==", email.toLowerCase().trim()).get();
        if (!existing.empty) {
            const existingRole = existing.docs[0].data().role || "user";
            return NextResponse.json(
                { error: `This email is already registered as a ${existingRole}. Each account must have a unique email.` },
                { status: 409 }
            );
        }

        // Create Firebase Auth user
        const userRecord = await adminAuth.createUser({
            email: email.toLowerCase().trim(),
            password,
            displayName,
        });

        const uid = userRecord.uid;
        const normalizedEmail = email.toLowerCase().trim();

        // Atomically write Firestore docs — clean up Auth user if this fails
        try {
            const batch = adminDb.batch();
            batch.set(adminDb.collection("users").doc(uid), {
                role: "admin",
                email: normalizedEmail,
                displayName,
                createdAt: Date.now(),
            });
            batch.set(adminDb.collection("admins").doc(uid), {
                uid,
                email: normalizedEmail,
                displayName,
                createdAt: Date.now(),
            });
            await batch.commit();
        } catch (firestoreError: any) {
            // Roll back — delete the Auth user so it's not orphaned
            await adminAuth.deleteUser(uid).catch(() => {});
            throw new Error("Failed to save admin profile. Please try again.");
        }

        return NextResponse.json({ uid });

    } catch (error: any) {
        console.error("Create admin error:", error);
        return NextResponse.json({ error: error.message || "Failed to create admin" }, { status: 500 });
    }
}
