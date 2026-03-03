import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export async function POST(request: NextRequest) {
    try {
        const { email, password, displayName } = await request.json();

        if (!email || !password || !displayName) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
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
        // ─────────────────────────────────────────────────────────────────────

        // Create new Firebase Auth user
        const userRecord = await adminAuth.createUser({ email, password, displayName });
        return NextResponse.json({ uid: userRecord.uid });

    } catch (error: any) {
        console.error("Create accountant error:", error);
        return NextResponse.json({ error: error.message || "Failed to create user" }, { status: 500 });
    }
}
