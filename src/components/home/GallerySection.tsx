"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { db } from "@/lib/firebase";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { ArrowRight, ImageIcon, Play, X } from "lucide-react";

interface GalleryItem {
    id: string;
    url: string;
    caption?: string;
    type?: "image" | "video";
    videoId?: string;
}

export function GallerySection() {
    const [items, setItems] = useState<GalleryItem[]>([]);
    const [activeVideo, setActiveVideo] = useState<string | null>(null);

    useEffect(() => {
        const q = query(collection(db, "gallery"), orderBy("createdAt", "desc"), limit(6));
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
        <section className="section-padding bg-white relative overflow-hidden">
            {/* Background decoration */}
            <div className="absolute top-0 right-0 w-1/3 h-1/2 bg-gradient-to-bl from-navy/5 to-transparent pointer-events-none" />

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 md:mb-16 gap-6">
                    <div>
                        <span className="text-sm font-bold uppercase tracking-widest text-gold mb-2 block">
                            Campus Life
                        </span>
                        <h2 className="section-heading">Our Gallery</h2>
                        <p className="text-gray-500 mt-4 max-w-xl">
                            Explore moments from our campus, classrooms, and world-class facilities.
                        </p>
                    </div>

                    <Link href="/gallery" className="group flex items-center gap-2 text-navy font-semibold hover:text-gold transition-colors shrink-0">
                        View Full Gallery
                        <ArrowRight className="w-5 h-5 transform group-hover:translate-x-1 transition-transform" />
                    </Link>
                </div>

                {items.length === 0 ? (
                    <div className="py-20 flex flex-col items-center justify-center text-gray-400 bg-gray-50 rounded-3xl border border-gray-100">
                        <ImageIcon className="w-12 h-12 mb-3 opacity-30" />
                        <p>Gallery media will appear here.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-6">
                        {items.map((item, idx) => (
                            <motion.div
                                key={item.id}
                                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                                whileInView={{ opacity: 1, scale: 1, y: 0 }}
                                viewport={{ once: true, margin: "-50px" }}
                                transition={{ duration: 0.5, delay: idx * 0.1 }}
                                onClick={() => item.type === "video" && item.videoId ? setActiveVideo(item.videoId) : null}
                                className={`aspect-square rounded-2xl overflow-hidden relative group ${item.type === "video" ? "cursor-pointer" : ""}`}
                            >
                                <Image
                                    src={item.url}
                                    alt={item.caption || "Gallery photo"}
                                    fill
                                    sizes="(max-width: 768px) 50vw, 33vw"
                                    className="object-cover transition-transform duration-700 group-hover:scale-110"
                                />

                                {/* Video Play Icon */}
                                {item.type === "video" && (
                                    <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                                        <div className="w-12 h-12 bg-red-600/90 rounded-full flex items-center justify-center shadow-lg backdrop-blur-sm transition-transform duration-500 group-hover:scale-110">
                                            <Play className="w-5 h-5 text-white ml-1" fill="currentColor" />
                                        </div>
                                    </div>
                                )}

                                {/* Gradient Overlay */}
                                <div className="absolute inset-0 bg-gradient-to-t from-navy/80 via-navy/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                                {/* Caption */}
                                {item.caption && (
                                    <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5 translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 z-20">
                                        <h3 className="text-white font-bold text-sm sm:text-base md:text-lg line-clamp-2 shadow-sm">
                                            {item.caption}
                                        </h3>
                                    </div>
                                )}
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>

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
        </section>
    );
}
