"use client";

import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import {
    CreditCard, Shield, Lock, CheckCircle, ArrowRight, Smartphone,
    Building2, Wallet, Info
} from "lucide-react";
import { useState } from "react";
import Link from "next/link";

const feeCategories = [
    { id: "tuition-primary", label: "Tuition Fee — Primary (Grades 1–5)", amount: 18000, term: "Per Term" },
    { id: "tuition-middle", label: "Tuition Fee — Middle School (Grades 6–8)", amount: 24000, term: "Per Term" },
    { id: "tuition-high", label: "Tuition Fee — High School (Grades 9–12)", amount: 30000, term: "Per Term" },
    { id: "admission", label: "Admission Fee (One-time)", amount: 5000, term: "One-time" },
    { id: "transport", label: "Transport Fee", amount: 1500, term: "Per Month" },
    { id: "security", label: "Security Deposit (Refundable)", amount: 2000, term: "One-time" },
    { id: "activity", label: "Activity / Extracurricular Fee", amount: 2000, term: "Per Term" },
];

const paymentMethods = [
    { id: "upi", icon: Smartphone, label: "UPI", desc: "Google Pay, PhonePe, Paytm" },
    { id: "netbanking", icon: Building2, label: "Net Banking", desc: "All major banks" },
    { id: "card", icon: CreditCard, label: "Debit / Credit Card", desc: "Visa, Mastercard, RuPay" },
    { id: "wallet", icon: Wallet, label: "Mobile Wallet", desc: "Paytm, Mobikwik & more" },
];

export default function PaymentPage() {
    const [selectedFee, setSelectedFee] = useState(feeCategories[0].id);
    const [customAmount, setCustomAmount] = useState("");
    const [useCustom, setUseCustom] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState("upi");
    const [agreed, setAgreed] = useState(false);
    const [studentName, setStudentName] = useState("");
    const [admissionNo, setAdmissionNo] = useState("");
    const [studentClass, setStudentClass] = useState("");
    const [parentEmail, setParentEmail] = useState("");
    const [parentPhone, setParentPhone] = useState("");
    const [showSuccess, setShowSuccess] = useState(false);

    const selectedCategory = feeCategories.find(f => f.id === selectedFee);
    const amount = useCustom ? (parseFloat(customAmount) || 0) : (selectedCategory?.amount || 0);

    const handlePayNow = () => {
        if (!studentName || !admissionNo || !studentClass || !parentEmail || !parentPhone) {
            alert("Please fill all required fields before proceeding.");
            return;
        }
        if (!agreed) {
            alert("Please agree to the Terms & Conditions before proceeding.");
            return;
        }
        if (amount <= 0) {
            alert("Please enter a valid amount.");
            return;
        }
        // This will be connected to actual payment gateway (Razorpay / PayU / CCAvenue)
        alert(`Redirecting to payment gateway...\nAmount: ₹${amount.toLocaleString("en-IN")}`);
        // TODO: Integrate payment gateway here
    };

    return (
        <div className="flex flex-col min-h-screen">
            <Navbar />

            {/* Hero */}
            <section className="relative pt-[72px]">
                <div className="gradient-navy py-20 md:py-24">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 mb-6">
                            <CreditCard className="w-8 h-8 text-gold" />
                        </div>
                        <span className="text-sm font-semibold uppercase tracking-wider text-gold">Secure Payment</span>
                        <h1 className="text-4xl md:text-5xl font-bold text-white mt-3">
                            Fee <span className="text-gold">Payment</span>
                        </h1>
                        <p className="text-white/60 text-lg mt-4 max-w-xl mx-auto">
                            Pay your school fees securely online using UPI, Net Banking, or Card. Instant receipt via email.
                        </p>
                        {/* Trust badges */}
                        <div className="flex flex-wrap items-center justify-center gap-4 mt-8">
                            {[
                                { icon: Shield, text: "SSL Secured" },
                                { icon: Lock, text: "256-bit Encryption" },
                                { icon: CheckCircle, text: "Instant Receipt" },
                            ].map((badge, i) => (
                                <div key={i} className="flex items-center gap-2 bg-white/10 rounded-full px-4 py-2">
                                    <badge.icon className="w-4 h-4 text-gold" />
                                    <span className="text-sm text-white/80 font-medium">{badge.text}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            <main className="flex-1 bg-gray-50">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
                    <div className="grid lg:grid-cols-5 gap-8">

                        {/* LEFT: Payment Form */}
                        <div className="lg:col-span-3 space-y-6">

                            {/* Student Details */}
                            <div className="bg-white rounded-2xl p-6 border border-gray-100">
                                <h2 className="font-bold text-navy text-lg mb-5 flex items-center gap-2">
                                    <span className="w-7 h-7 rounded-lg bg-navy text-white text-xs font-bold flex items-center justify-center">1</span>
                                    Student Information
                                </h2>
                                <div className="grid sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                                            Student Full Name <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Rahul Kumar"
                                            value={studentName}
                                            onChange={e => setStudentName(e.target.value)}
                                            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold transition-colors"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                                            Admission Number <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="e.g. IAS-2025-001"
                                            value={admissionNo}
                                            onChange={e => setAdmissionNo(e.target.value)}
                                            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold transition-colors"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                                            Class / Grade <span className="text-red-500">*</span>
                                        </label>
                                        <select
                                            value={studentClass}
                                            onChange={e => setStudentClass(e.target.value)}
                                            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold transition-colors bg-white"
                                            required
                                        >
                                            <option value="">Select Class</option>
                                            {["Nursery", "LKG", "UKG", ...Array.from({ length: 12 }, (_, i) => `Class ${i + 1}`)].map(c => (
                                                <option key={c} value={c}>{c}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                                            Parent&apos;s Phone <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="tel"
                                            placeholder="+91 98765 43210"
                                            value={parentPhone}
                                            onChange={e => setParentPhone(e.target.value)}
                                            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold transition-colors"
                                            required
                                        />
                                    </div>
                                    <div className="sm:col-span-2">
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                                            Parent&apos;s Email <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="email"
                                            placeholder="parent@example.com (receipt will be sent here)"
                                            value={parentEmail}
                                            onChange={e => setParentEmail(e.target.value)}
                                            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold transition-colors"
                                            required
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Fee Selection */}
                            <div className="bg-white rounded-2xl p-6 border border-gray-100">
                                <h2 className="font-bold text-navy text-lg mb-5 flex items-center gap-2">
                                    <span className="w-7 h-7 rounded-lg bg-navy text-white text-xs font-bold flex items-center justify-center">2</span>
                                    Select Fee Category
                                </h2>

                                <div className="space-y-2 mb-5">
                                    {feeCategories.map((fee) => (
                                        <label
                                            key={fee.id}
                                            className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all ${
                                                selectedFee === fee.id && !useCustom
                                                    ? "border-gold bg-gold/5"
                                                    : "border-gray-100 hover:border-gray-200"
                                            }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="radio"
                                                    name="fee"
                                                    value={fee.id}
                                                    checked={selectedFee === fee.id && !useCustom}
                                                    onChange={() => { setSelectedFee(fee.id); setUseCustom(false); }}
                                                    className="accent-gold"
                                                />
                                                <div>
                                                    <div className="text-sm font-medium text-navy">{fee.label}</div>
                                                    <div className="text-xs text-gray-400">{fee.term}</div>
                                                </div>
                                            </div>
                                            <span className="font-bold text-navy text-sm">
                                                ₹{fee.amount.toLocaleString("en-IN")}
                                            </span>
                                        </label>
                                    ))}

                                    {/* Custom Amount */}
                                    <label className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${useCustom ? "border-gold bg-gold/5" : "border-gray-100 hover:border-gray-200"}`}>
                                        <input
                                            type="radio"
                                            name="fee"
                                            checked={useCustom}
                                            onChange={() => setUseCustom(true)}
                                            className="accent-gold"
                                        />
                                        <div className="flex-1 flex items-center gap-3">
                                            <span className="text-sm font-medium text-navy">Custom Amount</span>
                                            {useCustom && (
                                                <div className="relative flex-1 max-w-xs">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">₹</span>
                                                    <input
                                                        type="number"
                                                        placeholder="Enter amount"
                                                        value={customAmount}
                                                        onChange={e => setCustomAmount(e.target.value)}
                                                        min={1}
                                                        className="w-full pl-8 pr-4 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </label>
                                </div>
                            </div>

                            {/* Payment Method */}
                            <div className="bg-white rounded-2xl p-6 border border-gray-100">
                                <h2 className="font-bold text-navy text-lg mb-5 flex items-center gap-2">
                                    <span className="w-7 h-7 rounded-lg bg-navy text-white text-xs font-bold flex items-center justify-center">3</span>
                                    Payment Method
                                </h2>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    {paymentMethods.map((method) => (
                                        <button
                                            key={method.id}
                                            onClick={() => setPaymentMethod(method.id)}
                                            className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${
                                                paymentMethod === method.id
                                                    ? "border-gold bg-gold/5"
                                                    : "border-gray-100 hover:border-gray-200"
                                            }`}
                                        >
                                            <method.icon className={`w-6 h-6 ${paymentMethod === method.id ? "text-gold" : "text-gray-400"}`} />
                                            <div className="text-xs font-semibold text-navy text-center">{method.label}</div>
                                            <div className="text-[10px] text-gray-400 text-center leading-tight">{method.desc}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Terms */}
                            <label className="flex items-start gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={agreed}
                                    onChange={e => setAgreed(e.target.checked)}
                                    className="mt-0.5 accent-gold w-4 h-4"
                                />
                                <span className="text-sm text-gray-600 leading-relaxed">
                                    I have read and agree to the{" "}
                                    <Link href="/terms" className="text-gold hover:underline font-medium">Terms &amp; Conditions</Link>,{" "}
                                    <Link href="/refund-policy" className="text-gold hover:underline font-medium">Refund Policy</Link>, and{" "}
                                    <Link href="/cancellation-policy" className="text-gold hover:underline font-medium">Cancellation Policy</Link> of International Access School.
                                </span>
                            </label>
                        </div>

                        {/* RIGHT: Order Summary + Pay Now */}
                        <div className="lg:col-span-2 space-y-5">
                            {/* Summary Card */}
                            <div className="bg-white rounded-2xl p-6 border border-gray-100 sticky top-24">
                                <h3 className="font-bold text-navy text-lg mb-5">Payment Summary</h3>

                                <div className="space-y-3 mb-5">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">Fee Category</span>
                                        <span className="font-medium text-navy text-right max-w-[180px] text-xs">
                                            {useCustom ? "Custom Amount" : selectedCategory?.label}
                                        </span>
                                    </div>
                                    {studentName && (
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-500">Student</span>
                                            <span className="font-medium text-navy">{studentName}</span>
                                        </div>
                                    )}
                                    {studentClass && (
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-500">Class</span>
                                            <span className="font-medium text-navy">{studentClass}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">Payment Via</span>
                                        <span className="font-medium text-navy capitalize">{paymentMethod}</span>
                                    </div>
                                </div>

                                <div className="border-t border-gray-100 pt-4 mb-6">
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-600 font-medium">Subtotal</span>
                                        <span className="text-navy font-semibold">₹{amount.toLocaleString("en-IN")}</span>
                                    </div>
                                    <div className="flex justify-between items-center mt-2">
                                        <span className="text-gray-500 text-sm">Gateway Fee</span>
                                        <span className="text-gray-400 text-sm">Included</span>
                                    </div>
                                    <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-100">
                                        <span className="text-navy font-bold text-lg">Total</span>
                                        <span className="text-navy font-black text-2xl">
                                            ₹{amount.toLocaleString("en-IN")}
                                        </span>
                                    </div>
                                </div>

                                {/* PAY NOW Button */}
                                <button
                                    onClick={handlePayNow}
                                    disabled={!agreed || amount <= 0}
                                    className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl bg-gold text-navy font-black text-lg hover:bg-gold/90 active:scale-[0.98] transition-all shadow-lg shadow-gold/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                                >
                                    <Lock className="w-5 h-5" />
                                    Pay Now ₹{amount.toLocaleString("en-IN")}
                                    <ArrowRight className="w-5 h-5" />
                                </button>

                                {/* Security Note */}
                                <div className="mt-4 flex items-start gap-2 bg-gray-50 rounded-xl p-3">
                                    <Shield className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                                    <p className="text-xs text-gray-500 leading-relaxed">
                                        Your payment is secured by 256-bit SSL encryption. We do not store your card or UPI details.
                                    </p>
                                </div>

                                {/* Payment Icons */}
                                <div className="mt-4 flex items-center justify-center gap-3 flex-wrap">
                                    {["UPI", "Visa", "MC", "RuPay", "Paytm"].map(p => (
                                        <span key={p} className="text-[10px] font-bold text-gray-400 border border-gray-200 rounded px-2 py-1 bg-white">
                                            {p}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {/* Help Box */}
                            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
                                <div className="flex gap-3">
                                    <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                                    <div>
                                        <h4 className="font-semibold text-navy text-sm mb-1">Need Help?</h4>
                                        <p className="text-xs text-gray-600 leading-relaxed mb-3">
                                            For payment issues or queries, contact our accounts department.
                                        </p>
                                        <div className="space-y-1">
                                            <a href="tel:+918406000830" className="block text-xs text-blue-600 hover:underline">
                                                📞 +91 84060 00830
                                            </a>
                                            <a href="mailto:info@iaschool.edu.in" className="block text-xs text-blue-600 hover:underline">
                                                ✉️ info@iaschool.edu.in
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Policy Links */}
                            <div className="bg-white rounded-2xl p-5 border border-gray-100">
                                <h4 className="font-semibold text-navy text-sm mb-3">Important Policies</h4>
                                <div className="space-y-2">
                                    {[
                                        { href: "/refund-policy", label: "Refund Policy" },
                                        { href: "/cancellation-policy", label: "Cancellation Policy" },
                                        { href: "/terms", label: "Terms & Conditions" },
                                        { href: "/privacy-policy", label: "Privacy Policy" },
                                    ].map(link => (
                                        <Link
                                            key={link.href}
                                            href={link.href}
                                            className="flex items-center justify-between text-xs text-gray-500 hover:text-gold transition-colors py-1.5 border-b border-gray-50 last:border-0"
                                        >
                                            {link.label}
                                            <ArrowRight className="w-3 h-3" />
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            <Footer />
        </div>
    );
}
