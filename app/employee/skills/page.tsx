"use client";

import { AppShell } from "@/components/layout/AppShell";
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
            بالا به‌تنهایی یعنی «مجاز به کار مستقل» نیست.
          </p>
        </section>

        <section className="ladder-panel animate-scale overflow-hidden">
          <div className="ladder-glow" aria-hidden />
          <div className="relative z-[1] flex items-center justify-between gap-4 p-5">
            <div>
              <p className="mb-1 text-[11px] faint tracking-[0.06em]">
                نردبان مجوز
              </p>
              <p className="section-title">
                {toPersianDigits(independent)} از {toPersianDigits(rows.length)}{" "}
                مستقل
              </p>
              <p className="muted mt-1 text-xs leading-6">
                میانگین دانش {toPersianDigits(avgKnowledge)}٪ — مجوز جداست
              </p>
            </div>
            <ProgressRing value={avgKnowledge} label="دانش" size={80} />
          </div>
        </section>

        <div className="stagger space-y-3">
          {rows.map((ec, index) => {
            const c = state.competencies.find((x) => x.id === ec.competencyId);
            const rank = rows.length - index;
            return (
              <div key={ec.id} className="surface p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                      style={{
                        background:
                          ec.workAuthorization === "independent"
                            ? "var(--success)"
                            : "var(--accent-soft)",
                        color:
                          ec.workAuthorization === "independent"
                            ? "#fff"
                            : "var(--accent-deep)",
                      }}
                    >
                      {toPersianDigits(rank)}
                    </span>
                    <div>
                      <p className="font-bold leading-6">{c?.title}</p>
                      <p className="muted mt-1 text-xs leading-6">
                        {c?.description}
                      </p>
                    </div>
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
