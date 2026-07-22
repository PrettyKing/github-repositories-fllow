import { createHash, randomUUID } from "node:crypto";

export const STATES = ["OPEN", "INVESTIGATING", "ACTION_PROPOSED", "APPROVED", "REJECTED", "EXECUTING", "RESOLVED", "FAILED"] as const;
export type IncidentState = typeof STATES[number];
export type ActionType = "DLQ_REDRIVE" | "ROLLBACK";

export const redact = (value: unknown): unknown => {
  if (typeof value === "string") return value
    .replace(/authorization\s*[:=]\s*(?:(?:Basic|Bearer)\s+)?[^\s,;]+/gi, "Authorization=[REDACTED]")
    .replace(/(authorization|token|password|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(/Basic\s+[A-Za-z0-9+/=]+/gi, "Basic [REDACTED]")
    .slice(0, 4000);
  if (Array.isArray(value)) return value.slice(0, 50).map(redact);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) =>
    [/token|password|secret|authorization|api.?key/i.test(key) ? key : key, /token|password|secret|authorization|api.?key/i.test(key) ? "[REDACTED]" : redact(item)]));
  return value;
};

export const incidentIdFor = (alarmArn: string, changedAt: string): string => {
  const bucket = Math.floor(new Date(changedAt).getTime() / 300_000);
  return createHash("sha256").update(`${alarmArn}:${bucket}`).digest("hex").slice(0, 32);
};

export const newAction = (type: ActionType, target: string, parameters: Record<string, unknown>, ttlSeconds: number) => ({
  actionId: randomUUID(), type, target, parameters: redact(parameters), status: "PENDING_APPROVAL",
  createdAt: new Date().toISOString(), expiresAt: Math.floor(Date.now() / 1000) + ttlSeconds,
});

export const isExpired = (expiresAt: number, now = Math.floor(Date.now() / 1000)) => expiresAt <= now;
