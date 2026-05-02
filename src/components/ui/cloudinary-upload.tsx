"use client";

import { authFetch } from "@/lib/auth-fetch";

import { useState, useRef } from "react";
import { X, Check, Loader2 } from "lucide-react";

// ─── Folder Structure ────────────────────────────────────────────────────────
// ias-school/
//   ├── homework/class-{id}/{subject}/
//   ├── student-profiles/{studentId}/
//   ├── fee-receipts/{studentId}/{year}/
//   ├── notices/
//   ├── gallery/
//   ├── id-cards/{studentId}/
//   └── admin-docs/
// ─────────────────────────────────────────────────────────────────────────────

export type UploadFolder =
    | "homework"
    | "student-profiles"
    | "fee-receipts"
    | "notices"
    | "gallery"
    | "id-cards"
    | "admin-docs"
    | "teachers"
    | "mark-sheets"
    | "applications"
    | "student-tcs"
    | "leave-docs";

interface CloudinaryUploadProps {
    folder: UploadFolder;
    subFolder?: string; // e.g., "class-6/math" for homework
    onUpload: (url: string, publicId: string, filename: string) => void;
    acceptedFileTypes?: "images" | "pdfs" | "all";
    maxSizeMB?: number;
    label?: string;
    multiple?: boolean;
}

const FOLDER_CONFIG: Record<UploadFolder, { icon: string; color: string; label: string }> = {
    "homework": { icon: "📚", color: "blue", label: "Homework File" },
    "student-profiles": { icon: "👤", color: "green", label: "Student Photo" },
    "fee-receipts": { icon: "💰", color: "yellow", label: "Fee Receipt" },
    "notices": { icon: "📢", color: "purple", label: "Notice" },
    "gallery": { icon: "🖼️", color: "pink", label: "Gallery Image" },
    "id-cards": { icon: "🪪", color: "indigo", label: "ID Card" },
    "admin-docs": { icon: "📋", color: "gray", label: "Admin Document" },
    "teachers": { icon: "👩‍🏫", color: "teal", label: "Teacher Document" },
    "mark-sheets": { icon: "📝", color: "orange", label: "Mark Sheet" },
    "applications": { icon: "📄", color: "cyan", label: "Job Application" },
    "student-tcs": { icon: "🎓", color: "green", label: "Transfer Certificate" },
    "leave-docs": { icon: "📎", color: "blue", label: "Leave Document" },
};

const ACCEPT_TYPES = {
    images: "image/png,image/jpeg,image/jpg,image/webp",
    pdfs: "application/pdf",
    all: "image/png,image/jpeg,image/jpg,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel",
};

export function CloudinaryUpload({
    folder,
    subFolder = "",
    onUpload,
    acceptedFileTypes = "all",
    maxSizeMB = 1,
    label,
    multiple = false,
}: CloudinaryUploadProps) {
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [uploadedFiles, setUploadedFiles] = useState<{ name: string; url: string; publicId: string }[]>([]);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const config = FOLDER_CONFIG[folder];

    // Build organized folder path: ias-school/{folder}/{subFolder}
    const getFolderPath = () => {
        const base = `ias-school/${folder}`;
        return subFolder ? `${base}/${subFolder}` : base;
    };

    const uploadFile = async (file: File) => {
        if (file.size > maxSizeMB * 1024 * 1024) {
            setError(`File size exceeds ${maxSizeMB}MB limit.`);
            return;
        }

        const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
        const isImage = file.type.startsWith("image/");
        // Always strip extension from public ID (user requirement)
        const publicIdBase = cleanName.replace(/\.[^/.]+$/, "");
        const publicId = `${publicIdBase}`; // Removed timestamp here (optional, but cleaner) -- wait, timestamp is needed for uniqueness?
        // Let's keep timestamp prefix for uniqueness, but strip extension.
        const finalPublicId = `${Date.now()}-${publicIdBase}`;

        const formData = new FormData();
        formData.append("file", file);
        formData.append("folder", getFolderPath());
        formData.append("public_id", finalPublicId);

        const response = await authFetch("/api/upload", {
            method: "POST",
            body: formData,
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || "Upload failed");
        }

        return await response.json();
    };


    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;

        setError(null);
        setUploading(true);
        setProgress(0);

        try {
            const results: { name: string; url: string; publicId: string }[] = [];
            for (let i = 0; i < files.length; i++) {
                const data = await uploadFile(files[i]);
                if (data) {
                    results.push({
                        name: files[i].name,
                        url: data.secure_url,
                        publicId: data.public_id,
                    });
                    setProgress(((i + 1) / files.length) * 100);
                    onUpload(data.secure_url, data.public_id, files[i].name);
                }
            }
            setUploadedFiles(prev => [...prev, ...results]);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Upload failed. Please try again.";
            setError(message);
        } finally {
            setUploading(false);
            if (inputRef.current) inputRef.current.value = "";
        }
    };

    const handleRemove = (publicId: string) => {
        setUploadedFiles(prev => prev.filter(f => f.publicId !== publicId));
    };

    return (
        <div className="w-full space-y-3">
            {/* Upload Zone */}
            {(multiple || uploadedFiles.length === 0) && (
                <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:bg-gray-50 transition-colors relative">
                    <input
                        ref={inputRef}
                        type="file"
                        onChange={handleUpload}
                        accept={ACCEPT_TYPES[acceptedFileTypes]}
                        multiple={multiple}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                        disabled={uploading}
                    />
                    <div className="flex flex-col items-center gap-2 text-gray-500">
                        {uploading ? (
                            <>
                                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                                <span className="text-sm font-medium text-blue-600">
                                    Uploading... {Math.round(progress)}%
                                </span>
                                <div className="w-full max-w-xs bg-gray-200 rounded-full h-1.5 mt-1">
                                    <div
                                        className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                                        style={{ width: `${progress}%` }}
                                    />
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center text-2xl">
                                    {config.icon}
                                </div>
                                <div className="text-sm font-semibold text-gray-700">
                                    {label || `Upload ${config.label}`}
                                </div>
                                <div className="text-xs text-gray-400">
                                    {acceptedFileTypes === "images"
                                        ? "PNG, JPG, WEBP"
                                        : acceptedFileTypes === "pdfs"
                                            ? "PDF only"
                                            : "PDF, Images, Documents"}{" "}
                                    · Max {maxSizeMB}MB
                                </div>
                                <div className="text-[10px] text-gray-300 font-mono mt-2 truncate w-full max-w-[90%] mx-auto">
                                    📁 ias-school/{folder}{subFolder ? `/${subFolder}` : ""}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Uploaded Files List */}
            {uploadedFiles.map((file) => (
                <div
                    key={file.publicId}
                    className="flex items-center justify-between p-3 bg-green-50 border border-green-100 rounded-lg"
                >
                    <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-8 h-8 bg-green-100 text-green-600 rounded-lg flex items-center justify-center shrink-0">
                            <Check className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
                            <a
                                href={file.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-500 hover:underline"
                            >
                                View / Download
                            </a>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => handleRemove(file.publicId)}
                        className="p-1.5 hover:bg-gray-200 rounded-md text-gray-500 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            ))}

            {/* Error */}
            {error && (
                <p className="text-xs text-red-500 font-medium flex items-center gap-1">
                    <X className="w-3.5 h-3.5" /> {error}
                </p>
            )}
        </div>
    );
}
