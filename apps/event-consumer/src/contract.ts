export type GitHubUserSynced = {
  eventVersion: "1";
  eventType: "GitHubUserSynced";
  eventId: string;
  occurredAt: string;
  correlationId: string;
  userId: number;
  githubId: number;
  username: string;
  reposCount: number;
  created: boolean;
  testMode?: "force-consumer-failure";
};

export function parseEvent(body: string): GitHubUserSynced {
  const value: unknown = JSON.parse(body);
  if (!value || typeof value !== "object") throw new Error("invalid event object");
  const v = value as Record<string, unknown>;
  if (v.eventVersion !== "1" || v.eventType !== "GitHubUserSynced") throw new Error("unsupported event contract");
  for (const key of ["eventId", "occurredAt", "correlationId", "username"])
    if (typeof v[key] !== "string" || v[key] === "") throw new Error(`invalid ${key}`);
  for (const key of ["userId", "githubId", "reposCount"])
    if (typeof v[key] !== "number" || !Number.isSafeInteger(v[key]) || v[key] < 0) throw new Error(`invalid ${key}`);
  if (typeof v.created !== "boolean") throw new Error("invalid created");
  if (v.testMode !== undefined && v.testMode !== "force-consumer-failure") throw new Error("invalid testMode");
  return v as GitHubUserSynced;
}
