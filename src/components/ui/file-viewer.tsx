"use client";

import { useState, useEffect } from "react";
import { X, Download, ZoomIn, ZoomOut, RotateCw, FileText, File, Loader2, ExternalLink } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
export type FileType = "image" | "pdf" | "docx" | "doc" | "xlsx" | "unknown";

interface FileViewerProps {
    url: string;
    fileName: string;
    isOpen: boolean;
    onClose: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
export function detectFileType(url: string, fileName?: string): FileType {
    const checkSrc = `${fileName || ""} ${url}`.toLowerCase();
    if (/\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?|$|#)/.test(checkSrc)) return "image";
    if (/\.pdf(\?|$|#)/.test(checkSrc)) return "pdf";
    if (/\.docx(\?|$|#)/.test(checkSrc)) return "docx";
    if (/\.doc(\?|$|#)/.test(checkSrc)) return "doc";
    if (/\.(xlsx|xls)(\?|$|#)/.test(checkSrc)) return "xlsx";
    // Cloudinary fallback
    if (url.includes("res.cloudinary.com") && url.includes("/raw/upload/")) return "pdf"; // Assume raw docs are PDF/doc -> use Google Viewer
    if (url.includes("res.cloudinary.com") && url.includes("/image/upload/")) return "image";
    return "unknown";
}

// Google Docs Viewer — fallback for DOCX files
function googleDocsViewerUrl(fileUrl: string) {
    return `https://docs.google.com/viewer?url=${encodeURIComponent(fileUrl)}&embedded=true`;
}

// ─────────────────────────────────────────────────────────────────────────────
export function FileViewer({ url, fileName, isOpen, onClose }: FileViewerProps) {
    const [zoom, setZoom] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [iframeLoading, setIframeLoading] = useState(true);
    const [signedPdfUrl, setSignedPdfUrl] = useState<string | null>(null);

    const fileType = detectFileType(url, fileName);

    // Fetch signed URL for PDFs when modal opens
    useEffect(() => {
        if (isOpen && fileType === "pdf") {
            setIframeLoading(true);
            fetch(`/api/sign-cloudinary-url?url=${encodeURIComponent(url)}`)
                .then(res => res.json())
                .then(data => {
                    if (data.signedUrl) setSignedPdfUrl(data.signedUrl);
                    else setSignedPdfUrl(url);
                })
                .catch(err => {
                    console.error("Failed to sign URL:", err);
                    setSignedPdfUrl(url);
                });
        }
    }, [isOpen, url, fileType]);

    if (!isOpen) return null;

    const finalPdfUrl = signedPdfUrl || url;

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) onClose();
    };

    return (
        <div
            className="fixed inset-0 z-[100] flex flex-col bg-black/80 backdrop-blur-sm"
            onClick={handleBackdropClick}
        >
            {/* ── Toolbar ── */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-900 text-white shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                    {fileType === "image" ? (
                        <ZoomIn className="w-4 h-4 text-gray-400 shrink-0" />
                    ) : fileType === "xlsx" ? (
                        <span className="text-lg">📊</span>
                    ) : (
                        <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                    )}
                    <span className="text-sm font-medium truncate max-w-xs md:max-w-lg">{fileName}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-bold shrink-0 ${fileType === "image" ? "bg-green-700 text-green-100" :
                        fileType === "pdf" ? "bg-red-700 text-red-100" :
                            fileType === "docx" || fileType === "doc" ? "bg-blue-700 text-blue-100" :
                                fileType === "xlsx" ? "bg-green-600 text-green-100" :
                                    "bg-gray-700 text-gray-200"
                        }`}>
                        {fileType.toUpperCase()}
                    </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                    {/* Image controls */}
                    {fileType === "image" && (
                        <>
                            <button
                                onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}
                                className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                                title="Zoom Out"
                            >
                                <ZoomOut className="w-4 h-4" />
                            </button>
                            <span className="text-xs text-gray-400 w-10 text-center">{Math.round(zoom * 100)}%</span>
                            <button
                                onClick={() => setZoom(z => Math.min(3, z + 0.25))}
                                className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                                title="Zoom In"
                            >
                                <ZoomIn className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setRotation(r => (r + 90) % 360)}
                                className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                                title="Rotate"
                            >
                                <RotateCw className="w-4 h-4" />
                            </button>
                        </>
                    )}

                    {/* Open in new tab - Use signed URL for PDF if available */}
                    <a
                        href={fileType === "pdf" ? finalPdfUrl : url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                        title="Open in new tab"
                    >
                        <ExternalLink className="w-4 h-4" />
                    </a>

                    {/* Download - Use signed URL for PDF to allow download of private file */}
                    <a
                        href={fileType === "pdf" ? finalPdfUrl : url}
                        download={fileName}
                        className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                        title="Download"
                    >
                        <Download className="w-4 h-4" />
                    </a>

                    {/* Close */}
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-red-700 rounded-lg transition-colors ml-1"
                        title="Close"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* ── Content ── */}
            <div className="flex-1 overflow-auto flex items-center justify-center p-4" onClick={handleBackdropClick}>

                {/* IMAGE VIEWER */}
                {fileType === "image" && (
                    <div className="relative" onClick={e => e.stopPropagation()}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={url}
                            alt={fileName}
                            className="max-w-none rounded-lg shadow-2xl transition-all duration-200"
                            style={{
                                transform: `scale(${zoom}) rotate(${rotation}deg)`,
                                transformOrigin: "center center",
                            }}
                        />
                    </div>
                )}

                {/* PDF VIEWER — handles both RAW uploads and image-type fallbacks */}
                {fileType === "pdf" && (
                    <div
                        className="bg-gray-100 rounded-xl overflow-hidden shadow-2xl w-full max-w-5xl relative"
                        style={{ height: "calc(100vh - 120px)" }}
                        onClick={e => e.stopPropagation()}
                    >
                        {iframeLoading && (
                            <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10">
                                <div className="text-center">
                                    <Loader2 className="w-8 h-8 animate-spin text-navy mx-auto mb-2" />
                                    <p className="text-sm text-gray-500">Loading document...</p>
                                </div>
                            </div>
                        )}

                        {/* Check if it's a RAW upload */}
                        {finalPdfUrl.includes('/raw/upload/') ? (
                            // For RAW uploads, use Google Docs Viewer
                            <iframe
                                src={`https://docs.google.com/viewer?url=${encodeURIComponent(finalPdfUrl)}&embedded=true`}
                                className="w-full h-full border-0"
                                title={fileName}
                                onLoad={() => setIframeLoading(false)}
                            >
                                <div className="flex flex-col items-center justify-center p-4">
                                    <p>Unable to display PDF.</p>
                                    <a href={finalPdfUrl} target="_blank" rel="noopener noreferrer">
                                        Open in New Tab
                                    </a>
                                </div>
                            </iframe>
                        ) : (
                            // Fallback for image-type or fl_inline uploads
                            <object
                                data={finalPdfUrl.includes('/fl_inline/')
                                    ? finalPdfUrl
                                    : finalPdfUrl.replace('/upload/', '/upload/fl_inline/')}
                                type="application/pdf"
                                className="w-full h-full"
                                onLoad={() => setIframeLoading(false)}
                            >
                                <div className="flex flex-col items-center justify-center p-4">
                                    <p>Unable to display PDF.</p>
                                    <a href={finalPdfUrl} target="_blank" rel="noopener noreferrer">
                                        Open in New Tab
                                    </a>
                                </div>
                            </object>
                        )}
                    </div>
                )}




                {/* DOCX / DOC VIEWER — Google Docs embedded */}
                {(fileType === "docx" || fileType === "doc") && (
                    <div
                        className="bg-white rounded-xl overflow-hidden shadow-2xl w-full max-w-5xl relative"
                        style={{ height: "calc(100vh - 120px)" }}
                        onClick={e => e.stopPropagation()}
                    >
                        {iframeLoading && (
                            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded-xl z-10">
                                <div className="text-center space-y-3">
                                    <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto" />
                                    <p className="text-sm text-gray-500">Loading Document...</p>
                                    <p className="text-xs text-gray-400">Powered by Google Docs Viewer</p>
                                </div>
                            </div>
                        )}
                        <iframe
                            src={googleDocsViewerUrl(url)}
                            className="w-full h-full"
                            onLoad={() => setIframeLoading(false)}
                            title={fileName}
                        />
                    </div>
                )}

                {/* EXCEL / UNKNOWN FILE */}
                {(fileType === "xlsx" || fileType === "unknown") && (
                    <div
                        className="bg-white rounded-2xl p-10 text-center max-w-sm space-y-4 shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto">
                            {fileType === "xlsx" ? <span className="text-3xl">📊</span> : <File className="w-8 h-8 text-gray-400" />}
                        </div>
                        <div>
                            <p className="font-semibold text-gray-800">{fileName}</p>
                            <p className="text-sm text-gray-400 mt-1">
                                {fileType === "xlsx"
                                    ? "Spreadsheet preview not available."
                                    : "Preview not available for this file type."}
                            </p>
                        </div>
                        <a
                            href={url}
                            download={fileName}
                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-navy text-white rounded-lg hover:bg-navy-light transition-colors font-medium"
                        >
                            <Download className="w-4 h-4" /> Download File
                        </a>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Trigger Button ────────────────────────────────────────────────────────────
// A ready-made button to open the viewer — use this anywhere
interface FileViewerTriggerProps {
    url: string;
    fileName: string;
    label?: string;
    className?: string;
}

export function FileViewerTrigger({ url, fileName, label, className = "" }: FileViewerTriggerProps) {
    const [open, setOpen] = useState(false);
    const fileType = detectFileType(url, fileName);

    const icon = fileType === "image"
        ? "🖼️" : fileType === "pdf"
            ? "📄" : fileType === "docx" || fileType === "doc"
                ? "📝" : fileType === "xlsx"
                    ? "📊" : "📎";

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className={`inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-800 text-sm font-medium hover:underline ${className}`}
            >
                <span>{icon}</span>
                {label || fileName}
            </button>
            <FileViewer
                url={url}
                fileName={fileName}
                isOpen={open}
                onClose={() => setOpen(false)}
            />
        </>
    );
}
