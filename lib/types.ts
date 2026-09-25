/** Domain types for Iranian jewelry-store employee training SaaS */

export type Role = "owner" | "manager" | "trainer" | "employee";
/** Alias used by UI layers */
export type SystemRole = Role;

export type JobRole =
  | "sales_associate"
  | "cashier"
  | "store_manager"
  | "inventory"
  | "accountant"
  | "customer_service"
  | "repair_intake"
  | "gold_purchasing"
  | "back_office"
  | "designer"
  | "ideator";

/** Quiz/exam knowledge score (0–100). Never grants work authorization. */
export type KnowledgeLevel = number;

export type PracticalStatus =
  | "not_evaluated"
  | "training_required"
  | "supervised"
  | "competent"
  | "advanced";

/**
 * Work floor authorization — ONLY granted via practical assessment by a manager.
 * Never derived automatically from exam/quiz scores.
 */
export type WorkAuthorization = "none" | "supervised_only" | "independent";

export type ThemeMode = "light" | "dark";

export type ContentBlockType =
  | "text"
  | "checklist"
  | "example"
  | "warning"
  | "formula"
  | "image_placeholder";

export type LessonProgressStatus =
  | "not_started"
  | "in_progress"
  | "completed";

export type AssignmentStatus =
  | "assigned"
  | "in_progress"
  | "completed"
  | "overdue";

export type NotificationType =
  | "assignment"
  | "reminder"
  | "certificate"
  | "assessment"
  | "sop"
  | "system"
  | "recommendation";

export type AuditAction =
  | "login"
  | "lesson_complete"
  | "quiz_submit"
  | "exam_submit"
  | "sop_acknowledge"
  | "practical_assess"
  | "assignment_create"
  | "authorization_change"
  | "certificate_issue"
  | "scenario_complete"
  | "config_update";

export type ScenarioType = "sales" | "fraud" | "service" | "security" | "inventory";

export type RecommendationReason =
  | "skill_gap"
  | "failed_quiz"
  | "new_hire"
  | "role_required"
  | "expired_sop"
  | "manager_assigned"
  | "low_authorization";

export type Permission =
  | "org:manage"
  | "org:view"
  | "branch:manage"
  | "branch:view"
  | "user:manage"
  | "user:view"
  | "course:manage"
  | "course:view"
  | "assignment:manage"
  | "assignment:view_own"
  | "progress:view_all"
  | "progress:view_own"
  | "quiz:take"
  | "exam:take"
  | "exam:grade"
  | "practical:assess"
  | "practical:view"
  | "sop:manage"
  | "sop:acknowledge"
  | "certificate:issue"
  | "certificate:view"
  | "scenario:manage"
  | "scenario:play"
  | "pricing:configure"
  | "pricing:simulate"
  | "audit:view"
  | "notification:manage"
  | "recommendation:view";

export interface Organization {
  id: string;
  name: string;
  nameEn: string;
  logoUrl?: string;
  createdAt: string;
  settings: OrganizationSettings;
}

export interface OrganizationSettings {
  defaultPassingScore: number;
  /** Alias used by exam UI */
  passingScore: number;
  requireSopAcknowledgment: boolean;
  allowSelfEnrollment: boolean;
  goldPurityStandard: 750 | 999;
  pricingFormulaId?: string;
}

export interface Branch {
  id: string;
  organizationId: string;
  name: string;
  address: string;
  city: string;
  phone: string;
  isActive: boolean;
}

export interface User {
  id: string;
  organizationId: string;
  branchId: string;
  email: string;
  phone: string;
  fullName: string;
  /** RBAC role */
  role: Role;
  /** Same as role — preferred name in UI */
  systemRole: SystemRole;
  avatarInitials: string;
  avatarUrl?: string;
  isActive: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export interface EmployeeProfile {
  id: string;
  userId: string;
  organizationId: string;
  branchId: string;
  jobRole: JobRole;
  hireDate: string;
  /** Aggregate quiz/exam knowledge 0–100 — from graded attempts only */
  knowledgeLevel: KnowledgeLevel;
  practicalStatus: PracticalStatus;
  /** Floor work rights — set ONLY via practical assessment */
  workAuthorization: WorkAuthorization;
  supervisorId?: string;
  learningPathId?: string;
  streakDays?: number;
  notes?: string;
  /** Real studio / brainstorm sessions opened (not a preference click fake) */
  studioSessionCount?: number;
  /** Career fit preference answers — preference only until activity evidence exists */
  careerFitAnswers?: Record<string, string>;
}

export interface RolePermissionMap {
  role: Role;
  permissions: Permission[];
}

export interface Course {
  id: string;
  organizationId: string;
  title: string;
  description: string;
  category: string;
  academy?: string;
  version?: number;
  estimatedMinutes: number;
  difficulty: "beginner" | "intermediate" | "advanced";
  targetJobRoles: JobRole[];
  /** Accent color for course cards */
  coverAccent: string;
  /** @deprecated alias of coverAccent */
  thumbnailColor: string;
  /** Topic illustration path under /public */
  coverImage?: string;
  isPublished: boolean;
  sortOrder: number;
  requiredForAuthorization: boolean;
}

export interface CourseModule {
  id: string;
  courseId: string;
  title: string;
  description: string;
  sortOrder: number;
  /** Alias of sortOrder for UI */
  order: number;
  lessonIds: string[];
}

export interface Lesson {
  id: string;
  moduleId: string;
  courseId: string;
  title: string;
  summary: string;
  estimatedMinutes: number;
  sortOrder: number;
  hasQuiz: boolean;
  version?: number;
  quizQuestionIds: string[];
}

export interface LessonContentBlock {
  id: string;
  type: ContentBlockType;
  title?: string;
  body: string;
  items?: string[];
}

export interface LessonContent {
  lessonId: string;
  blocks: LessonContentBlock[];
}

export interface LearningPath {
  id: string;
  organizationId: string;
  title: string;
  description: string;
  targetJobRoles: JobRole[];
  estimatedDays: number;
  /** Ordered course ids for this path */
  courseIds: string[];
}

export interface LearningPathCourse {
  id: string;
  learningPathId: string;
  courseId: string;
  sortOrder: number;
  isRequired: boolean;
}

export interface EmployeeAssignment {
  id: string;
  organizationId: string;
  employeeUserId: string;
  courseId?: string;
  learningPathId?: string;
  assignedByUserId: string;
  assignedAt: string;
  dueDate?: string;
  status: AssignmentStatus;
  priority: "low" | "medium" | "high";
  isMandatory: boolean;
}

export interface LessonProgress {
  id: string;
  organizationId: string;
  userId: string;
  lessonId: string;
  courseId: string;
  status: LessonProgressStatus;
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
  timeSpentSeconds: number;
  /** 0–100 progress within the lesson */
  percent: number;
}

export interface QuizQuestion {
  id: string;
  lessonId?: string;
  courseId: string;
  prompt: string;
  explanation: string;
  type: "single" | "multiple" | "calculation";
  points: number;
  difficulty?: "easy" | "medium" | "hard";
  calculationAnswer?: number;
  calculationTolerance?: number;
  calculationUnit?: string;
  /** Optional payload for interactive gold calculator questions */
  calculationPayload?: {
    weightGrams: number;
    karat: 18 | 21 | 22 | 24;
    pricePerGram: number;
    makingChargePerGram: number;
    profitPercent: number;
  };
}

export interface QuizOption {
  id: string;
  questionId: string;
  text: string;
  isCorrect: boolean;
  sortOrder: number;
}

export interface QuizAttempt {
  id: string;
  organizationId: string;
  userId: string;
  courseId: string;
  lessonId?: string;
  startedAt: string;
  submittedAt?: string;
  score: KnowledgeLevel;
  maxScore: number;
  passed: boolean;
  answers: QuizAnswer[];
}

export interface QuizAnswer {
  questionId: string;
  selectedOptionIds: string[];
  numericAnswer?: number;
  isCorrect: boolean;
  pointsEarned: number;
}

export interface ExamAttempt {
  id: string;
  organizationId: string;
  userId: string;
  courseId: string;
  startedAt: string;
  submittedAt?: string;
  /** Knowledge score only — does NOT grant WorkAuthorization */
  score: KnowledgeLevel;
  maxScore: number;
  passed: boolean;
  answers: QuizAnswer[];
}

export interface Competency {
  id: string;
  organizationId: string;
  code: string;
  title: string;
  description: string;
  category: string;
  relatedJobRoles: JobRole[];
  relatedCourseIds: string[];
}

export interface EmployeeCompetency {
  id: string;
  organizationId: string;
  userId: string;
  competencyId: string;
  knowledgeLevel: KnowledgeLevel;
  practicalStatus: PracticalStatus;
  workAuthorization: WorkAuthorization;
  lastAssessedAt?: string;
  assessedByUserId?: string;
}

export interface PracticalAssessment {
  id: string;
  organizationId: string;
  employeeUserId: string;
  competencyId: string;
  assessorUserId: string;
  assessedAt: string;
  practicalStatus: PracticalStatus;
  /** Sole source of truth for floor authorization changes */
  workAuthorization: WorkAuthorization;
  score?: number;
  notes: string;
  evidenceChecklist: string[];
}

export interface TrainingScenario {
  id: string;
  organizationId: string;
  title: string;
  description: string;
  /** Short intro shown on cards */
  intro: string;
  type: ScenarioType;
  category: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  estimatedMinutes: number;
  relatedCourseIds: string[];
}

export interface ScenarioStep {
  id: string;
  scenarioId: string;
  sortOrder: number;
  narratorText: string;
  prompt: string;
  choices: ScenarioChoice[];
}

export interface ScenarioChoice {
  id: string;
  text: string;
  isCorrect: boolean;
  feedback: string;
  nextStepId?: string;
  scoreDelta: number;
}

export interface ScenarioAttempt {
  id: string;
  organizationId: string;
  userId: string;
  scenarioId: string;
  startedAt: string;
  completedAt?: string;
  score: number;
  maxScore: number;
  pathTaken: string[];
  succeeded: boolean;
}

export interface Sop {
  id: string;
  organizationId: string;
  title: string;
  category: string;
  currentVersionId: string;
  requiredJobRoles: JobRole[];
  isActive: boolean;
  requiresAcknowledgment: boolean;
}

export interface SopVersion {
  id: string;
  sopId: string;
  version: number;
  summary: string;
  steps: string[];
  warnings: string[];
  publishedAt: string;
  publishedByUserId: string;
}

export interface SopAcknowledgment {
  id: string;
  organizationId: string;
  sopId: string;
  sopVersionId: string;
  /** Alias of sopVersionId for UI */
  versionId: string;
  userId: string;
  acknowledgedAt: string;
}

export interface Certificate {
  id: string;
  organizationId: string;
  userId: string;
  courseId: string;
  title: string;
  issuedAt: string;
  issuedByUserId: string;
  knowledgeScore: KnowledgeLevel;
  /** Alias of knowledgeScore for UI */
  score: KnowledgeLevel;
  expiresAt?: string;
  certificateNumber: string;
  /** Required for integrity — certificate only valid when linked to a passed exam */
  examAttemptId?: string;
}

export interface TrainingRecommendation {
  id: string;
  organizationId: string;
  userId: string;
  courseId?: string;
  lessonId?: string;
  scenarioId?: string;
  competencyId?: string;
  /** Persian label shown in UI */
  reason: string;
  /** Machine code for engines */
  reasonCode: RecommendationReason;
  priority: "low" | "medium" | "high";
  message: string;
  estimatedMinutes: number;
  createdAt: string;
  dismissed: boolean;
}

export interface Notification {
  id: string;
  organizationId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  href?: string;
  createdAt: string;
  readAt?: string;
  /** Convenience flag mirrored from readAt */
  read: boolean;
}

export interface AuditLog {
  id: string;
  organizationId: string;
  actorUserId: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  summary: string;
  metadata?: Record<string, string | number | boolean | null>;
  createdAt: string;
}

export interface PricingFormulaConfig {
  id: string;
  organizationId: string;
  name: string;
  goldPricePerGram18k: number;
  makingFeePercent: number;
  profitPercent: number;
  vatPercent: number;
  fixedFee: number;
  updatedAt: string;
  updatedByUserId: string;
}

export interface DailyTraining {
  id: string;
  organizationId: string;
  date: string;
  title: string;
  tip: string;
  microLessonTitle?: string;
  microLessonBody?: string;
  courseId?: string;
  scenarioId?: string;
  questionId?: string;
  focusCompetencyId?: string;
}

export interface AppState {
  organization: Organization;
  branches: Branch[];
  users: User[];
  employeeProfiles: EmployeeProfile[];
  courses: Course[];
  courseModules: CourseModule[];
  /** Alias of courseModules for UI */
  modules: CourseModule[];
  lessons: Lesson[];
  lessonContents: LessonContent[];
  learningPaths: LearningPath[];
  learningPathCourses: LearningPathCourse[];
  /** Canonical + UI name */
  employeeAssignments: EmployeeAssignment[];
  assignments: EmployeeAssignment[];
  lessonProgress: LessonProgress[];
  quizQuestions: QuizQuestion[];
  /** Alias of quizQuestions for UI */
  questions: QuizQuestion[];
  quizOptions: QuizOption[];
  quizAttempts: QuizAttempt[];
  examAttempts: ExamAttempt[];
  competencies: Competency[];
  employeeCompetencies: EmployeeCompetency[];
  practicalAssessments: PracticalAssessment[];
  trainingScenarios: TrainingScenario[];
  scenarios: TrainingScenario[];
  scenarioSteps: ScenarioStep[];
  scenarioAttempts: ScenarioAttempt[];
  sops: Sop[];
  sopVersions: SopVersion[];
  sopAcknowledgments: SopAcknowledgment[];
  certificates: Certificate[];
  trainingRecommendations: TrainingRecommendation[];
  recommendations: TrainingRecommendation[];
  notifications: Notification[];
  auditLogs: AuditLog[];
  pricingFormulaConfig: PricingFormulaConfig;
  dailyTraining: DailyTraining[];
  currentUserId: string;
  theme: ThemeMode;
}

export const JOB_ROLE_LABELS: Record<JobRole, string> = {
  sales_associate: "فروشنده",
  cashier: "صندوق‌دار",
  store_manager: "مدیر فروشگاه",
  inventory: "انباردار",
  accountant: "حسابدار",
  customer_service: "پشتیبانی مشتری",
  repair_intake: "پذیرش تعمیرات",
  gold_purchasing: "خرید طلا",
  back_office: "پشتیبانی اداری",
  designer: "طراح قطعه",
  ideator: "ایده‌پرداز فروشگاه",
};

export const ROLE_LABELS: Record<Role, string> = {
  owner: "مالک",
  manager: "مدیر",
  trainer: "مربی",
  employee: "کارمند",
};

export const SYSTEM_ROLE_LABELS = ROLE_LABELS;

export const PRACTICAL_STATUS_LABELS: Record<PracticalStatus, string> = {
  not_evaluated: "ارزیابی‌نشده",
  training_required: "نیاز به آموزش",
  supervised: "تحت نظارت",
  competent: "شایسته",
  advanced: "پیشرفته",
};

export const WORK_AUTHORIZATION_LABELS: Record<WorkAuthorization, string> = {
  none: "بدون مجوز",
  supervised_only: "فقط تحت نظارت",
  independent: "مستقل",
};

export const WORK_AUTH_LABELS = WORK_AUTHORIZATION_LABELS;

export const RECOMMENDATION_REASON_LABELS: Record<RecommendationReason, string> = {
  skill_gap: "شکاف مهارتی",
  failed_quiz: "نتیجه ضعیف آزمون",
  new_hire: "نیروی تازه‌وارد",
  role_required: "الزام نقش شغلی",
  expired_sop: "دستورالعمل منقضی",
  manager_assigned: "تکلیف مدیر",
  low_authorization: "مجوز کار ناکافی",
};
