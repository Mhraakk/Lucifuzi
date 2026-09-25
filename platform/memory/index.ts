/**
 * Layer 14 — State / Memory (short-term session + long-term facts)
 */

import { getStorage } from "@/platform/storage";

export type MemoryFact = {
  key: string;
  value: string;
  scope: "session" | "org" | "user";
  userId?: string;
  at: string;
};

const sessionFacts = new Map<string, MemoryFact>();

export async function remember(fact: Omit<MemoryFact, "at">): Promise<void> {
  const full: MemoryFact = { ...fact, at: new Date().toISOString() };
  const id = `${fact.scope}:${fact.userId ?? "anon"}:${fact.key}`;
  sessionFacts.set(id, full);
  const store = getStorage();
  await store.cache.set(`mem:${id}`, JSON.stringify(full), 60 * 60 * 24);
}

export async function recall(
  scope: MemoryFact["scope"],
  key: string,
  userId?: string
): Promise<MemoryFact | null> {
  const id = `${scope}:${userId ?? "anon"}:${key}`;
  const hit = sessionFacts.get(id);
  if (hit) return hit;
  const raw = await getStorage().cache.get(`mem:${id}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MemoryFact;
  } catch {
    return null;
  }
}

export function clearMemoryForTests(): void {
  sessionFacts.clear();
}
