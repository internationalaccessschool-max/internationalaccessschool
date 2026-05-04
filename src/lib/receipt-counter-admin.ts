import { adminDb } from "@/lib/firebase-admin";
import type { Transaction } from "firebase-admin/firestore";

/**
 * Server-side version of getNextReceiptNo using firebase-admin.
 */
export async function getNextReceiptNoAdmin(): Promise<string> {
    const counterRef = adminDb.collection("counters").doc("receiptNo");
    const num = await adminDb.runTransaction(async (tx: Transaction) => {
        const snap = await tx.get(counterRef);
        const next = snap.exists ? ((snap.data()?.value as number) ?? 0) + 1 : 1;
        tx.set(counterRef, { value: next });
        return next;
    });
    return String(num);
}
