// OneSignal client-side utility
// Docs: https://documentation.onesignal.com/docs/web-sdk-reference

export type PushSubscriptionSnapshot = {
  id?: string;
  token?: string;
  optedIn?: boolean;
};

type PushSubscriptionChangeEvent = {
  current?: PushSubscriptionSnapshot;
};

type OneSignalPushSubscription = {
  id?: string | null;
  token?: string | null;
  optedIn?: boolean;
  optIn(): Promise<void>;
  optOut(): Promise<void>;
  addEventListener?: (event: "change", listener: (event: PushSubscriptionChangeEvent) => void) => void;
  removeEventListener?: (event: "change", listener: (event: PushSubscriptionChangeEvent) => void) => void;
};

type OneSignalNotificationsClickEvent = {
  notification?: {
    title?: string;
    heading?: string;
    body?: string;
    content?: string;
  };
};

type OneSignalNotifications = {
  addEventListener?: (event: "click", listener: (event: OneSignalNotificationsClickEvent) => void) => void;
};

type OneSignalUser = {
  PushSubscription: OneSignalPushSubscription;
};

export type OneSignalLike = {
  User: OneSignalUser;
  Notifications?: OneSignalNotifications;
  login(externalUserId: string): Promise<void>;
  logout(): Promise<void>;
};

declare global {
  interface Window {
    OneSignalDeferred?: ((onesignal: OneSignalLike) => void)[];
    OneSignal?: OneSignalLike;
  }
}

type SubscribeFailureReason = "permission_denied" | "sdk_error" | "unsupported";

type SubscribeResult = {
  success: boolean;
  reason?: SubscribeFailureReason;
};

export type NotificationStatus = {
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
  pushSubscription: PushSubscriptionSnapshot;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  return String(error);
};

const getOneSignal = (): Promise<OneSignalLike> => {
  return new Promise((resolve, reject) => {
    if (window.OneSignal) {
      resolve(window.OneSignal);
      return;
    }

    window.OneSignalDeferred = window.OneSignalDeferred || [];
    const timeout = setTimeout(() => reject(new Error("OneSignal SDK timeout")), 10000);

    window.OneSignalDeferred.push((os) => {
      clearTimeout(timeout);
      resolve(os);
    });
  });
};

const getPushSubscriptionSnapshot = (oneSignal: OneSignalLike): PushSubscriptionSnapshot => ({
  id: oneSignal.User.PushSubscription.id ?? undefined,
  token: oneSignal.User.PushSubscription.token ?? undefined,
  optedIn: oneSignal.User.PushSubscription.optedIn ?? undefined,
});

const hasPushIdentity = (snapshot: PushSubscriptionSnapshot) => Boolean(snapshot.id || snapshot.token);

const isPermissionGranted = (permission: NotificationPermission | "unsupported") => permission === "granted";

const waitForPushSubscription = async (
  oneSignal: OneSignalLike,
  timeoutMs = 15000
): Promise<PushSubscriptionSnapshot> => {
  const current = getPushSubscriptionSnapshot(oneSignal);
  if (hasPushIdentity(current)) {
    return current;
  }

  return new Promise((resolve, reject) => {
    let settled = false;

    const onChange = (event: PushSubscriptionChangeEvent) => {
      const next: PushSubscriptionSnapshot = {
        id: event.current?.id ?? oneSignal.User.PushSubscription.id ?? undefined,
        token: event.current?.token ?? oneSignal.User.PushSubscription.token ?? undefined,
        optedIn: event.current?.optedIn ?? oneSignal.User.PushSubscription.optedIn ?? undefined,
      };

      if (hasPushIdentity(next)) {
        finish(next);
      }
    };

    const cleanup = () => {
      clearInterval(intervalId);
      clearTimeout(timeoutId);
      try {
        oneSignal.User.PushSubscription.removeEventListener?.("change", onChange);
      } catch {
        // Ignore SDK listener cleanup failures.
      }
    };

    const finish = (snapshot: PushSubscriptionSnapshot) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(snapshot);
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    try {
      oneSignal.User.PushSubscription.addEventListener?.("change", onChange);
    } catch {
      // Polling below covers SDK wrappers that do not expose the listener API.
    }

    const intervalId = setInterval(() => {
      const snapshot = getPushSubscriptionSnapshot(oneSignal);
      if (hasPushIdentity(snapshot)) {
        finish(snapshot);
      }
    }, 400);

    const timeoutId = setTimeout(() => {
      fail(new Error("Timed out waiting for OneSignal push subscription"));
    }, timeoutMs);
  });
};

const clearConflictingServiceWorkers = async () => {
  if (!("serviceWorker" in navigator)) return;

  const registrations = await navigator.serviceWorker.getRegistrations();
  for (const reg of registrations) {
    const activeScript = reg.active?.scriptURL;
    if (activeScript && !activeScript.includes("OneSignal")) {
      await reg.unregister();
      console.log("[OneSignal] Cleared conflicting SW:", activeScript);
    }
  }
};

export const syncOneSignalUser = async (
  externalUserId: string,
  options: { ensureOptedIn?: boolean } = {}
): Promise<SubscribeResult> => {
  const normalizedExternalUserId = externalUserId.trim();
  if (!normalizedExternalUserId) {
    return { success: false, reason: "sdk_error" };
  }

  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    return { success: false, reason: "unsupported" };
  }

  if (Notification.permission !== "granted") {
    return { success: false, reason: "permission_denied" };
  }

  try {
    if (options.ensureOptedIn) {
      await clearConflictingServiceWorkers();
    }

    const oneSignal = await getOneSignal();

    if (options.ensureOptedIn) {
      await oneSignal.User.PushSubscription.optIn();
    }

    const pushState = await waitForPushSubscription(oneSignal);

    // Link after the browser subscription exists so OneSignal can attach it cleanly.
    await oneSignal.login(normalizedExternalUserId);
    await delay(250);

    console.log("[OneSignal] Push subscription ID:", pushState.id);
    console.log("[OneSignal] Push token present:", !!pushState.token);
    console.log("[OneSignal] Linked external user:", normalizedExternalUserId);

    return { success: true };
  } catch (error: unknown) {
    console.error("[OneSignal] Subscribe error:", getErrorMessage(error));
    return { success: false, reason: "sdk_error" };
  }
};

export const subscribeToNotifications = async (externalUserId: string): Promise<SubscribeResult> => {
  // Caller must request browser permission before invoking this helper.
  return syncOneSignalUser(externalUserId, { ensureOptedIn: true });
};

export const getNotificationStatus = async (): Promise<NotificationStatus> => {
  const permission = getNotificationPermission();
  if (permission === "unsupported") {
    return {
      permission,
      subscribed: false,
      pushSubscription: {},
    };
  }

  try {
    if (!isPermissionGranted(permission)) {
      return {
        permission,
        subscribed: false,
        pushSubscription: {},
      };
    }

    const oneSignal = await getOneSignal();
    const pushSubscription = getPushSubscriptionSnapshot(oneSignal);
    return {
      permission,
      subscribed: pushSubscription.optedIn === true && hasPushIdentity(pushSubscription),
      pushSubscription,
    };
  } catch {
    return {
      permission,
      subscribed: false,
      pushSubscription: {},
    };
  }
};

export const isSubscribed = async (): Promise<boolean> => {
  const status = await getNotificationStatus();
  return status.subscribed;
};

export const getNotificationPermission = (): NotificationPermission | "unsupported" => {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
};

export const unsubscribeFromNotifications = async (): Promise<void> => {
  try {
    const oneSignal = await getOneSignal();
    await oneSignal.User.PushSubscription.optOut();
    console.log("[OneSignal] Unsubscribed");
  } catch (error: unknown) {
    console.error("[OneSignal] Unsubscribe error:", getErrorMessage(error));
  }
};

export const observePushSubscription = async (
  listener: (event: PushSubscriptionChangeEvent) => void
): Promise<() => void> => {
  const oneSignal = await getOneSignal();
  oneSignal.User.PushSubscription.addEventListener?.("change", listener);

  return () => {
    try {
      oneSignal.User.PushSubscription.removeEventListener?.("change", listener);
    } catch {
      // Ignore cleanup failures from the SDK wrapper.
    }
  };
};
