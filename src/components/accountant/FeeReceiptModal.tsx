"use client";

import { X, Printer, Bus, School } from "lucide-react";
import { printReceiptHTML, buildReceiptHTML } from "@/lib/print-receipt";

interface FeeRecordBreakdown {
    tuitionFee?: number;
    annualFee?: number;
    admissionFee?: number;
    transportFee?: number;
    registrationFee?: number;
    sportsFee?: number;
    miscFee?: number;
}

interface FeeRecord {
    id: string;
    studentName: string;
    rollNo: string;
    class: string;
    section: string;
    parentEmail: string;
    parentPhone?: string;
    amount: number;
    previousDues?: number;   // unpaid previous months carried forward
    totalAmount?: number;    // amount + previousDues
    month: number;
    year: number;
    dueDate: { toDate: () => Date } | null;
    status: "pending" | "paid" | "overdue" | "carried_forward";
    paidOn: { toDate: () => Date } | null;
    receiptNo: string | null;
    // Transport fields
    transportStatus?: "pending" | "paid" | "overdue" | "carried_forward";
    transportFeeAmount?: number;
    transportPreviousDues?: number;
    transportTotalAmount?: number;
    transportReceiptNo?: string | null;
    isTransportOnly?: boolean;
    receiptType?: "school" | "transport";
    breakdown?: FeeRecordBreakdown;
    paymentMode?: "CASH" | "UPI";
}

interface FeeReceiptModalProps {
    record: FeeRecord | null;
    onClose: () => void;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function FeeReceiptModal({ record, onClose }: FeeReceiptModalProps) {
    if (!record) return null;

    const isTransportReceipt = record.receiptType === "transport";

    // Build school fee breakdown for preview
    const schoolBreakdownItems: { label: string; amount: number }[] = [
        { label: "Tuition Fee", amount: record.breakdown?.tuitionFee || 0 },
        { label: "Annual Fee", amount: record.breakdown?.annualFee || 0 },
        { label: "Admission Fee", amount: record.breakdown?.admissionFee || 0 },
        { label: "Registration Fee", amount: record.breakdown?.registrationFee || 0 },
        { label: "Sports Fee", amount: record.breakdown?.sportsFee || 0 },
        { label: "Miscellaneous Fee", amount: record.breakdown?.miscFee || 0 },
    ].filter(item => item.amount > 0);

    if (!isTransportReceipt && schoolBreakdownItems.length === 0) {
        schoolBreakdownItems.push({ label: "School Fee (Current Month)", amount: record.amount });
    }

    // Append Previous Dues (Arrears) line if present
    const previousDues = isTransportReceipt
        ? (record.transportPreviousDues || 0)
        : (record.previousDues || 0);
    if (previousDues > 0 && !isTransportReceipt) {
        schoolBreakdownItems.push({ label: "Previous Dues (Arrears)", amount: previousDues });
    }

    const transportAmount = isTransportReceipt
        ? (record.transportTotalAmount || record.transportFeeAmount || 0)
        : (record.transportFeeAmount || 0);
    const displayReceiptNo = isTransportReceipt ? (record.transportReceiptNo || "N/A") : (record.receiptNo || "N/A");
    const displayAmount = isTransportReceipt ? transportAmount : (record.totalAmount || record.amount);
    const displayPaidOn = record.paidOn?.toDate
        ? record.paidOn.toDate().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
        : "N/A";
    const feeMonth = `${MONTHS[(record.month || 1) - 1]} ${record.year}`;

    const handlePrint = () => {
        let lineItems = isTransportReceipt
            ? [{ label: "Transport / Bus Fee (Current Month)", amount: record.transportFeeAmount || 0 }]
            : schoolBreakdownItems;

        // Transport arrears line on print too
        if (isTransportReceipt && (record.transportPreviousDues || 0) > 0) {
            lineItems = [
                ...lineItems,
                { label: "Previous Transport Dues (Arrears)", amount: record.transportPreviousDues! },
            ];
        }

        const html = buildReceiptHTML({
            title: isTransportReceipt ? "Transport Fee Receipt" : "School Fee Receipt",
            receiptNo: displayReceiptNo,
            studentName: record.studentName || "—",
            classSection: `Class ${record.class || "—"}${record.section ? ` - ${record.section}` : ""}`,
            rollNo: record.rollNo || undefined,
            paidOn: displayPaidOn,
            feeMonth,
            lineItems,
            totalAmount: displayAmount,
            paymentMode: record.paymentMode
        });
        printReceiptHTML(html, isTransportReceipt ? "Transport Fee Receipt" : "School Fee Receipt");
    };

    const fmtAmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto relative flex flex-col">
                {/* Header */}
                <div className="sticky top-0 bg-gray-50/90 backdrop-blur-md px-6 py-4 border-b border-gray-100 flex items-center justify-between z-10 rounded-t-2xl">
                    <div className="flex items-center gap-2">
                        {isTransportReceipt
                            ? <Bus className="w-5 h-5 text-indigo-500" />
                            : <School className="w-5 h-5 text-navy" />}
                        <h2 className="text-lg font-bold text-navy">
                            {isTransportReceipt ? "Transport Fee Receipt" : "School Fee Receipt"}
                        </h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={handlePrint}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-navy text-white text-sm font-medium rounded-xl hover:bg-navy-light transition-colors shadow-sm shadow-navy/20">
                            <Printer className="w-4 h-4" />
                            Print / Download PDF
                        </button>
                        <button onClick={onClose}
                            className="p-2 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Preview Content */}
                <div className="p-8 sm:p-10 bg-white">
                    {/* School Header */}
                    <div className="text-center border-b-2 border-navy/20 pb-6 mb-8">
                        <h1 className="text-3xl font-extrabold text-navy tracking-tight uppercase">International Access School</h1>
                        <p className="text-sm text-gray-500 mt-2 font-medium">Atarsua, Siwan, Bihar, India, 841227</p>
                        <p className="text-xs text-gray-400 mt-1">Phone: +91 84060 00830 | Email: info@iaschool.edu.in</p>
                        <div className={`inline-flex items-center gap-2 mt-4 px-4 py-1.5 text-sm font-bold uppercase tracking-widest border rounded-full
                            ${isTransportReceipt ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-navy/5 text-navy border-navy/10"}`}>
                            {isTransportReceipt ? <Bus className="w-4 h-4" /> : <School className="w-4 h-4" />}
                            {isTransportReceipt ? "Transport Fee Receipt" : "School Fee Receipt"}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-8 mb-8 text-sm">
                        <div className="space-y-4">
                            <div>
                                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Receipt Number</p>
                                <p className="font-mono text-base font-bold text-navy">{displayReceiptNo}</p>
                            </div>
                            <div>
                                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Student Name</p>
                                <p className="font-bold text-gray-800 text-base">{record.studentName}</p>
                            </div>
                            <div>
                                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Class / Section</p>
                                <p className="font-semibold text-gray-800">Class {record.class} {record.section ? `- ${record.section}` : ""}</p>
                            </div>
                            {record.rollNo && (
                                <div>
                                    <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Admission No</p>
                                    <p className="font-semibold text-gray-800">{record.rollNo}</p>
                                </div>
                            )}
                        </div>
                        <div className="space-y-4 text-right">
                            <div>
                                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Date of Payment</p>
                                <p className="font-semibold text-gray-800">{displayPaidOn}</p>
                            </div>
                            <div>
                                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Fee Month</p>
                                <p className="font-bold text-navy text-base">{feeMonth}</p>
                            </div>
                            <div>
                                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Payment Status / Mode</p>
                                <div className="flex items-end flex-col gap-1">
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 uppercase tracking-widest border border-emerald-200">
                                        Paid Successfully
                                    </span>
                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                                        Via {record.paymentMode || "CASH"}
                                    </span>
                                </div>
                            </div>
                            <div>
                                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Fee Type</p>
                                <p className="font-semibold text-gray-700">{isTransportReceipt ? "Transport Fee" : "School Fee"}</p>
                            </div>
                        </div>
                    </div>

                    {/* Breakdown Table */}
                    <div className="mt-8 border rounded-xl overflow-hidden border-gray-200">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase w-16">S.No</th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">Particulars</th>
                                    <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase">Amount (₹)</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-100">
                                {isTransportReceipt ? (
                                    <>
                                        <tr>
                                            <td className="px-6 py-4 text-gray-500">1.</td>
                                            <td className="px-6 py-4 font-medium text-gray-800">Transport / Bus Fee (Current Month)</td>
                                            <td className="px-6 py-4 text-right font-medium text-gray-600">{fmtAmt(record.transportFeeAmount || 0)}</td>
                                        </tr>
                                        {(record.transportPreviousDues || 0) > 0 && (
                                            <tr>
                                                <td className="px-6 py-4 text-gray-500">2.</td>
                                                <td className="px-6 py-4 font-medium text-rose-600">Previous Transport Dues (Arrears)</td>
                                                <td className="px-6 py-4 text-right font-medium text-rose-600">{fmtAmt(record.transportPreviousDues!)}</td>
                                            </tr>
                                        )}
                                    </>
                                ) : schoolBreakdownItems.map((item, i) => (
                                    <tr key={i}>
                                        <td className="px-6 py-4 text-gray-500">{i + 1}.</td>
                                        <td className="px-6 py-4 font-medium text-gray-800">{item.label}</td>
                                        <td className="px-6 py-4 text-right font-medium text-gray-600">{fmtAmt(item.amount)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-gray-50/80 border-t-2 border-gray-200">
                                <tr>
                                    <th colSpan={2} className="px-6 py-5 text-right font-extrabold text-navy text-base uppercase">Total Amount Paid</th>
                                    <td className="px-6 py-5 text-right font-extrabold text-navy text-lg">₹{fmtAmt(displayAmount)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    {/* Signatures */}
                    <div className="mt-20 pt-8 flex justify-between items-end border-t border-dashed border-gray-300">
                        <div className="text-center">
                            <div className="w-32 border-b border-gray-400 mb-2"></div>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Parent/Guardian Sign</p>
                        </div>
                        <div className="text-center">
                            <strong className="text-lg font-bold text-navy opacity-30 block mb-1">IAS Auth</strong>
                            <div className="w-40 border-b border-gray-400 mb-2"></div>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Authorized Signatory</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
