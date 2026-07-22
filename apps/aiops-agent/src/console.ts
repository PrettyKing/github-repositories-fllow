import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { randomUUID } from "node:crypto";
import { CloudWatchClient, DescribeAlarmsCommand } from "@aws-sdk/client-cloudwatch";
import { CloudWatchLogsClient, FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { CodeDeployClient, ListDeploymentsCommand } from "@aws-sdk/client-codedeploy";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { GetQueueAttributesCommand, SQSClient } from "@aws-sdk/client-sqs";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import { GetCanaryRunsCommand, SyntheticsClient } from "@aws-sdk/client-synthetics";
import { redact } from "./core.js";

const cw = new CloudWatchClient({}); const logs = new CloudWatchLogsClient({}); const deployments = new CodeDeployClient({});
const sqs = new SQSClient({}); const sns = new SNSClient({}); const synthetics = new SyntheticsClient({});
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const list = (name: string) => (process.env[name] ?? "").split(",").map((v) => v.trim()).filter(Boolean);
const config = () => ({ table: process.env.INCIDENT_TABLE ?? "", alarms: list("ALLOWED_ALARMS"), alarmPrefixes: list("ALARM_PREFIXES"), logGroups: list("ALLOWED_LOG_GROUPS"), canaries: list("ALLOWED_CANARIES"), dlqs: list("ALLOWED_DLQ_ARNS"), deploymentGroups: list("ALLOWED_DEPLOYMENT_GROUPS"), topicArn: process.env.TEST_TOPIC_ARN ?? "" });
const json = (statusCode: number, body: unknown): APIGatewayProxyResultV2 => ({ statusCode, headers: { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" }, body: JSON.stringify(redact(body)) });
const allowed = (value: string, values: string[], label: string) => { if (!values.includes(value)) throw new Error(`${label} is not allowlisted`); };
const queueUrl = (arn: string) => { const p = arn.split(":"); return `https://sqs.${p[3]}.amazonaws.com/${p[4]}/${p[5]}`; };

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const c = config(); const method = event.requestContext.http.method; const path = event.rawPath;
  try {
    if (method === "GET" && path === "/overview") {
      const [alarmResult, canaries, dlqs, deploymentResults, incidentResult] = await Promise.all([
        cw.send(new DescribeAlarmsCommand({ StateValue: "ALARM", MaxRecords: 50 })),
        Promise.all(c.canaries.map(async (name) => ({ name, runs: (await synthetics.send(new GetCanaryRunsCommand({ Name: name, MaxResults: 5 }))).CanaryRuns ?? [] }))),
        Promise.all(c.dlqs.map(async (arn) => ({ arn, attributes: (await sqs.send(new GetQueueAttributesCommand({ QueueUrl: queueUrl(arn), AttributeNames: ["ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible"] }))).Attributes }))),
        Promise.all(c.deploymentGroups.map(async (group) => { const [applicationName, deploymentGroupName] = group.split("/"); return { group, deployments: (await deployments.send(new ListDeploymentsCommand({ applicationName, deploymentGroupName, createTimeRange: { start: new Date(Date.now() - 86400000) } }))).deployments ?? [] }; })),
        db.send(new ScanCommand({ TableName: c.table, Limit: 100 })),
      ]);
      const alarms = (alarmResult.MetricAlarms ?? []).filter((a) => c.alarms.includes(a.AlarmName ?? "") || c.alarmPrefixes.some((p) => a.AlarmName?.startsWith(p))).map(({ AlarmName, StateReason, StateUpdatedTimestamp }) => ({ AlarmName, StateReason, StateUpdatedTimestamp }));
      const incidents = (incidentResult.Items ?? []).sort((a, b) => String(b.updatedAt ?? b.createdAt ?? "").localeCompare(String(a.updatedAt ?? a.createdAt ?? ""))).slice(0, 20).map((i) => ({ incidentId: i.incidentId, state: i.state, createdAt: i.createdAt, updatedAt: i.updatedAt, alarmName: i.alarm?.name, proposedAction: i.proposedAction?.type }));
      return json(200, { region: process.env.AWS_REGION, alarms, canaries, dlqs, deployments: deploymentResults, incidents, logGroups: c.logGroups });
    }
    if (method === "GET" && path === "/logs") {
      const group = event.queryStringParameters?.group ?? ""; allowed(group, c.logGroups, "log group");
      const minutes = Math.min(60, Math.max(1, Number(event.queryStringParameters?.minutes ?? 15)));
      const result = await logs.send(new FilterLogEventsCommand({ logGroupName: group, startTime: Date.now() - minutes * 60000, limit: 30 }));
      return json(200, (result.events ?? []).map(({ timestamp, message }) => ({ timestamp, message })));
    }
    const detail = path.match(/^\/incidents\/([^/]+)$/);
    if (method === "GET" && detail) return json(200, (await db.send(new GetCommand({ TableName: c.table, Key: { incidentId: detail[1] } }))).Item ?? null);
    if (method === "POST" && path === "/queue-tests") {
      if (!c.topicArn) return json(409, { error: "test_topic_not_configured" });
      const id = `console-${randomUUID()}`; const occurredAt = new Date().toISOString();
      const message = { eventVersion: "1", eventType: "GitHubUserSynced", eventId: id, occurredAt, correlationId: id, userId: 0, githubId: 0, username: "aiops-console-smoke", reposCount: 0, created: false };
      const result = await sns.send(new PublishCommand({ TopicArn: c.topicArn, Message: JSON.stringify(message), MessageAttributes: { eventType: { DataType: "String", StringValue: "GitHubUserSynced" }, eventVersion: { DataType: "String", StringValue: "1" } } }));
      return json(202, { mode: "normal", eventId: id, messageId: result.MessageId, publishedAt: occurredAt });
    }
    return json(404, { error: "not_found" });
  } catch (error) {
    console.error(JSON.stringify({ event: "console_api_error", error: redact((error as Error).message) }));
    return json(400, { error: (error as Error).message });
  }
};
