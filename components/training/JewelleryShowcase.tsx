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
    <div className="jx-landing">
      {/* Hero — full-bleed product plane */}
      <section className="jx-hero">
        <div className="jx-hero__visual">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={hero.image} alt={hero.nameFa} />
          <div className="jx-hero__wash" aria-hidden />
        </div>
        <div className="jx-hero__copy">
          <p className="jx-eyebrow">ویترین آموزش محصول</p>
          <h1 className="jx-hero__title">جواهرات آریا</h1>
          <p className="jx-hero__lede">
            کارشده، آب‌شده، شمش زربد و پلاک زردیس — با مدل، سبک و سیاق واقعی برای
            یادگیری کارکنان.
          </p>
          <Link
            href={`/employee/products/${hero.slug}`}
            className="jx-cta tap-react"
          >
            مشاهده قطعه شاخص
          </Link>
        </div>
      </section>

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
          <strong>آریا</strong>
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
    </div>
  );
}

export function ProductDetailView({ slug }: { slug: string }) {
  const product = getProduct(slug);
  if (!product) {
    return <p className="muted">محصول یافت نشد.</p>;
  }

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

      <Link href="/employee/formula" className="btn btn-primary tap-react w-full">
        تمرین محاسبه قیمت این قطعه
      </Link>
    </article>
  );
}
