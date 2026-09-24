"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useAppState } from "@/lib/hooks";

export default function ScenarioBuilderPage() {
  const state = useAppState();
  const [title, setTitle] = useState("مشتری ناراضی از تأخیر تعمیر");
  const [situation, setSituation] = useState(
    "مشتری با عصبانیت می‌گوید تعمیر دیر شده و تهدید به شکایت می‌کند."
  );
  const [choiceA, setChoiceA] = useState(
    "آرام گوش دهید، وضعیت را در سیستم چک کنید و مسیر شفاف ارائه دهید."
  );
  const [choiceB, setChoiceB] = useState("جدل کنید و بگویید تقصیر کارگاه است.");
  const [saved, setSaved] = useState(false);

  return (
    <AppShell title="سازنده سناریو" backHref="/manager/training">
      <div className="mx-auto max-w-lg space-y-4">
        <p className="muted text-sm leading-7">
          ساخت شاخه‌ای بدون کدنویسی: موقعیت → گزینه‌ها → پیامد → بازخورد.
          سناریوهای فعلی سازمان:{" "}
          {state.scenarios.map((s) => s.title).join("، ")}.
        </p>
        <div className="surface p-4 space-y-3">
          <div>
            <label className="label">عنوان</label>
            <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="label">موقعیت</label>
            <textarea className="field min-h-[90px]" value={situation} onChange={(e) => setSituation(e.target.value)} />
          </div>
          <div>
            <label className="label">گزینه مطلوب</label>
            <textarea className="field min-h-[70px]" value={choiceA} onChange={(e) => setChoiceA(e.target.value)} />
          </div>
          <div>
            <label className="label">گزینه ضعیف</label>
            <textarea className="field min-h-[70px]" value={choiceB} onChange={(e) => setChoiceB(e.target.value)} />
          </div>
          <button type="button" className="btn btn-primary w-full" onClick={() => setSaved(true)}>
            ذخیره پیش‌نویس سناریو
          </button>
          {saved ? (
            <p className="text-sm" style={{ color: "var(--success)" }}>
              پیش‌نویس «{title}» آماده است. انتشار کامل به لایه CMS متصل می‌شود.
            </p>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
