/**
 * Layer 8 — Event Bus / Queue (in-process + durable log hook)
 */

export type DomainEventType =
  | "market.tick"
  | "finance.quote"
  | "finance.audit"
  | "ai.ask"
  | "ai.refused"
  | "remediation.applied"
  | "auth.login"
  | "flag.changed"
  | "replay.completed"
  | "worker.heartbeat";

export type DomainEvent<T = Record<string, unknown>> = {
  id: string;
  type: DomainEventType;
  at: string;
  orgId: string;
  payload: T;
  correlationId?: string;
};

type Handler = (event: DomainEvent) => void | Promise<void>;

const handlers = new Map<DomainEventType | "*", Set<Handler>>();
const log: DomainEvent[] = [];
const MAX = 2000;

function uid(): string {
  return `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function subscribe(
  type: DomainEventType | "*",
  handler: Handler
): () => void {
  if (!handlers.has(type)) handlers.set(type, new Set());
  handlers.get(type)!.add(handler);
  return () => handlers.get(type)?.delete(handler);
}

export async function publish<T extends Record<string, unknown>>(
  type: DomainEventType,
  orgId: string,
  payload: T,
  correlationId?: string
): Promise<DomainEvent<T>> {
  const event: DomainEvent<T> = {
    id: uid(),
    type,
    at: new Date().toISOString(),
    orgId,
    payload,
    correlationId,
  };
  log.unshift(event as DomainEvent);
  if (log.length > MAX) log.length = MAX;

  const run = async (h: Handler) => {
    try {
      await h(event as DomainEvent);
    } catch (err) {
      console.error("[events] handler failed", type, err);
    }
  };

  const specific = handlers.get(type);
  const star = handlers.get("*");
  await Promise.all([
    ...(specific ? Array.from(specific).map(run) : []),
    ...(star ? Array.from(star).map(run) : []),
  ]);
  return event;
}

export function recentEvents(limit = 50): DomainEvent[] {
  return log.slice(0, limit);
}

export function clearEventsForTests(): void {
  log.length = 0;
  handlers.clear();
}

export function eventCount(): number {
  return log.length;
}
