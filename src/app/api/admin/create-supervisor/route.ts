import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";

export async function POST(request: NextRequest) {
    try {
        const { email, password, displayName } = await request.json();

        if (!email || !password || !displayName) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        let uid: string;

        try {
            // Try to create a new Firebase Auth user
            const userRecord = await adminAuth.createUser({ email, password, displayName });
            uid = userRecord.uid;
        } catch (createError: any) {
            if (createError.code === "auth/email-already-exists") {
                // Reuse the existing Firebase Auth account
                const existingUser = await adminAuth.getUserByEmail(email);
                uid = existingUser.uid;
                // Update displayName in case it changed
                await adminAuth.updateUser(uid, { displayName });
            } else {
                throw createError;
            }
        }

        return NextResponse.json({ uid });
    } catch (error: any) {
        console.error("Create supervisor error:", error);
        return NextResponse.json({ error: error.message || "Failed to create user" }, { status: 500 });
    }
}
