"use client";

import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { useAppState } from "@/lib/hooks";
import { formatMinutes } from "@/lib/format";

export default function ManagerTrainingPage() {
  const state = useAppState();
  return (
    <AppShell title="آموزش">
      <div className="mx-auto max-w-app space-y-5">
        <h1 className="page-title">کتابخانه آموزش</h1>
        <p className="muted text-sm leading-7">
          دوره‌ها، سناریوها و SOPها. برای ساخت دوره کامل از سازنده استفاده کنید.
        </p>
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
              <p className="muted text-xs mt-1">
                {c.category} · {formatMinutes(c.estimatedMinutes)} ·{" "}
                {c.isPublished ? "published" : "draft"}
              </p>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
