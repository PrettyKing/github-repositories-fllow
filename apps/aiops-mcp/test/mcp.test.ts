import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Config } from "../src/config.js";
import { createServer } from "../src/server.js";
import { OpsService } from "../src/service.js";

const config: Config = {
  region: "ap-northeast-1", profile: "test", incidentTable: "incidents", actionApiUrl: "https://ops.example.test",
  alarmNames: ["project-api-errors"], alarmPrefixes: ["project-"], logGroups: ["/aws/lambda/project"], canaryNames: ["project-api"],
  dlqArns: ["arn:aws:sqs:ap-northeast-1:123456789012:project-dlq"], sourceQueueArns: ["arn:aws:sqs:ap-northeast-1:123456789012:project-events"], deploymentGroups: ["project/api"],
};
const clients = {
  cw: { send: async () => ({ MetricAlarms: [] }) }, logs: { send: async () => ({ events: [] }) }, sqs: { send: async () => ({ Attributes: {} }) },
  synthetics: { send: async () => ({ CanaryRuns: [] }) }, deployments: { send: async () => ({ deployments: [] }) }, db: { send: async () => ({ Item: { incidentId: "incident-1", state: "INVESTIGATING" } }) },
};

test("client discovers all constrained tools and calls health", async () => {
  const server = createServer(new OpsService(config, clients));
  const client = new Client({ name: "test-client", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), ["aws_get_active_alarms", "aws_get_canary_runs", "aws_get_deployments", "aws_get_incident", "aws_get_system_health", "aws_inspect_dlq", "aws_query_logs", "aws_request_dlq_redrive", "aws_request_rollback"].sort());
  const result = await client.callTool({ name: "aws_get_system_health", arguments: {} });
  assert.equal(result.isError, undefined);
  assert.match(JSON.stringify(result.content), /ap-northeast-1/);
  await Promise.all([client.close(), server.close()]);
});

test("rejects non-allowlisted and out-of-quota log requests before AWS", async () => {
  let calls = 0;
  const service = new OpsService(config, { ...clients, logs: { send: async () => { calls += 1; return {}; } } });
  await assert.rejects(service.queryLogs("/aws/lambda/other", 15, 20), /allowlist/);
  await assert.rejects(service.queryLogs("/aws/lambda/project", 61, 20), /between 1 and 60/);
  assert.equal(calls, 0);
});

test("rejects cross-region DLQ ARN before AWS", async () => {
  const crossRegion = { ...config, dlqArns: ["arn:aws:sqs:us-east-1:123456789012:project-dlq"] };
  await assert.rejects(new OpsService(crossRegion, clients).inspectDlq(crossRegion.dlqArns[0]!), /configured region/);
});

test("write tool only posts an approval request and requires PENDING_APPROVAL", async () => {
  const originalFetch = globalThis.fetch;
  let request: RequestInit | undefined;
  globalThis.fetch = async (_url, init) => { request = init; return new Response(JSON.stringify({ actionId: "a-1", status: "PENDING_APPROVAL" }), { status: 202, headers: { "content-type": "application/json" } }); };
  try {
    const signer = { sign: async (signedRequest: any) => ({ ...signedRequest, headers: { ...signedRequest.headers, authorization: "test-signature" } }) };
    const result = await new OpsService(config, clients, signer).requestAction({ incidentId: "incident-1", type: "DLQ_REDRIVE", target: config.dlqArns[0]!, parameters: { sourceQueueArn: config.sourceQueueArns[0]! }, reason: "Messages failed after deployment", idempotencyKey: "incident-1:redrive" });
    assert.equal(result.status, "PENDING_APPROVAL");
    assert.equal(request?.method, "POST");
    assert.equal(new Headers(request?.headers).get("authorization"), "test-signature");
    assert.match(String(request?.body), /DLQ_REDRIVE/);
  } finally { globalThis.fetch = originalFetch; }
});
