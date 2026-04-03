"use client";

import { Sidebar } from "@/components/dashboard/sidebar";
import { MobileSidebar } from "@/components/dashboard/mobile-sidebar";
import { LayoutDashboard, CalendarCheck, FileText, ClipboardList, User, Settings, Loader2, Banknote, FileCheck, Bus } from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
    const { user, role, loading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const isLoginPage = pathname === "/student/login";

    useEffect(() => {
        if (!loading && !isLoginPage) {
            if (!user || (role !== "student" && role !== "parent")) {
                router.push("/student/login");
            }
        }
    }, [user, role, loading, router, isLoginPage]);

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
                { href: "/student/homework", label: "Homework", icon: ClipboardList },
                { href: "/student/fees", label: "My Fees", icon: Banknote },
                { href: "/student/fees/transport", label: "Transport Fees", icon: Bus },
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
