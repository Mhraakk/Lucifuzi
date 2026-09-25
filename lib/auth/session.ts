/**
 * Light session auth — email + PIN against seeded users.
 * Replaces persona-only picker for operational flows.
 */

import type { User } from "@/lib/types";

export type SessionPayload = {
  userId: string;
  email: string;
  issuedAt: number;
  expiresAt: number;
};

const SESSION_KEY = "arya-auth-session-v1";
const SESSION_DAYS = 14;

/** Demo PINs — production would hash server-side */
export const DEMO_PINS: Record<string, string> = {
  "owner@arya-gold.ir": "1234",
  "manager.central@arya-gold.ir": "1234",
  "manager.second@arya-gold.ir": "1234",
  "trainer@arya-gold.ir": "1234",
  "nima.salehi@arya-gold.ir": "1234",
  "zahra.hosseini@arya-gold.ir": "1234",
  "ali.rezaei@arya-gold.ir": "1234",
  "maryam.kazemi@arya-gold.ir": "1234",
  "hossein.najafi@arya-gold.ir": "1234",
  "fatemeh.moradi@arya-gold.ir": "1234",
  "amir.bagheri@arya-gold.ir": "1234",
  "leila.jamshidi@arya-gold.ir": "1234",
};

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

export function verifyPin(email: string, pin: string): boolean {
  const expected = DEMO_PINS[email.trim().toLowerCase()];
  return Boolean(expected && expected === pin.trim());
}

export function createSession(user: User): string {
  const now = Date.now();
  return encode({
    userId: user.id,
    email: user.email,
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
