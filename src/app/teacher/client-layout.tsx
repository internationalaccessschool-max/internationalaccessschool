"use client";

import { Sidebar } from "@/components/dashboard/sidebar";
import { MobileSidebar } from "@/components/dashboard/mobile-sidebar";
import {
    LayoutDashboard, Users, CheckSquare, GraduationCap,
    BookOpen, User, Settings, Loader2, Clock
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
    const { user, role, loading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const isLoginPage = pathname === "/teacher/login";

    useEffect(() => {
        if (!loading && !isLoginPage) {
            if (!user || role !== "teacher") {
                router.push("/teacher/login");
            }
        }
    }, [user, role, loading, router, isLoginPage]);

    const links = [
        {
            section: "Overview",
            items: [
                { href: "/teacher", label: "Dashboard", icon: LayoutDashboard },
            ],
        },
        {
            section: "Teaching",
            items: [
                { href: "/teacher/classes", label: "My Classes", icon: Users },
                { href: "/teacher/attendance", label: "Attendance", icon: CheckSquare },
                { href: "/teacher/marks", label: "Marks", icon: GraduationCap },
                { href: "/teacher/homework", label: "Homework", icon: BookOpen },
                { href: "/teacher/timetable", label: "My Timetable", icon: Clock },
            ],
        },
        {
            section: "Account",
            items: [
                { href: "/teacher/profile", label: "Profile", icon: User },
                { href: "/teacher/settings", label: "Settings", icon: Settings },
            ],
        },
    ];

    if (isLoginPage) {
        return <>{children}</>;
    }

    if (loading || !user || role !== "teacher") {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-gray-50">
                <Loader2 className="w-8 h-8 animate-spin text-navy" />
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-off-white overflow-hidden">
            <aside className="hidden md:block shrink-0">
                <Sidebar title="Teacher Portal" links={links} />
            </aside>
            <MobileSidebar title="Teacher Portal" links={links} />
            <main className="flex-1 overflow-y-auto pt-20 pb-4 px-4 md:py-8 md:px-8">
                <div className="max-w-7xl mx-auto">
                    {children}
                </div>
            </main>
        </div>
    );
}
