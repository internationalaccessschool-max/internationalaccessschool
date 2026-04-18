"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BookOpen, Trophy, Target } from "lucide-react";

const stats = [
    { icon: BookOpen, label: "Years of Excellence", value: "25+" },
    { icon: Trophy, label: "Awards Won", value: "150+" },
    { icon: Target, label: "Global Alumni", value: "10k+" },
];

export function AboutSection() {
    return (
        <section className="py-24 bg-white relative overflow-hidden">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid lg:grid-cols-2 gap-16 items-center">

                    {/* Left: Text Content */}
                    <motion.div
                        initial={{ opacity: 0, x: -50 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.8 }}
                    >
                        <span className="text-gold font-bold tracking-widest uppercase text-sm mb-2 block">
                            About Our School
                        </span>
                        <h2 className="text-4xl md:text-5xl font-bold text-navy mb-6">
                            Nurturing Minds, <br /> Shaping the Future
                        </h2>
                        <p className="text-lg text-gray-600 mb-8 leading-relaxed">
                            At International Access School, we believe in empowering students through a curriculum that blends traditional values with global perspectives.
                            Our mission is to foster a lifelong love of learning and to develop leaders who make a positive impact on the world.
                        </p>

                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-10">
                            {stats.map((stat, idx) => (
                                <div key={idx} className="flex flex-col items-center sm:items-start group">
                                    <div className="w-12 h-12 rounded-xl bg-navy/5 flex items-center justify-center text-navy group-hover:bg-navy group-hover:text-white transition-all duration-300 mb-3">
                                        <stat.icon className="w-6 h-6" />
                                    </div>
                                    <span className="text-2xl font-bold text-navy">{stat.value}</span>
                                    <span className="text-sm text-gray-500 font-medium">{stat.label}</span>
                                </div>
                            ))}
                        </div>

                        <Link
                            href="/about"
                            className="inline-flex items-center gap-2 px-8 py-4 bg-navy text-white font-bold rounded-full hover:bg-navy-light transition-all transform hover:scale-105 shadow-lg group"
                        >
                            Discover Our Story
                            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </Link>
                    </motion.div>

                    {/* Right: Images Grid */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.8 }}
                        className="relative grid grid-cols-2 gap-2 sm:gap-4 h-[400px] sm:h-[600px] mt-10 lg:mt-0"
                    >
                        <div className="flex flex-col gap-4 mt-12">
                            <div className="relative h-[200px] sm:h-[280px] rounded-2xl sm:rounded-3xl overflow-hidden shadow-xl group">
                                <Image
                                    src="https://images.unsplash.com/photo-1577896851231-70ef18881754?q=80&w=2070&auto=format&fit=crop"
                                    alt="Students studying"
                                    fill
                                    className="object-cover group-hover:scale-110 transition-transform duration-700"
                                />
                            </div>
                            <div className="relative h-[150px] sm:h-[220px] rounded-2xl sm:rounded-3xl overflow-hidden shadow-xl group">
                                <Image
                                    src="https://images.unsplash.com/photo-1509062522246-3755977927d7?q=80&w=2132&auto=format&fit=crop"
                                    alt="School building"
                                    fill
                                    className="object-cover group-hover:scale-110 transition-transform duration-700"
                                />
                            </div>
                        </div>
                        <div className="flex flex-col gap-4 mb-12">
                            <div className="relative h-[150px] sm:h-[220px] rounded-2xl sm:rounded-3xl overflow-hidden shadow-xl group">
                                <Image
                                    src="https://images.unsplash.com/photo-1544531586-fde5298cdd40?q=80&w=2070&auto=format&fit=crop"
                                    alt="Classroom"
                                    fill
                                    className="object-cover group-hover:scale-110 transition-transform duration-700"
                                />
                            </div>
                            <div className="relative h-[200px] sm:h-[280px] rounded-2xl sm:rounded-3xl overflow-hidden shadow-xl group">
                                <Image
                                    src="https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?q=80&w=2070&auto=format&fit=crop"
                                    alt="Library"
                                    fill
                                    className="object-cover group-hover:scale-110 transition-transform duration-700"
                                />
                            </div>
                        </div>

                        {/* Decorative Badge */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-white rounded-full p-2 shadow-2xl z-10 flex items-center justify-center animate-bounce-slow">
                            <div className="w-full h-full rounded-full border-2 border-dashed border-gold flex flex-col items-center justify-center bg-navy text-white">
                                <span className="text-2xl font-bold">25+</span>
                                <span className="text-xs uppercase tracking-wider text-gold">Years</span>
                            </div>
                        </div>
                    </motion.div>

                </div>
            </div>
        </section>
    );
}
