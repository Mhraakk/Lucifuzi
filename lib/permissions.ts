import type {
  AppState,
  Branch,
  Permission,
  Role,
  User,
} from "./types";

/** Default RBAC matrix for the jewelry training SaaS */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: [
    "org:manage",
    "org:view",
    "branch:manage",
    "branch:view",
    "user:manage",
    "user:view",
    "course:manage",
    "course:view",
    "assignment:manage",
    "assignment:view_own",
    "progress:view_all",
    "progress:view_own",
    "quiz:take",
    "exam:take",
    "exam:grade",
    "practical:assess",
    "practical:view",
    "sop:manage",
    "sop:acknowledge",
    "certificate:issue",
    "certificate:view",
    "scenario:manage",
    "scenario:play",
    "pricing:configure",
    "pricing:simulate",
    "audit:view",
    "notification:manage",
    "recommendation:view",
  ],
  manager: [
    "org:view",
    "branch:view",
    "user:view",
    "user:manage",
    "course:view",
    "assignment:manage",
    "assignment:view_own",
    "progress:view_all",
    "progress:view_own",
    "quiz:take",
    "exam:take",
    "exam:grade",
    "practical:assess",
    "practical:view",
    "sop:manage",
    "sop:acknowledge",
    "certificate:issue",
    "certificate:view",
    "scenario:manage",
    "scenario:play",
    "pricing:simulate",
    "audit:view",
    "notification:manage",
    "recommendation:view",
  ],
  trainer: [
    "org:view",
    "branch:view",
    "user:view",
    "course:manage",
    "course:view",
    "assignment:manage",
    "assignment:view_own",
    "progress:view_all",
    "progress:view_own",
    "quiz:take",
    "exam:take",
    "exam:grade",
    "practical:view",
    "sop:acknowledge",
    "certificate:issue",
    "certificate:view",
    "scenario:manage",
    "scenario:play",
    "pricing:simulate",
    "recommendation:view",
  ],
  employee: [
    "org:view",
    "branch:view",
    "course:view",
    "assignment:view_own",
    "progress:view_own",
    "quiz:take",
    "exam:take",
    "practical:view",
    "sop:acknowledge",
    "certificate:view",
    "scenario:play",
    "pricing:simulate",
    "recommendation:view",
  ],
};

export function getPermissionsForRole(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function hasAllPermissions(role: Role, permissions: Permission[]): boolean {
  return permissions.every((p) => hasPermission(role, p));
}

export function hasAnyPermission(role: Role, permissions: Permission[]): boolean {
  return permissions.some((p) => hasPermission(role, p));
}

export interface AuthContext {
  user: User;
  organizationId: string;
  branchId: string;
  role: Role;
  permissions: Permission[];
}

export function getAuthContext(state: AppState, userId?: string): AuthContext | null {
  const id = userId ?? state.currentUserId;
  const user = state.users.find((u) => u.id === id && u.isActive);
  if (!user) return null;
  if (user.organizationId !== state.organization.id) return null;
  return {
    user,
    organizationId: user.organizationId,
    branchId: user.branchId,
    role: user.role,
    permissions: getPermissionsForRole(user.role),
  };
}

export function assertPermission(ctx: AuthContext, permission: Permission): void {
  if (!hasPermission(ctx.role, permission)) {
    throw new Error(`دسترسی مجاز نیست: ${permission}`);
  }
}

/** Tenant isolation: entity must belong to caller's organization */
export function assertSameOrganization(
  ctx: AuthContext,
  organizationId: string
): void {
  if (ctx.organizationId !== organizationId) {
    throw new Error("دسترسی بین‌سازمانی مجاز نیست");
  }
}

/**
 * Branch scope:
 * - owner/trainer: all branches in org
 * - manager: own branch (+ optional peer view only if same org — managers stay branch-scoped for mutations)
 * - employee: own branch only
 */
export function canAccessBranch(ctx: AuthContext, branchId: string): boolean {
  if (ctx.role === "owner" || ctx.role === "trainer") return true;
  return ctx.branchId === branchId;
}

export function assertBranchAccess(ctx: AuthContext, branchId: string): void {
  if (!canAccessBranch(ctx, branchId)) {
    throw new Error("دسترسی به این شعبه مجاز نیست");
  }
}

export function filterUsersByTenant(state: AppState, ctx: AuthContext): User[] {
  return state.users.filter((u) => {
    if (u.organizationId !== ctx.organizationId) return false;
    if (ctx.role === "owner" || ctx.role === "trainer") return true;
    if (ctx.role === "manager") return u.branchId === ctx.branchId;
    return u.id === ctx.user.id;
  });
}

export function filterBranchesByTenant(state: AppState, ctx: AuthContext): Branch[] {
  return state.branches.filter((b) => {
    if (b.organizationId !== ctx.organizationId) return false;
    if (ctx.role === "owner" || ctx.role === "trainer") return true;
    return b.id === ctx.branchId;
  });
}

/** Can this actor assess practical work for the target employee? */
export function canAssessEmployee(ctx: AuthContext, targetUser: User): boolean {
  if (!hasPermission(ctx.role, "practical:assess")) return false;
  if (targetUser.organizationId !== ctx.organizationId) return false;
  if (ctx.role === "owner") return true;
  if (ctx.role === "manager") return targetUser.branchId === ctx.branchId;
  return false;
}

/** Work authorization may ONLY be set through practical assessment permission path */
export function canGrantWorkAuthorization(ctx: AuthContext): boolean {
  return hasPermission(ctx.role, "practical:assess");
}

/** Manager / owner / trainer — used by AppShell navigation */
export function isManagerLike(role: Role): boolean {
  return role === "owner" || role === "manager" || role === "trainer";
}
