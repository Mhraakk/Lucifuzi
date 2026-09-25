"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Pressable } from "@/components/ui/Pressable";
import { MotionEnter } from "@/components/motion/Motion";
import {
  ARSENAL_CATEGORIES,
  ARSENAL_STATS,
  itemsByCategory,
  type ArsenalCategoryId,
} from "@/lib/atelier/arsenal";
import { toPersianDigits } from "@/lib/format";

/**
 * Full atelier arsenal — design, melt, coin pack/repair, gold assay, USD UV.
 */
export function ArsenalWorkbench({ compact = false }: { compact?: boolean }) {
  const [cat, setCat] = useState<ArsenalCategoryId>("gold_assay");
  const category = ARSENAL_CATEGORIES.find((c) => c.id === cat)!;
  const items = useMemo(() => itemsByCategory(cat), [cat]);

  if (compact) {
    return (
      <section className="arsenal-compact surface p-4 animate-in">
        <p className="atelier-kicker">کارگاه · ابزار واقعی</p>
        <h2 className="page-title !text-lg mb-2">
          ذوب · محک · UV دلار · بسته‌بندی سکه
        </h2>
        <p className="muted text-sm leading-7 mb-3">
          {toPersianDigits(ARSENAL_STATS.items)} قلم ابزار و متریال برای طراحی،
          ذوب، سکه، صحت‌سنجی طلای شکسته/دست‌دوم و نور تشخیص جعل دلار.
        </p>
        <Link
          href="/employee/arsenal"
          className="btn btn-primary tap-react w-full text-sm"
        >
          Arsenal کارگاه
        </Link>
      </section>
    );
  }

  return (
    <div className="arsenal-workbench">
      <MotionEnter>
        <p className="atelier-kicker">Atelier Arsenal · Tools & Materials</p>
        <h1 className="page-title mb-2">لوازم کارگاه گالری</h1>
        <p className="muted text-sm leading-7 mb-4">
          فهرست واقعی ابزار، زنگ هشدار، متریال و نور لازم برای طراحی، ذوب،
          بسته‌بندی و تعمیر سکه، صحت‌سنجی طلای مشکوک، و تشخیص اسکناس جعلی با UV —
          برای آموزش کف؛ موجودی انبار جعلی نیست.
        </p>
        <p className="arsenal-meta mb-4">
          {toPersianDigits(ARSENAL_STATS.categories)} دسته ·{" "}
          {toPersianDigits(ARSENAL_STATS.items)} قلم
        </p>
      </MotionEnter>

      <div className="arsenal-tabs">
        {ARSENAL_CATEGORIES.map((c) => (
          <Pressable
            key={c.id}
            className={`arsenal-tab ${cat === c.id ? "is-on" : ""}`}
            feedback={{ label: c.titleFa, tone: "ok" }}
            onPress={() => setCat(c.id)}
            style={
              cat === c.id
                ? { borderColor: c.accent, background: `${c.accent}22` }
                : undefined
            }
          >
            <strong>{c.titleFa}</strong>
            <em>{c.shortFa}</em>
          </Pressable>
        ))}
      </div>

      <section
        className="arsenal-hero surface p-4 mt-4"
        style={{ borderColor: category.accent }}
      >
        <p className="atelier-kicker">{category.shortFa}</p>
        <h2 className="section-title !mb-2">{category.titleFa}</h2>
        <p className="muted text-sm leading-7">{category.promiseFa}</p>
      </section>

      <div className="arsenal-list mt-4 space-y-3">
        {items.map((item, i) => (
          <article key={item.id} className="arsenal-card surface p-4">
            <div className="flex items-start gap-3">
              <span className="arsenal-card__n">
                {toPersianDigits(i + 1)}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-sm mb-1">{item.titleFa}</h3>
                <p className="text-sm leading-7 mb-2">{item.purposeFa}</p>
                <p className="muted text-xs leading-6 mb-2">
                  <strong className="text-[var(--ink)]">کاربرد: </strong>
                  {item.howFa}
                </p>
                <p className="arsenal-card__caution text-xs leading-6 mb-2">
                  <strong>احتیاط: </strong>
                  {item.cautionFa}
                </p>
                <div className="arsenal-mats">
                  {item.materialsFa.map((m) => (
                    <span key={m} className="arsenal-mat">
                      {m}
                    </span>
                  ))}
                </div>
                <p className="faint text-[0.65rem] mt-2 leading-5">
                  {item.standardCueFa}
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>

      <section className="arsenal-flow surface p-4 mt-5">
        <p className="section-title !mb-2">ترتیب عملی روی قطعه مشکوک</p>
        <ol className="arsenal-flow__steps">
          <li>آهن‌ربا + لوپ مهر</li>
          <li>سنگ محک و اسید (با PPE و هود)</li>
          <li>چگالی یا XRF در صورت تجهیز</li>
          <li>در صورت خرید قراضه → توزین → ذوب با کنترل دو نفره</li>
          <li>اسکناس مشکوک → UV + مغناطیس + واترمارک؛ جدا از گاوصندوق اصلی</li>
        </ol>
        <div className="flex flex-col gap-2 mt-3">
          <Link
            href="/employee/scenario/sc_fraud_switch"
            className="btn btn-secondary tap-react w-full text-sm"
          >
            سناریوی ریسک / تقلب
          </Link>
          <Link
            href="/employee/practice"
            className="btn btn-primary tap-react w-full text-sm"
          >
            بازگشت به تمرین عملی
          </Link>
        </div>
      </section>
    </div>
  );
}
