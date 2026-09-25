/**
 * Layer 4 — Authentication / RBAC / RLS
 * Branch-scoped policies; complements app lib/auth/session.
 */

export type PlatformRole =
  | "owner"
  | "manager"
  | "trainer"
  | "employee"
  | "service"
  | "market_worker";

export type Permission =
  | "market:read"
  | "market:write"
  | "finance:quote"
  | "finance:admin"
  | "ai:ask"
  | "events:read"
  | "events:publish"
  | "flags:read"
  | "flags:write"
  | "ops:view"
  | "replay:run";

const ROLE_PERMS: Record<PlatformRole, Permission[]> = {
  owner: [
    "market:read",
    "market:write",
    "finance:quote",
    "finance:admin",
    "ai:ask",
    "events:read",
    "events:publish",
    "flags:read",
    "flags:write",
    "ops:view",
    "replay:run",
  ],
  manager: [
    "market:read",
    "finance:quote",
    "ai:ask",
    "events:read",
    "flags:read",
    "ops:view",
    "replay:run",
  ],
  trainer: ["market:read", "finance:quote", "ai:ask", "events:read", "ops:view"],
  employee: ["market:read", "finance:quote", "ai:ask"],
  service: [
    "market:read",
    "events:publish",
    "events:read",
    "finance:quote",
    "ai:ask",
    "flags:read",
    "flags:write",
    "ops:view",
    "replay:run",
  ],
  market_worker: ["market:write", "events:publish"],
};

export type Principal = {
  userId: string;
  role: PlatformRole;
  orgId: string;
  branchId: string | null;
};

export function can(principal: Principal, permission: Permission): boolean {
  return ROLE_PERMS[principal.role]?.includes(permission) ?? false;
}

export function assertCan(principal: Principal, permission: Permission): void {
  if (!can(principal, permission)) {
    throw new Error(`RBAC denied: ${principal.role} lacks ${permission}`);
  }
}

/** Row-level security: row belongs to same org; branch managers see own branch */
export function rlsAllowsRow(
  principal: Principal,
  row: { orgId: string; branchId?: string | null }
): boolean {
  if (row.orgId !== principal.orgId) return false;
  if (principal.role === "owner" || principal.role === "service") return true;
  if (principal.role === "market_worker") return true;
  if (!row.branchId) return true;
  // Remaining roles require a matching branch scope
  if (!principal.branchId) return false;
  return row.branchId === principal.branchId;
}

export function servicePrincipal(orgId = "org_arya"): Principal {
  return {
    userId: "svc_platform",
    role: "service",
    orgId,
    branchId: null,
  };
}

export function workerPrincipal(orgId = "org_arya"): Principal {
  return {
    userId: "svc_market_worker",
    role: "market_worker",
    orgId,
    branchId: null,
  };
}
