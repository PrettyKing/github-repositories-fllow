export interface RuntimeConfig {
  apiUrl: string;
  cognitoDomain: string;
  clientId: string;
  redirectUri: string;
  demoMode?: boolean;
}

declare global {
  interface Window { AIOPS_CONFIG: RuntimeConfig }
}

export interface Alarm { AlarmName?: string; StateReason?: string; StateUpdatedTimestamp?: string }
export interface CanaryRun { Status?: { State?: string }; Timeline?: { Started?: string; Completed?: string } }
export interface Canary { name: string; runs: CanaryRun[] }
export interface Dlq { arn: string; attributes?: Record<string, string> }
export interface Deployment { group: string; deployments: string[] }
export interface Incident { incidentId: string; state?: string; createdAt?: string; updatedAt?: string; alarmName?: string; proposedAction?: string }
export interface Overview {
  region?: string;
  alarms: Alarm[];
  canaries: Canary[];
  dlqs: Dlq[];
  deployments: Deployment[];
  incidents: Incident[];
  logGroups: string[];
}
export interface LogEvent { timestamp?: number; message?: string }
