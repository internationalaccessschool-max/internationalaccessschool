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
        <section className="relative min-h-[500px] h-[100dvh] w-full overflow-hidden bg-navy">
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
            <div className="relative z-10 h-full flex items-center justify-center text-center px-4 sm:px-6 lg:px-8">
                <div className="max-w-4xl space-y-6">
                    <motion.div
                        key={`text-${current}`}
                        initial={{ y: 30, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ duration: 0.8, delay: 0.2 }}
                    >
                        <h1 className="text-5xl md:text-7xl font-bold text-white mb-4 leading-tight">
                            {slide.title}
                        </h1>
                        <p className="text-xl md:text-2xl text-[clamp(1rem,4vw,1.5rem)] text-gray-200 mb-6 lg:mb-8 max-w-2xl mx-auto px-4">
                            {slide.subtitle}
                        </p>
                        <Link
                            href={slide.ctaLink || "/admissions"}
                            className="inline-flex items-center gap-2 px-8 py-4 bg-gold text-navy font-bold rounded-full hover:bg-gold-light transition-all transform hover:scale-105 shadow-lg group"
                        >
                            {slide.cta || "Apply Now"}
                            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </Link>
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

                    {/* Dots */}
                    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-3 z-20">
                        {slides.map((_, idx) => (
                            <button
                                key={idx}
                                onClick={() => setCurrent(idx)}
                                className={`h-3 rounded-full transition-all ${idx === current ? "bg-gold w-8" : "bg-white/50 hover:bg-white w-3"
                                    }`}
                            />
                        ))}
                    </div>
                </>
            )}
        </section>
    );
}
