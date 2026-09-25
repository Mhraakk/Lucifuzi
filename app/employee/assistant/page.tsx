"use client";

import { useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { TopicVisual } from "@/components/training/TopicVisual";
import { answerWithRag } from "@/lib/assistant";
import type { Citation } from "@/lib/knowledge/rag";

const SUGGESTIONS = [
  "اجرت یعنی چی؟",
  "عیار ۷۵۰ را چطور به مشتری بگویم؟",
  "اگه مشتری بگه گرونه چی جواب بدم؟",
  "مراحل تحویل تعمیر رو بهم بگو.",
  "Dual Control یعنی چه؟",
];

export default function AssistantPage() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [sopRef, setSopRef] = useState<string | null>(null);
  const [lessonRef, setLessonRef] = useState<string | null>(null);
  const [mode, setMode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(q: string) {
    setLoading(true);
    setError(null);
    setAnswer(null);
    setCitations([]);
    setSopRef(null);
    setLessonRef(null);
    setMode(null);
    try {
      // Prefer API (RAG + optional LLM); fall back to offline RAG
      let data: {
        answer?: string;
        citations?: Citation[];
        sopId?: string;
        lessonId?: string;
        mode?: string;
        refused?: boolean;
        error?: string;
      } | null = null;

      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: q }),
        });
        if (res.ok) {
          data = (await res.json()) as typeof data;
        }
      } catch {
        /* static / offline */
      }

      if (!data) {
        const local = answerWithRag(q);
        if (local.error) throw new Error(local.error);
        data = local;
      }

      if (data.error) throw new Error(data.error);
      setAnswer(data.answer ?? "");
      setCitations(data.citations ?? []);
      setSopRef(data.sopId ?? null);
      setLessonRef(data.lessonId ?? null);
      setMode(data.mode ?? "rag");
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
    <AppShell title="دستیار شیفت" backHref="/employee/home">
      <div className="mx-auto max-w-app space-y-4">
        <TopicVisual topic="assistant" />
        <p className="muted text-sm leading-7">
          پاسخ فقط از دانش‌نامه تأییدشده (درس · SOP · اطلس US/CH/EU) با ارجاع
          منبع. سیاست شعبه جعل نمی‌شود.
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
          placeholder="سؤال سریع پشت ویترین..."
        />
        <button
          type="button"
          className="btn btn-primary w-full"
          disabled={loading || question.trim().length < 3}
          onClick={() => void ask(question)}
        >
          {loading ? "در حال بازیابی از دانش‌نامه..." : "بپرس"}
        </button>
        {error ? (
          <div className="surface p-4 text-sm" style={{ color: "var(--danger)" }}>
            {error}
          </div>
        ) : null}
        {answer ? (
          <div className="surface p-4 animate-in space-y-3">
            {mode ? (
              <p className="faint text-[0.65rem] tracking-wide">
                حالت: {mode === "rag+llm" ? "RAG + مدل" : mode === "refused" ? "رد دانش‌نامه" : "RAG آفلاین"}
              </p>
            ) : null}
            <p className="text-sm leading-8 whitespace-pre-wrap">{answer}</p>
            {citations.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold">منابع</p>
                {citations.map((c) => (
                  <div key={c.id}>
                    {c.href ? (
                      <Link
                        href={c.href}
                        className="text-xs leading-6"
                        style={{ color: "var(--accent-deep)" }}
                      >
                        [{c.kind}] {c.title}
                      </Link>
                    ) : (
                      <p className="text-xs muted">
                        [{c.kind}] {c.title}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
            <div className="flex flex-col gap-2">
              {lessonRef ? (
                <Link
                  href={`/employee/lessons/${lessonRef}`}
                  className="btn btn-secondary w-full text-sm"
                >
                  مشاهده درس مرتبط
                </Link>
              ) : null}
              {sopRef ? (
                <Link
                  href={`/employee/sop/${sopRef}`}
                  className="btn btn-secondary w-full text-sm"
                >
                  مشاهده دستورالعمل مرتبط
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
