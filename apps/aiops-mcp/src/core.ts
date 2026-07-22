const SECRET = /(authorization|token|password|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi;
export const redact = (value: unknown): unknown => {
  if (typeof value === "string") return value.replace(SECRET, "$1=[REDACTED]").replace(/Basic\s+[A-Za-z0-9+/=]+/gi, "Basic [REDACTED]").slice(0, 4000);
  if (Array.isArray(value)) return value.slice(0, 50).map(redact);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /token|password|secret|authorization|api.?key/i.test(key) ? "[REDACTED]" : redact(item)]));
  return value;
};

export const content = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify({ ok: true, data: redact(value) }) }] });
export const safeError = (error: unknown) => {
  const name = (error as { name?: string }).name ?? "Error";
  const session = /credential|token|sso|expired|unauthorized/i.test(`${name} ${(error as Error).message}`);
  return { content: [{ type: "text" as const, text: JSON.stringify({ ok: false, error: { code: session ? "AWS_SESSION_UNAVAILABLE" : "TOOL_ERROR", message: session ? "AWS session is unavailable. Run `aws sso login --profile <profile>` and retry." : redact((error as Error).message) } }) }], isError: true };
};
