"use client";

import { motion } from "framer-motion";
import { Quote, Star } from "lucide-react";

const testimonials = [
    {
        quote:
            "The teachers here go above and beyond. My child's confidence and curiosity have grown tremendously.",
        name: "Priya Sharma",
        role: "Parent of Class 8 student",
    },
    {
        quote:
            "International Access School gave me the skills and mindset to pursue my dream of studying abroad.",
        name: "Arjun Patel",
        role: "Alumni, Class of 2023",
    },
    {
        quote:
            "The campus is beautiful, the curriculum is challenging, and the extracurriculars are amazing.",
        name: "Sarah Khan",
        role: "Parent of Class 5 student",
    },
];

export function TestimonialsSection() {
    return (
        <section className="section-padding bg-gray-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-16">
                    <span className="text-sm font-bold uppercase tracking-widest text-gold mb-2 block">
                        Testimonials
                    </span>
                    <h2 className="section-heading">What our Community says</h2>
                </div>

                <div className="grid md:grid-cols-3 gap-8">
                    {testimonials.map((t, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: idx * 0.2 }}
                            className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 relative group hover:shadow-xl transition-shadow duration-300"
                        >
                            <Quote className="w-10 h-10 text-gold/20 absolute top-6 right-6 group-hover:text-gold/40 transition-colors" />
                            <div className="flex gap-1 mb-6">
                                {[...Array(5)].map((_, i) => (
                                    <Star
                                        key={i}
                                        className="w-4 h-4 text-gold fill-current"
                                    />
                                ))}
                            </div>
                            <p className="text-gray-600 text-lg leading-relaxed mb-6 italic">
                                "{t.quote}"
                            </p>
                            <div>
                                <h4 className="font-bold text-navy">{t.name}</h4>
                                <p className="text-sm text-gray-400">{t.role}</p>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
