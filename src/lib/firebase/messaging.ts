import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";
import { app } from "../firebase";

const VAPID_KEY = "BKgKYGhqP9QZkxQATvU4y1VEjnu2boGCV3DyubyoPwtE4Qx_LN4KF9Qy0ldZd4yLuxDghAQbq_84RCEXMYBBFvl";

/**
 * Request FCM token using Web Push API directly.
 * Firebase SDK getToken() internally has pushManager issues on some configs,
 * so we get the push subscription ourselves and then pass the SW registration explicitly.
 */
export const requestForToken = async (): Promise<string | null> => {
    try {
        // 1. Browser support check
        const supported = await isSupported();
        if (!supported || !("serviceWorker" in navigator)) {
            console.warn("[FCM] Not supported in this browser");
            return null;
        }

        // 2. Notification permission
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
            console.log("[FCM] Permission denied");
            return null;
        }

        // 3. Unregister ALL existing service workers to avoid scope conflicts
        const allRegs = await navigator.serviceWorker.getRegistrations();
        for (const reg of allRegs) {
            await reg.unregister();
        }
        console.log("[FCM] Cleared all existing service workers");

        // 4. Register firebase-messaging-sw.js fresh
        const swReg = await navigator.serviceWorker.register(
            "/firebase-messaging-sw.js",
            { scope: "/", updateViaCache: "none" }
        );
        console.log("[FCM] SW registered:", swReg.scope);

        // 5. Wait until the SW is fully active
        await new Promise<void>((resolve) => {
            if (swReg.active) {
                resolve();
                return;
            }
            const sw = swReg.installing || swReg.waiting;
            if (!sw) { resolve(); return; }
            sw.addEventListener("statechange", function handler() {
                if (this.state === "activated" || this.state === "redundant") {
                    this.removeEventListener("statechange", handler);
                    resolve();
                }
            });
        });

        // 6. Use navigator.serviceWorker.ready for guaranteed active registration
        const readyReg = await navigator.serviceWorker.ready;
        console.log("[FCM] SW active:", readyReg.active?.scriptURL);
        console.log("[FCM] pushManager:", readyReg.pushManager ? "✅ available" : "❌ undefined");

        if (!readyReg.pushManager) {
            console.error("[FCM] pushManager is not available — browser may not support Push API");
            return null;
        }

        // 7. Clear old push subscriptions to avoid VAPID key mismatch
        const existingSub = await readyReg.pushManager.getSubscription();
        if (existingSub) {
            await existingSub.unsubscribe();
            console.log("[FCM] Cleared old push subscription");
        }

        // 8. Get FCM token, explicitly passing our SW registration
        //    This prevents Firebase SDK from doing its own SW lookup (which fails internally)
        const messaging = getMessaging(app);
        console.log("[FCM] Requesting FCM token...");

        const token = await getToken(messaging, {
            vapidKey: VAPID_KEY,
            serviceWorkerRegistration: readyReg,
        });

        if (token) {
            console.log("[FCM] ✅ Token:", token.slice(0, 20) + "...");
        } else {
            console.warn("[FCM] ❌ No token returned");
        }

        return token || null;
    } catch (err: any) {
        console.error("[FCM] Error:", err?.message || err);
        return null;
    }
};

export const setupOnMessageListener = (callback: (payload: any) => void): void => {
    isSupported().then((supported) => {
        if (supported) {
            const messaging = getMessaging(app);
            onMessage(messaging, (payload) => {
                callback(payload);
            });
        }
    });
};
