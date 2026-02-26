import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary, UploadApiResponse } from "cloudinary";

// Configure Cloudinary explicitly
cloudinary.config({
    cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
});

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        const folder = (formData.get("folder") as string) || "ias-school/uploads";
        let publicId = formData.get("public_id") as string | null;

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        const fileName = file.name.toLowerCase();
        const isPdf = fileName.endsWith('.pdf') || file.type === 'application/pdf';

        // Use raw for PDF/DOCX, image for others
        const resourceType = isPdf ? "raw" : "image";

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Create a clean public_id if not provided
        if (!publicId) {
            const cleanName = file.name
                .replace(/\.[^/.]+$/, "") // strip extension
                .replace(/[^a-zA-Z0-9_-]/g, "_")
                .substring(0, 50);
            publicId = `${cleanName}_${Date.now()}`;
        }

        const uploadOptions: any = {
            folder: folder,
            resource_type: resourceType, // 'raw' for PDFs, 'image' for others
            public_id: publicId!,
        };

        // Aggressively compress images on upload to save Cloudinary storage
        if (!isPdf) {
            uploadOptions.transformation = [
                { width: 1920, crop: "limit" }, // Prevent massive 4K/8K uploads
                { quality: "auto", fetch_format: "auto" } // Auto compress heavily & convert to WebP/AVIF
            ];
        }

        const result = await new Promise<UploadApiResponse>((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                uploadOptions,
                (error, result) => {
                    if (error) reject(error);
                    else if (result) resolve(result);
                    else reject(new Error("Unknown upload error"));
                }
            );
            uploadStream.end(buffer);
        });

        // The user guide returns specific fields, but our front-end expects:
        // { secure_url: string, public_id: string, resource_type: string }
        // We will return both sets to satisfy the new guide and existing components.

        return NextResponse.json({
            // Legacy / Existing Component Expectations
            secure_url: result.secure_url,
            public_id: result.public_id,
            resource_type: result.resource_type,

            // Guide Specific Expectations
            url: result.secure_url,
            type: result.resource_type,
            format: result.format || 'pdf',
            publicId: result.public_id
        });

    } catch (error: any) {
        console.error("Upload route error:", error);
        return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 });
    }
}
