import { adminDb } from "@/lib/firebase-admin";
import type { Transaction, DocumentReference, DocumentData } from "firebase-admin/firestore";

/**
 * Server-side version of getNextReceiptNo using firebase-admin.
 */
export async function getNextReceiptNoAdmin(): Promise<string> {
    const counterRef = adminDb.collection("counters").doc("receiptNo") as DocumentReference<DocumentData>;
    const num = await adminDb.runTransaction(async (tx: Transaction) => {
        const snap = await tx.get(counterRef);
        const next = snap.exists ? (((snap.data() as DocumentData)?.value as number) ?? 0) + 1 : 1;
        tx.set(counterRef, { value: next });
        return next;
    });
    return String(num);
}
