import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeBoot } from "@/components/layout/ThemeBoot";
import { PwaRegister } from "@/components/layout/PwaRegister";

export const metadata: Metadata = {
  title: "Beatris",
  description: "آتلیه آموزش جواهر",
  applicationName: "Beatris",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Beatris",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0806",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fa" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=El+Messiri:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="font-persian antialiased">
        <ThemeBoot />
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
