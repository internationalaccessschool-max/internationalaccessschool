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

// Wait for OneSignal SDK to be ready (handles timing issues)
const getOneSignal = (): Promise<any> => {
  return new Promise((resolve, reject) => {
    if (window.OneSignal) { resolve(window.OneSignal); return; }
    // SDK not ready yet — queue via OneSignalDeferred
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    const timeout = setTimeout(() => reject(new Error("OneSignal SDK timeout")), 10000);
    window.OneSignalDeferred.push((os: any) => {
      clearTimeout(timeout);
      resolve(os);
    });
  });
};

export const subscribeToNotifications = async (externalUserId: string): Promise<boolean> => {
  try {
    const OneSignal = await getOneSignal();
    await OneSignal.User.PushSubscription.optIn();
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
    const OneSignal = await getOneSignal();
    return OneSignal.User.PushSubscription.optedIn === true;
  } catch {
    return false;
  }
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
