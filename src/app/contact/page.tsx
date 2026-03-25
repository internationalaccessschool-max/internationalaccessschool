"use client";

import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { MapPin, Phone, Mail, Clock, Send } from "lucide-react";
import { useState } from "react";

const contactInfo = [
    { icon: MapPin, title: "Address", value: "Atarsua, Siwan, Bihar, India, 841227", sub: "Greater Siwan Campus" },
    { icon: Phone, title: "Phone", value: "+91 84060 00830", sub: "Mon-Sat, 8 AM - 4 PM" },
    { icon: Mail, title: "Email", value: "info@iaschool.edu.in", sub: "We reply within 24 hours" },
    { icon: Clock, title: "Office Hours", value: "Mon - Sat: 8:00 AM - 4:00 PM", sub: "Sun: Closed" },
];

export default function ContactPage() {
    const [submitted, setSubmitted] = useState(false);

    return (
        <div className="flex flex-col min-h-screen">
            <Navbar />

            {/* Hero */}
            <section className="relative pt-[72px]">
                <div className="gradient-navy py-20 md:py-28">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                        <span className="text-sm font-semibold uppercase tracking-wider text-gold">Reach Out</span>
                        <h1 className="text-4xl md:text-5xl font-bold text-white mt-3">
                            Get in <span className="text-gold">Touch</span>
                        </h1>
                        <p className="text-white/60 text-lg mt-4 max-w-xl mx-auto">
                            We&apos;re here to answer your questions and help you take the next step.
                        </p>
                    </div>
                </div>
            </section>

            <main className="flex-1 section-padding bg-white">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid lg:grid-cols-5 gap-12">
                        {/* Contact Info */}
                        <div className="lg:col-span-2 space-y-6">
                            <div>
                                <h2 className="section-heading text-2xl">Contact Information</h2>
                                <p className="text-gray-500 text-sm mt-2">
                                    Reach out to us via phone, email, or visit our campus.
                                </p>
                            </div>
                            <div className="space-y-4">
                                {contactInfo.map((info) => (
                                    <div key={info.title} className="flex items-start gap-4 p-4 rounded-xl bg-off-white border border-gray-100 card-hover">
                                        <div className="w-10 h-10 rounded-lg gradient-navy flex items-center justify-center shrink-0 shadow-sm">
                                            <info.icon className="w-5 h-5 text-white" />
                                        </div>
                                        <div>
                                            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-0.5">{info.title}</div>
                                            <div className="font-medium text-navy text-sm">{info.value}</div>
                                            <div className="text-xs text-gray-400 mt-0.5">{info.sub}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Map Placeholder */}
                            <div className="rounded-2xl overflow-hidden h-48 bg-gradient-to-br from-navy/5 to-gold/10 flex items-center justify-center border border-gray-100">
                                <span className="text-sm text-gray-400">Map Integration</span>
                            </div>
                        </div>

                        {/* Contact Form */}
                        <div className="lg:col-span-3">
                            <div className="bg-off-white rounded-2xl p-8 md:p-10 border border-gray-100">
                                <h3 className="font-bold text-xl text-navy mb-1">Send us a Message</h3>
                                <p className="text-sm text-gray-500 mb-6">We usually respond within 24 hours.</p>

                                {submitted ? (
                                    <div className="text-center py-12">
                                        <div className="w-16 h-16 rounded-full bg-green-100 mx-auto flex items-center justify-center mb-4">
                                            <Send className="w-7 h-7 text-green-600" />
                                        </div>
                                        <h4 className="font-bold text-navy text-lg mb-2">Message Sent!</h4>
                                        <p className="text-sm text-gray-500">Thank you for reaching out. We&apos;ll be in touch shortly.</p>
                                    </div>
                                ) : (
                                    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); setSubmitted(true); }}>
                                        <div className="grid sm:grid-cols-2 gap-5">
                                            <div>
                                                <label className="block text-sm font-medium text-navy mb-1.5">Full Name</label>
                                                <input
                                                    type="text"
                                                    placeholder="John Doe"
                                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold transition-colors"
                                                    required
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-navy mb-1.5">Email</label>
                                                <input
                                                    type="email"
                                                    placeholder="john@example.com"
                                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold transition-colors"
                                                    required
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-navy mb-1.5">Phone</label>
                                            <input
                                                type="tel"
                                                placeholder="+91 98765 43210"
                                                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold transition-colors"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-navy mb-1.5">Subject</label>
                                            <input
                                                type="text"
                                                placeholder="Inquiry about admissions"
                                                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold transition-colors"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-navy mb-1.5">Message</label>
                                            <textarea
                                                placeholder="How can we help?"
                                                rows={5}
                                                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold transition-colors resize-none"
                                                required
                                            />
                                        </div>
                                        <button
                                            type="submit"
                                            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl bg-navy text-white font-semibold text-sm hover:bg-navy-light transition-colors shadow-md hover:shadow-lg"
                                        >
                                            <Send className="w-4 h-4" />
                                            Send Message
                                        </button>
                                    </form>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            <Footer />
        </div>
    );
}
