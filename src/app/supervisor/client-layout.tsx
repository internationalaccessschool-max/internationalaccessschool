"use client";

import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { useAuth } from "@/context/AuthContext";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
    LayoutDashboard, Users, GraduationCap, BookOpen, Briefcase,
    Megaphone, ImageIcon, UserCheck, ClipboardList, Settings,
    Sliders, School, CalendarCheck, Loader2, Award, Library, Layers,
    ChevronRight, LogOut,
} from "lucide-react";
import { MobileSidebar } from "@/components/dashboard/mobile-sidebar";
import { PWAInstallTrigger } from "@/components/PWAInstallTrigger";

// Master list — maps supervisor route → icon + label
const ALL_NAV = [
    { href: "/supervisor", label: "Dashboard", icon: LayoutDashboard, section: "Overview" },
    { href: "/supervisor/students", label: "Students", icon: GraduationCap, section: "Management" },
    { href: "/supervisor/teachers", label: "Teachers", icon: Users, section: "Management" },
    { href: "/supervisor/class-teacher", label: "Class Teachers", icon: School, section: "Management" },
    { href: "/supervisor/classes", label: "Classes", icon: ClipboardList, section: "Management" },
    { href: "/supervisor/attendance", label: "Attendance", icon: CalendarCheck, section: "Management" },
    { href: "/supervisor/applications", label: "Applications", icon: Briefcase, section: "Management" },
    { href: "/supervisor/admissions", label: "Admissions", icon: UserCheck, section: "Management" },
    { href: "/supervisor/hero", label: "Hero Slider", icon: Sliders, section: "Content" },
    { href: "/supervisor/academics", label: "Academics", icon: BookOpen, section: "Content" },
    { href: "/supervisor/homework", label: "Homework", icon: ClipboardList, section: "Content" },
    { href: "/supervisor/notices", label: "Notices", icon: Megaphone, section: "Content" },
    { href: "/supervisor/gallery", label: "Gallery", icon: ImageIcon, section: "Content" },
    { href: "/supervisor/fees", label: "Fee Overview", icon: Library, section: "Finance" },
    { href: "/supervisor/transport", label: "Transport", icon: Settings, section: "Finance" },
    { href: "/supervisor/exams", label: "Exams", icon: Award, section: "Examinations" },
    { href: "/supervisor/class-subjects", label: "Class Subjects", icon: Layers, section: "Examinations" },
    { href: "/supervisor/results/entry", label: "Marks Entry", icon: ClipboardList, section: "Examinations" },
];

export default function SupervisorLayout({ children }: { children: React.ReactNode }) {
    const { user, role, loading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const isLoginPage = pathname === "/supervisor/login";

    const [allowedPages, setAllowedPages] = useState<string[]>([]);
    const [loadingPerms, setLoadingPerms] = useState(true);

    // Fetch allowed pages for this supervisor
    useEffect(() => {
        if (!user || role !== "supervisor") return;
        const fetchPerms = async () => {
            try {
                const supDoc = await getDoc(doc(db, "supervisors", user.uid));
                if (supDoc.exists()) {
                    setAllowedPages(supDoc.data().allowedPages || ["/supervisor"]);
                } else {
                    setAllowedPages(["/supervisor"]);
                }
            } catch {
                setAllowedPages(["/supervisor"]);
            } finally {
                setLoadingPerms(false);
            }
        };
        fetchPerms();
    }, [user, role]);

    // Redirect if not supervisor
    useEffect(() => {
        if (!loading && !isLoginPage) {
            if (!user || role !== "supervisor") {
                router.push("/supervisor/login");
            }
        }
    }, [user, role, loading, router, isLoginPage]);

    // Redirect if supervisor tries to access a page not in their allowed list
    useEffect(() => {
        if (!loadingPerms && !isLoginPage && allowedPages.length > 0) {
            if (!allowedPages.includes(pathname)) {
                router.push("/supervisor");
            }
        }
    }, [allowedPages, pathname, loadingPerms, isLoginPage, router]);

    const handleLogout = async () => {
        await signOut(auth);
        document.cookie = "auth=; path=/; max-age=0";
        document.cookie = "role=; path=/; max-age=0";
        document.cookie = "email=; path=/; max-age=0";
        router.push("/login");
    };

    if (isLoginPage) {
        return (
            <>
                {children}
                <PWAInstallTrigger appName="Supervisor Portal" themeColor="#8b5cf6" icon="💼" />
            </>
        );
    }

    if (loading || loadingPerms || !user || role !== "supervisor") {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-gray-50">
                <Loader2 className="w-8 h-8 animate-spin text-navy" />
            </div>
        );
    }

    // Build sidebar — only allowed pages, grouped by section
    const sections = ["Overview", "Management", "Finance", "Content", "Examinations"];
    const filteredNav = ALL_NAV.filter(item => allowedPages.includes(item.href));
    const groupedNav = sections
        .map(section => ({
            section,
            items: filteredNav.filter(item => item.section === section),
        }))
        .filter(g => g.items.length > 0);

    return (
        <div className="flex h-screen bg-off-white overflow-hidden">
            {/* Sidebar */}
            <aside className="hidden md:flex w-[260px] shrink-0 h-screen flex-col bg-navy shadow-xl">
                {/* Logo */}
                <div className="flex h-16 items-center gap-3 px-5 border-b border-white/10 shrink-0">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
                        <span className="text-emerald-400 font-bold text-sm">SV</span>
                    </div>
                    <div className="min-w-0">
                        <span className="text-white font-semibold text-sm truncate block">Supervisor</span>
                        <span className="text-white/30 text-[10px]">International Access School</span>
                    </div>
                </div>

                {/* Navigation */}
                <div className="flex-1 overflow-y-auto py-4 px-3">
                    {groupedNav.map(({ section, items }) => (
                        <div key={section} className="mb-4">
                            <p className="px-4 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/25">{section}</p>
                            <nav className="space-y-0.5">
                                {items.map(item => {
                                    const Icon = item.icon;
                                    const isActive = pathname === item.href;
                                    return (
                                        <Link key={item.href} href={item.href}
                                            className={cn(
                                                "relative flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200 group",
                                                isActive
                                                    ? "bg-white/10 text-white shadow-sm"
                                                    : "text-white/50 hover:text-white/80 hover:bg-white/5"
                                            )}>
                                            {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-full bg-emerald-400" />}
                                            <Icon className={cn("h-4 w-4 shrink-0 transition-colors", isActive ? "text-emerald-400" : "text-white/40 group-hover:text-white/60")} />
                                            <span className="flex-1 truncate">{item.label}</span>
                                            {isActive && <ChevronRight className="w-3.5 h-3.5 text-white/30 shrink-0" />}
                                        </Link>
                                    );
                                })}
                            </nav>
                        </div>
                    ))}
                </div>

                {/* Profile & Logout */}
                <div className="p-4 border-t border-white/10 space-y-2 shrink-0">
                    <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/5">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
                            <span className="text-emerald-400 text-xs font-bold">
                                {(user.displayName || user.email || "S").charAt(0).toUpperCase()}
                            </span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-white truncate">{user.displayName || "Supervisor"}</div>
                            <div className="text-[11px] text-white/40 truncate">{user.email}</div>
                        </div>
                    </div>
                    <button onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-white/50 hover:text-white hover:bg-white/5 transition-colors">
                        <LogOut className="h-4 w-4" />
                        Sign Out
                    </button>
                </div>
            </aside>

            {/* Mobile Header Box */}
            <MobileSidebar title="Supervisor Console" links={groupedNav} />

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto pt-20 pb-4 px-4 md:py-8 md:px-8">
                <div className="max-w-7xl mx-auto">
                    {children}
                </div>
            </main>
            <PWAInstallTrigger appName="Supervisor Portal" themeColor="#8b5cf6" icon="💼" />
        </div>
    );
}
