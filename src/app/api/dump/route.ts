import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";

export async function GET() {
    try {
        const ctSnap = await getDocs(collection(db, "class_teachers"));
        const teachersSnap = await getDocs(collection(db, "teachers"));

        return NextResponse.json({
            class_teachers: ctSnap.docs.map(d => ({ id: d.id, ...d.data() })),
            teachers: teachersSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
