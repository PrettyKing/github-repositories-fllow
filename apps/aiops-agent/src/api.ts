import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { assertAllowed, loadConfig } from "./config.js";
import { isExpired, newAction, redact, type ActionType } from "./core.js";
import { getIncident, listIncidents, updateIncident } from "./store.js";

const lambda = new LambdaClient({});
const json = (statusCode: number, body: unknown): APIGatewayProxyResultV2 => ({ statusCode, headers: { "content-type": "application/json", "cache-control": "no-store" }, body: JSON.stringify(redact(body)) });
export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const config = loadConfig(); const method = event.requestContext.http.method; const path = event.rawPath;
  try {
    if (method === "GET" && path === "/incidents") return json(200, await listIncidents(config, Number(event.queryStringParameters?.limit ?? 25)));
    const detail = path.match(/^\/incidents\/([^/]+)$/); if (method === "GET" && detail) { const item = await getIncident(config, detail[1]!); return item ? json(200, item) : json(404, { error: "not_found" }); }
    const proposal = path.match(/^\/incidents\/([^/]+)\/actions$/);
    if (method === "POST" && proposal) {
      const incidentId = proposal[1]!;
      const body = JSON.parse(event.body ?? "{}") as { type?: ActionType; target?: string; parameters?: Record<string, unknown>; reason?: string };
      if (body.type !== "DLQ_REDRIVE" && body.type !== "ROLLBACK") return json(400, { error: "invalid_action_type" });
      const target = String(body.target ?? ""); const parameters = body.parameters ?? {};
      if (body.type === "DLQ_REDRIVE") {
        assertAllowed(target, config.dlqArns, "DLQ");
        assertAllowed(String(parameters.sourceQueueArn ?? ""), config.sourceQueueArns, "source queue");
      } else assertAllowed(target, config.deploymentGroups, "deployment group");
      const action = newAction(body.type, target, { ...parameters, reason: String(body.reason ?? "") }, config.actionTtlSeconds);
      await updateIncident(config, { incidentId, from: "INVESTIGATING", to: "ACTION_PROPOSED", set: { proposedAction: action } });
      return json(202, action);
    }
    const decision = path.match(/^\/incidents\/([^/]+)\/(approve|reject)$/);
    if (method === "POST" && decision) {
      const incidentId = decision[1]!; const operation = decision[2]!; const incident = await getIncident(config, incidentId); if (!incident) return json(404, { error: "not_found" });
      const action = incident.proposedAction as { expiresAt?: number } | undefined;
      if (!action?.expiresAt || isExpired(action.expiresAt)) return json(409, { error: "action_expired" });
      const principal = (event.requestContext as typeof event.requestContext & { authorizer?: { iam?: { userArn?: string } } }).authorizer?.iam?.userArn ?? "unknown-iam-principal";
      const target = operation === "approve" ? "APPROVED" : "REJECTED";
      const updated = await updateIncident(config, { incidentId, from: "ACTION_PROPOSED", to: target, set: { decision: { operation, principal, at: new Date().toISOString() } } });
      if (target === "APPROVED") await lambda.send(new InvokeCommand({ FunctionName: config.executorFunctionName, InvocationType: "Event", Payload: Buffer.from(JSON.stringify({ detail: { incidentId }, "detail-type": "ApprovedAction", source: "aiops.approval" })) }));
      return json(202, updated.Attributes);
    }
    return json(404, { error: "not_found" });
  } catch (error) {
    if ((error as { name?: string }).name === "ConditionalCheckFailedException") return json(409, { error: "invalid_state_transition" });
    console.error(JSON.stringify({ event: "api_error", error: redact((error as Error).message) })); return json(500, { error: "internal_error" });
  }
};
