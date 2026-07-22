import type { EventBridgeEvent } from "aws-lambda";
import { CodeDeployClient, GetDeploymentCommand, StopDeploymentCommand } from "@aws-sdk/client-codedeploy";
import { SQSClient, StartMessageMoveTaskCommand } from "@aws-sdk/client-sqs";
import { assertAllowed, loadConfig } from "./config.js";
import { isExpired, redact } from "./core.js";
import { getIncident, updateIncident } from "./store.js";

const sqs = new SQSClient({}); const codeDeploy = new CodeDeployClient({});
export const handler = async (event: EventBridgeEvent<"ApprovedAction", { incidentId: string }>) => {
  const config = loadConfig(); const incidentId = event.detail.incidentId;
  const incident = await getIncident(config, incidentId); if (!incident) throw new Error("Incident not found");
  if (incident.state !== "APPROVED") throw new Error("Action is not approved");
  const action = incident.proposedAction as { actionId: string; type: string; target: string; parameters: Record<string, unknown>; expiresAt: number };
  if (!action || isExpired(action.expiresAt)) throw new Error("Action is missing or expired");
  await updateIncident(config, { incidentId, from: "APPROVED", to: "EXECUTING", set: { executionStartedAt: new Date().toISOString() } });
  try {
    let result: unknown;
    if (action.type === "DLQ_REDRIVE") {
      assertAllowed(action.target, config.dlqArns, "DLQ");
      const sourceQueueArn = String(action.parameters.sourceQueueArn); assertAllowed(sourceQueueArn, config.sourceQueueArns, "source queue");
      result = await sqs.send(new StartMessageMoveTaskCommand({ SourceArn: action.target, DestinationArn: sourceQueueArn }));
    } else if (action.type === "ROLLBACK") {
      assertAllowed(action.target, config.deploymentGroups, "deployment group");
      const deploymentId = String(action.parameters.deploymentId); const deployment = (await codeDeploy.send(new GetDeploymentCommand({ deploymentId }))).deploymentInfo;
      const [applicationName, deploymentGroupName] = action.target.split("/");
      if (!deployment || deployment.applicationName !== applicationName || deployment.deploymentGroupName !== deploymentGroupName) throw new Error("Deployment does not belong to the allowlisted deployment group");
      result = await codeDeploy.send(new StopDeploymentCommand({ deploymentId, autoRollbackEnabled: true }));
    } else throw new Error("Action type is not executable");
    await updateIncident(config, { incidentId, from: "EXECUTING", to: "RESOLVED", set: { executionResult: redact(result), executedAt: new Date().toISOString() } });
    return { incidentId, actionId: action.actionId, status: "RESOLVED" };
  } catch (error) {
    await updateIncident(config, { incidentId, from: "EXECUTING", to: "FAILED", set: { executionError: redact((error as Error).message) } }); throw error;
  }
};
