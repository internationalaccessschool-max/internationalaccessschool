"use client";

import { motion } from "framer-motion";
import { Monitor, Users, Globe, Lightbulb, CheckCircle2 } from "lucide-react";

const features = [
    {
        icon: Monitor,
        title: "Smart Classrooms",
        desc: "Interactive digital learning environments with modern technology.",
    },
    {
        icon: Users,
        title: "Experienced Faculty",
        desc: "Dedicated educators with international teaching credentials.",
    },
    {
        icon: Globe,
        title: "Global Curriculum",
        desc: "Internationally recognized programs aligned with world standards.",
    },
    {
        icon: Lightbulb,
        title: "Holistic Development",
        desc: "Balancing academics with arts, sports, and character building.",
    },
];

export function FeaturesSection() {
    return (
        <section className="py-24 bg-navy relative overflow-hidden">
            {/* Background Pattern */}
            <div className="absolute inset-0 opacity-10 pointer-events-none">
                <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-navy-light to-transparent" />
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                <div className="grid lg:grid-cols-2 gap-16 items-center">
                    <motion.div
                        initial={{ opacity: 0, x: -50 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.8 }}
                    >
                        <span className="text-gold font-bold tracking-widest uppercase text-sm">
                            Why Choose IAS?
                        </span>
                        <h2 className="text-4xl md:text-5xl font-bold text-white mt-2 mb-6">
                            Beyond Traditional Education
                        </h2>
                        <p className="text-lg text-gray-300 mb-8 leading-relaxed">
                            We foster critical thinking, creativity, and character through a
                            modern approach to learning that prepares students for the future.
                        </p>

                        <div className="space-y-8">
                            {features.map((feature, idx) => (
                                <div key={idx} className="flex gap-4 group">
                                    <div className="shrink-0 w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-gold group-hover:bg-gold group-hover:text-navy transition-all duration-300">
                                        <feature.icon className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-white mb-2">
                                            {feature.title}
                                        </h3>
                                        <p className="text-gray-400 text-sm leading-relaxed">
                                            {feature.desc}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.8 }}
                        className="relative h-[600px] rounded-3xl overflow-hidden shadow-2xl border border-white/10 group"
                    >
                        <div className="absolute inset-0 bg-gray-900">
                            {/* Placeholder for Video/Image */}
                            <div
                                className="absolute inset-0 bg-cover bg-center opacity-60 group-hover:scale-105 transition-transform duration-700"
                                style={{
                                    backgroundImage:
                                        "url('https://images.unsplash.com/photo-1524178232363-1fb2b075b655?q=80&w=2070&auto=format&fit=crop')",
                                }}
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/50 to-transparent" />
                        </div>

                        <div className="absolute bottom-0 left-0 right-0 p-8">
                            <div className="flex items-center gap-4 mb-4">
                                <div className="w-12 h-12 rounded-full bg-gold flex items-center justify-center animate-pulse">
                                    <div className="w-0 h-0 border-t-[6px] border-t-transparent border-l-[10px] border-l-navy border-b-[6px] border-b-transparent ml-1" />
                                </div>
                                <span className="text-white font-bold text-lg">Watch Campus Tour</span>
                            </div>
                            <p className="text-gray-300 text-sm">
                                Get a glimpse of our vibrant campus life and state-of-the-art facilities.
                            </p>
                        </div>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}
