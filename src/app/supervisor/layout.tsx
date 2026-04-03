import { Metadata } from "next";
import SupervisorLayoutClient from "./client-layout";

export const metadata: Metadata = {
  title: "IAS Supervisor Portal",
  description: "Supervisor portal for tracking buses and activities.",
  manifest: "/manifest-supervisor.json",
  icons: {
    icon: '/logo-supervisor.png',
    apple: '/logo-supervisor.png',
  },
};

export default function SupervisorLayout({ children }: { children: React.ReactNode }) {
  return <SupervisorLayoutClient>{children}</SupervisorLayoutClient>;
}
