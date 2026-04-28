"use client";

import { Sidebar } from "@/components/dashboard/sidebar";
import { MobileSidebar } from "@/components/dashboard/mobile-sidebar";
import { LayoutDashboard, CalendarCheck, FileText, ClipboardList, User, Settings, Loader2, Banknote, FileCheck, Bus, Bell, X, CalendarRange, BookOpen } from "lucide-react";
import { PWAInstallTrigger } from "@/components/PWAInstallTrigger";

import { useAuth } from "@/context/AuthContext";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/** Check if running as installed PWA (standalone mode) */
const isPWA = () =>
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as any).standalone === true);

export default function StudentLayout({ children }: { children: React.ReactNode }) {
    const { user, role, loading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const isLoginPage = pathname === "/student/login";

    // PWA notification prompt state
    const [showNotifBanner, setShowNotifBanner] = useState(false);

    useEffect(() => {
        if (!loading && !isLoginPage) {
            if (!user || (role !== "student" && role !== "parent")) {
                router.push("/student/login");
            }
        }
    }, [user, role, loading, router, isLoginPage]);

    // After login, if running as PWA and notification not yet asked → show banner once
    useEffect(() => {
        if (!user || isLoginPage || loading) return;
        if (!isPWA()) return; // only show in installed PWA

        // Only show if permission not yet decided (default = not asked yet)
        if (!("Notification" in window)) return;
        if (Notification.permission !== "default") return;

        // Show only once per session
        const key = "pwa_notif_prompted";
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, "1");

        // Small delay so page renders first
        const t = setTimeout(() => setShowNotifBanner(true), 2000);
        return () => clearTimeout(t);
    }, [user, isLoginPage, loading]);

    const handleEnableNotif = async () => {
        setShowNotifBanner(false);
        // Navigate to settings → notifications tab
        router.push("/student/settings");
    };

    const links = [
        {
            section: "Overview",
            items: [
                { href: "/student", label: "Dashboard", icon: LayoutDashboard },
            ],
        },
        {
            section: "Academics",
            items: [
                { href: "/student/attendance", label: "Attendance", icon: CalendarCheck },
                { href: "/student/results", label: "Report Cards", icon: FileText },
                { href: "/student/admit-card", label: "Admit Cards", icon: FileCheck },
                { href: "/student/timetable", label: "My Timetable", icon: CalendarRange },
                { href: "/student/syllabus", label: "Syllabus", icon: BookOpen },
                { href: "/student/homework", label: "Homework", icon: ClipboardList },
                { href: "/student/fees", label: "My Fees", icon: Banknote },
                { href: "/student/fees/transport", label: "Transport Fees", icon: Bus },
                { href: "/student/leave", label: "Leave Applications", icon: FileText },
            ],
        },
        {
            section: "Account",
            items: [
                { href: "/student/profile", label: "Profile", icon: User },
                { href: "/student/settings", label: "Settings", icon: Settings },
            ],
        },
    ];

    if (isLoginPage) {
        return (
            <>
                {children}
                <PWAInstallTrigger appName="Student Portal" themeColor="#3b82f6" icon="🎓" />
            </>
        );
    }

    if (loading || !user || (role !== "student" && role !== "parent")) {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-gray-50">
                <Loader2 className="w-8 h-8 animate-spin text-navy" />
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-off-white overflow-hidden print:h-auto print:bg-white print:overflow-visible">
            <aside className="hidden md:block shrink-0 print:hidden">
                <Sidebar title="Student Portal" links={links} />
            </aside>
            <div className="print:hidden">
                <MobileSidebar title="Student Portal" links={links} />
            </div>
            <main className="flex-1 min-w-0 overflow-y-auto pt-20 pb-4 px-4 md:py-8 md:px-8 print:p-0 print:m-0 print:overflow-visible relative">
                <div className="max-w-7xl mx-auto print:max-w-none">
                    {children}
                </div>
            </main>

            <PWAInstallTrigger appName="Student Portal" themeColor="#3b82f6" icon="🎓" />

            {/* PWA Notification Permission Banner — shown once after install */}
            {showNotifBanner && (
                <div className="fixed bottom-6 left-4 right-4 z-[9999] flex justify-center pointer-events-none">
                    <div className="bg-white rounded-2xl shadow-2xl border border-navy/10 p-4 flex items-center gap-3 max-w-sm w-full pointer-events-auto"
                        style={{ boxShadow: "0 8px 32px rgba(30,58,95,0.18)" }}>
                        <div className="w-11 h-11 rounded-xl bg-navy/10 flex items-center justify-center shrink-0">
                            <Bell className="w-5 h-5 text-navy" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-gray-900">Enable Notifications</p>
                            <p className="text-xs text-gray-500">Get attendance & fee alerts</p>
                        </div>
                        <button
                            id="pwa-enable-notif-btn"
                            onClick={handleEnableNotif}
                            className="px-4 py-2 rounded-xl bg-navy text-white text-xs font-bold shrink-0 hover:bg-navy/90 transition-colors"
                        >
                            Enable
                        </button>
                        <button
                            onClick={() => setShowNotifBanner(false)}
                            className="text-gray-300 hover:text-gray-500 transition-colors shrink-0 text-lg leading-none"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
