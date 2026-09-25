"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/Feedback";
import { MotionEnter } from "@/components/motion/Motion";
import { toPersianDigits, formatNumber } from "@/lib/format";
import { useAppState, useCurrentUser } from "@/lib/hooks";
import {
  hasEnvironmentResponsibility,
} from "@/lib/store";
import {
  ROLE_ENVIRONMENTS,
  envById,
  type TrialEnvId,
} from "@/lib/trials/catalog";
import {
  readFxBoard,
  runPriceSheet,
  runScale,
  runMeltYield,
} from "@/lib/trials/instruments";
import {
  WORK_AUTHORIZATION_LABELS,
} from "@/lib/types";

/**
 * Live floor console — only unlocked after manager assigns responsibility.
 * Produces real FX / quote / weigh / melt outputs (no decorative mirrors).
 */
export default function EmployeeFloorPage() {
  const state = useAppState();
  const user = useCurrentUser();
  const assignments = state.responsibilityAssignments.filter(
    (r) => r.employeeUserId === user.id && r.active
  );

  const [log, setLog] = useState<string[]>([]);
  const [quoteWeight, setQuoteWeight] = useState("4.2");
  const [scaleReading, setScaleReading] = useState("12.40");
  const [meltOut, setMeltOut] = useState("12.36");

  const unlocked = useMemo(() => {
    return ROLE_ENVIRONMENTS.filter((e) =>
      hasEnvironmentResponsibility(user.id, e.id, "supervised_only", state)
    );
  }, [user.id, state]);

  function push(msg: string) {
    setLog((prev) => [`${new Date().toLocaleTimeString("fa-IR")} · ${msg}`, ...prev].slice(0, 20));
  }

  function can(envId: TrialEnvId): boolean {
    return hasEnvironmentResponsibility(user.id, envId, "supervised_only", state);
  }

  return (
    <AppShell title="کف مسئولیت" backHref="/employee/trials">
      <div className="mx-auto max-w-app space-y-5 pb-8 jx-page jx-page--atelier">
        <MotionEnter>
          <section className="surface p-4">
            <p className="atelier-kicker">Floor Duty · Live Outputs</p>
            <h1 className="page-title mb-2">میز مسئولیت فعال</h1>
            <p className="muted text-sm leading-7">
              فقط محیط‌هایی که مدیر پس از آزمایش + ارزیابی عملی محول کرده قابل
              اجرا هستند. هر دکمه خروجی عددی واقعی می‌نویسد — نه آینه تزئینی.
            </p>
          </section>
        </MotionEnter>

        <section className="surface p-4 space-y-2">
          <p className="section-title">مسئولیت‌های محول‌شده</p>
          {assignments.length === 0 ? (
            <p className="muted text-sm leading-7">
              هنوز مسئولیتی ندارید. ابتدا{" "}
              <Link href="/employee/trials" className="underline">
                آزمایش نقش
              </Link>{" "}
              را بزنید؛ مدیر از «محول مسئولیت» باز می‌کند.
            </p>
          ) : (
            assignments.map((r) => {
              const env = envById(r.envId as TrialEnvId);
              return (
                <div key={r.id} className="trial-resp-row">
                  <div>
                    <strong>{r.responsibilityFa}</strong>
                    <p className="muted text-xs mt-1">
                      {env?.titleFa} ·{" "}
                      {WORK_AUTHORIZATION_LABELS[r.workAuthorization]}
                    </p>
                  </div>
                  <Badge tone="success">باز</Badge>
                </div>
              );
            })
          )}
        </section>

        <section className="surface p-4 space-y-3">
          <p className="section-title">عملیات زنده کف</p>

          <div className="trial-floor-actions">
            <button
              type="button"
              className="btn btn-secondary text-sm"
              disabled={!can("market_desk") && !can("sales_floor")}
              onClick={() => {
                const fx = readFxBoard();
                push(fx.detailFa);
              }}
            >
              خوانش FX (نوسان/فروش)
            </button>

            <div className="flex flex-wrap gap-2 items-end">
              <label className="text-xs space-y-1">
                وزن نقل‌قول
                <input
                  className="field"
                  type="number"
                  step="0.01"
                  value={quoteWeight}
                  onChange={(e) => setQuoteWeight(e.target.value)}
                  disabled={!can("sales_floor") && !can("market_desk")}
                />
              </label>
              <button
                type="button"
                className="btn btn-secondary text-sm"
                disabled={!can("sales_floor") && !can("market_desk")}
                onClick={() => {
                  const w = Number(quoteWeight) || 0;
                  const sheet = runPriceSheet(
                    "price_sheet",
                    state.pricingFormulaConfig,
                    w,
                    18,
                    undefined,
                    1
                  );
                  push(
                    `نقل‌قول: ${formatNumber(sheet.breakdown.total)} ریال · نرخ زنده ${formatNumber(sheet.livePrice)}`
                  );
                }}
              >
                محاسبه برگه قیمت
              </button>
            </div>

            <div className="flex flex-wrap gap-2 items-end">
              <label className="text-xs space-y-1">
                توزین ذوب/خرید
                <input
                  className="field"
                  type="number"
                  step="0.01"
                  value={scaleReading}
                  onChange={(e) => setScaleReading(e.target.value)}
                  disabled={!can("melt_lab") && !can("buy_desk")}
                />
              </label>
              <button
                type="button"
                className="btn btn-secondary text-sm"
                disabled={!can("melt_lab") && !can("buy_desk")}
                onClick={() => {
                  const m = Number(scaleReading);
                  const r = runScale("scale_0_01", m, m);
                  push(r.detailFa);
                }}
              >
                ثبت ترازو
              </button>
            </div>

            <div className="flex flex-wrap gap-2 items-end">
              <label className="text-xs space-y-1">
                خروجی ذوب
                <input
                  className="field"
                  type="number"
                  step="0.01"
                  value={meltOut}
                  onChange={(e) => setMeltOut(e.target.value)}
                  disabled={!can("melt_lab")}
                />
              </label>
              <button
                type="button"
                className="btn btn-secondary text-sm"
                disabled={!can("melt_lab")}
                onClick={() => {
                  const r = runMeltYield(
                    "furnace",
                    Number(scaleReading) || 12.4,
                    Number(meltOut),
                    0.5
                  );
                  push(r.detailFa);
                }}
              >
                محاسبه افت ذوب
              </button>
            </div>
          </div>

          {unlocked.length === 0 ? (
            <p className="trial-tool-gate text-xs">
              همه عملیات قفل‌اند تا مسئولیت محول شود.
            </p>
          ) : (
            <p className="muted text-xs">
              باز: {unlocked.map((e) => e.titleFa).join(" · ")}
            </p>
          )}
        </section>

        <section className="surface p-4 space-y-2">
          <p className="section-title">لاگ خروجی واقعی</p>
          {log.length === 0 ? (
            <p className="muted text-sm">هنوز عملیاتی اجرا نشده.</p>
          ) : (
            <ul className="space-y-2">
              {log.map((line, i) => (
                <li key={i} className="text-xs leading-6 font-mono">
                  {line}
                </li>
              ))}
            </ul>
          )}
          <p className="muted text-xs mt-2">
            شواهد آزمایش اخیر:{" "}
            {toPersianDigits(
              state.trialAttempts.filter((t) => t.userId === user.id).length
            )}{" "}
            مورد
          </p>
        </section>
      </div>
    </AppShell>
  );
}
