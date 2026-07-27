import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { FileText, Users, CreditCard, Shield, BookOpen, AlertTriangle, Scale, Mail } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Terms & Conditions — International Access School",
    description: "Read the Terms and Conditions for using International Access School's website, online portals, and payment services.",
};

const sections = [
    {
        icon: BookOpen,
        title: "1. Acceptance of Terms",
        content: `By accessing our website at iaschool.edu.in, using our student/parent portal, or making any payment through our platform, you agree to be bound by these Terms and Conditions. These terms apply to all students, parents, guardians, and visitors. If you do not agree to these terms, you must not use our services.

These Terms & Conditions are governed by the laws of India and subject to the jurisdiction of courts in Siwan, Bihar. We reserve the right to update these terms at any time, with changes becoming effective upon posting on our website.`,
    },
    {
        icon: Users,
        title: "2. Enrollment & Admission",
        content: `Admission to International Access School is subject to availability, eligibility criteria, and the submission of accurate documents. By completing the admission form, you confirm that all information provided is true and accurate. False information will result in immediate cancellation of admission without refund of fees.

The school reserves the right to accept or reject any application without providing reasons. Admission is confirmed only upon receipt of the required fees and documents. The school's decision on all admission-related matters is final.`,
    },
    {
        icon: CreditCard,
        title: "3. Fee Payments & Online Transactions",
        content: `All fees are payable as per the school's fee schedule published at the beginning of each academic year. Fees must be paid within the stipulated deadlines. Late payments attract a penalty of ₹50 per day after the due date.

Online payments are processed through secure, certified payment gateways. By making an online payment, you authorize the school to debit the specified amount from your selected payment method. Payment receipts will be sent to your registered email address. In case of any payment discrepancy, contact us within 48 hours at info@iaschool.edu.in.`,
    },
    {
        icon: Shield,
        title: "4. Website Use & Acceptable Conduct",
        content: `You agree to use our website and portals only for lawful purposes. You must not:

• Attempt to gain unauthorized access to any part of our systems
• Upload viruses, malicious code, or any harmful software
• Misuse student login credentials or impersonate another user
• Scrape, copy, or reproduce content from our website without written permission
• Use the website for any fraudulent or illegal activities

We reserve the right to suspend or terminate access to any user who violates these terms without prior notice.`,
    },
    {
        icon: FileText,
        title: "5. Intellectual Property",
        content: `All content on this website, including text, images, logos, graphics, curriculum materials, and software, is the intellectual property of International Access School and is protected by applicable Indian copyright laws.

You may not reproduce, distribute, modify, or create derivative works without the express written consent of the school. Student work published on the school website remains the property of the respective student but grants the school a non-exclusive license to use it for educational and promotional purposes.`,
    },
    {
        icon: AlertTriangle,
        title: "6. Limitation of Liability",
        content: `International Access School shall not be liable for:

• Any indirect, incidental, or consequential damages arising from use of our services
• Temporary unavailability of the website or online portal due to maintenance or technical issues
• Loss of data due to circumstances beyond our reasonable control
• Actions of third-party payment processors or service providers
• Decisions made based on information available on our website

Our total liability for any claim arising from these terms shall not exceed the amount of fees paid by you in the immediately preceding academic term.`,
    },
    {
        icon: Scale,
        title: "7. Grievance Redressal",
        content: `If you have any grievances regarding our services, admissions, fees, or conduct of staff, please submit a written complaint to the Principal's office or email grievances@iaschool.edu.in.

We are committed to resolving all legitimate complaints within 15 working days. If you are unsatisfied with the resolution, you may escalate to the District Education Officer, Siwan, Bihar. All disputes shall be subject to the exclusive jurisdiction of courts in Siwan, Bihar, India.`,
    },
    {
        icon: Users,
        title: "8. Code of Conduct",
        content: `Students and parents are expected to uphold the values of respect, integrity, and excellence. The school's Code of Conduct governs student behavior within and outside the school premises during school-sponsored events.

Bullying, harassment, discrimination, or violence of any kind will not be tolerated and may result in suspension or expulsion. Parents are expected to cooperate with the school in matters of student discipline and academic progress. The school has zero tolerance for substance abuse, cheating, or academic dishonesty.`,
    },
];

export default function TermsPage() {
    return (
        <div className="flex flex-col min-h-screen">
            <Navbar />

            {/* Hero */}
            <section className="relative pt-[72px]">
                <div className="gradient-navy py-20 md:py-28">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 mb-6">
                            <FileText className="w-8 h-8 text-gold" />
                        </div>
                        <span className="text-sm font-semibold uppercase tracking-wider text-gold">Legal</span>
                        <h1 className="text-4xl md:text-5xl font-bold text-white mt-3">
                            Terms &amp; <span className="text-gold">Conditions</span>
                        </h1>
                        <p className="text-white/60 text-lg mt-4 max-w-2xl mx-auto">
                            Please read these Terms and Conditions carefully before using our website, portals, or payment services.
                        </p>
                        <p className="text-white/40 text-sm mt-4">
                            Last updated: July 27, 2025 &nbsp;|&nbsp; Effective Date: August 1, 2025
                        </p>
                    </div>
                </div>
            </section>

            <main className="flex-1 bg-white">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">

                    {/* Introduction */}
                    <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 mb-12">
                        <p className="text-gray-700 text-sm leading-relaxed">
                            These Terms &amp; Conditions (&quot;Terms&quot;) constitute a legally binding agreement between you and <strong>International Access School</strong>, located at Atarsua, Siwan, Bihar, India – 841227. Our website is <strong>iaschool.edu.in</strong>. For queries, contact us at <strong>info@iaschool.edu.in</strong> or call <strong>+91 84060 00830</strong>.
                        </p>
                    </div>

                    {/* Table of Contents */}
                    <div className="border border-gray-100 rounded-2xl p-6 mb-12">
                        <h2 className="font-bold text-navy mb-4">Table of Contents</h2>
                        <ol className="grid sm:grid-cols-2 gap-2">
                            {sections.map((s, i) => (
                                <li key={i}>
                                    <a href={`#section-${i}`} className="text-sm text-gold hover:text-navy transition-colors">
                                        {s.title}
                                    </a>
                                </li>
                            ))}
                        </ol>
                    </div>

                    {/* Sections */}
                    <div className="space-y-8">
                        {sections.map((section, i) => (
                            <div key={i} id={`section-${i}`} className="border border-gray-100 rounded-2xl overflow-hidden scroll-mt-24">
                                <div className="bg-off-white px-6 py-5 flex items-center gap-4 border-b border-gray-100">
                                    <div className="w-10 h-10 rounded-xl gradient-navy flex items-center justify-center shrink-0">
                                        <section.icon className="w-5 h-5 text-white" />
                                    </div>
                                    <h2 className="text-lg font-bold text-navy">{section.title}</h2>
                                </div>
                                <div className="px-6 py-5">
                                    <div className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                                        {section.content}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Payment-specific terms */}
                    <div className="mt-10 border border-gray-100 rounded-2xl p-6">
                        <h2 className="text-lg font-bold text-navy mb-4">9. Payment Gateway Terms</h2>
                        <ul className="space-y-3">
                            {[
                                "All online transactions are processed securely through RBI-approved payment gateways.",
                                "The school does not store any card details — all payment data is handled by our payment processor.",
                                "Payments are accepted via UPI, Net Banking, Debit/Credit Cards, and other available methods.",
                                "Transaction disputes must be raised within 48 hours of the transaction date.",
                                "The school is not liable for any charges imposed by your bank for online transactions.",
                                "All prices and fees are in Indian Rupees (INR) unless otherwise specified.",
                                "GST and other applicable taxes will be charged as per government regulations.",
                            ].map((item, i) => (
                                <li key={i} className="flex items-start gap-3 text-sm text-gray-600">
                                    <span className="w-1.5 h-1.5 rounded-full bg-gold mt-1.5 shrink-0" />
                                    {item}
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Related policies */}
                    <div className="mt-8 grid sm:grid-cols-3 gap-4">
                        {[
                            { title: "Privacy Policy", href: "/privacy-policy", desc: "How we handle your data" },
                            { title: "Refund Policy", href: "/refund-policy", desc: "Fee refund eligibility & process" },
                            { title: "Cancellation Policy", href: "/cancellation-policy", desc: "Terms for cancellation" },
                        ].map((link, i) => (
                            <a
                                key={i}
                                href={link.href}
                                className="border border-gray-100 rounded-xl p-4 hover:border-gold/50 hover:bg-gold/5 transition-colors group"
                            >
                                <div className="font-semibold text-navy text-sm group-hover:text-gold transition-colors">{link.title}</div>
                                <div className="text-xs text-gray-500 mt-1">{link.desc}</div>
                            </a>
                        ))}
                    </div>

                    {/* Contact */}
                    <div className="mt-10 bg-navy rounded-2xl p-8 text-center">
                        <Mail className="w-10 h-10 text-gold mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-white mb-2">Questions About These Terms?</h3>
                        <p className="text-white/60 text-sm mb-6">
                            Our team is happy to clarify any part of these Terms &amp; Conditions.
                        </p>
                        <a
                            href="mailto:info@iaschool.edu.in"
                            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gold text-navy font-semibold text-sm hover:bg-gold/90 transition-colors"
                        >
                            <Mail className="w-4 h-4" />
                            info@iaschool.edu.in
                        </a>
                    </div>
                </div>
            </main>

            <Footer />
        </div>
    );
}
