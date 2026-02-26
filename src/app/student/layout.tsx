"use client";

import { Sidebar } from "@/components/dashboard/sidebar";
import { MobileSidebar } from "@/components/dashboard/mobile-sidebar";
import { LayoutDashboard, CalendarCheck, FileText, ClipboardList, User, Settings, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
    const { user, role, loading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const isLoginPage = pathname === "/student/login";

    const [debugState, setDebugState] = useState<any>(null);

    useEffect(() => {
        if (!loading && !isLoginPage) {
            if (!user || (role !== "student" && role !== "parent")) {
                console.error("Layout Redirect Triggered. State:", { user: !!user, role, loading });
                setDebugState({ user: !!user, uid: user?.uid, role, loading });
                // router.push("/login");
            }
        }
    }, [user, role, loading, router, isLoginPage]);

    if (debugState) {
        return (
            <div className="p-10 bg-red-50 text-red-900 min-h-screen">
                <h1 className="text-2xl font-bold">Redirect Blocked for Debugging</h1>
                <pre className="p-4 bg-white mt-4 border rounded">{JSON.stringify(debugState, null, 2)}</pre>
            </div>
        );
    }

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
                { href: "/student/homework", label: "Homework", icon: ClipboardList },
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
        return <>{children}</>;
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
            <main className="flex-1 overflow-y-auto pt-20 pb-4 px-4 md:py-8 md:px-8 print:p-0 print:m-0 print:overflow-visible">
                <div className="max-w-7xl mx-auto print:max-w-none">
                    {children}
                </div>
            </main>
        </div>
    );
}
