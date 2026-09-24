/**
 * Compatibility adapters so UI can talk to the richer domain model.
 */
import type {
  AppState,
  Course,
  CourseModule,
  JobRole,
  Lesson,
  PricingFormulaConfig,
  QuizQuestion,
  TrainingScenario,
} from "./types";

export interface CalculationExercise {
  weightGrams: number;
  karat: string;
  pricePerGram: number;
  makingChargePerGram: number;
  profitPercent: number;
  discountAmount?: number;
}

/** UI-facing lesson with inline content */
export type UiLesson = Lesson & {
  content: {
    type: "text" | "steps" | "mixed";
    body: string;
    steps?: string[];
    tips?: string[];
    warnings?: string[];
  };
  quizQuestionIds: string[];
  order: number;
  version: number;
};

export type UiCourse = Course & {
  academy: string;
  moduleIds: string[];
  status: "draft" | "published" | "archived";
  version: number;
  competencyIds: string[];
  examQuestionIds: string[];
  authorId: string;
  updatedAt: string;
};

export type UiScenario = TrainingScenario & {
  startStepId: string;
  steps: Array<{
    id: string;
    situation: string;
    choices: Array<{
      id: string;
      text: string;
      nextStepId?: string;
      scoreDelta: number;
      feedback: string;
      tags: string[];
    }>;
    isTerminal?: boolean;
    outcomeSummary?: string;
  }>;
  relatedLessonIds: string[];
  competencyIds: string[];
};

export type UiQuestion = Omit<QuizQuestion, "type" | "difficulty"> & {
  options?: { id: string; text: string }[];
  correctOptionIds?: string[];
  correctNumeric?: number;
  numericTolerance?: number;
  calculationPayload?: CalculationExercise;
  difficulty: "beginner" | "intermediate" | "advanced";
  competencyId?: string;
  tags: string[];
  organizationId: string;
  type: "multiple_choice" | "multiple_select" | "calculation" | string;
};

export function getModules(state: AppState): CourseModule[] {
  return state.courseModules;
}

export function getQuestions(state: AppState): UiQuestion[] {
  return state.quizQuestions.map((q) => {
    const options = state.quizOptions
      .filter((o) => o.questionId === q.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((o) => ({ id: o.id, text: o.text }));
    const correctOptionIds = state.quizOptions
      .filter((o) => o.questionId === q.id && o.isCorrect)
      .map((o) => o.id);
    return {
      ...q,
      organizationId: state.organization.id,
      options,
      correctOptionIds,
      correctNumeric: q.calculationAnswer,
      numericTolerance: q.calculationTolerance ?? 5000,
      difficulty: "intermediate",
      tags: [],
      type: q.type === "single" ? "multiple_choice" : q.type === "multiple" ? "multiple_select" : "calculation",
    } as UiQuestion;
  });
}

export function enrichCourse(state: AppState, course: Course): UiCourse {
  const moduleIds = state.courseModules
    .filter((m) => m.courseId === course.id)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((m) => m.id);
  return {
    ...course,
    academy: course.category,
    moduleIds,
    status: course.isPublished ? "published" : "draft",
    version: 1,
    competencyIds: [],
    examQuestionIds: state.quizQuestions
      .filter((q) => q.courseId === course.id)
      .map((q) => q.id),
    authorId: "user_trainer",
    updatedAt: new Date().toISOString(),
  };
}

export function enrichLesson(state: AppState, lesson: Lesson): UiLesson {
  const content = state.lessonContents.find((c) => c.lessonId === lesson.id);
  const body =
    content?.blocks.map((b) => b.body).join("\n\n") ??
    lesson.summary;
  const steps = content?.blocks.find((b) => b.type === "checklist")?.items;
  const tips = content?.blocks
    .filter((b) => b.type === "example")
    .map((b) => b.body);
  const warnings = content?.blocks
    .filter((b) => b.type === "warning")
    .map((b) => b.body);
  return {
    ...lesson,
    content: {
      type: steps?.length ? "mixed" : "text",
      body,
      steps,
      tips,
      warnings,
    },
    quizQuestionIds: state.quizQuestions
      .filter((q) => q.lessonId === lesson.id)
      .map((q) => q.id),
    order: lesson.sortOrder,
    version: 1,
  };
}

export function enrichScenario(
  state: AppState,
  scenario: TrainingScenario
): UiScenario {
  const steps = state.scenarioSteps
    .filter((s) => s.scenarioId === scenario.id)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s, idx, arr) => ({
      id: s.id,
      situation: `${s.narratorText}\n${s.prompt}`,
      choices: s.choices.map((c) => ({
        id: c.id,
        text: c.text,
        nextStepId: c.nextStepId,
        scoreDelta: c.scoreDelta,
        feedback: c.feedback,
        tags: c.isCorrect ? ["trust", "discovery"] : ["tone"],
      })),
      isTerminal: idx === arr.length - 1 || s.choices.every((c) => !c.nextStepId),
      outcomeSummary: undefined,
    }));
  return {
    ...scenario,
    startStepId: steps[0]?.id ?? "",
    steps,
    relatedLessonIds: state.lessons
      .filter((l) => scenario.relatedCourseIds.includes(l.courseId))
      .slice(0, 2)
      .map((l) => l.id),
    competencyIds: [],
  };
}

export function formulaAsExerciseConfig(
  cfg: PricingFormulaConfig
): {
  karatFactors: Record<string, number>;
  defaultMakingChargePerGram: number;
  defaultProfitPercent: number;
  roundingRule: "none" | "nearest_1000" | "nearest_10000";
  includeTaxPlaceholder: boolean;
  taxPercent: number;
} {
  return {
    karatFactors: { "18": 0.75, "21": 0.875, "24": 1 },
    defaultMakingChargePerGram: Math.round(
      (cfg.goldPricePerGram18k * cfg.makingFeePercent) / 100
    ),
    defaultProfitPercent: cfg.profitPercent,
    roundingRule: "nearest_1000",
    includeTaxPlaceholder: cfg.vatPercent > 0,
    taxPercent: cfg.vatPercent,
  };
}


export function pathForJob(
  state: AppState,
  jobRole: JobRole
): AppState["learningPaths"][0] | undefined {
  return (
    state.learningPaths.find((p) => p.targetJobRoles.includes(jobRole)) ??
    state.learningPaths[0]
  );
}

export function hasOnboardingCompleted(
  state: AppState,
  userId: string
): boolean {
  const progress = state.lessonProgress.filter(
    (p) => p.userId === userId && p.status === "completed"
  );
  return progress.length >= 1;
}
