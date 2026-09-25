"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  loadMailbox,
  markMailRead,
  mailsForEmail,
  pushMailMessage,
  type MailMessage,
} from "@/lib/auth/session";
import { useAppState } from "@/lib/hooks";

function MailInbox() {
  const state = useAppState();
  const params = useSearchParams();
  const emailParam = params.get("email")?.trim().toLowerCase() ?? "";
  const [emailFilter, setEmailFilter] = useState(emailParam);
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [selected, setSelected] = useState<MailMessage | null>(null);

  const refresh = useCallback(async () => {
    const local = emailFilter
      ? mailsForEmail(emailFilter)
      : loadMailbox();

    try {
      const q = emailFilter
        ? `?email=${encodeURIComponent(emailFilter)}`
        : "";
      const res = await fetch(`/api/auth/mail${q}`);
      if (res.ok) {
        const data = (await res.json()) as {
          messages: Array<{
            id: string;
            to: string;
            subject: string;
            body: string;
            code: string;
            createdAt: string;
          }>;
        };
        for (const m of data.messages) {
          const exists = loadMailbox().some((x) => x.id === m.id);
          if (!exists) {
            pushMailMessage({
              id: m.id,
              to: m.to,
              subject: m.subject,
              body: m.body,
              code: m.code,
              createdAt: m.createdAt,
            });
          }
        }
      }
    } catch {
      /* offline — local mailbox only */
    }

    const next = emailFilter ? mailsForEmail(emailFilter) : loadMailbox();
    setMessages(next.length ? next : local);
  }, [emailFilter]);

  useEffect(() => {
    if (emailParam) setEmailFilter(emailParam);
  }, [emailParam]);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(t);
  }, [refresh]);

  const unread = useMemo(
    () => messages.filter((m) => !m.read).length,
    [messages]
  );

  return (
    <div
      data-theme={state.theme}
      className="relative min-h-screen"
      style={{ color: "var(--ink)", background: "var(--bg)" }}
    >
      <div className="mx-auto max-w-md px-5 py-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] faint tracking-[0.12em]">Beatris</p>
            <h1 className="page-title">صندوق پیام</h1>
            {unread > 0 ? (
              <p className="muted mt-1 text-xs">{unread} خوانده‌نشده</p>
            ) : null}
          </div>
          <Link href="/login" className="btn btn-secondary !min-h-10 text-xs">
            بازگشت به ورود
          </Link>
        </div>

        <label className="label">فیلتر ایمیل</label>
        <input
          className="field mb-4"
          type="email"
          placeholder="مثلاً you@example.com"
          value={emailFilter}
          onChange={(e) => setEmailFilter(e.target.value.trim().toLowerCase())}
          dir="ltr"
        />

        {selected ? (
          <article className="surface mb-4 p-4 animate-in">
            <button
              type="button"
              className="btn btn-ghost mb-3 !min-h-9 text-xs"
              onClick={() => setSelected(null)}
            >
              ← لیست پیام‌ها
            </button>
            <p className="faint text-[0.65rem] mb-1" dir="ltr">
              {selected.to}
            </p>
            <h2 className="section-title mb-2">{selected.subject}</h2>
            <pre className="whitespace-pre-wrap text-sm leading-7 muted font-[inherit]">
              {selected.body}
            </pre>
            <div
              className="mt-4 rounded-2xl border hairline p-4 text-center"
              style={{ background: "var(--accent-soft)" }}
            >
              <p className="faint text-[0.65rem] mb-1">کد ورود</p>
              <p
                className="text-3xl font-bold tracking-[0.35em]"
                dir="ltr"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {selected.code}
              </p>
            </div>
            <Link
              href={`/login`}
              className="btn btn-primary mt-4 w-full"
              onClick={() => {
                try {
                  sessionStorage.setItem(
                    "beatris-otp-prefill",
                    JSON.stringify({
                      email: selected.to,
                      code: selected.code,
                    })
                  );
                } catch {
                  /* ignore */
                }
              }}
            >
              استفاده از این کد برای ورود
            </Link>
          </article>
        ) : (
          <ul className="space-y-2.5">
            {messages.length === 0 ? (
              <li className="surface p-5 text-center text-sm muted">
                پیامی نیست. از صفحه ورود کد درخواست کنید.
              </li>
            ) : (
              messages.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className="surface surface-interactive w-full p-3.5 text-right"
                    onClick={() => {
                      markMailRead(m.id);
                      setSelected({ ...m, read: true });
                      setMessages((prev) =>
                        prev.map((x) =>
                          x.id === m.id ? { ...x, read: true } : x
                        )
                      );
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-sm leading-6">
                          {m.subject}
                          {!m.read ? (
                            <span
                              className="ms-2 inline-block h-2 w-2 rounded-full align-middle"
                              style={{ background: "var(--accent)" }}
                            />
                          ) : null}
                        </p>
                        <p className="faint mt-0.5 text-[0.65rem]" dir="ltr">
                          {m.to}
                        </p>
                      </div>
                      <span
                        className="shrink-0 text-xs font-bold tracking-widest"
                        dir="ltr"
                      >
                        {m.code}
                      </span>
                    </div>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function MailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center muted text-sm">
          بارگذاری صندوق…
        </div>
      }
    >
      <MailInbox />
    </Suspense>
  );
}
