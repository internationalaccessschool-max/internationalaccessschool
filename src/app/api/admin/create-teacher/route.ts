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

        // ── Duplicate email check across ALL roles ────────────────────────────
        const usersRef = adminDb.collection("users");
        // Check exact match (ignoring case manually via client normalization or query string match)
        // Firebase Auth is case-insensitive for emails usually, but Firestore where-queries are exact.
        // We will do a generic check
        const existing = await usersRef.where("email", "==", email.toLowerCase().trim()).get();
        if (!existing.empty) {
            const existingRole = existing.docs[0].data().role || "user";
            return NextResponse.json(
                { error: `This email is already registered as a ${existingRole}. Each account must have a unique email.` },
                { status: 409 }
            );
        }
        // ─────────────────────────────────────────────────────────────────────

        let uid: string;

        try {
            // Create new Firebase Auth user
            const userRecord = await adminAuth.createUser({ email: email.toLowerCase().trim(), password, displayName });
            uid = userRecord.uid;
        } catch (createError: any) {
            if (createError.code === "auth/email-already-exists") {
                // If it exists in Auth but NOT in the "users" collection (checked above),
                // it's an orphaned Auth account. We can safely reuse it.
                const existingUser = await adminAuth.getUserByEmail(email);
                uid = existingUser.uid;
                await adminAuth.updateUser(uid, { displayName });
            } else {
                throw createError;
            }
        }

        return NextResponse.json({ uid });

    } catch (error: any) {
        console.error("Create teacher error:", error);
        return NextResponse.json({ error: error.message || "Failed to create user" }, { status: 500 });
    }
}
