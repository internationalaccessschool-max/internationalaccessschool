"use client";

const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

function numberToWords(num: number): string {
    if (num === 0) return "Zero";
    const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
        "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
    const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
    const toWords = (n: number): string => {
        if (n < 20) return ones[n];
        if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
        if (n < 1000) return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + toWords(n % 100) : "");
        if (n < 100000) return toWords(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + toWords(n % 1000) : "");
        if (n < 10000000) return toWords(Math.floor(n / 100000)) + " Lakh" + (n % 100000 ? " " + toWords(n % 100000) : "");
        return toWords(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 ? " " + toWords(n % 10000000) : "");
    };
    return toWords(num);
}

export function SalarySlip({ record, teacher }: { record: any; teacher: any }) {
    const monthName = MONTHS[(record.month || 1) - 1];
    const year = record.year;
    const paidDate = record.paidOn?.toDate
        ? record.paidOn.toDate().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
        : "—";

    const perDayRate: number = record.perDayRate ?? 0;
    const presentDays: number = record.presentDays ?? 0;
    const leaveDays: number = record.leaveDays ?? 0;
    const holidayDays: number = record.holidayDays ?? 0;
    const absentDays: number = record.absentDays ?? 0;
    const lateToAbsent: number = record.lateToAbsent ?? Math.floor((record.lateDays ?? 0) / 3);
    const effectiveAbsents: number = record.effectiveAbsents ?? (absentDays + lateToAbsent);
    const deductibleDays: number = record.deductibleDays ?? Math.floor(effectiveAbsents / 3);
    const absentDeduction: number = record.absentDeduction ?? 0;
    const workingDays: number = record.workingDays ?? 0;
    const paidDays = presentDays + leaveDays + holidayDays;

    return (
        <div className="bg-white shadow-lg rounded-xl p-8 print:shadow-none print:rounded-none print:p-6 border border-gray-200">
            {/* Header */}
            <div className="flex items-center justify-between border-b-2 border-navy pb-4 mb-6">
                <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/LOGO.png" alt="Logo" className="w-14 h-14" />
                    <div>
                        <h1 className="text-xl font-bold text-navy">International Access School</h1>
                        <p className="text-xs text-gray-500">Shaping Global Leaders</p>
                    </div>
                </div>
                <div className="text-right">
                    <h2 className="text-lg font-bold text-navy">Salary Slip</h2>
                    <p className="text-sm text-gray-600">{monthName} {year}</p>
                    {record.receiptNo && <p className="text-xs text-gray-400 mt-1">Receipt: {record.receiptNo}</p>}
                </div>
            </div>

            {/* Employee Info */}
            <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
                <InfoRow label="Name" value={record.teacherName || "—"} />
                <InfoRow label="Designation" value={record.designation || "Teacher"} />
                <InfoRow label="Email" value={teacher?.email || "—"} />
                <InfoRow label="Employee ID" value={record.teacherId?.slice(0, 10) || "—"} />
                {teacher?.joiningDate && <InfoRow label="Joining Date" value={teacher.joiningDate} />}
                {teacher?.uanNumber && <InfoRow label="UAN" value={teacher.uanNumber} />}
                {teacher?.bankAccountNumber && <InfoRow label="A/C Number" value={teacher.bankAccountNumber} />}
                {teacher?.ifscCode && <InfoRow label="IFSC" value={teacher.ifscCode} />}
            </div>

            {/* Attendance Summary */}
            {workingDays > 0 && (
                <div className="bg-navy/5 rounded-xl p-4 mb-4">
                    <p className="text-xs font-bold text-navy mb-2 uppercase tracking-wide">Attendance — {monthName} {year}</p>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 text-center text-xs">
                        <div>
                            <div className="font-bold text-slate-700 text-base">{workingDays}</div>
                            <div className="text-gray-400">Working Days</div>
                        </div>
                        <div>
                            <div className="font-bold text-emerald-600 text-base">{presentDays}</div>
                            <div className="text-gray-400">Present</div>
                        </div>
                        <div>
                            <div className="font-bold text-blue-600 text-base">{leaveDays}</div>
                            <div className="text-gray-400">CL</div>
                        </div>
                        <div>
                            <div className="font-bold text-purple-600 text-base">{holidayDays}</div>
                            <div className="text-gray-400">Holiday</div>
                        </div>
                        <div>
                            <div className="font-bold text-amber-600 text-base">{record.lateDays ?? 0}</div>
                            <div className="text-gray-400">Late</div>
                        </div>
                        <div>
                            <div className="font-bold text-red-600 text-base">{absentDays}</div>
                            <div className="text-gray-400">Absent</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Per-Day Breakdown */}
            {perDayRate > 0 && (
                <div className="border border-indigo-100 bg-indigo-50/50 rounded-xl p-4 mb-4">
                    <p className="text-xs font-bold text-indigo-700 mb-2 uppercase tracking-wide">Daily Salary Breakdown</p>
                    <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between">
                            <span className="text-slate-500">Per Day Rate <span className="text-slate-400">(₹{(record.gross || 0).toLocaleString("en-IN")} ÷ {workingDays} days)</span></span>
                            <span className="font-bold text-indigo-600">₹{perDayRate.toLocaleString("en-IN")} / day</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-500">
                                Paid Days: Present ({presentDays}) + CL ({leaveDays}) + Holiday ({holidayDays}) = {paidDays} days
                            </span>
                            <span className="font-semibold text-emerald-600">₹{(paidDays * perDayRate).toLocaleString("en-IN")}</span>
                        </div>
                        {(absentDays > 0 || lateToAbsent > 0) && (
                            <>
                                {lateToAbsent > 0 && (
                                    <div className="flex justify-between">
                                        <span className="text-amber-600">
                                            Late: {record.lateDays ?? 0} days ÷ 3 = {lateToAbsent} extra absent count
                                        </span>
                                        <span className="text-amber-500 font-medium">+{lateToAbsent} absent</span>
                                    </div>
                                )}
                                <div className="flex justify-between">
                                    <span className="text-red-500">
                                        Effective Absent: {absentDays} + {lateToAbsent} = {effectiveAbsents} → ÷3 = {deductibleDays} day(s) cut × ₹{perDayRate.toLocaleString("en-IN")}
                                    </span>
                                    <span className="font-semibold text-red-500">−₹{absentDeduction.toLocaleString("en-IN")}</span>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Earnings & Deductions */}
            <div className="grid grid-cols-2 gap-6 mb-6">
                <div>
                    <h3 className="font-bold text-navy mb-2 pb-1 border-b border-gray-200">Earnings</h3>
                    <div className="space-y-1.5 text-sm">
                        <PayRow label="Basic Salary" value={record.basicSalary || 0} />
                        <PayRow label="HRA" value={record.hra || 0} />
                        <PayRow label="DA" value={record.da || 0} />
                        <PayRow label="Other Allowances" value={record.otherAllowances || 0} />
                        <div className="flex justify-between font-bold text-navy pt-2 border-t border-gray-200">
                            <span>Gross Earnings</span>
                            <span>₹{(record.gross || 0).toLocaleString("en-IN")}</span>
                        </div>
                    </div>
                </div>
                <div>
                    <h3 className="font-bold text-navy mb-2 pb-1 border-b border-gray-200">Deductions</h3>
                    <div className="space-y-1.5 text-sm">
                        <PayRow label={`PF (${record.pfPct || 0}%)`} value={record.pfDeduction || 0} />
                        <PayRow label={`ESIC (${record.esicPct || 0}%)`} value={record.esicDeduction || 0} />
                        {absentDeduction > 0 && (
                            <PayRow
                                label={`Absent Cut (${deductibleDays} day${deductibleDays !== 1 ? "s" : ""})`}
                                value={absentDeduction}
                                highlight
                            />
                        )}
                        {(record.otherDeductions || 0) > 0 && (
                            <PayRow label="Other" value={record.otherDeductions || 0} />
                        )}
                        <div className="flex justify-between font-bold text-red-600 pt-2 border-t border-gray-200">
                            <span>Total Deductions</span>
                            <span>₹{(record.totalDeductions || 0).toLocaleString("en-IN")}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Net Salary */}
            <div className="bg-emerald-50 border-2 border-emerald-500 rounded-xl p-4 mb-6">
                <div className="flex justify-between items-center">
                    <div>
                        <p className="text-xs text-emerald-700 font-semibold">NET SALARY PAYABLE</p>
                        <p className="text-xs text-emerald-600 italic mt-1">
                            {numberToWords(record.netSalary || 0)} Rupees Only
                        </p>
                    </div>
                    <p className="text-3xl font-bold text-emerald-700">₹{(record.netSalary || 0).toLocaleString("en-IN")}</p>
                </div>
            </div>

            {/* Payment Info */}
            {record.status === "paid" && (
                <div className="grid grid-cols-3 gap-4 mb-6 text-sm bg-gray-50 rounded-xl p-3">
                    <InfoRow label="Paid On" value={paidDate} />
                    <InfoRow label="Mode" value={record.paymentMode || "—"} />
                    {record.paymentRef && <InfoRow label="Reference" value={record.paymentRef} />}
                </div>
            )}

            {/* Footer */}
            <div className="mt-8 pt-4 border-t border-gray-200 flex justify-between items-end text-xs text-gray-500">
                <div>
                    <p>This is a computer-generated slip. No signature required.</p>
                    <p className="mt-1">Generated: {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</p>
                </div>
                <div className="text-right">
                    <div className="h-10 border-b border-gray-400 w-32" />
                    <p className="mt-1">Authorized Signature</p>
                </div>
            </div>
        </div>
    );
}

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wider">{label}</p>
            <p className="font-medium text-navy">{value}</p>
        </div>
    );
}

function PayRow({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
    return (
        <div className="flex justify-between">
            <span className={highlight ? "text-red-500 font-medium" : "text-gray-600"}>{label}</span>
            <span className={`font-medium ${highlight ? "text-red-500" : "text-navy"}`}>₹{value.toLocaleString("en-IN")}</span>
        </div>
    );
}
