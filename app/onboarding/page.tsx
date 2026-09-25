"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CAREER_TRACKS,
  type CareerTrackId,
} from "@/lib/career/tracks";
import { useAppState } from "@/lib/hooks";
import { completeOnboarding, setCurrentUser } from "@/lib/store";
import { sculptureSrc } from "@/lib/atelier/sculptures";

const TRACK_TO_EXP: Record<
  CareerTrackId,
  "none" | "junior" | "mid" | "senior"
> = {
  salesperson: "junior",
  accountant: "junior",
  designer: "none",
  ideator: "junior",
};

export default function OnboardingPage() {
  const state = useAppState();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [fullName, setFullName] = useState("سارا محمدی");
  const [phone, setPhone] = useState("09121234567");
  const [branchId, setBranchId] = useState(state.branches[0]?.id ?? "");
  const [trackId, setTrackId] = useState<CareerTrackId>("salesperson");
  const [experienceLevel, setExperienceLevel] =
    useState<"none" | "junior" | "mid" | "senior">("junior");
  const [previousJewelryExperience, setPrev] = useState(false);
  const [hireDate, setHireDate] = useState("2026-03-20");
  const [unsure, setUnsure] = useState(false);

  const track = CAREER_TRACKS.find((t) => t.id === trackId)!;
  const path = state.learningPaths.find((p) => p.id === track.learningPathId);

  function finish() {
    setCurrentUser("user_emp_nima");
    completeOnboarding({
      fullName,
      phone,
      branchId,
      jobRole: track.jobRole,
      experienceLevel: unsure ? "none" : experienceLevel,
      previousJewelryExperience,
      hireDate: new Date(hireDate).toISOString(),
      learningPathId: track.learningPathId,
    });
    router.push("/employee/career");
  }

  return (
    <div
      data-theme={state.theme}
      className="min-h-screen px-4 py-8"
      style={{ background: "var(--bg)", color: "var(--ink)" }}
    >
      <div className="mx-auto max-w-md space-y-5 animate-in">
        <p className="text-xs faint">Beatris · دوره عمیق مهارتی</p>
        <h1 className="page-title">کدام نقش مال شماست؟</h1>
        <p className="muted text-sm leading-7">
          تئوری، استدلال، عملی، طراحی ۳D و آزمون آن‌قدر عمیق‌اند که در پایان
          می‌دانید: فروشنده آنجا می‌شوید، حسابدار، طراح، یا ایده‌پرداز.
        </p>

        {step === 0 ? (
          <section className="surface p-4 space-y-3">
            <h2 className="section-title">اطلاعات پایه</h2>
            <div>
              <label className="label">نام کامل</label>
              <input
                className="field"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <div>
              <label className="label">موبایل</label>
              <input
                className="field"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div>
              <label className="label">شعبه</label>
              <select
                className="field"
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
              >
                {state.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">تاریخ استخدام</label>
              <input
                className="field"
                type="date"
                value={hireDate}
                onChange={(e) => setHireDate(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn btn-primary w-full"
              onClick={() => setStep(1)}
            >
              ادامه به چهار مسیر عمیق
            </button>
          </section>
        ) : null}

        {step === 1 ? (
          <section className="surface p-4 space-y-3">
            <h2 className="section-title">چهار مسیر عمیق</h2>
            <p className="muted text-sm leading-7 mb-1">
              یک حدس اولیه بزنید — سنجش تناسب روی مسیر نقش، نتیجه را دقیق‌تر
              می‌کند.
            </p>
            <div className="grid gap-2">
              {CAREER_TRACKS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="rounded-xl border p-3 text-right"
                  style={{
                    borderColor: trackId === t.id && !unsure ? "var(--accent)" : "var(--line)",
                    background:
                      trackId === t.id && !unsure
                        ? "var(--accent-soft)"
                        : "transparent",
                  }}
                  onClick={() => {
                    setUnsure(false);
                    setTrackId(t.id);
                    setExperienceLevel(TRACK_TO_EXP[t.id]);
                  }}
                >
                  <strong className="block text-sm">{t.titleFa}</strong>
                  <em className="block text-xs faint mt-1 not-italic leading-6">
                    {t.shortFa} — {t.promiseFa}
                  </em>
                </button>
              ))}
              <button
                type="button"
                className="rounded-xl border p-3 text-right text-sm"
                style={{
                  borderColor: unsure ? "var(--accent)" : "var(--line)",
                  background: unsure ? "var(--accent-soft)" : "transparent",
                }}
                onClick={() => setUnsure(true)}
              >
                هنوز مطمئن نیستم — اول سنجش تناسب نقش
              </button>
            </div>
            <div>
              <label className="label">سطح تجربه</label>
              <select
                className="field"
                value={experienceLevel}
                onChange={(e) =>
                  setExperienceLevel(
                    e.target.value as "none" | "junior" | "mid" | "senior"
                  )
                }
              >
                <option value="none">بدون تجربه</option>
                <option value="junior">تازه‌کار</option>
                <option value="mid">متوسط</option>
                <option value="senior">باسابقه</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={previousJewelryExperience}
                onChange={(e) => setPrev(e.target.checked)}
              />
              سابقه کار در طلافروشی دارم
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-secondary flex-1"
                onClick={() => setStep(0)}
              >
                قبلی
              </button>
              <button
                type="button"
                className="btn btn-primary flex-1"
                onClick={() => setStep(2)}
              >
                ادامه
              </button>
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="surface p-4 space-y-4">
            <div className="career-track-hero !min-h-[9rem] !rounded-xl overflow-hidden relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={sculptureSrc(track.sculptureSlot)}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="career-track-hero__veil" aria-hidden />
              <div className="career-track-hero__copy !p-3">
                <p className="atelier-kicker">
                  {unsure ? "کشف نقش" : track.shortFa}
                </p>
                <h2 className="!text-lg">
                  {unsure ? "سنجش تناسب نقش" : track.titleFa}
                </h2>
              </div>
            </div>

            <h2 className="section-title">
              {unsure ? "مسیر بعدی شما" : "بسته عمیق پیشنهادی"}
            </h2>
            {unsure ? (
              <p className="muted text-sm leading-7">
                شش سؤال استدلالی + سیگنال فعالیت آموزشی مشخص می‌کند نزدیک‌ترین
                نقش کدام است — فروشنده، حسابدار، طراح، یا ایده‌پرداز.
              </p>
            ) : (
              <>
                <p className="font-bold">{path?.title ?? track.titleFa}</p>
                <p className="muted text-sm leading-7">
                  {path?.description ?? track.outcomeFa}
                </p>
                <p className="text-sm leading-7">{track.promiseFa}</p>
                <ul className="space-y-2">
                  {track.pillars.map((p) => (
                    <li
                      key={p.id}
                      className="rounded-xl px-3 py-2 text-sm"
                      style={{ background: "var(--bg-soft)" }}
                    >
                      <strong>{p.titleFa}</strong>
                      <span className="faint"> · {p.bodyFa}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p className="text-xs faint leading-6">
              آزمون فقط دانش را می‌سنجد. مجوز کار مستقل فقط با ارزیابی عملی مدیر
              صادر می‌شود — نه با نمره آزمون.
            </p>
            <button
              type="button"
              className="btn btn-primary w-full"
              onClick={finish}
            >
              {unsure ? "ورود به سنجش تناسب نقش" : "شروع مسیر عمیق نقش"}
            </button>
          </section>
        ) : null}
      </div>
    </div>
  );
}
