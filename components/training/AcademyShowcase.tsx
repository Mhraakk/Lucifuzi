"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Pressable } from "@/components/ui/Pressable";
import { formatMinutes, toPersianDigits } from "@/lib/format";
import { illustrationSrcForCourse } from "@/lib/illustrations";
import {
  CURRICULUM_DOMAINS,
  REGION_LABELS,
  type StandardRegion,
} from "@/lib/standards";
import type { Course } from "@/lib/types";
import { sculptureSrc, sculptureWork } from "@/lib/atelier/sculptures";

type FilterId = "all" | "path" | "us" | "ch" | "eu" | "other";

const FILTERS: Array<{ id: FilterId; label: string }> = [
  { id: "all", label: "همه" },
  { id: "path", label: "بسته نقش" },
  { id: "us", label: "آمریکا" },
  { id: "ch", label: "سوئیس" },
  { id: "eu", label: "اروپا" },
  { id: "other", label: "سایر" },
];

function courseRegions(courseId: string): StandardRegion[] {
  const domains = CURRICULUM_DOMAINS.filter((d) =>
    d.relatedCourseIds.includes(courseId)
  );
  const set = new Set<StandardRegion>();
  for (const d of domains) for (const r of d.regions) set.add(r);
  return [...set];
}

/**
 * Shakuro jewellery-ecommerce layout applied to training academy data.
 * Same UX/UI language as /employee/products — cream field, charcoal CTA, card grid.
 */
export function AcademyShowcase({
  pathTitle,
  pathDescription,
  recommended,
  others,
  progressOf,
}: {
  pathTitle: string;
  pathDescription: string;
  recommended: Course[];
  others: Course[];
  progressOf: (courseId: string) => number;
}) {
  const [filter, setFilter] = useState<FilterId>("path");

  const all = useMemo(() => [...recommended, ...others], [recommended, others]);

  const list = useMemo(() => {
    if (filter === "all") return all;
    if (filter === "path") return recommended;
    if (filter === "other") return others;
    return all.filter((c) => courseRegions(c.id).includes(filter));
  }, [filter, all, recommended, others]);

  const hero = recommended[0] ?? all[0];
  const featured = list[0] ?? hero;
  const grid = list.filter((c) => c.id !== featured?.id);

  if (!hero || !featured) {
    return <p className="muted">دوره‌ای یافت نشد.</p>;
  }

  const heroImg = sculptureSrc("learn");
  const featuredImg =
    featured.coverImage ?? illustrationSrcForCourse(featured.id);
  const marble = sculptureWork("theory");

  return (
    <div className="jx-landing jx-theme">
      {/* Hero — sculptural theory atmosphere */}
      <section className="jx-hero">
        <div className="jx-hero__visual">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={heroImg} alt={marble.title} />
          <div className="jx-hero__wash" aria-hidden />
        </div>
        <div className="jx-hero__copy">
          <p className="jx-eyebrow">Theory · آتلیه چشم · میکل‌آنژ</p>
          <h1 className="jx-hero__title">آموزش تئوری</h1>
          <p className="jx-hero__lede">
            {pathDescription ||
              "تئوری و عملی تنها منبع آموزش‌اند — بینایی، استدلال بصری و دقت را با استاندارد آمریکا، سوئیس و اروپا بسازید."}
          </p>
          <p className="atelier-marble-credit" style={{ marginTop: "0.35rem" }}>
            {marble.artist} · {marble.title}
          </p>
          <div className="jx-hero__actions">
            <Link
              href={`/employee/courses/${hero.id}`}
              className="jx-cta tap-react"
            >
              شروع «{hero.title}»
            </Link>
            <Link href="/employee/practice" className="jx-cta jx-cta--ghost tap-react">
              ژانر عملی
            </Link>
          </div>
        </div>
      </section>

      {/* Soft promo strip — Shakuro secondary band */}
      <div className="jx-promo">
        <p className="jx-promo__kicker">Collection</p>
        <p className="jx-promo__title">{pathTitle}</p>
        <p className="jx-promo__meta">
          {toPersianDigits(recommended.length)} دوره در بسته نقش ·{" "}
          {toPersianDigits(all.length)} دامنه کل
        </p>
      </div>

      {/* Category rail */}
      <nav className="jx-cats" aria-label="فیلتر آموزش">
        {FILTERS.map((f) => (
          <Pressable
            key={f.id}
            className={`jx-cat ${filter === f.id ? "is-on" : ""}`}
            feedback={{ label: f.label, tone: "ok" }}
            onPress={() => setFilter(f.id)}
          >
            {f.label}
          </Pressable>
        ))}
      </nav>

      {/* Featured split — same as product featured */}
      <Link
        href={`/employee/courses/${featured.id}`}
        className="jx-featured tap-react"
      >
        <div className="jx-featured__media">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={featuredImg} alt={featured.title} />
        </div>
        <div className="jx-featured__copy">
          <p className="jx-eyebrow">{featured.academy || featured.category}</p>
          <h2>{featured.title}</h2>
          <p>{featured.description}</p>
          <div className="jx-featured__stats">
            <span>{formatMinutes(featured.estimatedMinutes)}</span>
            <span>{toPersianDigits(progressOf(featured.id))}٪ پوشش</span>
          </div>
          <span className="jx-featured__link">ورود به دوره ←</span>
        </div>
      </Link>

      {/* Region brand pills */}
      <div className="jx-brands">
        {(["us", "ch", "eu"] as StandardRegion[]).map((r) => (
          <Pressable
            key={r}
            className="jx-brand-pill tap-react"
            feedback={{ label: REGION_LABELS[r].fa, tone: "info" }}
            onPress={() => setFilter(r)}
          >
            <strong>{REGION_LABELS[r].fa}</strong>
            <span>{REGION_LABELS[r].en}</span>
          </Pressable>
        ))}
      </div>

      {/* Course grid — ecommerce cards */}
      <section className="jx-grid-wrap">
        <div className="jx-section-head">
          <h2>کالکشن آموزش</h2>
          <p>{toPersianDigits(list.length)} دوره</p>
        </div>
        <div className="jx-grid">
          {(grid.length ? grid : list).map((c) => {
            const img =
              c.coverImage ?? illustrationSrcForCourse(c.id);
            const regions = courseRegions(c.id);
            const progress = progressOf(c.id);
            return (
              <Link
                key={c.id}
                href={`/employee/courses/${c.id}`}
                className="jx-card tap-react"
              >
                <div className="jx-card__media">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img} alt={c.title} loading="lazy" />
                  <span className="jx-card__chip">
                    {regions.length
                      ? regions.map((r) => REGION_LABELS[r].fa).join(" · ")
                      : c.academy || "آریا"}
                  </span>
                  {progress > 0 ? (
                    <span className="jx-card__progress">
                      {toPersianDigits(progress)}٪
                    </span>
                  ) : null}
                </div>
                <div className="jx-card__body">
                  <p className="jx-card__brand">
                    {c.academy || c.category}
                  </p>
                  <h3 className="jx-card__title">{c.title}</h3>
                  <p className="jx-card__meta line-clamp-2">{c.description}</p>
                  <p className="jx-card__meta mt-2">
                    {formatMinutes(c.estimatedMinutes)}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Domains as lookbook strip */}
      <section className="jx-lookbook">
        <div className="jx-section-head">
          <h2>دامنه‌های شایستگی</h2>
          <p>US · CH · EU</p>
        </div>
        <div className="jx-lookbook__rail">
          {CURRICULUM_DOMAINS.map((d) => (
            <Link
              key={d.id}
              href={
                d.relatedCourseIds[0]
                  ? `/employee/courses/${d.relatedCourseIds[0]}`
                  : "/employee/learn"
              }
              className="jx-lookbook__card tap-react"
            >
              <p className="jx-lookbook__code">{d.code}</p>
              <h3>{d.titleFa}</h3>
              <p>{d.summaryFa}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Closing editorial band */}
      <section className="jx-editorial">
        <p className="jx-eyebrow">Theory · Practice · Eye</p>
        <h2>تئوری · عملی · طراحی · نقش</h2>
        <p>
          دوره عمیق مهارتی باید مشخص کند فروشنده می‌شوید، حسابدار، طراح، یا
          ایده‌پرداز. آزمون فقط دانش را می‌سنجد؛ مهارت و تناسب نقش روی کف دیده
          می‌شود. مجوز کار فقط با ارزیابی عملی مدیر.
        </p>
        <Link href="/employee/career" className="jx-cta tap-react">
          کشف مسیر نقش عمیق
        </Link>
        <Link href="/employee/studio" className="jx-cta jx-cta--ghost tap-react" style={{ marginTop: "0.55rem" }}>
          استودیو ۳D — مهارت لمسی
        </Link>
        <Link href="/employee/practice" className="jx-cta jx-cta--ghost tap-react" style={{ marginTop: "0.55rem" }}>
          ژانر عملی
        </Link>
      </section>
    </div>
  );
}
