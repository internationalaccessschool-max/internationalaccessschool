import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Shield, Eye, Lock, Database, UserCheck, Bell, Globe, Mail } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Privacy Policy — International Access School",
    description: "Read the Privacy Policy of International Access School to understand how we collect, use, and protect your personal information.",
};

const sections = [
    {
        icon: Database,
        title: "Information We Collect",
        content: [
            "Personal identification information (Name, email address, phone number, date of birth)",
            "Student academic records, attendance, and performance data",
            "Parent/guardian contact information and relationship details",
            "Payment and billing information (processed securely via certified payment gateways)",
            "Device information, IP address, and browser type for security and analytics",
            "Communication records when you contact our staff or support team",
            "Photographs and videos taken during school events (with prior consent)",
        ],
    },
    {
        icon: Eye,
        title: "How We Use Your Information",
        content: [
            "To manage student enrollment, admission, and academic records",
            "To process fee payments and issue receipts and financial reports",
            "To communicate important school updates, notices, and emergency alerts",
            "To improve our educational services, curriculum, and school infrastructure",
            "To comply with legal obligations under Indian education regulations",
            "To provide access to our online student/parent portal",
            "To send newsletters, event invitations, and academic notifications",
        ],
    },
    {
        icon: Lock,
        title: "Data Security",
        content: [
            "All data is encrypted in transit using SSL/TLS protocols",
            "Payment information is handled by PCI-DSS compliant payment processors",
            "Access to personal data is restricted to authorized school staff only",
            "We conduct regular security audits and vulnerability assessments",
            "Data is stored on secure servers hosted within India",
            "We maintain backup procedures to prevent data loss",
            "Staff members are trained in data protection and privacy compliance",
        ],
    },
    {
        icon: UserCheck,
        title: "Your Rights",
        content: [
            "Right to access your personal data held by the school",
            "Right to correct inaccurate or incomplete information",
            "Right to request deletion of your data (subject to legal obligations)",
            "Right to object to processing of your personal data",
            "Right to data portability — receive your data in a readable format",
            "Right to withdraw consent at any time for non-essential processing",
            "Right to lodge a complaint with the relevant data protection authority",
        ],
    },
    {
        icon: Globe,
        title: "Third-Party Sharing",
        content: [
            "We do not sell or rent your personal information to third parties",
            "We may share data with government bodies when required by law (e.g., CBSE, state education board)",
            "Payment processors receive only the information necessary to complete transactions",
            "Trusted service providers (e.g., cloud hosting, SMS services) may access data under strict confidentiality agreements",
            "Anonymized, aggregated data may be used for academic research purposes",
            "In case of school merger or acquisition, data may be transferred with appropriate notices",
        ],
    },
    {
        icon: Bell,
        title: "Cookies & Tracking",
        content: [
            "We use essential cookies to maintain your login session on our portal",
            "Analytics cookies help us understand how visitors use our website",
            "You can disable cookies in your browser settings (some features may not work)",
            "We do not use cookies for advertising or cross-site tracking",
            "Third-party embedded content (e.g., Google Maps) may set their own cookies",
        ],
    },
];

export default function PrivacyPolicyPage() {
    return (
        <div className="flex flex-col min-h-screen">
            <Navbar />

            {/* Hero */}
            <section className="relative pt-[72px]">
                <div className="gradient-navy py-20 md:py-28">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 mb-6">
                            <Shield className="w-8 h-8 text-gold" />
                        </div>
                        <span className="text-sm font-semibold uppercase tracking-wider text-gold">Legal</span>
                        <h1 className="text-4xl md:text-5xl font-bold text-white mt-3">
                            Privacy <span className="text-gold">Policy</span>
                        </h1>
                        <p className="text-white/60 text-lg mt-4 max-w-2xl mx-auto">
                            International Access School is committed to protecting your privacy. This policy explains how we collect, use, and safeguard your personal information.
                        </p>
                        <p className="text-white/40 text-sm mt-4">
                            Last updated: July 27, 2025 &nbsp;|&nbsp; Effective Date: August 1, 2025
                        </p>
                    </div>
                </div>
            </section>

            <main className="flex-1 bg-white">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">

                    {/* Intro */}
                    <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 mb-12">
                        <p className="text-gray-700 text-sm leading-relaxed">
                            This Privacy Policy applies to <strong>International Access School</strong> (hereinafter referred to as &quot;the School,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;), located at Atarsua, Siwan, Bihar, India – 841227. By enrolling your child, using our website at <strong>iaschool.edu.in</strong>, or using our online portals, you agree to the terms of this Privacy Policy. If you do not agree, please refrain from using our services and contact us directly.
                        </p>
                    </div>

                    {/* Sections */}
                    <div className="space-y-10">
                        {sections.map((section, i) => (
                            <div key={i} className="border border-gray-100 rounded-2xl overflow-hidden">
                                <div className="bg-off-white px-6 py-5 flex items-center gap-4 border-b border-gray-100">
                                    <div className="w-10 h-10 rounded-xl gradient-navy flex items-center justify-center shrink-0">
                                        <section.icon className="w-5 h-5 text-white" />
                                    </div>
                                    <h2 className="text-lg font-bold text-navy">{section.title}</h2>
                                </div>
                                <div className="px-6 py-5">
                                    <ul className="space-y-3">
                                        {section.content.map((item, j) => (
                                            <li key={j} className="flex items-start gap-3 text-sm text-gray-600">
                                                <span className="w-1.5 h-1.5 rounded-full bg-gold mt-1.5 shrink-0" />
                                                {item}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Retention */}
                    <div className="mt-10 border border-gray-100 rounded-2xl p-6">
                        <h2 className="text-lg font-bold text-navy mb-3">Data Retention</h2>
                        <p className="text-sm text-gray-600 leading-relaxed">
                            We retain student academic records for a minimum of 10 years after graduation as required by Indian education regulations. Financial transaction records are kept for 7 years. Other personal data is retained only as long as necessary to provide our services or comply with legal obligations. Upon request, we will delete non-essential data within 30 days.
                        </p>
                    </div>

                    {/* Children */}
                    <div className="mt-6 border border-amber-100 bg-amber-50 rounded-2xl p-6">
                        <h2 className="text-lg font-bold text-navy mb-3">Children&apos;s Privacy</h2>
                        <p className="text-sm text-gray-600 leading-relaxed">
                            As a school, we necessarily collect information about minors. All data related to students under 18 years of age is collected with the explicit consent of parents or legal guardians. We take special precautions to protect the privacy of minors and do not use their information for marketing purposes.
                        </p>
                    </div>

                    {/* Changes */}
                    <div className="mt-6 border border-gray-100 rounded-2xl p-6">
                        <h2 className="text-lg font-bold text-navy mb-3">Changes to This Policy</h2>
                        <p className="text-sm text-gray-600 leading-relaxed">
                            We may update this Privacy Policy from time to time to reflect changes in our practices or legal requirements. We will notify you of significant changes via email or a prominent notice on our website. Your continued use of our services after such changes constitutes your acceptance of the updated policy.
                        </p>
                    </div>

                    {/* Contact */}
                    <div className="mt-10 bg-navy rounded-2xl p-8 text-center">
                        <Mail className="w-10 h-10 text-gold mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-white mb-2">Questions About This Policy?</h3>
                        <p className="text-white/60 text-sm mb-6">
                            If you have any questions or concerns about our Privacy Policy or how we handle your data, please reach out to us.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                            <a
                                href="mailto:info@iaschool.edu.in"
                                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gold text-navy font-semibold text-sm hover:bg-gold/90 transition-colors"
                            >
                                <Mail className="w-4 h-4" />
                                info@iaschool.edu.in
                            </a>
                            <a
                                href="/contact"
                                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white/10 text-white font-semibold text-sm hover:bg-white/20 transition-colors"
                            >
                                Contact Us
                            </a>
                        </div>
                    </div>
                </div>
            </main>

            <Footer />
        </div>
    );
}
