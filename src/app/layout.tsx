import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/components/providers";
import Script from "next/script";
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
        {/* OneSignal Push Notification SDK */}
        <Script src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js" defer strategy="afterInteractive" />
        <Script id="onesignal-init" strategy="afterInteractive">
          {`
            window.OneSignalDeferred = window.OneSignalDeferred || [];
            OneSignalDeferred.push(async function(OneSignal) {
              await OneSignal.init({
                appId: "${process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID}",
                safari_web_id: "web.onesignal.auto.10485988-1822-4e96-b399-29edb7cde282",
                notifyButton: { enable: false },
                allowLocalhostAsSecureOrigin: true,
                serviceWorkerPath: "/OneSignalSDKWorker.js",
              });
            });
          `}
        </Script>
      </body>
    </html>
  );
}
