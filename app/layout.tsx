import type { Metadata } from "next";
import "./globals.css";
import { ThemeBoot } from "@/components/layout/ThemeBoot";

export const metadata: Metadata = {
  title: "آریا آموزش | سامانه آموزش عملیاتی طلافروشی",
  description:
    "پلتفرم آموزش کارکنان فروشگاه‌های طلا و جواهر — شایستگی، SOP، شبیه‌سازی و ارزیابی عملی",
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
          href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body className="font-persian antialiased">
        <ThemeBoot />
        {children}
      </body>
    </html>
  );
}
