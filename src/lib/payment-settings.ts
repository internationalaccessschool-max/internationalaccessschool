/**
 * School's fee-collection details — stored in Firestore at `settings/global`
 * under `payment`, edited from Admin → Settings → Fee Payment, and shown to
 * parents on the student "My Fees" page.
 */
export interface PaymentSettings {
    upiId: string;
    payeeName: string;
    whatsapp: string;   // digits with country code, e.g. 919347776670
    note: string;
    // Bank transfer (NEFT / IMPS) — for parents who don't use UPI
    bankName: string;
    branch: string;
    accountName: string;
    accountNumber: string;
    ifsc: string;
}

export const DEFAULT_PAYMENT: PaymentSettings = {
    upiId: "INTERNATIONALACCESS974@icici",
    payeeName: "International Access School",
    whatsapp: "",
    note: "Payment ke baad screenshot ya UTR number WhatsApp par bhejein taki status jaldi update ho sake.",
    bankName: "ICICI Bank",
    branch: "Siwan Branch",
    accountName: "International Access School",
    accountNumber: "133805003974",
    ifsc: "ICIC0001338",
};

/**
 * Fills in fields a saved doc doesn't have yet (older docs predate the bank
 * details), while keeping every value the admin actually set — including a
 * deliberately cleared "" , which means "hide this".
 */
export function mergePaymentSettings(saved: Partial<PaymentSettings> | undefined | null): PaymentSettings {
    const merged = { ...DEFAULT_PAYMENT };
    for (const key of Object.keys(DEFAULT_PAYMENT) as (keyof PaymentSettings)[]) {
        const value = saved?.[key];
        if (typeof value === "string") merged[key] = value;
    }
    return merged;
}
