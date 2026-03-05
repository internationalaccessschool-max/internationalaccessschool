import { NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { customInitApp } from "@/lib/firebase-admin";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { students } = body;

        if (!students || !Array.isArray(students)) {
            return NextResponse.json({ error: "Invalid data format. Expected an array of students." }, { status: 400 });
        }

        customInitApp();
        const db = getFirestore();
        const auth = getAuth();

        let successCount = 0;
        const errors: any[] = [];

        for (const student of students) {
            try {
                // ── Resolve class: new imports use currentClass, old use className ──
                const resolvedClass = (
                    student.currentClass ||
                    student.className ||
                    student.classAtAdmission ||
                    "Unassigned"
                ).toString().trim();

                const resolvedSection = (student.section || "Unassigned").toString().trim();

                // ── Resolve name ──
                let firstName = student.firstName || "";
                let lastName = student.lastName || "";
                if (!firstName && student.name) {
                    const parts = student.name.trim().split(/\s+/);
                    lastName = parts.length > 1 ? parts.pop()! : "";
                    firstName = parts.join(" ");
                }
                const displayName = `${firstName} ${lastName}`.trim() || student.name || "Student";

                // ── Auth credentials ──
                const admNo = String(student.admissionNumber || "").trim();
                const email = `${admNo}@ias.edu`;

                // Password = DOB (DD-MM-YYYY, at least 8 chars) or fallback
                const rawDob = (student.dob || "").toString().trim();
                const password = rawDob.length >= 8 ? rawDob : `ias${admNo}2025`;

                let uid: string;
                try {
                    const userRecord = await auth.createUser({
                        email,
                        password,
                        displayName,
                    });
                    uid = userRecord.uid;
                } catch (authError: any) {
                    if (authError.code === "auth/email-already-exists") {
                        const existing = await auth.getUserByEmail(email);
                        uid = existing.uid;
                    } else {
                        throw authError;
                    }
                }

                // ── Build full student document ──
                const studentData: Record<string, any> = {
                    role: "student",
                    uid,
                    email,

                    // Identity
                    name: student.name || displayName,
                    firstName,
                    lastName,
                    middleName: student.middleName || "",
                    admissionNumber: admNo,
                    serialNumber: student.serialNumber || "",

                    // Status
                    status: (student.status || "ACTIVE").toString().toUpperCase(),
                    session: student.session || "",
                    dateOfAdmission: student.dateOfAdmission || "",
                    branch: student.branch || "",

                    // Personal
                    dob: rawDob,
                    gender: student.gender || "",
                    bloodGroup: student.bloodGroup || "",
                    category: student.category || "",
                    religion: student.religion || "",
                    nationality: student.nationality || "Indian",
                    house: student.house || "",
                    freeScheme: student.freeScheme || "",
                    economicallyWeakSection: student.economicallyWeakSection || "",
                    minorityStatus: student.minorityStatus || "",

                    // Academic
                    className: resolvedClass,           // used by existing queries
                    currentClass: resolvedClass,        // new field
                    classAtAdmission: student.classAtAdmission || "",
                    section: resolvedSection,
                    rollNumber: student.rollNumber || "",
                    stream: student.stream || "",
                    udise: student.udise || "",
                    cbseEnrolmentNo: student.cbseEnrolmentNo || "",
                    aadharNo: student.aadharNo || "",
                    pen: student.pen || "",
                    aparId: student.aparId || "",

                    // Contact
                    mobileNo: student.mobileNo || "",
                    contact2: student.contact2 || "",
                    contact3: student.contact3 || "",
                    address: student.address || student.localAddress || "",
                    localAddress: student.localAddress || student.address || "",
                    permanentAddress: student.permanentAddress || "",
                    pinCode: student.pinCode || "",
                    transport: student.transport || "",

                    // Family
                    fatherName: student.fatherName || "",
                    fatherQualification: student.fatherQualification || "",
                    fatherOccupation: student.fatherOccupation || "",
                    fatherMobile: student.fatherMobile || "",
                    motherName: student.motherName || "",
                    motherQualification: student.motherQualification || "",
                    motherOccupation: student.motherOccupation || "",
                    motherMobile: student.motherMobile || "",
                    guardianName: student.guardianName || "",
                    guardianRelation: student.guardianRelation || "",
                    guardianQualification: student.guardianQualification || "",
                    annualIncome: student.annualIncome || "",

                    // Left / TC details
                    lastClass: student.lastClass || "",
                    lastDate: student.lastDate || "",
                    leftYear: student.leftYear || "",
                    tcNumber: student.tcNumber || "",
                    block: student.block || "",
                    previousSchool: student.previousSchool || "",
                    previousSchoolAddress: student.previousSchoolAddress || "",
                    remarks: student.remarks || "",

                    // Medical
                    height: student.height || "",
                    weight: student.weight || "",
                    allergies: student.allergies || "",
                    physicallyDisabled: student.physicallyDisabled || "No",

                    // Bank
                    accountNumber: student.accountNumber || "",
                    accountHolderName: student.accountHolderName || "",
                    ifscCode: student.ifscCode || "",
                    bankName: student.bankName || "",

                    // Documents (empty, to be uploaded by student)
                    childPhotoUrl: student.childPhotoUrl || "",
                    parentPhotoUrl: "",
                    aadharUrl: "",
                    aparUrl: "",
                    fatherAadharUrl: "",
                    motherAadharUrl: "",

                    createdAt: new Date(),
                    updatedAt: new Date(),
                };

                // ── Firestore path ──
                // users → classes → {className} → sections → {section} → students → profiles → {uid}
                const rootRef = db.collection("users").doc("classes");
                const classRef = rootRef.collection(resolvedClass).doc("sections");
                const sectionRef = classRef.collection(resolvedSection).doc("students");
                const profileRef = sectionRef.collection("profiles").doc(uid);

                // Ensure parent stubs exist (so Firestore console shows tree)
                await rootRef.set({ updatedAt: new Date() }, { merge: true });
                await classRef.set({ class: resolvedClass, updatedAt: new Date() }, { merge: true });
                await sectionRef.set({ section: resolvedSection, class: resolvedClass, updatedAt: new Date() }, { merge: true });

                // Save student
                await profileRef.set(studentData, { merge: true });

                // Also save a lightweight lookup doc at top-level for quick queries
                await db.collection("studentLookup").doc(uid).set({
                    uid,
                    admissionNumber: admNo,
                    name: studentData.name,
                    className: resolvedClass,
                    section: resolvedSection,
                    status: studentData.status,
                    mobileNo: studentData.mobileNo,
                    email,
                }, { merge: true });

                successCount++;
            } catch (err: any) {
                console.error(`Failed to import student ${student.admissionNumber}:`, err);
                errors.push({ admissionNumber: student.admissionNumber, error: err.message });
            }
        }

        return NextResponse.json({ success: true, successCount, errors });

    } catch (error: any) {
        console.error("Bulk import failed:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
