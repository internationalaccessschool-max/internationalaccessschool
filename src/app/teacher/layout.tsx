import { Metadata } from "next";
import TeacherLayoutClient from "./client-layout";

export const metadata: Metadata = {
  title: "IAS Teacher Portal",
  description: "Manage classes, marks, attendance, and homework.",
  manifest: "/manifest-teacher.json",
  icons: {
    icon: '/logo-teacher.png',
    apple: '/logo-teacher.png',
  },
};

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return <TeacherLayoutClient>{children}</TeacherLayoutClient>;
}
