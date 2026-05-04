import { db } from "@/lib/firebase";
import { doc, runTransaction } from "firebase/firestore";

/**
 * Returns the next sequential receipt number from Firestore counter.
 * All receipt types share the same counter so numbers are globally unique.
 */
export async function getNextReceiptNo(): Promise<string> {
    const counterRef = doc(db, "counters", "receiptNo");
    const num = await runTransaction(db, async (tx) => {
        const snap = await tx.get(counterRef);
        const next = snap.exists() ? (snap.data().value as number) + 1 : 1;
        tx.set(counterRef, { value: next });
        return next;
    });
    return String(num);
}
