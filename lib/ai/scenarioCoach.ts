/**
 * Scenario behavioral coach — scores against competency rubrics.
 * AI / coach evidence NEVER grants WorkAuthorization.
 */

import type { TrainingScenario } from "@/lib/types";
import { domainsForCompetency } from "@/lib/standards";

export type CoachRubricItem = {
  id: string;
  label: string;
  competencyCode: string;
  weight: number;
  passed: boolean;
  note: string;
};

export type ScenarioCoachResult = {
  scenarioId: string;
  overallScore: number;
  maxScore: number;
  percent: number;
  competencyFocus: string;
  strengths: string[];
  weaknesses: string[];
  suggestedLessonIds: string[];
  suggestedCourseIds: string[];
  rubric: CoachRubricItem[];
  managerSummary: string;
  /** Explicit product rule */
  grantsWorkAuthorization: false;
  evidenceOnly: true;
};

const SALES_RUBRIC: Omit<CoachRubricItem, "passed" | "note">[] = [
  {
    id: "needs",
    label: "نیازسنجی مناسبت و بودجه",
    competencyCode: "ARYA-SAL",
    weight: 25,
  },
  {
    id: "options",
    label: "حداکثر دو گزینه شفاف",
    competencyCode: "ARYA-SAL",
    weight: 20,
  },
  {
    id: "price_tone",
    label: "مدیریت اعتراض قیمت بدون فشار",
    competencyCode: "ARYA-SAL",
    weight: 25,
  },
  {
    id: "close",
    label: "بستن محترمانه یا توقف محترمانه",
    competencyCode: "ARYA-SAL",
    weight: 15,
  },
  {
    id: "privacy",
    label: "حفظ حریم و لحن quiet luxury",
    competencyCode: "ARYA-SAL",
    weight: 15,
  },
];

const FRAUD_RUBRIC: Omit<CoachRubricItem, "passed" | "note">[] = [
  {
    id: "observe",
    label: "شناسایی نشانه مشکوک بدون اتهام",
    competencyCode: "ARYA-INT",
    weight: 25,
  },
  {
    id: "secure",
    label: "حفظ امنیت کالا / ویترین",
    competencyCode: "ARYA-SEC",
    weight: 25,
  },
  {
    id: "escalate",
    label: "گزارش سریع به مدیر",
    competencyCode: "ARYA-INT",
    weight: 25,
  },
  {
    id: "respect",
    label: "عدم توهین به مشتری درستکار",
    competencyCode: "ARYA-INT",
    weight: 15,
  },
  {
    id: "procedure",
    label: "رعایت SOP و ثبت",
    competencyCode: "ARYA-SEC",
    weight: 10,
  },
];

function inferFocus(scenario: TrainingScenario): "ARYA-SAL" | "ARYA-INT" {
  if (scenario.type === "fraud" || scenario.category.includes("تقلب")) {
    return "ARYA-INT";
  }
  return "ARYA-SAL";
}

function tagMatches(
  tags: string[],
  needles: string[]
): boolean {
  const norm = tags.map((t) => t.toLowerCase());
  return needles.some((n) =>
    norm.some((t) => t.includes(n) || n.includes(t))
  );
}

function evaluateRubric(
  base: Omit<CoachRubricItem, "passed" | "note">[],
  strongTags: string[],
  weakTags: string[],
  percent: number
): CoachRubricItem[] {
  return base.map((item) => {
    const key = item.id;
    const relatedStrong = tagMatches(strongTags, [
      key,
      item.label.split(" ")[0] ?? key,
      "فروش",
      "نیاز",
      "قیمت",
      "امنیت",
      "گزارش",
      "احترام",
    ]);
    const relatedWeak = tagMatches(weakTags, [
      key,
      "فشار",
      "تهاجم",
      "اتها",
      "ضعف",
    ]);

    let passed = percent >= 60;
    let note = "بر اساس مسیر انتخاب‌شده ارزیابی شد.";

    if (relatedStrong && !relatedWeak) {
      passed = true;
      note = "انتخاب‌های مسیر با این معیار هم‌راستا بود.";
    } else if (relatedWeak) {
      passed = false;
      note = "در این معیار نشانه ضعف یا ریسک دیده شد.";
    } else if (percent < 50) {
      passed = false;
      note = "امتیاز کلی سناریو پایین است؛ این معیار نیاز به تمرین دارد.";
    } else if (percent >= 75) {
      passed = true;
      note = "عملکرد کلی قوی؛ این معیار قابل قبول است.";
    }

    return { ...item, passed, note };
  });
}

export function coachScenario(input: {
  scenario: TrainingScenario & { relatedLessonIds?: string[] };
  score: number;
  maxScore: number;
  strongTags: string[];
  weakTags: string[];
  pathLabels?: string[];
}): ScenarioCoachResult {
  const focus = inferFocus(input.scenario);
  const percent =
    input.maxScore <= 0
      ? 0
      : Math.round((Math.max(0, input.score) / input.maxScore) * 100);

  const base = focus === "ARYA-INT" ? FRAUD_RUBRIC : SALES_RUBRIC;
  const rubric = evaluateRubric(
    base,
    input.strongTags,
    input.weakTags,
    percent
  );

  const earned = rubric.reduce(
    (sum, r) => sum + (r.passed ? r.weight : 0),
    0
  );
  const maxRubric = rubric.reduce((sum, r) => sum + r.weight, 0);

  const strengths = [
    ...rubric.filter((r) => r.passed).map((r) => r.label),
    ...input.strongTags,
  ].filter((v, i, a) => a.indexOf(v) === i);

  const weaknesses = [
    ...rubric.filter((r) => !r.passed).map((r) => r.label),
    ...input.weakTags,
  ].filter((v, i, a) => a.indexOf(v) === i);

  const domains = domainsForCompetency(
    focus === "ARYA-INT" ? "comp_fraud" : "comp_sales"
  );
  const suggestedCourseIds = Array.from(
    new Set([
      ...input.scenario.relatedCourseIds,
      ...domains.flatMap((d) => d.relatedCourseIds),
    ])
  );
  const suggestedLessonIds = input.scenario.relatedLessonIds ?? [];

  const managerSummary = [
    `سناریو «${input.scenario.title}» — تمرکز ${focus}.`,
    `امتیاز مسیر ${percent}٪ · نمره رفتاری مربی ${earned}/${maxRubric}.`,
    strengths.length
      ? `نقاط قوت: ${strengths.slice(0, 4).join("، ")}.`
      : "نقطه قوت برجسته‌ای ثبت نشد.",
    weaknesses.length
      ? `نیاز به تمرین: ${weaknesses.slice(0, 4).join("، ")}.`
      : "ضعف جدی دیده نشد.",
    "این نتیجه فقط شواهد آموزشی است و مجوز کار صادر نمی‌کند.",
  ].join(" ");

  return {
    scenarioId: input.scenario.id,
    overallScore: earned,
    maxScore: maxRubric,
    percent: Math.round((earned / Math.max(maxRubric, 1)) * 100),
    competencyFocus: focus,
    strengths: strengths.slice(0, 6),
    weaknesses: weaknesses.slice(0, 6),
    suggestedLessonIds,
    suggestedCourseIds,
    rubric,
    managerSummary,
    grantsWorkAuthorization: false,
    evidenceOnly: true,
  };
}
