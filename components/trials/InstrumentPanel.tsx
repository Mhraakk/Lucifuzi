"use client";

import { useState } from "react";
import { Pressable } from "@/components/ui/Pressable";
import { toPersianDigits, formatNumber } from "@/lib/format";
import { useAppState } from "@/lib/hooks";
import {
  runInstrument,
  type InstrumentInput,
  type InstrumentReading,
  type InstrumentSpec,
} from "@/lib/trials/instruments";

type Props = {
  toolId: string;
  stepId: string;
  spec: InstrumentSpec;
  orbitDeg: number;
  onReading: (reading: InstrumentReading) => void;
  lastReading?: InstrumentReading | null;
};

/**
 * Live instrument console — produces real numeric outputs (FX, scale, price, melt…).
 */
export function InstrumentPanel({
  toolId,
  stepId,
  spec,
  orbitDeg,
  onReading,
  lastReading,
}: Props) {
  const state = useAppState();
  const [measuredGrams, setMeasuredGrams] = useState(
    String(spec.weightGrams ?? "")
  );
  const [measuredMm, setMeasuredMm] = useState(
    String(spec.expectedMm ?? "")
  );
  const [outGrams, setOutGrams] = useState(
    String(
      spec.weightGrams
        ? Number((spec.weightGrams * 0.997).toFixed(2))
        : ""
    )
  );
  const [quotedTotal, setQuotedTotal] = useState("");
  const [secondPerson, setSecondPerson] = useState(false);
  const [acidResult, setAcidResult] =
    useState<InstrumentInput["acidResult"]>("pass_18k");
  const [uvResult, setUvResult] =
    useState<InstrumentInput["uvResult"]>("suspect");

  function execute() {
    const input: InstrumentInput = {
      measuredGrams: measuredGrams ? Number(measuredGrams) : undefined,
      measuredMm: measuredMm ? Number(measuredMm) : undefined,
      outGrams: outGrams ? Number(outGrams) : undefined,
      quotedTotal: quotedTotal ? Number(quotedTotal) : undefined,
      orbitDeg,
      secondPersonPresent: secondPerson,
      acidResult,
      uvResult,
    };
    const reading = runInstrument(
      toolId,
      spec,
      input,
      state.pricingFormulaConfig
    );
    reading.stepId = stepId;
    onReading(reading);
  }

  return (
    <div className="trial-instrument surface p-3 space-y-3">
      <p className="section-title !mb-0 text-sm">کنسول ابزار واقعی</p>
      <p className="muted text-xs leading-6">
        خروجی عددی ثبت می‌شود — دکمه تزئینی نیست.
      </p>

      {spec.kind === "fx_board" ? (
        <p className="text-xs leading-6">
          با اجرا، تیک زنده XAUIRR از feed بازار خوانده می‌شود.
        </p>
      ) : null}

      {spec.kind === "scale" ? (
        <label className="block space-y-1 text-sm">
          <span>خوانش ترازو (گرم)</span>
          <input
            className="field w-full"
            type="number"
            step="0.01"
            value={measuredGrams}
            onChange={(e) => setMeasuredGrams(e.target.value)}
          />
          <span className="muted text-xs">
            هدف: {toPersianDigits(spec.weightGrams ?? 0)}g · تلرانس ۰٫۰۲g
          </span>
        </label>
      ) : null}

      {spec.kind === "caliper" ? (
        <label className="block space-y-1 text-sm">
          <span>خوانش کولیس (mm)</span>
          <input
            className="field w-full"
            type="number"
            step="0.01"
            value={measuredMm}
            onChange={(e) => setMeasuredMm(e.target.value)}
          />
          <span className="muted text-xs">
            هدف {toPersianDigits(spec.expectedMm ?? 0)} ±{" "}
            {toPersianDigits(spec.toleranceMm ?? 0.2)}
          </span>
        </label>
      ) : null}

      {spec.kind === "melt_yield" ? (
        <label className="block space-y-1 text-sm">
          <span>وزن خروجی پس از ذوب (گرم)</span>
          <input
            className="field w-full"
            type="number"
            step="0.01"
            value={outGrams}
            onChange={(e) => setOutGrams(e.target.value)}
          />
          <span className="muted text-xs">
            ورودی {toPersianDigits(spec.weightGrams ?? 0)}g · حد افت{" "}
            {toPersianDigits(spec.maxLossPct ?? 0.5)}٪
          </span>
        </label>
      ) : null}

      {spec.kind === "price_sheet" ? (
        <div className="space-y-2">
          <p className="text-xs leading-6">
            وزن {toPersianDigits(spec.weightGrams ?? 0)}g · عیار{" "}
            {toPersianDigits(spec.karat ?? 18)} — ابتدا FX را بخوانید، سپس جمع
            فرمول را وارد کنید (یا خالی بگذارید تا فرمول خودکار محاسبه شود).
          </p>
          <label className="block space-y-1 text-sm">
            <span>نقل‌قول اعلامی (ریال) — اختیاری برای تست دقت</span>
            <input
              className="field w-full"
              type="number"
              value={quotedTotal}
              onChange={(e) => setQuotedTotal(e.target.value)}
              placeholder="خالی = محاسبه دقیق فرمول"
            />
          </label>
        </div>
      ) : null}

      {spec.kind === "orbit3d" ? (
        <p className="text-xs leading-6">
          چرخش فعلی صحنه: {toPersianDigits(Math.round(orbitDeg))}° از{" "}
          {toPersianDigits(spec.minOrbitDeg ?? 90)}° لازم — صحنه ۳D را بکشید.
        </p>
      ) : null}

      {spec.kind === "dual_key" ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={secondPerson}
            onChange={(e) => setSecondPerson(e.target.checked)}
          />
          نفر دوم Dual Control حاضر است
        </label>
      ) : null}

      {spec.kind === "xrf" ? (
        <p className="text-xs leading-6">
          ادعا: {toPersianDigits(spec.claimedKarat ?? 0)}k — با اجرای XRF سنجش
          واقعی ثبت می‌شود.
        </p>
      ) : null}

      {spec.kind === "acid_kit" ? (
        <label className="block space-y-1 text-sm">
          <span>نتیجه اسید</span>
          <select
            className="field w-full"
            value={acidResult}
            onChange={(e) =>
              setAcidResult(e.target.value as InstrumentInput["acidResult"])
            }
          >
            <option value="pass_18k">قبول ۱۸k</option>
            <option value="pass_21k">قبول ۲۱k</option>
            <option value="fail">رد</option>
          </select>
        </label>
      ) : null}

      {spec.kind === "uv_lamp" ? (
        <label className="block space-y-1 text-sm">
          <span>نتیجه UV</span>
          <select
            className="field w-full"
            value={uvResult}
            onChange={(e) =>
              setUvResult(e.target.value as InstrumentInput["uvResult"])
            }
          >
            <option value="genuine">معتبر</option>
            <option value="suspect">مشکوک</option>
          </select>
        </label>
      ) : null}

      <Pressable
        className="btn btn-secondary w-full text-sm"
        feedback={{ label: "خوانش ثبت شد", tone: "ok" }}
        onPress={execute}
      >
        اجرای ابزار و ثبت خروجی
      </Pressable>

      {lastReading ? (
        <div
          className={`trial-reading text-xs leading-6 ${lastReading.ok ? "is-ok" : "is-bad"}`}
        >
          <strong>{lastReading.ok ? "خوانش قبول" : "خوانش رد"}</strong>
          <p>{lastReading.detailFa}</p>
          <ul className="trial-reading__vals">
            {Object.entries(lastReading.values).map(([k, v]) => (
              <li key={k}>
                <code>{k}</code>:{" "}
                {typeof v === "number"
                  ? formatNumber(v, { decimals: v % 1 ? 2 : 0 })
                  : String(v)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
