"use client";

import { CldUploadWidget } from 'next-cloudinary';
import { ImagePlus } from 'lucide-react';

interface CloudinaryUploadWidgetProps {
    onUpload: (url: string) => void;
    uploadPreset?: string; // Optional, defaults to env or 'unsigned_preset'
}

export function CloudinaryUploadWidget({ onUpload, uploadPreset }: CloudinaryUploadWidgetProps) {
    // Fallback to a default or env var if not passed
    const preset = uploadPreset || process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || "ml_default";

    return (
        <CldUploadWidget
            uploadPreset={preset}
            onSuccess={(result) => {
                if (typeof result.info === 'object' && result.info && 'secure_url' in result.info) {
                    onUpload(result.info.secure_url as string);
                }
            }}
            options={{
                maxFiles: 1,
                resourceType: "image",
                clientAllowedFormats: ["png", "jpeg", "jpg", "webp"],
            }}
        >
            {({ open }) => {
                return (
                    <button
                        type="button"
                        onClick={() => open()}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors border border-gray-300"
                    >
                        <ImagePlus className="w-4 h-4" />
                        <span>Upload Image</span>
                    </button>
                );
            }}
        </CldUploadWidget>
    );
}
