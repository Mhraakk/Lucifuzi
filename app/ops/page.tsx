"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/Feedback";
import { toPersianDigits } from "@/lib/format";
import { LAYER_CATALOG } from "@/platform/spec";

type Health = {
  version?: string;
  layers?: Array<{ layer: string; status: string; detail?: string }>;
  storageDriver?: string;
  events?: number;
  evals?: { passed: number; failed: number; cases: Array<{ id: string; pass: boolean }> };
};

type Market = {
  ticks?: Array<{ instrument: string; price: number; seq: number }>;
  quant?: { headlineFa?: string; xauirr?: { signal: string; momentumPct: number } };
};

export default function OpsConsolePage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [market, setMarket] = useState<Market | null>(null);
  const [quote, setQuote] = useState<string | null>(null);
  const [ai, setAi] = useState<string | null>(null);
  const [gates, setGates] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setErr(null);
    try {
      const [h, m] = await Promise.all([
        fetch("/api/platform/health?evals=1").then((r) => r.json()),
        fetch("/api/platform/market").then((r) => r.json()),
      ]);
      setHealth(h as Health);
      setMarket(m as Market);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "load failed");
    }
  }

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 8000);
    return () => clearInterval(id);
  }, []);

  async function runQuote() {
    setBusy(true);
    try {
      const res = await fetch("/api/platform/finance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weightGrams: 12, karat: 18, orgId: "org_arya" }),
      });
      const data = await res.json();
      setQuote(data.customerScript ?? JSON.stringify(data));
    } finally {
      setBusy(false);
    }
  }

  async function runAi() {
    setBusy(true);
    try {
      const res = await fetch("/api/platform/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: "قیمت ۱۲ گرم طلای ۱۸ عیار را به زبان مشتری بگو و عیار را توضیح بده",
          userId: "ops_demo",
          orgId: "org_arya",
        }),
      });
      const data = await res.json();
      setAi(data.answer ?? data.error ?? "—");
    } finally {
      setBusy(false);
    }
  }

  async function runGates() {
    setBusy(true);
    try {
      const res = await fetch("/api/platform/flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gates: true }),
      });
      const data = await res.json();
      setGates(JSON.stringify(data, null, 2));
    } finally {
      setBusy(false);
    }
  }

  async function pushTick() {
    await fetch("/api/platform/market", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instrument: "XAUIRR" }),
    });
    await refresh();
  }

  return (
    <AppShell title="Ops Platform" backHref="/manager/dashboard">
      <div className="mx-auto max-w-desk space-y-5">
        <section>
          <h1 className="page-title mb-2">اسکلت ۲۰ لایه آریا</h1>
          <p className="muted text-sm leading-7">
            Spec → BFF → Auth → Finance → Market → Quant → Events → AI → Storage →
            CI. نسخه {health?.version ?? "…"} · storage:{" "}
            {health?.storageDriver ?? "…"} · events:{" "}
            {toPersianDigits(health?.events ?? 0)}
          </p>
        </section>

        {err ? (
          <p className="text-sm" style={{ color: "var(--danger)" }}>
            {err}
          </p>
        ) : null}

        <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {(health?.layers ?? []).map((l) => (
            <div key={l.layer} className="surface p-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold leading-5">{l.layer}</p>
                <Badge
                  tone={
                    l.status === "ok"
                      ? "success"
                      : l.status === "degraded"
                        ? "warning"
                        : "danger"
                  }
                >
                  {l.status}
                </Badge>
              </div>
              <p className="faint text-[0.65rem] leading-5">{l.detail}</p>
            </div>
          ))}
        </section>

        <section className="surface p-4 space-y-3">
          <h2 className="section-title">بازار زنده</h2>
          <p className="text-sm muted">{market?.quant?.headlineFa}</p>
          <div className="flex flex-wrap gap-2">
            {(market?.ticks ?? []).map((t) => (
              <span key={t.instrument} className="chip">
                {t.instrument}: {toPersianDigits(Math.round(t.price))}
              </span>
            ))}
          </div>
          <button type="button" className="btn btn-secondary" onClick={() => void pushTick()}>
            تیک بعدی worker
          </button>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void runQuote()}
          >
            Quote مالی
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void runAi()}
          >
            AI Orchestrator
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => void runGates()}
          >
            Release Gates
          </button>
        </section>

        {quote ? (
          <pre className="surface p-4 text-xs leading-6 whitespace-pre-wrap">{quote}</pre>
        ) : null}
        {ai ? (
          <pre className="surface p-4 text-xs leading-6 whitespace-pre-wrap">{ai}</pre>
        ) : null}
        {gates ? (
          <pre className="surface p-4 text-xs leading-6 whitespace-pre-wrap">{gates}</pre>
        ) : null}

        {health?.evals ? (
          <section className="surface p-4">
            <h2 className="section-title mb-2">
              AI Evals — pass {toPersianDigits(health.evals.passed)} / fail{" "}
              {toPersianDigits(health.evals.failed)}
            </h2>
            <ul className="space-y-1">
              {health.evals.cases.map((c) => (
                <li key={c.id} className="text-xs">
                  {c.pass ? "✓" : "✗"} {c.id}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="surface p-4">
          <h2 className="section-title mb-2">نقشه لایه</h2>
          <ol className="space-y-1 text-xs muted">
            {LAYER_CATALOG.map((l) => (
              <li key={l.id}>
                {toPersianDigits(l.n)}. {l.title} — <code>{l.path}</code>
              </li>
            ))}
          </ol>
          <Link href="/docs" className="hidden" />
        </section>
      </div>
    </AppShell>
  );
}
