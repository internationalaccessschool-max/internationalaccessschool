"use client";

import { useState, useEffect } from "react";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { db } from "@/lib/firebase";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Play, X } from "lucide-react";

interface GalleryItem {
    id: string;
    url: string;
    caption?: string;
    type?: "image" | "video";
    videoId?: string;
}

export default function GalleryPage() {
    const [items, setItems] = useState<GalleryItem[]>([]);
    const [activeVideo, setActiveVideo] = useState<string | null>(null);

    useEffect(() => {
        const q = query(collection(db, "gallery"), orderBy("createdAt", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GalleryItem)));
        });
        return () => unsubscribe();
    }, []);

    // Handle escape key to close video
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setActiveVideo(null);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    return (
        <div className="flex flex-col min-h-screen">
            <Navbar />

            {/* Hero */}
            <section className="relative pt-[72px]">
                <div className="gradient-navy py-20 md:py-28">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                        <span className="text-sm font-semibold uppercase tracking-wider text-gold">Campus Life</span>
                        <h1 className="text-4xl md:text-5xl font-bold text-white mt-3">
                            Our <span className="text-gold">Gallery</span>
                        </h1>
                        <p className="text-white/60 text-lg mt-4 max-w-xl mx-auto">
                            A glimpse into our vibrant campus and world-class facilities.
                        </p>
                    </div>
                </div>
            </section>

            <main className="flex-1 section-padding bg-white">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    {items.length === 0 ? (
                        <div className="text-center py-20">
                            <p className="text-xl text-gray-400 font-medium">No files have been added yet.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
                            {items.map((item, i) => (
                                <motion.div
                                    key={item.id}
                                    initial={{ opacity: 0, y: 30 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true, margin: "-50px" }}
                                    transition={{ duration: 0.5, delay: (i % 6) * 0.1 }}
                                    onClick={() => item.type === "video" && item.videoId ? setActiveVideo(item.videoId) : null}
                                    className={`relative group overflow-hidden rounded-2xl ${item.type === "video" ? "cursor-pointer" : ""} ${i % 7 === 0 ? "md:col-span-2 md:row-span-2 aspect-square" : "aspect-[4/3]"}`}
                                >
                                    <Image
                                        src={item.url}
                                        alt={item.caption || "Gallery media"}
                                        fill
                                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                                        className="object-cover transition-transform duration-700 group-hover:scale-110"
                                    />

                                    {/* Video Play Icon */}
                                    {item.type === "video" && (
                                        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                                            <div className="w-16 h-16 bg-red-600/90 rounded-full flex items-center justify-center shadow-2xl backdrop-blur-md transition-transform duration-500 group-hover:scale-110">
                                                <Play className="w-7 h-7 text-white ml-2" fill="currentColor" />
                                            </div>
                                        </div>
                                    )}

                                    {/* Gradient Overlay */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-navy/90 via-navy/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                                    {/* Caption sliding up */}
                                    {item.caption && (
                                        <div className="absolute bottom-0 left-0 right-0 p-6 translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500 flex items-end z-20">
                                            <span className="text-white font-bold text-lg md:text-xl leading-tight">
                                                {item.caption}
                                            </span>
                                        </div>
                                    )}
                                </motion.div>
                            ))}
                        </div>
                    )}
                </div>
            </main>

            {/* Video Modal */}
            <AnimatePresence>
                {activeVideo && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-4 md:p-12 backdrop-blur-xl"
                    >
                        <button
                            onClick={() => setActiveVideo(null)}
                            className="absolute top-6 right-6 w-12 h-12 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-colors z-10"
                        >
                            <X className="w-6 h-6" />
                        </button>

                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="w-full max-w-6xl aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10 relative"
                        >
                            <iframe
                                width="100%"
                                height="100%"
                                src={`https://www.youtube.com/embed/${activeVideo}?autoplay=1&rel=0`}
                                title="YouTube video player"
                                frameBorder="0"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                allowFullScreen
                                className="absolute inset-0 w-full h-full"
                            ></iframe>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <Footer />
        </div>
    );
}
