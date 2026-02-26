import { v2 as cloudinary } from "cloudinary";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    const url = req.nextUrl.searchParams.get("url");

    if (!url) {
        return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
    }

    if (!url.startsWith("https://res.cloudinary.com/")) {
        // Not a Cloudinary URL -> Redirect to original
        return NextResponse.redirect(url);
    }

    // Configure Cloudinary explicitly (server-side only)
    cloudinary.config({
        cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
    });

    try {
        // Parse the Cloudinary URL to extract components for signing
        // Format: https://res.cloudinary.com/<cloud_name>/<resource_type>/<type>/v<version>/<public_id>.<format>

        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split("/");
        // [0]='', [1]=cloud_name, [2]=resource_type, [3]=type (upload/authenticated), [4]=version (optional), [5...]=public_id

        const resourceType = pathParts[2] || "image"; // 'image', 'video', 'raw'
        const type = pathParts[3] || "upload"; // 'upload', 'authenticated', 'private'

        // Version usually starts with 'v' and is numeric
        let versionStr: string | undefined = pathParts[4];
        let publicIdParts = pathParts.slice(5);

        if (!versionStr?.startsWith("v") || isNaN(Number(versionStr.substring(1)))) {
            // Version is missing or invalid, assume current part is start of public_id
            publicIdParts = pathParts.slice(4);
            versionStr = undefined;
        }

        let publicId = publicIdParts.join("/");

        // For Raw files, extension is part of public_id usually.
        // For Image files, extension is handled separately by format option, or appended.
        // Cloudinary SDK handles public_id without extension for images usually.
        // But if we extract from URL, it has extension.
        // If resource_type is image, strip extension from public_id to let makeURL handle it?
        // Actually, if we pass formatting inside public_id, it should work.

        const version = versionStr ? versionStr.replace(/^v/, "") : undefined;

        // Generate a signed URL using SDK
        // This handles SHA-256 signature logic correctly + options
        const signedUrl = cloudinary.url(publicId, {
            resource_type: resourceType,
            type: type,
            sign_url: true,
            version: version,
            secure: true,
        });

        // Redirect browser to the signed URL
        return NextResponse.redirect(signedUrl);

    } catch (error) {
        console.error("Proxy error signing URL:", error);
        // Fallback: Just return original URL if we fail to sign
        return NextResponse.redirect(url);
    }
}
