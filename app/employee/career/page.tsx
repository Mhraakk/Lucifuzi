"use client";

import { AppShell } from "@/components/layout/AppShell";
import { CareerPathfinder } from "@/components/career/CareerPathfinder";

export default function CareerPage() {
  return (
    <AppShell title="مسیر نقش" backHref="/employee/skills">
      <div className="mx-auto max-w-app space-y-5 pb-4">
        <CareerPathfinder />
      </div>
    </AppShell>
  );
}
