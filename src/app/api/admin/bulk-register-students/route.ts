import { NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { customInitApp } from "@/lib/firebase-admin"; // Assume this initializes firebase-admin securely

export async function POST(request: Request) {
    try {
        // In a real application, you should verify the admin token here
        // const authHeader = request.headers.get("authorization");
        // verifyAdminToken(authHeader)...

        const body = await request.json();
        const { students } = body;

        if (!students || !Array.isArray(students)) {
            return NextResponse.json({ error: "Invalid data format. Expected an array of students." }, { status: 400 });
        }

        customInitApp();
        const db = getFirestore();
        const auth = getAuth();

        let successCount = 0;
        let errors: any[] = [];

        // We process sequentially or in small parallel batches to avoid rate limits
        for (const student of students) {
            try {
                // Email: admissionNumber@ias.edu (8-digit number as-is)
                const email = `${student.admissionNumber.trim()}@ias.edu`;

                // Password = DOB in DD-MM-YYYY format (as-is from CSV)
                // CSV already has DD-MM-YYYY, keep it
                const password = student.dob.trim();
                // Keep dob as-is in DB too (DD-MM-YYYY)

                if (!password || password.length < 8) {
                    throw new Error(`DOB password too short for ${student.admissionNumber}`);
                }

                let uid: string;

                // 2. Try to create the Auth User
                try {
                    const userRecord = await auth.createUser({
                        email: email,
                        password: password,
                        displayName: `${student.firstName} ${student.lastName || ""}`.trim(),
                    });
                    uid = userRecord.uid;
                } catch (authError: any) {
                    // If user already exists (e.g., email already in use), we might want to update or skip.
                    if (authError.code === 'auth/email-already-exists') {
                        // Find existing user by email
                        const existingUser = await auth.getUserByEmail(email);
                        uid = existingUser.uid;
                        // For this demo, we can just proceed to update their firestore doc.
                    } else {
                        throw authError; // Re-throw other auth errors
                    }
                }

                // 3. Create or Update Global User Document
                const studentData = {
                    role: "student",
                    email: email,
                    admissionNumber: student.admissionNumber,

                    // Personal & Category
                    firstName: student.firstName,
                    middleName: student.middleName || "",
                    lastName: student.lastName || "",
                    dob: student.dob,
                    gender: student.gender || "",
                    bloodGroup: student.bloodGroup || "",
                    category: student.category || "",
                    physicallyDisabled: student.physicallyDisabled || "No",
                    aadharNo: student.aadharNo || "",
                    mobileNo: student.mobileNo || "",
                    pen: student.pen || "",
                    aparId: student.aparId || "",

                    // Academic
                    className: student.className,
                    section: student.section || "",
                    session: student.session || "",

                    // Parents
                    fatherName: student.fatherName || "",
                    fatherQualification: student.fatherQualification || "",
                    fatherOccupation: student.fatherOccupation || "",
                    fatherPhone: student.fatherPhone || "",
                    fatherAadharNo: student.fatherAadharNo || "",

                    motherName: student.motherName || "",
                    motherQualification: student.motherQualification || "",
                    motherOccupation: student.motherOccupation || "",
                    motherAadharNo: student.motherAadharNo || "",

                    // Family History
                    noOfBrothers: student.noOfBrothers || "0",
                    noOfSisters: student.noOfSisters || "0",
                    annualIncome: student.annualIncome || "",

                    // Address
                    localAddress: student.localAddress || "",
                    permanentAddress: student.permanentAddress || "",

                    // Bank Details
                    accountNumber: student.accountNumber || "",
                    accountHolderName: student.accountHolderName || "",
                    ifscCode: student.ifscCode || "",

                    // Medical
                    height: student.height || "",
                    weight: student.weight || "",
                    allergies: student.allergies || "None",

                    // Default missing images to empty string, waiting for student self-upload
                    childPhotoUrl: "",
                    parentPhotoUrl: "",
                    aadharUrl: "",
                    aparUrl: "",
                    fatherAadharUrl: "",
                    motherAadharUrl: "",
                    createdAt: new Date(),
                    updatedAt: new Date()
                };

                // Remove A and B, replace with Single deeply nested structure:
                // users -> classes -> {className} -> sections -> {section} -> students -> {uid} -> Full Student Data
                const sectionName = studentData.section || "Unassigned";
                const studentDocRef = db
                    .collection("users")
                    .doc("classes")
                    .collection(studentData.className)
                    .doc("sections")
                    .collection(sectionName)
                    .doc("students")
                    .collection("profiles")
                    .doc(uid);

                // Ensure parent documents exist for console visibility
                await db.collection("users").doc("classes").set({ description: "Root for classes", updatedAt: new Date() }, { merge: true });
                await db.collection("users").doc("classes").collection(studentData.className).doc("sections").set({ description: `Root for sections in ${studentData.className}`, updatedAt: new Date() }, { merge: true });
                await db.collection("users").doc("classes").collection(studentData.className).doc("sections").collection(sectionName).doc("students").set({ description: `Root for students in ${studentData.className} - ${sectionName}`, updatedAt: new Date() }, { merge: true });

                // Save full data to nested class/section path
                await studentDocRef.set(studentData, { merge: true });

                successCount++;
            } catch (err: any) {
                console.error(`Failed to import student ${student.admissionNumber}:`, err);
                errors.push({
                    admissionNumber: student.admissionNumber,
                    error: err.message
                });
            }
        }

        return NextResponse.json({
            success: true,
            successCount,
            errors
        });

    } catch (error: any) {
        console.error("Bulk import failed at route level:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
