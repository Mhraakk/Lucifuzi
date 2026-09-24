"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useAppState } from "@/lib/hooks";

export default function CourseBuilderPage() {
  const state = useAppState();
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [moduleTitle, setModuleTitle] = useState("");
  const [lessonTitle, setLessonTitle] = useState("");
  const [saved, setSaved] = useState(false);
  const [draft, setDraft] = useState(true);

  return (
    <AppShell title="سازنده دوره" backHref="/manager/training">
      <div className="mx-auto max-w-lg space-y-4">
        <p className="muted text-sm leading-7">
          جریان: اطلاعات دوره → ماژول → درس → رسانه/سؤال → آزمون → نقش هدف → پیش‌نویس/انتشار.
          در این نسخه پیش‌نویس در نشست جاری ذخیره نمایشی می‌شود؛ اتصال CMS کامل مرز یکپارچه‌سازی بعدی است.
        </p>
        <div className="surface p-4 space-y-3">
          <div>
            <label className="label">عنوان دوره</label>
            <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="label">توضیح</label>
            <textarea className="field min-h-[90px]" value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div>
            <label className="label">ماژول</label>
            <input className="field" value={moduleTitle} onChange={(e) => setModuleTitle(e.target.value)} />
          </div>
          <div>
            <label className="label">درس</label>
            <input className="field" value={lessonTitle} onChange={(e) => setLessonTitle(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} />
            ذخیره به‌صورت پیش‌نویس
          </label>
          <button
            type="button"
            className="btn btn-primary w-full"
            onClick={() => setSaved(true)}
          >
            ذخیره ساختار
          </button>
          {saved ? (
            <p className="text-sm" style={{ color: "var(--success)" }}>
              ساختار «{title || "بدون عنوان"}» برای {state.organization.name}{" "}
              {draft ? "به‌صورت پیش‌نویس" : "آماده انتشار"} ثبت نمایشی شد.
              {moduleTitle ? ` ماژول: ${moduleTitle}.` : null}
              {lessonTitle ? ` درس: ${lessonTitle}.` : null}
            </p>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
