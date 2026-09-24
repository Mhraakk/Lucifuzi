"use client";

import Link from "next/link";
import { toPersianDigits } from "@/lib/format";
import type { LadderStep } from "@/components/training/CareerLadder";

export type WallPin = LadderStep & {
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

/** Editorial gallery wall — Tashola-inspired product presentation, not a ladder. */
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
          {goalLabel ? (
            <p className="atelier-lede">{goalLabel}</p>
          ) : null}
          <p className="atelier-score">
            <span>{toPersianDigits(overall)}</span>
            <em>٪ مسیر ویترین</em>
          </p>
        </div>
      </div>

      <div className="atelier-pins">
        {pins.map((pin, i) => {
          const img = pin.image ?? PIN_IMAGES[i % PIN_IMAGES.length]!;
          const locked = pin.status === "locked";
          return (
            <Link
              key={pin.id}
              href={locked ? "#" : pin.href}
              aria-disabled={locked}
              className={`atelier-pin atelier-pin--${pin.status} ${
                locked ? "pointer-events-none opacity-55" : ""
              }`}
              style={{ animationDelay: `${40 + i * 55}ms` }}
            >
              <div className="atelier-pin__media">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img} alt="" loading="lazy" />
                <span className="atelier-pin__tag">
                  {pin.status === "done"
                    ? "آموخته"
                    : pin.status === "current"
                      ? "اکنون"
                      : "بعدی"}
                </span>
              </div>
              <div className="atelier-pin__body">
                <p className="atelier-pin__title">{pin.title}</p>
                {pin.subtitle ? (
                  <p className="atelier-pin__sub">{pin.subtitle}</p>
                ) : null}
                <div className="atelier-pin__bar" aria-hidden>
                  <i style={{ width: `${Math.min(100, pin.progress)}%` }} />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function AtelierMuseHero({
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
    <section className="atelier-muse animate-in">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/atelier/atelier-muse.png"
        alt="ارائه جواهرات در گالری"
        className="atelier-muse__img"
        loading="eager"
      />
      <div className="atelier-muse__copy">
        <p className="atelier-kicker">گالری طلای آریا</p>
        <h2 className="atelier-title">{title}</h2>
        {subtitle ? <p className="atelier-lede">{subtitle}</p> : null}
        {ctaHref && ctaLabel ? (
          <Link href={ctaHref} className="btn btn-primary mt-4 !min-h-11 text-sm">
            {ctaLabel}
          </Link>
        ) : null}
      </div>
    </section>
  );
}

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

/** Reuse ladder step builder shape for wall pins */
export { buildLadderSteps as buildWallPins } from "@/components/training/CareerLadder";
