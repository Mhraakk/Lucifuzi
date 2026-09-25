"use client";

import { JewelleryShowcase } from "@/components/training/JewelleryShowcase";
import { AppShell } from "@/components/layout/AppShell";

export default function ProductsPage() {
  return (
    <AppShell title="محصولات">
      <div className="mx-auto max-w-app pb-4 jx-page">
        <JewelleryShowcase />
      </div>
    </AppShell>
  );
}
