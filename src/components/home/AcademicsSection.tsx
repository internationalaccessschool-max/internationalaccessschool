"use client";

import { motion } from "framer-motion";
import { GraduationCap, BookOpen, Heart, Award, ArrowRight } from "lucide-react";
import Link from "next/link";

const programs = [
    {
        icon: Heart,
        title: "Preschool",
        grades: "Ages 3–5",
        desc: "Nurturing curiosity through play-based learning and creative exploration.",
        color: "text-rose-600",
        bg: "bg-rose-50",
        border: "border-rose-100",
        link: "/academics/preschool",
    },
    {
        icon: BookOpen,
        title: "Primary",
        grades: "Grades 1–5",
        desc: "Building strong foundations in literacy, numeracy, and critical thinking.",
        color: "text-blue-600",
        bg: "bg-blue-50",
        border: "border-blue-100",
        link: "/academics/primary",
    },
    {
        icon: GraduationCap,
        title: "Secondary",
        grades: "Grades 6–10",
        desc: "Expanding horizons with specialized subjects and collaborative projects.",
        color: "text-amber-600",
        bg: "bg-amber-50",
        border: "border-amber-100",
        link: "/academics/secondary",
    },
    {
        icon: Award,
        title: "Senior Secondary",
        grades: "Grades 11–12",
        desc: "Preparing future leaders with AP courses and career counseling.",
        color: "text-emerald-600",
        bg: "bg-emerald-50",
        border: "border-emerald-100",
        link: "/academics/senior-secondary",
    },
];

export function AcademicsSection() {
    return (
        <section className="section-padding bg-gray-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-16">
                    <span className="text-sm font-bold uppercase tracking-widest text-gold mb-2 block">
                        Academic Excellence
                    </span>
                    <h2 className="section-heading">Learning Pathways</h2>
                    <p className="section-subheading mx-auto mt-4">
                        A comprehensive curriculum designed to foster intellectual growth and character development at every stage.
                    </p>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
                    {programs.map((program, idx) => (
                        <motion.div
                            key={program.title}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: idx * 0.1 }}
                            className={`group relative p-8 rounded-2xl bg-white border ${program.border} shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-2`}
                        >
                            <div
                                className={`w-14 h-14 rounded-xl ${program.bg} ${program.color} flex items-center justify-center mb-6 text-2xl group-hover:scale-110 transition-transform`}
                            >
                                <program.icon className="w-7 h-7" />
                            </div>
                            <h3 className="text-xl font-bold text-navy mb-2 group-hover:text-gold transition-colors">
                                {program.title}
                            </h3>
                            <p className="text-sm font-semibold text-gray-400 mb-4">{program.grades}</p>
                            <p className="text-gray-600 text-sm leading-relaxed mb-6">
                                {program.desc}
                            </p>
                            <Link
                                href={program.link}
                                className={`inline-flex items-center text-sm font-semibold ${program.color} hover:underline`}
                            >
                                Learn More <ArrowRight className="w-4 h-4 ml-1" />
                            </Link>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
