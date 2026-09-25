"use client";

import Link from "next/link";
import { toPersianDigits } from "@/lib/format";

export type WallPin = {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  progress: number;
  image?: string;
};

const PIN_IMAGES = [
  "/atelier/atelier-products.png",
  "/illustrations/topic-product.png",
  "/illustrations/topic-pricing.png",
  "/illustrations/topic-sales.png",
  "/illustrations/topic-security.png",
  "/illustrations/topic-care.png",
  "/illustrations/topic-inventory.png",
  "/illustrations/topic-crm.png",
];

/** Irregular mosaic sizes — gallery wall, not a sequence */
const MOSAIC = ["wide", "tall", "square", "wide", "square", "tall", "square", "wide"] as const;

function pinState(progress: number): "fresh" | "open" | "complete" {
  if (progress >= 100) return "complete";
  if (progress > 0) return "open";
  return "fresh";
}

function pinLabel(progress: number): string {
  if (progress >= 100) return "روی ویترین";
  if (progress > 0) return "در کارگاه";
  return "ویترین";
}

/** Editorial jewelry wall — mosaic cases, no linear ladder. */
export function AtelierWall({
  eyebrow,
  title,
  overall,
  pins,
  goalLabel,
}: {
  eyebrow?: string;
  title: string;
  overall: number;
  pins: WallPin[];
  goalLabel?: string;
}) {
  return (
    <section className="atelier-wall animate-in">
      <div className="atelier-wall__hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/atelier/atelier-board.png"
          alt=""
          className="atelier-wall__bg"
          loading="lazy"
        />
        <div className="atelier-wall__veil" aria-hidden />
        <div className="atelier-wall__intro">
          {eyebrow ? <p className="atelier-kicker">{eyebrow}</p> : null}
          <h2 className="atelier-title">{title}</h2>
          {goalLabel ? <p className="atelier-lede">{goalLabel}</p> : null}
          <p className="atelier-score">
            <span>{toPersianDigits(overall)}</span>
            <em>٪ پوشش ویترین</em>
          </p>
        </div>
      </div>

      <div className="atelier-mosaic">
        {pins.map((pin, i) => {
          const img = pin.image ?? PIN_IMAGES[i % PIN_IMAGES.length]!;
          const state = pinState(pin.progress);
          const size = MOSAIC[i % MOSAIC.length]!;
          return (
            <Link
              key={pin.id}
              href={pin.href}
              className={`atelier-case atelier-case--${size} atelier-case--${state}`}
            >
              <div className="atelier-case__media">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img} alt="" loading="lazy" />
                <span className="atelier-case__tag">{pinLabel(pin.progress)}</span>
              </div>
              <div className="atelier-case__body">
                <p className="atelier-case__title">{pin.title}</p>
                {pin.subtitle ? (
                  <p className="atelier-case__sub">{pin.subtitle}</p>
                ) : null}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/** Product-led hero — real atelier tray photo, solid readable panel (no portrait). */
export function AtelierProductHero({
  title,
  subtitle,
  ctaHref,
  ctaLabel,
}: {
  title: string;
  subtitle?: string;
  ctaHref?: string;
  ctaLabel?: string;
}) {
  return (
    <section className="atelier-product-hero animate-in">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/atelier/atelier-products.png"
        alt="مصنوعات طلا روی سینی مخمل گالری"
        className="atelier-product-hero__img"
        loading="eager"
      />
      <div className="atelier-product-hero__panel">
        <p className="atelier-kicker">گالری طلای آریا</p>
        <h2 className="atelier-title">{title}</h2>
        {subtitle ? <p className="atelier-lede">{subtitle}</p> : null}
        {ctaHref && ctaLabel ? (
          <Link
            href={ctaHref}
            className="btn btn-primary tap-react mt-4 !min-h-11 text-sm"
          >
            {ctaLabel}
          </Link>
        ) : null}
      </div>
    </section>
  );
}

/** @deprecated use AtelierProductHero — muse portrait removed */
export const AtelierMuseHero = AtelierProductHero;

export function AtelierProductStrip() {
  return (
    <figure className="atelier-strip animate-in">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/atelier/atelier-products.png"
        alt="نمایش مصنوعات طلا روی سینی مخمل"
        loading="lazy"
      />
      <figcaption>
        نحوه ارائه محصول روی سینی مخمل — استاندارد ویترین گالری
      </figcaption>
    </figure>
  );
}

/** Flat gallery pins — every case is open; no locked staircase order */
export function buildWallPins(
  courses: Array<{
    id: string;
    title: string;
    description: string;
    progress: number;
  }>
): WallPin[] {
  return courses.map((c) => ({
    id: c.id,
    title: c.title,
    subtitle: c.description,
    href: `/employee/courses/${c.id}`,
    progress: c.progress,
  }));
}
