import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { verifyAuth } from "@/lib/auth-guard";

cloudinary.config({
    cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(request: NextRequest) {
    const authResult = await verifyAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    try {
        const body = await request.json();
        const { url } = body;

        if (!url) {
            return NextResponse.json({ error: "No URL provided" }, { status: 400 });
        }

        // Extract public ID from Cloudinary URL
        // Example URL: https://res.cloudinary.com/dxyz/image/upload/v1234/ias-school/student-profiles/uid/123-photo.jpg
        // We need: ias-school/student-profiles/uid/123-photo (without extension)
        const urlParts = url.split("/upload/");
        if (urlParts.length !== 2) {
            return NextResponse.json({ error: "Invalid Cloudinary URL" }, { status: 400 });
        }

        const pathWithVersion = urlParts[1];
        // Remove version (e.g. v17123456/) if present
        let pathWithoutVersion = pathWithVersion;
        if (pathWithVersion.match(/^v\d+\//)) {
            pathWithoutVersion = pathWithVersion.split("/").slice(1).join("/");
        }

        // Remove extension
        const publicId = pathWithoutVersion.replace(/\.[^/.]+$/, "");

        const result = await cloudinary.uploader.destroy(publicId);

        return NextResponse.json({ success: true, result });
    } catch (error: any) {
        console.error("Cloudinary delete error:", error);
        return NextResponse.json({ error: error.message || "Failed to delete file" }, { status: 500 });
    }
}
