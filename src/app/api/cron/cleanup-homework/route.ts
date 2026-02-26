import { NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import { customInitApp } from "@/lib/firebase-admin"; // Assume we have a firebase-admin init helper
import { v2 as cloudinary } from "cloudinary";

// Initialize Cloudinary
cloudinary.config({
    cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function GET(request: Request) {
    try {
        // Secure the cron job (Vercel automatic headers)
        const authHeader = request.headers.get("authorization");
        if (
            process.env.NODE_ENV === "production" &&
            authHeader !== `Bearer ${process.env.CRON_SECRET}`
        ) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Initialize Firebase Admin
        customInitApp();
        const db = getFirestore();

        // Calculate 365 days (1 year) ago
        const oneYearAgo = new Date();
        oneYearAgo.setDate(oneYearAgo.getDate() - 365);

        // Fetch old homework assignments
        const snapshot = await db.collection("homework")
            .where("createdAt", "<=", oneYearAgo)
            .get();

        if (snapshot.empty) {
            return NextResponse.json({ message: "No old homework found. Everything is clean!" });
        }

        const deletedIds: string[] = [];
        let deletedFilesCount = 0;

        // Process each old assignment
        for (const doc of snapshot.docs) {
            const data = doc.data();

            // 1. Delete file from Cloudinary (if exists)
            if (data.fileUrl && data.fileUrl.includes("cloudinary.com")) {
                try {
                    // Extract public_id from Cloudinary URL
                    // Example URL: https://res.cloudinary.com/cloudName/image/upload/v12345/ias-school/homework/class-10/math/file.pdf

                    // A simple way to get the exact public_id you uploaded is to 
                    // store the `public_id` directly in Firestore, but if you don't have it, 
                    // we can extract it from the URL:

                    const urlParts = data.fileUrl.split('/');
                    const uploadIndex = urlParts.findIndex((p: string) => p === 'upload');

                    if (uploadIndex !== -1 && urlParts.length > uploadIndex + 2) {
                        // Join everything after upload/v1234567/ (strip extension)
                        let publicId = urlParts.slice(uploadIndex + 2).join('/');
                        publicId = publicId.replace(/\.[^/.]+$/, ""); // Remove extension

                        await cloudinary.uploader.destroy(publicId, { invalidate: true });
                        deletedFilesCount++;
                    }
                } catch (cloudinaryError) {
                    console.error(`Failed to delete file for ${doc.id}:`, cloudinaryError);
                    // Continue even if file deletion fails, we still want to clean the db
                }
            }

            // 2. Delete document from Firebase
            await doc.ref.delete();
            deletedIds.push(doc.id);
        }

        return NextResponse.json({
            success: true,
            message: `Cleanup complete. Deleted ${deletedIds.length} assignments and ${deletedFilesCount} files.`,
            deletedIds
        });

    } catch (error: any) {
        console.error("Cleanup cron job failed:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
