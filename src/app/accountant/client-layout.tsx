"use client";

import { Sidebar } from "@/components/dashboard/sidebar";
import { MobileSidebar } from "@/components/dashboard/mobile-sidebar";
import {
    LayoutDashboard, Banknote, Settings2, ClipboardList, PlusCircle, Loader2, Bus, CreditCard, CalendarClock
} from "lucide-react";
import { PWAInstallTrigger } from "@/components/PWAInstallTrigger";
import { useAuth } from "@/context/AuthContext";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";

export default function AccountantLayout({ children }: { children: React.ReactNode }) {
    const { user, role, loading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const isLoginPage = pathname === "/accountant/login";

    useEffect(() => {
        if (!loading && !isLoginPage) {
            if (!user || role !== "accountant") {
                router.push("/accountant/login");
            }
        }
    }, [user, role, loading, router, isLoginPage]);

    const links = [
        {
            section: "Overview",
            items: [
                { href: "/accountant", label: "Dashboard", icon: LayoutDashboard },
            ],
        },
        {
            section: "Fee Management",
            items: [
                { href: "/accountant/fees", label: "Manage Fees", icon: Banknote },
                { href: "/accountant/advance-fee", label: "Advance Fee Payment", icon: CreditCard },
                { href: "/accountant/fees/annual", label: "Annual Fees (Session)", icon: CalendarClock },
                { href: "/accountant/fees/structure", label: "Fee Structure", icon: Settings2 },
                { href: "/accountant/fees/generate", label: "Generate Monthly Fees", icon: PlusCircle },
                { href: "/accountant/transport", label: "Transport Management", icon: Bus },
            ],
        },
    ];

    if (isLoginPage) {
        return (
            <>
                {children}
                <PWAInstallTrigger appName="Finance Portal" themeColor="#f59e0b" icon="💰" />
            </>
        );
    }

    if (loading || !user || role !== "accountant") {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-gray-50">
                <Loader2 className="w-8 h-8 animate-spin text-navy" />
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-off-white overflow-hidden">
            <aside className="hidden md:block shrink-0">
                <Sidebar title="Finance Portal" links={links} />
            </aside>
            <MobileSidebar title="Finance Portal" links={links} />
            <main className="flex-1 overflow-y-auto pt-20 pb-4 px-4 md:py-8 md:px-8">
                <div className="max-w-7xl mx-auto">
                    {children}
                </div>
            </main>
            <PWAInstallTrigger appName="Finance Portal" themeColor="#f59e0b" icon="💰" />
        </div>
    );
}
