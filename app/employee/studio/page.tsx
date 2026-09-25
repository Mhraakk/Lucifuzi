"use client";

import { AppShell } from "@/components/layout/AppShell";
import { StudioLanding } from "@/components/studio/StudioLanding";

export default function StudioPage() {
  return (
    <AppShell title="استودیو ۳D">
      <div className="mx-auto max-w-app pb-4 jx-page">
        <StudioLanding />
      </div>
    </AppShell>
  );
}
