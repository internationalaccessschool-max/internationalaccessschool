"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { LogOut, ChevronRight } from "lucide-react";
import { NotificationBell } from "@/components/dashboard/notification-bell";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface NavItem {
    href: string;
    label: string;
    icon?: React.ComponentType<{ className?: string }>;
    badge?: boolean;
}

interface NavSection {
    section: string;
    items: NavItem[];
}

// Accept either flat links array or grouped sections
type SidebarLinks = NavItem[] | NavSection[];

interface SidebarProps {
    title: string;
    links: SidebarLinks;
}

function isGrouped(links: SidebarLinks): links is NavSection[] {
    return links.length > 0 && "section" in links[0];
}

function NavLink({ link, isActive }: { link: NavItem; isActive: boolean }) {
    const Icon = link.icon;
    return (
        <Link
            href={link.href}
            className={cn(
                "relative flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200 group",
                isActive
                    ? "bg-white/10 text-white shadow-sm"
                    : "text-white/50 hover:text-white/80 hover:bg-white/5"
            )}
        >
            {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-full bg-gold" />
            )}
            {Icon && (
                <Icon className={cn(
                    "h-4 w-4 transition-colors shrink-0",
                    isActive ? "text-gold" : "text-white/40 group-hover:text-white/60"
                )} />
            )}
            <span className="flex-1 truncate">{link.label}</span>
            {link.badge && !isActive && (
                <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 shadow-[0_0_6px_rgba(239,68,68,0.8)]" />
            )}
            {isActive && <ChevronRight className="w-3.5 h-3.5 text-white/30 shrink-0" />}
        </Link>
    );
}

export function Sidebar({ title, links }: SidebarProps) {
    const pathname = usePathname();
    const router = useRouter();
    const { user } = useAuth();
    const [showNotificationBell, setShowNotificationBell] = useState(false);

    useEffect(() => {
        const mediaQuery = window.matchMedia("(min-width: 768px)");
        const updateMatch = () => setShowNotificationBell(mediaQuery.matches);

        updateMatch();
        mediaQuery.addEventListener("change", updateMatch);
        return () => mediaQuery.removeEventListener("change", updateMatch);
    }, []);

    const handleLogout = async () => {
        await signOut(auth);
        document.cookie = "auth=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT";
        document.cookie = "role=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT";
        
        let loginPath = "/login";
        if (pathname.startsWith("/student")) loginPath = "/student/login";
        else if (pathname.startsWith("/teacher")) loginPath = "/teacher/login";
        else if (pathname.startsWith("/admin")) loginPath = "/admin/login";
        else if (pathname.startsWith("/accountant")) loginPath = "/accountant/login";
        else if (pathname.startsWith("/supervisor")) loginPath = "/supervisor/login";
        
        router.push(loginPath);
    };

    const grouped = isGrouped(links);

    return (
        <div className="flex h-screen w-full flex-col bg-navy md:w-[260px] shadow-xl">
            {/* Logo */}
            <div className="flex h-16 items-center gap-3 px-5 border-b border-white/10 shrink-0">
                <div className="w-8 h-8 rounded-lg bg-gold/20 flex items-center justify-center shrink-0">
                    <span className="text-gold font-bold text-sm">IA</span>
                </div>
                <div className="min-w-0">
                    <span className="text-white font-semibold text-sm truncate block">{title}</span>
                    <span className="text-white/30 text-[10px]">International Access School</span>
                </div>
            </div>

            {/* Navigation */}
            <div className="flex-1 overflow-y-auto py-4 px-3">
                {grouped ? (
                    (links as NavSection[]).map((section) => (
                        <div key={section.section} className="mb-4">
                            <p className="px-4 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/25">
                                {section.section}
                            </p>
                            <nav className="space-y-0.5">
                                {section.items.map((link) => (
                                    <NavLink
                                        key={link.href}
                                        link={link}
                                        isActive={pathname === link.href}
                                    />
                                ))}
                            </nav>
                        </div>
                    ))
                ) : (
                    <nav className="space-y-0.5">
                        {(links as NavItem[]).map((link) => (
                            <NavLink
                                key={link.href}
                                link={link}
                                isActive={pathname === link.href}
                            />
                        ))}
                    </nav>
                )}
            </div>

            {/* Profile & Logout */}
            <div className="p-4 border-t border-white/10 space-y-2 shrink-0">
                <div className="flex justify-between items-center px-1 mb-2">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">Account</span>
                    {showNotificationBell ? <NotificationBell theme="dark" /> : null}
                </div>
                {user && (
                    <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/5">
                        <div className="w-8 h-8 rounded-lg bg-gold/20 flex items-center justify-center shrink-0">
                            <span className="text-gold text-xs font-bold">
                                {(user.displayName || user.email || "U").charAt(0).toUpperCase()}
                            </span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-white truncate">
                                {user.displayName || "User"}
                            </div>
                            <div className="text-[11px] text-white/40 truncate">
                                {user.email}
                            </div>
                        </div>
                    </div>
                )}
                <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-white/50 hover:text-white hover:bg-white/5 transition-colors"
                >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                </button>
            </div>
        </div>
    );
}
