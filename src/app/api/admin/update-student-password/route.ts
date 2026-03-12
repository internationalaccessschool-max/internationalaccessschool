import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/auth-guard";

export async function POST(request: NextRequest) {
    try {
        const authResult = await verifyAuth(request, ["admin"]);
        if (authResult instanceof NextResponse) return authResult;

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

        await adminAuth.updateUser(uid, updateData);

        return NextResponse.json({ success: true, message: "Auth user updated successfully" });
    } catch (error: any) {
        console.error("Error updating auth user:", error);
        return NextResponse.json({ error: error.message || "Failed to update auth user" }, { status: 500 });
    }
}
