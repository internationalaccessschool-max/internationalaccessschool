import { NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { customInitApp } from "@/lib/firebase-admin";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { uid } = body;

        if (!uid) {
            return NextResponse.json({ error: "No user UID provided" }, { status: 400 });
        }

        // Initialize Firebase Admin (safe to call multiple times with customInitApp)
        customInitApp();
        const auth = getAuth();

        // Delete user from Firebase Auth
        await auth.deleteUser(uid);

        return NextResponse.json({ success: true, message: `Successfully deleted user ${uid} from Auth` });
    } catch (error: any) {
        console.error(`Failed to delete user from Auth:`, error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
