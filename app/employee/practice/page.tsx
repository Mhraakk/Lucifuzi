"use client";

import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { AtelierProductStrip } from "@/components/training/AtelierWall";
import { FormulaStudio } from "@/components/training/FormulaStudio";
import { TopicVisual } from "@/components/training/TopicVisual";
import { Badge } from "@/components/ui/Feedback";
import { sculptureSrc, sculptureWork } from "@/lib/atelier/sculptures";
import { useAppState, useCurrentUser } from "@/lib/hooks";
import { getTodayDaily } from "@/lib/store";

export default function PracticePage() {
  const state = useAppState();
  const user = useCurrentUser();
  const daily = getTodayDaily(state);
  const recs = state.recommendations.filter(
    (r) => r.userId === user.id && !r.dismissed
  );
  const marble = sculptureWork("practice");

  return (
    <AppShell title="تمرین">
      <div className="mx-auto max-w-app space-y-5">
        <section className="surface p-4 animate-in">
          <h1 className="page-title mb-2">تمرین عملی</h1>
          <p className="muted text-sm leading-7">
            ژانر عملی — نیمهٔ دوم منبع واحد آموزش. فرمول، سناریو و ریسک را با همان
            دقت برنینی لمس کنید: بینایی، استدلال، زیبایی‌سنجی و دقت روی کف فروشگاه.
          </p>
          <p className="atelier-marble-credit mt-2">
            {marble.artist} · {marble.title}
          </p>
        </section>

        <FormulaStudio />

        <Link
          href="/employee/formula"
          className="btn btn-primary tap-react w-full"
        >
          کارگاه کامل فرمول طلا
        </Link>

        <TopicVisual topic="practice" className="animate-in" />

        <AtelierProductStrip />

        <section className="atelier-wall overflow-hidden animate-in">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={sculptureSrc("practice")}
              alt=""
              className="h-36 w-full object-cover"
              loading="lazy"
            />
            <div className="atelier-wall__veil" aria-hidden />
            <div className="atelier-wall__intro !justify-center">
              <p className="atelier-kicker">تمرین امروز · چشم عملی</p>
              <p className="atelier-title !text-lg">
                {daily?.title ?? "تمرین روزانه"}
              </p>
              <p className="atelier-lede line-clamp-2">{daily?.tip}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 p-3">
            <Link
              href="/employee/quiz?daily=1"
              className="btn btn-secondary tap-react !min-h-11 text-xs"
            >
              سؤال کوتاه
            </Link>
            <Link
              href={`/employee/scenario/${daily?.scenarioId ?? "sc_fraud_switch"}`}
              className="btn btn-primary tap-react !min-h-11 text-xs"
            >
              سناریوی امروز
            </Link>
          </div>
        </section>

        <Link
          href="/employee/quiz?calc=1"
          className="surface surface-interactive tap-react block p-4 animate-in"
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="font-bold">آزمون محاسبه قیمت</p>
            <Badge tone="accent">محاسبات</Badge>
          </div>
          <p className="muted text-sm leading-7">
            وزن، عیار، اجرت و سود را محاسبه کنید و با پاسخ صحیح مقایسه کنید.
          </p>
        </Link>

        <section>
          <h2 className="section-title mb-3">سناریوها</h2>
          <div className="stagger space-y-3">
            {state.scenarios.map((sc) => (
              <Link
                key={sc.id}
                href={`/employee/scenario/${sc.id}`}
                className="surface surface-interactive tap-react block p-4"
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-sm font-bold">{sc.title}</p>
                  <Badge>{sc.category}</Badge>
                </div>
                <p className="muted line-clamp-2 text-sm leading-7">{sc.intro}</p>
              </Link>
            ))}
          </div>
        </section>

        {recs.length > 0 ? (
          <section>
            <h2 className="section-title mb-3">پیشنهاد تمرین</h2>
            <div className="space-y-2">
              {recs.slice(0, 3).map((r) => (
                <Link
                  key={r.id}
                  href={
                    r.courseId
                      ? `/employee/courses/${r.courseId}`
                      : "/employee/learn"
                  }
                  className="surface surface-interactive tap-react block p-3"
                >
                  <p className="text-sm font-bold">{r.message}</p>
                  <p className="muted text-xs leading-6 mt-1">{r.reason}</p>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
