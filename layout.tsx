import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "دستیار حقوقی هوشمند",
  description: "تحلیل پرونده‌های حقوقی با هوش مصنوعی",
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
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ fontFamily: "'Vazirmatn', Tahoma, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
