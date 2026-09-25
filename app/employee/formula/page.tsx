"use client";

import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { FormulaStudio } from "@/components/training/FormulaStudio";

export default function FormulaLabPage() {
  return (
    <AppShell title="فرمول طلا" backHref="/employee/practice">
      <div className="mx-auto max-w-app space-y-5 pb-4">
        <header className="surface p-4 animate-in">
          <h1 className="page-title !text-xl mb-2">کارگاه فرمول طلافروشی</h1>
          <p className="text-sm leading-7 muted">
            صفر تا صد محاسبه قیمت: وزن، عیار، ارزش فلز، اجرت، سود، مالیات. هر لمس
            خروجی زنده می‌دهد — همان فرمول عملیاتی شعبه آریا.
          </p>
        </header>
        <FormulaStudio />
        <Link
          href="/employee/quiz?calc=1"
          className="btn btn-primary tap-react w-full"
        >
          آزمون محاسبه با همین فرمول
        </Link>
      </div>
    </AppShell>
  );
}
