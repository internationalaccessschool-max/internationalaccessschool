import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { RefreshCw, CheckCircle, XCircle, Clock, AlertTriangle, Mail } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Refund Policy — International Access School",
    description: "International Access School's official refund policy for school fees, admission charges, and other payments. Understand eligibility, timelines, and the refund process.",
};

const eligibleRefunds = [
    {
        item: "Admission Fee",
        condition: "Refundable only if admission is withdrawn within 7 days of payment",
        refundPercent: "100%",
        processingTime: "7–10 working days",
        eligible: true,
    },
    {
        item: "Security Deposit",
        condition: "Fully refundable upon completion of schooling, after clearing all dues",
        refundPercent: "100%",
        processingTime: "15–20 working days",
        eligible: true,
    },
    {
        item: "Tuition Fee (Term-wise)",
        condition: "Partial refund applicable if withdrawal is made before the start of the academic term",
        refundPercent: "Up to 50%",
        processingTime: "10–15 working days",
        eligible: true,
    },
    {
        item: "Transport Fee",
        condition: "Prorated refund for unused months if transport is discontinued mid-year",
        refundPercent: "Pro-rata",
        processingTime: "10–15 working days",
        eligible: true,
    },
];

const nonRefundable = [
    "Registration fees once the application has been processed",
    "Examination fees after the admit card has been issued",
    "Uniform, books, and stationery purchased through the school",
    "Event participation fees (Annual Day, Sports Day, etc.)",
    "Tuition fees once the academic term has commenced",
    "Late payment fines or penalty charges",
    "Activity fees for extracurricular programs already commenced",
    "Online payment gateway transaction charges",
];

const steps = [
    {
        step: "01",
        title: "Submit Refund Request",
        desc: "Submit a written refund request to the school office or via email to info@iaschool.edu.in. Include your student's name, class, admission number, and reason for refund.",
    },
    {
        step: "02",
        title: "Document Verification",
        desc: "Our accounts team will verify your payment records, enrollment status, and eligibility within 3 working days.",
    },
    {
        step: "03",
        title: "Approval & Processing",
        desc: "Upon approval, the refund will be initiated back to the original payment method (UPI, Bank Account, Card, etc.).",
    },
    {
        step: "04",
        title: "Refund Credited",
        desc: "Refund is credited to your account within the specified processing time. A confirmation SMS/email will be sent upon completion.",
    },
];

export default function RefundPolicyPage() {
    return (
        <div className="flex flex-col min-h-screen">
            <Navbar />

            {/* Hero */}
            <section className="relative pt-[72px]">
                <div className="gradient-navy py-20 md:py-28">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 mb-6">
                            <RefreshCw className="w-8 h-8 text-gold" />
                        </div>
                        <span className="text-sm font-semibold uppercase tracking-wider text-gold">Legal</span>
                        <h1 className="text-4xl md:text-5xl font-bold text-white mt-3">
                            Refund <span className="text-gold">Policy</span>
                        </h1>
                        <p className="text-white/60 text-lg mt-4 max-w-2xl mx-auto">
                            We strive to be transparent and fair in all our financial dealings. Please read our refund policy carefully before making any payments.
                        </p>
                        <p className="text-white/40 text-sm mt-4">
                            Last updated: July 27, 2025 &nbsp;|&nbsp; Effective Date: August 1, 2025
                        </p>
                    </div>
                </div>
            </section>

            <main className="flex-1 bg-white">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">

                    {/* Important Notice */}
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 mb-12 flex gap-4">
                        <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                            <h3 className="font-bold text-amber-900 mb-1">Important Notice</h3>
                            <p className="text-sm text-amber-800 leading-relaxed">
                                All refund requests must be submitted within the stipulated timeframe. Requests made after the deadline will not be entertained. Refunds are processed only to the original payment method and cannot be transferred to a third party.
                            </p>
                        </div>
                    </div>

                    {/* Eligible Refunds Table */}
                    <div className="mb-12">
                        <h2 className="text-2xl font-bold text-navy mb-6 flex items-center gap-3">
                            <CheckCircle className="w-6 h-6 text-green-500" />
                            Eligible Refunds
                        </h2>
                        <div className="overflow-x-auto rounded-2xl border border-gray-100">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-navy text-white">
                                        <th className="px-5 py-4 text-left font-semibold">Fee Type</th>
                                        <th className="px-5 py-4 text-left font-semibold">Condition</th>
                                        <th className="px-5 py-4 text-left font-semibold">Refund %</th>
                                        <th className="px-5 py-4 text-left font-semibold">Processing Time</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {eligibleRefunds.map((row, i) => (
                                        <tr key={i} className={`border-t border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}>
                                            <td className="px-5 py-4 font-medium text-navy">{row.item}</td>
                                            <td className="px-5 py-4 text-gray-600">{row.condition}</td>
                                            <td className="px-5 py-4">
                                                <span className="inline-block bg-green-100 text-green-700 text-xs font-semibold px-2.5 py-1 rounded-lg">
                                                    {row.refundPercent}
                                                </span>
                                            </td>
                                            <td className="px-5 py-4 text-gray-600 flex items-center gap-2">
                                                <Clock className="w-3.5 h-3.5 text-gold" />
                                                {row.processingTime}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Non-Refundable */}
                    <div className="mb-12">
                        <h2 className="text-2xl font-bold text-navy mb-6 flex items-center gap-3">
                            <XCircle className="w-6 h-6 text-red-500" />
                            Non-Refundable Fees
                        </h2>
                        <div className="bg-red-50 border border-red-100 rounded-2xl p-6">
                            <ul className="grid sm:grid-cols-2 gap-3">
                                {nonRefundable.map((item, i) => (
                                    <li key={i} className="flex items-start gap-3 text-sm text-gray-700">
                                        <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                                        {item}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>

                    {/* Refund Process */}
                    <div className="mb-12">
                        <h2 className="text-2xl font-bold text-navy mb-8">How to Request a Refund</h2>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
                            {steps.map((s, i) => (
                                <div key={i} className="border border-gray-100 rounded-2xl p-5 relative">
                                    <div className="text-3xl font-black text-navy/10 mb-3">{s.step}</div>
                                    <h3 className="font-bold text-navy text-sm mb-2">{s.title}</h3>
                                    <p className="text-xs text-gray-500 leading-relaxed">{s.desc}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Additional Conditions */}
                    <div className="border border-gray-100 rounded-2xl p-6 mb-10">
                        <h2 className="text-lg font-bold text-navy mb-4">Additional Terms</h2>
                        <ul className="space-y-3">
                            {[
                                "Refunds will be credited only to the account/card/UPI ID from which the original payment was made.",
                                "In case of failed transactions, the amount will be auto-reversed within 5–7 working days by your bank.",
                                "The school reserves the right to deduct any outstanding dues before processing a refund.",
                                "In exceptional circumstances (death, prolonged illness), the principal may exercise discretion on refund eligibility.",
                                "All refunds are subject to applicable government regulations and CBSE/State Board guidelines.",
                                "For online payments, gateway transaction charges (if any) are non-refundable.",
                            ].map((item, i) => (
                                <li key={i} className="flex items-start gap-3 text-sm text-gray-600">
                                    <span className="w-1.5 h-1.5 rounded-full bg-gold mt-1.5 shrink-0" />
                                    {item}
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Contact */}
                    <div className="bg-navy rounded-2xl p-8 text-center">
                        <Mail className="w-10 h-10 text-gold mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-white mb-2">Need Help with a Refund?</h3>
                        <p className="text-white/60 text-sm mb-6">
                            Contact our accounts department for refund-related queries.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                            <a
                                href="mailto:info@iaschool.edu.in"
                                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gold text-navy font-semibold text-sm hover:bg-gold/90 transition-colors"
                            >
                                <Mail className="w-4 h-4" />
                                info@iaschool.edu.in
                            </a>
                            <Link
                                href="/contact"
                                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white/10 text-white font-semibold text-sm hover:bg-white/20 transition-colors"
                            >
                                Contact Us
                            </Link>
                        </div>
                    </div>
                </div>
            </main>

            <Footer />
        </div>
    );
}
