import { Metadata } from "next";
import AdminLayoutClient from "./client-layout";

export const metadata: Metadata = {
  title: "IAS Admin Console",
  description: "Administrative console for managing users, fees, and academics.",
  manifest: "/manifest-admin.json",
  icons: {
    icon: '/logo-admin.png',
    apple: '/logo-admin.png',
  },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayoutClient>{children}</AdminLayoutClient>;
}
