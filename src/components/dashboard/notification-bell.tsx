"use client";

import { useState, useEffect } from "react";
import { Bell, Check, Loader2 } from "lucide-react";
import { subscribeToNotifications } from "@/lib/onesignal";
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

export function NotificationBell({ theme = "light" }: NotificationBellProps) {
    const { user } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [permissionStatus, setPermissionStatus] = useState<string>("default");
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (typeof window !== "undefined" && "Notification" in window) {
            setPermissionStatus(Notification.permission);
            const stored = localStorage.getItem("student_notifications");
            if (stored) {
                try {
                    setNotifications(JSON.parse(stored));
                } catch (e) {
                    console.error("Failed to parse notifications", e);
                }
            }
        }
    }, []);

    // Listen for OneSignal foreground notifications
    useEffect(() => {
        if (typeof window === "undefined") return;
        const handler = (event: any) => {
            const payload = event.detail?.notification || {};
            const newNotif: NotificationItem = {
                id: Date.now().toString(),
                title: payload.title || "New Notification",
                body: payload.body || "",
                date: Date.now(),
                read: false,
            };
            setNotifications(prev => {
                const updated = [newNotif, ...prev];
                localStorage.setItem("student_notifications", JSON.stringify(updated));
                return updated;
            });
            toast.success(newNotif.title, { icon: "🔔" });
        };
        window.addEventListener("OneSignalNotificationReceived", handler);
        return () => window.removeEventListener("OneSignalNotificationReceived", handler);
    }, []);

    const handleEnableClick = async () => {
        setIsLoading(true);
        try {
            // Get user's admission number for targeting
            let admissionNumber = user?.email?.split("@")[0] || "";
            try {
                if (user) {
                    const snap = await getDoc(doc(db, "users", user.uid));
                    if (snap.exists()) {
                        const d = snap.data();
                        admissionNumber = d.admissionNumber || d.regNo || admissionNumber;
                    }
                }
            } catch (_) { /* use email prefix fallback */ }

            const success = await subscribeToNotifications(admissionNumber);
            if (success) {
                setPermissionStatus("granted");
                toast.success("Notifications Enabled! ✅");
                console.log(`[OneSignal] Subscribed for admNo=${admissionNumber}`);
            } else {
                toast.error("Failed to enable notifications. Please allow browser notifications.");
            }
        } catch (error) {
            console.error("Error enabling notifications:", error);
            toast.error("An error occurred");
        } finally {
            setIsLoading(false);
        }
    };

    const markAllRead = () => {
        const updated = notifications.map(n => ({ ...n, read: true }));
        setNotifications(updated);
        localStorage.setItem("student_notifications", JSON.stringify(updated));
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
                    {/* Backdrop for closing */}
                    <div 
                        className="fixed inset-0 z-40" 
                        onClick={() => setIsOpen(false)}
                    />
                    
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
                                            className={`p-3 rounded-lg text-sm border-l-2 ${notif.read ? 'border-transparent bg-white hover:bg-gray-50' : 'border-navy bg-blue-50/30'}`}
                                        >
                                            <div className="font-medium text-gray-900">{notif.title}</div>
                                            <div className="text-gray-600 mt-0.5 whitespace-pre-wrap">{notif.body}</div>
                                            <div className="text-xs text-gray-400 mt-2">
                                                {new Date(notif.date).toLocaleString(undefined, {
                                                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
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
