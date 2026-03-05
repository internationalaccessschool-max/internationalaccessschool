"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, Briefcase } from "lucide-react";
import Image from "next/image";

export function CareerSection() {
    return (
        <section className="py-24 relative overflow-hidden bg-navy text-white">
            {/* Background elements */}
            <div className="absolute inset-0 z-0">
                <Image
                    src="https://images.unsplash.com/photo-1571260899304-425070112059?q=80&w=2062&auto=format&fit=crop"
                    alt="Teachers collaborating"
                    fill
                    className="object-cover opacity-10"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-navy via-navy/90 to-transparent" />
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                <div className="grid lg:grid-cols-2 gap-16 items-center">
                    <motion.div
                        initial={{ opacity: 0, x: -50 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.8 }}
                    >
                        <div className="inline-flex items-center justify-center p-3 bg-white/10 rounded-xl mb-6 backdrop-blur-sm border border-white/20">
                            <Briefcase className="w-6 h-6 text-gold" />
                        </div>

                        <span className="text-gold font-bold tracking-widest uppercase text-sm mb-2 block">
                            Join Our Team
                        </span>

                        <h2 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
                            Build Your Career <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold to-yellow-200">With Us</span>
                        </h2>

                        <p className="text-lg text-gray-300 mb-8 leading-relaxed max-w-xl">
                            We are always looking for passionate, innovative, and dedicated professionals to join our
                            vibrant educational community. At International Access School, you will find an environment
                            that fosters professional growth and teaching excellence.
                        </p>

                        <ul className="space-y-4 mb-10 text-gray-200">
                            {[
                                "Competitive compensation packages",
                                "Continuous professional development",
                                "State-of-the-art teaching facilities",
                                "Collaborative and supportive culture"
                            ].map((item, i) => (
                                <li key={i} className="flex items-center gap-3">
                                    <div className="w-6 h-6 rounded-full bg-gold/20 flex items-center justify-center text-gold shrink-0">
                                        <div className="w-2 h-2 bg-gold rounded-full" />
                                    </div>
                                    <span>{item}</span>
                                </li>
                            ))}
                        </ul>

                        <Link
                            href="/career"
                            className="inline-flex items-center gap-2 px-8 py-4 bg-white text-navy font-bold rounded-full hover:bg-gray-100 transition-all transform hover:scale-105 shadow-[0_0_20px_rgba(255,255,255,0.2)] group"
                        >
                            View Open Positions
                            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </Link>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}
