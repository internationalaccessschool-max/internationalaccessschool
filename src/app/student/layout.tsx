import { Metadata } from "next";
import StudentLayoutClient from "./client-layout";

export const metadata: Metadata = {
  title: "IAS Student Portal",
  description: "Access your attendance, homework, exams, and more.",
  manifest: "/manifest-student.json",
  icons: {
    icon: '/logo-student.png',
    apple: '/logo-student.png',
  },
};

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return <StudentLayoutClient>{children}</StudentLayoutClient>;
}
