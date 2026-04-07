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

        if (!("serviceWorker" in navigator)) {
            console.log("[FCM] Service Worker API not available.");
            return null;
        }

        // ── DIAGNOSTIC: show ALL registered service workers ──────────────────
        const allRegs = await navigator.serviceWorker.getRegistrations();
        console.log(`[FCM] ${allRegs.length} SW(s) currently registered:`);
        allRegs.forEach((r, i) => {
            console.log(`  [${i}] scope=${r.scope} active=${r.active?.scriptURL} waiting=${r.waiting?.scriptURL} installing=${r.installing?.scriptURL} pushManager=${r.pushManager}`);
        });
        // ─────────────────────────────────────────────────────────────────────

        // Register our firebase SW (will update existing if scope matches)
        try {
            await navigator.serviceWorker.register("/firebase-messaging-sw.js");
            console.log("[FCM] SW registration call done.");
        } catch (swErr) {
            console.warn("[FCM] SW registration failed:", swErr);
        }

        // Wait for an active SW
        const activeReg = await navigator.serviceWorker.ready;
        console.log(`[FCM] ready resolved → scope=${activeReg.scope}`);
        console.log(`[FCM] active SW: ${activeReg.active?.scriptURL}`);
        console.log(`[FCM] waiting SW: ${activeReg.waiting?.scriptURL}`);
        console.log(`[FCM] pushManager:`, activeReg.pushManager);
        console.log(`[FCM] pushManager type: ${typeof activeReg.pushManager}`);

        // Get the specific registration for our firebase SW
        const fbReg = await navigator.serviceWorker.getRegistration("/");
        console.log(`[FCM] getRegistration('/') → scope=${fbReg?.scope} pushManager=${fbReg?.pushManager}`);

        if (!fbReg || !fbReg.pushManager) {
            console.error("[FCM] No valid registration with pushManager found. Cannot get FCM token.");
            return null;
        }

        // Ask for permission
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
            console.log("[FCM] Notification permission denied.");
            return null;
        }

        const messaging = getMessaging(app);
        console.log("[FCM] Requesting token with VAPID:", VAPID_KEY.slice(0, 10) + "...");

        // Pass the registration explicitly so Firebase doesn't do its own lookup
        const currentToken = await getToken(messaging, { 
            vapidKey: VAPID_KEY,
            serviceWorkerRegistration: fbReg
        });

        if (currentToken) {
            console.log("[FCM] Token obtained:", currentToken.slice(0, 20) + "...");
        } else {
            console.warn("[FCM] No token.");
        }

        return currentToken || null;
    } catch (err) {
        console.error("[FCM] Error:", err);
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
