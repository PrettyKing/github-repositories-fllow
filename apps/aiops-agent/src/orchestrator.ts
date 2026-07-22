import type { EventBridgeEvent } from "aws-lambda";
import { BedrockAgentRuntimeClient, InvokeAgentCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { assertAlarmAllowed, loadConfig } from "./config.js";
import { incidentIdFor, redact } from "./core.js";
import { putIncidentOnce, updateIncident } from "./store.js";

const bedrock = new BedrockAgentRuntimeClient({});
type AlarmDetail = { alarmName: string; state: { value: string; reason?: string; timestamp: string }; configuration?: { metrics?: unknown } };

export const handler = async (event: EventBridgeEvent<"CloudWatch Alarm State Change", AlarmDetail>) => {
  const config = loadConfig();
  if (event.detail.state.value !== "ALARM") return { ignored: true };
  assertAlarmAllowed(event.detail.alarmName, config);
  const alarmArn = event.resources[0] ?? event.detail.alarmName;
  const incidentId = incidentIdFor(alarmArn, event.detail.state.timestamp);
  const now = new Date().toISOString();
  try {
    await putIncidentOnce(config, {
      incidentId, state: "OPEN", createdAt: now, updatedAt: now,
      expiresAt: Math.floor(Date.now() / 1000) + config.incidentTtlDays * 86400,
      alarm: redact({ arn: alarmArn, name: event.detail.alarmName, reason: event.detail.state.reason, changedAt: event.detail.state.timestamp }),
      timeline: [{ at: now, type: "ALARM_RECEIVED" }],
    });
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException || (error as { name?: string }).name === "ConditionalCheckFailedException") return { incidentId, duplicate: true };
    throw error;
  }
  await updateIncident(config, { incidentId, from: "OPEN", to: "INVESTIGATING" });
  if (!config.agentId || !config.agentAliasId) return { incidentId, agentInvoked: false };
  try {
    const response = await bedrock.send(new InvokeAgentCommand({
      agentId: config.agentId, agentAliasId: config.agentAliasId, sessionId: incidentId,
      inputText: `Investigate incident ${incidentId}. Alarm ${event.detail.alarmName} entered ALARM. Use only allowlisted tools. Clearly separate evidence, hypotheses, and unknowns. Never execute recovery; only propose an action when evidence supports it.`,
      enableTrace: true,
    }));
    let output = "";
    for await (const part of response.completion ?? []) if (part.chunk?.bytes) output += new TextDecoder().decode(part.chunk.bytes);
    await updateIncident(config, { incidentId, from: "INVESTIGATING", to: "INVESTIGATING", set: { analysis: redact(output), analyzedAt: new Date().toISOString() } });
    return { incidentId, agentInvoked: true };
  } catch (error) {
    await updateIncident(config, { incidentId, from: "INVESTIGATING", to: "FAILED", set: { error: redact((error as Error).message) } });
    throw error;
  }
};
