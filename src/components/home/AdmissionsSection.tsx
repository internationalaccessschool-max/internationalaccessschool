"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, FileText, CheckCircle, GraduationCap } from "lucide-react";

const steps = [
    {
        icon: FileText,
        title: "1. Submit Inquiry",
        desc: "Fill out the online application form with the required details.",
        delay: 0.1,
    },
    {
        icon: CheckCircle,
        title: "2. Assessment",
        desc: "Students will complete a brief entrance evaluation test.",
        delay: 0.3,
    },
    {
        icon: GraduationCap,
        title: "3. Enrollment",
        desc: "Upon acceptance, complete the registration and fee payment.",
        delay: 0.5,
    },
];

export function AdmissionsSection() {
    return (
        <section className="py-24 bg-gray-50 relative overflow-hidden">
            {/* Background elements */}
            <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-gold/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                <div className="text-center max-w-3xl mx-auto mb-16">
                    <motion.span
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-gold font-bold tracking-widest uppercase text-sm mb-2 block"
                    >
                        Join Our Community
                    </motion.span>
                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 }}
                        className="text-4xl md:text-5xl font-bold text-navy mb-6"
                    >
                        Your Journey Starts Here
                    </motion.h2>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 }}
                        className="text-lg text-gray-600 leading-relaxed"
                    >
                        We welcome bright minds from all over the globe. Our admission process is designed to find students
                        who will thrive in our dynamic and challenging academic environment.
                    </motion.p>
                </div>

                <div className="grid md:grid-cols-3 gap-8 relative">
                    {/* Connecting line for desktop */}
                    <div className="hidden md:block absolute top-[60px] left-1/6 right-1/6 h-[2px] bg-gradient-to-r from-transparent via-navy/20 to-transparent -z-10" />

                    {steps.map((step, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: step.delay, duration: 0.6 }}
                            className="bg-white rounded-3xl p-8 shadow-lg hover:shadow-xl transition-shadow border border-gray-100 flex flex-col items-center text-center group"
                        >
                            <div className="w-24 h-24 rounded-full bg-navy/5 flex items-center justify-center text-navy mb-6 group-hover:bg-navy group-hover:text-gold transition-colors duration-300">
                                <step.icon className="w-10 h-10" />
                            </div>
                            <h3 className="text-2xl font-bold text-navy mb-3">{step.title}</h3>
                            <p className="text-gray-600 leading-relaxed mb-6">
                                {step.desc}
                            </p>
                        </motion.div>
                    ))}
                </div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.6 }}
                    className="mt-16 text-center"
                >
                    <Link
                        href="/admissions"
                        className="inline-flex items-center gap-2 px-8 py-4 bg-gold text-navy font-bold rounded-full hover:bg-gold-light transition-all transform hover:scale-105 shadow-[0_0_20px_rgba(234,179,8,0.3)] group"
                    >
                        Start Application
                        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </Link>
                </motion.div>
            </div>
        </section>
    );
}
