"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Pressable } from "@/components/ui/Pressable";
import { MotionEnter } from "@/components/motion/Motion";
import {
  CAREER_TRACKS,
  getCareerTrack,
  type CareerTrackId,
} from "@/lib/career/tracks";
import {
  FIT_QUESTIONS,
  fitIsComplete,
  loadFitAnswers,
  saveFitAnswers,
  scoreCareerFit,
  type FitAnswers,
} from "@/lib/career/fitAssessment";
import { sculptureSrc } from "@/lib/atelier/sculptures";
import { toPersianDigits } from "@/lib/format";
import { useAppState, useCurrentUser, useEmployeeProfile } from "@/lib/hooks";
import { commitCareerTrack } from "@/lib/store";
import { JOB_ROLE_LABELS } from "@/lib/types";

/**
 * Deep vocation pathfinder — theory · reasoning · practice · design · exam
 * until the candidate knows: salesperson, accountant, designer, or ideator.
 */
export function CareerPathfinder({ compact = false }: { compact?: boolean }) {
  const state = useAppState();
  const user = useCurrentUser();
  const profile = useEmployeeProfile();
  const [trackId, setTrackId] = useState<CareerTrackId>("salesperson");
  const [answers, setAnswers] = useState<FitAnswers>(() => loadFitAnswers());
  const [quizOpen, setQuizOpen] = useState(false);
  const [committed, setCommitted] = useState(false);

  const track = getCareerTrack(trackId);
  const ranking = useMemo(
    () => scoreCareerFit(answers, state, user.id),
    [answers, state, user.id]
  );
  const top = ranking[0];
  const complete = fitIsComplete(answers);

  function pickAnswer(qid: string, cid: string) {
    const next = { ...answers, [qid]: cid };
    setAnswers(next);
    saveFitAnswers(next);
  }

  function commitTop() {
    if (!top) return;
    commitCareerTrack({
      userId: user.id,
      jobRole: top.jobRole,
      learningPathId: top.learningPathId,
    });
    setTrackId(top.trackId);
    setCommitted(true);
  }

  if (compact) {
    return (
      <section className="career-compact surface p-4 animate-in">
        <p className="atelier-kicker">دوره عمیق مهارتی · کشف نقش</p>
        <h2 className="page-title !text-lg mb-2">
          فروشنده · حسابدار · طراح · ایده‌پرداز
        </h2>
        <p className="muted text-sm leading-7 mb-3">
          تئوری، استدلال، عملی، طراحی ۳D و آزمون آن‌قدر عمیق‌اند که در پایان
          می‌دانید برای کدام نقش گالری ساخته شده‌اید.
        </p>
        {complete && top ? (
          <p className="career-compact__hint mb-3">
            نزدیک‌ترین نقش الان: <strong>{top.titleFa}</strong> (
            {toPersianDigits(top.percent)}٪ تناسب)
          </p>
        ) : (
          <p className="career-compact__hint mb-3">
            نقش فعلی پروفایل:{" "}
            {profile ? JOB_ROLE_LABELS[profile.jobRole] : "—"}
          </p>
        )}
        <Link href="/employee/career" className="btn btn-primary tap-react w-full text-sm">
          مسیر عمیق نقش من
        </Link>
      </section>
    );
  }

  return (
    <div className="career-pathfinder">
      <MotionEnter>
        <p className="atelier-kicker">Deep Skill · Role Discovery</p>
        <h1 className="page-title mb-2">کدام نقش گالری مال شماست؟</h1>
        <p className="muted text-sm leading-7 mb-4">
          متقاضی بعد از دوره عمیق — نه یک آزمون سطحی — باید بتواند بگوید:
          «حسابدار آنجا می‌شوم» یا «ایده‌پرداز / طراح / فروشنده آنجا». هر مسیر
          پنج لایه دارد: تئوری · استدلال · عملی · طراحی · آزمون.
        </p>
      </MotionEnter>

      <div className="career-track-tabs">
        {CAREER_TRACKS.map((t) => (
          <Pressable
            key={t.id}
            className={`career-track-tab ${trackId === t.id ? "is-on" : ""}`}
            feedback={{ label: t.titleFa, tone: "ok" }}
            onPress={() => setTrackId(t.id)}
          >
            <strong>{t.titleFa}</strong>
            <em>{t.shortFa}</em>
          </Pressable>
        ))}
      </div>

      <section className="career-track-hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={sculptureSrc(track.sculptureSlot)} alt="" />
        <div className="career-track-hero__veil" aria-hidden />
        <div className="career-track-hero__copy">
          <p className="atelier-kicker">{track.shortFa}</p>
          <h2>{track.titleFa}</h2>
          <p>{track.promiseFa}</p>
          <p className="career-track-hero__out">{track.outcomeFa}</p>
        </div>
      </section>

      <div className="career-faculties">
        {track.faculties.map((f) => (
          <span key={f} className="career-faculty">
            {f}
          </span>
        ))}
      </div>

      <p className="section-title mb-3">پنج لایه دوره عمیق</p>
      <div className="career-pillars">
        {track.pillars.map((p, i) => (
          <Link key={p.id} href={p.href} className="career-pillar tap-react">
            <span className="career-pillar__n">{toPersianDigits(i + 1)}</span>
            <span>
              <strong>{p.titleFa}</strong>
              <em>{p.bodyFa}</em>
              <span className="career-pillar__cta">{p.ctaFa} ←</span>
            </span>
          </Link>
        ))}
      </div>

      <section className="career-fit surface p-4 mt-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="section-title !mb-1">سنجش تناسب نقش</p>
            <p className="muted text-sm leading-7">
              شش سؤال استدلالی + سیگنال فعالیت آموزشی شما — نتیجه راهنماست؛ مجوز
              کار همچنان فقط با ارزیابی عملی مدیر است.
            </p>
          </div>
          <Pressable
            className="btn btn-secondary tap-react !min-h-10 text-xs shrink-0"
            feedback={{ label: "آزمون تناسب", tone: "info" }}
            onPress={() => setQuizOpen((v) => !v)}
          >
            {quizOpen ? "بستن" : "شروع سنجش"}
          </Pressable>
        </div>

        {quizOpen ? (
          <div className="career-quiz space-y-4">
            {FIT_QUESTIONS.map((q) => (
              <div key={q.id} className="career-quiz__q">
                <p className="font-bold text-sm mb-2">{q.promptFa}</p>
                <div className="career-quiz__choices">
                  {q.choices.map((c) => (
                    <Pressable
                      key={c.id}
                      className={`career-quiz__choice ${
                        answers[q.id] === c.id ? "is-on" : ""
                      }`}
                      feedback={{ label: "ثبت شد", tone: "ok" }}
                      onPress={() => pickAnswer(q.id, c.id)}
                    >
                      {c.labelFa}
                    </Pressable>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {complete ? (
          <div className="career-rank mt-4">
            <p className="text-sm font-bold mb-2">رتبه‌بندی تناسب شما</p>
            <div className="career-rank__bars">
              {ranking.map((r) => (
                <div key={r.trackId} className="career-rank__row">
                  <span>{r.titleFa}</span>
                  <div className="career-rank__bar">
                    <i style={{ width: `${r.percent}%` }} />
                  </div>
                  <em>{toPersianDigits(r.percent)}٪</em>
                </div>
              ))}
            </div>
            {top ? (
              <div className="career-rank__verdict mt-3">
                <p className="text-sm leading-7">
                  نزدیک‌ترین مسیر: <strong>{top.titleFa}</strong> — {top.outcomeFa}
                </p>
                <Pressable
                  className="btn btn-primary tap-react mt-3 w-full text-sm"
                  feedback={{
                    label: committed ? "مسیر ثبت شد" : "تعهد به مسیر",
                    tone: "ok",
                  }}
                  onPress={commitTop}
                >
                  {committed
                    ? `مسیر «${top.titleFa}» روی پروفایل نشست`
                    : `تعهد به مسیر ${top.titleFa} و باز کردن بسته عمیق`}
                </Pressable>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="muted text-xs mt-3 leading-6">
            برای دیدن رتبه‌بندی، هر شش سؤال سنجش را پاسخ دهید.
          </p>
        )}
      </section>

      <ul className="career-signals mt-4">
        {track.signals.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
    </div>
  );
}
