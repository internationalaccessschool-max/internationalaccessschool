import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";
import { getInstallations, getId } from "firebase/installations";
import { app } from "../firebase";

const VAPID_KEY = "BKgKYGhqP9QZkxQATvU4y1VEjnu2boGCV3DyubyoPwtE4Qx_LN4KF9Qy0ldZd4yLuxDghAQbq_84RCEXMYBBFvl";

export const requestForToken = async () => {
    try {
        const supported = await isSupported();
        if (!supported) {
            console.log("[FCM] Not supported in this browser.");
            return null;
        }

        if (!("serviceWorker" in navigator)) {
            console.log("[FCM] Service Worker API not available.");
            return null;
        }

        // ── Step 1: Clean up conflicting service workers ──────────────────
        // next-pwa generates sw.js at scope / which conflicts with firebase-messaging-sw.js
        const allRegs = await navigator.serviceWorker.getRegistrations();
        for (const reg of allRegs) {
            const swUrl = reg.active?.scriptURL || reg.waiting?.scriptURL || reg.installing?.scriptURL || "";
            // Keep ONLY firebase-messaging-sw.js, unregister everything else at scope /
            if (!swUrl.includes("firebase-messaging-sw.js")) {
                await reg.unregister();
                console.log("[FCM] Unregistered conflicting SW:", swUrl);
            }
        }

        // ── Step 2: Register our Firebase SW ──────────────────────────────
        let swReg: ServiceWorkerRegistration;
        try {
            swReg = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
                updateViaCache: "none"
            });
            console.log("[FCM] SW registered, scope:", swReg.scope);
        } catch (swErr) {
            console.error("[FCM] SW registration failed:", swErr);
            return null;
        }

        // Wait for it to become active
        if (swReg.installing) {
            await new Promise<void>((resolve) => {
                swReg.installing!.addEventListener("statechange", function handler() {
                    if (this.state === "activated" || this.state === "redundant") {
                        this.removeEventListener("statechange", handler);
                        resolve();
                    }
                });
            });
        }

        // Ensure we have an active registration  
        const readyReg = await navigator.serviceWorker.ready;
        console.log("[FCM] SW ready, active:", readyReg.active?.scriptURL);

        // ── Step 3: Clear stale push subscription (old VAPID key) ─────────
        try {
            const oldSub = await readyReg.pushManager.getSubscription();
            if (oldSub) {
                await oldSub.unsubscribe();
                console.log("[FCM] Cleared old push subscription");
            }
        } catch (pushErr) {
            console.warn("[FCM] Could not check/clear push subscription:", pushErr);
        }

        // ── Step 4: Verify Firebase Installations auth works ──────────────
        try {
            const installations = getInstallations(app);
            const iid = await getId(installations);
            console.log("[FCM] Firebase Installation ID:", iid);
        } catch (fisErr: any) {
            console.error("[FCM] Firebase Installations failed:", fisErr.message);
            
            // Try clearing Firebase Installations IndexedDB and retry
            console.log("[FCM] Clearing Firebase Installations cache...");
            try {
                const dbs = await indexedDB.databases();
                for (const db of dbs) {
                    if (db.name && (db.name.includes("firebase-installations") || db.name.includes("firebase-heartbeat"))) {
                        console.log("[FCM] Deleting IndexedDB:", db.name);
                        indexedDB.deleteDatabase(db.name);
                    }
                }
                // Wait for cleanup
                await new Promise(r => setTimeout(r, 500));
                
                // Retry
                const installations = getInstallations(app);
                const iid = await getId(installations);
                console.log("[FCM] Installation ID (after reset):", iid);
            } catch (retryErr: any) {
                console.error("[FCM] Firebase Installations still failing:", retryErr.message);
                console.error("[FCM] → Please enable Firebase Installations API in Google Cloud Console:");
                console.error("[FCM] → https://console.cloud.google.com/apis/library/firebaseinstallations.googleapis.com?project=international-access-school");
                return null;
            }
        }

        // ── Step 5: Get notification permission ───────────────────────────
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
            console.log("[FCM] Notification permission denied.");
            return null;
        }

        // ── Step 6: Get FCM token ────────────────────────────────────────
        const messaging = getMessaging(app);
        console.log("[FCM] Requesting token with VAPID:", VAPID_KEY.slice(0, 15) + "...");

        const currentToken = await getToken(messaging, { 
            vapidKey: VAPID_KEY
        });

        if (currentToken) {
            console.log("[FCM] ✅ Token obtained:", currentToken.slice(0, 25) + "...");
        } else {
            console.warn("[FCM] ❌ No token returned.");
        }

        return currentToken || null;
    } catch (err: any) {
        console.error("[FCM] Error:", err.message || err);
        
        // If it's an auth error, provide actionable guidance
        if (err.message?.includes("401") || err.message?.includes("Unauthorized") || err.message?.includes("authentication credential")) {
            console.error("[FCM] 🔧 AUTH FIX: Enable these APIs in Google Cloud Console (project: international-access-school):");
            console.error("[FCM]   1. Firebase Installations API: https://console.cloud.google.com/apis/library/firebaseinstallations.googleapis.com");
            console.error("[FCM]   2. FCM Registration API: https://console.cloud.google.com/apis/library/fcmregistrations.googleapis.com");
            console.error("[FCM]   3. Firebase Cloud Messaging API: https://console.cloud.google.com/apis/library/fcm.googleapis.com");
        }

        return null;
    }
};


export const setupOnMessageListener = (callback: (payload: any) => void) => {
    isSupported().then((supported) => {
        if (supported) {
            const messaging = getMessaging(app);
            onMessage(messaging, (payload) => {
                callback(payload);
            });
        }
    });
};
