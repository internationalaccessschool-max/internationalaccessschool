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

    // Link this device to the student FIRST — so even if optIn is slow,
    // the external_id is already associated. login() is idempotent.
    await OneSignal.login(externalUserId);

    await OneSignal.User.PushSubscription.optIn();

    // Poll up to 8 seconds for push subscription to be fully created.
    // On mobile PWA this can take longer than on desktop.
    let pushId: string | undefined;
    let pushToken: string | undefined;
    for (let i = 0; i < 16; i++) {
      pushId = OneSignal.User.PushSubscription.id;
      pushToken = OneSignal.User.PushSubscription.token;
      if (pushId || pushToken) break;
      await new Promise(r => setTimeout(r, 500));
    }
    console.log("[OneSignal] Push subscription ID:", pushId);
    console.log("[OneSignal] Push token present:", !!pushToken);

    // We've already called login() and optIn() — treat as success even if
    // the client-side SDK state hasn't populated yet. OneSignal server
    // registers the subscription asynchronously anyway.
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
