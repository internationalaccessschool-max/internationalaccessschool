import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";
import { app } from "../firebase";

// VAPID key — must be hardcoded as a fallback because process.env can be
// undefined in client bundles when accessed inside service-worker context
const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY 
    || "BKgKYGhqP9QZkxQATvU4y1VEjnu2boGCV3DyubyoPwtE4Qx_LN4KF9Qy0ldZd4yLuxDghAQbq_84RCEXMYBBFvl";

export const requestForToken = async () => {
    try {
        const supported = await isSupported();
        if (!supported) {
            console.log("[FCM] Firebase Messaging not supported in this browser.");
            return null;
        }

        const messaging = getMessaging(app);
        
        // Register SW and wait for the ACTIVE registration (which has pushManager)
        let activeReg: ServiceWorkerRegistration | undefined;
        if ("serviceWorker" in navigator) {
            try {
                // Step 1: Register the SW
                await navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/" });
                // Step 2: Wait for an ACTIVE SW — this is the registration with pushManager
                activeReg = await navigator.serviceWorker.ready;
                console.log("[FCM] Service worker active:", activeReg.scope);
            } catch (swErr) {
                console.warn("[FCM] SW registration failed (will use existing):", swErr);
                // Fallback: try to use whatever is ready
                try { activeReg = await navigator.serviceWorker.ready; } catch {}
            }
        }

        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
            console.log("[FCM] Notification permission denied.");
            return null;
        }

        console.log("[FCM] Requesting token with VAPID key:", VAPID_KEY.slice(0, 10) + "...");
        const currentToken = await getToken(messaging, { 
            vapidKey: VAPID_KEY,
            ...(activeReg ? { serviceWorkerRegistration: activeReg } : {})
        });

        if (currentToken) {
            console.log("[FCM] Token obtained successfully:", currentToken.slice(0, 20) + "...");
        } else {
            console.warn("[FCM] No token returned — check VAPID key and Firebase Console settings.");
        }

        return currentToken || null;
    } catch (err) {
        console.error("[FCM] Error retrieving token:", err);
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
