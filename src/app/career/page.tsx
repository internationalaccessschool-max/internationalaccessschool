"use client";

import { useState } from "react";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { CloudinaryUpload } from "@/components/ui/cloudinary-upload";
import { Loader2, CheckCircle2, Upload, User, Phone, Mail, FileText } from "lucide-react";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface ApplicationForm {
    name: string;
    mobile: string;
    email: string;
    photoUrl: string;
    cvUrl: string;
}

export default function CareerPage() {
    const [form, setForm] = useState<ApplicationForm>({
        name: "", mobile: "", email: "", photoUrl: "", cvUrl: "",
    });
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleChange = (field: keyof ApplicationForm, value: string) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const validate = () => {
        if (!form.name.trim()) return "Please enter your full name.";
        if (!form.mobile.trim() || form.mobile.length < 10) return "Please enter a valid contact number.";
        if (!form.email.trim() || !form.email.includes("@")) return "Please enter a valid email address.";
        if (!form.cvUrl) return "Please upload your CV / Resume.";
        return null;
    };

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const err = validate();
        if (err) return setError(err);

        setSubmitting(true);
        setError(null);
        try {
            const id = `app_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            await setDoc(doc(db, "job_applications", id), {
                id,
                name: form.name.trim(),
                mobile: form.mobile.trim(),
                email: form.email.trim(),
                photoUrl: form.photoUrl,
                cvUrl: form.cvUrl,
                status: "Pending",
                createdAt: serverTimestamp(),
            });
            setSubmitted(true);
            window.scrollTo({ top: 0, behavior: "smooth" });
        } catch (err) {
            console.error(err);
            setError("Failed to submit. Please try again.");
        }
        setSubmitting(false);
    };

    return (
        <div className="min-h-screen flex flex-col bg-gray-50 font-sans">
            <Navbar />

            {/* Hero */}
            <section className="relative pt-[72px]">
                <div className="gradient-navy py-20 px-4 text-center text-white">
                    <h1 className="text-4xl md:text-5xl font-bold mb-4">
                        Join Our <span className="text-gold">Team</span>
                    </h1>
                    <p className="text-lg text-white/70 max-w-xl mx-auto">
                        Be a part of International Access School and help shape the future of education.
                    </p>
                </div>
            </section>

            <main className="flex-grow flex items-center justify-center py-16 px-4">
                <div className="w-full max-w-lg">
                    {submitted ? (
                        <div className="bg-white rounded-2xl shadow-xl p-12 text-center border-t-4 border-emerald-500">
                            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                            </div>
                            <h2 className="text-2xl font-bold text-navy mb-3">Application Submitted!</h2>
                            <p className="text-gray-500 mb-8">
                                Thank you for applying to IAS School. Our team will review your application and get back to you at <strong>{form.email}</strong>.
                            </p>
                            <button
                                onClick={() => { setSubmitted(false); setForm({ name: "", mobile: "", email: "", photoUrl: "", cvUrl: "" }); }}
                                className="px-6 py-2.5 border border-navy text-navy rounded-xl text-sm font-semibold hover:bg-navy hover:text-white transition-all"
                            >
                                Submit Another Application
                            </button>
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
                            <div className="gradient-navy px-8 py-6">
                                <h2 className="text-xl font-bold text-white">Job Application</h2>
                                <p className="text-white/50 text-sm mt-1">Fields marked <span className="text-gold">*</span> are required</p>
                            </div>

                            <form onSubmit={onSubmit} className="p-8 space-y-6">
                                {/* Photo Upload */}
                                <div className="flex flex-col items-center gap-3 pb-6 border-b border-gray-100">
                                    <div className="w-24 h-24 rounded-full bg-gray-100 border-4 border-white shadow-md overflow-hidden flex items-center justify-center">
                                        {form.photoUrl
                                            ? <img src={form.photoUrl} alt="Photo" className="w-full h-full object-cover" />
                                            : <User className="w-10 h-10 text-gray-300" />}
                                    </div>
                                    <CloudinaryUpload
                                        folder="applications"
                                        subFolder="photos"
                                        onUpload={(url) => handleChange("photoUrl", url)}
                                        acceptedFileTypes="images"
                                        label="Upload Your Photo"
                                        maxSizeMB={5}
                                    />
                                    <p className="text-xs text-gray-400">PNG, JPG · Max 5MB (Optional)</p>
                                </div>

                                {/* Name */}
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                                        Full Name <span className="text-gold">*</span>
                                    </label>
                                    <div className="relative">
                                        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                                        <input
                                            type="text"
                                            value={form.name}
                                            onChange={e => handleChange("name", e.target.value)}
                                            placeholder="Enter your full name"
                                            className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/10 transition-all"
                                        />
                                    </div>
                                </div>

                                {/* Contact Number */}
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                                        Contact Number <span className="text-gold">*</span>
                                    </label>
                                    <div className="relative">
                                        <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                                        <input
                                            type="tel"
                                            value={form.mobile}
                                            onChange={e => handleChange("mobile", e.target.value)}
                                            placeholder="+91 xxxxxxxxxx"
                                            className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/10 transition-all"
                                        />
                                    </div>
                                </div>

                                {/* Email */}
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                                        Email Address <span className="text-gold">*</span>
                                    </label>
                                    <div className="relative">
                                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                                        <input
                                            type="email"
                                            value={form.email}
                                            onChange={e => handleChange("email", e.target.value)}
                                            placeholder="you@example.com"
                                            className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/10 transition-all"
                                        />
                                    </div>
                                </div>

                                {/* CV Upload */}
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                                        CV / Resume <span className="text-gold">*</span>
                                    </label>
                                    <div className={`rounded-xl border-2 border-dashed p-5 text-center transition-colors ${form.cvUrl ? "border-emerald-300 bg-emerald-50" : "border-gray-200 hover:border-navy/30"}`}>
                                        {form.cvUrl ? (
                                            <div className="flex items-center justify-center gap-2 text-emerald-700">
                                                <CheckCircle2 className="w-5 h-5" />
                                                <span className="text-sm font-semibold">CV uploaded successfully</span>
                                                <a href={form.cvUrl} target="_blank" rel="noopener noreferrer" className="text-xs underline ml-2">View</a>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                <FileText className="w-8 h-8 text-gray-300 mx-auto" />
                                                <CloudinaryUpload
                                                    folder="applications"
                                                    subFolder="cv"
                                                    onUpload={(url) => handleChange("cvUrl", url)}
                                                    acceptedFileTypes="all"
                                                    label="Upload CV / Resume"
                                                    maxSizeMB={10}
                                                />
                                                <p className="text-xs text-gray-400">PDF, DOC, DOCX · Max 10MB</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {error && (
                                    <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100 text-center">
                                        {error}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="w-full py-3.5 bg-navy hover:bg-navy/90 text-white font-bold rounded-xl transition-all text-sm flex items-center justify-center gap-2 shadow-lg shadow-navy/20 disabled:opacity-60"
                                >
                                    {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                                    {submitting ? "Submitting..." : "Submit Application"}
                                </button>
                            </form>
                        </div>
                    )}
                </div>
            </main>

            <Footer />
        </div>
    );
}
