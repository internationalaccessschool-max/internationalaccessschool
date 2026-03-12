import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/auth-guard";

export async function POST(req: NextRequest) {
    try {
        const authResult = await verifyAuth(req, ["admin", "accountant"]);
        if (authResult instanceof NextResponse) return authResult;

        const { month, year, session } = await req.json();

        if (!month || !year) {
            return NextResponse.json({ error: "Missing month or year" }, { status: 400 });
        }

        // Fetch all students via collectionGroup
        const studentsSnap = await adminDb.collectionGroup("profiles").get();
        const activeStudents = studentsSnap.docs
            .map((d: any) => ({ id: d.id, ...d.data() } as any))
            .filter((s: any) => (s.status || "").toUpperCase() !== "LEFT");

        // Fetch fee structures
        const feeStructSnap = await adminDb.collection("feeStructure").get();
        const feeStructMap = new Map();
        feeStructSnap.docs.forEach((d: any) => feeStructMap.set(d.data().className, d.data()));

        let count = 0;
        const batches = [];
        let currentBatch = adminDb.batch();
        let opsInBatch = 0;

        for (const student of activeStudents) {
            // Normalize class name
            const rawCls = student.currentClass || student.className || student.class || "";
            const cls = rawCls.toString().replace(/^class\s*/i, "").trim();
            const feeData = cls ? feeStructMap.get(cls) : null;
            const amount = feeData?.tuitionFee || 0; // fallback to 0 if not set

            // Idempotent document ID to prevent duplicates
            const docId = `${student.id}_${month}_${year}_tuition`;

            const yearStr = year.toString();
            const monthStr = month.toString();
            const classId = cls || "unknown";

            const feeRef = adminDb
                .collection("feeRecords")
                .doc(yearStr)
                .collection("months")
                .doc(monthStr)
                .collection("classes")
                .doc(classId)
                .collection("records")
                .doc(docId);

            const studentName = `${student.firstName || ""} ${student.lastName || ""}`.trim() || student.name || "Unknown";

            currentBatch.set(feeRef, {
                studentId: student.id,
                studentName,
                admissionNumber: student.admissionNumber || "",
                class: cls || "",
                section: student.section || "",
                amount,
                feeType: "tuition",
                month,
                year,
                status: "pending",
                createdAt: new Date().toISOString()
            }, { merge: true });

            opsInBatch++;
            count++;

            // firestore batches can be up to 500
            if (opsInBatch === 400) {
                batches.push(currentBatch.commit());
                currentBatch = adminDb.batch();
                opsInBatch = 0;
            }
        }

        if (opsInBatch > 0) {
            batches.push(currentBatch.commit());
        }

        await Promise.all(batches);

        return NextResponse.json({ success: true, count, message: `Generated ${count} fee records successfully.` });
    } catch (error: any) {
        console.error("Generate fee error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
