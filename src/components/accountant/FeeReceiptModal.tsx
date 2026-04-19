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
    rollNo: string;          // admission number stored as rollNo
    class: string;
    section: string;
    parentEmail: string;
    parentPhone?: string;
    amount: number;
    previousDues?: number;
    totalAmount?: number;
    arrearsDetails?: string[]; // ["uid_2026_03", "uid_2026_02"] — parsed for month labels
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
    transportArrearsDetails?: string[];
    busNumber?: string;
    routeDetails?: string;
    isTransportOnly?: boolean;
    receiptType?: "school" | "transport";
    breakdown?: FeeRecordBreakdown;
    paymentMode?: "CASH" | "UPI" | "CHEQUE" | string;
}

interface FeeReceiptModalProps {
    record: FeeRecord | null;
    onClose: () => void;
}

const MONTHS = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

function parseArrearsMonths(details?: string[]): string[] {
    if (!details?.length) return [];
    return details.map(id => {
        const parts = id.split("_");
        const month = parseInt(parts[parts.length - 1]);
        const year = parseInt(parts[parts.length - 2]);
        if (isNaN(month) || isNaN(year) || month < 1 || month > 12) return "";
        return `${MONTHS[month - 1]} ${year}`;
    }).filter(Boolean);
}

export default function FeeReceiptModal({ record, onClose }: FeeReceiptModalProps) {
    if (!record) return null;

    const isTransportReceipt = record.receiptType === "transport";
    const feeMonthLabel = `${MONTHS[(record.month || 1) - 1]} ${record.year}`;

    // ── School fee breakdown ─────────────────────────────────────────────
    const tuitionFee = record.breakdown?.tuitionFee || record.amount || 0;
    const previousDues = record.previousDues || 0;
    const arrearsMonths = parseArrearsMonths(record.arrearsDetails);

    const schoolLineItems: { label: string; amount: number; note?: string; isArrears?: boolean }[] = [
        { label: `Tuition Fee — ${feeMonthLabel}`, amount: tuitionFee },
    ];

    // Add other non-zero breakdown fees (registration, sports, misc)
    const extras: [string, number | undefined][] = [
        ["Registration Fee", record.breakdown?.registrationFee],
        ["Sports Fee", record.breakdown?.sportsFee],
        ["Miscellaneous Fee", record.breakdown?.miscFee],
        ["Annual Fee", record.breakdown?.annualFee],
        ["Admission Fee", record.breakdown?.admissionFee],
    ];
    extras.forEach(([label, amt]) => {
        if (amt && amt > 0) schoolLineItems.push({ label, amount: amt });
    });

    // Arrears — broken down per month if available
    if (previousDues > 0) {
        if (arrearsMonths.length > 0) {
            // Show each arrears month as a separate line
            const perMonth = Math.round(previousDues / arrearsMonths.length);
            arrearsMonths.forEach((m, i) => {
                const amt = i === arrearsMonths.length - 1
                    ? previousDues - perMonth * (arrearsMonths.length - 1)
                    : perMonth;
                schoolLineItems.push({ label: `Arrears — ${m}`, amount: amt, isArrears: true });
            });
        } else {
            schoolLineItems.push({ label: "Previous Dues (Arrears)", amount: previousDues, isArrears: true });
        }
    }

    // ── Transport fee breakdown ──────────────────────────────────────────
    const transportBase = record.transportFeeAmount || 0;
    const transportPrev = record.transportPreviousDues || 0;
    const transportTotal = record.transportTotalAmount || transportBase + transportPrev;
    const transportArrearsMonths = parseArrearsMonths(record.transportArrearsDetails);

    const transportLineItems: { label: string; amount: number; isArrears?: boolean }[] = [
        { label: `Transport / Bus Fee — ${feeMonthLabel}`, amount: transportBase },
    ];
    if (transportPrev > 0) {
        if (transportArrearsMonths.length > 0) {
            const perMonth = Math.round(transportPrev / transportArrearsMonths.length);
            transportArrearsMonths.forEach((m, i) => {
                const amt = i === transportArrearsMonths.length - 1
                    ? transportPrev - perMonth * (transportArrearsMonths.length - 1)
                    : perMonth;
                transportLineItems.push({ label: `Transport Arrears — ${m}`, amount: amt, isArrears: true });
            });
        } else {
            transportLineItems.push({ label: "Previous Transport Dues (Arrears)", amount: transportPrev, isArrears: true });
        }
    }

    const lineItems = isTransportReceipt ? transportLineItems : schoolLineItems;
    const displayAmount = isTransportReceipt ? transportTotal : (record.totalAmount || tuitionFee + previousDues);
    const displayReceiptNo = isTransportReceipt ? (record.transportReceiptNo || "N/A") : (record.receiptNo || "N/A");
    const displayPaidOn = record.paidOn?.toDate
        ? record.paidOn.toDate().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
        : "N/A";

    const handlePrint = () => {
        const printItems = lineItems.map(({ label, amount }) => ({ label, amount }));
        const allArrearsMonths = isTransportReceipt ? transportArrearsMonths : arrearsMonths;

        const html = buildReceiptHTML({
            title: isTransportReceipt ? "Transport Fee Receipt" : "School Fee Receipt",
            receiptNo: displayReceiptNo,
            studentName: record.studentName || "—",
            classSection: `${record.class || "—"}${record.section ? ` - ${record.section}` : ""}`,
            admissionNo: record.rollNo || undefined,
            rollNo: record.rollNo || undefined,
            paidOn: displayPaidOn,
            feeMonth: feeMonthLabel,
            lineItems: printItems,
            totalAmount: displayAmount,
            paymentMode: record.paymentMode,
            arrearsMonths: allArrearsMonths.length > 0 ? allArrearsMonths : undefined,
            extraInfo: isTransportReceipt && record.busNumber && record.busNumber !== "—"
                ? [{ label: "Bus No.", value: `${record.busNumber}${record.routeDetails ? ` — ${record.routeDetails}` : ""}` }]
                : [],
        });
        printReceiptHTML(html, isTransportReceipt ? "Transport Fee Receipt" : "School Fee Receipt");
    };

    const fmtAmt = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
                            className="inline-flex items-center gap-2 px-4 py-2 bg-navy text-white text-sm font-medium rounded-xl hover:bg-navy-light transition-colors">
                            <Printer className="w-4 h-4" /> Print / PDF
                        </button>
                        <button onClick={onClose}
                            className="p-2 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                <div className="p-8 bg-white">
                    {/* School Header */}
                    <div className="text-center border-b-2 border-navy/20 pb-5 mb-6">
                        <h1 className="text-2xl font-extrabold text-navy tracking-tight uppercase">International Access School</h1>
                        <p className="text-sm text-gray-500 mt-1">Atarsua, Siwan, Bihar, India — 841227</p>
                        <p className="text-xs text-gray-400 mt-0.5">+91 84060 00830 | info@iaschool.edu.in</p>
                        <div className={`inline-flex items-center gap-2 mt-3 px-4 py-1.5 text-xs font-bold uppercase tracking-widest border rounded-full
                            ${isTransportReceipt ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-navy/5 text-navy border-navy/10"}`}>
                            {isTransportReceipt ? <Bus className="w-3.5 h-3.5" /> : <School className="w-3.5 h-3.5" />}
                            {isTransportReceipt ? "Transport Fee Receipt" : "School Fee Receipt"}
                        </div>
                    </div>

                    {/* Info Grid */}
                    <div className="grid grid-cols-2 gap-6 mb-6 text-sm">
                        <div className="space-y-3">
                            <InfoRow label="Receipt No" value={<span className="font-mono font-bold text-navy">{displayReceiptNo}</span>} />
                            <InfoRow label="Student Name" value={<span className="font-bold text-gray-800">{record.studentName}</span>} />
                            <InfoRow label="Admission No" value={
                                <span className="font-bold text-navy">{record.rollNo || "—"}</span>
                            } highlight />
                            <InfoRow label="Class / Section" value={`${record.class}${record.section ? ` - ${record.section}` : ""}`} />
                            {isTransportReceipt && record.busNumber && record.busNumber !== "—" && (
                                <InfoRow label="Bus No." value={`${record.busNumber}${record.routeDetails ? ` — ${record.routeDetails}` : ""}`} />
                            )}
                        </div>
                        <div className="space-y-3 text-right">
                            <InfoRow label="Date of Payment" value={displayPaidOn} right />
                            <InfoRow label="Fee Month" value={<span className="font-bold text-navy">{feeMonthLabel}</span>} right />
                            <InfoRow label="Payment Mode" value={
                                <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    PAID · {record.paymentMode || "CASH"}
                                </span>
                            } right />
                            <InfoRow label="Fee Type" value={isTransportReceipt ? "Transport Fee" : "School Fee"} right />
                        </div>
                    </div>

                    {/* Arrears summary banner */}
                    {(isTransportReceipt ? transportPrev : previousDues) > 0 && (
                        <div className="mb-4 px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-100 text-xs text-rose-700">
                            <span className="font-bold">Arrears included:</span>{" "}
                            {(isTransportReceipt ? transportArrearsMonths : arrearsMonths).length > 0
                                ? (isTransportReceipt ? transportArrearsMonths : arrearsMonths).join(", ")
                                : `${isTransportReceipt ? transportPrev : previousDues} unpaid from previous months`
                            }
                        </div>
                    )}

                    {/* Breakdown Table */}
                    <div className="border rounded-xl overflow-hidden border-gray-200">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase w-12">S.No</th>
                                    <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase">Particulars</th>
                                    <th className="px-5 py-3 text-right text-xs font-bold text-gray-500 uppercase">Amount (₹)</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-100">
                                {lineItems.map((item, i) => (
                                    <tr key={i} className={item.isArrears ? "bg-rose-50/40" : ""}>
                                        <td className="px-5 py-3 text-gray-400">{i + 1}.</td>
                                        <td className={`px-5 py-3 font-medium ${item.isArrears ? "text-rose-700" : "text-gray-800"}`}>
                                            {item.label}
                                            {item.isArrears && <span className="ml-2 text-xs bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded-full font-semibold">Arrears</span>}
                                        </td>
                                        <td className={`px-5 py-3 text-right font-semibold ${item.isArrears ? "text-rose-600" : "text-gray-700"}`}>
                                            {fmtAmt(item.amount)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                                <tr>
                                    <th colSpan={2} className="px-5 py-4 text-right font-extrabold text-navy text-sm uppercase">Total Amount Paid</th>
                                    <td className="px-5 py-4 text-right font-extrabold text-navy text-lg">{fmtAmt(displayAmount)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    {/* Signature */}
                    <div className="mt-10 pt-6 flex justify-end border-t border-dashed border-gray-200">
                        <div className="text-center">
                            <strong className="text-base font-bold text-navy opacity-20 block mb-1">IAS</strong>
                            <div className="w-36 border-b border-gray-400 mb-2"></div>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Authorized Signatory</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function InfoRow({ label, value, right, highlight }: {
    label: string; value: React.ReactNode; right?: boolean; highlight?: boolean;
}) {
    return (
        <div>
            <p className={`text-gray-400 text-xs font-semibold uppercase tracking-wider mb-0.5 ${right ? "text-right" : ""}`}>{label}</p>
            <div className={`font-medium text-gray-700 ${right ? "flex justify-end" : ""} ${highlight ? "text-navy font-bold" : ""}`}>
                {value}
            </div>
        </div>
    );
}
