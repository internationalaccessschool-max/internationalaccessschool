/**
 * @deprecated Use CloudinaryUpload from "@/components/ui/cloudinary-upload" instead.
 * This file is kept for backward compatibility.
 *
 * Firebase Storage requires Blaze (paid) plan.
 * We now use Cloudinary (free 25GB) for all file uploads.
 */

"use client";

import { useState, useRef } from "react";
import { FileUp, X, Check, Loader2 } from "lucide-react";

interface FirebaseFileUploadProps {
    path: string; // e.g., "homeworks/" → maps to Cloudinary folder
    onUpload: (url: string, filename: string) => void;
    acceptedFileTypes?: string;
    maxSizeMB?: number;
}

// Maps legacy Firebase paths to Cloudinary organized folders
function getCldFolder(path: string): string {
    const p = path.toLowerCase();
    if (p.includes("homework")) return "ias-school/homework";
    if (p.includes("student")) return "ias-school/student-profiles";
    if (p.includes("fee")) return "ias-school/fee-receipts";
    if (p.includes("notice")) return "ias-school/notices";
    if (p.includes("gallery")) return "ias-school/gallery";
    if (p.includes("teacher")) return "ias-school/teachers";
    if (p.includes("mark")) return "ias-school/mark-sheets";
    if (p.includes("id")) return "ias-school/id-cards";
    return `ias-school/admin-docs/${path}`;
}

export function FirebaseFileUpload({
    path,
    onUpload,
    acceptedFileTypes = ".pdf,.doc,.docx,.png,.jpg",
    maxSizeMB = 10,
}: FirebaseFileUploadProps) {
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [uploadedFile, setUploadedFile] = useState<{ name: string; url: string } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || "ml_default";
    const folder = getCldFolder(path);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > maxSizeMB * 1024 * 1024) {
            setError(`File size exceeds ${maxSizeMB}MB limit.`);
            return;
        }
        setError(null);
        setUploading(true);
        setProgress(10);

        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("upload_preset", uploadPreset);
            formData.append("folder", folder);
            formData.append("public_id", `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`);

            const resourceType = file.type.startsWith("image/") ? "image" : "raw";
            setProgress(30);

            const res = await fetch(
                `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
                { method: "POST", body: formData }
            );

            setProgress(80);

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error?.message || "Upload failed");
            }

            const data = await res.json();
            setProgress(100);
            setUploadedFile({ name: file.name, url: data.secure_url });
            onUpload(data.secure_url, file.name);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Upload failed. Please try again.";
            setError(message);
        } finally {
            setUploading(false);
            if (inputRef.current) inputRef.current.value = "";
        }
    };

    const handleRemove = () => {
        setUploadedFile(null);
        setProgress(0);
    };

    return (
        <div className="w-full">
            {!uploadedFile ? (
                <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:bg-gray-50 transition-colors relative">
                    <input
                        ref={inputRef}
                        type="file"
                        onChange={handleUpload}
                        accept={acceptedFileTypes}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        disabled={uploading}
                    />
                    <div className="flex flex-col items-center gap-2 text-gray-500">
                        {uploading ? (
                            <>
                                <Loader2 className="w-8 h-8 animate-spin text-navy" />
                                <span className="text-sm font-medium">Uploading... {Math.round(progress)}%</span>
                                <div className="w-full max-w-xs bg-gray-200 rounded-full h-1.5 mt-1">
                                    <div
                                        className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                                        style={{ width: `${progress}%` }}
                                    />
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="w-10 h-10 bg-navy/5 text-navy rounded-full flex items-center justify-center">
                                    <FileUp className="w-5 h-5" />
                                </div>
                                <div className="text-sm font-medium text-navy">Click to Upload File</div>
                                <div className="text-xs text-gray-400">Max size: {maxSizeMB}MB</div>
                                <div className="text-xs text-gray-300 font-mono">📁 {folder}</div>
                            </>
                        )}
                    </div>
                </div>
            ) : (
                <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-100 rounded-lg">
                    <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-8 h-8 bg-green-100 text-green-600 rounded-lg flex items-center justify-center shrink-0">
                            <Check className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-navy truncate">{uploadedFile.name}</p>
                            <a href={uploadedFile.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">
                                View File
                            </a>
                        </div>
                    </div>
                    <button onClick={handleRemove} className="p-1.5 hover:bg-gray-200 rounded-md text-gray-500 transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}
            {error && <p className="text-xs text-red-500 mt-2 font-medium">{error}</p>}
        </div>
    );
}
