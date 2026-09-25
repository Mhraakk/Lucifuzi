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
  activityEvidenceCount,
  fitIsComplete,
  loadFitAnswers,
  saveFitAnswers,
  scoreCareerFit,
  type FitAnswers,
} from "@/lib/career/fitAssessment";
import { sculptureSrc } from "@/lib/atelier/sculptures";
import { toPersianDigits } from "@/lib/format";
import { integrityReportForUser } from "@/lib/integrity";
import { useAppState, useCurrentUser, useEmployeeProfile } from "@/lib/hooks";
import { commitCareerTrack, saveCareerFitAnswers } from "@/lib/store";
import { JOB_ROLE_LABELS } from "@/lib/types";

/**
 * Deep vocation pathfinder — theory · reasoning · practice · design · exam
 * Rankings show absolute % and cite real attempts; no fabricated scores.
 */
export function CareerPathfinder({ compact = false }: { compact?: boolean }) {
  const state = useAppState();
  const user = useCurrentUser();
  const profile = useEmployeeProfile();
  const [trackId, setTrackId] = useState<CareerTrackId>("salesperson");
  const [answers, setAnswers] = useState<FitAnswers>(() =>
    loadFitAnswers(profile?.careerFitAnswers)
  );
  const [quizOpen, setQuizOpen] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  const track = getCareerTrack(trackId);
  const ranking = useMemo(
    () => scoreCareerFit(answers, state, user.id),
    [answers, state, user.id]
  );
  const top = ranking[0];
  const complete = fitIsComplete(answers);
  const integrity = useMemo(
    () => integrityReportForUser(state, user.id),
    [state, user.id]
  );
  const activityN = activityEvidenceCount(state, user.id);

  function pickAnswer(qid: string, cid: string) {
    const next = { ...answers, [qid]: cid };
    setAnswers(next);
    saveFitAnswers(next);
    saveCareerFitAnswers(user.id, next);
  }

  function commitTop() {
    if (!top) return;
    setCommitError(null);
    const res = commitCareerTrack({
      userId: user.id,
      jobRole: top.jobRole,
      learningPathId: top.learningPathId,
    });
    if (!res.ok) {
      setCommitError(res.reason);
      return;
    }
    setTrackId(top.trackId);
    setCommitted(true);
  }

  if (compact) {
    return (
      <section className="career-compact surface p-4 animate-in">
        <p className="atelier-kicker">دوره عمیق مهارتی · داده واقعی</p>
        <h2 className="page-title !text-lg mb-2">
          فروشنده · حسابدار · طراح · ایده‌پرداز
        </h2>
        <p className="muted text-sm leading-7 mb-3">
          رتبه‌بندی فقط از ترجیح + آزمونک/آزمون/درس/سناریو/استودیوی ثبت‌شده —
          بدون نمره جعلی.
        </p>
        <p className="career-compact__hint mb-3">
          شواهد واقعی: {toPersianDigits(activityN)} · دانش محاسبه‌شده:{" "}
          {toPersianDigits(integrity.knowledgeLevel)}٪
          {complete && top ? (
            <>
              {" "}
              · نزدیک‌ترین نقش: <strong>{top.titleFa}</strong> (
              {toPersianDigits(top.percent)}٪
              {top.evidenceBacked ? "" : " · فقط ترجیح"})
            </>
          ) : (
            <>
              {" "}
              · نقش پروفایل:{" "}
              {profile ? JOB_ROLE_LABELS[profile.jobRole] : "—"}
            </>
          )}
        </p>
        <Link
          href="/employee/career"
          className="btn btn-primary tap-react w-full text-sm"
        >
          مسیر عمیق نقش من
        </Link>
      </section>
    );
  }

  return (
    <div className="career-pathfinder">
      <MotionEnter>
        <p className="atelier-kicker">Deep Skill · Real Evidence</p>
        <h1 className="page-title mb-2">کدام نقش گالری مال شماست؟</h1>
        <p className="muted text-sm leading-7 mb-4">
          متقاضی بعد از دوره عمیق باید بتواند بگوید نقشش چیست. درصدها مطلق‌اند
          و از ترجیح + شواهد واقعی ساخته می‌شوند — نه نرمال‌سازی جعلی به ۱۰۰٪.
        </p>
      </MotionEnter>

      <section className="career-integrity surface p-4 mb-4">
        <p className="section-title !mb-2">صحت‌سنجی داده شما</p>
        <ul className="career-integrity__grid">
          <li>
            آزمونک واقعی: {toPersianDigits(integrity.quizAttempts)}
          </li>
          <li>
            آزمون واقعی: {toPersianDigits(integrity.examAttempts)}
          </li>
          <li>
            گواهی لینک‌شده: {toPersianDigits(integrity.certificates)}
          </li>
          <li>
            درس تکمیل: {toPersianDigits(integrity.lessonCompleted)}
          </li>
          <li>
            سناریو: {toPersianDigits(integrity.scenarioAttempts)}
          </li>
          <li>
            استودیو ۳D: {toPersianDigits(integrity.studioSessions)}
          </li>
        </ul>
        <p className="muted text-xs mt-2 leading-6">
          سطح دانش پروفایل = میانگین نمرات آزمونک/آزمون با پاسخ درجه‌بندی‌شده:{" "}
          <strong>{toPersianDigits(integrity.knowledgeLevel)}٪</strong>
          {integrity.quizAttempts + integrity.examAttempts === 0
            ? " — هنوز آزمونی ثبت نشده؛ عدد صفر است نه نمره ساختگی."
            : null}
        </p>
      </section>

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
              شش سؤال ترجیحی + شواهد فعالیت واقعی. تعهد به مسیر بدون فعالیت
              آموزشی مسدود است. مجوز کار همچنان فقط با ارزیابی عملی مدیر.
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
                      feedback={{ label: "ترجیح ثبت شد", tone: "ok" }}
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
            <p className="text-sm font-bold mb-2">رتبه‌بندی تناسب (درصد مطلق)</p>
            <div className="career-rank__bars">
              {ranking.map((r) => (
                <div key={r.trackId} className="career-rank__row">
                  <span>
                    {r.titleFa}
                    {!r.evidenceBacked ? (
                      <em className="career-rank__pref"> ترجیح</em>
                    ) : null}
                  </span>
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
                  نزدیک‌ترین مسیر: <strong>{top.titleFa}</strong> —{" "}
                  {top.outcomeFa}
                </p>
                <p className="muted text-xs mt-2 leading-6">
                  شواهد این نقش: ترجیح{" "}
                  {toPersianDigits(Math.round(top.evidence.preferencePoints))} +
                  فعالیت{" "}
                  {toPersianDigits(
                    Math.round(top.evidence.activityPoints * 10) / 10
                  )}
                  {top.evidence.sources.filter((s) => !s.startsWith("ترجیح"))
                    .length
                    ? ` · ${top.evidence.sources
                        .filter((s) => !s.startsWith("ترجیح"))
                        .slice(0, 3)
                        .join(" · ")}`
                    : " · هنوز شاهد فعالیت واقعی برای این نقش نیست"}
                </p>
                <Pressable
                  className="btn btn-primary tap-react mt-3 w-full text-sm"
                  feedback={{
                    label: committed ? "مسیر ثبت شد" : "تلاش تعهد",
                    tone: committed ? "ok" : "info",
                  }}
                  onPress={commitTop}
                >
                  {committed
                    ? `مسیر «${top.titleFa}» روی پروفایل نشست`
                    : `تعهد به مسیر ${top.titleFa} (نیازمند شواهد واقعی)`}
                </Pressable>
                {commitError ? (
                  <p className="text-xs mt-2 leading-6" style={{ color: "var(--danger, #b33)" }}>
                    {commitError}
                  </p>
                ) : null}
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
