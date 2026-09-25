"use client";

import { AppShell } from "@/components/layout/AppShell";
import { ArsenalWorkbench } from "@/components/atelier/ArsenalWorkbench";

export default function ArsenalPage() {
  return (
    <AppShell title="Arsenal کارگاه" backHref="/employee/practice">
      <div className="mx-auto max-w-app space-y-5 pb-4">
        <ArsenalWorkbench />
      </div>
    </AppShell>
  );
}
