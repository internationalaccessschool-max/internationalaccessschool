"use client";

import { Bell, Palette, Save, Shield, User, CheckCircle2, AlertTriangle, Loader2, BellOff, Smartphone, Info, ImageIcon } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { subscribeToNotifications, unsubscribeFromNotifications, getNotificationStatus, observePushSubscription } from "@/lib/onesignal";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, collectionGroup, query, where, getDocs, limit } from "firebase/firestore";
import toast from "react-hot-toast";

const sections = [
    { id: "profile", label: "Profile", icon: User },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "privacy", label: "Privacy", icon: Shield },
    { id: "appearance", label: "Appearance", icon: Palette },
];

export default function StudentSettingsPage() {
    const [active, setActive] = useState("profile");
    const [saved, setSaved] = useState(false);
    const { user } = useAuth();

    // --- Notification State ---
    const [notifSubscribed, setNotifSubscribed] = useState<boolean | null>(null);
    const [notifPermission, setNotifPermission] = useState<"default" | "granted" | "denied" | "unsupported">("default");
    const [notifLoading, setNotifLoading] = useState(false);
    const [notifEmail, setNotifEmail] = useState("");
    const [notifEmailSaving, setNotifEmailSaving] = useState(false);
    const [admissionNumber, setAdmissionNumber] = useState<string>("");
    const [browserSupported, setBrowserSupported] = useState(true);
    const [isPWA, setIsPWA] = useState(false);
    const [showAndroidGuide, setShowAndroidGuide] = useState(false);

    const refreshNotificationState = useCallback(async () => {
        const status = await getNotificationStatus();
        setNotifPermission(status.permission);
        setNotifSubscribed(status.subscribed);
    }, []);

    // Check browser support and current subscription status
    useEffect(() => {
        if (active !== "notifications") return;

        let cancelled = false;
        let removeObserver: (() => void) | undefined;

        const syncStatus = async () => {
            const status = await getNotificationStatus();
            if (cancelled) return;
            setNotifPermission(status.permission);
            setNotifSubscribed(status.subscribed);
        };
        syncStatus();

        const supported = "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
        setBrowserSupported(supported);

        // Detect if running as installed PWA
        const pwa = window.matchMedia("(display-mode: standalone)").matches ||
            (window.navigator as any).standalone === true;
        setIsPWA(pwa);

        const handleWindowFocus = () => {
            syncStatus();
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                syncStatus();
            }
        };

        window.addEventListener("focus", handleWindowFocus);
        document.addEventListener("visibilitychange", handleVisibilityChange);

        observePushSubscription(() => {
            syncStatus();
        }).then((cleanup) => {
            if (cancelled) {
                cleanup();
                return;
            }
            removeObserver = cleanup;
        }).catch(() => {
            // Ignore observer setup failure; focus/visibility sync still keeps UI updated.
        });

        return () => {
            cancelled = true;
            window.removeEventListener("focus", handleWindowFocus);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            removeObserver?.();
        };
    }, [active, admissionNumber, refreshNotificationState]);

    // Fetch student profile data (admissionNumber + notificationEmail)
    useEffect(() => {
        if (!user?.uid) return;
        const fetchProfile = async () => {
            try {
                // Try studentLookup for fast resolution
                const lookupSnap = await getDoc(doc(db, "studentLookup", user.uid));
                let admNo = "";
                let email = "";

                if (lookupSnap.exists()) {
                    const lu = lookupSnap.data();
                    admNo = lu.admissionNumber || lu.rollNo || "";
                    const cls = lu.className;
                    const sec = lu.section;
                    if (cls && sec) {
                        const profileRef = doc(
                            db,
                            "users", "classes", cls, "sections", sec, "students", "profiles",
                            user.uid
                        );
                        const profileSnap = await getDoc(profileRef);
                        if (profileSnap.exists()) {
                            const data = profileSnap.data();
                            admNo = admNo || data.admissionNumber || data.rollNo || "";
                            email = data.notificationEmail || data.parentEmail || "";
                            // Skip internal emails
                            if (email.includes("@ias.edu") || email.includes("@school.")) email = "";
                        }
                    }
                }

                // Fallback: collectionGroup scan
                if (!admNo || !email) {
                    const snap = await getDocs(
                        query(collectionGroup(db, "profiles"), where("uid", "==", user.uid), limit(1))
                    );
                    if (!snap.empty) {
                        const data = snap.docs[0].data();
                        admNo = admNo || data.admissionNumber || data.rollNo || "";
                        if (!email) {
                            const e = data.notificationEmail || data.parentEmail || "";
                            if (!e.includes("@ias.edu")) email = e;
                        }
                    }
                }

                setAdmissionNumber(admNo);
                setNotifEmail(email);
            } catch (e) {
                console.error("Failed to fetch student profile", e);
            }
        };
        fetchProfile();
    }, [user?.uid]);

    const handleToggleNotification = async () => {
        if (notifLoading) return;

        // ─── UNSUBSCRIBE path ────────────────────────────────────────────────
        if (notifSubscribed) {
            setNotifLoading(true);
            try {
                await unsubscribeFromNotifications();
                await refreshNotificationState();
                toast.success("Push notifications disabled.");
            } catch (err: any) {
                toast.error(err?.message || "Something went wrong.");
            } finally {
                setNotifLoading(false);
            }
            return;
        }

        // ─── SUBSCRIBE path ──────────────────────────────────────────────────
        // ⚠️ CRITICAL: Notification.requestPermission() MUST be the FIRST call
        // after a user click. Any await before this causes Chrome/Android to
        // lose the user gesture context and silently skip the popup.
        if (!("Notification" in window)) {
            toast.error("This browser does not support notifications. Please use Chrome.");
            return;
        }

        // This is synchronous-first — triggers the browser Allow/Block popup immediately
        let permission: NotificationPermission;
        try {
            permission = await Notification.requestPermission();
        } catch {
            toast.error("Could not request notification permission.");
            return;
        }

        if (permission === "denied") {
            setNotifPermission("denied");
            setNotifSubscribed(false);
            toast.error("Notifications blocked. See the guide below to unblock.");
            return;
        }

        if (permission !== "granted") {
            // Popup didn't appear — likely Android OS blocked Chrome notifications
            // This happens when Chrome app doesn't have OS notification permission
            setShowAndroidGuide(true);
            toast.error("Popup didn't appear. Follow the Android guide below to fix.");
            return;
        }

        // Permission granted — now register with OneSignal
        setNotifPermission("granted");
        setNotifLoading(true);
        try {
            const externalId = admissionNumber || user?.uid || "";
            if (!externalId) {
                toast.error("Could not identify your account. Please contact admin.");
                return;
            }
            const result = await subscribeToNotifications(externalId);
            if (result.success) {
                await refreshNotificationState();
                toast.success("✅ Push notifications enabled! You'll now receive alerts.");
            } else {
                await refreshNotificationState();
                toast.error("Subscribed to browser but OneSignal link failed. Try again.");
            }
        } catch (err: any) {
            await refreshNotificationState();
            toast.error(err?.message || "Something went wrong.");
        } finally {
            setNotifLoading(false);
        }
    };

    const handleSaveNotifEmail = async () => {
        if (!user?.uid || !notifEmail.trim()) return;
        setNotifEmailSaving(true);
        try {
            // Find and update student profile
            const lookupSnap = await getDoc(doc(db, "studentLookup", user.uid));
            if (lookupSnap.exists()) {
                const lu = lookupSnap.data();
                const cls = lu.className;
                const sec = lu.section;
                if (cls && sec) {
                    const profileRef = doc(
                        db,
                        "users", "classes", cls, "sections", sec,
                        "students", "profiles", user.uid
                    );
                    await updateDoc(profileRef, { notificationEmail: notifEmail.trim() });
                    toast.success("Receipt email saved! Fee receipts will be sent here.");
                    return;
                }
            }
            toast.error("Could not save email. Please contact admin.");
        } catch (err: any) {
            toast.error("Failed to save: " + (err?.message || "Unknown error"));
        } finally {
            setNotifEmailSaving(false);
        }
    };

    const handleSave = () => {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="rounded-2xl gradient-navy p-6 md:p-8 relative overflow-hidden">
                <div
                    className="absolute inset-0 opacity-10"
                    style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.2) 0%, transparent 50%)` }}
                />
                <div className="relative z-10">
                    <p className="text-white/50 text-sm font-medium">Student Portal</p>
                    <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">Settings</h1>
                    <p className="text-white/40 text-sm mt-2">Manage your account preferences and settings.</p>
                </div>
            </div>

            <div className="grid md:grid-cols-4 gap-6">
                {/* Settings Nav */}
                <div className="md:col-span-1 bg-white rounded-2xl shadow-sm border border-gray-100 p-3 h-fit">
                    <nav className="space-y-0.5">
                        {sections.map((s) => (
                            <button
                                key={s.id}
                                onClick={() => setActive(s.id)}
                                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${active === s.id
                                        ? "bg-navy text-white"
                                        : "text-gray-500 hover:bg-gray-50 hover:text-navy"
                                    }`}
                            >
                                <s.icon className={`w-4 h-4 ${active === s.id ? "text-gold" : "text-gray-400"}`} />
                                {s.label}
                            </button>
                        ))}
                    </nav>
                </div>

                {/* Settings Panel */}
                <div className="md:col-span-3 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    {active === "profile" && (
                        <div className="space-y-6">
                            <div>
                                <h2 className="font-bold text-navy text-lg">Profile</h2>
                                <p className="text-xs text-gray-400 mt-0.5">
                                    Apna photo ya documents upload karo. Name aur details change karne ke liye admin se contact karo.
                                </p>
                            </div>

                            {/* Info notice */}
                            <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-100">
                                <Info className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                                <p className="text-xs text-amber-700 font-medium">
                                    Personal details (name, class, section) sirf admin change kar sakta hai. Koi bhi update chahiye to school office se contact karo.
                                </p>
                            </div>

                            {/* Photo Upload */}
                            <div className="p-5 rounded-2xl border border-gray-100 bg-gray-50 space-y-3">
                                <div className="flex items-center gap-2 mb-1">
                                    <ImageIcon className="w-4 h-4 text-navy" />
                                    <p className="text-sm font-semibold text-navy">Profile Photo</p>
                                </div>
                                <p className="text-xs text-gray-400">Apni photo upload karo (Max 1MB, JPG/PNG)</p>
                                <input
                                    type="file"
                                    accept="image/png,image/jpeg,image/jpg,image/webp"
                                    onChange={e => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        if (file.size > 1 * 1024 * 1024) {
                                            toast.error("File 1MB se badi nahi honi chahiye");
                                            e.target.value = "";
                                            return;
                                        }
                                        toast.success("Photo upload ke liye admin portal use karo ya school se contact karo.");
                                        e.target.value = "";
                                    }}
                                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-navy file:text-white hover:file:bg-navy/90 cursor-pointer"
                                />
                            </div>
                        </div>
                    )}

                    {active === "notifications" && (
                        <div className="space-y-6">
                            <h2 className="font-bold text-navy text-lg">Notification Preferences</h2>

                            {/* Browser not supported warning */}
                            {!browserSupported && (
                                <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
                                    <Smartphone className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-sm font-semibold text-amber-800">Browser Not Supported</p>
                                        <p className="text-xs text-amber-700 mt-1">
                                            Push notifications don't work on Samsung Internet Browser.
                                            Please open this app in <strong>Chrome</strong> or <strong>Edge</strong> on your Samsung Tab and enable notifications from there.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Permission BLOCKED warning */}
                            {notifPermission === "denied" && browserSupported && (
                                <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-50 border border-rose-200">
                                    <AlertTriangle className="w-5 h-5 text-rose-600 mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-sm font-semibold text-rose-800">Notifications Blocked</p>
                                        <p className="text-xs text-rose-700 mt-1 mb-2">
                                            You previously blocked notifications. To fix this:
                                        </p>
                                        <ol className="text-xs text-rose-700 space-y-1 list-decimal ml-4">
                                            <li>Click the <strong>🔒 lock icon</strong> in Chrome address bar</li>
                                            <li>Find <strong>"Notifications"</strong> → change to <strong>"Allow"</strong></li>
                                            <li><strong>Refresh the page</strong>, then click Enable again</li>
                                        </ol>
                                        <p className="text-xs text-rose-600 mt-2 font-medium">
                                            On Android: Settings → Apps → Chrome → Notifications → Allow
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Push notification toggle */}
                            <div className="p-5 rounded-2xl border border-gray-100 bg-gray-50 space-y-4">
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${notifSubscribed ? "bg-emerald-100" : "bg-gray-100"}`}>
                                            {notifSubscribed
                                                ? <Bell className="w-5 h-5 text-emerald-600" />
                                                : <BellOff className="w-5 h-5 text-gray-400" />
                                            }
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-navy">Push Notifications</p>
                                            <p className="text-xs text-gray-400 mt-0.5">
                                                {notifSubscribed === null
                                                    ? "Checking status..."
                                                    : notifSubscribed
                                                        ? "Enabled — You'll receive attendance & fee alerts"
                                                        : "Disabled — Enable to receive real-time alerts"}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        id="toggle-push-notification"
                                        onClick={handleToggleNotification}
                                        disabled={notifLoading || notifSubscribed === null || !browserSupported}
                                        className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed
                                            ${notifSubscribed
                                                ? "bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100"
                                                : "bg-navy text-white hover:bg-navy/90"
                                            }`}
                                    >
                                        {notifLoading
                                            ? <Loader2 className="w-4 h-4 animate-spin" />
                                            : notifSubscribed
                                                ? <><BellOff className="w-4 h-4" /> Disable</>
                                                : <><Bell className="w-4 h-4" /> Enable</>
                                        }
                                    </button>
                                </div>

                                {/* What you'll receive */}
                                {notifSubscribed && (
                                    <div className="border-t border-gray-200 pt-4 space-y-2">
                                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">You'll receive alerts for:</p>
                                        {[
                                            "Attendance marked absent or late",
                                            "Late fee reminders",
                                            "New homework assigned",
                                            "Exam & result announcements",
                                        ].map(item => (
                                            <div key={item} className="flex items-center gap-2 text-xs text-gray-600">
                                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                                {item}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Fee Receipt Email */}
                            <div className="p-5 rounded-2xl border border-gray-100 bg-gray-50 space-y-3">
                                <div>
                                    <p className="text-sm font-semibold text-navy">Fee Receipt Email</p>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        Enter your parent's email — fee payment receipts will be sent here automatically.
                                    </p>
                                </div>
                                <div className="flex gap-3">
                                    <input
                                        id="notification-email-input"
                                        type="email"
                                        value={notifEmail}
                                        onChange={e => setNotifEmail(e.target.value)}
                                        placeholder="parent@example.com"
                                        className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/10 transition-all"
                                    />
                                    <button
                                        id="save-notification-email"
                                        onClick={handleSaveNotifEmail}
                                        disabled={notifEmailSaving || !notifEmail.trim()}
                                        className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-navy text-white text-sm font-semibold hover:bg-navy/90 disabled:opacity-50 transition-all"
                                    >
                                        {notifEmailSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                        Save
                                    </button>
                                </div>
                                {notifEmail && !notifEmail.includes("@") && (
                                    <div className="flex items-center gap-1.5 text-xs text-rose-600">
                                        <AlertTriangle className="w-3.5 h-3.5" />
                                        Please enter a valid email address.
                                    </div>
                                )}
                            </div>

                            {/* Android OS-level permission guide — shown when popup didn't appear */}
                            {showAndroidGuide && (
                                <div className="p-4 rounded-xl border-2 border-orange-300 bg-orange-50">
                                    <p className="text-sm font-bold text-orange-800 flex items-center gap-2 mb-2">
                                        <Smartphone className="w-4 h-4" />
                                        Android Notification Permission Required
                                    </p>
                                    <p className="text-xs text-orange-700 mb-3">
                                        The popup didn't appear because <strong>Chrome doesn't have notification permission from Android OS</strong>.
                                        Fix it in 3 steps:
                                    </p>
                                    <ol className="text-xs text-orange-800 space-y-2 list-decimal ml-4 font-medium">
                                        <li>
                                            Open <strong>Android Settings</strong> (gear icon)
                                        </li>
                                        <li>
                                            Go to <strong>Apps → Chrome → Notifications</strong>
                                        </li>
                                        <li>
                                            Turn ON <strong>"Allow Notifications"</strong>
                                        </li>
                                    </ol>
                                    <p className="text-xs text-orange-700 mt-3 border-t border-orange-200 pt-2">
                                        After allowing → come back here → tap <strong>Enable</strong> again ✅
                                    </p>
                                    <button
                                        onClick={() => setShowAndroidGuide(false)}
                                        className="mt-2 text-xs text-orange-500 underline"
                                    >
                                        Dismiss
                                    </button>
                                </div>
                            )}

                            {/* PWA Setup Guide */}
                            {!notifSubscribed && (
                                <div className={`p-4 rounded-xl border ${isPWA ? "border-emerald-200 bg-emerald-50/50" : "border-blue-100 bg-blue-50/50"}`}>
                                    <p className={`text-xs font-semibold flex items-center gap-1.5 mb-2 ${isPWA ? "text-emerald-800" : "text-blue-800"}`}>
                                        <Smartphone className="w-3.5 h-3.5" />
                                        {isPWA ? "✅ Running as installed app (PWA)" : "📱 Install as App for best experience"}
                                    </p>
                                    {isPWA ? (
                                        // Already in PWA — show notification steps
                                        <ol className="text-xs text-emerald-700 space-y-1 list-decimal ml-4">
                                            <li>Tap <strong>Enable</strong> button above</li>
                                            <li>Android will ask to allow notifications → tap <strong>"Allow"</strong></li>
                                            <li>If no popup → go to <strong>Android Settings → Apps → Chrome → Notifications → Allow</strong></li>
                                        </ol>
                                    ) : (
                                        // In browser — suggest install + enable
                                        <ol className="text-xs text-blue-700 space-y-1 list-decimal ml-4">
                                            <li>Open in <strong>Chrome</strong> (not Samsung Internet)</li>
                                            <li>3-dot menu → <strong>"Add to Home Screen"</strong></li>
                                            <li>Open installed app → Settings → <strong>Enable Notifications</strong></li>
                                            <li>Tap <strong>"Allow"</strong> when Android asks</li>
                                        </ol>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {(active === "privacy" || active === "appearance") && (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
                                {active === "privacy" ? <Shield className="w-7 h-7 text-gray-300" /> : <Palette className="w-7 h-7 text-gray-300" />}
                            </div>
                            <p className="text-sm font-semibold text-gray-400">Coming Soon</p>
                            <p className="text-xs text-gray-300 mt-1">{active === "privacy" ? "Privacy" : "Appearance"} settings will be available soon.</p>
                        </div>
                    )}

                    {/* Save Button — unused now, kept for notifications email save */}
                    {false && (
                        <div className="mt-8 pt-6 border-t border-gray-100 flex justify-end">
                            <button
                                id="save-settings-btn"
                                onClick={handleSave}
                                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${saved
                                        ? "bg-emerald-500 text-white"
                                        : "bg-navy text-white hover:bg-navy/90"
                                    }`}
                            >
                                <Save className="w-4 h-4" />
                                {saved ? "Saved!" : "Save Changes"}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
