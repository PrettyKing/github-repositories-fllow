import assert from "node:assert/strict";
import test from "node:test";
import { assertAllowed } from "../src/config.js";
import { incidentIdFor, isExpired, newAction, redact } from "../src/core.js";

test("incident ID deduplicates events in the same five-minute bucket", () => {
  assert.equal(incidentIdFor("arn:alarm", "2026-01-01T00:01:00Z"), incidentIdFor("arn:alarm", "2026-01-01T00:04:59Z"));
  assert.notEqual(incidentIdFor("arn:alarm", "2026-01-01T00:01:00Z"), incidentIdFor("arn:alarm", "2026-01-01T00:05:00Z"));
});
test("redaction removes credentials recursively", () => {
  const value = redact({ token: "abc", nested: "Authorization: Basic dXNlcjpwYXNz" }) as Record<string, unknown>;
  assert.equal(value.token, "[REDACTED]"); assert.doesNotMatch(String(value.nested), /dXNlcjpwYXNz/);
});
test("allowlist rejects arbitrary resources", () => assert.throws(() => assertAllowed("arn:evil", ["arn:good"], "queue"), /allowlist/));
test("actions are pending approval and expire", () => { const action = newAction("ROLLBACK", "app/group", {}, 60); assert.equal(action.status, "PENDING_APPROVAL"); assert.equal(isExpired(action.expiresAt), false); });
