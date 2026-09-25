"use client";

import { useEffect, useMemo, useState } from "react";
import { calculateGoldPrice } from "@/lib/calculation";
import { formatCurrency, formatNumber, toPersianDigits } from "@/lib/format";
import { useAppState } from "@/lib/hooks";
import { Pressable } from "@/components/ui/Pressable";
import { useAllowsMotion } from "@/components/motion/Motion";

const STEPS = [
  {
    id: "weight",
    title: "۱ · وزن",
    teach: "اول وزن دقیق را از ترازوی کالیبره‌شده بخوانید. بدون وزن، هیچ فرمولی معتبر نیست.",
  },
  {
    id: "karat",
    title: "۲ · عیار",
    teach: "عیار از مهر قطعه یا گواهی می‌آید. ۱۸ = ۷۵۰، ۲۱ = ۸۷۵، ۲۴ ≈ ۹۹۹. قیمت گرم نسبت به پایه ۱۸ تعدیل می‌شود.",
  },
  {
    id: "gold",
    title: "۳ · ارزش فلز",
    teach: "ارزش طلا = وزن × قیمت هر گرم عیار همان قطعه. این بخش «اجرت» نیست — فقط فلز است.",
  },
  {
    id: "making",
    title: "۴ · اجرت ساخت",
    teach: "اجرت معمولاً درصدی از ارزش فلز است (پیش‌فرض ۱۲٪). مدل‌های خاص ممکن است اجرت ثابت داشته باشند.",
  },
  {
    id: "profit",
    title: "۵ · سود فروشگاه",
    teach: "سود روی ارزش فلز محاسبه می‌شود (پیش‌فرض ۷٪). این رقم را پنهان نکنید؛ شفافیت اعتماد می‌سازد.",
  },
  {
    id: "vat",
    title: "۶ · مالیات و ثابت",
    teach: "مالیات روی جمع (فلز + اجرت + سود) است مگر مدیر فرمول دیگری ابلاغ کند. سپس هزینه ثابت اضافه می‌شود.",
  },
  {
    id: "total",
    title: "۷ · مبلغ نهایی",
    teach: "رقم را یک‌بار با همکار کنترل کنید، بعد با آرامش برای مشتری خلاصه کنید — نه شتاب، نه پنهان‌کاری.",
  },
] as const;

/**
 * Interactive animated gold-pricing lab — real formula, live output on every touch.
 */
export function FormulaStudio({
  compact = false,
}: {
  compact?: boolean;
}) {
  const state = useAppState();
  const cfg = state.pricingFormulaConfig;
  const allows = useAllowsMotion();

  const [weight, setWeight] = useState(5);
  const [karat, setKarat] = useState<18 | 21 | 22 | 24>(18);
  const [makingPct, setMakingPct] = useState(cfg.makingFeePercent);
  const [profitPct, setProfitPct] = useState(cfg.profitPercent);
  const [step, setStep] = useState(0);
  const [revealed, setRevealed] = useState(0);
  const [pulse, setPulse] = useState<string | null>(null);

  const breakdown = useMemo(
    () =>
      calculateGoldPrice(cfg, {
        weightGrams: weight,
        karat,
        makingFeePercent: makingPct,
        profitPercent: profitPct,
      }),
    [cfg, weight, karat, makingPct, profitPct]
  );

  useEffect(() => {
    setRevealed(0);
    setStep(0);
  }, [weight, karat, makingPct, profitPct]);

  useEffect(() => {
    if (!allows) {
      setRevealed(STEPS.length);
      return;
    }
    if (revealed >= STEPS.length) return;
    const t = window.setTimeout(() => setRevealed((r) => r + 1), 380);
    return () => window.clearTimeout(t);
  }, [revealed, allows, weight, karat, makingPct, profitPct]);

  function bump(msg: string) {
    setPulse(msg);
    window.setTimeout(() => setPulse(null), 1400);
  }

  const lines = [
    { key: "w", label: "وزن", value: `${formatNumber(breakdown.weightGrams, { decimals: 1 })} گرم`, showAt: 1 },
    { key: "k", label: "عیار", value: toPersianDigits(breakdown.karat), showAt: 2 },
    { key: "g", label: "ارزش طلا", value: formatCurrency(breakdown.goldValue), showAt: 3 },
    { key: "m", label: "اجرت", value: formatCurrency(breakdown.makingFee), showAt: 4 },
    { key: "p", label: "سود", value: formatCurrency(breakdown.profit), showAt: 5 },
    { key: "v", label: "مالیات", value: formatCurrency(breakdown.vat), showAt: 6 },
    { key: "f", label: "ثابت", value: formatCurrency(breakdown.fixedFee), showAt: 6 },
    { key: "t", label: "نهایی", value: formatCurrency(breakdown.total), showAt: 7, strong: true },
  ];

  const teach = STEPS[Math.min(step, STEPS.length - 1)]!;

  return (
    <section className={`formula-studio ${compact ? "is-compact" : ""}`}>
      <header className="formula-studio__head">
        <p className="atelier-kicker">کارگاه فرمول · زنده</p>
        <h2 className="atelier-title !text-xl">محاسبه قیمت مثل گالری</h2>
        <p className="muted text-sm leading-7 mt-2">
          هر اسلایدر را لمس کنید — عدد و توضیح فوری می‌آید. این همان فرمول عملیاتی
          شعبه است، نه مثال تزیینی.
        </p>
      </header>

      <div className="formula-studio__controls">
        <label className="formula-slider">
          <span>
            وزن (گرم) · {formatNumber(weight, { decimals: 1 })}
          </span>
          <input
            type="range"
            min={1}
            max={40}
            step={0.5}
            value={weight}
            onChange={(e) => {
              setWeight(Number(e.target.value));
              bump(`وزن ${formatNumber(Number(e.target.value), { decimals: 1 })} گرم ثبت شد`);
              setStep(0);
            }}
          />
        </label>

        <div className="formula-karats">
          {([18, 21, 22, 24] as const).map((k) => (
            <Pressable
              key={k}
              className={`formula-karat ${karat === k ? "is-on" : ""}`}
              feedback={{
                label: `عیار ${toPersianDigits(k)} — قیمت گرم تعدیل شد`,
                tone: "ok",
              }}
              onPress={() => {
                setKarat(k);
                setStep(1);
              }}
            >
              {toPersianDigits(k)} عیار
            </Pressable>
          ))}
        </div>

        <label className="formula-slider">
          <span>اجرت · {toPersianDigits(makingPct)}٪</span>
          <input
            type="range"
            min={0}
            max={30}
            step={1}
            value={makingPct}
            onChange={(e) => {
              setMakingPct(Number(e.target.value));
              bump(`اجرت ${toPersianDigits(Number(e.target.value))}٪`);
              setStep(3);
            }}
          />
        </label>

        <label className="formula-slider">
          <span>سود · {toPersianDigits(profitPct)}٪</span>
          <input
            type="range"
            min={0}
            max={20}
            step={1}
            value={profitPct}
            onChange={(e) => {
              setProfitPct(Number(e.target.value));
              bump(`سود ${toPersianDigits(Number(e.target.value))}٪`);
              setStep(4);
            }}
          />
        </label>
      </div>

      <div className="formula-studio__teach surface p-4">
        <p className="text-xs font-bold mb-1" style={{ color: "var(--accent-deep)" }}>
          {teach.title}
        </p>
        <p className="text-sm leading-7">{teach.teach}</p>
        <div className="mt-3 flex gap-2">
          <Pressable
            className="btn btn-ghost !min-h-10 !px-3 text-xs"
            disabled={step <= 0}
            feedback={{ label: "گام قبلی", tone: "info" }}
            onPress={() => setStep((s) => Math.max(0, s - 1))}
          >
            قبلی
          </Pressable>
          <Pressable
            className="btn btn-secondary !min-h-10 !px-3 text-xs flex-1"
            feedback={{
              label: step >= STEPS.length - 1 ? "فرمول کامل شد" : "گام بعد",
              tone: "ok",
            }}
            onPress={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
          >
            {step >= STEPS.length - 1 ? "مرور دوباره از ابتدا" : "گام بعد · توضیح"}
          </Pressable>
        </div>
      </div>

      <ul className="formula-studio__board">
        {lines.map((line, i) => {
          const visible = revealed >= line.showAt;
          return (
            <li
              key={line.key}
              className={`formula-line ${visible ? "is-in" : ""} ${line.strong ? "is-total" : ""}`}
              style={{ transitionDelay: `${i * 40}ms` }}
            >
              <span>{line.label}</span>
              <strong>{visible ? line.value : "—"}</strong>
            </li>
          );
        })}
      </ul>

      {pulse ? (
        <p className="tap-output tap-output--ok" role="status">
          {pulse}
        </p>
      ) : null}

      <p className="faint text-[11px] leading-6 mt-3">
        نرخ پایه ۱۸ عیار امروز شعبه:{" "}
        {formatCurrency(cfg.goldPricePerGram18k)} · مالیات{" "}
        {toPersianDigits(cfg.vatPercent)}٪ · ثابت{" "}
        {formatCurrency(cfg.fixedFee)}
      </p>
    </section>
  );
}
