"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  PRODUCT_CATEGORY_LABELS,
  PRODUCT_STYLE_LABELS,
  getProduct,
  heroProduct,
  productsByCategory,
  type ProductCategory,
  type TrainingProduct,
} from "@/lib/products-catalog";
import { formatNumber, toPersianDigits } from "@/lib/format";
import { Pressable } from "@/components/ui/Pressable";
import {
  brainstormSeedForSlug,
  studioHrefForProduct,
} from "@/lib/studio/productBrainstorm";
import { STUDIO_FORMS } from "@/lib/studio/catalog";

const FILTERS: Array<{ id: "all" | ProductCategory; label: string }> = [
  { id: "all", label: "همه" },
  { id: "worked", label: "کارشده" },
  { id: "melted", label: "آب‌شده" },
  { id: "zarbed", label: "شمش زربد" },
  { id: "zardis", label: "پلاک زردیس" },
];

function ProductCard({ product }: { product: TrainingProduct }) {
  return (
    <Link
      href={`/employee/products/${product.slug}`}
      className="jx-card tap-react"
    >
      <div
        className="jx-card__media"
        style={{ ["--jx-accent" as string]: product.accent }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={product.image} alt={product.nameFa} loading="lazy" />
        <span className="jx-card__chip">
          {PRODUCT_CATEGORY_LABELS[product.category]}
        </span>
      </div>
      <div className="jx-card__body">
        <p className="jx-card__brand">{product.brandFa}</p>
        <h3 className="jx-card__title">{product.nameFa}</h3>
        <p className="jx-card__meta">
          {toPersianDigits(product.karat)} عیار ·{" "}
          {formatNumber(product.weightGrams, { decimals: 1 })} گرم ·{" "}
          {PRODUCT_STYLE_LABELS[product.style]}
        </p>
        <span className="jx-card__brain">۳D ایده‌پردازی</span>
      </div>
    </Link>
  );
}

/** Shakuro-style jewellery ecommerce landing — Arya training data */
export function JewelleryShowcase({
  initialCategory = "all",
}: {
  initialCategory?: "all" | ProductCategory;
}) {
  const [filter, setFilter] = useState<"all" | ProductCategory>(initialCategory);
  const hero = heroProduct();
  const list = useMemo(() => productsByCategory(filter), [filter]);
  const featured = list[0] ?? hero;
  const rest = list.filter((p) => p.id !== featured.id);

  return (
    <div className="jx-landing jx-theme">
      {/* Hero — full-bleed product plane */}
      <section className="jx-hero">
        <div className="jx-hero__visual">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={hero.image} alt={hero.nameFa} />
          <div className="jx-hero__wash" aria-hidden />
        </div>
        <div className="jx-hero__copy">
          <p className="jx-eyebrow">Boutique · Beatris</p>
          <h1 className="jx-hero__title">ویترین محصول</h1>
          <p className="jx-hero__lede">
            کارشده، آب‌شده، شمش زربد و پلاک زردیس — مدل، سبک و سیاق واقعی برای
            یادگیری کارکنان.
          </p>
          <div className="jx-hero__actions">
            <Link
              href={`/employee/products/${hero.slug}`}
              className="jx-cta tap-react"
            >
              مشاهده قطعه شاخص
            </Link>
            <Link href="/employee/learn" className="jx-cta jx-cta--ghost tap-react">
              آکادمی آموزش
            </Link>
          </div>
        </div>
      </section>

      <div className="jx-promo">
        <p className="jx-promo__kicker">Training Catalog</p>
        <p className="jx-promo__title">Beatris</p>
        <p className="jx-promo__meta">
          هر قطعه یک درس فروش است — لمس کنید و یاد بگیرید
        </p>
      </div>

      {/* Category rail */}
      <nav className="jx-cats" aria-label="دسته‌بندی محصول">
        {FILTERS.map((f) => (
          <Pressable
            key={f.id}
            className={`jx-cat ${filter === f.id ? "is-on" : ""}`}
            feedback={{ label: `فیلتر ${f.label}`, tone: "ok" }}
            onPress={() => setFilter(f.id)}
          >
            {f.label}
          </Pressable>
        ))}
      </nav>

      {/* Featured large card */}
      <Link
        href={`/employee/products/${featured.slug}`}
        className="jx-featured tap-react"
      >
        <div className="jx-featured__media">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={featured.image} alt={featured.nameFa} />
        </div>
        <div className="jx-featured__copy">
          <p className="jx-eyebrow">{featured.brandFa}</p>
          <h2>{featured.nameFa}</h2>
          <p>{featured.taglineFa}</p>
          <span className="jx-featured__link">آموزش این قطعه ←</span>
        </div>
      </Link>

      {/* Brand strips */}
      <div className="jx-brands">
        <div className="jx-brand-pill">
          <strong>زربد</strong>
          <span>شمش ۲۴ عیار آموزشی</span>
        </div>
        <div className="jx-brand-pill">
          <strong>زردیس</strong>
          <span>پلاک‌های نمادین</span>
        </div>
        <div className="jx-brand-pill">
          <strong>Beatris</strong>
          <span>زیور کارشده گالری</span>
        </div>
      </div>

      {/* Product grid */}
      <section className="jx-grid-wrap">
        <div className="jx-section-head">
          <h2>کالکشن آموزش</h2>
          <p>{toPersianDigits(list.length)} قطعه · لمس برای جزئیات</p>
        </div>
        <div className="jx-grid">
          {rest.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
          {/* keep featured also if filter empty of rest */}
          {rest.length === 0 ? <ProductCard product={featured} /> : null}
        </div>
      </section>

      {/* Lookbook rail — Shakuro secondary merchandising strip */}
      <section className="jx-lookbook">
        <div className="jx-section-head">
          <h2>خطوط محصول</h2>
          <p>Beatris</p>
        </div>
        <div className="jx-lookbook__rail">
          {(
            [
              {
                id: "worked",
                title: "کارشده",
                blurb: "زیور آماده فروش — داستان ساخت و نگه‌داری برای مشتری.",
              },
              {
                id: "melted",
                title: "آب‌شده",
                blurb: "عیار، وزن و اسکرپ — زبان دقیق خرید و تبدیل.",
              },
              {
                id: "zarbed",
                title: "شمش زربد",
                blurb: "میله‌های آموزشی ۲۴ عیار با وزن‌های استاندارد.",
              },
              {
                id: "zardis",
                title: "پلاک زردیس",
                blurb: "پلاک‌های نمادین برای تمرین روایت و هدیه.",
              },
            ] as const
          ).map((row) => (
            <Pressable
              key={row.id}
              className="jx-lookbook__card tap-react"
              feedback={{ label: row.title, tone: "ok" }}
              onPress={() => setFilter(row.id)}
            >
              <p className="jx-lookbook__code">{row.id.toUpperCase()}</p>
              <h3>{row.title}</h3>
              <p>{row.blurb}</p>
            </Pressable>
          ))}
        </div>
      </section>

      <section className="jx-editorial">
        <p className="jx-eyebrow">Boutique Training</p>
        <h2>هر قطعه یک درس فروش</h2>
        <p>
          ویترین محصول همان زبان بصری آموزش است — لمس کنید، سبک را بشناسید، سپس
          محاسبه و سناریو را تمرین کنید.
        </p>
        <Link href="/employee/studio" className="jx-cta tap-react">
          استودیو ۳D · ایده‌پردازی همه محصولات
        </Link>
      </section>
    </div>
  );
}

export function ProductDetailView({ slug }: { slug: string }) {
  const product = getProduct(slug);
  if (!product) {
    return <p className="muted">محصول یافت نشد.</p>;
  }

  const seed = brainstormSeedForSlug(product.slug);
  const formLabel =
    STUDIO_FORMS.find((f) => f.id === seed?.form)?.titleFa ?? "ماده خام";

  return (
    <article className="jx-detail">
      <div
        className="jx-detail__media"
        style={{ ["--jx-accent" as string]: product.accent }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={product.image} alt={product.nameFa} />
      </div>
      <div className="jx-detail__panel">
        <p className="jx-eyebrow">{product.brandFa}</p>
        <h1 className="jx-detail__title">{product.nameFa}</h1>
        <p className="jx-detail__tag">{product.taglineFa}</p>
        <div className="jx-detail__stats">
          <span>{toPersianDigits(product.karat)} عیار</span>
          <span>{formatNumber(product.weightGrams, { decimals: 1 })} گرم</span>
          <span>{PRODUCT_CATEGORY_LABELS[product.category]}</span>
          <span>{PRODUCT_STYLE_LABELS[product.style]}</span>
        </div>
      </div>

      {/* Required: 3D brainstorm per gold product for store floor help */}
      <section className="jx-detail__brain">
        <p className="jx-eyebrow">3D Brainstorm · کمک به فروشگاه</p>
        <h2>طراحی سه‌بعدی این قطعه</h2>
        <p>
          کارگاه ایده‌پردازی با قالب «{formLabel}» و عیار{" "}
          {toPersianDigits(product.karat)} از همین محصول باز می‌شود — واریانت،
          ارائه روی سینی، و ست‌سازی برای کمک به کف گالری.
        </p>
        {seed ? (
          <ul className="jx-detail__brain-list">
            {seed.prompts.map((p) => (
              <li key={p.id}>
                <strong>{p.titleFa}</strong>
                <span>{p.storeHelpFa}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <Link
          href={studioHrefForProduct(product.slug)}
          className="jx-cta tap-react"
          style={{ marginTop: "0.85rem" }}
        >
          باز کردن کارگاه ۳D این محصول
        </Link>
      </section>

      <section className="jx-detail__block">
        <h2>سبک و طراحی</h2>
        <p>{product.designNotesFa}</p>
      </section>

      <section className="jx-detail__block jx-detail__block--teach">
        <h2>آموزش فروش به کارکنان</h2>
        <p>{product.teachFa}</p>
        <ul>
          {product.talkingPoints.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>

      {product.cautionFa ? (
        <section className="jx-detail__block jx-detail__block--warn">
          <h2>هشدار عملیاتی</h2>
          <p>{product.cautionFa}</p>
        </section>
      ) : null}

      <div className="jx-detail__actions">
        <Link
          href={studioHrefForProduct(product.slug)}
          className="btn btn-primary tap-react w-full"
        >
          ایده‌پردازی ۳D · کمک به فروشگاه
        </Link>
        <Link
          href="/employee/formula"
          className="btn btn-secondary tap-react w-full"
        >
          تمرین محاسبه قیمت این قطعه
        </Link>
      </div>
    </article>
  );
}
