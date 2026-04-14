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
        <section className="relative min-h-[500px] h-[75dvh] md:min-h-[700px] md:h-[100dvh] w-full overflow-hidden bg-navy">
            <AnimatePresence mode="wait">
                <motion.div
                    key={current}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute inset-0"
                >
                    {/* Background Image with slow zoom effect */}
                    <motion.div 
                        initial={{ scale: 1.1 }}
                        animate={{ scale: 1 }}
                        transition={{ duration: 6, ease: "easeOut" }}
                        className="w-full h-full relative"
                    >
                        <Image
                            src={slide.imageUrl}
                            alt={slide.title}
                            fill
                            priority={true}
                            fetchPriority={current === 0 ? "high" : "auto"}
                            sizes="100vw"
                            className="object-cover object-center"
                            quality={90}
                        />
                    </motion.div>
                    {/* Premium Overlays for depth and readability */}
                    <div className="absolute inset-0 bg-navy/30 pointer-events-none mix-blend-multiply" />
                    <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/40 to-black/20 pointer-events-none" />
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-transparent via-transparent to-black/40 pointer-events-none" />
                </motion.div>
            </AnimatePresence>

            {/* Text Content */}
            <div className="relative z-10 h-full flex items-center justify-center text-center px-4 sm:px-6 lg:px-8 pb-16 md:pb-24">
                <div className="max-w-5xl space-y-6">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={`text-${current}`}
                            initial={{ y: 40, opacity: 0, filter: "blur(10px)" }}
                            animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
                            exit={{ y: -40, opacity: 0, filter: "blur(10px)" }}
                            transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                            className="flex flex-col items-center"
                        >
                            <span className="text-gold uppercase tracking-[0.3em] text-xs md:text-sm font-bold mb-4 block">Welcome to Excellence</span>
                            <h1 className="text-5xl md:text-6xl lg:text-8xl font-black text-white mb-6 leading-[1.1] drop-shadow-2xl">
                                {slide.title}
                            </h1>
                            <p className="text-lg md:text-2xl text-gray-200 mb-10 max-w-3xl mx-auto px-4 font-medium drop-shadow-md">
                                {slide.subtitle}
                            </p>
                            <Link
                                href={slide.ctaLink || "/admissions"}
                                className="relative overflow-hidden inline-flex items-center gap-3 px-8 py-4 bg-gold text-navy font-bold rounded-full transition-all transform hover:scale-105 shadow-[0_0_40px_rgba(200,169,81,0.3)] hover:shadow-[0_0_60px_rgba(200,169,81,0.5)] group"
                            >
                                <span className="relative z-10">{slide.cta || "Apply Now"}</span>
                                <ArrowRight className="w-5 h-5 group-hover:translate-x-2 transition-transform relative z-10" />
                                <div className="absolute inset-0 h-full w-full bg-white/20 scale-x-0 group-hover:scale-x-100 origin-left transition-transform duration-500 ease-out z-0" />
                            </Link>
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>

            {/* Premium Navigation Arrows */}
            {slides.length > 1 && (
                <>
                    <button
                        onClick={prevSlide}
                        className="absolute left-4 md:left-8 top-1/2 -translate-y-1/2 p-4 rounded-full bg-black/20 hover:bg-white/10 text-white backdrop-blur-md border border-white/10 transition-all hover:scale-110 z-20 group"
                    >
                        <ChevronLeft className="w-6 h-6 md:w-8 md:h-8 group-hover:-translate-x-1 transition-transform" />
                    </button>
                    <button
                        onClick={nextSlide}
                        className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 p-4 rounded-full bg-black/20 hover:bg-white/10 text-white backdrop-blur-md border border-white/10 transition-all hover:scale-110 z-20 group"
                    >
                        <ChevronRight className="w-6 h-6 md:w-8 md:h-8 group-hover:translate-x-1 transition-transform" />
                    </button>

                    {/* Animated Dots */}
                    <div className="absolute bottom-16 md:bottom-24 left-1/2 -translate-x-1/2 flex gap-4 z-20">
                        {slides.map((_, idx) => (
                            <button
                                key={idx}
                                onClick={() => setCurrent(idx)}
                                className={`relative h-2 rounded-full transition-all duration-500 ${
                                    idx === current ? "bg-gold w-12" : "bg-white/30 hover:bg-white/60 w-3"
                                }`}
                            >
                                {idx === current && (
                                    <motion.div 
                                        layoutId="activeDot"
                                        className="absolute inset-0 bg-gold rounded-full shadow-[0_0_15px_rgba(200,169,81,0.8)]"
                                    />
                                )}
                            </button>
                        ))}
                    </div>
                </>
            )}

            {/* Shape Divider for overlapping QuickStats */}
            <div className="absolute bottom-0 left-0 w-full overflow-hidden leading-none z-10 transform translate-y-[2px]">
                <svg className="relative block w-[150%] h-[60px] md:h-[120px]" data-name="Layer 1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 120" preserveAspectRatio="none">
                    <path d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V120H0V95.8C59.71,118.08,130.83,119.93,197.36,112.5,239.5,107.82,282.5,91.82,321.39,56.44Z" fill="#faf9f6"></path>
                </svg>
            </div>
    );
}
