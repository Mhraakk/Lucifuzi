"use client";

import { useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { useAppState } from "@/lib/hooks";

const SUGGESTIONS = [
  "اجرت یعنی چی؟",
  "فرق نیم‌ست و سرویس چیه؟",
  "اگه مشتری بگه گرونه چی جواب بدم؟",
  "مراحل تحویل تعمیر رو بهم بگو.",
];

export default function AssistantPage() {
  const state = useAppState();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [sopRef, setSopRef] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(q: string) {
    setLoading(true);
    setError(null);
    setAnswer(null);
    setSopRef(null);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          orgName: state.organization.name,
        }),
      });
      const data = (await res.json()) as {
        answer?: string;
        sopId?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "خطا");
      setAnswer(data.answer ?? "");
      setSopRef(data.sopId ?? null);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "دریافت اطلاعات با مشکل مواجه شد."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell title="دستیار آموزشی" backHref="/employee/home">
      <div className="mx-auto max-w-app space-y-4">
        <p className="muted text-sm leading-7">
          پاسخ‌ها بر اساس محتوای آموزشی تأییدشده سازمان است. برای سیاست داخلی به
          SOP ارجاع داده می‌شود و جعل نمی‌شود.
        </p>
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className="chip"
              onClick={() => {
                setQuestion(s);
                void ask(s);
              }}
            >
              {s}
            </button>
          ))}
        </div>
        <textarea
          className="field min-h-[120px]"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="سؤال خود را به فارسی بنویسید..."
        />
        <button
          type="button"
          className="btn btn-primary w-full"
          disabled={loading || question.trim().length < 3}
          onClick={() => void ask(question)}
        >
          {loading ? "در حال پاسخ..." : "بپرس"}
        </button>
        {error ? (
          <div className="surface p-4 text-sm" style={{ color: "var(--danger)" }}>
            {error}
          </div>
        ) : null}
        {answer ? (
          <div className="surface p-4 animate-in">
            <p className="text-sm leading-8 whitespace-pre-wrap">{answer}</p>
            {sopRef ? (
              <Link
                href={`/employee/sop/${sopRef}`}
                className="btn btn-secondary mt-4 w-full text-sm"
              >
                مشاهده دستورالعمل مرتبط
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
