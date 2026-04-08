// OneSignal client-side utility
// Docs: https://documentation.onesignal.com/docs/web-sdk

declare global {
  interface Window {
    OneSignalDeferred?: ((onesignal: any) => void)[];
    OneSignal?: any;
  }
}

export const initOneSignal = () => {
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async function (OneSignal: any) {
    await OneSignal.init({
      appId: process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID!,
      notifyButton: { enable: false }, // We use our own UI
      allowLocalhostAsSecureOrigin: process.env.NODE_ENV === "development",
      serviceWorkerPath: "/OneSignalSDKWorker.js",
    });
  });
};

export const subscribeToNotifications = async (externalUserId: string): Promise<boolean> => {
  try {
    const OneSignal = window.OneSignal;
    if (!OneSignal) {
      console.warn("[OneSignal] SDK not loaded yet");
      return false;
    }
    // Opt in to push notifications
    await OneSignal.User.PushSubscription.optIn();
    // Link this subscription to the user's admissionNumber for server-side targeting
    await OneSignal.login(externalUserId);
    console.log("[OneSignal] ✅ Subscribed for user:", externalUserId);
    return true;
  } catch (err: any) {
    console.error("[OneSignal] Subscribe error:", err?.message);
    return false;
  }
};

export const isSubscribed = async (): Promise<boolean> => {
  try {
    const OneSignal = window.OneSignal;
    if (!OneSignal) return false;
    return OneSignal.User.PushSubscription.optedIn === true;
  } catch {
    return false;
  }
};

export const unsubscribeFromNotifications = async (): Promise<void> => {
  try {
    const OneSignal = window.OneSignal;
    if (!OneSignal) return;
    await OneSignal.User.PushSubscription.optOut();
    await OneSignal.logout();
    console.log("[OneSignal] Unsubscribed");
  } catch (err: any) {
    console.error("[OneSignal] Unsubscribe error:", err?.message);
  }
};
