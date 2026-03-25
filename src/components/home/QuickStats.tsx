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
        <section className="w-full bg-[#faf9f6] py-10 md:py-16 border-b border-gray-100">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8 text-center divide-x-0 lg:divide-x divide-gray-200">
                    {stats.map((stat, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ y: 20, opacity: 0 }}
                            whileInView={{ y: 0, opacity: 1 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: idx * 0.1 }}
                            className="flex flex-col items-center justify-center p-4 sm:p-6 bg-white lg:bg-transparent rounded-2xl lg:rounded-none shadow-sm lg:shadow-none hover:shadow-md lg:hover:shadow-none transition-shadow"
                        >
                            <h3 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-gold mb-1 md:mb-2">
                                {stat.title}
                            </h3>
                            <p className="text-[10px] md:text-xs tracking-[0.1em] md:tracking-[0.15em] font-bold text-gray-500 uppercase">
                                {stat.subtitle}
                            </p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
