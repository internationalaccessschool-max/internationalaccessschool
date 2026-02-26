import { v2 as cloudinary } from "cloudinary";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    const url = req.nextUrl.searchParams.get("url");

    if (!url) {
        return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
    }

    if (!url.startsWith("https://res.cloudinary.com/")) {
        return NextResponse.json({ signedUrl: url }); // Not Cloudinary? Return original.
    }

    // Configure Cloudinary explicitly
    cloudinary.config({
        cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
    });

    try {
        // Parse the Cloudinary URL to extract components for signing
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split("/");
        // [0]='', [1]=cloud_name, [2]=resource_type, [3]=type, [4]=version?, [5...]=public_id

        const resourceType = pathParts[2] || "image";
        const type = pathParts[3] || "upload";

        let versionStr: string | undefined = pathParts[4];
        let publicIdParts = pathParts.slice(5);

        if (!versionStr?.startsWith("v")) {
            publicIdParts = pathParts.slice(4);
            versionStr = undefined;
        }

        const publicId = publicIdParts.join("/");
        const version = versionStr ? versionStr.replace(/^v/, "") : undefined;

        // Generate a signed URL with correct type and resource_type
        // Raw files need extension in public_id if not present?
        // Actually publicId derived from URL includes extension if present in URL.

        const signedUrl = cloudinary.url(publicId, {
            resource_type: resourceType,
            type: type,
            sign_url: true,
            version: version,
            secure: true,
            // If resource_type is raw, ensure extension is handled (usually part of public_id)
        });

        return NextResponse.json({ signedUrl });

    } catch (error) {
        console.error("Sign URL error:", error);
        return NextResponse.json({ error: "Failed to sign URL", signedUrl: url }, { status: 500 });
    }
}
