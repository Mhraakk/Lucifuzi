"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Pressable } from "@/components/ui/Pressable";
import { StudioWorkbench } from "@/components/studio/StudioWorkbench";
import { STUDIO_FORMS, type StudioFormId } from "@/lib/studio/catalog";
import {
  allProductBrainstormSeeds,
  brainstormSeedForSlug,
  type ProductStudioSeed,
} from "@/lib/studio/productBrainstorm";
import { hasEnvironmentResponsibility, recordStudioSession } from "@/lib/store";
import { useAppState, useCurrentUser } from "@/lib/hooks";
import { toPersianDigits } from "@/lib/format";

/**
 * Jewellery atelier + per-product 3D brainstorm entry points.
 * Deep-link: /employee/studio?product=<slug>
 * Floor ideation duty requires responsibility on ideation_studio.
 */
export function StudioLanding() {
  const search = useSearchParams();
  const productParam = search.get("product");
  const productSeed = useMemo(
    () => (productParam ? brainstormSeedForSlug(productParam) : null),
    [productParam]
  );
  const state = useAppState();
  const user = useCurrentUser();
  const ideationUnlocked = hasEnvironmentResponsibility(
    user.id,
    "ideation_studio",
    "supervised_only",
    state
  );

  const [open, setOpen] = useState(false);
  const [seedForm, setSeedForm] = useState<StudioFormId>("raw");
  const [activeSeed, setActiveSeed] = useState<ProductStudioSeed | null>(null);

  const productSeeds = useMemo(() => allProductBrainstormSeeds(), []);

  useEffect(() => {
    if (!productSeed) return;
    setActiveSeed(productSeed);
    setSeedForm(productSeed.form);
    setOpen(true);
  }, [productSeed]);

  function openWorkbench(
    form: StudioFormId,
    seed: ProductStudioSeed | null = null
  ) {
    setSeedForm(form);
    setActiveSeed(seed);
    setOpen(true);
    if (seed) recordStudioSession();
  }

  if (open) {
    return (
      <div className="jx-landing jx-theme jx-atelier">
        <div className="jx-studio-bar">
          <Pressable
            className="jx-cta jx-cta--ghost-dark tap-react"
            feedback={{ label: "بازگشت", tone: "info" }}
            onPress={() => {
              setOpen(false);
              setActiveSeed(null);
            }}
          >
            ← کالکشن
          </Pressable>
          <p className="jx-eyebrow">
            {activeSeed ? "Product Brainstorm" : "Live Atelier"}
          </p>
        </div>
        <StudioWorkbench
          key={
            activeSeed ? `p-${activeSeed.productSlug}` : `f-${seedForm}`
          }
          initialForm={activeSeed?.form ?? seedForm}
          initialKarat={activeSeed?.karat}
          initialGem={activeSeed?.gem}
          initialTitle={activeSeed?.title}
          productLabel={
            activeSeed
              ? `${activeSeed.brandFa} · ${activeSeed.productNameFa}`
              : undefined
          }
          prompts={activeSeed?.prompts}
        />
      </div>
    );
  }

  return (
    <div className="jx-landing jx-theme jx-atelier">
      <section className="jx-arch-hero">
        <div className="jx-arch-hero__frame" aria-hidden>
          <div className="jx-arch-hero__glow" />
          <div className="jx-arch-hero__piece" />
        </div>
        <div className="jx-arch-hero__copy">
          <p className="jx-eyebrow">3D Brainstorm · فروشگاه</p>
          <h1>
            Design <em>Ideas</em>
          </h1>
          <p className="jx-arch-hero__lede">
            برای هر محصول طلایی، کارگاه سه‌بعدی ایده‌پردازی دارید — واریانت،
            ارائه، و ست‌سازی که به کف فروشگاه کمک می‌کند.
          </p>
          <Pressable
            className="jx-cta jx-cta--ink tap-react"
            feedback={{ label: "شروع", tone: "ok" }}
            onPress={() => openWorkbench("raw")}
          >
            شروع با ماده خام
          </Pressable>
        </div>
      </section>

      <section className="surface p-3 mb-4">
        {ideationUnlocked ? (
          <p className="text-xs leading-6">
            مسئولیت استودیو ایده‌پردازی فعال است — خروجی‌های ۳D برای کف مجازند.
          </p>
        ) : (
          <p className="text-xs leading-6 muted">
            تمرین استودیو باز است؛ اما{" "}
            <strong>مسئولیت ایده‌پردازی کف</strong> تا آزمایش نقش + محول مدیر
            قفل است.{" "}
            <Link href="/employee/trials/ideation_studio" className="underline">
              آزمایش ایده‌پردازی
            </Link>
            {" · "}
            <Link href="/employee/floor" className="underline">
              کف مسئولیت
            </Link>
          </p>
        )}
      </section>

      <section className="jx-product-brain">
        <div className="jx-section-head">
          <h2>ایده‌پردازی ۳D هر محصول</h2>
          <p>{toPersianDigits(productSeeds.length)} قطعه کاتالوگ</p>
        </div>
        <p className="muted text-sm leading-7 mb-3">
          هر کارت محصول را باز کنید تا با عیار و فرم همان قطعه، سه مسیر ایده
          (واریانت · ارائه · ست) برای کمک به فروشگاه ساخته شود.
        </p>
        <div
          className="jx-product-brain__rail"
          aria-label="محصولات برای ایده‌پردازی"
        >
          {productSeeds.map((s) => (
            <Pressable
              key={s.productSlug}
              className="jx-product-brain__card tap-react"
              feedback={{ label: s.productNameFa, tone: "ok" }}
              onPress={() => openWorkbench(s.form, s)}
            >
              <span
                className="jx-product-brain__swatch"
                style={{ background: s.accent }}
                data-form={s.form}
              />
              <span className="jx-product-brain__body">
                <strong>{s.productNameFa}</strong>
                <em>
                  {s.brandFa} · {toPersianDigits(s.karat)} عیار ·{" "}
                  {STUDIO_FORMS.find((f) => f.id === s.form)?.titleFa}
                </em>
              </span>
            </Pressable>
          ))}
        </div>
      </section>

      <section className="jx-round-cats">
        <div className="jx-section-head">
          <h2>فرم‌ها</h2>
          <p>{toPersianDigits(STUDIO_FORMS.length)} نقطه شروع آزاد</p>
        </div>
        <div className="jx-round-cats__rail" aria-label="فرم‌های ۳D">
          {STUDIO_FORMS.map((f) => (
            <Pressable
              key={f.id}
              className="jx-round-cat tap-react"
              feedback={{ label: f.titleFa, tone: "ok" }}
              onPress={() => openWorkbench(f.id)}
            >
              <span
                className="jx-round-cat__disc"
                style={{ ["--jx-accent" as string]: f.accent }}
                data-form={f.id}
              />
              <span className="jx-round-cat__label">{f.titleFa}</span>
            </Pressable>
          ))}
        </div>
      </section>

      <section className="jx-soft-feature">
        <div className="jx-soft-feature__media">
          <div className="jx-soft-feature__orb" />
        </div>
        <div className="jx-soft-feature__copy">
          <p className="jx-eyebrow">How it works</p>
          <h2>
            محصول واقعی → <em>ایده فروشگاه</em>
          </h2>
          <p>
            از ویترین محصول وارد شوید، قطعه را در ۳D شکل دهید، نگین بگذارید، و
            برای هم‌تیمی ارائه دهید — تمرین روایت قبل از مشتری واقعی.
          </p>
          <Link href="/employee/products" className="jx-text-link tap-react">
            رفتن به ویترین محصول ←
          </Link>
        </div>
      </section>

      <div className="jx-soft-pills">
        <div className="jx-soft-pill">
          <strong>واریانت</strong>
          <span>دو گزینه روی سینی</span>
        </div>
        <div className="jx-soft-pill">
          <strong>ارائه</strong>
          <span>تمرین روایت شیفت</span>
        </div>
        <div className="jx-soft-pill">
          <strong>ست</strong>
          <span>ارتقا بدون فشار</span>
        </div>
      </div>

      <section className="jx-soft-footer">
        <p className="jx-eyebrow">Floor Ready</p>
        <h2>
          ایده بساز · <em>به فروشگاه کمک کن</em>
        </h2>
        <p>
          ایده‌پردازی سه‌بعدی برای هر محصول طلا — ابزار تمرینی کف گالری، نه
          سرگرمی جدا.
        </p>
        <div className="jx-soft-footer__actions">
          <Pressable
            className="jx-cta jx-cta--ink tap-react"
            feedback={{ label: "کارگاه", tone: "ok" }}
            onPress={() => openWorkbench("raw")}
          >
            باز کردن کارگاه
          </Pressable>
          <Link
            href="/employee/products"
            className="jx-cta jx-cta--ghost-dark tap-react"
          >
            ویترین محصول
          </Link>
        </div>
      </section>
    </div>
  );
}
