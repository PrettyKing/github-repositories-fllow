import test from "node:test";
import assert from "node:assert/strict";
// Tests the source contract without requiring an AWS account after build.
test("contract excludes credentials", async () => {
  const source = await import("node:fs/promises").then(fs => fs.readFile(new URL("../src/contract.ts", import.meta.url), "utf8"));
  assert.doesNotMatch(source, /Token\s*:/);
  assert.match(source, /eventVersion/);
});
