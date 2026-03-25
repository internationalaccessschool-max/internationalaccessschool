"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";
import Link from "next/link";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface HeroSlide {
    id: string;
    imageUrl: string;
    title: string;
    subtitle: string;
    cta?: string;
    ctaLink?: string;
}

// Fallback slides shown if Firestore is empty or loading
const FALLBACK_SLIDES: HeroSlide[] = [
    {
        id: "f1",
        imageUrl: "https://images.unsplash.com/photo-1523050854058-8df90110c9f1?q=80&w=2070&auto=format&fit=crop",
        title: "Shaping Leaders of Tomorrow",
        subtitle: "Experience world-class education rooted in innovation, excellence, and holistic development.",
        cta: "Apply Now",
        ctaLink: "/admissions",
    },
    {
        id: "f2",
        imageUrl: "https://images.unsplash.com/photo-1544531586-fde5298cdd40?q=80&w=2070&auto=format&fit=crop",
        title: "Global Curriculum & Excellence",
        subtitle: "Preparing students for top universities worldwide with our internationally recognized programs.",
        cta: "Explore Academics",
        ctaLink: "/academics",
    },
    {
        id: "f3",
        imageUrl: "https://images.unsplash.com/photo-1509062522246-3755977927d7?q=80&w=2132&auto=format&fit=crop",
        title: "State-of-the-Art Facilities",
        subtitle: "From modern labs to expansive sports grounds, providing the best environment for growth.",
        cta: "Virtual Tour",
        ctaLink: "/contact",
    },
];

export function HeroSlider() {
    const [slides, setSlides] = useState<HeroSlide[]>(FALLBACK_SLIDES);
    const [current, setCurrent] = useState(0);

    // Fetch slides from Firestore; fall back to static data
    useEffect(() => {
        const q = query(collection(db, "hero-slides"), orderBy("order", "asc"));
        const unsub = onSnapshot(q, (snap) => {
            const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() } as HeroSlide));
            setSlides(fetched.length > 0 ? fetched : FALLBACK_SLIDES);
        }, () => {
            // On error, use fallback
            setSlides(FALLBACK_SLIDES);
        });
        return () => unsub();
    }, []);

    // Reset current index if slides change and it's out of bounds
    useEffect(() => {
        if (slides.length && current >= slides.length) {
            setCurrent(0);
        }
    }, [slides, current]);

    // Auto-advance
    useEffect(() => {
        if (slides.length <= 1) return;
        const timer = setInterval(() => {
            setCurrent((prev) => (prev + 1) % slides.length);
        }, 6000);
        return () => clearInterval(timer);
    }, [slides]);

    const nextSlide = () => setCurrent((prev) => (prev + 1) % slides.length);
    const prevSlide = () => setCurrent((prev) => (prev - 1 + slides.length) % slides.length);

    if (slides.length === 0) return null; // Should never hit this given fallback, but just in case
    const slide = slides[current];

    return (
        <section className="relative w-full aspect-video md:h-[100dvh] md:min-h-[600px] md:aspect-auto overflow-hidden bg-navy group">
            <AnimatePresence mode="wait">
                <motion.div
                    key={current}
                    initial={{ opacity: 0, scale: 1.08 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.9 }}
                    className="absolute inset-0"
                >
                    {/* Background Image */}
                    <Image
                        src={slide.imageUrl}
                        alt="Hero Background"
                        fill
                        priority={current === 0}
                        className="object-cover object-center"
                    />
                    {/* Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/50 to-black/70 pointer-events-none" />
                </motion.div>
            </AnimatePresence>

            {/* Text Content */}
            <div className="relative z-10 h-full flex items-center justify-center text-center px-4 sm:px-6 lg:px-8 mt-4 md:mt-0">
                <div className="max-w-4xl w-full">
                    <motion.div
                        key={`text-${current}`}
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ duration: 0.8, delay: 0.1 }}
                        className="flex flex-col items-center justify-center w-full"
                    >
                        {/* Pill Badge matching the ref layout */}
                         <div className="inline-block px-3 py-1 md:px-4 md:py-1.5 rounded-full bg-white/20 backdrop-blur-md border border-white/30 text-white text-[9px] sm:text-xs font-bold tracking-[0.15em] uppercase mb-1.5 md:mb-4">
                            Welcome to IAS
                        </div>

                        <h1 className="text-xl sm:text-4xl md:text-7xl font-extrabold text-white mb-1.5 md:mb-4 leading-tight drop-shadow-lg max-w-[90%] md:max-w-full">
                            {slide.title}
                        </h1>
                        <p className="text-[10px] sm:text-sm md:text-xl text-gray-200 mb-4 md:mb-8 font-light max-w-2xl px-2 leading-snug hidden sm:block">
                            {slide.subtitle}
                        </p>

                        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 w-full max-w-[200px] sm:max-w-none mt-1 md:mt-4">
                            <Link
                                href={slide.ctaLink || "/admissions"}
                                className="w-full sm:w-auto inline-flex justify-center items-center px-5 py-2 md:px-8 md:py-4 bg-gold text-navy font-bold rounded-full hover:bg-gold-light transition-all transform hover:scale-105 shadow-lg text-[11px] md:text-base"
                            >
                                {slide.cta || "Learn More"}
                            </Link>
                            <Link
                                href="/contact"
                                className="w-full sm:w-auto inline-flex justify-center items-center px-5 py-2 md:px-8 md:py-4 bg-transparent border-2 border-white/90 text-white font-bold rounded-full hover:bg-white/10 transition-all shadow-lg text-[11px] md:text-base"
                            >
                                Contact Us
                            </Link>
                        </div>
                    </motion.div>
                </div>
            </div>

            {/* Navigation Arrows (only show if > 1 slide) */}
            {slides.length > 1 && (
                <>
                    <button
                        onClick={prevSlide}
                        className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm transition-colors z-20"
                    >
                        <ChevronLeft className="w-8 h-8" />
                    </button>
                    <button
                        onClick={nextSlide}
                        className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm transition-colors z-20"
                    >
                        <ChevronRight className="w-8 h-8" />
                    </button>

                    {/* Dots at bottom */}
                    <div className="absolute bottom-4 md:bottom-8 left-1/2 -translate-x-1/2 flex gap-1.5 md:gap-3 z-20">
                        {slides.map((_, idx) => (
                            <button
                                key={idx}
                                onClick={() => setCurrent(idx)}
                                className={`h-1.5 md:h-3 rounded-full transition-all ${idx === current 
                                    ? "bg-gold w-4 md:w-8" 
                                    : "bg-white/50 hover:bg-white w-1.5 md:w-3"
                                    }`}
                            />
                        ))}
                    </div>
                </>
            )}
        </section>
    );
}
