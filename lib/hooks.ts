"use client";

import { useMemo, useSyncExternalStore } from "react";
import { getSnapshot, subscribe } from "./store";
import type { AppState, User } from "./types";

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useCurrentUser(): User {
  const state = useAppState();
  const user = state.users.find((u) => u.id === state.currentUserId);
  if (!user) throw new Error("کاربر یافت نشد");
  return user;
}

export function useEmployeeProfile(userId?: string) {
  const state = useAppState();
  const id = userId ?? state.currentUserId;
  return state.employeeProfiles.find((p) => p.userId === id);
}

export function useBranchName(branchId: string) {
  const state = useAppState();
  return state.branches.find((b) => b.id === branchId)?.name ?? "—";
}

export function useUnreadCount() {
  const state = useAppState();
  return useMemo(
    () =>
      state.notifications.filter(
        (n) => n.userId === state.currentUserId && !n.read
      ).length,
    [state.notifications, state.currentUserId]
  );
}
