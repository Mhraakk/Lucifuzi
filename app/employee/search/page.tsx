"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { searchContent } from "@/lib/store";
import { useAppState } from "@/lib/hooks";

export default function SearchPage() {
  const state = useAppState();
  const [q, setQ] = useState("");
  const results = useMemo(() => searchContent(q, state), [q, state]);

  return (
    <AppShell title="جستجو" backHref="/employee/home">
      <div className="mx-auto max-w-app space-y-4">
        <input
          className="field"
          placeholder="اجرت، تحویل ویترین، مرجوعی، تعمیر..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        {q.trim() ? (
          <>
            <section>
              <h2 className="section-title mb-2">دوره‌ها</h2>
              {results.courses.map((c) => (
                <Link key={c.id} href={`/employee/courses/${c.id}`} className="surface mb-2 block p-3 text-sm">
                  {c.title}
                </Link>
              ))}
            </section>
            <section>
              <h2 className="section-title mb-2">درس‌ها</h2>
              {results.lessons.map((l) => (
                <Link key={l.id} href={`/employee/lessons/${l.id}`} className="surface mb-2 block p-3 text-sm">
                  {l.title}
                </Link>
              ))}
            </section>
            <section>
              <h2 className="section-title mb-2">دستورالعمل‌ها</h2>
              {results.sops.map((s) => (
                <Link key={s.id} href={`/employee/sop/${s.id}`} className="surface mb-2 block p-3 text-sm">
                  {s.title}
                </Link>
              ))}
            </section>
            {results.terms.length ? (
              <section>
                <h2 className="section-title mb-2">اصطلاحات</h2>
                <div className="flex flex-wrap gap-2">
                  {results.terms.map((t) => (
                    <span key={t} className="chip">
                      {t}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        ) : (
          <p className="muted text-sm">عبارت فارسی جستجو را وارد کنید.</p>
        )}
      </div>
    </AppShell>
  );
}
