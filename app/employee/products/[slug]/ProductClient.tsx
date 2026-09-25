"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { ProductDetailView } from "@/components/training/JewelleryShowcase";

export default function ProductClient() {
  const { slug } = useParams<{ slug: string }>();

  return (
    <AppShell title="جزئیات محصول" backHref="/employee/products">
      <div className="mx-auto max-w-app space-y-4 pb-4">
        <Link
          href="/employee/products"
          className="btn btn-ghost tap-react !min-h-10 text-xs"
        >
          ← بازگشت به ویترین
        </Link>
        <ProductDetailView slug={slug} />
      </div>
    </AppShell>
  );
}
