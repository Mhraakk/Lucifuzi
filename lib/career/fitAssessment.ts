/**
 * Role-fit discovery quiz — deep enough that after theory/practice/design/exams
 * signals + answers, the candidate sees which gallery vocation fits.
 */

import type { AppState } from "@/lib/types";
import {
  CAREER_TRACKS,
  type CareerTrackId,
} from "@/lib/career/tracks";
import { courseProgressPercent } from "@/lib/store";

export type FitQuestion = {
  id: string;
  promptFa: string;
  /** Choice id → track weights */
  choices: Array<{
    id: string;
    labelFa: string;
    weights: Partial<Record<CareerTrackId, number>>;
  }>;
};

export const FIT_QUESTIONS: FitQuestion[] = [
  {
    id: "energy",
    promptFa: "یک شیفت شلوغ؛ کجا بیشتر زنده می‌شوید؟",
    choices: [
      {
        id: "floor",
        labelFa: "کنار مشتری روی ویترین — گفت‌وگو و انتخاب",
        weights: { salesperson: 3, ideator: 1 },
      },
      {
        id: "desk",
        labelFa: "پشت عدد و فاکتور — رقم درست، شفاف",
        weights: { accountant: 3 },
      },
      {
        id: "bench",
        labelFa: "پشت بوم فرم — شکل، نگین، نور",
        weights: { designer: 3, ideator: 1 },
      },
      {
        id: "board",
        labelFa: "با تیم ایده می‌دهم — واریانت و ست برای فروش",
        weights: { ideator: 3, salesperson: 1 },
      },
    ],
  },
  {
    id: "hard",
    promptFa: "کدام چالش را با میل حل می‌کنید؟",
    choices: [
      {
        id: "objection",
        labelFa: "مشتری به قیمت اعتراض دارد — روایت و دو گزینه",
        weights: { salesperson: 3 },
      },
      {
        id: "split",
        labelFa: "تجزیه قیمت فلز/اجرت/سود را دقیق و آرام بگویم",
        weights: { accountant: 3, salesperson: 1 },
      },
      {
        id: "proportion",
        labelFa: "تناسب حلقه و نگین درست نیست — اصلاح فرم",
        weights: { designer: 3 },
      },
      {
        id: "bundle",
        labelFa: "چطور این پلاک را با زنجیر ست کنم بدون فشار؟",
        weights: { ideator: 3, salesperson: 1 },
      },
    ],
  },
  {
    id: "learn",
    promptFa: "در آموزش عمیق، کدام لایه شما را نگه می‌دارد؟",
    choices: [
      {
        id: "scenario",
        labelFa: "سناریوی فروش و نقش‌آفرینی",
        weights: { salesperson: 3 },
      },
      {
        id: "formula",
        labelFa: "فرمول و آزمون محاسبه",
        weights: { accountant: 3 },
      },
      {
        id: "sculpt",
        labelFa: "کارگاه ۳D و لمس طلا",
        weights: { designer: 3 },
      },
      {
        id: "brain",
        labelFa: "ایده‌پردازی سه‌مسیره هر محصول",
        weights: { ideator: 3, designer: 1 },
      },
    ],
  },
  {
    id: "pride",
    promptFa: "پایان روز، به چه چیزی افتخار می‌کنید؟",
    choices: [
      {
        id: "close",
        labelFa: "مشتری راضی رفت — بدون پشیمانی",
        weights: { salesperson: 3 },
      },
      {
        id: "balance",
        labelFa: "همه ارقام و کنترل‌ها تمیز بسته شد",
        weights: { accountant: 3 },
      },
      {
        id: "form",
        labelFa: "یک فرم ایده‌آل ساختم که تیم پسندید",
        weights: { designer: 3 },
      },
      {
        id: "spark",
        labelFa: "ایده‌ام فروش هم‌تیمی را جلو برد",
        weights: { ideator: 3, salesperson: 1 },
      },
    ],
  },
  {
    id: "drain",
    promptFa: "کدام کار زودتر خسته‌تان می‌کند؟",
    choices: [
      {
        id: "numbers",
        labelFa: "ساعت‌ها فقط عدد و فاکتور",
        weights: { salesperson: 2, designer: 2, ideator: 1, accountant: -2 },
      },
      {
        id: "talk",
        labelFa: "گفت‌وگوی مداوم با غریبه",
        weights: { accountant: 2, designer: 2, salesperson: -2 },
      },
      {
        id: "blank",
        labelFa: "بوم خالی بدون مسئله فروشگاهی",
        weights: { salesperson: 1, accountant: 1, ideator: 2, designer: -1 },
      },
      {
        id: "repeat",
        labelFa: "تکرار یک فروش ثابت بدون ایده جدید",
        weights: { ideator: 2, designer: 1, salesperson: -1 },
      },
    ],
  },
  {
    id: "mentor",
    promptFa: "اگر یک استاد ایتالیایی mentortان باشد، از او چه می‌خواهید؟",
    choices: [
      {
        id: "host",
        labelFa: "چطور مهمان را با وقار هدایت کنم",
        weights: { salesperson: 3 },
      },
      {
        id: "measure",
        labelFa: "چطور دقت را مثل مهر عیار در عدد بیاورم",
        weights: { accountant: 3 },
      },
      {
        id: "eye",
        labelFa: "چطور چشم و دست را برای فرم تربیت کنم",
        weights: { designer: 3 },
      },
      {
        id: "invent",
        labelFa: "چطور ایده را به روایت قابل‌فروش تبدیل کنم",
        weights: { ideator: 3 },
      },
    ],
  },
];

export type FitAnswers = Record<string, string>;

export type TrackFitScore = {
  trackId: CareerTrackId;
  score: number;
  percent: number;
  titleFa: string;
  outcomeFa: string;
  learningPathId: string;
  jobRole: CareerTrackId extends string ? import("@/lib/types").JobRole : never;
};

function activityBoost(
  state: AppState,
  userId: string
): Partial<Record<CareerTrackId, number>> {
  const boost: Partial<Record<CareerTrackId, number>> = {};
  const salesProg =
    (courseProgressPercent(state, userId, "course_04") +
      courseProgressPercent(state, userId, "course_02")) /
    2;
  const priceProg = courseProgressPercent(state, userId, "course_03");
  const riskProg = courseProgressPercent(state, userId, "course_10");

  if (salesProg > 20) boost.salesperson = (boost.salesperson ?? 0) + salesProg / 25;
  if (priceProg > 20) boost.accountant = (boost.accountant ?? 0) + priceProg / 20;
  if (riskProg > 20) {
    boost.accountant = (boost.accountant ?? 0) + riskProg / 30;
  }

  const scenarios = state.scenarioAttempts?.filter((a) => a.userId === userId) ?? [];
  if (scenarios.some((s) => s.scenarioId?.includes("sales"))) {
    boost.salesperson = (boost.salesperson ?? 0) + 1.5;
  }
  if (scenarios.some((s) => s.scenarioId?.includes("fraud"))) {
    boost.accountant = (boost.accountant ?? 0) + 1.2;
  }

  // Studio / brainstorm affinity stored as local signal
  try {
    const raw = localStorage.getItem("arya_studio_affinity");
    if (raw) {
      const n = Number(raw);
      if (n > 0) {
        boost.designer = (boost.designer ?? 0) + Math.min(3, n / 2);
        boost.ideator = (boost.ideator ?? 0) + Math.min(2.5, n / 2.5);
      }
    }
  } catch {
    /* ssr / private */
  }

  return boost;
}

export function scoreCareerFit(
  answers: FitAnswers,
  state?: AppState,
  userId?: string
): TrackFitScore[] {
  const totals: Record<CareerTrackId, number> = {
    salesperson: 0,
    accountant: 0,
    designer: 0,
    ideator: 0,
  };

  for (const q of FIT_QUESTIONS) {
    const choiceId = answers[q.id];
    const choice = q.choices.find((c) => c.id === choiceId);
    if (!choice) continue;
    for (const [track, w] of Object.entries(choice.weights) as Array<
      [CareerTrackId, number]
    >) {
      totals[track] += w;
    }
  }

  if (state && userId) {
    const boost = activityBoost(state, userId);
    for (const [track, w] of Object.entries(boost) as Array<
      [CareerTrackId, number]
    >) {
      totals[track] += w;
    }
  }

  const max = Math.max(...Object.values(totals), 1);
  return CAREER_TRACKS.map((t) => ({
    trackId: t.id,
    score: totals[t.id],
    percent: Math.round((totals[t.id] / max) * 100),
    titleFa: t.titleFa,
    outcomeFa: t.outcomeFa,
    learningPathId: t.learningPathId,
    jobRole: t.jobRole,
  })).sort((a, b) => b.score - a.score);
}

const FIT_KEY = "arya_career_fit_v1";

export function loadFitAnswers(): FitAnswers {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(FIT_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as FitAnswers;
  } catch {
    return {};
  }
}

export function saveFitAnswers(answers: FitAnswers): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(FIT_KEY, JSON.stringify(answers));
}

export function bumpStudioAffinity(): void {
  if (typeof window === "undefined") return;
  try {
    const n = Number(localStorage.getItem("arya_studio_affinity") ?? "0");
    localStorage.setItem("arya_studio_affinity", String(n + 1));
  } catch {
    /* ignore */
  }
}

export function fitIsComplete(answers: FitAnswers): boolean {
  return FIT_QUESTIONS.every((q) => Boolean(answers[q.id]));
}
