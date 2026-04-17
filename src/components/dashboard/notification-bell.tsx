"use client";

import { useState, useEffect, useRef } from "react";
import { Bell, Check, Loader2 } from "lucide-react";
import { subscribeToNotifications, isSubscribed } from "@/lib/onesignal";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import toast from "react-hot-toast";

type NotificationItem = {
    id: string;
    title: string;
    body: string;
    date: number;
    read: boolean;
};

interface NotificationBellProps {
    theme?: "light" | "dark";
}

const STORAGE_KEY = "student_notifications";

function loadFromStorage(): NotificationItem[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveToStorage(items: NotificationItem[]) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 50)));
    } catch { }
}

export function NotificationBell({ theme = "light" }: NotificationBellProps) {
    const { user } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [permissionStatus, setPermissionStatus] = useState<string>("default");
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Stable ref so OneSignal deferred callback doesn't capture stale state
    const addNotification = useRef((title: string, body: string) => {
        const newNotif: NotificationItem = {
            id: Date.now().toString(),
            title: title || "Notification",
            body: body || "",
            date: Date.now(),
            read: false,
        };
        setNotifications(prev => {
            const updated = [newNotif, ...prev];
            saveToStorage(updated);
            return updated;
        });
        toast.success(title || "New Notification", { icon: "🔔" });
    });

    // 1. Load localStorage + set permission status on mount
    useEffect(() => {
        if (typeof window === "undefined") return;
        if ("Notification" in window) setPermissionStatus(Notification.permission);
        setNotifications(loadFromStorage());
    }, []);

    // 2. Auto re-subscribe if permission already granted (handles subscription expiry on mobile)
    useEffect(() => {
        if (typeof window === "undefined" || !user) return;
        const autoResubscribe = async () => {
            if (Notification.permission !== "granted") return;
            try {
                const subscribed = await isSubscribed();
                if (subscribed) return; // already OK
                // Subscription expired — silently re-subscribe
                let admNo = user.email?.split("@")[0] || "";
                try {
                    const snap = await getDoc(doc(db, "studentLookup", user.uid));
                    if (snap.exists()) {
                        const d = snap.data();
                        admNo = d.admissionNumber || d.rollNo || admNo;
                    }
                } catch { }
                if (admNo) await subscribeToNotifications(admNo);
            } catch { }
        };
        autoResubscribe();
    }, [user]);

    // 3. Foreground notification event (app is open)
    useEffect(() => {
        if (typeof window === "undefined") return;
        const handler = (event: any) => {
            const payload = event.detail?.notification || {};
            addNotification.current(payload.title, payload.body);
        };
        window.addEventListener("OneSignalNotificationReceived", handler);
        return () => window.removeEventListener("OneSignalNotificationReceived", handler);
    }, []);

    // 4. Background notification click (user tapped notification → app opened)
    //    Uses OneSignalDeferred so it runs after SDK is ready
    useEffect(() => {
        if (typeof window === "undefined") return;
        window.OneSignalDeferred = window.OneSignalDeferred || [];
        window.OneSignalDeferred.push((os: any) => {
            try {
                os.Notifications.addEventListener("click", (event: any) => {
                    const notif = event?.notification || {};
                    addNotification.current(notif.title || notif.heading, notif.body || notif.content);
                });
            } catch { }
        });
    }, []);

    const getAdmNo = async (): Promise<string> => {
        let admNo = user?.email?.split("@")[0] || "";
        try {
            if (user) {
                // studentLookup is the correct flat collection for student data
                const snap = await getDoc(doc(db, "studentLookup", user.uid));
                if (snap.exists()) {
                    const d = snap.data();
                    admNo = d.admissionNumber || d.rollNo || admNo;
                }
            }
        } catch { }
        return admNo;
    };

    const handleEnableClick = async () => {
        setIsLoading(true);
        try {
            const admNo = await getAdmNo();
            const success = await subscribeToNotifications(admNo);
            if (success) {
                setPermissionStatus("granted");
                toast.success("Notifications Enabled! ✅");
            } else {
                toast.error("Failed to enable. Please allow notifications in browser settings.");
            }
        } catch {
            toast.error("An error occurred");
        } finally {
            setIsLoading(false);
        }
    };

    const markAllRead = () => {
        setNotifications(prev => {
            const updated = prev.map(n => ({ ...n, read: true }));
            saveToStorage(updated);
            return updated;
        });
    };

    const unreadCount = notifications.filter(n => !n.read).length;

    return (
        <div className="relative z-50">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "relative p-2 rounded-full transition-colors focus:outline-none flex items-center justify-center",
                    theme === "light"
                        ? "text-gray-600 hover:text-navy hover:bg-gray-100"
                        : "text-white/70 hover:text-white hover:bg-white/10"
                )}
            >
                <Bell className="w-5 h-5 md:w-6 md:h-6" />
                {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-off-white" />
                )}
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
                    <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden flex flex-col max-h-[85vh]">
                        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                            <h3 className="font-semibold text-gray-800">Notifications</h3>
                            {unreadCount > 0 && (
                                <button
                                    onClick={markAllRead}
                                    className="text-xs text-navy hover:text-navy-light flex items-center gap-1 font-medium"
                                >
                                    <Check className="w-3 h-3" /> Mark all read
                                </button>
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto p-2">
                            {permissionStatus !== "granted" && (
                                <div className="p-3 mb-2 bg-blue-50 rounded-lg border border-blue-100">
                                    <p className="text-sm text-blue-800 mb-2">
                                        Enable notifications to get instant alerts for attendance, results and fees.
                                    </p>
                                    <button
                                        onClick={handleEnableClick}
                                        disabled={isLoading}
                                        className="w-full py-2 bg-navy text-white text-sm font-medium rounded-md hover:bg-navy-light transition-colors flex justify-center items-center gap-2 disabled:opacity-70"
                                    >
                                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
                                        Enable Notifications
                                    </button>
                                </div>
                            )}

                            {notifications.length === 0 ? (
                                <div className="p-4 text-center text-sm text-gray-500 flex flex-col items-center">
                                    <Bell className="w-8 h-8 text-gray-300 mb-2" />
                                    No notifications yet
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    {notifications.map(notif => (
                                        <div
                                            key={notif.id}
                                            className={`p-3 rounded-lg text-sm border-l-2 ${notif.read ? "border-transparent bg-white hover:bg-gray-50" : "border-navy bg-blue-50/30"}`}
                                        >
                                            <div className="font-medium text-gray-900">{notif.title}</div>
                                            <div className="text-gray-600 mt-0.5 whitespace-pre-wrap">{notif.body}</div>
                                            <div className="text-xs text-gray-400 mt-2">
                                                {new Date(notif.date).toLocaleString(undefined, {
                                                    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
