/**
 * Beatris auth — one email = one user; OTP login; session persisted in app memory.
 */

import type { User } from "@/lib/types";

export type SessionPayload = {
  userId: string;
  email: string;
  issuedAt: number;
  expiresAt: number;
};

export type MailMessage = {
  id: string;
  to: string;
  subject: string;
  body: string;
  code: string;
  createdAt: string;
  read: boolean;
};

const SESSION_KEY = "beatris-auth-session-v1";
const MAIL_KEY = "beatris-mailbox-v1";
const USERS_KEY = "beatris-users-registry-v1";
const SESSION_DAYS = 30;

function encode(payload: SessionPayload): string {
  if (typeof btoa === "function") {
    return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  }
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

function decode(token: string): SessionPayload | null {
  try {
    const raw =
      typeof atob === "function"
        ? decodeURIComponent(escape(atob(token)))
        : Buffer.from(token, "base64").toString("utf8");
    const data = JSON.parse(raw) as SessionPayload;
    if (!data.userId || !data.expiresAt) return null;
    if (Date.now() > data.expiresAt) return null;
    return data;
  } catch {
    return null;
  }
}

export function createSession(user: Pick<User, "id" | "email">): string {
  const now = Date.now();
  return encode({
    userId: user.id,
    email: user.email.trim().toLowerCase(),
    issuedAt: now,
    expiresAt: now + SESSION_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function readSession(): SessionPayload | null {
  if (typeof window === "undefined") return null;
  const token = window.localStorage.getItem(SESSION_KEY);
  if (!token) return null;
  const payload = decode(token);
  if (!payload) {
    window.localStorage.removeItem(SESSION_KEY);
    return null;
  }
  return payload;
}

export function persistSession(token: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_KEY, token);
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_KEY);
}

export function getSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(SESSION_KEY);
}

export function parseSessionToken(token: string | null): SessionPayload | null {
  if (!token) return null;
  return decode(token);
}

/** @deprecated PIN auth removed — OTP only */
export function verifyPin(_email: string, _pin: string): boolean {
  return false;
}

export const DEMO_PINS: Record<string, string> = {};

/* —— In-app mailbox (persisted) — user opens /mail to read OTP —— */

export function loadMailbox(): MailMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(MAIL_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as MailMessage[];
  } catch {
    return [];
  }
}

export function saveMailbox(messages: MailMessage[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MAIL_KEY, JSON.stringify(messages));
}

export function pushMailMessage(msg: Omit<MailMessage, "id" | "read" | "createdAt"> & Partial<Pick<MailMessage, "id" | "createdAt">>): MailMessage {
  const full: MailMessage = {
    id: msg.id ?? `mail_${Date.now().toString(36)}`,
    to: msg.to.trim().toLowerCase(),
    subject: msg.subject,
    body: msg.body,
    code: msg.code,
    createdAt: msg.createdAt ?? new Date().toISOString(),
    read: false,
  };
  const box = loadMailbox();
  box.unshift(full);
  saveMailbox(box.slice(0, 100));
  return full;
}

export function markMailRead(id: string): void {
  const box = loadMailbox().map((m) =>
    m.id === id ? { ...m, read: true } : m
  );
  saveMailbox(box);
}

export function mailsForEmail(email: string): MailMessage[] {
  const e = email.trim().toLowerCase();
  return loadMailbox().filter((m) => m.to === e);
}

/* —— Email → userId registry (persisted; one email = one user) —— */

export type RegisteredUser = {
  userId: string;
  email: string;
  fullName: string;
  createdAt: string;
};

export function loadUserRegistry(): RegisteredUser[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(USERS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RegisteredUser[];
  } catch {
    return [];
  }
}

export function saveUserRegistry(rows: RegisteredUser[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(USERS_KEY, JSON.stringify(rows));
}

export function upsertRegisteredUser(row: RegisteredUser): void {
  const rows = loadUserRegistry().filter(
    (r) => r.email !== row.email && r.userId !== row.userId
  );
  rows.push(row);
  saveUserRegistry(rows);
}

export function findRegisteredByEmail(email: string): RegisteredUser | undefined {
  return loadUserRegistry().find(
    (r) => r.email === email.trim().toLowerCase()
  );
}
