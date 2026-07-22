export type Config = ReturnType<typeof loadConfig>;

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const list = (name: string): string[] =>
  (process.env[name] ?? "").split(",").map((item) => item.trim()).filter(Boolean);

export const loadConfig = () => ({
  tableName: required("INCIDENT_TABLE"),
  agentId: process.env.BEDROCK_AGENT_ID ?? "",
  agentAliasId: process.env.BEDROCK_AGENT_ALIAS_ID ?? "",
  executorFunctionName: process.env.EXECUTOR_FUNCTION_NAME ?? "",
  alarmPrefixes: list("ALARM_PREFIXES"),
  alarmNames: list("ALLOWED_ALARMS"),
  logGroups: list("ALLOWED_LOG_GROUPS"),
  canaryNames: list("ALLOWED_CANARIES"),
  dlqArns: list("ALLOWED_DLQ_ARNS"),
  sourceQueueArns: list("ALLOWED_SOURCE_QUEUE_ARNS"),
  deploymentGroups: list("ALLOWED_DEPLOYMENT_GROUPS"),
  actionTtlSeconds: Number(process.env.ACTION_TTL_SECONDS ?? 3600),
  incidentTtlDays: Number(process.env.INCIDENT_TTL_DAYS ?? 30),
});

export const assertAllowed = (value: string, allowed: string[], label: string): void => {
  if (!allowed.includes(value)) throw new Error(`${label} is not in the configured allowlist`);
};

export const assertAlarmAllowed = (name: string, config: Config): void => {
  if (config.alarmNames.includes(name)) return;
  if (config.alarmPrefixes.some((prefix) => name.startsWith(prefix))) return;
  throw new Error("alarm is not in the configured allowlist");
};
