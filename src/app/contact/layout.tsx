import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Contact Us — International Access School",
    description: "Get in touch with International Access School. Visit us at Atarsua, Siwan, Bihar, or contact us by phone or email. We respond within 24 hours.",
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
