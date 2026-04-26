"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { usePathname } from "next/navigation";

export function FloatingApplyButton() {
    const pathname = usePathname();

    if (pathname !== "/") {
        return null;
    }

    return (
        <Link
            href="/admissions"
            className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-6 py-3 bg-gold text-navy font-bold rounded-full shadow-2xl hover:bg-gold-light hover:scale-105 hover:-translate-y-1 transition-all duration-300 group animate-bounce-slight"
            style={{ boxShadow: "0 10px 25px -5px rgba(212, 175, 55, 0.4), 0 8px 10px -6px rgba(212, 175, 55, 0.1)" }}
        >
            Apply Now
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
        </Link>
    );
}
