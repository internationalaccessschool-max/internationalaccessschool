"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { LogOut, ChevronRight, Menu, X } from "lucide-react";
import { NotificationBell } from "@/components/dashboard/notification-bell";
import { useNavScrollMemory } from "@/components/dashboard/use-nav-scroll-memory";
import { useRouter } from "next/navigation";

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

type SidebarLinks = NavItem[] | NavSection[];

interface MobileSidebarProps {
    title: string;
    links: SidebarLinks;
}

function isGrouped(links: SidebarLinks): links is NavSection[] {
    return links.length > 0 && "section" in links[0];
}

function NavLink({ link, isActive, onClick }: { link: NavItem; isActive: boolean; onClick: () => void }) {
    const Icon = link.icon;
    return (
        <Link
            href={link.href}
            onClick={onClick}
            data-active={isActive}
            className={cn(
                "relative flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200 group",
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
                    "h-5 w-5 transition-colors shrink-0",
                    isActive ? "text-gold" : "text-white/40"
                )} />
            )}
            <span className="flex-1 truncate text-base">{link.label}</span>
            {link.badge && !isActive && (
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0 shadow-[0_0_6px_rgba(239,68,68,0.8)]" />
            )}
            {isActive && <ChevronRight className="w-4 h-4 text-white/30 shrink-0" />}
        </Link>
    );
}

export function MobileSidebar({ title, links }: MobileSidebarProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [showNotificationBell, setShowNotificationBell] = useState(false);
    const pathname = usePathname();
    const router = useRouter();
    const { user } = useAuth();
    const { ref: navRef, onScroll: onNavScroll } = useNavScrollMemory(`sidebar-scroll:${title}`);

    // Close menu when route changes
    useEffect(() => {
        setIsOpen(false);
    }, [pathname]);

    // Prevent body scroll when menu is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
        return () => {
            document.body.style.overflow = "";
        };
    }, [isOpen]);

    useEffect(() => {
        const mediaQuery = window.matchMedia("(max-width: 767px)");
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
        <>
            {/* Mobile Header Bar */}
            <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-navy z-40 flex items-center justify-between px-4 shadow-sm border-b border-white/10">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gold/20 flex items-center justify-center shrink-0">
                        <span className="text-gold font-bold text-sm">IA</span>
                    </div>
                    <span className="text-white font-semibold flex-1 truncate">{title}</span>
                </div>
                <div className="flex items-center gap-1">
                    {showNotificationBell ? <NotificationBell theme="dark" /> : null}
                    <button
                        onClick={() => setIsOpen(true)}
                        className="p-2 -mr-2 text-white/80 hover:text-white focus:outline-none"
                        aria-label="Open menu"
                    >
                        <Menu className="w-6 h-6" />
                    </button>
                </div>
            </div>

            {/* Backdrop Overlay */}
            {isOpen && (
                <div
                    className="md:hidden fixed inset-0 bg-black/50 z-50 backdrop-blur-sm transition-opacity"
                    onClick={() => setIsOpen(false)}
                />
            )}

            {/* Sliding Drawer */}
            <div className={cn(
                "md:hidden fixed inset-y-0 right-0 w-[280px] bg-navy z-50 shadow-2xl transform transition-transform duration-300 ease-in-out flex flex-col",
                isOpen ? "translate-x-0" : "translate-x-full"
            )}>
                {/* Drawer Header */}
                <div className="flex h-16 items-center justify-between px-5 border-b border-white/10 shrink-0 bg-navy-light/50">
                    <span className="text-white font-semibold">{title}</span>
                    <button
                        onClick={() => setIsOpen(false)}
                        className="p-2 -mr-2 text-white/50 hover:text-white focus:outline-none"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Navigation Links */}
                <div
                    ref={navRef}
                    onScroll={onNavScroll}
                    className="flex-1 overflow-y-auto py-4 px-3"
                >
                    {grouped ? (
                        (links as NavSection[]).map((section) => (
                            <div key={section.section} className="mb-6">
                                <p className="px-4 mb-2 text-[11px] font-semibold uppercase tracking-widest text-white/30">
                                    {section.section}
                                </p>
                                <nav className="space-y-1">
                                    {section.items.map((link) => (
                                        <NavLink
                                            key={link.href}
                                            link={link}
                                            isActive={pathname === link.href}
                                            onClick={() => setIsOpen(false)}
                                        />
                                    ))}
                                </nav>
                            </div>
                        ))
                    ) : (
                        <nav className="space-y-1">
                            {(links as NavItem[]).map((link) => (
                                <NavLink
                                    key={link.href}
                                    link={link}
                                    isActive={pathname === link.href}
                                    onClick={() => setIsOpen(false)}
                                />
                            ))}
                        </nav>
                    )}
                </div>

                {/* Profile & Logout */}
                <div className="p-4 border-t border-white/10 space-y-3 shrink-0 bg-navy-light/30">
                    {user && (
                        <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/5">
                            <div className="w-10 h-10 rounded-lg bg-gold/20 flex items-center justify-center shrink-0">
                                <span className="text-gold text-lg font-bold">
                                    {(user.displayName || user.email || "U").charAt(0).toUpperCase()}
                                </span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-white truncate">
                                    {user.displayName || "User"}
                                </div>
                                <div className="text-[12px] text-white/40 truncate">
                                    {user.email}
                                </div>
                            </div>
                        </div>
                    )}
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium text-white/70 bg-red-500/10 hover:bg-red-500/20 hover:text-red-400 transition-colors"
                    >
                        <LogOut className="h-4 w-4" />
                        Sign Out
                    </button>
                </div>
            </div>
        </>
    );
}
