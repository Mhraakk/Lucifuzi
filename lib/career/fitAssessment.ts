/**
 * Role-fit discovery — preference answers + REAL activity evidence.
 * Percent is absolute (capped), never relative-max forced to 100%.
 * Ranking without graded attempts is labeled preference-only.
 */

import type { AppState, JobRole } from "@/lib/types";
import {
  CAREER_TRACKS,
  type CareerTrackId,
} from "@/lib/career/tracks";
import { courseProgressPercent } from "@/lib/store";
import {
  isRealExamAttempt,
  isRealQuizAttempt,
  latestCourseAttemptScore,
} from "@/lib/integrity";

export type FitQuestion = {
  id: string;
  promptFa: string;
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

export type FitEvidence = {
  preferencePoints: number;
  activityPoints: number;
  sources: string[];
  hasGradedAttempts: boolean;
};

export type TrackFitScore = {
  trackId: CareerTrackId;
  score: number;
  /** Absolute 0–100 — never forced to 100 by relative max */
  percent: number;
  titleFa: string;
  outcomeFa: string;
  learningPathId: string;
  jobRole: JobRole;
  evidence: FitEvidence;
  /** True only when preference is complete AND real activity exists */
  evidenceBacked: boolean;
};

const PREFERENCE_CAP = 18; // max raw from 6 questions × ~3
const ACTIVITY_CAP = 24;

function emptyTotals(): Record<CareerTrackId, number> {
  return { salesperson: 0, accountant: 0, designer: 0, ideator: 0 };
}

function emptyEvidence(): Record<CareerTrackId, FitEvidence> {
  return {
    salesperson: {
      preferencePoints: 0,
      activityPoints: 0,
      sources: [],
      hasGradedAttempts: false,
    },
    accountant: {
      preferencePoints: 0,
      activityPoints: 0,
      sources: [],
      hasGradedAttempts: false,
    },
    designer: {
      preferencePoints: 0,
      activityPoints: 0,
      sources: [],
      hasGradedAttempts: false,
    },
    ideator: {
      preferencePoints: 0,
      activityPoints: 0,
      sources: [],
      hasGradedAttempts: false,
    },
  };
}

function addActivity(
  evidence: Record<CareerTrackId, FitEvidence>,
  totals: Record<CareerTrackId, number>,
  track: CareerTrackId,
  points: number,
  source: string,
  graded = false
): void {
  if (points <= 0) return;
  totals[track] += points;
  evidence[track].activityPoints += points;
  evidence[track].sources.push(source);
  if (graded) evidence[track].hasGradedAttempts = true;
}

function activityEvidence(
  state: AppState,
  userId: string
): {
  totals: Record<CareerTrackId, number>;
  evidence: Record<CareerTrackId, FitEvidence>;
} {
  const totals = emptyTotals();
  const evidence = emptyEvidence();

  // Graded quiz/exam by course → track
  const salesCourses = ["course_04", "course_02", "course_05"];
  const accountCourses = ["course_03", "course_10"];
  const designCourses = ["course_02", "course_01"];
  const ideaCourses = ["course_04", "course_05", "course_02"];

  for (const cid of salesCourses) {
    const s = latestCourseAttemptScore(state, userId, cid);
    if (s !== null) {
      addActivity(
        evidence,
        totals,
        "salesperson",
        s / 25,
        `آزمونک/آزمون ${cid}: ${s}٪`,
        true
      );
    }
  }
  for (const cid of accountCourses) {
    const s = latestCourseAttemptScore(state, userId, cid);
    if (s !== null) {
      addActivity(
        evidence,
        totals,
        "accountant",
        s / 20,
        `آزمونک/آزمون ${cid}: ${s}٪`,
        true
      );
    }
  }
  for (const cid of designCourses) {
    const s = latestCourseAttemptScore(state, userId, cid);
    if (s !== null) {
      addActivity(
        evidence,
        totals,
        "designer",
        s / 30,
        `آزمونک/آزمون ${cid}: ${s}٪`,
        true
      );
    }
  }
  for (const cid of ideaCourses) {
    const s = latestCourseAttemptScore(state, userId, cid);
    if (s !== null) {
      addActivity(
        evidence,
        totals,
        "ideator",
        s / 35,
        `آزمونک/آزمون ${cid}: ${s}٪`,
        true
      );
    }
  }

  // Lesson progress (real completions only via courseProgressPercent)
  const salesProg =
    (courseProgressPercent(state, userId, "course_04") +
      courseProgressPercent(state, userId, "course_02")) /
    2;
  const priceProg = courseProgressPercent(state, userId, "course_03");
  const riskProg = courseProgressPercent(state, userId, "course_10");
  if (salesProg > 0) {
    addActivity(
      evidence,
      totals,
      "salesperson",
      salesProg / 40,
      `پیشرفت درس فروش/محصول: ${Math.round(salesProg)}٪`
    );
  }
  if (priceProg > 0) {
    addActivity(
      evidence,
      totals,
      "accountant",
      priceProg / 35,
      `پیشرفت درس قیمت: ${Math.round(priceProg)}٪`
    );
  }
  if (riskProg > 0) {
    addActivity(
      evidence,
      totals,
      "accountant",
      riskProg / 40,
      `پیشرفت درس ریسک: ${Math.round(riskProg)}٪`
    );
  }

  const scenarios =
    state.scenarioAttempts?.filter((a) => a.userId === userId) ?? [];
  for (const s of scenarios) {
    if (s.scenarioId?.includes("sales")) {
      addActivity(
        evidence,
        totals,
        "salesperson",
        1.5,
        `سناریوی فروش واقعی · نمره ${s.score ?? "—"}`
      );
    }
    if (s.scenarioId?.includes("fraud")) {
      addActivity(
        evidence,
        totals,
        "accountant",
        1.2,
        `سناریوی ریسک واقعی · نمره ${s.score ?? "—"}`
      );
    }
  }

  const studio =
    state.employeeProfiles.find((p) => p.userId === userId)
      ?.studioSessionCount ?? 0;
  if (studio > 0) {
    addActivity(
      evidence,
      totals,
      "designer",
      Math.min(4, studio * 0.8),
      `${studio} جلسه استودیو ۳D ثبت‌شده`
    );
    addActivity(
      evidence,
      totals,
      "ideator",
      Math.min(3.5, studio * 0.7),
      `${studio} جلسه ایده‌پردازی ثبت‌شده`
    );
  }

  // Mark graded flag from any real attempts overall
  const anyGraded =
    (state.quizAttempts ?? []).some(
      (a) => a.userId === userId && isRealQuizAttempt(a)
    ) ||
    (state.examAttempts ?? []).some(
      (a) => a.userId === userId && isRealExamAttempt(a)
    );
  if (anyGraded) {
    for (const t of Object.keys(evidence) as CareerTrackId[]) {
      if (evidence[t].sources.some((s) => s.startsWith("آزمونک"))) {
        evidence[t].hasGradedAttempts = true;
      }
    }
  }

  return { totals, evidence };
}

export function scoreCareerFit(
  answers: FitAnswers,
  state?: AppState,
  userId?: string
): TrackFitScore[] {
  const prefTotals = emptyTotals();
  const evidence = emptyEvidence();

  for (const q of FIT_QUESTIONS) {
    const choiceId = answers[q.id];
    const choice = q.choices.find((c) => c.id === choiceId);
    if (!choice) continue;
    for (const [track, w] of Object.entries(choice.weights) as Array<
      [CareerTrackId, number]
    >) {
      prefTotals[track] += w;
      evidence[track].preferencePoints += w;
      evidence[track].sources.push(`ترجیح: ${q.id}/${choice.id}`);
    }
  }

  let actTotals = emptyTotals();
  if (state && userId) {
    const act = activityEvidence(state, userId);
    actTotals = act.totals;
    for (const t of Object.keys(evidence) as CareerTrackId[]) {
      evidence[t].activityPoints = act.evidence[t].activityPoints;
      evidence[t].hasGradedAttempts = act.evidence[t].hasGradedAttempts;
      evidence[t].sources = [
        ...evidence[t].sources.filter((s) => s.startsWith("ترجیح")),
        ...act.evidence[t].sources,
      ];
    }
  }

  const denom = PREFERENCE_CAP + ACTIVITY_CAP;
  return CAREER_TRACKS.map((t) => {
    const pref = Math.max(0, prefTotals[t.id]);
    const act = Math.max(0, actTotals[t.id]);
    const raw = pref + act;
    const percent = Math.min(100, Math.round((raw / denom) * 100));
    const ev = evidence[t.id];
    const evidenceBacked =
      fitIsComplete(answers) &&
      (ev.activityPoints > 0 || ev.hasGradedAttempts);
    return {
      trackId: t.id,
      score: raw,
      percent,
      titleFa: t.titleFa,
      outcomeFa: t.outcomeFa,
      learningPathId: t.learningPathId,
      jobRole: t.jobRole,
      evidence: ev,
      evidenceBacked,
    };
  }).sort((a, b) => b.score - a.score);
}

/** @deprecated localStorage — prefer profile.careerFitAnswers via store */
const FIT_KEY = "arya_career_fit_v1";

export function loadFitAnswers(
  profileAnswers?: Record<string, string> | null
): FitAnswers {
  if (profileAnswers && Object.keys(profileAnswers).length > 0) {
    return { ...profileAnswers };
  }
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

/** @deprecated use recordStudioSession from store — kept as no-op redirect */
export function bumpStudioAffinity(): void {
  // Intentionally empty — StudioLanding must call recordStudioSession
}

export function fitIsComplete(answers: FitAnswers): boolean {
  return FIT_QUESTIONS.every((q) => Boolean(answers[q.id]));
}

export function activityEvidenceCount(
  state: AppState,
  userId: string
): number {
  const quizzes = (state.quizAttempts ?? []).filter(
    (a) => a.userId === userId && isRealQuizAttempt(a)
  ).length;
  const exams = (state.examAttempts ?? []).filter(
    (a) => a.userId === userId && isRealExamAttempt(a)
  ).length;
  const lessons = state.lessonProgress.filter(
    (p) => p.userId === userId && p.status === "completed"
  ).length;
  const scenarios = (state.scenarioAttempts ?? []).filter(
    (a) => a.userId === userId
  ).length;
  const studio =
    state.employeeProfiles.find((p) => p.userId === userId)
      ?.studioSessionCount ?? 0;
  return quizzes + exams + lessons + scenarios + studio;
}
