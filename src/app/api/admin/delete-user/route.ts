import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";

export async function POST(request: NextRequest) {
    try {
        const { uid } = await request.json();

        if (!uid) {
            return NextResponse.json({ error: "No user UID provided" }, { status: 400 });
        }

        // Delete user from Firebase Auth — this revokes all sessions immediately
        await adminAuth.deleteUser(uid);

        return NextResponse.json({ success: true, message: `User ${uid} deleted from Auth` });
    } catch (error: any) {
        // If user doesn't exist in Auth, treat as success (already deleted)
        if (error.code === "auth/user-not-found") {
            return NextResponse.json({ success: true, message: "User not found in Auth — already removed" });
        }
        console.error("Failed to delete user from Auth:", error);
        return NextResponse.json({ error: error.message || "Failed to delete user" }, { status: 500 });
    }
}
