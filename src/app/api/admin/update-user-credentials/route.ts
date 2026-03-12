import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/auth-guard";

export async function POST(request: NextRequest) {
    try {
        const authResult = await verifyAuth(request, ["admin"]);
        if (authResult instanceof NextResponse) return authResult;

        const body = await request.json();
        const { uid, newEmail, newPassword } = body;
        if (!uid) {
            return NextResponse.json({ error: "Missing uid" }, { status: 400 });
        }

        const updateData: any = {};
        if (newEmail && newEmail.trim()) updateData.email = newEmail.trim().toLowerCase();
        if (newPassword && newPassword.trim()) updateData.password = newPassword.trim();

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json({ error: "No changes to make" }, { status: 400 });
        }

        await adminAuth.updateUser(uid, updateData);

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Error updating credentials:", error);
        return NextResponse.json({ error: error.message || "Failed to update credentials" }, { status: 500 });
    }
}
