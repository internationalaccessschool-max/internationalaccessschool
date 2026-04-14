"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X, ChevronDown } from "lucide-react";
import Image from "next/image";
import { NewsTicker } from "@/components/news-ticker";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { usePWAInstall } from "@/hooks/usePWAInstall";

export function Navbar() {
    const [scrolled, setScrolled] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [academicsOpen, setAcademicsOpen] = useState(false);
    const [academicLinks, setAcademicLinks] = useState<any[]>([]);

    const { isInstallable, install } = usePWAInstall();

    const pathname = usePathname();
    const router = useRouter();
    const isHome = pathname === "/";

    // Navigate to portal with ?install=true — the PWAInstallTrigger on that page handles the prompt
    const handlePortalInstall = (path: string) => {
        setMobileOpen(false);
        router.push(`${path}?install=true`);
    };

    // Fallback data if DB is empty
    const STATIC_ACADEMIC_LINKS = [
        { label: "Fee Structure", slug: "fee-structure" },
        { label: "Infrastructure", slug: "infrastructure" },
        { label: "Curriculum", slug: "curriculum" },
        { label: "Co-curricular Activities", slug: "co-curricular-activities" },
        { label: "SMC Member Details", slug: "smc-member-details" },
        { label: "Grievance Officer", slug: "grievance-officer" },
        { label: "Transport Facility", slug: "transport-facility" },
        { label: "Affiliation Information", slug: "affiliation-information" },
        { label: "Faculty Details", slug: "faculty-details" },
        { label: "Academic System", slug: "academic-system" },
        { label: "Admission Procedure", slug: "admission-procedure" },
        { label: "Rules & Regulation's", slug: "rules-regulations" },
        { label: "Student / Parents Corner", slug: "student-parents-corner" },
    ];

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 50);
        window.addEventListener("scroll", handleScroll);

        // Fetch Academic Links for Dropdown
        const unsub = onSnapshot(query(collection(db, "academic_info"), orderBy("createdAt", "asc")), (snap) => {
            if (!snap.empty) {
                setAcademicLinks(snap.docs.map(doc => ({
                    label: doc.data().label,
                    slug: doc.data().label.toLowerCase().replace(/[^a-z0-9]+/g, '-')
                })));
            } else {
                setAcademicLinks(STATIC_ACADEMIC_LINKS);
            }
        });

        return () => {
            window.removeEventListener("scroll", handleScroll);
            unsub();
        };
    }, []);

    // Close mobile menu on route change
    useEffect(() => { setMobileOpen(false); }, [pathname]);

    const headerBg = scrolled || !isHome
        ? "bg-white/80 backdrop-blur-xl shadow-sm border-b border-white/50"
        : "bg-gradient-to-b from-black/60 to-transparent";

    const textColor = scrolled || !isHome || mobileOpen
        ? "text-navy font-semibold"
        : "text-white font-medium";

    const logoColor = scrolled || !isHome || mobileOpen
        ? "text-navy"
        : "text-white";

    const navLinks = [
        { href: "/", label: "Home" },
        { href: "/about", label: "About" },
        // Academics is custom handled
        { href: "/admissions", label: "Admissions" },
        { href: "/career", label: "Career" },
        { href: "/gallery", label: "Gallery" },
        { href: "/tc", label: "View TC" },
        { href: "/contact", label: "Contact" },
    ];

    return (
        <>
            <header
                className={`fixed top-0 left-0 right-0 z-navbar transition-all duration-500 flex flex-col ${headerBg}`}
            >
                <NewsTicker />
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
                    <div className="flex items-center justify-between h-[80px]">
                        {/* Logo */}
                        <Link href="/" className="flex items-center gap-3 group">
                            <div className="relative w-12 h-12 rounded-full overflow-hidden bg-white shadow-md flex items-center justify-center p-1 group-hover:scale-105 transition-transform duration-300">
                                <div className="relative w-full h-full">
                                    <Image
                                        src="/LOGO.png"
                                        alt="IAS Logo"
                                        fill
                                        className="object-contain"
                                    />
                                </div>
                            </div>
                            <div className="flex flex-col">
                                <span className={`font-black text-xl leading-tight tracking-tight transition-colors duration-500 ${logoColor}`}>
                                    International Access
                                </span>
                                <span className={`text-[10px] uppercase tracking-[0.25em] font-bold transition-colors duration-500 ${scrolled || !isHome ? "text-gold" : "text-gold-light"}`}>
                                    School
                                </span>
                            </div>
                        </Link>

                        {/* Desktop Navigation */}
                        <nav className="hidden md:flex items-center gap-2">
                            {/* Home */}
                            <Link href="/" className={`relative px-3 py-2 text-sm transition-all duration-300 group ${textColor}`}>
                                <span>Home</span>
                                <span className={`absolute bottom-0 left-1/2 w-0 h-0.5 bg-gold transition-all duration-300 group-hover:w-full group-hover:left-0 ${pathname === '/' ? 'w-full left-0' : ''}`}></span>
                            </Link>

                            {/* About */}
                            <Link href="/about" className={`relative px-3 py-2 text-sm transition-all duration-300 group ${textColor}`}>
                                <span>About</span>
                                <span className={`absolute bottom-0 left-1/2 w-0 h-0.5 bg-gold transition-all duration-300 group-hover:w-full group-hover:left-0 ${pathname === '/about' ? 'w-full left-0' : ''}`}></span>
                            </Link>

                            {/* Academics Dropdown */}
                            <div
                                className="relative group"
                                onMouseEnter={() => setAcademicsOpen(true)}
                                onMouseLeave={() => setAcademicsOpen(false)}
                            >
                                <Link
                                    href="/academics"
                                    className={`relative px-3 py-2 text-sm transition-all duration-300 group flex items-center gap-1 ${textColor}`}
                                >
                                    <span>Academics</span> <ChevronDown className="w-4 h-4 opacity-70 group-hover:rotate-180 transition-transform duration-300" />
                                    <span className={`absolute bottom-0 left-1/2 w-0 h-0.5 bg-gold transition-all duration-300 group-hover:w-full group-hover:left-0 ${pathname === '/academics' ? 'w-full left-0' : ''}`}></span>
                                </Link>

                                {/* Dropdown Menu */}
                                <div className={`absolute left-0 mt-2 w-64 bg-white/95 backdrop-blur-xl rounded-2xl shadow-[0_20px_40px_-15px_rgba(15,27,61,0.1)] border border-gray-100 overflow-hidden text-navy py-3 transition-all duration-300 origin-top-left ${academicsOpen ? "opacity-100 scale-100 visible translate-y-0" : "opacity-0 scale-95 invisible -translate-y-2"}`}>
                                    {academicLinks.map((link) => (
                                        <Link
                                            key={link.slug}
                                            href={`/academics#${link.slug}`}
                                            className="block px-5 py-2.5 text-sm hover:bg-gold/10 hover:text-gold hover:pl-7 transition-all font-medium"
                                        >
                                            {link.label}
                                        </Link>
                                    ))}
                                    {academicLinks.length === 0 && (
                                        <span className="block px-5 py-2.5 text-xs text-gray-400">Loading...</span>
                                    )}
                                </div>
                            </div>

                            {/* Remaining Links */}
                            {navLinks.slice(2).map((link) => { // Skip Home, About, Academics
                                const isActive = pathname === link.href;
                                return (
                                    <Link
                                        key={link.href}
                                        href={link.href}
                                        className={`relative px-3 py-2 text-sm transition-all duration-300 group ${textColor}`}
                                    >
                                        <span>{link.label}</span>
                                        <span className={`absolute bottom-0 left-1/2 w-0 h-0.5 bg-gold transition-all duration-300 group-hover:w-full group-hover:left-0 ${isActive ? 'w-full left-0' : ''}`}></span>
                                    </Link>
                                );
                            })}
                        </nav>

                        {/* Login Button + Mobile Menu Toggle */}
                        <div className="flex items-center gap-3">
                            <Link
                                href="/login"
                                className={`hidden md:inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-bold transition-all duration-300 transform hover:scale-105
                                    ${scrolled || !isHome
                                        ? "bg-navy text-white hover:bg-gold hover:text-navy shadow-[0_4px_14px_rgba(15,27,61,0.3)]"
                                        : "bg-white text-navy hover:bg-gold hover:text-navy shadow-[0_4px_14px_rgba(255,255,255,0.3)]"
                                    }
                                `}
                            >
                                Login
                            </Link>
                            <button
                                onClick={() => setMobileOpen(!mobileOpen)}
                                className={`md:hidden p-2 rounded-lg transition-colors ${textColor}`}
                                aria-label="Toggle menu"
                            >
                                {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Mobile Menu Overlay */}
            {mobileOpen && (
                <div className="fixed inset-0 z-navbar md:hidden" onClick={() => setMobileOpen(false)}>
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
                </div>
            )}

            {/* Mobile Drawer */}
            <div
                className={`fixed top-0 right-0 bottom-0 z-modal w-[280px] bg-white shadow-2xl transform transition-transform duration-300 md:hidden
                    ${mobileOpen ? "translate-x-0" : "translate-x-full"}
                `}
            >
                <div className="flex items-center justify-between p-5 border-b border-gray-100">
                    <span className="font-bold text-navy text-lg">Menu</span>
                    <button onClick={() => setMobileOpen(false)} className="p-2 rounded-lg hover:bg-gray-50">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>
                <nav className="flex flex-col p-4 gap-1 h-[calc(100vh-80px)] overflow-y-auto">
                    <div className="mb-4 pb-4 border-b border-gray-100">
                        <Link
                            href="/login"
                            className="block w-full text-center px-5 py-3 rounded-xl bg-navy text-white font-semibold text-sm hover:bg-navy-light transition-colors"
                        >
                            Login
                        </Link>
                    </div>
                    <Link href="/" className="px-4 py-3 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">Home</Link>
                    <Link href="/about" className="px-4 py-3 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">About</Link>

                    {/* Mobile Academics Dropdown */}
                    <div className="px-4 py-2">
                        <div className="font-medium text-sm text-navy mb-2 flex items-center justify-between">
                            Academics <ChevronDown className="w-4 h-4" />
                        </div>
                        <div className="pl-4 border-l-2 border-gray-100 space-y-2">
                            <Link href="/academics" className="block text-sm text-gray-600 hover:text-navy">Overview</Link>
                            {academicLinks.map(link => (
                                <Link key={link.slug} href={`/academics#${link.slug}`} className="block text-sm text-gray-600 hover:text-navy">
                                    {link.label}
                                </Link>
                            ))}
                        </div>
                    </div>

                    <Link href="/admissions" className="px-4 py-3 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">Admissions</Link>
                    <Link href="/gallery" className="px-4 py-3 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">Gallery</Link>
                    <Link href="/tc" className="px-4 py-3 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">📄 View TC</Link>
                    <Link href="/contact" className="px-4 py-3 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">Contact</Link>
                    
                    <div className="mt-4 px-4 pb-4 border-t border-gray-100 pt-4">
                        <div className="font-bold text-navy text-sm mb-1">Install Portals</div>
                        <p className="text-xs text-gray-400 mb-3">Click to install the app for your role.</p>
                        <div className="grid grid-cols-1 gap-2">
                            <button onClick={() => handlePortalInstall("/student/login")}
                                className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-blue-50 text-blue-600 font-medium text-sm hover:bg-blue-100 transition-colors">
                                📲 Install Student App
                                <span className="text-xs bg-blue-100 px-2 py-0.5 rounded-full">App</span>
                            </button>
                            <button onClick={() => handlePortalInstall("/teacher/login")}
                                className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-emerald-50 text-emerald-600 font-medium text-sm hover:bg-emerald-100 transition-colors">
                                📲 Install Teacher App
                                <span className="text-xs bg-emerald-100 px-2 py-0.5 rounded-full">App</span>
                            </button>
                            <button onClick={() => handlePortalInstall("/admin/login")}
                                className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-red-50 text-red-600 font-medium text-sm hover:bg-red-100 transition-colors">
                                📲 Install Admin App
                                <span className="text-xs bg-red-100 px-2 py-0.5 rounded-full">App</span>
                            </button>
                            <button onClick={() => handlePortalInstall("/accountant/login")}
                                className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-amber-50 text-amber-600 font-medium text-sm hover:bg-amber-100 transition-colors">
                                📲 Install Finance App
                                <span className="text-xs bg-amber-100 px-2 py-0.5 rounded-full">App</span>
                            </button>
                            <button onClick={() => handlePortalInstall("/supervisor/login")}
                                className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-purple-50 text-purple-600 font-medium text-sm hover:bg-purple-100 transition-colors">
                                📲 Install Supervisor App
                                <span className="text-xs bg-purple-100 px-2 py-0.5 rounded-full">App</span>
                            </button>
                        </div>
                    </div>
                </nav>
            </div>
        </>
    );
}
