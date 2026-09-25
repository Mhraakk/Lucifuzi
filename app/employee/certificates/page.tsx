"use client";

import { AppShell } from "@/components/layout/AppShell";
import { formatJalaliDate, toPersianDigits } from "@/lib/format";
import { useAppState, useCurrentUser } from "@/lib/hooks";
import { EmptyState } from "@/components/ui/Feedback";

export default function CertificatesPage() {
  const state = useAppState();
  const user = useCurrentUser();
  const certs = state.certificates.filter((c) => c.userId === user.id);

  return (
    <AppShell title="مدارک" backHref="/employee/profile">
      <div className="mx-auto max-w-app space-y-4">
        <p className="muted text-sm leading-7">
          فقط گواهی‌هایی که به آزمون قبولی با پاسخ درجه‌بندی‌شده لینک شده‌اند اینجا
          می‌آیند. مجوز کار مستقل جداگانه و فقط پس از ارزیابی عملی ثبت می‌شود.
        </p>
        {certs.length === 0 ? (
          <EmptyState
            title="هنوز مدرکی صادر نشده"
            description="پس از قبولی واقعی در آزمون دوره (با پاسخ کامل) اینجا ظاهر می‌شود — نمره جعلی یا گواهی بدون آزمون نداریم."
          />
        ) : (
          certs.map((c) => (
            <div key={c.id} className="surface p-5">
              <p className="text-xs faint mb-1">گالری طلای آریا</p>
              <h2 className="font-bold text-lg mb-2">{c.title}</h2>
              <p className="muted text-sm">
                {user.fullName} · نمره آزمون {toPersianDigits(c.knowledgeScore)}٪
              </p>
              <p className="faint text-xs mt-3">
                صدور: {formatJalaliDate(c.issuedAt)}
                {c.examAttemptId
                  ? ` · شناسه آزمون ${c.examAttemptId}`
                  : null}
                {c.expiresAt
                  ? ` · اعتبار تا ${formatJalaliDate(c.expiresAt)}`
                  : null}
              </p>
            </div>
          ))
        )}
      </div>
    </AppShell>
  );
}
