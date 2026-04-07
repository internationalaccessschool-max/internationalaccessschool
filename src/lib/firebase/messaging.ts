import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";
import { app } from "../firebase";

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY 
    || "BKgKYGhqP9QZkxQATvU4y1VEjnu2boGCV3DyubyoPwtE4Qx_LN4KF9Qy0ldZd4yLuxDghAQbq_84RCEXMYBBFvl";

export const requestForToken = async () => {
    try {
        const supported = await isSupported();
        if (!supported) {
            console.log("[FCM] Not supported in this browser.");
            return null;
        }

        // Step 1: Register the service worker first (so Firebase can find it)
        if ("serviceWorker" in navigator) {
            try {
                await navigator.serviceWorker.register("/firebase-messaging-sw.js");
                // Wait for it to be active
                await navigator.serviceWorker.ready;
                console.log("[FCM] Service worker ready.");
            } catch (swErr) {
                console.warn("[FCM] SW registration failed:", swErr);
            }
        }

        // Step 2: Ask for permission
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
            console.log("[FCM] Notification permission denied.");
            return null;
        }

        // Step 3: Let Firebase find the SW and handle pushManager internally
        // Do NOT pass serviceWorkerRegistration — Firebase finds firebase-messaging-sw.js on its own
        const messaging = getMessaging(app);
        console.log("[FCM] Requesting token with VAPID key:", VAPID_KEY.slice(0, 10) + "...");
        
        const currentToken = await getToken(messaging, { vapidKey: VAPID_KEY });

        if (currentToken) {
            console.log("[FCM] Token obtained:", currentToken.slice(0, 20) + "...");
        } else {
            console.warn("[FCM] No token — check VAPID key or browser settings.");
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
