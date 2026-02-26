import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

const SUBJECTS_MAP: Record<string, string[]> = {};

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
                const { firstName, lastName, email, phone, subjects, qualification, password } = teacher;

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
                    firstName,
                    lastName,
                    name: `${firstName} ${lastName}`,
                    email,
                    phone: String(phone),
                    subjects: subjectsArray,
                    qualification: qualification || "",
                    role: "teacher",
                    assignment: { classSections: {}, subjects: [], streams: [] },
                    status: "Active",
                    createdAt: new Date().toISOString(),
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
