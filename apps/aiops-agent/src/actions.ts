import { CloudWatchClient, DescribeAlarmsCommand } from "@aws-sdk/client-cloudwatch";
import { CloudWatchLogsClient, FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { CodeDeployClient, ListDeploymentsCommand } from "@aws-sdk/client-codedeploy";
import { SQSClient, GetQueueAttributesCommand } from "@aws-sdk/client-sqs";
import { SyntheticsClient, GetCanaryRunsCommand } from "@aws-sdk/client-synthetics";
import { assertAllowed, loadConfig } from "./config.js";
import { newAction, redact, type ActionType } from "./core.js";
import { getIncident, updateIncident } from "./store.js";

const cw = new CloudWatchClient({}); const logs = new CloudWatchLogsClient({}); const sqs = new SQSClient({});
const synthetics = new SyntheticsClient({}); const deployments = new CodeDeployClient({});
const arnToUrl = (arn: string) => `https://sqs.${arn.split(":")[3]}.amazonaws.com/${arn.split(":")[4]}/${arn.split(":")[5]}`;

type BedrockEvent = { actionGroup: string; function: string; parameters?: { name: string; value: string }[]; sessionAttributes?: Record<string, string> };
const argsOf = (event: BedrockEvent) => Object.fromEntries((event.parameters ?? []).map(({ name, value }) => [name, value]));
const response = (event: BedrockEvent, body: unknown) => ({ messageVersion: "1.0", response: { actionGroup: event.actionGroup, function: event.function, functionResponse: { responseBody: { TEXT: { body: JSON.stringify(redact(body)) } } } } });

export const handler = async (event: BedrockEvent) => {
  const config = loadConfig(); const args = argsOf(event); let result: unknown;
  switch (event.function) {
    case "get_active_alarms":
      result = (await cw.send(new DescribeAlarmsCommand({ StateValue: "ALARM", AlarmNamePrefix: config.alarmPrefixes[0], MaxRecords: 50 }))).MetricAlarms?.map(({ AlarmName, StateReason, StateUpdatedTimestamp }) => ({ AlarmName, StateReason: redact(StateReason), StateUpdatedTimestamp })); break;
    case "query_service_logs": { const group = String(args.logGroup ?? ""); assertAllowed(group, config.logGroups, "log group"); const minutes = Math.min(Number(args.minutes ?? 15), 60); result = (await logs.send(new FilterLogEventsCommand({ logGroupName: group, startTime: Date.now() - minutes * 60_000, limit: Math.min(Number(args.limit ?? 20), 50) }))).events?.map(({ timestamp, message }) => ({ timestamp, message: redact(message) })); break; }
    case "get_canary_runs": { const name = String(args.canaryName ?? ""); assertAllowed(name, config.canaryNames, "canary"); result = (await synthetics.send(new GetCanaryRunsCommand({ Name: name, MaxResults: 10 }))).CanaryRuns?.map(({ Id, Status, Timeline }) => ({ Id, Status, Timeline })); break; }
    case "inspect_dlq": { const arn = String(args.dlqArn ?? ""); assertAllowed(arn, config.dlqArns, "DLQ"); result = (await sqs.send(new GetQueueAttributesCommand({ QueueUrl: arnToUrl(arn), AttributeNames: ["ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible"] }))).Attributes; break; }
    case "get_recent_deployments": { const pair = String(args.deploymentGroup ?? ""); assertAllowed(pair, config.deploymentGroups, "deployment group"); const [applicationName, deploymentGroupName] = pair.split("/"); result = await deployments.send(new ListDeploymentsCommand({ applicationName, deploymentGroupName, includeOnlyStatuses: ["Created", "Queued", "InProgress", "Succeeded", "Failed", "Stopped"], createTimeRange: { start: new Date(Date.now() - 86400000) } })); break; }
    case "get_system_health": result = { allowedAlarms: config.alarmNames, logGroups: config.logGroups, canaries: config.canaryNames, dlqs: config.dlqArns, deploymentGroups: config.deploymentGroups }; break;
    case "request_dlq_redrive": result = await propose(config, String(args.incidentId), "DLQ_REDRIVE", String(args.dlqArn), { sourceQueueArn: args.sourceQueueArn }); break;
    case "request_rollback": result = await propose(config, String(args.incidentId), "ROLLBACK", String(args.deploymentGroup), { deploymentId: args.deploymentId }); break;
    default: throw new Error("Function is not in the tool allowlist");
  }
  return response(event, result);
};

const propose = async (config: ReturnType<typeof loadConfig>, incidentId: string, type: ActionType, target: string, parameters: Record<string, unknown>) => {
  if (type === "DLQ_REDRIVE") { assertAllowed(target, config.dlqArns, "DLQ"); assertAllowed(String(parameters.sourceQueueArn), config.sourceQueueArns, "source queue"); }
  else assertAllowed(target, config.deploymentGroups, "deployment group");
  const incident = await getIncident(config, incidentId); if (!incident) throw new Error("Incident not found");
  const action = newAction(type, target, parameters, config.actionTtlSeconds);
  await updateIncident(config, { incidentId, from: "INVESTIGATING", to: "ACTION_PROPOSED", set: { proposedAction: action } });
  return action;
};
