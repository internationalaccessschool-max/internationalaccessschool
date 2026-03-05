"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Mail, Phone, MapPin, ArrowRight } from "lucide-react";

const contactDetails = [
    {
        icon: MapPin,
        title: "Our Campus",
        details: ["123 Education Boulevard", "Academic District, City 10001"],
    },
    {
        icon: Phone,
        title: "Phone",
        details: ["+1 (555) 123-4567", "+1 (555) 987-6543"],
    },
    {
        icon: Mail,
        title: "Email",
        details: ["info@ias.edu", "admissions@ias.edu"],
    },
];

export function ContactSection() {
    return (
        <section className="py-24 bg-white relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-[300px] bg-gradient-to-b from-gray-50 to-transparent -z-10" />

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid lg:grid-cols-2 gap-16 items-center">

                    {/* Left side: Information */}
                    <motion.div
                        initial={{ opacity: 0, x: -50 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.8 }}
                    >
                        <span className="text-gold font-bold tracking-widest uppercase text-sm mb-2 block">
                            Get In Touch
                        </span>
                        <h2 className="text-4xl md:text-5xl font-bold text-navy mb-6">
                            We'd Love to Hear <br /> From You
                        </h2>
                        <p className="text-lg text-gray-600 mb-10 leading-relaxed">
                            Have questions about our programs or admissions? Our team is here to help you
                            every step of the way. Reach out to us via phone, email, or visit our beautiful campus.
                        </p>

                        <div className="space-y-8 mb-10">
                            {contactDetails.map((item, idx) => (
                                <div key={idx} className="flex items-start gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-navy/5 flex flex-shrink-0 items-center justify-center text-navy">
                                        <item.icon className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-navy mb-1">{item.title}</h3>
                                        {item.details.map((detail, i) => (
                                            <p key={i} className="text-gray-600">{detail}</p>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <Link
                            href="/contact"
                            className="inline-flex items-center gap-2 px-8 py-4 bg-navy text-white font-bold rounded-full hover:bg-navy-light transition-all transform hover:scale-105 shadow-xl group"
                        >
                            Contact Form
                            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </Link>
                    </motion.div>

                    {/* Right side: Modern Map/Building Visual */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.8 }}
                        className="relative h-[600px] rounded-3xl overflow-hidden shadow-2xl border border-gray-100 group"
                    >
                        {/* Static image placeholder for the map / building */}
                        <div
                            className="absolute inset-0 bg-cover bg-center group-hover:scale-110 transition-transform duration-[10s] ease-out"
                            style={{
                                backgroundImage: "url('https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=2069&auto=format&fit=crop')",
                            }}
                        />

                        {/* Overlay to handle text readability if you add a pin */}
                        <div className="absolute inset-0 bg-gradient-to-t from-navy/80 via-transparent to-transparent pointer-events-none" />

                        {/* Interactive map pin simulation */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group-hover:-translate-y-8 transition-transform duration-500">
                            <div className="w-16 h-16 bg-gold text-navy rounded-full rounded-br-none rotate-45 flex items-center justify-center shadow-xl mb-2 relative animate-bounce">
                                <div className="-rotate-45">
                                    <MapPin className="w-8 h-8" />
                                </div>
                            </div>
                            <div className="w-8 h-2 bg-black/20 blur-sm rounded-full" />
                        </div>

                        <div className="absolute bottom-6 left-6 right-6 p-6 bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl">
                            <h3 className="text-xl font-bold text-navy mb-2">Visit IAS Campus</h3>
                            <p className="text-sm text-gray-600 mb-4">Experience our world-class facilities firsthand. Schedule a guided tour today.</p>
                            <Link href="/contact" className="text-gold font-semibold text-sm hover:underline flex items-center gap-1">
                                Get Directions <ArrowRight className="w-4 h-4" />
                            </Link>
                        </div>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}
