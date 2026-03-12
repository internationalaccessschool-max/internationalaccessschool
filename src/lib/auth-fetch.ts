import { auth } from "@/lib/firebase";

/**
 * Authenticated fetch — automatically attaches the Firebase ID token
 * to the Authorization header. Drop-in replacement for fetch().
 *
 * Usage:
 *   import { authFetch } from "@/lib/auth-fetch";
 *   const res = await authFetch("/api/admin/create-teacher", {
 *       method: "POST",
 *       headers: { "Content-Type": "application/json" },
 *       body: JSON.stringify({ email, password, displayName }),
 *   });
 */
export async function authFetch(
    url: string,
    options: RequestInit = {}
): Promise<Response> {
    const user = auth.currentUser;

    if (!user) {
        throw new Error("Not authenticated — please log in again.");
    }

    const idToken = await user.getIdToken();

    const headers = new Headers(options.headers);
    headers.set("Authorization", `Bearer ${idToken}`);

    return fetch(url, {
        ...options,
        headers,
    });
}
