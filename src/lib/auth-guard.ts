import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export interface AuthResult {
    uid: string;
    email: string;
    role: string;
}

/**
 * Verify Firebase ID token from Authorization header and optionally check role.
 * Usage in API routes:
 *   const auth = await verifyAuth(request, ["admin"]);
 *   if (auth instanceof NextResponse) return auth; // error response
 */
export async function verifyAuth(
    request: NextRequest | Request,
    allowedRoles?: string[]
): Promise<AuthResult | NextResponse> {
    try {
        const authHeader = request.headers.get("Authorization");

        if (!authHeader?.startsWith("Bearer ")) {
            return NextResponse.json(
                { error: "Unauthorized — missing or invalid Authorization header" },
                { status: 401 }
            );
        }

        const idToken = authHeader.split("Bearer ")[1];

        if (!idToken) {
            return NextResponse.json(
                { error: "Unauthorized — no token provided" },
                { status: 401 }
            );
        }

        // Verify the Firebase ID token
        const decoded = await adminAuth.verifyIdToken(idToken);

        // If no role check needed, return basic auth info
        if (!allowedRoles || allowedRoles.length === 0) {
            return { uid: decoded.uid, email: decoded.email || "", role: "authenticated" };
        }

        // Fetch the user's role from Firestore
        const userDoc = await adminDb.collection("users").doc(decoded.uid).get();

        if (!userDoc.exists) {
            return NextResponse.json(
                { error: "Forbidden — user profile not found" },
                { status: 403 }
            );
        }

        const userRole = userDoc.data()?.role;

        if (!userRole || !allowedRoles.includes(userRole)) {
            return NextResponse.json(
                { error: "Forbidden — insufficient permissions" },
                { status: 403 }
            );
        }

        return {
            uid: decoded.uid,
            email: decoded.email || "",
            role: userRole,
        };
    } catch (error: any) {
        console.error("Auth verification failed:", error.message);

        if (error.code === "auth/id-token-expired") {
            return NextResponse.json(
                { error: "Unauthorized — token expired, please re-login" },
                { status: 401 }
            );
        }

        return NextResponse.json(
            { error: "Unauthorized — invalid token" },
            { status: 401 }
        );
    }
}
