/**
 * Automatic remediation: skill gaps / failed quiz / weak scenario / SOP lag
 * → mandatory assignment + notification. Never touches WorkAuthorization.
 */

import type {
  AppState,
  AssignmentStatus,
  EmployeeAssignment,
  Notification,
  RecommendationReason,
  TrainingRecommendation,
} from "@/lib/types";

export type RemediationTrigger =
  | "failed_quiz"
  | "weak_scenario"
  | "expired_sop"
  | "skill_gap";

export type RemediationAction = {
  trigger: RemediationTrigger;
  userId: string;
  courseId?: string;
  scenarioId?: string;
  competencyId?: string;
  reason: string;
  reasonCode: RecommendationReason;
  priority: "medium" | "high";
  href?: string;
};

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function hasOpenAssignment(
  state: AppState,
  userId: string,
  courseId: string
): boolean {
  return state.employeeAssignments.some(
    (a) =>
      a.employeeUserId === userId &&
      a.courseId === courseId &&
      a.status !== "completed"
  );
}

function pushNotification(
  draft: AppState,
  input: {
    userId: string;
    title: string;
    body: string;
    href?: string;
    type?: Notification["type"];
  }
): void {
  const n: Notification = {
    id: uid("ntf"),
    organizationId: draft.organization.id,
    userId: input.userId,
    type: input.type ?? "recommendation",
    title: input.title,
    body: input.body,
    href: input.href,
    createdAt: nowIso(),
    read: false,
  };
  draft.notifications.unshift(n);
}

function pushRecommendation(
  draft: AppState,
  action: RemediationAction
): void {
  const exists = draft.trainingRecommendations.some(
    (r) =>
      r.userId === action.userId &&
      r.courseId === action.courseId &&
      r.reasonCode === action.reasonCode &&
      !r.dismissed
  );
  if (exists) return;

  const rec: TrainingRecommendation = {
    id: uid("rec"),
    organizationId: draft.organization.id,
    userId: action.userId,
    courseId: action.courseId,
    scenarioId: action.scenarioId,
    competencyId: action.competencyId,
    reason: action.reason,
    reasonCode: action.reasonCode,
    priority: action.priority,
    message: action.reason,
    estimatedMinutes: 45,
    createdAt: nowIso(),
    dismissed: false,
  };
  draft.trainingRecommendations.unshift(rec);
}

function pushAssignment(
  draft: AppState,
  action: RemediationAction,
  assignedByUserId: string
): EmployeeAssignment | null {
  if (!action.courseId) return null;
  if (hasOpenAssignment(draft, action.userId, action.courseId)) return null;

  const asg: EmployeeAssignment = {
    id: uid("asg"),
    organizationId: draft.organization.id,
    employeeUserId: action.userId,
    courseId: action.courseId,
    assignedByUserId,
    assignedAt: nowIso(),
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10),
    status: "assigned" as AssignmentStatus,
    priority: action.priority,
    isMandatory: true,
  };
  draft.employeeAssignments.unshift(asg);
  return asg;
}

/** Apply one remediation action onto a draft AppState */
export function applyRemediationAction(
  draft: AppState,
  action: RemediationAction,
  assignedByUserId: string
): { assignmentId?: string } {
  pushRecommendation(draft, action);
  const asg = pushAssignment(draft, action, assignedByUserId);

  pushNotification(draft, {
    userId: action.userId,
    title: "بازآموزی الزامی",
    body: action.reason,
    href:
      action.href ??
      (action.courseId
        ? `/employee/courses/${action.courseId}`
        : "/employee/practice"),
    type: "assignment",
  });

  // Notify managers in same branch
  const employee = draft.users.find((u) => u.id === action.userId);
  if (employee) {
    const managers = draft.users.filter(
      (u) =>
        (u.systemRole === "manager" ||
          u.systemRole === "owner" ||
          u.systemRole === "trainer") &&
        (u.branchId === employee.branchId || u.systemRole === "owner")
    );
    for (const m of managers) {
      pushNotification(draft, {
        userId: m.id,
        title: "کارمند نیازمند remediation",
        body: `${employee.fullName}: ${action.reason}`,
        href: "/manager/dashboard",
        type: "assessment",
      });
    }
  }

  return { assignmentId: asg?.id };
}

export function remediationFromFailedQuiz(input: {
  userId: string;
  courseId: string;
  score: number;
}): RemediationAction {
  return {
    trigger: "failed_quiz",
    userId: input.userId,
    courseId: input.courseId,
    reason: `آزمون با نمره ${input.score}٪ مردود شد — بازآموزی دوره الزامی است (دانش ≠ مجوز کار).`,
    reasonCode: "failed_quiz",
    priority: "high",
    href: `/employee/courses/${input.courseId}`,
  };
}

export function remediationFromWeakScenario(input: {
  userId: string;
  scenarioId: string;
  courseId?: string;
  percent: number;
  focusCode: string;
}): RemediationAction {
  return {
    trigger: "weak_scenario",
    userId: input.userId,
    courseId: input.courseId,
    scenarioId: input.scenarioId,
    reason: `عملکرد سناریو (${input.percent}٪) زیر حد نصاب — تمرین مجدد دامنه ${input.focusCode}. شواهد مربی مجوز کار نمی‌دهد.`,
    reasonCode: "skill_gap",
    priority: input.percent < 40 ? "high" : "medium",
    href: `/employee/scenario/${input.scenarioId}`,
  };
}

export function findSopLagActions(state: AppState): RemediationAction[] {
  const actions: RemediationAction[] = [];
  const employees = state.users.filter((u) => u.systemRole === "employee");

  for (const sop of state.sops) {
    if (!sop.requiresAcknowledgment) continue;
    for (const emp of employees) {
      const acked = state.sopAcknowledgments.some(
        (a) =>
          a.userId === emp.id &&
          a.sopId === sop.id &&
          a.versionId === sop.currentVersionId
      );
      if (acked) continue;
      actions.push({
        trigger: "expired_sop",
        userId: emp.id,
        reason: `دستورالعمل «${sop.title}» هنوز تأیید نشده — قبل از شیفت ویترین الزامی است.`,
        reasonCode: "expired_sop",
        priority: "high",
        href: `/employee/sop/${sop.id}`,
      });
    }
  }
  return actions;
}

/** High-severity knowledge gaps → mandatory course assignment */
export function findSkillGapActions(state: AppState): RemediationAction[] {
  const actions: RemediationAction[] = [];
  const employees = state.users.filter((u) => u.systemRole === "employee");

  for (const emp of employees) {
    const ecs = state.employeeCompetencies.filter((e) => e.userId === emp.id);
    for (const ec of ecs) {
      if (ec.knowledgeLevel >= 70) continue;
      const comp = state.competencies.find((c) => c.id === ec.competencyId);
      const courseId = comp?.relatedCourseIds[0];
      if (!courseId) continue;
      actions.push({
        trigger: "skill_gap",
        userId: emp.id,
        courseId,
        competencyId: ec.competencyId,
        reason: `شکاف دانش «${comp?.title ?? ec.competencyId}» (${ec.knowledgeLevel}٪) — بازآموزی اجباری قبل از ویترین.`,
        reasonCode: "skill_gap",
        priority: ec.knowledgeLevel < 50 ? "high" : "medium",
        href: `/employee/courses/${courseId}`,
      });
    }
  }
  return actions;
}

/** Employees not ready for independent floor work tomorrow */
export function listNotFloorReady(state: AppState): Array<{
  userId: string;
  fullName: string;
  reasons: string[];
}> {
  const employees = state.users.filter((u) => u.systemRole === "employee");
  const out: Array<{ userId: string; fullName: string; reasons: string[] }> =
    [];

  for (const emp of employees) {
    const reasons: string[] = [];
    const ecs = state.employeeCompetencies.filter((e) => e.userId === emp.id);
    if (ecs.length === 0) {
      reasons.push("شایستگی ثبت نشده");
    }
    for (const ec of ecs) {
      if (ec.workAuthorization === "none") {
        const comp = state.competencies.find((c) => c.id === ec.competencyId);
        reasons.push(`بدون مجوز: ${comp?.title ?? ec.competencyId}`);
      }
      if (ec.knowledgeLevel < 70) {
        const comp = state.competencies.find((c) => c.id === ec.competencyId);
        reasons.push(`دانش پایین: ${comp?.title ?? ec.competencyId}`);
      }
    }
    const openMandatory = state.employeeAssignments.filter(
      (a) =>
        a.employeeUserId === emp.id &&
        a.isMandatory &&
        a.status !== "completed"
    );
    if (openMandatory.length > 0) {
      reasons.push(`${openMandatory.length} تکلیف اجباری باز`);
    }
    const sopLag = state.sops.filter((sop) => {
      if (!sop.requiresAcknowledgment) return false;
      return !state.sopAcknowledgments.some(
        (a) =>
          a.userId === emp.id &&
          a.sopId === sop.id &&
          a.versionId === sop.currentVersionId
      );
    });
    if (sopLag.length > 0) {
      reasons.push(`${sopLag.length} SOP بدون تأیید`);
    }

    if (reasons.length > 0) {
      out.push({ userId: emp.id, fullName: emp.fullName, reasons });
    }
  }
  return out;
}
