/**
 * Integrity layer — exam/quiz/knowledge/certificate results must come from
 * graded attempts with real answers. No fabricated scores, empty-answer
 * exams, or certificates without a linked passing attempt.
 */

import type {
  AppState,
  Certificate,
  KnowledgeLevel,
  QuizAttempt,
  ExamAttempt,
} from "@/lib/types";

function hasGradedAnswers(
  answers: Array<{ questionId: string }> | undefined
): boolean {
  return Array.isArray(answers) && answers.length > 0;
}

/** Aggregate knowledge 0–100 from real quiz + exam attempts only. */
export function computeKnowledgeFromAttempts(
  state: AppState,
  userId: string
): KnowledgeLevel {
  const quizzes = (state.quizAttempts ?? []).filter(
    (a) => a.userId === userId && hasGradedAnswers(a.answers)
  );
  const exams = (state.examAttempts ?? []).filter(
    (a) => a.userId === userId && hasGradedAnswers(a.answers)
  );
  const all = [...quizzes, ...exams];
  if (all.length === 0) return 0;
  const sum = all.reduce((s, a) => s + a.score, 0);
  return Math.round(sum / all.length);
}

/** Latest scored attempt for a course (quiz or exam). */
export function latestCourseAttemptScore(
  state: AppState,
  userId: string,
  courseId: string
): number | null {
  const quizzes = (state.quizAttempts ?? []).filter(
    (a) =>
      a.userId === userId &&
      a.courseId === courseId &&
      hasGradedAnswers(a.answers)
  );
  const exams = (state.examAttempts ?? []).filter(
    (a) =>
      a.userId === userId &&
      a.courseId === courseId &&
      hasGradedAnswers(a.answers)
  );
  const all = [...quizzes, ...exams].sort((a, b) =>
    (b.submittedAt ?? "").localeCompare(a.submittedAt ?? "")
  );
  return all[0]?.score ?? null;
}

/**
 * Sync employeeCompetency.knowledgeLevel from related-course attempts.
 * Practical status / workAuthorization are NEVER touched here.
 */
export function syncCompetencyKnowledge(draft: AppState, userId?: string): void {
  const targets = userId
    ? draft.employeeCompetencies.filter((e) => e.userId === userId)
    : draft.employeeCompetencies;

  for (const ec of targets) {
    const comp = draft.competencies.find((c) => c.id === ec.competencyId);
    if (!comp) {
      ec.knowledgeLevel = 0;
      continue;
    }
    const scores = comp.relatedCourseIds
      .map((cid) => latestCourseAttemptScore(draft, ec.userId, cid))
      .filter((s): s is number => s !== null);
    ec.knowledgeLevel = scores.length
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;
  }
}

export function recomputeProfileKnowledge(
  draft: AppState,
  userId?: string
): void {
  const profiles = userId
    ? draft.employeeProfiles.filter((p) => p.userId === userId)
    : draft.employeeProfiles;
  for (const ep of profiles) {
    ep.knowledgeLevel = computeKnowledgeFromAttempts(draft, ep.userId);
  }
  syncCompetencyKnowledge(draft, userId);
}

/**
 * Strip fabricated earned results and recompute knowledge from real attempts.
 * Safe to run on every hydrate / demo reset.
 */
export function sanitizeEarnedResults(draft: AppState): {
  droppedExams: number;
  droppedQuizzes: number;
  droppedCerts: number;
} {
  const beforeExams = draft.examAttempts.length;
  draft.examAttempts = draft.examAttempts.filter((e) =>
    hasGradedAnswers(e.answers)
  );

  const beforeQuizzes = draft.quizAttempts.length;
  draft.quizAttempts = draft.quizAttempts.filter((a) =>
    hasGradedAnswers(a.answers)
  );

  const beforeCerts = draft.certificates.length;
  draft.certificates = draft.certificates.filter((c) => {
    const attemptId = c.examAttemptId;
    if (!attemptId) return false;
    const exam = draft.examAttempts.find((e) => e.id === attemptId);
    return Boolean(
      exam &&
        exam.userId === c.userId &&
        exam.courseId === c.courseId &&
        exam.passed &&
        hasGradedAnswers(exam.answers)
    );
  });

  // Align certificate scores with the linked attempt (never keep a mirrored score)
  for (const c of draft.certificates) {
    const exam = draft.examAttempts.find((e) => e.id === c.examAttemptId);
    if (exam) {
      c.knowledgeScore = exam.score;
      c.score = exam.score;
    }
  }

  recomputeProfileKnowledge(draft);

  // Streak is not earned from exams — clear fabricated marketing streaks
  for (const ep of draft.employeeProfiles) {
    if (!ep.streakDays) continue;
    const hasActivity =
      draft.lessonProgress.some(
        (p) => p.userId === ep.userId && p.status === "completed"
      ) ||
      draft.quizAttempts.some((a) => a.userId === ep.userId) ||
      draft.examAttempts.some((a) => a.userId === ep.userId);
    if (!hasActivity) ep.streakDays = 0;
  }

  return {
    droppedExams: beforeExams - draft.examAttempts.length,
    droppedQuizzes: beforeQuizzes - draft.quizAttempts.length,
    droppedCerts: beforeCerts - draft.certificates.length,
  };
}

export function buildKnowledgeCertificate(input: {
  organizationId: string;
  userId: string;
  courseId: string;
  courseTitle: string;
  examAttemptId: string;
  score: KnowledgeLevel;
  issuedByUserId: string;
  id: string;
  certificateNumber: string;
}): Certificate {
  return {
    id: input.id,
    organizationId: input.organizationId,
    userId: input.userId,
    courseId: input.courseId,
    title: `گواهی دانش — ${input.courseTitle}`,
    issuedAt: new Date().toISOString(),
    issuedByUserId: input.issuedByUserId,
    knowledgeScore: input.score,
    score: input.score,
    certificateNumber: input.certificateNumber,
    examAttemptId: input.examAttemptId,
  };
}

export type IntegrityReport = {
  userId: string;
  knowledgeLevel: KnowledgeLevel;
  quizAttempts: number;
  examAttempts: number;
  certificates: number;
  lessonCompleted: number;
  scenarioAttempts: number;
  studioSessions: number;
  fabricatedDropped: boolean;
};

export function integrityReportForUser(
  state: AppState,
  userId: string
): IntegrityReport {
  return {
    userId,
    knowledgeLevel: computeKnowledgeFromAttempts(state, userId),
    quizAttempts: (state.quizAttempts ?? []).filter(
      (a) => a.userId === userId && hasGradedAnswers(a.answers)
    ).length,
    examAttempts: (state.examAttempts ?? []).filter(
      (a) => a.userId === userId && hasGradedAnswers(a.answers)
    ).length,
    certificates: state.certificates.filter(
      (c) => c.userId === userId && Boolean(c.examAttemptId)
    ).length,
    lessonCompleted: state.lessonProgress.filter(
      (p) => p.userId === userId && p.status === "completed"
    ).length,
    scenarioAttempts: (state.scenarioAttempts ?? []).filter(
      (a) => a.userId === userId
    ).length,
    studioSessions:
      state.employeeProfiles.find((p) => p.userId === userId)
        ?.studioSessionCount ?? 0,
    fabricatedDropped: false,
  };
}

/** Type guards used by fit scoring */
export function isRealQuizAttempt(a: QuizAttempt): boolean {
  return hasGradedAnswers(a.answers);
}
export function isRealExamAttempt(a: ExamAttempt): boolean {
  return hasGradedAnswers(a.answers);
}
