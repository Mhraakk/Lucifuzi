"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { formatNumber, toPersianDigits } from "@/lib/format";
import { useAppState } from "@/lib/hooks";
import { resetDemo, setCurrentUser } from "@/lib/store";

export default function ManagerSettingsPage() {
  const state = useAppState();
  const router = useRouter();
  const s = state.organization.settings;
  const formula = state.pricingFormulaConfig;

  return (
    <AppShell title="بیشتر">
      <div className="mx-auto max-w-app space-y-4">
        <section className="surface p-4">
          <h1 className="section-title mb-2">{state.organization.name}</h1>
          <p className="muted text-sm leading-7">
            تنظیمات سازمانی آموزش — حد نصاب و فرمول شبیه‌سازی قیمت.
          </p>
        </section>

        <dl className="surface p-4 space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="muted">حد نصاب قبولی</dt>
            <dd>
              {toPersianDigits(s.passingScore ?? s.defaultPassingScore)}٪
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="muted">استاندارد عیار</dt>
            <dd>{toPersianDigits(s.goldPurityStandard)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="muted">قیمت پایه گرم ۱۸</dt>
            <dd>{formatNumber(formula.goldPricePerGram18k)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="muted">اجرت٪</dt>
            <dd>{toPersianDigits(formula.makingFeePercent)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="muted">سود٪</dt>
            <dd>{toPersianDigits(formula.profitPercent)}</dd>
          </div>
        </dl>

        <Link href="/manager/analytics" className="btn btn-secondary w-full">
          تحلیل شعب
        </Link>
        <Link href="/manager/sops" className="btn btn-secondary w-full">
          مدیریت SOP
        </Link>

        <section className="surface p-4">
          <h2 className="section-title mb-2">گزارش حسابرسی (آخرین)</h2>
          <ul className="space-y-2 max-h-48 overflow-auto">
            {state.auditLogs.slice(0, 8).map((a) => (
              <li key={a.id} className="text-xs leading-6 muted">
                {a.action} · {a.entityType}/{a.entityId}
              </li>
            ))}
          </ul>
        </section>

        <button
          type="button"
          className="btn btn-ghost w-full"
          onClick={() => {
            setCurrentUser("user_emp_nima");
            router.push("/login");
          }}
        >
          خروج
        </button>
        <button
          type="button"
          className="btn btn-ghost w-full text-xs"
          onClick={() => resetDemo()}
        >
          بازنشانی دمو
        </button>
      </div>
    </AppShell>
  );
}
