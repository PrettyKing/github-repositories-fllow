import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { content, safeError } from "./core.js";
import type { OpsService } from "./service.js";

const invoke = (fn: () => unknown | Promise<unknown>) => Promise.resolve().then(fn).then(content).catch(safeError);
const incidentId = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const reason = z.string().min(10).max(500);
const idempotencyKey = z.string().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/);

export const createServer = (service: OpsService) => {
  const server = new McpServer({ name: "github-follow-aiops", version: "1.0.0" });
  server.registerTool("aws_get_system_health", { description: "Return the configured project resources and safety boundary." }, () => invoke(() => service.health()));
  server.registerTool("aws_get_active_alarms", { description: "List active CloudWatch alarms within the project allowlist." }, () => invoke(() => service.alarms()));
  server.registerTool("aws_query_logs", { description: "Read redacted events from one allowlisted log group (maximum 60 minutes and 50 events).", inputSchema: { logGroup: z.string(), minutes: z.number().int().min(1).max(60).default(15), limit: z.number().int().min(1).max(50).default(20) } }, (args) => invoke(() => service.queryLogs(args.logGroup, args.minutes, args.limit)));
  server.registerTool("aws_get_canary_runs", { description: "Get recent runs for one allowlisted Synthetics canary.", inputSchema: { canaryName: z.string() } }, ({ canaryName }) => invoke(() => service.canaryRuns(canaryName)));
  server.registerTool("aws_inspect_dlq", { description: "Read message-count attributes for one allowlisted DLQ; message bodies are never fetched.", inputSchema: { dlqArn: z.string() } }, ({ dlqArn }) => invoke(() => service.inspectDlq(dlqArn)));
  server.registerTool("aws_get_deployments", { description: "Get deployments from one allowlisted CodeDeploy application/group pair.", inputSchema: { deploymentGroup: z.string() } }, ({ deploymentGroup }) => invoke(() => service.recentDeployments(deploymentGroup)));
  server.registerTool("aws_get_incident", { description: "Get one AI Ops incident from the configured incident table.", inputSchema: { incidentId } }, ({ incidentId: id }) => invoke(() => service.incident(id)));
  server.registerTool("aws_request_dlq_redrive", { description: "Create a PENDING_APPROVAL DLQ redrive request. This tool never moves messages directly.", inputSchema: { incidentId, dlqArn: z.string(), sourceQueueArn: z.string(), reason, idempotencyKey } }, (args) => invoke(() => service.requestAction({ incidentId: args.incidentId, type: "DLQ_REDRIVE", target: args.dlqArn, parameters: { sourceQueueArn: args.sourceQueueArn }, reason: args.reason, idempotencyKey: args.idempotencyKey })));
  server.registerTool("aws_request_rollback", { description: "Create a PENDING_APPROVAL rollback request. This tool never stops a deployment directly.", inputSchema: { incidentId, deploymentGroup: z.string(), deploymentId: z.string().min(1).max(128), reason, idempotencyKey } }, (args) => invoke(() => service.requestAction({ incidentId: args.incidentId, type: "ROLLBACK", target: args.deploymentGroup, parameters: { deploymentId: args.deploymentId }, reason: args.reason, idempotencyKey: args.idempotencyKey })));
  return server;
};
