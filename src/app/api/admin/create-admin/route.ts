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

        // Create new Firebase Auth user
        const userRecord = await adminAuth.createUser({
            email: email.toLowerCase().trim(),
            password,
            displayName,
        });

        return NextResponse.json({ uid: userRecord.uid });

    } catch (error: any) {
        console.error("Create admin error:", error);
        return NextResponse.json({ error: error.message || "Failed to create admin" }, { status: 500 });
    }
}
