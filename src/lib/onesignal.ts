// OneSignal client-side utility
// Docs: https://documentation.onesignal.com/docs/web-sdk

declare global {
  interface Window {
    OneSignalDeferred?: ((onesignal: any) => void)[];
    OneSignal?: any;
  }
}

// Wait for OneSignal SDK to be ready (handles timing issues)
const getOneSignal = (): Promise<any> => {
  return new Promise((resolve, reject) => {
    if (window.OneSignal) { resolve(window.OneSignal); return; }
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    const timeout = setTimeout(() => reject(new Error("OneSignal SDK timeout")), 10000);
    window.OneSignalDeferred.push((os: any) => {
      clearTimeout(timeout);
      resolve(os);
    });
  });
};

export const subscribeToNotifications = async (externalUserId: string): Promise<{
  success: boolean;
  reason?: "permission_denied" | "sdk_error" | "unsupported";
}> => {
  // Check browser support
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    return { success: false, reason: "unsupported" };
  }

  // Caller must have already called Notification.requestPermission() FIRST
  // (before any awaits) to ensure the browser popup showed correctly.
  if (Notification.permission !== "granted") {
    return { success: false, reason: "permission_denied" };
  }

  try {
    const OneSignal = await getOneSignal();
    await OneSignal.User.PushSubscription.optIn();

    // Wait a bit for push subscription to be fully created (especially on mobile)
    await new Promise(r => setTimeout(r, 1000));

    // Verify the push subscription actually got created
    const pushId = OneSignal.User.PushSubscription.id;
    const pushToken = OneSignal.User.PushSubscription.token;
    console.log("[OneSignal] Push subscription ID:", pushId);
    console.log("[OneSignal] Push token present:", !!pushToken);

    if (!pushId && !pushToken) {
      console.error("[OneSignal] ❌ Push subscription not created — service worker may not be registered in PWA scope");
      return { success: false, reason: "sdk_error" };
    }

    // Link this device to the student's admission number
    await OneSignal.login(externalUserId);

    console.log("[OneSignal] ✅ Subscribed for user:", externalUserId, "pushId:", pushId);
    return { success: true };
  } catch (err: any) {
    console.error("[OneSignal] Subscribe error:", err?.message);
    return { success: false, reason: "sdk_error" };
  }
};

export const isSubscribed = async (): Promise<boolean> => {
  try {
    // Also check native permission — if denied, definitely not subscribed
    if ("Notification" in window && Notification.permission === "denied") {
      return false;
    }
    const OneSignal = await getOneSignal();
    return OneSignal.User.PushSubscription.optedIn === true;
  } catch {
    return false;
  }
};

export const getNotificationPermission = (): NotificationPermission | "unsupported" => {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission; // "default" | "granted" | "denied"
};

export const unsubscribeFromNotifications = async (): Promise<void> => {
  try {
    const OneSignal = await getOneSignal();
    await OneSignal.User.PushSubscription.optOut();
    await OneSignal.logout();
    console.log("[OneSignal] Unsubscribed");
  } catch (err: any) {
    console.error("[OneSignal] Unsubscribe error:", err?.message);
  }
};
