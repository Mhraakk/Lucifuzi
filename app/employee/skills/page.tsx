"use client";

import { AppShell } from "@/components/layout/AppShell";
import { TopicVisual } from "@/components/training/TopicVisual";
import { Badge, ProgressRing } from "@/components/ui/Feedback";
import { toPersianDigits } from "@/lib/format";
import { useAppState, useCurrentUser } from "@/lib/hooks";
import {
  PRACTICAL_STATUS_LABELS,
  WORK_AUTH_LABELS,
} from "@/lib/types";

export default function SkillsPage() {
  const state = useAppState();
  const user = useCurrentUser();
  const rows = state.employeeCompetencies.filter((e) => e.userId === user.id);
  const independent = rows.filter(
    (r) => r.workAuthorization === "independent"
  ).length;
  const avgKnowledge = rows.length
    ? Math.round(
        rows.reduce((s, r) => s + r.knowledgeLevel, 0) / rows.length
      )
    : 0;

  return (
    <AppShell title="مهارت‌ها">
      <div className="mx-auto max-w-app space-y-5">
        <section className="animate-in">
          <h1 className="page-title mb-2">نقشه شایستگی</h1>
          <p className="muted text-sm leading-7">
            دو ستون جدا: دانش (آزمون) و مجوز کار (فقط ارزیابی عملی مدیر). نمره
            بالا به‌تنهایی یعنی «مجاز به کار مستقل» نیست — همان اصل گالری‌های
            معتبر بین‌المللی.
          </p>
        </section>

        <TopicVisual topic="skills" className="animate-in" />

        <section className="atelier-wall overflow-hidden animate-scale">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/atelier/atelier-wall.png"
              alt=""
              className="h-32 w-full object-cover"
              loading="lazy"
            />
            <div className="atelier-wall__veil" aria-hidden />
            <div className="relative z-[1] flex items-center justify-between gap-4 p-5">
              <div>
                <p className="atelier-kicker">تابلوی مجوز</p>
                <p className="atelier-title !text-lg">
                  {toPersianDigits(independent)} از {toPersianDigits(rows.length)}{" "}
                  مستقل
                </p>
                <p className="muted mt-1 text-xs leading-6">
                  میانگین دانش {toPersianDigits(avgKnowledge)}٪ — مجوز جداست
                </p>
              </div>
              <ProgressRing value={avgKnowledge} />
            </div>
          </div>
        </section>

        <div className="stagger space-y-3">
          {rows.map((ec) => {
            const c = state.competencies.find((x) => x.id === ec.competencyId);
            return (
              <div key={ec.id} className="surface p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold leading-6">{c?.title}</p>
                    <p className="muted mt-1 text-xs leading-6">
                      {c?.description}
                    </p>
                  </div>
                  <Badge
                    tone={
                      ec.workAuthorization === "independent"
                        ? "success"
                        : ec.workAuthorization === "supervised_only"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {WORK_AUTH_LABELS[ec.workAuthorization]}
                  </Badge>
                </div>
                <div className="mb-2">
                  <div className="mb-1.5 flex justify-between text-xs">
                    <span className="muted">سطح دانش</span>
                    <span>{toPersianDigits(ec.knowledgeLevel)}٪</span>
                  </div>
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{ width: `${ec.knowledgeLevel}%` }}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="chip">
                    ارزیابی عملی: {PRACTICAL_STATUS_LABELS[ec.practicalStatus]}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
