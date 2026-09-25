"use client";

import { useState } from "react";
import Link from "next/link";
import { Pressable } from "@/components/ui/Pressable";
import { StudioWorkbench } from "@/components/studio/StudioWorkbench";
import { STUDIO_FORMS, type StudioFormId } from "@/lib/studio/catalog";
import { toPersianDigits } from "@/lib/format";

/**
 * Shakuro jewellery-ecommerce landing → immersive 3D ideation atelier.
 */
export function StudioLanding() {
  const [open, setOpen] = useState(false);
  const [seedForm, setSeedForm] = useState<StudioFormId>("raw");

  if (open) {
    return (
      <div className="jx-landing jx-theme">
        <div className="jx-studio-bar">
          <Pressable
            className="jx-cta jx-cta--ghost-dark tap-react"
            feedback={{ label: "بازگشت به ویترین", tone: "info" }}
            onPress={() => setOpen(false)}
          >
            ← ویترین استودیو
          </Pressable>
          <p className="jx-eyebrow">Live Atelier</p>
        </div>
        <StudioWorkbench initialForm={seedForm} />
      </div>
    );
  }

  return (
    <div className="jx-landing jx-theme">
      <section className="jx-hero jx-hero--studio">
        <div className="jx-hero__visual jx-hero__visual--studio" aria-hidden>
          <div className="jx-hero__orb" />
          <div className="jx-hero__orb jx-hero__orb--2" />
          <div className="jx-hero__wash" />
        </div>
        <div className="jx-hero__copy">
          <p className="jx-eyebrow">Studio 3D · گالری طلای آریا</p>
          <h1 className="jx-hero__title">ایده را لمس کن</h1>
          <p className="jx-hero__lede">
            ماده خام طلا را با انگشت روی گوشی شکل دهید — حلقه، دستبند، زنجیر،
            نگین و پلاک. سپس ارائه دهید.
          </p>
          <div className="jx-hero__actions">
            <Pressable
              className="jx-cta tap-react"
              feedback={{ label: "ورود به کارگاه", tone: "ok" }}
              onPress={() => {
                setSeedForm("raw");
                setOpen(true);
              }}
            >
              شروع با ماده خام
            </Pressable>
            <Link href="/employee/products" className="jx-cta jx-cta--ghost tap-react">
              ویترین محصول
            </Link>
          </div>
        </div>
      </section>

      <div className="jx-promo">
        <p className="jx-promo__kicker">Hands-on Design</p>
        <p className="jx-promo__title">صفر تا صد · لمس تا ارائه</p>
        <p className="jx-promo__meta">
          {toPersianDigits(STUDIO_FORMS.length)} فرم قطعه · نگین · عیار · ارائه
          ۳D
        </p>
      </div>

      <nav className="jx-cats" aria-label="شروع سریع فرم">
        {STUDIO_FORMS.map((f) => (
          <Pressable
            key={f.id}
            className="jx-cat"
            feedback={{ label: f.titleFa, tone: "ok" }}
            onPress={() => {
              setSeedForm(f.id);
              setOpen(true);
            }}
          >
            {f.titleFa}
          </Pressable>
        ))}
      </nav>

      <section className="jx-featured jx-featured--static">
        <div className="jx-featured__media jx-featured__media--studio">
          <div className="jx-studio-preview-orb" />
        </div>
        <div className="jx-featured__copy">
          <p className="jx-eyebrow">How it works</p>
          <h2>طلای خام → ایدهٔ شما</h2>
          <p>
            ابزار شکل‌دهی را انتخاب کنید، با انگشت بکشید، نگین بگذارید، و در حالت
            ارائه قطعه را برای مدیر یا هم‌تیمی بچرخانید.
          </p>
          <Pressable
            className="jx-featured__link tap-react"
            feedback={{ label: "ورود", tone: "ok" }}
            onPress={() => setOpen(true)}
          >
            ورود به بوم ۳D ←
          </Pressable>
        </div>
      </section>

      <div className="jx-brands">
        <div className="jx-brand-pill">
          <strong>لمس</strong>
          <span>شکل‌دهی مستقیم طلا</span>
        </div>
        <div className="jx-brand-pill">
          <strong>نگین</strong>
          <span>الماس تا فیروزه</span>
        </div>
        <div className="jx-brand-pill">
          <strong>ارائه</strong>
          <span>نمایش تمام‌صفحه</span>
        </div>
      </div>

      <section className="jx-grid-wrap">
        <div className="jx-section-head">
          <h2>کالکشن فرم‌ها</h2>
          <p>هر فرم یک نقطه شروع</p>
        </div>
        <div className="jx-grid">
          {STUDIO_FORMS.map((f) => (
            <Pressable
              key={f.id}
              className="jx-card jx-card--studio tap-react"
              feedback={{ label: f.titleFa, tone: "ok" }}
              onPress={() => {
                setSeedForm(f.id);
                setOpen(true);
              }}
            >
              <div
                className="jx-card__media jx-card__media--studio"
                style={{ ["--jx-accent" as string]: f.accent }}
              >
                <span className="jx-studio-form-glyph" data-form={f.id} />
                <span className="jx-card__chip">۳D</span>
              </div>
              <div className="jx-card__body">
                <p className="jx-card__brand">Atelier</p>
                <h3 className="jx-card__title">{f.titleFa}</h3>
                <p className="jx-card__meta">{f.blurbFa}</p>
              </div>
            </Pressable>
          ))}
        </div>
      </section>

      <section className="jx-editorial">
        <p className="jx-eyebrow">Pitch Ready</p>
        <h2>ایده بساز · ارائه بده</h2>
        <p>
          استودیو برای تمرین روایت فروش است — قطعه را بسازید، عکس بگیرید، و روی
          کف گالری توضیح دهید. دانش ≠ مجوز کار؛ ایده فقط تمرین است.
        </p>
        <Pressable
          className="jx-cta tap-react"
          feedback={{ label: "شروع", tone: "ok" }}
          onPress={() => setOpen(true)}
        >
          باز کردن کارگاه
        </Pressable>
      </section>
    </div>
  );
}
