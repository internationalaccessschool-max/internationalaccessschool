import { NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { customInitApp } from "@/lib/firebase-admin";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { uid, newPassword, newDisplayName } = body;

        if (!uid) {
            return NextResponse.json({ error: "Missing uid" }, { status: 400 });
        }

        const updateData: any = {};
        if (newPassword) updateData.password = newPassword;
        if (newDisplayName) updateData.displayName = newDisplayName;

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
        }

        // Initialize Firebase Admin
        customInitApp();
        const auth = getAuth();

        // Update the user's auth profile
        await auth.updateUser(uid, updateData);

        return NextResponse.json({ success: true, message: "Auth user updated successfully" });
    } catch (error: any) {
        console.error("Error updating auth user:", error);
        return NextResponse.json({ error: error.message || "Failed to update auth user" }, { status: 500 });
    }
}
