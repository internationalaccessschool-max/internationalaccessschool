import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/auth-guard";
import { FieldValue } from "firebase-admin/firestore";
import { getNextReceiptNoAdmin } from "@/lib/receipt-counter-admin";

export async function POST(req: NextRequest) {
    try {
        const authResult = await verifyAuth(req, ["admin"]);
        if (authResult instanceof NextResponse) return authResult;

        const { recordId, year, month, paymentMode, paymentRef } = await req.json();
        if (!recordId || !year || !month || !paymentMode) {
            return NextResponse.json({ error: "Missing fields" }, { status: 400 });
        }

        const recordRef = adminDb
            .collection("teacherSalary").doc(String(year))
            .collection("months").doc(String(month))
            .collection("records").doc(recordId);

        const snap = await recordRef.get();
        if (!snap.exists) {
            return NextResponse.json({ error: "Salary record not found" }, { status: 404 });
        }
        const data = snap.data() as any;
        if (data.status === "paid") {
            return NextResponse.json({ error: "Already paid" }, { status: 400 });
        }

        const receiptNo = await getNextReceiptNoAdmin();

        await recordRef.update({
            status: "paid",
            paidOn: FieldValue.serverTimestamp(),
            paymentMode,
            paymentRef: paymentRef || "",
            receiptNo,
            paidBy: authResult.uid,
        });

        return NextResponse.json({ success: true, receiptNo });
    } catch (error: any) {
        console.error("[TeacherSalary/pay] Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
