"use client";

import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { collectionGroup, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
    UploadCloud, FileSpreadsheet, Loader2, CheckCircle,
    AlertCircle, Trash2, Download, Info, BadgeCheck, Copy, XCircle
} from "lucide-react";
import { z } from "zod";

// ─── Schema ───────────────────────────────────────────────────────────────
const studentRowSchema = z.object({
    admissionNumber: z.string()
        .min(1, "Admission Number is required")
        .max(8, "Admission Number cannot exceed 8 digits")
        .regex(/^\d+$/, "Admission Number must contain only digits"),
    firstName: z.string().min(1, "First Name is required"),
    middleName: z.string().optional(),
    lastName: z.string().optional(),
    dob: z.string()
        .min(1, "Date of Birth is required")
        .regex(/^\d{2}-\d{2}-\d{4}$/, "DOB must be strictly in DD-MM-YYYY format (e.g. 15-05-2010)"),
    gender: z.string().min(1, "Gender is required"),
    bloodGroup: z.string().optional(),
    category: z.string().optional(),
    physicallyDisabled: z.string().optional(),
    aadharNo: z.string().optional(),
    mobileNo: z.string().optional(),
    pen: z.string().optional(),
    aparId: z.string().optional(),
    // className: just the number — "7", "10", "12" etc.
    className: z.string()
        .min(1, "Class is required")
        .regex(/^\d+$/, "Class must be a number only (e.g. 7, 10, 12). Do not write 'Class 7'."),
    section: z.string().optional(),
    session: z.string().optional(),
    fatherName: z.string().optional(),
    fatherQualification: z.string().optional(),
    fatherOccupation: z.string().optional(),
    fatherPhone: z.string().optional(),
    fatherAadharNo: z.string().optional(),
    motherName: z.string().optional(),
    motherQualification: z.string().optional(),
    motherOccupation: z.string().optional(),
    motherAadharNo: z.string().optional(),
    noOfBrothers: z.string().optional(),
    noOfSisters: z.string().optional(),
    annualIncome: z.string().optional(),
    localAddress: z.string().optional(),
    permanentAddress: z.string().optional(),
    accountNumber: z.string().optional(),
    accountHolderName: z.string().optional(),
    ifscCode: z.string().optional(),
    height: z.string().optional(),
    weight: z.string().optional(),
    allergies: z.string().optional(),
}).passthrough();

type StudentRow = z.infer<typeof studentRowSchema>;
type RowStatus = "new" | "duplicate_csv" | "duplicate_db" | "invalid";

interface AnnotatedRow {
    data: StudentRow;
    status: RowStatus;
    reason?: string;
}

// ─── XLSX Template ─────────────────────────────────────────────────────────
const TEMPLATE_HEADERS = [
    "admissionNumber", "firstName", "middleName", "lastName", "dob",
    "gender", "bloodGroup", "category", "physicallyDisabled",
    "aadharNo", "mobileNo", "pen", "aparId",
    "className", "section", "session",
    "fatherName", "fatherQualification", "fatherOccupation", "fatherPhone", "fatherAadharNo",
    "motherName", "motherQualification", "motherOccupation", "motherAadharNo",
    "noOfBrothers", "noOfSisters", "annualIncome",
    "localAddress", "permanentAddress",
    "accountNumber", "accountHolderName", "ifscCode",
    "height", "weight", "allergies"
];

const SAMPLE_ROWS = [
    [
        "20250001", "Riya", "", "Sharma", "15-05-2010",
        "Female", "B+", "General", "No",
        "123456789012", "9876543210", "PEN001", "APAR001",
        "7", "A", "2025-2026",
        "Manoj Sharma", "B.Tech", "Engineer", "9876543210", "111122223333",
        "Sunita Sharma", "M.Sc", "Teacher", "444455556666",
        "1", "0", "800000",
        "12 MG Road Delhi", "12 MG Road Delhi",
        "123456789", "Manoj Sharma", "SBIN0001234",
        "152", "45", "None"
    ]
];

function downloadXLSXTemplate() {
    const wsData = [TEMPLATE_HEADERS, ...SAMPLE_ROWS];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = TEMPLATE_HEADERS.map(() => ({ wch: 20 }));

    const notesData = [
        ["Column", "Required?", "Format / Notes"],
        ["admissionNumber", "YES", "Unique admission number e.g. 20250001"],
        ["firstName", "YES", "Student's first name"],
        ["dob", "YES", "Date of Birth in DD-MM-YYYY format e.g. 15-05-2010"],
        ["gender", "YES", "Male / Female / Other"],
        ["className", "YES", "Just the class NUMBER — e.g. 7, 10, 12. Do NOT write 'Class 7'."],
        ["middleName", "No", "Optional"],
        ["lastName", "No", "Optional"],
        ["section", "No", "A / B / C / D"],
        ["session", "No", "e.g. 2025-2026"],
        ["bloodGroup", "No", "A+ / A- / B+ / B- / AB+ / AB- / O+ / O-"],
        ["category", "No", "General / OBC / SC / ST / EWS"],
        ["physicallyDisabled", "No", "Yes / No"],
        ["mobileNo", "No", "10-digit mobile number"],
        ["fatherName", "No", "Father's full name"],
        ["motherName", "No", "Mother's full name"],
        ["aadharNo", "No", "12-digit Aadhar number"],
        ["localAddress", "No", "Current address"],
        ["permanentAddress", "No", "Permanent address"],
        ["accountNumber", "No", "Bank account number"],
        ["ifscCode", "No", "Bank IFSC code"],
        ["height", "No", "Height in cm"],
        ["weight", "No", "Weight in kg"],
        ["allergies", "No", "Any known allergies or 'None'"],
    ];
    const wsNotes = XLSX.utils.aoa_to_sheet(notesData);
    wsNotes["!cols"] = [{ wch: 25 }, { wch: 12 }, { wch: 55 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Student Data");
    XLSX.utils.book_append_sheet(wb, wsNotes, "Column Guide");
    XLSX.writeFile(wb, "student_import_template.xlsx");
}

// ─── Component ─────────────────────────────────────────────────────────────
export default function BulkImportPage() {
    const [fileOptions, setFileOptions] = useState<File | null>(null);
    const [rows, setRows] = useState<AnnotatedRow[]>([]);
    const [isParsing, setIsParsing] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadStatus, setUploadStatus] = useState<{ type: "success" | "error" | null; message: string }>({ type: null, message: "" });
    const [importMode, setImportMode] = useState<"skip" | "update">("skip");
    const fileInputRef = useRef<HTMLInputElement>(null);

    const REQUIRED_HEADERS = ["admissionNumber", "firstName", "dob", "gender", "className"];

    const parseXLSX = (file: File): Promise<any[]> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target?.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: "array", cellDates: true });
                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    const json = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
                    resolve(json as any[]);
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Only accept .xlsx or .xls
        if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
            setUploadStatus({ type: "error", message: "Only .xlsx and .xls files are supported. Please upload an Excel file." });
            return;
        }

        setFileOptions(file);
        setIsParsing(true);
        setUploadStatus({ type: null, message: "" });
        setRows([]);

        const processRows = async (rawData: any[], headers: string[]) => {
            if (rawData.length === 0) {
                setUploadStatus({ type: "error", message: "The file appears to be empty." });
                setIsParsing(false);
                return;
            }

            const missingHeaders = REQUIRED_HEADERS.filter(h => !headers.includes(h));
            if (missingHeaders.length > 0) {
                setUploadStatus({
                    type: "error",
                    message: `Invalid format. Missing required columns: ${missingHeaders.join(", ")}`
                });
                setIsParsing(false);
                return;
            }

            const parsed: AnnotatedRow[] = [];
            const seenInFile = new Set<string>();

            rawData.forEach(rawRow => {
                const stringified: any = {};
                for (const key of Object.keys(rawRow)) {
                    const val = rawRow[key];
                    if (val === null || val === undefined || val === "") {
                        stringified[key] = "";
                    } else if (val instanceof Date) {
                        const d = String(val.getDate()).padStart(2, "0");
                        const m = String(val.getMonth() + 1).padStart(2, "0");
                        const y = val.getFullYear();
                        stringified[key] = `${d}-${m}-${y}`;
                    } else {
                        stringified[key] = String(val).trim();
                    }
                }
                if (stringified.admissionNumber) stringified.admissionNumber = stringified.admissionNumber.trim();

                // Normalize className: strip "Class " prefix if someone mistakenly writes "Class 7" → "7"
                if (stringified.className) {
                    stringified.className = stringified.className.replace(/^class\s*/i, "").trim();
                }

                const result = studentRowSchema.safeParse(stringified);
                const admNo = stringified.admissionNumber || "";

                if (!result.success) {
                    const errorMessages = result.error.issues.map(issue => {
                        const path = issue.path.join(".");
                        return `Column '${path}': ${issue.message}`;
                    });
                    parsed.push({ data: stringified as StudentRow, status: "invalid", reason: errorMessages.join(" | ") });
                    return;
                }

                if (!admNo) {
                    parsed.push({ data: result.data, status: "invalid", reason: "Column 'admissionNumber': Missing or Empty" });
                    return;
                }

                if (seenInFile.has(admNo)) {
                    parsed.push({ data: result.data, status: "duplicate_csv", reason: `Adm. No ${admNo} appears more than once in this file` });
                    return;
                }

                seenInFile.add(admNo);
                parsed.push({ data: result.data, status: "new" });
            });

            // Cross-check against DB
            try {
                const snap = await getDocs(collectionGroup(db, "profiles"));
                const existingAdmNos = new Set<string>();
                snap.docs.forEach(d => {
                    const admNo = d.data().admissionNumber;
                    if (admNo) existingAdmNos.add(String(admNo).trim());
                });
                parsed.forEach((row, idx) => {
                    if (row.status === "new" && existingAdmNos.has(row.data.admissionNumber?.trim())) {
                        parsed[idx] = { ...row, status: "duplicate_db", reason: `Adm. No ${row.data.admissionNumber} already exists in database` };
                    }
                });
            } catch (e) {
                console.warn("Could not check DB for duplicates:", e);
            }

            setRows(parsed);
            setIsParsing(false);
        };

        try {
            const rawData = await parseXLSX(file);
            const headers = rawData.length > 0 ? Object.keys(rawData[0]) : [];
            await processRows(rawData, headers);
        } catch (err: any) {
            setUploadStatus({ type: "error", message: `Failed to parse Excel file: ${err.message}` });
            setIsParsing(false);
        }
    };

    const handleExecuteImport = async () => {
        const toImport = rows.filter(r => {
            if (r.status === "invalid" || r.status === "duplicate_csv") return false;
            if (r.status === "duplicate_db" && importMode === "skip") return false;
            return true;
        });

        if (toImport.length === 0) {
            setUploadStatus({ type: "error", message: "No valid new records to import." });
            return;
        }

        setIsUploading(true);
        setUploadStatus({ type: null, message: "" });

        try {
            const batchSize = 100;
            let successCount = 0;
            let errorCount = 0;

            for (let i = 0; i < toImport.length; i += batchSize) {
                const batch = toImport.slice(i, i + batchSize).map(r => r.data);
                const response = await fetch("/api/admin/bulk-register-students", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ students: batch })
                });
                const result = await response.json();
                if (response.ok) {
                    successCount += result.successCount || batch.length;
                    errorCount += (result.errors?.length || 0);
                } else throw new Error(result.error || "Batch failed");
            }

            setUploadStatus({
                type: "success",
                message: `✅ Import complete! ${successCount} students registered successfully.${errorCount > 0 ? ` ${errorCount} failed.` : ""}`
            });
            setRows([]);
            setFileOptions(null);
        } catch (error: any) {
            setUploadStatus({ type: "error", message: error.message || "Import failed." });
        } finally {
            setIsUploading(false);
        }
    };

    const handleClear = () => {
        setFileOptions(null);
        setRows([]);
        setUploadStatus({ type: null, message: "" });
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const counts = {
        total: rows.length,
        new: rows.filter(r => r.status === "new").length,
        dupCSV: rows.filter(r => r.status === "duplicate_csv").length,
        dupDB: rows.filter(r => r.status === "duplicate_db").length,
        invalid: rows.filter(r => r.status === "invalid").length,
    };

    const readyCount = importMode === "skip" ? counts.new : counts.new + counts.dupDB;

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-navy">Bulk Student Import</h1>
                    <p className="text-gray-500 mt-1">Upload an Excel (.xlsx) file to register multiple students at once.</p>
                </div>
                <button
                    onClick={downloadXLSXTemplate}
                    className="flex items-center gap-2 px-4 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-semibold transition-all shadow-md shadow-emerald-200 text-sm"
                >
                    <Download className="w-4 h-4" />
                    Download Template (.xlsx)
                </button>
            </div>

            {/* Format Guide Banner */}
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
                <div className="flex items-start gap-3">
                    <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                    <div>
                        <p className="font-semibold text-blue-900 text-sm mb-1">File Format Guide</p>
                        <p className="text-blue-700 text-sm">
                            Download the <strong>Excel (.xlsx)</strong> template above. Fill in student data and upload. The template includes a &ldquo;Column Guide&rdquo; sheet with notes on every field.
                        </p>
                        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-1 text-sm font-mono">
                            <div className="font-bold text-blue-800 col-span-full text-xs uppercase tracking-wide mb-1">Required Columns *</div>
                            {["admissionNumber", "firstName", "dob (DD-MM-YYYY)", "gender", "className (e.g. 7, 10, 12)"].map(h => (
                                <span key={h} className="text-red-600">• {h}</span>
                            ))}
                            <div className="font-bold text-blue-800 col-span-full text-xs uppercase tracking-wide mt-2 mb-1">Common Optional Columns</div>
                            {["middleName", "lastName", "section", "session", "bloodGroup", "category", "mobileNo", "fatherName", "motherName", "localAddress"].map(h => (
                                <span key={h} className="text-blue-600">• {h}</span>
                            ))}
                        </div>
                        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                            <strong>⚠️ Class Format:</strong> In the <code className="font-mono bg-amber-100 px-1 rounded">className</code> column, enter just the number — e.g. <code className="font-mono bg-amber-100 px-1 rounded">7</code>, <code className="font-mono bg-amber-100 px-1 rounded">10</code>, <code className="font-mono bg-amber-100 px-1 rounded">12</code>. Do <u>not</u> write &ldquo;Class 7&rdquo;.
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Interface */}
            <div className="grid lg:grid-cols-3 gap-6">
                {/* Upload Panel */}
                <div className="lg:col-span-1 space-y-4">
                    <label className="block">
                        <div className={`bg-white border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all
                            ${isParsing ? "border-blue-300 bg-blue-50/50" : "border-gray-200 hover:border-navy hover:bg-gray-50"}`}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".xlsx,.xls"
                                onChange={handleFileUpload}
                                className="hidden"
                                disabled={isParsing || isUploading}
                            />
                            <div className="flex flex-col items-center gap-3">
                                <div className={`w-14 h-14 rounded-full flex items-center justify-center ${isParsing ? "bg-blue-100 text-blue-500" : "bg-gray-100 text-gray-400"}`}>
                                    {isParsing ? <Loader2 className="w-6 h-6 animate-spin" /> : <UploadCloud className="w-6 h-6" />}
                                </div>
                                <div>
                                    <p className="font-bold text-navy">Click to Upload File</p>
                                    <p className="text-xs text-gray-300 mt-1">.xlsx · .xls only</p>
                                </div>
                            </div>
                        </div>
                    </label>

                    {fileOptions && (
                        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                                <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                                <span className="font-medium truncate">{fileOptions.name}</span>
                            </div>
                        </div>
                    )}

                    {/* Duplicate Mode Picker */}
                    {rows.length > 0 && counts.dupDB > 0 && (
                        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm">
                            <p className="font-semibold text-amber-800 mb-2">
                                {counts.dupDB} student(s) already in database
                            </p>
                            <div className="space-y-2">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="radio" name="mode" value="skip" checked={importMode === "skip"} onChange={() => setImportMode("skip")} className="accent-navy" />
                                    <span className="text-gray-700">Skip existing (recommended)</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="radio" name="mode" value="update" checked={importMode === "update"} onChange={() => setImportMode("update")} className="accent-navy" />
                                    <span className="text-gray-700">Update existing records</span>
                                </label>
                            </div>
                        </div>
                    )}

                    {/* Action Buttons */}
                    {rows.length > 0 && (
                        <div className="flex gap-3">
                            <button
                                onClick={handleClear}
                                disabled={isUploading}
                                className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-500 hover:text-red-500 hover:border-red-200 hover:bg-red-50 rounded-xl text-sm font-medium transition-all"
                            >
                                <Trash2 className="w-4 h-4" />
                                Clear
                            </button>
                            <button
                                onClick={handleExecuteImport}
                                disabled={isUploading || readyCount === 0}
                                className="flex-1 flex items-center justify-center gap-2 bg-navy hover:bg-navy-light text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 shadow-lg shadow-navy/20"
                            >
                                {isUploading ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" /> Importing...</>
                                ) : (
                                    <>Import {readyCount} Students</>
                                )}
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

                {/* Preview Panel */}
                <div className="lg:col-span-2">
                    <div className="bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden h-full">
                        {rows.length > 0 && (
                            <div className="flex flex-wrap items-center gap-4 px-5 py-4 bg-gray-50 border-b border-gray-100 text-sm">
                                <div><span className="text-gray-500">Total: </span><span className="font-bold text-navy">{counts.total}</span></div>
                                <div className="flex items-center gap-1.5">
                                    <BadgeCheck className="w-4 h-4 text-emerald-500" />
                                    <span className="text-gray-500">New: </span><span className="font-bold text-emerald-600">{counts.new}</span>
                                </div>
                                {counts.dupCSV > 0 && (
                                    <div className="flex items-center gap-1.5">
                                        <Copy className="w-4 h-4 text-amber-500" />
                                        <span className="text-gray-500">Dup in file: </span><span className="font-bold text-amber-600">{counts.dupCSV}</span>
                                    </div>
                                )}
                                {counts.dupDB > 0 && (
                                    <div className="flex items-center gap-1.5">
                                        <Copy className="w-4 h-4 text-orange-500" />
                                        <span className="text-gray-500">Already in DB: </span><span className="font-bold text-orange-600">{counts.dupDB}</span>
                                    </div>
                                )}
                                {counts.invalid > 0 && (
                                    <div className="flex items-center gap-1.5">
                                        <XCircle className="w-4 h-4 text-red-500" />
                                        <span className="text-gray-500">Invalid: </span><span className="font-bold text-red-600">{counts.invalid}</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {rows.length > 0 ? (
                            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-semibold sticky top-0 z-10">
                                        <tr>
                                            <th className="px-4 py-3">Status</th>
                                            <th className="px-4 py-3">Adm. No.</th>
                                            <th className="px-4 py-3">Student Name</th>
                                            <th className="px-4 py-3">Class & Section</th>
                                            <th className="px-4 py-3">DOB</th>
                                            <th className="px-4 py-3">Gender</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {rows.map((row, idx) => (
                                            <tr
                                                key={idx}
                                                className={`transition-colors ${row.status === "new" ? "hover:bg-gray-50" :
                                                    row.status === "duplicate_csv" ? "bg-amber-50/60" :
                                                        row.status === "duplicate_db" ? "bg-orange-50/60" :
                                                            "bg-red-50/60"
                                                    }`}
                                            >
                                                <td className="px-4 py-3">
                                                    {row.status === "new" && (
                                                        <span className="inline-flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg font-medium">
                                                            <BadgeCheck className="w-3 h-3" /> New
                                                        </span>
                                                    )}
                                                    {row.status === "duplicate_csv" && (
                                                        <span title={row.reason} className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-lg font-medium">
                                                            <Copy className="w-3 h-3" /> Dup in File
                                                        </span>
                                                    )}
                                                    {row.status === "duplicate_db" && (
                                                        <span title={row.reason} className="inline-flex items-center gap-1 text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-lg font-medium">
                                                            <Copy className="w-3 h-3" /> Already in DB
                                                        </span>
                                                    )}
                                                    {row.status === "invalid" && (
                                                        <div className="space-y-1">
                                                            <span className="inline-flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2 py-1 rounded-lg font-medium">
                                                                <XCircle className="w-3 h-3" /> Invalid
                                                            </span>
                                                            {row.reason && (
                                                                <div className="text-[10px] text-red-600 font-mono leading-tight bg-red-50 p-1.5 rounded border border-red-100 mt-1 max-w-xs break-words">
                                                                    {row.reason.split(" | ").map((msg, i) => (
                                                                        <div key={i} className="mb-0.5 last:mb-0 whitespace-normal">• {msg}</div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 font-medium text-navy">{row.data.admissionNumber || <span className="text-red-400">Missing</span>}</td>
                                                <td className="px-4 py-3 font-medium text-gray-800">{row.data.firstName} {row.data.lastName}</td>
                                                <td className="px-4 py-3 text-gray-500">Class {row.data.className} {row.data.section}</td>
                                                <td className="px-4 py-3 text-gray-500">{row.data.dob}</td>
                                                <td className="px-4 py-3 text-gray-500">{row.data.gender}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {rows.length > 50 && (
                                    <div className="text-center py-3 text-xs text-gray-400 border-t border-gray-100">
                                        Showing all {rows.length} rows
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center text-center p-16 text-gray-400 min-h-[400px]">
                                <FileSpreadsheet className="w-14 h-14 text-gray-200 mb-4" />
                                <h3 className="font-semibold text-gray-500">No File Loaded Yet</h3>
                                <p className="text-sm text-gray-400 max-w-xs mt-2">
                                    Download the template, fill it in Excel with class numbers (e.g. 7, 10, 12), and upload it here.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
