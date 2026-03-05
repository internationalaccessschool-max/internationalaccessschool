"use client";

import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import {
    UploadCloud, FileSpreadsheet, Loader2, CheckCircle,
    AlertCircle, Trash2, Download, Info, BadgeCheck, XCircle
} from "lucide-react";
import Link from "next/link";

// ── Template Columns ───────────────────────────────────────────────────────
const TEMPLATE_HEADERS = [
    // Required
    "firstName", "lastName", "email", "phone", "subjects", "password",
    // Basic / Employment (optional)
    "qualification", "designation", "joiningDate", "basicSalary",
    // Personal (optional)
    "dob", "gender", "bloodGroup", "socialCategory",
    "fatherName", "emergencyContact", "permanentAddress",
    // Documents (optional)
    "panNumber", "aadhaarNumber",
    // Bank (optional)
    "bankName", "bankAccountNumber", "ifscCode", "uanNumber", "epfNumber",
    "pfJoiningDate", "esicJoiningDate",
];

const SAMPLE_ROWS = [[
    // Required
    "Priya", "Sharma", "priya.sharma@school.edu", "9876543210", "Mathematics;Physics", "TempPass@123",
    // Employment
    "B.Ed, M.Sc", "PGT", "2024-06-01", "35000",
    // Personal
    "15-03-1990", "Female", "B+", "General", "Ramesh Sharma", "9876500000", "12 MG Road, Delhi",
    // Documents
    "ABCDE1234F", "123456789012",
    // Bank
    "SBI", "1234567890", "SBIN0001234", "100123456789", "AAB0000000001",
    "2021-06-01", "2021-06-01",
]];

function downloadTemplate() {
    const notesData = [
        ["Column", "Required?", "Notes / Format"],
        ["firstName", "YES", "Teacher's first name"],
        ["lastName", "YES", "Teacher's last name"],
        ["email", "YES", "Valid email — used as login ID"],
        ["phone", "YES", "10-digit mobile number"],
        ["subjects", "YES", "Separate multiple with semicolon (;) e.g. Mathematics;Physics"],
        ["password", "YES", "Temporary login password (min 6 chars)"],
        ["qualification", "No", "e.g. B.Ed, M.Sc, PhD"],
        ["designation", "No", "e.g. PGT, TGT, Assistant Teacher"],
        ["joiningDate", "No", "YYYY-MM-DD format e.g. 2024-06-01"],
        ["basicSalary", "No", "Monthly basic salary as number e.g. 35000"],
        ["dob", "No", "Date of birth in DD-MM-YYYY format e.g. 15-03-1990"],
        ["gender", "No", "Male / Female / Other"],
        ["bloodGroup", "No", "A+ / A- / B+ / B- / AB+ / AB- / O+ / O-"],
        ["socialCategory", "No", "General / OBC / SC / ST / Other"],
        ["fatherName", "No", "Father's full name"],
        ["emergencyContact", "No", "Emergency contact number"],
        ["permanentAddress", "No", "Full permanent address"],
        ["panNumber", "No", "PAN number e.g. ABCDE1234F"],
        ["aadhaarNumber", "No", "12-digit Aadhaar number"],
        ["bankName", "No", "Bank name e.g. SBI, HDFC"],
        ["bankAccountNumber", "No", "Bank account number"],
        ["ifscCode", "No", "Bank IFSC code e.g. SBIN0001234"],
        ["uanNumber", "No", "UAN (Universal Account Number) for PF"],
        ["epfNumber", "No", "EPF member number (differs from UAN)"],
        ["pfJoiningDate", "No", "PF joining date in YYYY-MM-DD format e.g. 2021-06-01"],
        ["esicJoiningDate", "No", "ESIC joining date in YYYY-MM-DD format e.g. 2021-06-01"],
    ];

    const wsData = [TEMPLATE_HEADERS, ...SAMPLE_ROWS];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = TEMPLATE_HEADERS.map((h) =>
        ["permanentAddress", "email"].includes(h) ? { wch: 35 } : { wch: 22 }
    );
    const wsNotes = XLSX.utils.aoa_to_sheet(notesData);
    wsNotes["!cols"] = [{ wch: 22 }, { wch: 12 }, { wch: 55 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Teacher Data");
    XLSX.utils.book_append_sheet(wb, wsNotes, "Column Guide");
    XLSX.writeFile(wb, "teacher_import_template.xlsx");
}

// ── Types ──────────────────────────────────────────────────────────────────
interface TeacherRow {
    // Required
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    subjects: string;
    password: string;
    // Optional
    qualification?: string;
    designation?: string;
    joiningDate?: string;
    basicSalary?: string;
    dob?: string;
    gender?: string;
    bloodGroup?: string;
    socialCategory?: string;
    fatherName?: string;
    emergencyContact?: string;
    permanentAddress?: string;
    panNumber?: string;
    aadhaarNumber?: string;
    bankName?: string;
    bankAccountNumber?: string;
    ifscCode?: string;
    uanNumber?: string;
    epfNumber?: string;
    pfJoiningDate?: string;
    esicJoiningDate?: string;
}

interface AnnotatedRow {
    data: TeacherRow;
    status: "new" | "invalid" | "duplicate";
    reason?: string;
}

const REQUIRED = ["firstName", "lastName", "email", "phone", "subjects", "password"];

// ── Component ──────────────────────────────────────────────────────────────
export default function TeacherImportPage() {
    const [rows, setRows] = useState<AnnotatedRow[]>([]);
    const [isParsing, setIsParsing] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [uploadStatus, setUploadStatus] = useState<{ type: "success" | "error" | null; message: string }>({ type: null, message: "" });
    const [fileName, setFileName] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
            setUploadStatus({ type: "error", message: "Only .xlsx and .xls files are supported." });
            return;
        }

        setFileName(file.name);
        setIsParsing(true);
        setRows([]);
        setUploadStatus({ type: null, message: "" });

        try {
            const buffer = await file.arrayBuffer();
            const wb = XLSX.read(buffer, { type: "array", raw: false });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rawData: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

            if (rawData.length === 0) {
                setUploadStatus({ type: "error", message: "File is empty." });
                setIsParsing(false);
                return;
            }

            const headers = Object.keys(rawData[0]);
            const missing = REQUIRED.filter((h) => !headers.includes(h));
            if (missing.length > 0) {
                setUploadStatus({ type: "error", message: `Missing required columns: ${missing.join(", ")}` });
                setIsParsing(false);
                return;
            }

            const seenEmails = new Set<string>();

            const annotated: AnnotatedRow[] = rawData.map((row): AnnotatedRow => {
                const str = (k: string) => String(row[k] ?? "").trim();

                const data: TeacherRow = {
                    firstName: str("firstName"),
                    lastName: str("lastName"),
                    email: str("email").toLowerCase(),
                    phone: str("phone"),
                    subjects: str("subjects"),
                    password: str("password"),
                    qualification: str("qualification"),
                    designation: str("designation"),
                    joiningDate: str("joiningDate"),
                    basicSalary: str("basicSalary"),
                    dob: str("dob"),
                    gender: str("gender"),
                    bloodGroup: str("bloodGroup"),
                    socialCategory: str("socialCategory"),
                    fatherName: str("fatherName"),
                    emergencyContact: str("emergencyContact"),
                    permanentAddress: str("permanentAddress"),
                    panNumber: str("panNumber"),
                    aadhaarNumber: str("aadhaarNumber"),
                    bankName: str("bankName"),
                    bankAccountNumber: str("bankAccountNumber"),
                    ifscCode: str("ifscCode"),
                    uanNumber: str("uanNumber"),
                    epfNumber: str("epfNumber"),
                    pfJoiningDate: str("pfJoiningDate"),
                    esicJoiningDate: str("esicJoiningDate"),
                };

                // Validation
                if (!data.firstName || !data.lastName)
                    return { data, status: "invalid", reason: "First & Last name required" };
                if (!data.email || !/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(data.email))
                    return { data, status: "invalid", reason: "Invalid email format" };
                if (!data.phone || data.phone.replace(/\D/g, "").length < 10)
                    return { data, status: "invalid", reason: "Phone must be at least 10 digits" };
                if (!data.subjects)
                    return { data, status: "invalid", reason: "At least one subject required" };
                if (!data.password || data.password.length < 6)
                    return { data, status: "invalid", reason: "Password min 6 characters" };

                if (seenEmails.has(data.email))
                    return { data, status: "duplicate", reason: "Email duplicated within this file" };
                seenEmails.add(data.email);

                return { data, status: "new" };
            });

            setRows(annotated);
        } catch (err: any) {
            setUploadStatus({ type: "error", message: `Failed to parse file: ${err.message}` });
        } finally {
            setIsParsing(false);
        }
    };

    const handleImport = async () => {
        const toImport = rows.filter((r) => r.status === "new");
        if (toImport.length === 0) return;
        setIsImporting(true);
        setUploadStatus({ type: null, message: "" });

        try {
            const res = await fetch("/api/admin/bulk-register-teachers", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ teachers: toImport.map((r) => r.data) }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || "Import failed");
            setUploadStatus({
                type: "success",
                message: `✅ ${result.successCount} teacher(s) imported successfully.${result.errors?.length ? ` ${result.errors.length} failed.` : ""}`,
            });
            setRows([]);
            setFileName(null);
            if (fileRef.current) fileRef.current.value = "";
        } catch (err: any) {
            setUploadStatus({ type: "error", message: err.message });
        } finally {
            setIsImporting(false);
        }
    };

    const handleClear = () => {
        setRows([]);
        setFileName(null);
        setUploadStatus({ type: null, message: "" });
        if (fileRef.current) fileRef.current.value = "";
    };

    const counts = {
        total: rows.length,
        new: rows.filter((r) => r.status === "new").length,
        invalid: rows.filter((r) => r.status === "invalid").length,
        duplicate: rows.filter((r) => r.status === "duplicate").length,
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="rounded-2xl gradient-navy p-6 md:p-8 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.2) 0%, transparent 50%)` }} />
                <div className="relative z-10 flex items-center justify-between gap-4 flex-wrap">
                    <div>
                        <p className="text-white/50 text-sm font-medium">Admin Console · Teachers</p>
                        <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">Bulk Import Teachers</h1>
                        <p className="text-white/40 text-sm mt-1">Upload an Excel file to register multiple teachers with full details at once.</p>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={downloadTemplate}
                            className="flex items-center gap-2 px-4 py-2.5 bg-gold hover:bg-gold/90 text-navy rounded-xl font-semibold text-sm transition-all">
                            <Download className="w-4 h-4" /> Download Template
                        </button>
                        <Link href="/admin/teachers"
                            className="px-4 py-2.5 rounded-xl border border-white/20 text-white text-sm font-semibold hover:bg-white/10 transition-colors">
                            ← Back
                        </Link>
                    </div>
                </div>
            </div>

            {/* Info Banner */}
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
                <div className="flex items-start gap-3">
                    <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                    <div className="text-sm text-blue-700">
                        <p className="font-semibold mb-2">How to import teachers</p>
                        <p className="mb-3">Download the template, fill in teacher details in Excel, then upload here. The template includes a <strong>Column Guide</strong> sheet explaining every field.</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
                            <div>
                                <p className="font-bold text-blue-800 text-xs uppercase tracking-wide mb-1">Required columns *</p>
                                {["firstName", "lastName", "email", "phone", "subjects (separate with ;)", "password"].map((h) => (
                                    <p key={h} className="font-mono text-red-600 text-xs">• {h}</p>
                                ))}
                            </div>
                            <div>
                                <p className="font-bold text-blue-800 text-xs uppercase tracking-wide mb-1">Optional columns</p>
                                {["qualification, designation", "joiningDate, basicSalary", "dob, gender, bloodGroup", "socialCategory, fatherName", "panNumber, aadhaarNumber", "bankName, bankAccountNumber, ifscCode", "uanNumber, epfNumber"].map((h) => (
                                    <p key={h} className="font-mono text-blue-600 text-xs">• {h}</p>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
                {/* Upload Panel */}
                <div className="lg:col-span-1 space-y-4">
                    <label>
                        <div className={`bg-white border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${isParsing ? "border-blue-300 bg-blue-50/50" : "border-gray-200 hover:border-navy hover:bg-gray-50"}`}>
                            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" disabled={isParsing || isImporting} />
                            <div className="flex flex-col items-center gap-3">
                                <div className={`w-14 h-14 rounded-full flex items-center justify-center ${isParsing ? "bg-blue-100" : "bg-gray-100"}`}>
                                    {isParsing ? <Loader2 className="w-6 h-6 animate-spin text-blue-500" /> : <UploadCloud className="w-6 h-6 text-gray-400" />}
                                </div>
                                <div>
                                    <p className="font-bold text-navy">Click to Upload</p>
                                    <p className="text-xs text-gray-400 mt-1">.xlsx / .xls only</p>
                                </div>
                            </div>
                        </div>
                    </label>

                    {fileName && (
                        <div className="flex items-center gap-2 bg-white border border-gray-100 rounded-xl p-3 text-sm">
                            <FileSpreadsheet className="w-4 h-4 text-emerald-500 shrink-0" />
                            <span className="truncate font-medium text-gray-600">{fileName}</span>
                        </div>
                    )}

                    {rows.length > 0 && (
                        <div className="flex gap-3">
                            <button onClick={handleClear} disabled={isImporting}
                                className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-500 hover:text-red-500 hover:border-red-200 hover:bg-red-50 rounded-xl text-sm font-medium transition-all">
                                <Trash2 className="w-4 h-4" /> Clear
                            </button>
                            <button onClick={handleImport} disabled={isImporting || counts.new === 0}
                                className="flex-1 flex items-center justify-center gap-2 bg-navy hover:bg-navy/90 text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-50">
                                {isImporting ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing...</> : `Import ${counts.new} Teacher${counts.new !== 1 ? "s" : ""}`}
                            </button>
                        </div>
                    )}

                    {uploadStatus.type === "error" && (
                        <div className="p-4 rounded-xl bg-red-50 border border-red-100 text-red-600 flex items-start gap-3 text-sm">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>{uploadStatus.message}</span>
                        </div>
                    )}
                    {uploadStatus.type === "success" && (
                        <div className="p-4 rounded-xl bg-green-50 border border-green-100 text-green-700 flex items-start gap-3 text-sm">
                            <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>{uploadStatus.message}</span>
                        </div>
                    )}
                </div>

                {/* Preview Table */}
                <div className="lg:col-span-2">
                    <div className="bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden min-h-[400px]">
                        {rows.length > 0 && (
                            <div className="flex flex-wrap items-center gap-4 px-5 py-4 bg-gray-50 border-b border-gray-100 text-sm">
                                <div><span className="text-gray-500">Total: </span><span className="font-bold text-navy">{counts.total}</span></div>
                                <div className="flex items-center gap-1.5"><BadgeCheck className="w-4 h-4 text-emerald-500" /><span className="text-gray-500">Ready: </span><span className="font-bold text-emerald-600">{counts.new}</span></div>
                                {counts.invalid > 0 && <div className="flex items-center gap-1.5"><XCircle className="w-4 h-4 text-red-500" /><span className="text-gray-500">Invalid: </span><span className="font-bold text-red-600">{counts.invalid}</span></div>}
                                {counts.duplicate > 0 && <div className="flex items-center gap-1.5"><XCircle className="w-4 h-4 text-amber-500" /><span className="text-gray-500">Duplicate: </span><span className="font-bold text-amber-600">{counts.duplicate}</span></div>}
                            </div>
                        )}

                        {rows.length > 0 ? (
                            <div className="overflow-x-auto max-h-[550px] overflow-y-auto">
                                <table className="w-full text-sm text-left whitespace-nowrap">
                                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-semibold sticky top-0">
                                        <tr>
                                            {["Status", "Name", "Email", "Phone", "Subjects", "Designation", "Joining Date", "Password"].map((h) => (
                                                <th key={h} className="px-4 py-3">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {rows.map((row, i) => (
                                            <tr key={i} className={row.status === "new" ? "hover:bg-gray-50" : row.status === "duplicate" ? "bg-amber-50/60" : "bg-red-50/60"}>
                                                <td className="px-4 py-3">
                                                    {row.status === "new" && <span className="inline-flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg font-medium"><BadgeCheck className="w-3 h-3" /> Ready</span>}
                                                    {row.status === "duplicate" && <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-lg font-medium"><XCircle className="w-3 h-3" /> Duplicate</span>}
                                                    {row.status === "invalid" && (
                                                        <div>
                                                            <span className="inline-flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2 py-1 rounded-lg font-medium"><XCircle className="w-3 h-3" /> Invalid</span>
                                                            {row.reason && <p className="text-[10px] text-red-500 mt-1 max-w-[160px] whitespace-normal">{row.reason}</p>}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 font-medium text-navy">{row.data.firstName} {row.data.lastName}</td>
                                                <td className="px-4 py-3 text-gray-500">{row.data.email}</td>
                                                <td className="px-4 py-3 text-gray-500">{row.data.phone}</td>
                                                <td className="px-4 py-3 text-gray-500 max-w-[140px] truncate">{row.data.subjects}</td>
                                                <td className="px-4 py-3 text-gray-400">{row.data.designation || <span className="text-gray-200">—</span>}</td>
                                                <td className="px-4 py-3 text-gray-400">{row.data.joiningDate || <span className="text-gray-200">—</span>}</td>
                                                <td className="px-4 py-3 text-gray-400 font-mono text-xs">{"•".repeat(Math.min(8, row.data.password.length))}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center text-center p-16 min-h-[400px]">
                                <FileSpreadsheet className="w-14 h-14 text-gray-200 mb-4" />
                                <h3 className="font-semibold text-gray-400">No File Loaded</h3>
                                <p className="text-sm text-gray-300 max-w-xs mt-2">Download the template, fill in all teacher details in Excel, then upload here.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
