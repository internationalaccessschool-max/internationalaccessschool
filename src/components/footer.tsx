"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Facebook, Twitter, Instagram, Youtube, Mail, Phone, MapPin } from "lucide-react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

const quickLinks = [
    { href: "/about", label: "About Us" },
    { href: "/academics", label: "Academics" },
    { href: "/admissions", label: "Admissions" },
    { href: "/gallery", label: "Gallery" },
    { href: "/contact", label: "Contact" },
    { href: "/login", label: "Login Portal" },
];

export function Footer() {
    const [contact, setContact] = useState({
        email: "info@iaschool.edu",
        phone: "+91 98765 43210",
        address: "123 Education Lane, Knowledge City, India",
    });

    const [social, setSocial] = useState([
        { icon: Facebook, href: "https://facebook.com", label: "Facebook", key: "facebook" },
        { icon: Twitter, href: "https://twitter.com", label: "Twitter", key: "twitter" },
        { icon: Instagram, href: "https://instagram.com", label: "Instagram", key: "instagram" },
        { icon: Youtube, href: "https://youtube.com", label: "YouTube", key: "youtube" },
    ]);

    useEffect(() => {
        const unsub = onSnapshot(doc(db, "settings", "global"), (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                if (data.contact) {
                    setContact({
                        email: data.contact.email || "info@iaschool.edu",
                        phone: data.contact.phone || "+91 98765 43210",
                        address: data.contact.address || "123 Education Lane, Knowledge City, India",
                    });
                }
                if (data.social) {
                    setSocial([
                        { icon: Facebook, href: data.social.facebook || "https://facebook.com", label: "Facebook", key: "facebook" },
                        { icon: Twitter, href: data.social.twitter || "https://twitter.com", label: "Twitter", key: "twitter" },
                        { icon: Instagram, href: data.social.instagram || "https://instagram.com", label: "Instagram", key: "instagram" },
                        { icon: Youtube, href: data.social.youtube || "https://youtube.com", label: "YouTube", key: "youtube" },
                    ]);
                }
            }
        });
        return () => unsub();
    }, []);

    return (
        <footer className="bg-navy text-white">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Main Footer */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 py-16">
                    {/* Brand */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                                <span className="text-gold font-bold text-lg">IA</span>
                            </div>
                            <div>
                                <div className="font-bold text-lg leading-tight">International Access</div>
                                <div className="text-[11px] uppercase tracking-[0.2em] text-gold font-medium">School</div>
                            </div>
                        </div>
                        <p className="text-white/60 text-sm leading-relaxed">
                            Empowering students to become global leaders through academic excellence,
                            innovation, and holistic development since 2005.
                        </p>
                        <div className="flex gap-3 pt-2">
                            {social.map((s) => (
                                <a
                                    key={s.key}
                                    href={s.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-9 h-9 rounded-lg bg-white/8 hover:bg-gold/20 flex items-center justify-center transition-colors group"
                                    aria-label={s.label}
                                >
                                    <s.icon className="w-4 h-4 text-white/60 group-hover:text-gold transition-colors" />
                                </a>
                            ))}
                        </div>
                    </div>

                    {/* Quick Links */}
                    <div>
                        <h3 className="font-semibold text-sm uppercase tracking-wider text-white/80 mb-5">
                            Quick Links
                        </h3>
                        <ul className="space-y-3">
                            {quickLinks.map((link) => (
                                <li key={link.href}>
                                    <Link
                                        href={link.href}
                                        className="text-sm text-white/55 hover:text-gold transition-colors"
                                    >
                                        {link.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Contact */}
                    <div>
                        <h3 className="font-semibold text-sm uppercase tracking-wider text-white/80 mb-5">
                            Contact Us
                        </h3>
                        <ul className="space-y-4">
                            <li className="flex items-start gap-3">
                                <MapPin className="w-4 h-4 text-gold mt-0.5 shrink-0" />
                                <span className="text-sm text-white/55">
                                    {contact.address}
                                </span>
                            </li>
                            <li className="flex items-center gap-3">
                                <Phone className="w-4 h-4 text-gold shrink-0" />
                                <span className="text-sm text-white/55">{contact.phone}</span>
                            </li>
                            <li className="flex items-center gap-3">
                                <Mail className="w-4 h-4 text-gold shrink-0" />
                                <span className="text-sm text-white/55">{contact.email}</span>
                            </li>
                        </ul>
                    </div>

                    {/* Hours */}
                    <div>
                        <h3 className="font-semibold text-sm uppercase tracking-wider text-white/80 mb-5">
                            School Hours
                        </h3>
                        <ul className="space-y-3 text-sm text-white/55">
                            <li className="flex justify-between">
                                <span>Monday – Friday</span>
                                <span className="text-white/70">8:00 – 15:30</span>
                            </li>
                            <li className="flex justify-between">
                                <span>Saturday</span>
                                <span className="text-white/70">9:00 – 12:00</span>
                            </li>
                            <li className="flex justify-between">
                                <span>Sunday</span>
                                <span className="text-white/70">Closed</span>
                            </li>
                        </ul>
                        <div className="mt-5 pt-4 border-t border-white/10">
                            <p className="text-xs text-white/40">
                                Office hours: Mon-Fri, 8:00 AM – 4:00 PM
                            </p>
                        </div>
                    </div>
                </div>

                {/* Bottom Bar */}
                <div className="border-t border-white/10 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <p className="text-xs text-white/40">
                        © {new Date().getFullYear()} International Access School. All rights reserved.
                    </p>
                    <div className="flex gap-6">
                        <Link href="#" className="text-xs text-white/40 hover:text-white/60 transition-colors">
                            Privacy Policy
                        </Link>
                        <Link href="#" className="text-xs text-white/40 hover:text-white/60 transition-colors">
                            Terms of Service
                        </Link>
                    </div>
                </div>
            </div>
        </footer>
    );
}
