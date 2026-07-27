import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { XOctagon, Calendar, AlertTriangle, CheckCircle, Mail, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Cancellation Policy — International Access School",
    description: "International Access School's Cancellation Policy for admissions, fee payments, transport services, and extracurricular activities.",
};

const admissionCancellation = [
    {
        timeline: "Within 7 days of payment",
        refund: "Full refund of all fees paid",
        penalty: "None",
        color: "green",
    },
    {
        timeline: "8–30 days of payment",
        refund: "Refund excluding Registration Fee",
        penalty: "₹500 processing charge",
        color: "yellow",
    },
    {
        timeline: "31–60 days / before term start",
        refund: "Security deposit only",
        penalty: "Tuition & Admission Fee forfeited",
        color: "orange",
    },
    {
        timeline: "After academic term has started",
        refund: "Security deposit only (after dues clearance)",
        penalty: "All term fees forfeited",
        color: "red",
    },
];

const services = [
    {
        title: "Transport Service Cancellation",
        icon: "🚌",
        details: [
            "Transport may be cancelled with 30 days' written notice to the school office.",
            "Cancellation effective from the 1st of the following month after notice period.",
            "Prorated refund will be issued for any prepaid months beyond the notice period.",
            "No refund is issued for the month in which cancellation is processed.",
            "Re-enrollment in transport services is subject to availability.",
        ],
    },
    {
        title: "Meal Plan Cancellation",
        icon: "🍱",
        details: [
            "Meal plan must be cancelled with a minimum of 15 days' notice.",
            "Refund will be issued for unused meals beyond the notice period (prorated).",
            "Medical exemptions with doctor's certificate may qualify for immediate cancellation.",
            "Cancellations for less than a week of meals will not be processed for refund.",
        ],
    },
    {
        title: "Extracurricular Activity Cancellation",
        icon: "🎭",
        details: [
            "Students may withdraw from extracurricular activities within the first 7 days of enrollment for a full refund.",
            "After 7 days, fees for extracurricular activities are non-refundable.",
            "If the school cancels an activity, a full refund will be issued within 10 working days.",
            "Workshops, field trips, and special events cannot be cancelled once seats are confirmed.",
        ],
    },
    {
        title: "Online Payment Cancellation",
        icon: "💳",
        details: [
            "Payments made online cannot be cancelled once processed.",
            "In case of duplicate payment, contact us immediately at info@iaschool.edu.in.",
            "Failed transactions will be auto-reversed within 5–7 working days.",
            "Disputed payments must be reported within 48 hours of the transaction.",
        ],
    },
];

export default function CancellationPolicyPage() {
    return (
        <div className="flex flex-col min-h-screen">
            <Navbar />

            {/* Hero */}
            <section className="relative pt-[72px]">
                <div className="gradient-navy py-20 md:py-28">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 mb-6">
                            <XOctagon className="w-8 h-8 text-gold" />
                        </div>
                        <span className="text-sm font-semibold uppercase tracking-wider text-gold">Legal</span>
                        <h1 className="text-4xl md:text-5xl font-bold text-white mt-3">
                            Cancellation <span className="text-gold">Policy</span>
                        </h1>
                        <p className="text-white/60 text-lg mt-4 max-w-2xl mx-auto">
                            Our cancellation policy ensures fairness for both students and the school. Please review these terms before making enrollment or service decisions.
                        </p>
                        <p className="text-white/40 text-sm mt-4">
                            Last updated: July 27, 2025 &nbsp;|&nbsp; Effective Date: August 1, 2025
                        </p>
                    </div>
                </div>
            </section>

            <main className="flex-1 bg-white">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">

                    {/* Alert */}
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 mb-12 flex gap-4">
                        <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                            <h3 className="font-bold text-amber-900 mb-1">Please Read Before Proceeding</h3>
                            <p className="text-sm text-amber-800 leading-relaxed">
                                All cancellation requests must be submitted in writing — either in person at the school office or via email to <strong>info@iaschool.edu.in</strong>. Verbal or phone cancellations will not be accepted. The date of receiving the written request will be considered the official cancellation date.
                            </p>
                        </div>
                    </div>

                    {/* Admission Cancellation Timeline */}
                    <div className="mb-14">
                        <h2 className="text-2xl font-bold text-navy mb-2 flex items-center gap-3">
                            <Calendar className="w-6 h-6 text-gold" />
                            Admission Cancellation Timeline
                        </h2>
                        <p className="text-sm text-gray-500 mb-8">The refund amount depends on when you cancel your admission relative to the date of payment.</p>
                        <div className="grid sm:grid-cols-2 gap-5">
                            {admissionCancellation.map((row, i) => (
                                <div
                                    key={i}
                                    className={`rounded-2xl border p-5 ${
                                        row.color === "green" ? "border-green-200 bg-green-50" :
                                        row.color === "yellow" ? "border-yellow-200 bg-yellow-50" :
                                        row.color === "orange" ? "border-orange-200 bg-orange-50" :
                                        "border-red-200 bg-red-50"
                                    }`}
                                >
                                    <div className={`text-xs font-bold uppercase tracking-wider mb-3 ${
                                        row.color === "green" ? "text-green-700" :
                                        row.color === "yellow" ? "text-yellow-700" :
                                        row.color === "orange" ? "text-orange-700" :
                                        "text-red-700"
                                    }`}>
                                        {row.timeline}
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex items-start gap-2">
                                            <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                                            <div>
                                                <span className="text-xs text-gray-500 block">Refund</span>
                                                <span className="text-sm font-semibold text-gray-800">{row.refund}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-2">
                                            <XOctagon className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                                            <div>
                                                <span className="text-xs text-gray-500 block">Penalty</span>
                                                <span className="text-sm font-semibold text-gray-800">{row.penalty}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Service-wise Cancellation */}
                    <div className="mb-14">
                        <h2 className="text-2xl font-bold text-navy mb-8">Service-wise Cancellation Terms</h2>
                        <div className="space-y-5">
                            {services.map((service, i) => (
                                <div key={i} className="border border-gray-100 rounded-2xl overflow-hidden">
                                    <div className="bg-off-white px-6 py-4 border-b border-gray-100 flex items-center gap-3">
                                        <span className="text-2xl">{service.icon}</span>
                                        <h3 className="font-bold text-navy">{service.title}</h3>
                                    </div>
                                    <div className="px-6 py-5">
                                        <ul className="space-y-3">
                                            {service.details.map((item, j) => (
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
                    </div>

                    {/* School's Right to Cancel */}
                    <div className="border border-gray-100 rounded-2xl p-6 mb-10">
                        <h2 className="text-lg font-bold text-navy mb-4">School&apos;s Right to Cancel Admission</h2>
                        <p className="text-sm text-gray-600 mb-4">
                            International Access School reserves the right to cancel admission in the following circumstances:
                        </p>
                        <ul className="space-y-3">
                            {[
                                "Submission of false or forged documents during the admission process",
                                "Non-payment of fees within the stipulated deadline",
                                "Repeated disciplinary violations as per school's Code of Conduct",
                                "Non-attendance for more than 30 consecutive school days without valid notice",
                                "Any conduct deemed harmful to the school community or reputation",
                            ].map((item, i) => (
                                <li key={i} className="flex items-start gap-3 text-sm text-gray-600">
                                    <XOctagon className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                                    {item}
                                </li>
                            ))}
                        </ul>
                        <p className="text-xs text-gray-400 mt-4">
                            In such cases, only the security deposit (if applicable) will be refunded after deducting any outstanding dues.
                        </p>
                    </div>

                    {/* Contact */}
                    <div className="bg-navy rounded-2xl p-8 text-center">
                        <h3 className="text-xl font-bold text-white mb-2">Need to Cancel? We&apos;re Here to Help</h3>
                        <p className="text-white/60 text-sm mb-6">
                            Contact us as soon as possible to minimize penalties and ensure a smooth cancellation process.
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
                                href="tel:+918406000830"
                                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white/10 text-white font-semibold text-sm hover:bg-white/20 transition-colors"
                            >
                                <Phone className="w-4 h-4" />
                                +91 84060 00830
                            </a>
                        </div>
                    </div>
                </div>
            </main>

            <Footer />
        </div>
    );
}
