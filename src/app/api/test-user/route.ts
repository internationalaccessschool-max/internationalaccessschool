import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get('uid') || "tKIDK9eBB5M5UPOiC78wyGKGKH82";

    try {
        const snap = await getDoc(doc(db, "users", uid));
        return NextResponse.json({
            exists: snap.exists(),
            data: snap.data(),
            uid
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message });
    }
}
