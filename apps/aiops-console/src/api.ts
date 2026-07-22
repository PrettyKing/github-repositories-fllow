import { getToken } from "./auth";
import type { LogEvent, Overview } from "./types";

const apiUrl = window.AIOPS_CONFIG.apiUrl.replace(/\/$/, "");
const demoMode = window.AIOPS_CONFIG.demoMode === true;
const demoOverview: Overview = {
  region: "ap-northeast-1",
  alarms: [],
  canaries: [{ name: "prod-api-journey", runs: [{ Status: { State: "PASSED" } }, { Status: { State: "PASSED" } }, { Status: { State: "PASSED" } }] }],
  dlqs: [{ arn: "arn:aws:sqs:ap-northeast-1:000000000000:github-repositories-fllow-github-events-dlq", attributes: { ApproximateNumberOfMessages: "0", ApproximateNumberOfMessagesNotVisible: "0" } }],
  deployments: [{ group: "github-repositories-fllow/ApiFunctionDeploymentGroup", deployments: [] }],
  incidents: [
    { incidentId: "inc-demo-resolved", state: "RESOLVED", alarmName: "api-latency-recovered", createdAt: new Date(Date.now() - 7_200_000).toISOString(), updatedAt: new Date(Date.now() - 5_400_000).toISOString(), proposedAction: "observe" },
    { incidentId: "inc-demo-001", state: "OPEN", alarmName: "consumer-error-rate", createdAt: new Date(Date.now() - 1_800_000).toISOString(), updatedAt: new Date(Date.now() - 900_000).toISOString(), proposedAction: "inspect_logs" },
  ],
  logGroups: ["/aws/lambda/github-repositories-fllow-ApiFunction", "/aws/lambda/github-repositories-fllow-event-consumer"],
};
const demoLogs: LogEvent[] = [
  { timestamp: Date.now() - 42_000, message: JSON.stringify({ level: "info", event: "request_completed", path: "/health", status: 200, durationMs: 31 }) },
  { timestamp: Date.now() - 95_000, message: JSON.stringify({ level: "info", event: "message_processed", eventType: "GitHubUserSynced", durationMs: 84 }) },
];

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${getToken() ?? ""}`, "content-type": "application/json", ...init?.headers },
  });
  const body = await response.json() as T & { error?: string };
  if (response.status === 401 || response.status === 403) {
    sessionStorage.clear();
    window.location.reload();
    throw new Error("登录已过期，请重新登录");
  }
  if (!response.ok) throw new Error(body.error ?? `请求失败 (${response.status})`);
  return body;
}

export const api = {
  overview: () => demoMode ? Promise.resolve(demoOverview) : request<Overview>("/overview"),
  logs: (group: string, minutes: number) => demoMode ? Promise.resolve(demoLogs) : request<LogEvent[]>(`/logs?group=${encodeURIComponent(group)}&minutes=${minutes}`),
  incident: (id: string) => demoMode ? Promise.resolve({ incidentId: id, state: id.includes("resolved") ? "RESOLVED" : "OPEN", summary: "本地预览数据：Consumer 错误率短时升高。", evidence: ["CloudWatch alarm", "Lambda error logs"], proposedAction: { type: "inspect_logs", requiresApproval: false } }) : request<Record<string, unknown> | null>(`/incidents/${encodeURIComponent(id)}`),
  queueTest: () => demoMode ? Promise.resolve({ mode: "demo", eventId: `console-demo-${crypto.randomUUID()}`, messageId: "local-preview", publishedAt: new Date().toISOString() }) : request<Record<string, unknown>>("/queue-tests", { method: "POST", body: "{}" }),
};
