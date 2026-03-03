"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, ChevronDown } from "lucide-react";
import Image from "next/image";
import { NewsTicker } from "@/components/news-ticker";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

export function Navbar() {
    const [scrolled, setScrolled] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [academicsOpen, setAcademicsOpen] = useState(false);
    const [academicLinks, setAcademicLinks] = useState<any[]>([]);

    const pathname = usePathname();
    const isHome = pathname === "/";

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
        ? "bg-white/95 backdrop-blur-md shadow-sm border-b border-gray-100"
        : "bg-transparent";

    const textColor = scrolled || !isHome || mobileOpen
        ? "text-navy"
        : "text-white";

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
        { href: "/contact", label: "Contact" },
    ];

    return (
        <>
            <header
                className={`fixed top-0 left-0 right-0 z-navbar transition-all duration-300 flex flex-col ${headerBg}`}
            >
                <NewsTicker />
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
                    <div className="flex items-center justify-between h-[72px]">
                        {/* Logo */}
                        <Link href="/" className="flex items-center gap-3 group">
                            <div className="relative w-12 h-12 rounded-xl overflow-hidden">
                                <Image
                                    src="/LOGO.png"
                                    alt="IAS Logo"
                                    fill
                                    className="object-contain"
                                />
                            </div>
                            <div className="flex flex-col">
                                <span className={`font-bold text-lg leading-tight tracking-tight transition-colors ${logoColor}`}>
                                    International Access
                                </span>
                                <span className={`text-[11px] uppercase tracking-[0.2em] font-medium transition-colors ${scrolled || !isHome ? "text-gold" : "text-gold-light"}`}>
                                    School
                                </span>
                            </div>
                        </Link>

                        {/* Desktop Navigation */}
                        <nav className="hidden md:flex items-center gap-1">
                            {/* Home */}
                            <Link href="/" className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${pathname === '/' ? (scrolled || !isHome ? "text-navy bg-navy/5" : "text-white bg-white/15") : `${textColor} hover:${scrolled || !isHome ? "bg-gray-50" : "bg-white/10"}`}`}>
                                Home
                            </Link>

                            {/* About */}
                            <Link href="/about" className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${pathname === '/about' ? (scrolled || !isHome ? "text-navy bg-navy/5" : "text-white bg-white/15") : `${textColor} hover:${scrolled || !isHome ? "bg-gray-50" : "bg-white/10"}`}`}>
                                About
                            </Link>

                            {/* Academics Dropdown */}
                            <div
                                className="relative group"
                                onMouseEnter={() => setAcademicsOpen(true)}
                                onMouseLeave={() => setAcademicsOpen(false)}
                            >
                                <Link
                                    href="/academics"
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-1
                                        ${pathname === '/academics'
                                            ? (scrolled || !isHome ? "text-navy bg-navy/5" : "text-white bg-white/15")
                                            : `${textColor} hover:${scrolled || !isHome ? "bg-gray-50" : "bg-white/10"}`
                                        }`}
                                >
                                    Academics <ChevronDown className="w-4 h-4" />
                                </Link>

                                {/* Dropdown Menu */}
                                <div className={`absolute left-0 mt-0 w-64 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden text-navy py-2 transition-all duration-200 origin-top-left ${academicsOpen ? "opacity-100 scale-100 visible" : "opacity-0 scale-95 invisible"}`}>
                                    {academicLinks.map((link) => (
                                        <Link
                                            key={link.slug}
                                            href={`/academics#${link.slug}`}
                                            className="block px-4 py-2 text-sm hover:bg-gray-50 hover:text-gold transition-colors"
                                        >
                                            {link.label}
                                        </Link>
                                    ))}
                                    {academicLinks.length === 0 && (
                                        <span className="block px-4 py-2 text-xs text-gray-400">Loading...</span>
                                    )}
                                </div>
                            </div>

                            {/* Remaining Links */}
                            {navLinks.slice(2).map((link) => { // Skip Home, About, Academics (handled manually)
                                const isActive = pathname === link.href;
                                return (
                                    <Link
                                        key={link.href}
                                        href={link.href}
                                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
                                            ${isActive
                                                ? scrolled || !isHome
                                                    ? "text-navy bg-navy/5"
                                                    : "text-white bg-white/15"
                                                : `${textColor} hover:${scrolled || !isHome ? "bg-gray-50" : "bg-white/10"}`
                                            }
                                        `}
                                    >
                                        {link.label}
                                    </Link>
                                );
                            })}
                        </nav>

                        {/* Login Button + Mobile Menu Toggle */}
                        <div className="flex items-center gap-3">
                            <Link
                                href="/login"
                                className={`hidden md:inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200
                                    ${scrolled || !isHome
                                        ? "bg-navy text-white hover:bg-navy-light shadow-md hover:shadow-lg"
                                        : "bg-white text-navy hover:bg-white/90 shadow-md hover:shadow-lg"
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
                    <Link href="/contact" className="px-4 py-3 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">Contact</Link>
                </nav>
            </div>
        </>
    );
}
