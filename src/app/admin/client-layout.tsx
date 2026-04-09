"use client";

import { Sidebar } from "@/components/dashboard/sidebar";
import { MobileSidebar } from "@/components/dashboard/mobile-sidebar";
import {
    LayoutDashboard, Users, GraduationCap, BookOpen, Briefcase,
    Megaphone, ImageIcon, UserCheck, ClipboardList, Settings, Sliders, School, CalendarCheck, Loader2, Award, Layers, ShieldCheck, BarChart3, Banknote, UserCheck2, Tags, Bus, UserCog, CreditCard, CalendarDays, FileText, BadgeCheck
} from "lucide-react";
import { PWAInstallTrigger } from "@/components/PWAInstallTrigger";
import { useAuth } from "@/context/AuthContext";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const { user, role, loading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const isLoginPage = pathname === "/admin/login";

    useEffect(() => {
        if (!loading && !isLoginPage) {
            if (!user || role !== "admin") {
                router.push("/admin/login");
            }
        }
    }, [user, role, loading, router, isLoginPage]);

    const links = [
        {
            section: "Overview",
            items: [
                { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
            ],
        },
        {
            section: "Management",
            items: [
                { href: "/admin/students", label: "Students", icon: GraduationCap },
                { href: "/admin/teachers", label: "Teachers", icon: Users },
                { href: "/admin/subjects", label: "Manage Subjects", icon: Tags },
                { href: "/admin/class-teacher", label: "Class Teachers", icon: School },
                { href: "/admin/classes", label: "Classes", icon: ClipboardList },
                { href: "/admin/attendance", label: "Attendance", icon: CalendarCheck },
                { href: "/admin/applications", label: "Applications", icon: Briefcase },
                { href: "/admin/admissions", label: "Admissions", icon: UserCheck },
            ],
        },
        {
            section: "Content",
            items: [
                { href: "/admin/hero", label: "Hero Slider", icon: Sliders },
                { href: "/admin/academics", label: "Academics", icon: BookOpen },
                { href: "/admin/homework", label: "Homework", icon: ClipboardList },
                { href: "/admin/notices", label: "Notices", icon: Megaphone },
                { href: "/admin/gallery", label: "Gallery", icon: ImageIcon },
            ],
        },
        {
            section: "Examinations",
            items: [
                { href: "/admin/exams", label: "Exams", icon: Award },
                { href: "/admin/class-subjects", label: "Class Subjects", icon: Layers },
                { href: "/admin/results/entry", label: "Marks Entry", icon: ClipboardList },
            ],
        },
        {
            section: "Finance",
            items: [
                { href: "/admin/fees", label: "Fee Overview", icon: BarChart3 },
                { href: "/admin/finance", label: "Fee Dashboard", icon: Banknote },
                { href: "/admin/finance/fees", label: "Manage Fees", icon: ClipboardList },
                { href: "/admin/finance/advance-fee", label: "Advance Fee Payment", icon: CreditCard },
                { href: "/admin/finance/fees/annual", label: "Annual Fees (Session)", icon: CalendarDays },
                { href: "/admin/finance/fees/structure", label: "Fee Structure", icon: Settings },
                { href: "/admin/finance/fees/generate", label: "Generate Monthly", icon: UserCheck2 },
                { href: "/admin/transport", label: "Transport", icon: Bus },
            ],
        },
        {
            section: "Certificates",
            items: [
                { href: "/admin/certificates/tc", label: "Transfer Certificate", icon: FileText },
                { href: "/admin/certificates/character", label: "Character Certificate", icon: BadgeCheck },
            ],
        },
        {
            section: "System",
            items: [
                { href: "/admin/manage-admins", label: "Manage Admins", icon: UserCog },
                { href: "/admin/supervisors", label: "Supervisors", icon: ShieldCheck },
                { href: "/admin/accountants", label: "Accountants", icon: Banknote },
                { href: "/admin/settings", label: "Settings", icon: Settings },
            ],
        },
    ];

    if (isLoginPage) {
        return (
            <>
                {children}
                <PWAInstallTrigger appName="Admin Console" themeColor="#ef4444" icon="🛡️" />
            </>
        );
    }

    if (loading || !user || role !== "admin") {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-gray-50">
                <Loader2 className="w-8 h-8 animate-spin text-navy" />
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-off-white overflow-hidden">
            <aside className="hidden md:block shrink-0">
                <Sidebar title="Admin Console" links={links} />
            </aside>
            <MobileSidebar title="Admin Console" links={links} />
            <main className="flex-1 overflow-y-auto pt-20 pb-4 px-4 md:py-8 md:px-8">
                <div className="max-w-7xl mx-auto">
                    {children}
                </div>
            </main>
            <PWAInstallTrigger appName="Admin Console" themeColor="#ef4444" icon="🛡️" />
        </div>
    );
}
