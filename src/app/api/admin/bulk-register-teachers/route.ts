import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
    try {
        const { teachers } = await req.json();
        if (!Array.isArray(teachers) || teachers.length === 0) {
            return NextResponse.json({ error: "No teachers provided" }, { status: 400 });
        }

        let successCount = 0;
        const errors: string[] = [];

        for (const teacher of teachers) {
            try {
                const {
                    // Required
                    firstName, lastName, email, phone, subjects, password,
                    // Basic / Employment
                    qualification, designation, joiningDate, basicSalary,
                    // Personal
                    dob, gender, bloodGroup, socialCategory,
                    fatherName, emergencyContact, permanentAddress,
                    // Documents
                    panNumber, aadhaarNumber,
                    // Bank
                    bankName, bankAccountNumber, ifscCode, uanNumber, epfNumber,
                    pfJoiningDate, esicJoiningDate,
                } = teacher;

                // Parse subjects string → array (split by semicolon or comma)
                const subjectsArray = String(subjects || "")
                    .split(/[;,]/)
                    .map((s: string) => s.trim())
                    .filter(Boolean);

                // Create Firebase Auth account
                const userRecord = await adminAuth.createUser({
                    email,
                    password,
                    displayName: `${firstName} ${lastName}`,
                });

                const uid = userRecord.uid;

                const teacherDoc = {
                    uid,
                    firstName: firstName || "",
                    lastName: lastName || "",
                    name: `${firstName} ${lastName}`,
                    email,
                    phone: String(phone || ""),
                    subjects: subjectsArray,
                    role: "teacher",
                    assignment: { classSections: {}, subjects: [], streams: [] },
                    status: "Active",
                    createdAt: new Date().toISOString(),

                    // Basic / Employment
                    qualification: qualification || "",
                    designation: designation || "",
                    joiningDate: joiningDate || "",
                    basicSalary: basicSalary || "",

                    // Personal
                    dob: dob || "",
                    gender: gender || "",
                    bloodGroup: bloodGroup || "",
                    socialCategory: socialCategory || "",
                    fatherName: fatherName || "",
                    emergencyContact: String(emergencyContact || ""),
                    permanentAddress: permanentAddress || "",

                    // Documents
                    panNumber: panNumber || "",
                    aadhaarNumber: String(aadhaarNumber || ""),

                    // Bank
                    bankName: bankName || "",
                    bankAccountNumber: String(bankAccountNumber || ""),
                    ifscCode: ifscCode || "",
                    uanNumber: uanNumber || "",
                    epfNumber: epfNumber || "",
                    pfJoiningDate: pfJoiningDate || "",
                    esicJoiningDate: esicJoiningDate || "",
                };

                await adminDb.collection("teachers").doc(uid).set(teacherDoc);
                await adminDb.collection("users").doc(uid).set(teacherDoc);

                successCount++;
            } catch (err: any) {
                errors.push(`${teacher.email}: ${err.message}`);
            }
        }

        return NextResponse.json({ successCount, errors });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
