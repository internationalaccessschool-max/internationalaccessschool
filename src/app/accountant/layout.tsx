import { Metadata } from "next";
import AccountantLayoutClient from "./client-layout";

export const metadata: Metadata = {
  title: "IAS Accountant Portal",
  description: "Accountant portal for fee management and transactions.",
  manifest: "/manifest-accountant.json",
  icons: {
    icon: '/logo-accountant.png',
    apple: '/logo-accountant.png',
  },
};

export default function AccountantLayout({ children }: { children: React.ReactNode }) {
  return <AccountantLayoutClient>{children}</AccountantLayoutClient>;
}
