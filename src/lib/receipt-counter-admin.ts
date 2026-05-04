import { adminDb } from "@/lib/firebase-admin";

/**
 * Server-side version of getNextReceiptNo using firebase-admin.
 */
export async function getNextReceiptNoAdmin(): Promise<string> {
    const counterRef = adminDb.collection("counters").doc("receiptNo");
    const num = await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(counterRef);
        const next = snap.exists ? ((snap.data()?.value as number) ?? 0) + 1 : 1;
        tx.set(counterRef, { value: next });
        return next;
    });
    return String(num);
}
