"use client";

import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { StandardsChart } from "@/components/training/StandardsChart";
import { useAppState } from "@/lib/hooks";
import { formatMinutes } from "@/lib/format";

export default function ManagerTrainingPage() {
  const state = useAppState();
  return (
    <AppShell title="آموزش">
      <div className="mx-auto max-w-app space-y-5">
        <h1 className="page-title">کتابخانه آموزش</h1>
        <p className="muted text-sm leading-7">
          چارت آموزشی با اطلس شایستگی آمریکا · سوئیس · اروپا هم‌راستاست.
          دانش آزمون مجوز کار نیست — فقط ارزیابی عملی مشاهده‌شده.
        </p>

        <StandardsChart compact />

        <Link href="/manager/builder" className="btn btn-primary w-full">
          سازنده دوره
        </Link>
        <Link href="/manager/scenarios" className="btn btn-secondary w-full">
          سازنده سناریو
        </Link>
        <Link href="/manager/sops" className="btn btn-secondary w-full">
          دستورالعمل‌ها
        </Link>
        <div className="space-y-2">
          {state.courses.map((c) => (
            <div key={c.id} className="surface p-4">
              <p className="font-bold text-sm">{c.title}</p>
              <p className="muted text-xs mt-1 leading-6">
                {c.academy ?? c.category} · {formatMinutes(c.estimatedMinutes)} ·{" "}
                {c.isPublished ? "منتشر" : "پیش‌نویس"}
              </p>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
