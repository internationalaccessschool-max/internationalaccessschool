import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "International Access School — Shaping Global Leaders",
  description:
    "International Access School provides world-class education focused on academic excellence, innovation, and holistic development. Apply now for admissions.",
  keywords: ["international school", "education", "admissions", "academics", "global leaders"],
  manifest: "/manifest.json",
  icons: {
    icon: '/LOGO.png',
    apple: '/LOGO.png',
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased min-h-screen bg-background text-foreground`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
