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
  // 1. Check browser support
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    console.warn("[OneSignal] Push not supported in this browser.");
    return { success: false, reason: "unsupported" };
  }

  try {
    // 2. Request native browser permission FIRST — this shows the Allow/Block popup
    const permission = await Notification.requestPermission();

    if (permission !== "granted") {
      console.warn("[OneSignal] Permission denied by user.");
      return { success: false, reason: "permission_denied" };
    }

    // 3. Now tell OneSignal SDK to subscribe
    const OneSignal = await getOneSignal();
    await OneSignal.User.PushSubscription.optIn();

    // 4. Link this device to the student's admission number
    await OneSignal.login(externalUserId);

    console.log("[OneSignal] ✅ Subscribed for user:", externalUserId);
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
