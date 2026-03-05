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

// ─── Date Normaliser ───────────────────────────────────────────────────────
// Accepts DD/MM/YYYY or DD-MM-YYYY → returns DD-MM-YYYY
function normaliseDate(raw: string): string {
    if (!raw || raw === "0" || raw === "") return "";
    const str = String(raw).trim();
    // Already DD-MM-YYYY
    if (/^\d{2}-\d{2}-\d{4}$/.test(str)) return str;
    // DD/MM/YYYY
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
        const [d, m, y] = str.split("/");
        return `${d.padStart(2, "0")}-${m.padStart(2, "0")}-${y}`;
    }
    // D/M/YYYY
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(str)) {
        const parts = str.split("/");
        const y = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
        return `${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}-${y}`;
    }
    return str;
}

function normaliseGender(raw: string): string {
    const v = String(raw || "").trim().toUpperCase();
    if (v === "M") return "Male";
    if (v === "F") return "Female";
    if (v.startsWith("M")) return "Male";
    if (v.startsWith("F")) return "Female";
    return raw;
}

function normaliseClass(raw: string): string {
    if (!raw) return "";
    const s = String(raw).trim();
    return s.replace(/^class\s*/i, "").trim();
}

// Split "ERAM NAAZ" → firstName: "ERAM", lastName: "NAAZ"
function splitName(full: string): { firstName: string; lastName: string } {
    const parts = (full || "").trim().split(/\s+/);
    if (parts.length === 1) return { firstName: parts[0], lastName: "" };
    const lastName = parts.pop()!;
    return { firstName: parts.join(" "), lastName };
}

// ─── Schema ───────────────────────────────────────────────────────────────
const studentRowSchema = z.object({
    admissionNumber: z.string().min(1, "ENR (Admission Number) is required"),
    name: z.string().min(1, "NAME is required"),
    gender: z.string().min(1, "GEN (Gender) is required"),
    // All other fields optional
    status: z.string().optional(),
    session: z.string().optional(),
    dateOfAdmission: z.string().optional(),
    mobileNo: z.string().optional(),
    contact2: z.string().optional(),
    contact3: z.string().optional(),
    aadharNo: z.string().optional(),
    aparId: z.string().optional(),
    pen: z.string().optional(),
    freeScheme: z.string().optional(),
    category: z.string().optional(),
    religion: z.string().optional(),
    classAtAdmission: z.string().optional(),
    currentClass: z.string().optional(),
    section: z.string().optional(),
    house: z.string().optional(),
    udise: z.string().optional(),
    economicallyWeakSection: z.string().optional(),
    cbseEnrolmentNo: z.string().optional(),
    dob: z.string().optional(),
    transport: z.string().optional(),
    address: z.string().optional(),
    pinCode: z.string().optional(),
    motherName: z.string().optional(),
    motherQualification: z.string().optional(),
    fatherName: z.string().optional(),
    fatherQualification: z.string().optional(),
    annualIncome: z.string().optional(),
    fatherOccupation: z.string().optional(),
    guardianName: z.string().optional(),
    guardianRelation: z.string().optional(),
    guardianQualification: z.string().optional(),
    bloodGroup: z.string().optional(),
    remarks: z.string().optional(),
    previousSchool: z.string().optional(),
    previousSchoolAddress: z.string().optional(),
    block: z.string().optional(),
    tcNumber: z.string().optional(),
    minorityStatus: z.string().optional(),
    lastClass: z.string().optional(),
    lastDate: z.string().optional(),
    leftYear: z.string().optional(),
    branch: z.string().optional(),
    serialNumber: z.string().optional(),
}).passthrough();

type StudentRow = z.infer<typeof studentRowSchema>;
type RowStatus = "new" | "duplicate_csv" | "duplicate_db" | "invalid";
interface AnnotatedRow { data: StudentRow; status: RowStatus; reason?: string; }

// ─── Column Header Mapping (Excel header → app field) ──────────────────────
const COLUMN_MAP: Record<string, string> = {
    "S.N": "serialNumber",
    "S.N.": "serialNumber",
    "SN": "serialNumber",
    "STAT": "status",
    "STATUS": "status",
    "SESS": "session",
    "SESSION": "session",
    "ENR": "admissionNumber",
    "ENR.": "admissionNumber",
    "ENROLLMENT NO": "admissionNumber",
    "ADMISSION NO": "admissionNumber",
    "D. O. A": "dateOfAdmission",
    "D.O.A": "dateOfAdmission",
    "DOA": "dateOfAdmission",
    "DATE OF ADMISSION": "dateOfAdmission",
    "NAME": "name",
    "STUDENT NAME": "name",
    "CONTACT": "__CONTACT_AUTO__",  // handled specially
    "CONTACT 2": "contact3",
    "AADHAR": "aadharNo",
    "AADHAR NO": "aadharNo",
    "AADHAAR": "aadharNo",
    "APAAR ID": "aparId",
    "APAAR": "aparId",
    "P.E.N": "pen",
    "PEN": "pen",
    "FREE": "freeScheme",
    "CAT": "category",
    "CATEGORY": "category",
    "REL": "religion",
    "RELIGION": "religion",
    "GEN": "gender",
    "GENDER": "gender",
    "CL ADM": "classAtAdmission",
    "CLASS ADM": "classAtAdmission",
    "CLASS AT ADMISSION": "classAtAdmission",
    "2025": "currentClass",
    "CURRENT CLASS": "currentClass",
    "CLASSNAME": "currentClass",
    "CLASS": "currentClass",
    "SEC": "section",
    "SECTION": "section",
    "HOUS": "house",
    "HOUSE": "house",
    "UDISE": "udise",
    "E-S": "economicallyWeakSection",
    "EWS": "economicallyWeakSection",
    "CBSE": "cbseEnrolmentNo",
    "D.O.B": "dob",
    "DOB": "dob",
    "DATE OF BIRTH": "dob",
    "TRP": "transport",
    "TRANSPORT": "transport",
    "ADDRESS": "address",
    "PIN": "pinCode",
    "PINCODE": "pinCode",
    "MOTHER NAME": "motherName",
    "M QUAL": "motherQualification",
    "MOTHER QUAL": "motherQualification",
    "FATHER NAME": "fatherName",
    "F QUAL": "fatherQualification",
    "FATHER QUAL": "fatherQualification",
    "INC": "annualIncome",
    "INCOME": "annualIncome",
    "F OCC": "fatherOccupation",
    "FATHER OCC": "fatherOccupation",
    "FATHER OCCUPATION": "fatherOccupation",
    "GUARDIAN'S NAME": "guardianName",
    "GUARDIAN NAME": "guardianName",
    "RELATION": "guardianRelation",
    "RELATIONSHIP": "guardianRelation",
    "QUALIFICATION": "guardianQualification",
    "GUARDIAN QUAL": "guardianQualification",
    "BL GP": "bloodGroup",
    "BLOOD GROUP": "bloodGroup",
    "REM": "remarks",
    "REMARKS": "remarks",
    "L.SCH. NAME": "previousSchool",
    "PREV SCHOOL": "previousSchool",
    "PREVIOUS SCHOOL": "previousSchool",
    "BLOCK": "block",
    "T.C": "tcNumber",
    "TC": "tcNumber",
    "M.S": "minorityStatus",
    "MINORITY": "minorityStatus",
    "L-CLS": "lastClass",
    "LAST CLASS": "lastClass",
    "L. DATE": "lastDate",
    "LAST DATE": "lastDate",
    "LEFT": "leftYear",
    "LEFT YEAR": "leftYear",
    "BR": "branch",
    "BRANCH": "branch",
};

// ─── Template ───────────────────────────────────────────────────────────────
const TEMPLATE_HEADERS = [
    "S.N", "STAT", "SESS", "ENR", "D. O. A", "NAME",
    "CONTACT", "CONTACT 2", "AADHAR", "APAAR ID", "P.E.N",
    "FREE", "CAT", "REL", "GEN", "CL ADM", "2025", "SEC",
    "HOUS", "UDISE", "E-S", "CBSE", "D.O.B",
    "TRP", "Address", "PIN",
    "Mother Name", "M QUAL",
    "Father Name", "F QUAL", "INC", "F OCC",
    "GUARDIAN'S NAME", "RELATION", "QUALIFICATION",
    "BL GP", "REM",
    "L.SCH. NAME", "ADDRESS", "BLOCK", "T.C", "M.S",
    "L-CLS", "L. DATE", "LEFT", "BR"
];

const SAMPLE_ROWS = [[
    "1", "ACTIVE", "2025", "7001", "14/01/2007", "ERAM NAAZ",
    "9955288454", "225628", "123456789012", "APAR001", "PEN001",
    "N", "GEN", "M", "F", "LKG", "5", "A",
    "BLUE", "", "N", "", "01/04/2001",
    "N", "SIR SYED CHOWK, SIWAN", "841226",
    "SHAMA PARVEEN", "HIGH SCHOOL",
    "ABDUL KALIM SIDDIQUE", "HIGH SCHOOL", "60000", "BUSINESS",
    "M. NADEEM", "UNCLE", "GRADUATE",
    "O+", "",
    "NATIONAL CONVENT ACADEMY", "SIWAN", "", "", "N",
    "3", "31/03/2010", "2010", "ATR"
]];

function downloadTemplate() {
    const wsData = [TEMPLATE_HEADERS, ...SAMPLE_ROWS];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = TEMPLATE_HEADERS.map(() => ({ wch: 18 }));

    const guide = [
        ["Column", "Required?", "Notes"],
        ["ENR", "YES", "Admission number, up to 8 digits"],
        ["NAME", "YES", "Full student name (will be split into first/last)"],
        ["GEN", "YES", "M (Male) or F (Female)"],
        ["D.O.B", "No", "Date format: DD/MM/YYYY or DD-MM-YYYY"],
        ["D. O. A", "No", "Date of Admission: DD/MM/YYYY"],
        ["L. DATE", "No", "Left/TC date: DD/MM/YYYY"],
        ["STAT", "No", "ACTIVE or LEFT"],
        ["SESS", "No", "Session year, e.g. 2025"],
        ["2025", "No", "Current class (NUR, LKG, UKG, 1-12)"],
        ["SEC", "No", "Section (A, B, C...)"],
        ["CAT", "No", "GEN / OBC / SC / ST / EWS"],
        ["BL GP", "No", "A+ / A- / B+ / B- / AB+ / AB- / O+ / O-"],
        ["CL ADM", "No", "Class at time of admission"],
        ["CONTACT", "No", "Primary mobile number"],
        ["CONTACT 2", "No", "Secondary mobile number"],
        ["Address", "No", "Student's address"],
        ["M.S", "No", "Minority status (YES/NO or OK)"],
        ["E-S", "No", "Economically Weak Section (YES/NO)"],
        ["BR", "No", "Branch (e.g. ATR)"],
    ];
    const wsGuide = XLSX.utils.aoa_to_sheet(guide);
    wsGuide["!cols"] = [{ wch: 20 }, { wch: 10 }, { wch: 55 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Student Data");
    XLSX.utils.book_append_sheet(wb, wsGuide, "Column Guide");
    XLSX.writeFile(wb, "IAS_student_import_template.xlsx");
}

// ─── Component ────────────────────────────────────────────────────────────
export default function BulkImportPage() {
    const [file, setFile] = useState<File | null>(null);
    const [rows, setRows] = useState<AnnotatedRow[]>([]);
    const [isParsing, setIsParsing] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadStatus, setUploadStatus] = useState<{ type: "success" | "error" | null; message: string }>({ type: null, message: "" });
    const [importMode, setImportMode] = useState<"skip" | "update">("skip");
    const fileRef = useRef<HTMLInputElement>(null);

    const REQUIRED = ["admissionNumber", "name", "gender"];

    const parseXLSX = (f: File): Promise<any[]> =>
        new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target?.result as ArrayBuffer);
                    const wb = XLSX.read(data, { type: "array", cellDates: true });
                    const sheet = wb.Sheets[wb.SheetNames[0]];
                    resolve(XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false }) as any[]);
                } catch (err) { reject(err); }
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(f);
        });

    const mapHeaders = (rawRow: Record<string, any>): Record<string, string> => {
        const result: Record<string, string> = {};
        let contactCount = 0;
        const contactFields = ["mobileNo", "contact2"];

        for (const [rawKey, rawVal] of Object.entries(rawRow)) {
            const key = String(rawKey).trim().toUpperCase();
            const val = rawVal instanceof Date
                ? (() => {
                    const d = String(rawVal.getDate()).padStart(2, "0");
                    const m = String(rawVal.getMonth() + 1).padStart(2, "0");
                    return `${d}/${m}/${rawVal.getFullYear()}`;
                })()
                : String(rawVal ?? "").trim();

            const mapped = COLUMN_MAP[rawKey.trim()] || COLUMN_MAP[key];

            if (mapped === "__CONTACT_AUTO__") {
                // First CONTACT col → mobileNo, second → contact2
                const field = contactFields[contactCount] || `contact${contactCount + 1}`;
                result[field] = val;
                contactCount++;
            } else if (mapped) {
                // Don't overwrite previous school with last-school address column
                if (mapped === "address" && result["address"]) {
                    result["previousSchoolAddress"] = val;
                } else {
                    result[mapped] = val;
                }
            }
            // Skip unmapped columns silently (e.g. "31/3/2025" age column)
        }

        // Normalise dates
        ["dob", "dateOfAdmission", "lastDate"].forEach(f => {
            if (result[f]) result[f] = normaliseDate(result[f]);
        });

        // Normalise gender
        if (result.gender) result.gender = normaliseGender(result.gender);

        // Normalise class
        if (result.currentClass) result.currentClass = normaliseClass(result.currentClass);
        if (result.classAtAdmission) result.classAtAdmission = normaliseClass(result.classAtAdmission);

        // Split name → firstName + lastName (keep `name` too for display)
        if (result.name) {
            const { firstName, lastName } = splitName(result.name);
            result.firstName = firstName;
            result.lastName = lastName;
        }

        // Default status
        if (!result.status) result.status = "ACTIVE";

        return result;
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        if (!f.name.endsWith(".xlsx") && !f.name.endsWith(".xls")) {
            setUploadStatus({ type: "error", message: "Only .xlsx and .xls files are supported." });
            return;
        }
        setFile(f); setIsParsing(true); setUploadStatus({ type: null, message: "" }); setRows([]);

        try {
            const rawData = await parseXLSX(f);
            if (rawData.length === 0) {
                setUploadStatus({ type: "error", message: "File is empty." });
                setIsParsing(false);
                return;
            }

            const parsed: AnnotatedRow[] = [];
            const seen = new Set<string>();

            rawData.forEach(rawRow => {
                const mapped = mapHeaders(rawRow);
                const admNo = (mapped.admissionNumber || "").trim();

                const missing = REQUIRED.filter(f => !mapped[f] || mapped[f] === "");
                if (missing.length > 0) {
                    parsed.push({ data: mapped as StudentRow, status: "invalid", reason: `Missing required: ${missing.join(", ")}` });
                    return;
                }

                const result = studentRowSchema.safeParse(mapped);
                if (!result.success) {
                    const msgs = result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`);
                    parsed.push({ data: mapped as StudentRow, status: "invalid", reason: msgs.join(" | ") });
                    return;
                }

                if (seen.has(admNo)) {
                    parsed.push({ data: result.data, status: "duplicate_csv", reason: `ENR ${admNo} appears more than once` });
                    return;
                }
                seen.add(admNo);
                parsed.push({ data: result.data, status: "new" });
            });

            // Cross-check DB
            try {
                const snap = await getDocs(collectionGroup(db, "profiles"));
                const existingAdmNos = new Set(snap.docs.map(d => String(d.data().admissionNumber || "").trim()).filter(Boolean));
                parsed.forEach((r, i) => {
                    if (r.status === "new" && existingAdmNos.has((r.data.admissionNumber || "").trim())) {
                        parsed[i] = { ...r, status: "duplicate_db", reason: `ENR ${r.data.admissionNumber} already in DB` };
                    }
                });
            } catch { /* skip DB check on error */ }

            setRows(parsed);
        } catch (err: any) {
            setUploadStatus({ type: "error", message: `Failed to parse: ${err.message}` });
        } finally {
            setIsParsing(false);
        }
    };

    const handleImport = async () => {
        const toImport = rows.filter(r => {
            if (r.status === "invalid" || r.status === "duplicate_csv") return false;
            if (r.status === "duplicate_db" && importMode === "skip") return false;
            return true;
        });
        if (toImport.length === 0) { setUploadStatus({ type: "error", message: "No valid records to import." }); return; }

        setIsUploading(true); setUploadStatus({ type: null, message: "" });
        try {
            let successCount = 0, errorCount = 0;
            for (let i = 0; i < toImport.length; i += 100) {
                const batch = toImport.slice(i, i + 100).map(r => r.data);
                const res = await fetch("/api/admin/bulk-register-students", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ students: batch })
                });
                const result = await res.json();
                if (res.ok) {
                    successCount += result.successCount || batch.length;
                    errorCount += result.errors?.length || 0;
                } else throw new Error(result.error || "Batch failed");
            }
            setUploadStatus({ type: "success", message: `✅ Import complete! ${successCount} students registered.${errorCount > 0 ? ` ${errorCount} failed.` : ""}` });
            setRows([]); setFile(null);
        } catch (err: any) {
            setUploadStatus({ type: "error", message: err.message || "Import failed." });
        } finally { setIsUploading(false); }
    };

    const handleClear = () => {
        setFile(null); setRows([]); setUploadStatus({ type: null, message: "" });
        if (fileRef.current) fileRef.current.value = "";
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
                    <p className="text-gray-500 mt-1 text-sm">Upload your Excel file. Columns are automatically mapped from your format.</p>
                </div>
                <button onClick={downloadTemplate} className="flex items-center gap-2 px-4 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-semibold transition-all shadow-md text-sm">
                    <Download className="w-4 h-4" /> Download Template (.xlsx)
                </button>
            </div>

            {/* Format Guide */}
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
                <div className="flex items-start gap-3">
                    <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                    <div className="text-sm">
                        <p className="font-semibold text-blue-900 mb-1">Auto Column Mapping — Your Excel Format is Supported</p>
                        <p className="text-blue-700">Your Excel columns (S.N, STAT, SESS, ENR, D.O.A, NAME, CONTACT, AADHAR etc.) are automatically recognised. Dates can be <strong>DD/MM/YYYY</strong> or <strong>DD-MM-YYYY</strong>. Gender <strong>M</strong> and <strong>F</strong> are accepted.</p>
                        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
                            <div className="font-bold text-red-700 text-xs uppercase tracking-wide w-full mb-1">Required Columns *</div>
                            {["ENR (Admission No)", "NAME (Full Name)", "GEN (Gender)"].map(h => (
                                <span key={h} className="text-red-600 font-mono text-xs">• {h}</span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
                {/* Upload Panel */}
                <div className="lg:col-span-1 space-y-4">
                    <label className="block">
                        <div className={`bg-white border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${isParsing ? "border-blue-300 bg-blue-50/50" : "border-gray-200 hover:border-navy hover:bg-gray-50"}`}>
                            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFileUpload} className="hidden" disabled={isParsing || isUploading} />
                            <div className="flex flex-col items-center gap-3">
                                <div className={`w-14 h-14 rounded-full flex items-center justify-center ${isParsing ? "bg-blue-100 text-blue-500" : "bg-gray-100 text-gray-400"}`}>
                                    {isParsing ? <Loader2 className="w-6 h-6 animate-spin" /> : <UploadCloud className="w-6 h-6" />}
                                </div>
                                <div>
                                    <p className="font-bold text-navy">Click to Upload File</p>
                                    <p className="text-xs text-gray-400 mt-1">.xlsx · .xls only</p>
                                </div>
                            </div>
                        </div>
                    </label>

                    {file && (
                        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex items-center gap-2 text-sm text-gray-600">
                            <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                            <span className="font-medium truncate">{file.name}</span>
                        </div>
                    )}

                    {rows.length > 0 && counts.dupDB > 0 && (
                        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm">
                            <p className="font-semibold text-amber-800 mb-2">{counts.dupDB} student(s) already in database</p>
                            <div className="space-y-2">
                                {[{ val: "skip", label: "Skip existing (recommended)" }, { val: "update", label: "Update existing records" }].map(opt => (
                                    <label key={opt.val} className="flex items-center gap-2 cursor-pointer">
                                        <input type="radio" name="mode" value={opt.val} checked={importMode === opt.val as any} onChange={() => setImportMode(opt.val as any)} className="accent-navy" />
                                        <span className="text-gray-700">{opt.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    {rows.length > 0 && (
                        <div className="flex gap-3">
                            <button onClick={handleClear} disabled={isUploading} className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-500 hover:text-red-500 hover:border-red-200 hover:bg-red-50 rounded-xl text-sm font-medium transition-all">
                                <Trash2 className="w-4 h-4" /> Clear
                            </button>
                            <button onClick={handleImport} disabled={isUploading || readyCount === 0} className="flex-1 flex items-center justify-center gap-2 bg-navy hover:bg-navy-light text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 shadow-lg shadow-navy/20">
                                {isUploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing...</> : <>Import {readyCount} Students</>}
                            </button>
                        </div>
                    )}

                    {uploadStatus.type === "error" && (
                        <div className="p-4 rounded-xl bg-red-50 border border-red-100 text-red-600 flex items-start gap-3 text-sm">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{uploadStatus.message}</span>
                        </div>
                    )}
                    {uploadStatus.type === "success" && (
                        <div className="p-4 rounded-xl bg-green-50 border border-green-100 text-green-700 flex items-start gap-3 text-sm">
                            <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{uploadStatus.message}</span>
                        </div>
                    )}
                </div>

                {/* Preview Panel */}
                <div className="lg:col-span-2">
                    <div className="bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden h-full">
                        {rows.length > 0 && (
                            <div className="flex flex-wrap items-center gap-4 px-5 py-4 bg-gray-50 border-b border-gray-100 text-sm">
                                <div><span className="text-gray-500">Total: </span><span className="font-bold text-navy">{counts.total}</span></div>
                                <div className="flex items-center gap-1.5"><BadgeCheck className="w-4 h-4 text-emerald-500" /><span className="text-gray-500">Ready: </span><span className="font-bold text-emerald-600">{counts.new}</span></div>
                                {counts.dupCSV > 0 && <div className="flex items-center gap-1.5"><Copy className="w-4 h-4 text-amber-500" /><span className="text-gray-500">Dup in file: </span><span className="font-bold text-amber-600">{counts.dupCSV}</span></div>}
                                {counts.dupDB > 0 && <div className="flex items-center gap-1.5"><Copy className="w-4 h-4 text-orange-500" /><span className="text-gray-500">Already in DB: </span><span className="font-bold text-orange-600">{counts.dupDB}</span></div>}
                                {counts.invalid > 0 && <div className="flex items-center gap-1.5"><XCircle className="w-4 h-4 text-red-500" /><span className="text-gray-500">Invalid: </span><span className="font-bold text-red-600">{counts.invalid}</span></div>}
                            </div>
                        )}
                        {rows.length > 0 ? (
                            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-semibold sticky top-0 z-10">
                                        <tr>
                                            {["Status", "S.N", "ENR", "Name", "Class/Sec", "DOB", "Gender", "Contact"].map(h => (
                                                <th key={h} className="px-4 py-3">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {rows.map((row, idx) => (
                                            <tr key={idx} className={`transition-colors ${row.status === "new" ? "hover:bg-gray-50" : row.status === "duplicate_csv" ? "bg-amber-50/60" : row.status === "duplicate_db" ? "bg-orange-50/60" : "bg-red-50/60"}`}>
                                                <td className="px-4 py-3">
                                                    {row.status === "new" && <span className="inline-flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg font-medium"><BadgeCheck className="w-3 h-3" /> New</span>}
                                                    {row.status === "duplicate_csv" && <span title={row.reason} className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-lg font-medium"><Copy className="w-3 h-3" /> Dup</span>}
                                                    {row.status === "duplicate_db" && <span title={row.reason} className="inline-flex items-center gap-1 text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-lg font-medium"><Copy className="w-3 h-3" /> In DB</span>}
                                                    {row.status === "invalid" && (
                                                        <div className="space-y-1">
                                                            <span className="inline-flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2 py-1 rounded-lg font-medium"><XCircle className="w-3 h-3" /> Invalid</span>
                                                            {row.reason && <div className="text-[10px] text-red-600 font-mono bg-red-50 p-1.5 rounded border border-red-100 max-w-xs break-words">{row.reason}</div>}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-gray-500 text-xs">{row.data.serialNumber || idx + 1}</td>
                                                <td className="px-4 py-3 font-medium text-navy font-mono">{row.data.admissionNumber || <span className="text-red-400">Missing</span>}</td>
                                                <td className="px-4 py-3 font-medium text-gray-800">{row.data.name}</td>
                                                <td className="px-4 py-3 text-gray-500">{row.data.currentClass || row.data.classAtAdmission} {row.data.section}</td>
                                                <td className="px-4 py-3 text-gray-500 text-xs">{row.data.dob}</td>
                                                <td className="px-4 py-3 text-gray-500">{row.data.gender}</td>
                                                <td className="px-4 py-3 text-gray-500 text-xs">{row.data.mobileNo}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center text-center p-16 text-gray-400 min-h-[400px]">
                                <FileSpreadsheet className="w-14 h-14 text-gray-200 mb-4" />
                                <h3 className="font-semibold text-gray-500">No File Loaded</h3>
                                <p className="text-sm text-gray-400 max-w-xs mt-2">Upload your existing Excel file directly. Columns like ENR, NAME, GEN, D.O.B etc. are auto-detected.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
