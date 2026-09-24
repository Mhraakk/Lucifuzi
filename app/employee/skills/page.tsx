"use client";

import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/Feedback";
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

  return (
    <AppShell title="مهارت‌ها">
      <div className="mx-auto max-w-app space-y-5">
        <section>
          <h1 className="page-title mb-2">نقشه شایستگی</h1>
          <p className="muted text-sm leading-7">
            دو ستون جدا: دانش (آزمون) و مجوز کار (فقط ارزیابی عملی مدیر). نمره
            ۹۰٪ امنیت به‌تنهایی یعنی «مجاز به کار مستقل» نیست.
          </p>
        </section>

        <div className="space-y-3">
          {rows.map((ec) => {
            const c = state.competencies.find((x) => x.id === ec.competencyId);
            return (
              <div key={ec.id} className="surface p-4 animate-in">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="font-bold">{c?.title}</p>
                    <p className="muted text-xs mt-1">{c?.description}</p>
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
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="muted">سطح دانش</span>
                    <span>{toPersianDigits(ec.knowledgeLevel)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--bg-soft)" }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${ec.knowledgeLevel}%`,
                        background: "var(--accent)",
                      }}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="chip">
                    ارزیابی عملی: {PRACTICAL_STATUS_LABELS[ec.practicalStatus]}
                  </span>
                  <span className="chip">
                    دانش: {toPersianDigits(ec.knowledgeLevel)}٪
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
