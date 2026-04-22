import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary, UploadApiResponse } from "cloudinary";
import { verifyAuth } from "@/lib/auth-guard";

// Configure Cloudinary explicitly
cloudinary.config({
    cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
});

const ALLOWED_FOLDERS = new Set([
    "homework", "student-profiles", "fee-receipts", "notices",
    "gallery", "id-cards", "admin-docs", "teachers",
    "mark-sheets", "applications", "student-tcs",
]);

export async function POST(req: NextRequest) {
    const authResult = await verifyAuth(req);
    if (authResult instanceof NextResponse) return authResult;

    try {
        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        const rawFolder = (formData.get("folder") as string) || "";
        // Ignore client public_id — always generate server-side
        // public_id to prevent overwriting other users' files.

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        // Validate folder: must start with ias-school/<allowed-segment>
        const folderSegment = rawFolder.replace(/^ias-school\//, "").split("/")[0];
        if (!ALLOWED_FOLDERS.has(folderSegment)) {
            return NextResponse.json({ error: "Invalid upload folder" }, { status: 400 });
        }
        const folder = rawFolder.startsWith("ias-school/") ? rawFolder : `ias-school/${rawFolder}`;

        const fileName = file.name.toLowerCase();
        const isPdf = fileName.endsWith('.pdf') || file.type === 'application/pdf';

        // Use raw for PDF/DOCX, image for others
        const resourceType = isPdf ? "raw" : "image";

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Always generate public_id server-side
        const cleanName = file.name
            .replace(/\.[^/.]+$/, "")
            .replace(/[^a-zA-Z0-9_-]/g, "_")
            .substring(0, 50);
        const publicId = `${cleanName}_${Date.now()}`;

        const uploadOptions: any = {
            folder: folder,
            resource_type: resourceType, // 'raw' for PDFs, 'image' for others
            public_id: publicId,
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
