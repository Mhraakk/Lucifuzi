"use client";

import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { MotionEnter } from "@/components/motion/Motion";
import { Badge } from "@/components/ui/Feedback";
import { toPersianDigits } from "@/lib/format";
import { useAppState, useCurrentUser } from "@/lib/hooks";
import {
  ROLE_ENVIRONMENTS,
  trialsForEnv,
} from "@/lib/trials/catalog";
import { WORK_AUTHORIZATION_LABELS } from "@/lib/types";

const DOMAIN_LABEL: Record<string, string> = {
  sales: "فروشندگی",
  operations: "اپراتوری",
  craft: "ساخت",
  melt: "ذوب",
  ideation: "ایده‌پردازی",
  volatility: "نوسان‌گیری",
  trading: "معامله‌گری",
  quality: "کیفی",
};

export default function EmployeeTrialsPage() {
  const state = useAppState();
  const user = useCurrentUser();
  const myAttempts = state.trialAttempts.filter((t) => t.userId === user.id);
  const myResp = state.responsibilityAssignments.filter(
    (r) => r.employeeUserId === user.id && r.active
  );

  return (
    <AppShell title="آزمایش نقش">
      <div className="mx-auto max-w-app space-y-5 pb-6 jx-page jx-page--atelier">
        <MotionEnter>
          <section className="surface p-4">
            <p className="atelier-kicker">Role Trials · Environments</p>
            <h1 className="page-title mb-2">آزمایش‌های واقعی نقش</h1>
            <p className="muted text-sm leading-7">
              هشت محیط مجزا با شرایط، خطر، ابزار لازم و صحنه ۳D. قبول آزمایش فقط
              شواهد می‌سازد — محول کردن مسئولیت و مجوز کار را مدیر پس از ارزیابی
              عملی انجام می‌دهد.
            </p>
          </section>
        </MotionEnter>

        {myResp.length > 0 ? (
          <section className="surface p-4 space-y-2">
            <p className="section-title">مسئولیت‌های فعال شما</p>
            {myResp.map((r) => {
              const env = ROLE_ENVIRONMENTS.find((e) => e.id === r.envId);
              return (
                <div key={r.id} className="trial-resp-row">
                  <div>
                    <strong>{r.responsibilityFa}</strong>
                    <p className="muted text-xs mt-1">
                      {env?.titleFa ?? r.envId} ·{" "}
                      {WORK_AUTHORIZATION_LABELS[r.workAuthorization]}
                    </p>
                  </div>
                  <Badge tone="success">فعال</Badge>
                </div>
              );
            })}
          </section>
        ) : null}

        <div className="trial-env-grid">
          {ROLE_ENVIRONMENTS.map((env, i) => {
            const trials = trialsForEnv(env.id);
            const best = myAttempts
              .filter((a) => a.envId === env.id)
              .sort((a, b) => b.percent - a.percent)[0];
            const hasResp = myResp.some((r) => r.envId === env.id);
            return (
              <MotionEnter key={env.id} delayMs={i * 40}>
                <Link
                  href={`/employee/trials/${env.id}`}
                  className="trial-env-card surface surface-interactive tap-react"
                  style={{ ["--trial-accent" as string]: env.accent }}
                >
                  <span className="trial-env-card__domain">
                    {DOMAIN_LABEL[env.domainId] ?? env.domainId}
                  </span>
                  <strong className="trial-env-card__title">{env.titleFa}</strong>
                  <p className="muted text-xs leading-6 mt-1">{env.roomFa}</p>
                  <p className="trial-env-card__cond text-xs leading-6 mt-2">
                    {env.conditionFa}
                  </p>
                  <div className="trial-env-card__meta">
                    <span>
                      {toPersianDigits(trials.length)} آزمایش · حد{" "}
                      {toPersianDigits(env.passScore)}٪
                    </span>
                    {best ? (
                      <Badge tone={best.passed ? "success" : "warning"}>
                        بهترین {toPersianDigits(best.percent)}٪
                      </Badge>
                    ) : (
                      <Badge tone="accent">هنوز نزده</Badge>
                    )}
                    {hasResp ? <Badge tone="success">مسئولیت دارد</Badge> : null}
                  </div>
                </Link>
              </MotionEnter>
            );
          })}
        </div>

        <p className="muted text-xs leading-6 px-1">
          نکته: بدون ارزیابی عملی مدیر، هیچ‌کدام از این آزمایش‌ها مجوز ویترین،
          گاوصندوق، ذوب یا خرید صادر نمی‌کنند.
        </p>
      </div>
    </AppShell>
  );
}
