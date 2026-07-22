import { CloudWatchClient, DescribeAlarmsCommand } from "@aws-sdk/client-cloudwatch";
import { CloudWatchLogsClient, FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { CodeDeployClient, ListDeploymentsCommand } from "@aws-sdk/client-codedeploy";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetQueueAttributesCommand, SQSClient } from "@aws-sdk/client-sqs";
import { GetCanaryRunsCommand, SyntheticsClient } from "@aws-sdk/client-synthetics";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { Sha256 } from "@aws-crypto/sha256-js";
import { HttpRequest } from "@smithy/protocol-http";
import { SignatureV4 } from "@smithy/signature-v4";
import { assertAllowed, clientConfig, type Config } from "./config.js";
import { redact } from "./core.js";

const queueUrl = (arn: string, region: string) => {
  const parts = arn.split(":");
  if (parts.length !== 6 || parts[2] !== "sqs" || parts[3] !== region) throw new Error("DLQ ARN must be an SQS ARN in the configured region");
  return `https://sqs.${region}.amazonaws.com/${parts[4]}/${parts[5]}`;
};

export class OpsService {
  private readonly cw; private readonly logs; private readonly sqs; private readonly synthetics; private readonly deployments; private readonly db; private readonly signer;
  constructor(
    private readonly config: Config,
    clients?: Partial<Record<"cw" | "logs" | "sqs" | "synthetics" | "deployments" | "db", { send(command: unknown): Promise<any> }>>,
    signer?: { sign(request: HttpRequest): Promise<HttpRequest> },
  ) {
    const aws = clientConfig(config);
    this.cw = clients?.cw ?? new CloudWatchClient(aws); this.logs = clients?.logs ?? new CloudWatchLogsClient(aws);
    this.sqs = clients?.sqs ?? new SQSClient(aws); this.synthetics = clients?.synthetics ?? new SyntheticsClient(aws);
    this.deployments = clients?.deployments ?? new CodeDeployClient(aws);
    this.db = clients?.db ?? DynamoDBDocumentClient.from(new DynamoDBClient(aws));
    this.signer = signer ?? new SignatureV4({
      credentials: defaultProvider({ profile: this.config.profile }),
      region: this.config.region,
      service: "lambda",
      sha256: Sha256,
    });
  }
  health() { return { region: this.config.region, alarms: this.config.alarmNames, logGroups: this.config.logGroups, canaries: this.config.canaryNames, dlqs: this.config.dlqArns, deploymentGroups: this.config.deploymentGroups }; }
  async alarms() {
    const result = await this.cw.send(new DescribeAlarmsCommand({ StateValue: "ALARM", MaxRecords: 50 }));
    return (result.MetricAlarms ?? []).filter((a: any) => this.config.alarmNames.includes(a.AlarmName) || this.config.alarmPrefixes.some((p) => a.AlarmName?.startsWith(p))).map(({ AlarmName, StateReason, StateUpdatedTimestamp }: any) => ({ AlarmName, StateReason: redact(StateReason), StateUpdatedTimestamp }));
  }
  async queryLogs(logGroup: string, minutes: number, limit: number) {
    assertAllowed(logGroup, this.config.logGroups, "log group");
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) throw new Error("minutes must be between 1 and 60");
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("limit must be between 1 and 50");
    const result = await this.logs.send(new FilterLogEventsCommand({ logGroupName: logGroup, startTime: Date.now() - minutes * 60_000, limit }));
    return (result.events ?? []).map(({ timestamp, message }: any) => ({ timestamp, message: redact(message) }));
  }
  async canaryRuns(name: string) { assertAllowed(name, this.config.canaryNames, "canary"); const r = await this.synthetics.send(new GetCanaryRunsCommand({ Name: name, MaxResults: 10 })); return (r.CanaryRuns ?? []).map(({ Id, Status, Timeline }: any) => ({ Id, Status, Timeline })); }
  async inspectDlq(arn: string) { assertAllowed(arn, this.config.dlqArns, "DLQ"); return (await this.sqs.send(new GetQueueAttributesCommand({ QueueUrl: queueUrl(arn, this.config.region), AttributeNames: ["ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible"] }))).Attributes; }
  async recentDeployments(group: string) { assertAllowed(group, this.config.deploymentGroups, "deployment group"); const [applicationName, deploymentGroupName] = group.split("/"); return this.deployments.send(new ListDeploymentsCommand({ applicationName, deploymentGroupName, includeOnlyStatuses: ["Created", "Queued", "InProgress", "Succeeded", "Failed", "Stopped"], createTimeRange: { start: new Date(Date.now() - 86_400_000) } })); }
  async incident(id: string) { if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error("incidentId is invalid"); return (await this.db.send(new GetCommand({ TableName: this.config.incidentTable, Key: { incidentId: id } }))).Item ?? null; }
  async requestAction(input: { incidentId: string; type: "DLQ_REDRIVE" | "ROLLBACK"; target: string; parameters: Record<string, string>; reason: string; idempotencyKey: string }) {
    if (!this.config.actionApiUrl) throw new Error("AIOPS_ACTION_API_URL is required for action requests");
    if (input.type === "DLQ_REDRIVE") { assertAllowed(input.target, this.config.dlqArns, "DLQ"); assertAllowed(input.parameters.sourceQueueArn ?? "", this.config.sourceQueueArns, "source queue"); }
    else assertAllowed(input.target, this.config.deploymentGroups, "deployment group");
    const url = new URL(`${this.config.actionApiUrl}/incidents/${encodeURIComponent(input.incidentId)}/actions`);
    const body = JSON.stringify({ type: input.type, target: input.target, parameters: input.parameters, reason: input.reason });
    // The approval Lambda URL uses AWS_IAM auth. Sign with the same short-lived
    // SSO/profile credential chain as the read-only SDK clients; never expose it.
    const signed = await this.signer.sign(new HttpRequest({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port ? Number(url.port) : undefined,
      method: "POST",
      path: `${url.pathname}${url.search}`,
      headers: { host: url.host, "content-type": "application/json", "idempotency-key": input.idempotencyKey },
      body,
    }));
    const response = await fetch(url, { method: "POST", headers: signed.headers, body });
    if (!response.ok) throw new Error(`Action request API returned HTTP ${response.status}`);
    const result = await response.json() as { status?: string };
    if (result.status !== "PENDING_APPROVAL") throw new Error("Action API did not return PENDING_APPROVAL");
    return result;
  }
}
