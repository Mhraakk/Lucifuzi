"use client";

import { useParams } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/Feedback";
import { formatJalaliDate, toPersianDigits } from "@/lib/format";
import { useAppState, useCurrentUser } from "@/lib/hooks";
import { acknowledgeSop } from "@/lib/store";
import { JOB_ROLE_LABELS } from "@/lib/types";

export default function SopPage() {
  const { id } = useParams<{ id: string }>();
  const state = useAppState();
  const user = useCurrentUser();
  const sop = state.sops.find((s) => s.id === id);
  const version = state.sopVersions.find((v) => v.id === sop?.currentVersionId);
  const ack = state.sopAcknowledgments.find(
    (a) =>
      a.userId === user.id &&
      a.sopId === id &&
      a.versionId === sop?.currentVersionId
  );

  if (!sop || !version) {
    return (
      <AppShell title="دستورالعمل" backHref="/employee/home">
        <p className="muted">SOP یافت نشد.</p>
      </AppShell>
    );
  }

  return (
    <AppShell title={sop.title} backHref="/employee/home">
      <article className="mx-auto max-w-app space-y-5">
        <header className="surface p-4">
          <div className="flex flex-wrap gap-2 mb-3">
            <Badge>{sop.category}</Badge>
            <Badge tone="accent">نسخه {toPersianDigits(version.version)}</Badge>
            {sop.requiresAcknowledgment ? (
              <Badge tone="warning">نیاز به تأیید</Badge>
            ) : null}
          </div>
          <h1 className="page-title !text-xl mb-2">{sop.title}</h1>
          <p className="muted text-sm leading-7">{version.summary}</p>
          <p className="faint text-xs mt-3">
            به‌روزرسانی: {formatJalaliDate(version.publishedAt)} ·{" "}
            {version.summary}
          </p>
        </header>

        <section className="surface p-4">
          <h2 className="section-title mb-3">نقش مسئول</h2>
          <div className="flex flex-wrap gap-2">
            {sop.requiredJobRoles.map((r) => (
              <span key={r} className="chip">
                {JOB_ROLE_LABELS[r]}
              </span>
            ))}
          </div>
        </section>

        <section className="surface p-4">
          <h2 className="section-title mb-3">مراحل</h2>
          <ol className="space-y-3">
            {version.steps.map((step, i) => (
              <li key={step} className="flex gap-3 text-sm leading-7">
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                  style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
                >
                  {toPersianDigits(i + 1)}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </section>

        {version.warnings.length ? (
          <section
            className="surface p-4"
            style={{ borderColor: "rgba(143,61,61,0.35)" }}
          >
            <h2 className="section-title mb-2" style={{ color: "var(--danger)" }}>
              هشدارها
            </h2>
            <ul className="space-y-2 text-sm leading-7">
              {version.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {sop.requiresAcknowledgment ? (
          ack ? (
            <div className="surface p-4 text-center">
              <p className="font-bold text-sm" style={{ color: "var(--success)" }}>
                تأیید شد
              </p>
              <p className="faint text-xs mt-2">
                {formatJalaliDate(ack.acknowledgedAt)}
              </p>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-primary w-full"
              onClick={() => acknowledgeSop(sop.id)}
            >
              {"این دستورالعمل را خواندم و متعهد به اجرا هستم"}
            </button>
          )
        ) : null}

        <section>
          <h2 className="section-title mb-2">تاریخچه نسخه‌ها</h2>
          <div className="space-y-2">
            {state.sopVersions
              .filter((v) => v.sopId === sop.id)
              .sort((a, b) => b.version - a.version)
              .map((v) => (
                <div key={v.id} className="surface p-3 text-sm">
                  نسخه {toPersianDigits(v.version)} — {v.summary}
                </div>
              ))}
          </div>
        </section>
      </article>
    </AppShell>
  );
}
