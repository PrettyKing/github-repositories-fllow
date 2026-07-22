const list = (name: string) => (process.env[name] ?? "").split(",").map((v) => v.trim()).filter(Boolean);
const required = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

export type Config = ReturnType<typeof loadConfig>;
export const loadConfig = () => {
  const region = process.env.AWS_REGION?.trim() || "ap-northeast-1";
  const profile = process.env.AWS_PROFILE?.trim();
  if (!/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(region)) throw new Error("AWS_REGION is invalid");
  const config = {
    region,
    profile,
    incidentTable: required("AIOPS_INCIDENT_TABLE"),
    actionApiUrl: process.env.AIOPS_ACTION_API_URL?.replace(/\/$/, "") ?? "",
    alarmNames: list("AIOPS_ALLOWED_ALARMS"),
    alarmPrefixes: list("AIOPS_ALARM_PREFIXES"),
    logGroups: list("AIOPS_ALLOWED_LOG_GROUPS"),
    canaryNames: list("AIOPS_ALLOWED_CANARIES"),
    dlqArns: list("AIOPS_ALLOWED_DLQ_ARNS"),
    sourceQueueArns: list("AIOPS_ALLOWED_SOURCE_QUEUE_ARNS"),
    deploymentGroups: list("AIOPS_ALLOWED_DEPLOYMENT_GROUPS"),
  };
  if (config.actionApiUrl && !config.actionApiUrl.startsWith("https://")) throw new Error("AIOPS_ACTION_API_URL must use HTTPS");
  return config;
};

export const assertAllowed = (value: string, allowed: readonly string[], label: string) => {
  if (!allowed.includes(value)) throw new Error(`${label} is not in the configured allowlist`);
};

// The Node.js default provider chain honors AWS_PROFILE and supports SSO-backed
// profiles without materialising or logging credentials in this process.
export const clientConfig = (config: Config) => ({ region: config.region });
