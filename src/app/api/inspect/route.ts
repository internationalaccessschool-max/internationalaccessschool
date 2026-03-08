import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export async function GET() {
    try {
        const result: any = { status: "ok", classes: {}, flatRecords: 0, nestedRecords: 0 };

        // 1. Get flat records
        const flatSnap = await adminDb.collection("feeRecords").get();
        result.flatRecords = flatSnap.size;

        // 2. Get classes
        const classesSnap = await adminDb.collection("fees").doc("structure").collection("classes").get();
        result.classesCount = classesSnap.size;

        for (const doc of classesSnap.docs) {
            result.classes[doc.id] = { hasStructure: true };

            // Check nested records for 2026/3
            const nestedSnap = await adminDb
                .collection("feeRecords")
                .doc("2026")
                .collection("months")
                .doc("3")
                .collection("classes")
                .doc(doc.id)
                .collection("records")
                .get();

            result.classes[doc.id].nestedRecords = nestedSnap.size;
            result.nestedRecords += nestedSnap.size;
        }

        // 3. Get students
        const studentsSnap = await adminDb.collectionGroup("profiles").get();
        result.studentsCount = studentsSnap.size;

        return NextResponse.json(result);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
