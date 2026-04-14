"use client";

import { motion } from "framer-motion";

export function QuickStats() {
    const stats = [
        { title: "1200+", subtitle: "STUDENTS" },
        { title: "50+", subtitle: "TEACHERS" },
        { title: "15+", subtitle: "YEARS OF EXPERIENCE" },
        { title: "100%", subtitle: "PASS PERCENTAGE" },
    ];

    return (
        <section className="w-full relative z-20 pb-10 md:pb-16 bg-[#faf9f6]">
            {/* The negative margin pulls it up over the hero section shape divider */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-20 md:-mt-32 relative z-30">
                <div className="bg-white/80 backdrop-blur-xl border border-white rounded-[2rem] shadow-[0_20px_40px_-15px_rgba(15,27,61,0.1)] p-6 md:p-10">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8 text-center divide-x-0 lg:divide-x divide-gray-200/60">
                        {stats.map((stat, idx) => (
                            <motion.div
                                key={idx}
                                initial={{ y: 30, opacity: 0 }}
                                whileInView={{ y: 0, opacity: 1 }}
                                viewport={{ once: true, margin: "-50px" }}
                                transition={{ 
                                    duration: 0.6, 
                                    delay: idx * 0.1,
                                    type: "spring",
                                    stiffness: 100,
                                    damping: 15
                                }}
                                className="flex flex-col items-center justify-center p-2 group"
                            >
                                <h3 className="text-3xl md:text-5xl lg:text-6xl font-black text-navy mb-2 lg:mb-3 group-hover:scale-110 group-hover:text-gold transition-all duration-300 drop-shadow-sm">
                                    {stat.title}
                                </h3>
                                <div className="h-1 w-8 bg-gold/30 rounded-full mb-3 group-hover:w-16 group-hover:bg-gold transition-all duration-300" />
                                <p className="text-[10px] md:text-xs lg:text-sm tracking-[0.15em] md:tracking-[0.2em] font-bold text-gray-500 uppercase">
                                    {stat.subtitle}
                                </p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}
