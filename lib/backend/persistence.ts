/**
 * Durable client persistence — IndexedDB primary, localStorage mirror.
 * Operational events can also POST to /api/sync when online.
 */

import type { AppState } from "@/lib/types";

const IDB_NAME = "arya-training-db";
const IDB_STORE = "kv";
const STATE_KEY = "app-state-v3";
const LS_KEY = "arya-jewelry-training-state-v3";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IDB open failed"));
  });
}

async function idbGet(key: string): Promise<string | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as string | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function idbSet(key: string, value: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      const store = tx.objectStore(IDB_STORE);
      const req = store.put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    /* ignore — localStorage mirror still works */
  }
}

export async function loadPersistedState(): Promise<AppState | null> {
  const fromIdb = await idbGet(STATE_KEY);
  if (fromIdb) {
    try {
      return JSON.parse(fromIdb) as AppState;
    } catch {
      /* fall through */
    }
  }
  if (typeof window !== "undefined") {
    const raw = window.localStorage.getItem(LS_KEY);
    if (raw) {
      try {
        return JSON.parse(raw) as AppState;
      } catch {
        return null;
      }
    }
  }
  return null;
}

export async function savePersistedState(state: AppState): Promise<void> {
  const raw = JSON.stringify(state);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LS_KEY, raw);
  }
  await idbSet(STATE_KEY, raw);
}

export type SyncEvent = {
  type:
    | "remediation"
    | "scenario_coach"
    | "quiz_fail"
    | "auth_login"
    | "practical_evidence";
  userId: string;
  payload: Record<string, string | number | boolean | null>;
  at: string;
};

/** Fire-and-forget remote sync for operational events */
export async function syncEvent(event: SyncEvent): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
  } catch {
    /* offline ok */
  }
}

export { LS_KEY as LEGACY_STORAGE_KEY };
