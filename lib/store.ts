import { createDemoState } from "./demo-data";
import {
  assertBranchAccess,
  assertPermission,
  assertSameOrganization,
  canAssessEmployee,
  canGrantWorkAuthorization,
  getAuthContext,
} from "./permissions";
import {
  applyRemediationAction,
  findSkillGapActions,
  findSopLagActions,
  listNotFloorReady,
  remediationFromFailedQuiz,
  remediationFromWeakScenario,
} from "./remediation";
import { coachScenario } from "./ai/scenarioCoach";
import {
  LEGACY_STORAGE_KEY,
  loadPersistedState,
  savePersistedState,
  syncEvent,
} from "./backend/persistence";
import {
  buildKnowledgeCertificate,
  recomputeProfileKnowledge,
  sanitizeEarnedResults,
} from "./integrity";
import type {
  AppState,
  AssignmentStatus,
  AuditAction,
  AuditLog,
  EmployeeAssignment,
  ExamAttempt,
  KnowledgeLevel,
  LessonProgress,
  PracticalAssessment,
  PracticalStatus,
  QuizAnswer,
  QuizAttempt,
  ScenarioAttempt,
  SopAcknowledgment,
  RecommendationReason,
  TrainingRecommendation,
  TrainingScenario,
  WorkAuthorization,
} from "./types";
import type { ScenarioCoachResult } from "./ai/scenarioCoach";

const STORAGE_KEY = LEGACY_STORAGE_KEY;

type Listener = () => void;

let state: AppState = createDemoState();
let snapshot: AppState = state;
const listeners = new Set<Listener>();

function emit(): void {
  snapshot = state;
  listeners.forEach((l) => l());
}

function cloneState(s: AppState): AppState {
  return structuredClone(s);
}

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function syncAliases(draft: AppState): void {
  draft.assignments = draft.employeeAssignments;
  draft.scenarios = draft.trainingScenarios;
  draft.recommendations = draft.trainingRecommendations;
  draft.modules = draft.courseModules;
  draft.questions = draft.quizQuestions;
}

function commit(draft: AppState): void {
  syncAliases(draft);
  sanitizeEarnedResults(draft);
  state = draft;
  saveState();
  emit();
}

function appendAudit(
  draft: AppState,
  input: {
    actorUserId: string;
    action: AuditAction;
    entityType: string;
    entityId: string;
    summary: string;
    metadata?: AuditLog["metadata"];
  }
): void {
  draft.auditLogs.unshift({
    id: uid("audit"),
    organizationId: draft.organization.id,
    actorUserId: input.actorUserId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    summary: input.summary,
    metadata: input.metadata,
    createdAt: nowIso(),
  });
}

export function loadState(): AppState {
  if (typeof window === "undefined") {
    state = createDemoState();
    sanitizeEarnedResults(state);
    snapshot = state;
    return state;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      state = createDemoState();
      sanitizeEarnedResults(state);
      snapshot = state;
      void hydrateFromIndexedDb();
      return state;
    }
    const parsed = JSON.parse(raw) as AppState;
    if (!parsed.organization?.id || !Array.isArray(parsed.users)) {
      state = createDemoState();
    } else {
      state = parsed;
    }
  } catch {
    state = createDemoState();
  }
  sanitizeEarnedResults(state);
  snapshot = state;
  void hydrateFromIndexedDb();
  return state;
}

async function hydrateFromIndexedDb(): Promise<void> {
  const persisted = await loadPersistedState();
  if (!persisted?.organization?.id || !Array.isArray(persisted.users)) return;
  // Prefer IDB if it has more audit activity (newer backend writes)
  if (
    (persisted.auditLogs?.length ?? 0) >= (state.auditLogs?.length ?? 0) &&
    persisted.currentUserId
  ) {
    sanitizeEarnedResults(persisted);
    state = persisted;
    snapshot = state;
    emit();
  }
}

export function saveState(next?: AppState): void {
  if (next) {
    state = next;
    snapshot = state;
  }
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // quota / private mode — ignore
  }
  void savePersistedState(state);
}

export function getState(): AppState {
  return state;
}

export function resetToDemo(): AppState {
  state = createDemoState();
  sanitizeEarnedResults(state);
  snapshot = state;
  saveState();
  emit();
  return state;
}

export function setCurrentUser(userId: string): void {
  const user = state.users.find((u) => u.id === userId);
  if (!user) throw new Error("کاربر یافت نشد");
  const draft = cloneState(state);
  draft.currentUserId = userId;
  commit(draft);
}

/* ─── useSyncExternalStore ─── */

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): AppState {
  return snapshot;
}

export function getServerSnapshot(): AppState {
  return createDemoState();
}

/* ─── Mutations ─── */

export function completeLessonInternal(input: {
  userId: string;
  lessonId: string;
  timeSpentSeconds?: number;
}): LessonProgress {
  const draft = cloneState(state);
  const ctx = getAuthContext(draft, input.userId);
  if (!ctx) throw new Error("کاربر معتبر نیست");
  assertPermission(ctx, "progress:view_own");

  const lesson = draft.lessons.find((l) => l.id === input.lessonId);
  if (!lesson) throw new Error("درس یافت نشد");

  const existing = draft.lessonProgress.find(
    (p) => p.userId === input.userId && p.lessonId === input.lessonId
  );

  const completedAt = nowIso();
  let record: LessonProgress;

  if (existing) {
    existing.status = "completed";
    existing.completedAt = completedAt;
    existing.updatedAt = completedAt;
    existing.percent = 100;
    existing.timeSpentSeconds += input.timeSpentSeconds ?? 0;
    if (!existing.startedAt) existing.startedAt = completedAt;
    record = existing;
  } else {
    record = {
      id: uid("lp"),
      organizationId: draft.organization.id,
      userId: input.userId,
      lessonId: input.lessonId,
      courseId: lesson.courseId,
      status: "completed",
      startedAt: completedAt,
      completedAt,
      updatedAt: completedAt,
      timeSpentSeconds: input.timeSpentSeconds ?? 0,
      percent: 100,
    };
    draft.lessonProgress.push(record);
  }

  appendAudit(draft, {
    actorUserId: input.userId,
    action: "lesson_complete",
    entityType: "lesson_progress",
    entityId: record.id,
    summary: `تکمیل درس ${lesson.title}`,
  });

  refreshRecommendationsForUser(draft, input.userId);
  commit(draft);
  return record;
}

export function startLesson(input: {
  userId: string;
  lessonId: string;
}): LessonProgress {
  const draft = cloneState(state);
  const lesson = draft.lessons.find((l) => l.id === input.lessonId);
  if (!lesson) throw new Error("درس یافت نشد");

  let record = draft.lessonProgress.find(
    (p) => p.userId === input.userId && p.lessonId === input.lessonId
  );
  if (!record) {
    record = {
      id: uid("lp"),
      organizationId: draft.organization.id,
      userId: input.userId,
      lessonId: input.lessonId,
      courseId: lesson.courseId,
      status: "in_progress",
      startedAt: nowIso(),
      updatedAt: nowIso(),
      timeSpentSeconds: 0,
      percent: 0,
    };
    draft.lessonProgress.push(record);
  } else if (record.status === "not_started") {
    record.status = "in_progress";
    record.startedAt = nowIso();
  }

  commit(draft);
  return record;
}

function gradeAnswers(
  draft: AppState,
  answers: Array<{
    questionId: string;
    selectedOptionIds: string[];
    numericAnswer?: number;
  }>
): { graded: QuizAnswer[]; score: number; maxScore: number } {
  let score = 0;
  let maxScore = 0;
  const graded: QuizAnswer[] = answers.map((a) => {
    const q = draft.quizQuestions.find((x) => x.id === a.questionId);
    if (!q) {
      return {
        questionId: a.questionId,
        selectedOptionIds: a.selectedOptionIds,
        numericAnswer: a.numericAnswer,
        isCorrect: false,
        pointsEarned: 0,
      };
    }
    maxScore += q.points;
    let isCorrect = false;
    if (q.type === "calculation") {
      const expected = q.calculationAnswer ?? 0;
      const tolerance = q.calculationTolerance ?? 0;
      const actual = a.numericAnswer ?? NaN;
      isCorrect =
        Number.isFinite(actual) && Math.abs(expected - actual) <= tolerance;
    } else {
      const correctIds = draft.quizOptions
        .filter((o) => o.questionId === q.id && o.isCorrect)
        .map((o) => o.id)
        .sort();
      const selected = [...a.selectedOptionIds].sort();
      isCorrect =
        correctIds.length === selected.length &&
        correctIds.every((id, i) => id === selected[i]);
    }
    const pointsEarned = isCorrect ? q.points : 0;
    score += pointsEarned;
    return {
      questionId: a.questionId,
      selectedOptionIds: a.selectedOptionIds,
      numericAnswer: a.numericAnswer,
      isCorrect,
      pointsEarned,
    };
  });
  return { graded, score, maxScore };
}

/**
 * Submit quiz — updates KnowledgeLevel only.
 * Does NOT change WorkAuthorization.
 */
export function submitQuizAttempt(input: {
  userId: string;
  courseId: string;
  lessonId?: string;
  answers: Array<{
    questionId: string;
    selectedOptionIds: string[];
    numericAnswer?: number;
  }>;
}): QuizAttempt {
  const draft = cloneState(state);
  const ctx = getAuthContext(draft, input.userId);
  if (!ctx) throw new Error("کاربر معتبر نیست");
  assertPermission(ctx, "quiz:take");
  assertSameOrganization(ctx, draft.organization.id);

  const { graded, score, maxScore } = gradeAnswers(draft, input.answers);
  const pct: KnowledgeLevel =
    maxScore === 0 ? 0 : Math.round((score / maxScore) * 100);
  const passing = draft.organization.settings.defaultPassingScore;

  const attempt: QuizAttempt = {
    id: uid("quiz"),
    organizationId: draft.organization.id,
    userId: input.userId,
    courseId: input.courseId,
    lessonId: input.lessonId,
    startedAt: nowIso(),
    submittedAt: nowIso(),
    score: pct,
    maxScore: 100,
    passed: pct >= passing,
    answers: graded,
  };
  draft.quizAttempts.push(attempt);

  // Knowledge only from graded attempts — never blend with fabricated seed
  recomputeProfileKnowledge(draft, input.userId);

  appendAudit(draft, {
    actorUserId: input.userId,
    action: "quiz_submit",
    entityType: "quiz_attempt",
    entityId: attempt.id,
    summary: `ثبت آزمون دانش با نمره ${pct} از ${graded.length} سؤال واقعی — بدون تغییر مجوز کار`,
    metadata: { score: pct, workAuthorizationUnchanged: true, answerCount: graded.length },
  });

  if (!attempt.passed) {
    applyRemediationAction(
      draft,
      remediationFromFailedQuiz({
        userId: input.userId,
        courseId: input.courseId,
        score: pct,
      }),
      input.userId
    );
    void syncEvent({
      type: "quiz_fail",
      userId: input.userId,
      at: nowIso(),
      payload: { courseId: input.courseId, score: pct },
    });
  }

  refreshRecommendationsForUser(draft, input.userId);
  commit(draft);
  return attempt;
}

/**
 * Submit exam — KnowledgeLevel only.
 * WorkAuthorization is never granted from exam score.
 */
export function submitExamAttempt(input: {
  userId: string;
  courseId: string;
  answers: Array<{
    questionId: string;
    selectedOptionIds: string[];
    numericAnswer?: number;
  }>;
}): ExamAttempt {
  const draft = cloneState(state);
  const ctx = getAuthContext(draft, input.userId);
  if (!ctx) throw new Error("کاربر معتبر نیست");
  assertPermission(ctx, "exam:take");

  const { graded, score, maxScore } = gradeAnswers(draft, input.answers);
  const pct: KnowledgeLevel =
    maxScore === 0 ? 0 : Math.round((score / maxScore) * 100);
  const passing = draft.organization.settings.defaultPassingScore;

  const attempt: ExamAttempt = {
    id: uid("exam"),
    organizationId: draft.organization.id,
    userId: input.userId,
    courseId: input.courseId,
    startedAt: nowIso(),
    submittedAt: nowIso(),
    score: pct,
    maxScore: 100,
    passed: pct >= passing,
    answers: graded,
  };
  draft.examAttempts.push(attempt);

  recomputeProfileKnowledge(draft, input.userId);

  // Issue knowledge certificate only on real pass with graded answers
  if (attempt.passed && graded.length > 0) {
    const course = draft.courses.find((c) => c.id === input.courseId);
    const existing = draft.certificates.find(
      (c) =>
        c.userId === input.userId &&
        c.courseId === input.courseId &&
        c.examAttemptId
    );
    if (!existing) {
      const cert = buildKnowledgeCertificate({
        id: uid("cert"),
        organizationId: draft.organization.id,
        userId: input.userId,
        courseId: input.courseId,
        courseTitle: course?.title ?? input.courseId,
        examAttemptId: attempt.id,
        score: pct,
        issuedByUserId: input.userId,
        certificateNumber: `ARYA-${Date.now().toString(36).toUpperCase()}`,
      });
      draft.certificates.push(cert);
      appendAudit(draft, {
        actorUserId: input.userId,
        action: "certificate_issue",
        entityType: "certificate",
        entityId: cert.id,
        summary: `صدور گواهی دانش از آزمون واقعی نمره ${pct}٪`,
        metadata: { examAttemptId: attempt.id, score: pct },
      });
    } else {
      // Refresh score from this newer attempt
      existing.knowledgeScore = pct;
      existing.score = pct;
      existing.examAttemptId = attempt.id;
      existing.issuedAt = nowIso();
    }
  }

  appendAudit(draft, {
    actorUserId: input.userId,
    action: "exam_submit",
    entityType: "exam_attempt",
    entityId: attempt.id,
    summary: `ثبت آزمون پایانی با نمره ${pct} از ${graded.length} سؤال واقعی — مجوز کار تغییر نکرد`,
    metadata: {
      score: pct,
      authorizationGranted: false,
      answerCount: graded.length,
      certificateIssued: attempt.passed && graded.length > 0,
    },
  });

  if (!attempt.passed) {
    applyRemediationAction(
      draft,
      remediationFromFailedQuiz({
        userId: input.userId,
        courseId: input.courseId,
        score: pct,
      }),
      input.userId
    );
    void syncEvent({
      type: "quiz_fail",
      userId: input.userId,
      at: nowIso(),
      payload: { courseId: input.courseId, score: pct, kind: "exam" },
    });
  }

  refreshRecommendationsForUser(draft, input.userId);
  commit(draft);
  return attempt;
}

export function acknowledgeSopInternal(input: {
  userId: string;
  sopId: string;
}): SopAcknowledgment {
  const draft = cloneState(state);
  const ctx = getAuthContext(draft, input.userId);
  if (!ctx) throw new Error("کاربر معتبر نیست");
  assertPermission(ctx, "sop:acknowledge");

  const sop = draft.sops.find((s) => s.id === input.sopId);
  if (!sop || sop.organizationId !== draft.organization.id) {
    throw new Error("دستورالعمل یافت نشد");
  }

  const existing = draft.sopAcknowledgments.find(
    (a) =>
      a.userId === input.userId &&
      a.sopId === input.sopId &&
      a.sopVersionId === sop.currentVersionId
  );
  if (existing) return existing;

  const ack: SopAcknowledgment = {
    id: uid("sa"),
    organizationId: draft.organization.id,
    sopId: input.sopId,
    sopVersionId: sop.currentVersionId,
    versionId: sop.currentVersionId,
    userId: input.userId,
    acknowledgedAt: nowIso(),
  };
  draft.sopAcknowledgments.push(ack);

  appendAudit(draft, {
    actorUserId: input.userId,
    action: "sop_acknowledge",
    entityType: "sop_acknowledgment",
    entityId: ack.id,
    summary: `تأیید مطالعه SOP: ${sop.title}`,
  });

  commit(draft);
  return ack;
}

/**
 * ONLY path that may set WorkAuthorization.
 * Requires practical:assess; exam scores are ignored.
 */
export function recordPracticalAssessment(input: {
  assessorUserId: string;
  employeeUserId: string;
  competencyId: string;
  practicalStatus: PracticalStatus;
  workAuthorization: WorkAuthorization;
  notes: string;
  evidenceChecklist: string[];
  score?: number;
}): PracticalAssessment {
  const draft = cloneState(state);
  const ctx = getAuthContext(draft, input.assessorUserId);
  if (!ctx) throw new Error("ارزیاب معتبر نیست");

  if (!canGrantWorkAuthorization(ctx)) {
    throw new Error("فقط مدیر/مالک می‌تواند مجوز کار صادر کند");
  }
  assertPermission(ctx, "practical:assess");

  const target = draft.users.find((u) => u.id === input.employeeUserId);
  if (!target) throw new Error("کارمند یافت نشد");
  assertSameOrganization(ctx, target.organizationId);
  if (!canAssessEmployee(ctx, target)) {
    throw new Error("ارزیابی این کارمند در شعبه شما مجاز نیست");
  }
  assertBranchAccess(ctx, target.branchId);

  // Guard: never accept authorization derived from a knowledge score argument
  const assessment: PracticalAssessment = {
    id: uid("pa"),
    organizationId: draft.organization.id,
    employeeUserId: input.employeeUserId,
    competencyId: input.competencyId,
    assessorUserId: input.assessorUserId,
    assessedAt: nowIso(),
    practicalStatus: input.practicalStatus,
    workAuthorization: input.workAuthorization,
    score: input.score,
    notes: input.notes,
    evidenceChecklist: input.evidenceChecklist,
  };
  draft.practicalAssessments.push(assessment);

  const profile = draft.employeeProfiles.find(
    (p) => p.userId === input.employeeUserId
  );
  if (profile) {
    profile.practicalStatus = input.practicalStatus;
    profile.workAuthorization = input.workAuthorization;
  }

  let ec = draft.employeeCompetencies.find(
    (c) =>
      c.userId === input.employeeUserId &&
      c.competencyId === input.competencyId
  );
  if (!ec) {
    ec = {
      id: uid("ec"),
      organizationId: draft.organization.id,
      userId: input.employeeUserId,
      competencyId: input.competencyId,
      knowledgeLevel: profile?.knowledgeLevel ?? 0,
      practicalStatus: input.practicalStatus,
      workAuthorization: input.workAuthorization,
      lastAssessedAt: assessment.assessedAt,
      assessedByUserId: input.assessorUserId,
    };
    draft.employeeCompetencies.push(ec);
  } else {
    ec.practicalStatus = input.practicalStatus;
    ec.workAuthorization = input.workAuthorization;
    ec.lastAssessedAt = assessment.assessedAt;
    ec.assessedByUserId = input.assessorUserId;
  }

  appendAudit(draft, {
    actorUserId: input.assessorUserId,
    action: "practical_assess",
    entityType: "practical_assessment",
    entityId: assessment.id,
    summary: `ارزیابی عملی و صدور مجوز کار: ${input.workAuthorization}`,
    metadata: {
      workAuthorization: input.workAuthorization,
      practicalStatus: input.practicalStatus,
      source: "practical_assessment_only",
    },
  });

  appendAudit(draft, {
    actorUserId: input.assessorUserId,
    action: "authorization_change",
    entityType: "employee_profile",
    entityId: profile?.id ?? input.employeeUserId,
    summary: `تغییر مجوز کار به «${input.workAuthorization}» صرفاً بر اساس ارزیابی عملی`,
    metadata: { fromExam: false },
  });

  refreshRecommendationsForUser(draft, input.employeeUserId);
  void syncEvent({
    type: "practical_evidence",
    userId: input.employeeUserId,
    at: nowIso(),
    payload: {
      competencyId: input.competencyId,
      workAuthorization: input.workAuthorization,
      assessorUserId: input.assessorUserId,
    },
  });
  commit(draft);
  return assessment;
}

export function createAssignment(input: {
  assignedByUserId: string;
  employeeUserId: string;
  courseId?: string;
  learningPathId?: string;
  dueDate?: string;
  priority?: EmployeeAssignment["priority"];
}): EmployeeAssignment {
  const draft = cloneState(state);
  const ctx = getAuthContext(draft, input.assignedByUserId);
  if (!ctx) throw new Error("کاربر معتبر نیست");
  assertPermission(ctx, "assignment:manage");

  const target = draft.users.find((u) => u.id === input.employeeUserId);
  if (!target) throw new Error("کارمند یافت نشد");
  assertSameOrganization(ctx, target.organizationId);

  const assignment: EmployeeAssignment = {
    id: uid("asg"),
    organizationId: draft.organization.id,
    employeeUserId: input.employeeUserId,
    courseId: input.courseId,
    learningPathId: input.learningPathId,
    assignedByUserId: input.assignedByUserId,
    assignedAt: nowIso(),
    dueDate: input.dueDate,
    status: "assigned",
    priority: input.priority ?? "medium",
    isMandatory: true,
  };
  draft.employeeAssignments.push(assignment);

  draft.notifications.unshift({
    id: uid("ntf"),
    organizationId: draft.organization.id,
    userId: input.employeeUserId,
    type: "assignment",
    title: "تکلیف آموزشی جدید",
    body: "یک دوره یا مسیر یادگیری جدید به شما اختصاص داده شد.",
    href: "/employee/courses",
    createdAt: nowIso(),
    read: false,
  });

  appendAudit(draft, {
    actorUserId: input.assignedByUserId,
    action: "assignment_create",
    entityType: "employee_assignment",
    entityId: assignment.id,
    summary: "ایجاد تکلیف آموزشی",
  });

  commit(draft);
  return assignment;
}

export function updateAssignmentStatus(
  assignmentId: string,
  status: AssignmentStatus,
  actorUserId: string
): void {
  const draft = cloneState(state);
  const asg = draft.employeeAssignments.find((a) => a.id === assignmentId);
  if (!asg) throw new Error("تکلیف یافت نشد");
  asg.status = status;
  appendAudit(draft, {
    actorUserId,
    action: "assignment_create",
    entityType: "employee_assignment",
    entityId: assignmentId,
    summary: `وضعیت تکلیف به ${status} تغییر کرد`,
  });
  commit(draft);
}

export function completeScenarioAttempt(input: {
  userId: string;
  scenarioId: string;
  pathTaken: string[];
  score: number;
  maxScore: number;
  succeeded: boolean;
}): ScenarioAttempt {
  const draft = cloneState(state);
  const attempt: ScenarioAttempt = {
    id: uid("scatt"),
    organizationId: draft.organization.id,
    userId: input.userId,
    scenarioId: input.scenarioId,
    startedAt: nowIso(),
    completedAt: nowIso(),
    score: input.score,
    maxScore: input.maxScore,
    pathTaken: input.pathTaken,
    succeeded: input.succeeded,
  };
  draft.scenarioAttempts.push(attempt);

  appendAudit(draft, {
    actorUserId: input.userId,
    action: "scenario_complete",
    entityType: "scenario_attempt",
    entityId: attempt.id,
    summary: `تکمیل سناریو آموزشی — امتیاز ${input.score}`,
  });

  commit(draft);
  return attempt;
}

export function markNotificationReadInternal(notificationId: string, userId: string): void {
  const draft = cloneState(state);
  const n = draft.notifications.find(
    (x) => x.id === notificationId && x.userId === userId
  );
  if (n && !n.readAt) {
    n.readAt = nowIso();
    n.read = true;
    commit(draft);
  }
}

export function updatePricingConfig(
  actorUserId: string,
  patch: Partial<{
    goldPricePerGram18k: number;
    makingFeePercent: number;
    profitPercent: number;
    vatPercent: number;
    fixedFee: number;
    name: string;
  }>
): void {
  const draft = cloneState(state);
  const ctx = getAuthContext(draft, actorUserId);
  if (!ctx) throw new Error("کاربر معتبر نیست");
  assertPermission(ctx, "pricing:configure");

  draft.pricingFormulaConfig = {
    ...draft.pricingFormulaConfig,
    ...patch,
    updatedAt: nowIso(),
    updatedByUserId: actorUserId,
  };

  appendAudit(draft, {
    actorUserId,
    action: "config_update",
    entityType: "pricing_formula_config",
    entityId: draft.pricingFormulaConfig.id,
    summary: "به‌روزرسانی فرمول قیمت طلا",
  });

  commit(draft);
}

/* ─── Skill gap + recommendation engines ─── */

export interface SkillGap {
  userId: string;
  competencyId: string;
  competencyTitle: string;
  knowledgeLevel: KnowledgeLevel;
  practicalStatus: PracticalStatus;
  workAuthorization: WorkAuthorization;
  gapType: "knowledge" | "practical" | "authorization" | "missing";
  severity: "low" | "medium" | "high";
  suggestedCourseIds: string[];
  message: string;
}

const KNOWLEDGE_THRESHOLD = 70;

export function computeSkillGaps(
  appState: AppState,
  userId: string
): SkillGap[] {
  const profile = appState.employeeProfiles.find((p) => p.userId === userId);
  if (!profile) return [];

  const relevant = appState.competencies.filter(
    (c) =>
      c.organizationId === appState.organization.id &&
      c.relatedJobRoles.includes(profile.jobRole)
  );

  const gaps: SkillGap[] = [];

  for (const comp of relevant) {
    const ec = appState.employeeCompetencies.find(
      (e) => e.userId === userId && e.competencyId === comp.id
    );

    if (!ec) {
      gaps.push({
        userId,
        competencyId: comp.id,
        competencyTitle: comp.title,
        knowledgeLevel: 0,
        practicalStatus: "not_evaluated",
        workAuthorization: "none",
        gapType: "missing",
        severity: "high",
        suggestedCourseIds: comp.relatedCourseIds,
        message: `شایستگی «${comp.title}» هنوز ثبت نشده است.`,
      });
      continue;
    }

    if (ec.knowledgeLevel < KNOWLEDGE_THRESHOLD) {
      gaps.push({
        userId,
        competencyId: comp.id,
        competencyTitle: comp.title,
        knowledgeLevel: ec.knowledgeLevel,
        practicalStatus: ec.practicalStatus,
        workAuthorization: ec.workAuthorization,
        gapType: "knowledge",
        severity: ec.knowledgeLevel < 50 ? "high" : "medium",
        suggestedCourseIds: comp.relatedCourseIds,
        message: `نمره دانش «${comp.title}» زیر حد نصاب (${KNOWLEDGE_THRESHOLD}) است.`,
      });
    }

    if (
      ec.practicalStatus === "not_evaluated" ||
      ec.practicalStatus === "training_required"
    ) {
      gaps.push({
        userId,
        competencyId: comp.id,
        competencyTitle: comp.title,
        knowledgeLevel: ec.knowledgeLevel,
        practicalStatus: ec.practicalStatus,
        workAuthorization: ec.workAuthorization,
        gapType: "practical",
        severity: "high",
        suggestedCourseIds: comp.relatedCourseIds,
        message: `وضعیت عملی «${comp.title}» نیاز به آموزش یا ارزیابی دارد.`,
      });
    }

    if (ec.workAuthorization === "none") {
      gaps.push({
        userId,
        competencyId: comp.id,
        competencyTitle: comp.title,
        knowledgeLevel: ec.knowledgeLevel,
        practicalStatus: ec.practicalStatus,
        workAuthorization: ec.workAuthorization,
        gapType: "authorization",
        severity: "high",
        suggestedCourseIds: comp.relatedCourseIds,
        message: `مجوز کار برای «${comp.title}» صادر نشده — فقط با ارزیابی عملی مدیر قابل صدور است.`,
      });
    } else if (ec.workAuthorization === "supervised_only") {
      gaps.push({
        userId,
        competencyId: comp.id,
        competencyTitle: comp.title,
        knowledgeLevel: ec.knowledgeLevel,
        practicalStatus: ec.practicalStatus,
        workAuthorization: ec.workAuthorization,
        gapType: "authorization",
        severity: "medium",
        suggestedCourseIds: comp.relatedCourseIds,
        message: `مجوز «${comp.title}» فقط تحت نظارت است.`,
      });
    }
  }

  return gaps;
}

function refreshRecommendationsForUser(draft: AppState, userId: string): void {
  const gaps = computeSkillGaps(draft, userId);
  const fresh: TrainingRecommendation[] = [];

  for (const gap of gaps) {
    if (gap.severity === "low") continue;
    const courseId = gap.suggestedCourseIds[0];
    const reason: RecommendationReason =
      gap.gapType === "authorization"
        ? "low_authorization"
        : gap.gapType === "knowledge"
          ? "skill_gap"
          : gap.gapType === "missing"
            ? "new_hire"
            : "skill_gap";

    const already = draft.trainingRecommendations.some(
      (r) =>
        r.userId === userId &&
        r.competencyId === gap.competencyId &&
        r.reasonCode === reason &&
        !r.dismissed
    );
    if (already) continue;

    const reasonLabels: Record<string, string> = {
      skill_gap: "شکاف مهارتی",
      new_hire: "نیروی تازه‌وارد",
      low_authorization: "مجوز کار ناکافی",
      failed_quiz: "نتیجه ضعیف آزمون",
      role_required: "الزام نقش شغلی",
      expired_sop: "دستورالعمل منقضی",
      manager_assigned: "تکلیف مدیر",
    };
    fresh.push({
      id: uid("rec"),
      organizationId: draft.organization.id,
      userId,
      courseId,
      competencyId: gap.competencyId,
      reason: reasonLabels[reason] ?? gap.message,
      reasonCode: reason,
      priority: gap.severity,
      message: gap.message,
      estimatedMinutes: 60,
      createdAt: nowIso(),
      dismissed: false,
    });
  }

  // Keep dismissed + unrelated; add new
  draft.trainingRecommendations = [
    ...fresh,
    ...draft.trainingRecommendations.filter(
      (r) => r.userId !== userId || r.dismissed
    ),
    ...draft.trainingRecommendations.filter(
      (r) =>
        r.userId === userId &&
        !r.dismissed &&
        !fresh.some(
          (f) => f.competencyId === r.competencyId && f.reasonCode === r.reasonCode
        )
    ),
  ];
}

export function generateRecommendations(userId: string): TrainingRecommendation[] {
  const draft = cloneState(state);
  refreshRecommendationsForUser(draft, userId);
  commit(draft);
  return draft.trainingRecommendations.filter(
    (r) => r.userId === userId && !r.dismissed
  );
}

export function dismissRecommendation(recommendationId: string, userId: string): void {
  const draft = cloneState(state);
  const rec = draft.trainingRecommendations.find(
    (r) => r.id === recommendationId && r.userId === userId
  );
  if (rec) {
    rec.dismissed = true;
    commit(draft);
  }
}

export function getCourseProgressPercent(
  appState: AppState,
  userId: string,
  courseId: string
): number {
  const courseLessons = appState.lessons.filter((l) => l.courseId === courseId);
  if (courseLessons.length === 0) return 0;
  const done = courseLessons.filter((l) =>
    appState.lessonProgress.some(
      (p) =>
        p.userId === userId &&
        p.lessonId === l.id &&
        p.status === "completed"
    )
  ).length;
  return Math.round((done / courseLessons.length) * 100);
}


export const courseProgressPercent = getCourseProgressPercent;

export function getTodayDaily(appState: AppState = state) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    appState.dailyTraining.find((d) => d.date === today) ??
    appState.dailyTraining[0] ??
    null
  );
}

export function setTheme(theme: AppState["theme"]): void {
  const draft = cloneState(state);
  draft.theme = theme;
  commit(draft);
}

export const resetDemo = resetToDemo;

/** Convenience wrappers matching UI call sites */
export function submitQuiz(input: {
  userId?: string;
  courseId?: string;
  lessonId?: string;
  questionIds?: string[];
  answers:
    | Record<string, string | number>
    | Array<{
        questionId: string;
        selectedOptionIds: string[];
        numericAnswer?: number;
      }>;
  context?: string;
}): QuizAttempt {
  const userId = input.userId ?? state.currentUserId;
  const normalized = Array.isArray(input.answers)
    ? input.answers
    : Object.entries(input.answers).map(([questionId, value]) => {
        if (typeof value === "number") {
          return { questionId, selectedOptionIds: [] as string[], numericAnswer: value };
        }
        return { questionId, selectedOptionIds: [value], numericAnswer: undefined };
      });
  const courseId =
    input.courseId ??
    state.quizQuestions.find((q) => q.id === normalized[0]?.questionId)?.courseId ??
    "course_03";
  return submitQuizAttempt({
    userId,
    courseId,
    lessonId: input.lessonId,
    answers: normalized,
  });
}

export function submitExam(input: {
  userId?: string;
  courseId: string;
  questionIds?: string[];
  answers:
    | Record<string, string | number>
    | Array<{
        questionId: string;
        selectedOptionIds: string[];
        numericAnswer?: number;
      }>;
  examType?: string;
}): { score: number; passed: boolean } {
  const userId = input.userId ?? state.currentUserId;
  const normalized = Array.isArray(input.answers)
    ? input.answers
    : Object.entries(input.answers).map(([questionId, value]) => {
        if (typeof value === "number") {
          return { questionId, selectedOptionIds: [] as string[], numericAnswer: value };
        }
        return { questionId, selectedOptionIds: [value], numericAnswer: undefined };
      });
  const attempt = submitExamAttempt({
    userId,
    courseId: input.courseId,
    answers: normalized,
  });
  return { score: attempt.score, passed: attempt.passed };
}

export function saveLessonProgress(
  lessonIdOrInput: string | { userId: string; lessonId: string; timeSpentSeconds?: number },
  percentOrUserId?: string | number
): LessonProgress {
  if (typeof lessonIdOrInput === "string") {
    const userId =
      typeof percentOrUserId === "string" ? percentOrUserId : state.currentUserId;
    // percent is ignored for completion path; start or complete based on value
    if (typeof percentOrUserId === "number" && percentOrUserId < 100) {
      return startLesson({ userId, lessonId: lessonIdOrInput });
    }
    return completeLessonInternal({ userId, lessonId: lessonIdOrInput });
  }
  return completeLessonInternal(lessonIdOrInput);
}

/** Ensure browser state is hydrated once on client */
let hydrated = false;
export function ensureHydrated(): void {
  if (hydrated) return;
  if (typeof window === "undefined") return;
  loadState();
  hydrated = true;
}


export function completeLesson(
  lessonIdOrInput: string | { userId: string; lessonId: string; timeSpentSeconds?: number }
): LessonProgress {
  if (typeof lessonIdOrInput === "string") {
    return completeLessonInternal({
      userId: state.currentUserId,
      lessonId: lessonIdOrInput,
    });
  }
  return completeLessonInternal(lessonIdOrInput);
}

/* ─── UI convenience adapters ─── */

export function assignCourse(input: {
  employeeUserId: string;
  courseId: string;
  reason: string;
  isMandatory: boolean;
}): void {
  createAssignment({
    assignedByUserId: state.currentUserId,
    employeeUserId: input.employeeUserId,
    courseId: input.courseId,
    priority: "high",
  });
}

export function submitScenario(input: {
  scenarioId: string;
  path: { stepId: string; choiceId: string }[];
  score: number;
  maxScore: number;
  strongTags: string[];
  weakTags: string[];
}): { attempt: ScenarioAttempt; coach: ScenarioCoachResult } {
  const draft = cloneState(state);
  const scenario = draft.trainingScenarios.find((s) => s.id === input.scenarioId);
  const percent =
    input.maxScore <= 0
      ? 0
      : Math.round((Math.max(0, input.score) / input.maxScore) * 100);
  const succeeded = percent >= 60;

  const attempt: ScenarioAttempt = {
    id: uid("scatt"),
    organizationId: draft.organization.id,
    userId: draft.currentUserId,
    scenarioId: input.scenarioId,
    startedAt: nowIso(),
    completedAt: nowIso(),
    score: input.score,
    maxScore: input.maxScore,
    pathTaken: input.path.map((p) => `${p.stepId}:${p.choiceId}`),
    succeeded,
  };
  draft.scenarioAttempts.push(attempt);

  const coach = scenario
    ? coachScenario({
        scenario,
        score: input.score,
        maxScore: input.maxScore,
        strongTags: input.strongTags,
        weakTags: input.weakTags,
      })
    : ({
        scenarioId: input.scenarioId,
        overallScore: 0,
        maxScore: 100,
        percent: 0,
        competencyFocus: "ARYA-SAL",
        strengths: input.strongTags,
        weaknesses: input.weakTags,
        suggestedLessonIds: [],
        suggestedCourseIds: [],
        rubric: [],
        managerSummary: "سناریو یافت نشد.",
        grantsWorkAuthorization: false,
        evidenceOnly: true,
      } satisfies ScenarioCoachResult);

  appendAudit(draft, {
    actorUserId: draft.currentUserId,
    action: "scenario_complete",
    entityType: "scenario_attempt",
    entityId: attempt.id,
    summary: `تکمیل سناریو — امتیاز ${percent}٪ · مربی ${coach.percent}٪ (فقط شواهد، بدون مجوز کار)`,
    metadata: {
      score: percent,
      coachPercent: coach.percent,
      grantsWorkAuthorization: false,
    },
  });

  if (coach.percent < 60 || percent < 60) {
    applyRemediationAction(
      draft,
      remediationFromWeakScenario({
        userId: draft.currentUserId,
        scenarioId: input.scenarioId,
        courseId: coach.suggestedCourseIds[0] ?? scenario?.relatedCourseIds[0],
        percent: Math.min(coach.percent, percent),
        focusCode: coach.competencyFocus,
      }),
      draft.currentUserId
    );
  }

  void syncEvent({
    type: "scenario_coach",
    userId: draft.currentUserId,
    at: nowIso(),
    payload: {
      scenarioId: input.scenarioId,
      coachPercent: coach.percent,
      grantsWorkAuthorization: false,
    },
  });

  refreshRecommendationsForUser(draft, draft.currentUserId);
  commit(draft);
  return { attempt, coach };
}

/** Run SOP-lag + skill-gap remediation sweep (manager dashboard / cron-like) */
export function runSopRemediationSweep(actorUserId: string): number {
  const draft = cloneState(state);
  const actions = [
    ...findSopLagActions(draft),
    ...findSkillGapActions(draft),
  ];
  let applied = 0;
  for (const action of actions) {
    const beforeAsg = draft.employeeAssignments.length;
    const beforeNtf = draft.notifications.length;
    applyRemediationAction(draft, action, actorUserId);
    if (
      draft.employeeAssignments.length > beforeAsg ||
      draft.notifications.length > beforeNtf
    ) {
      applied += 1;
    }
  }
  if (applied > 0) {
    appendAudit(draft, {
      actorUserId,
      action: "assignment_create",
      entityType: "remediation",
      entityId: uid("rem"),
      summary: `جارو remediation: ${applied} اقدام (SOP / شکاف دانش) — بدون تغییر مجوز کار`,
    });
    void syncEvent({
      type: "remediation",
      userId: actorUserId,
      at: nowIso(),
      payload: { applied, totalCandidates: actions.length },
    });
    commit(draft);
  }
  return applied;
}

export function getFloorReadiness(appState: AppState = state) {
  return listNotFloorReady(appState);
}

export function getScenarioCoachPreview(
  scenario: TrainingScenario,
  score: number,
  maxScore: number,
  strongTags: string[],
  weakTags: string[]
): ScenarioCoachResult {
  return coachScenario({ scenario, score, maxScore, strongTags, weakTags });
}

export function searchContent(query: string, appState: AppState = state) {
  const q = query.trim();
  if (!q) return { courses: [], lessons: [], sops: [], terms: [] as string[] };
  return {
    courses: appState.courses.filter(
      (c) => c.title.includes(q) || c.description.includes(q)
    ),
    lessons: appState.lessons.filter(
      (l) => l.title.includes(q) || l.summary.includes(q)
    ),
    sops: appState.sops.filter(
      (s) => s.title.includes(q) || s.category.includes(q)
    ),
    terms: [] as string[],
  };
}

export function completeOnboarding(profile: {
  fullName: string;
  phone: string;
  branchId: string;
  jobRole: import("./types").JobRole;
  experienceLevel: string;
  previousJewelryExperience: boolean;
  hireDate: string;
  learningPathId?: string;
}): void {
  const draft = cloneState(state);
  const user = draft.users.find((u) => u.id === draft.currentUserId);
  const ep = draft.employeeProfiles.find((e) => e.userId === draft.currentUserId);
  if (user) {
    user.fullName = profile.fullName;
    user.phone = profile.phone;
    user.branchId = profile.branchId;
  }
  if (ep) {
    ep.branchId = profile.branchId;
    ep.jobRole = profile.jobRole;
    ep.hireDate = profile.hireDate;
    const path =
      (profile.learningPathId
        ? draft.learningPaths.find((p) => p.id === profile.learningPathId)
        : undefined) ??
      draft.learningPaths.find((p) =>
        p.targetJobRoles.includes(profile.jobRole)
      );
    ep.learningPathId = path?.id;
  }
  commit(draft);
}

/** Overload: acknowledgeSop(sopId) or acknowledgeSop({userId,sopId}) */
export function acknowledgeSop(
  sopIdOrInput: string | { userId: string; sopId: string }
): SopAcknowledgment | void {
  if (typeof sopIdOrInput === "string") {
    return acknowledgeSopInternal({ userId: state.currentUserId, sopId: sopIdOrInput });
  }
  return acknowledgeSopInternal(sopIdOrInput);
}

export function recordPracticalAssessmentFromUi(input: {
  userId: string;
  competencyId: string;
  status: PracticalStatus;
  criteria: { label: string; met: boolean }[];
  notes: string;
}): void {
  const auth: WorkAuthorization =
    input.status === "competent" || input.status === "advanced"
      ? "independent"
      : input.status === "supervised"
        ? "supervised_only"
        : "none";
  recordPracticalAssessment({
    assessorUserId: state.currentUserId,
    employeeUserId: input.userId,
    competencyId: input.competencyId,
    practicalStatus: input.status,
    workAuthorization: auth,
    notes: input.notes,
    evidenceChecklist: input.criteria.filter((c) => c.met).map((c) => c.label),
  });
}

// Re-export alias used by manager assessments page
export { recordPracticalAssessmentFromUi as recordPracticalUi };

/** Commit to a deep career track — only after fit answers + real activity evidence */
export function commitCareerTrack(input: {
  userId: string;
  jobRole: import("./types").JobRole;
  learningPathId: string;
}): { ok: true } | { ok: false; reason: string } {
  const draft = cloneState(state);
  const ep = draft.employeeProfiles.find((e) => e.userId === input.userId);
  if (!ep) return { ok: false, reason: "پروفایل یافت نشد" };

  const fitComplete = FIT_QUESTIONS_COUNT_GATE(ep.careerFitAnswers);
  const realQuiz = draft.quizAttempts.filter(
    (a) => a.userId === input.userId && (a.answers?.length ?? 0) > 0
  ).length;
  const realExam = draft.examAttempts.filter(
    (a) => a.userId === input.userId && (a.answers?.length ?? 0) > 0
  ).length;
  const lessons = draft.lessonProgress.filter(
    (p) => p.userId === input.userId && p.status === "completed"
  ).length;
  const scenarios = (draft.scenarioAttempts ?? []).filter(
    (a) => a.userId === input.userId
  ).length;
  const studio = ep.studioSessionCount ?? 0;
  const activityScore = realQuiz + realExam + lessons + scenarios + studio;

  if (!fitComplete) {
    return { ok: false, reason: "ابتدا شش سؤال سنجش تناسب را کامل کنید" };
  }
  if (activityScore < 1) {
    return {
      ok: false,
      reason:
        "تعهد به مسیر فقط با فعالیت واقعی: حداقل یک درس تکمیل‌شده، آزمونک، سناریو، یا جلسه استودیو",
    };
  }

  ep.jobRole = input.jobRole;
  ep.learningPathId = input.learningPathId;
  const path = draft.learningPaths.find((p) => p.id === input.learningPathId);
  if (
    path &&
    !draft.employeeAssignments.some(
      (a) =>
        a.employeeUserId === input.userId &&
        a.learningPathId === input.learningPathId &&
        a.status !== "completed"
    )
  ) {
    draft.employeeAssignments.push({
      id: `asg_career_${input.userId}_${input.learningPathId}`,
      organizationId: ep.organizationId,
      employeeUserId: input.userId,
      learningPathId: input.learningPathId,
      assignedByUserId: draft.currentUserId,
      assignedAt: new Date().toISOString(),
      dueDate: new Date(Date.now() + (path.estimatedDays || 21) * 86400000)
        .toISOString()
        .slice(0, 10),
      status: "in_progress",
      priority: "high",
      isMandatory: true,
    });
  }
  appendAudit(draft, {
    actorUserId: input.userId,
    action: "assignment_create",
    entityType: "employee_profile",
    entityId: ep.id,
    summary: `تعهد به مسیر شغلی با شواهد واقعی (فعالیت=${activityScore})`,
    metadata: {
      jobRole: input.jobRole,
      learningPathId: input.learningPathId,
      realQuiz,
      realExam,
      lessons,
      scenarios,
      studio,
    },
  });
  commit(draft);
  return { ok: true };
}

function FIT_QUESTIONS_COUNT_GATE(
  answers: Record<string, string> | undefined
): boolean {
  if (!answers) return false;
  const required = ["energy", "hard", "learn", "pride", "drain", "mentor"];
  return required.every((id) => Boolean(answers[id]));
}

/** Persist career fit answers on profile (auditable) — preference layer only */
export function saveCareerFitAnswers(
  userId: string,
  answers: Record<string, string>
): void {
  const draft = cloneState(state);
  const ep = draft.employeeProfiles.find((e) => e.userId === userId);
  if (!ep) return;
  ep.careerFitAnswers = { ...answers };
  commit(draft);
}

/** Record a real studio / product-brainstorm session */
export function recordStudioSession(userId?: string): void {
  const uidTarget = userId ?? state.currentUserId;
  const draft = cloneState(state);
  const ep = draft.employeeProfiles.find((e) => e.userId === uidTarget);
  if (!ep) return;
  ep.studioSessionCount = (ep.studioSessionCount ?? 0) + 1;
  appendAudit(draft, {
    actorUserId: uidTarget,
    action: "config_update",
    entityType: "employee_profile",
    entityId: ep.id,
    summary: `جلسه استودیو/ایده‌پردازی ۳D ثبت شد (شماره ${ep.studioSessionCount})`,
    metadata: { studioSessionCount: ep.studioSessionCount },
  });
  commit(draft);
}

export function markNotificationRead(
  notificationId: string,
  userId?: string
): void {
  markNotificationReadInternal(notificationId, userId ?? state.currentUserId);
}
