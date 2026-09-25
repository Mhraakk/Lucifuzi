"use client";

import { Suspense } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { StudioLanding } from "@/components/studio/StudioLanding";

export default function StudioPage() {
  return (
    <AppShell title="استودیو ۳D">
      <div className="mx-auto max-w-app pb-4 jx-page jx-page--atelier">
        <Suspense
          fallback={
            <p className="muted text-sm p-4">آماده‌سازی استودیو ایده‌پردازی…</p>
          }
        >
          <StudioLanding />
        </Suspense>
      </div>
    </AppShell>
  );
}
