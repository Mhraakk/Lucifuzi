"use client";

import { useState } from "react";
import Link from "next/link";
import { Pressable } from "@/components/ui/Pressable";
import { StudioWorkbench } from "@/components/studio/StudioWorkbench";
import { STUDIO_FORMS, type StudioFormId } from "@/lib/studio/catalog";
import { toPersianDigits } from "@/lib/format";

/**
 * Jewellery mobile ecommerce language from dribbble.com/search/jewellery
 * (Jewlly / Shakuro / boutique concepts) → 3D ideation atelier.
 */
export function StudioLanding() {
  const [open, setOpen] = useState(false);
  const [seedForm, setSeedForm] = useState<StudioFormId>("raw");

  if (open) {
    return (
      <div className="jx-landing jx-theme jx-atelier">
        <div className="jx-studio-bar">
          <Pressable
            className="jx-cta jx-cta--ghost-dark tap-react"
            feedback={{ label: "بازگشت", tone: "info" }}
            onPress={() => setOpen(false)}
          >
            ← کالکشن
          </Pressable>
          <p className="jx-eyebrow">Live Atelier</p>
        </div>
        <StudioWorkbench initialForm={seedForm} />
      </div>
    );
  }

  return (
    <div className="jx-landing jx-theme jx-atelier">
      {/* Soft gallery hero — arched product plane */}
      <section className="jx-arch-hero">
        <div className="jx-arch-hero__frame" aria-hidden>
          <div className="jx-arch-hero__glow" />
          <div className="jx-arch-hero__piece" />
        </div>
        <div className="jx-arch-hero__copy">
          <p className="jx-eyebrow">Sculpture · Craft · آریا</p>
          <h1>
            Modern <em>Ideas</em>
          </h1>
          <p className="jx-arch-hero__lede">
            ژانر عملی در فضا: ماده خام طلا را با انگشت شکل دهید — همان دقت
            سنگ‌تراشی ایتالیایی برای بینایی و مهارت لمسی — سپس ارائه دهید.
          </p>
          <Pressable
            className="jx-cta jx-cta--ink tap-react"
            feedback={{ label: "شروع", tone: "ok" }}
            onPress={() => {
              setSeedForm("raw");
              setOpen(true);
            }}
          >
            شروع با ماده خام
          </Pressable>
        </div>
      </section>

      {/* Circular category rail — Jewlly-style */}
      <section className="jx-round-cats">
        <div className="jx-section-head">
          <h2>فرم‌ها</h2>
          <p>{toPersianDigits(STUDIO_FORMS.length)} نقطه شروع</p>
        </div>
        <div className="jx-round-cats__rail" aria-label="فرم‌های ۳D">
          {STUDIO_FORMS.map((f) => (
            <Pressable
              key={f.id}
              className="jx-round-cat tap-react"
              feedback={{ label: f.titleFa, tone: "ok" }}
              onPress={() => {
                setSeedForm(f.id);
                setOpen(true);
              }}
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

      {/* Featured split — soft product detail */}
      <section className="jx-soft-feature">
        <div className="jx-soft-feature__media">
          <div className="jx-soft-feature__orb" />
        </div>
        <div className="jx-soft-feature__copy">
          <p className="jx-eyebrow">How it works</p>
          <h2>
            طلای خام → <em>ایده شما</em>
          </h2>
          <p>
            ابزار شکل‌دهی را بزنید، با انگشت بکشید، نگین بگذارید، و در حالت ارائه
            برای هم‌تیمی بچرخانید.
          </p>
          <Pressable
            className="jx-text-link tap-react"
            feedback={{ label: "ورود", tone: "ok" }}
            onPress={() => setOpen(true)}
          >
            ورود به بوم ۳D ←
          </Pressable>
        </div>
      </section>

      <div className="jx-soft-pills">
        <div className="jx-soft-pill">
          <strong>لمس</strong>
          <span>شکل‌دهی مستقیم</span>
        </div>
        <div className="jx-soft-pill">
          <strong>نگین</strong>
          <span>الماس تا فیروزه</span>
        </div>
        <div className="jx-soft-pill">
          <strong>ارائه</strong>
          <span>تمام‌صفحه</span>
        </div>
      </div>

      <section className="jx-grid-wrap">
        <div className="jx-section-head">
          <h2>کالکشن فرم‌ها</h2>
          <p>هر کارت یک شروع</p>
        </div>
        <div className="jx-grid jx-grid--soft">
          {STUDIO_FORMS.map((f) => (
            <Pressable
              key={f.id}
              className="jx-soft-card tap-react"
              feedback={{ label: f.titleFa, tone: "ok" }}
              onPress={() => {
                setSeedForm(f.id);
                setOpen(true);
              }}
            >
              <div
                className="jx-soft-card__media"
                style={{ ["--jx-accent" as string]: f.accent }}
              >
                <span className="jx-studio-form-glyph" data-form={f.id} />
              </div>
              <div className="jx-soft-card__body">
                <h3>{f.titleFa}</h3>
                <p>{f.blurbFa}</p>
              </div>
            </Pressable>
          ))}
        </div>
      </section>

      <section className="jx-soft-footer">
        <p className="jx-eyebrow">Pitch Ready</p>
        <h2>
          ایده بساز · <em>ارائه بده</em>
        </h2>
        <p>
          استودیو برای تمرین روایت فروش است — قطعه را بسازید، عکس بگیرید، روی کف
          گالری توضیح دهید.
        </p>
        <div className="jx-soft-footer__actions">
          <Pressable
            className="jx-cta jx-cta--ink tap-react"
            feedback={{ label: "کارگاه", tone: "ok" }}
            onPress={() => setOpen(true)}
          >
            باز کردن کارگاه
          </Pressable>
          <Link href="/employee/products" className="jx-cta jx-cta--ghost-dark tap-react">
            ویترین محصول
          </Link>
        </div>
      </section>
    </div>
  );
}
