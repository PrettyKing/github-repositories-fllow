import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { Config } from "./config.js";

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
export const getIncident = async (config: Config, incidentId: string) => (await db.send(new GetCommand({ TableName: config.tableName, Key: { incidentId } }))).Item;
export const putIncidentOnce = async (config: Config, item: Record<string, unknown>) => db.send(new PutCommand({ TableName: config.tableName, Item: item, ConditionExpression: "attribute_not_exists(incidentId)" }));
export const listIncidents = async (config: Config, limit = 25) => (await db.send(new ScanCommand({ TableName: config.tableName, Limit: Math.min(Math.max(limit, 1), 100) }))).Items ?? [];
export const updateIncident = async (config: Config, input: { incidentId: string; from: string; to: string; set?: Record<string, unknown> }) => {
  const names: Record<string, string> = { "#state": "state" };
  const values: Record<string, unknown> = { ":from": input.from, ":to": input.to, ":now": new Date().toISOString() };
  const clauses = ["#state = :to", "updatedAt = :now"];
  for (const [key, value] of Object.entries(input.set ?? {})) {
    names[`#${key}`] = key; values[`:${key}`] = value; clauses.push(`#${key} = :${key}`);
  }
  return db.send(new UpdateCommand({ TableName: config.tableName, Key: { incidentId: input.incidentId }, UpdateExpression: `SET ${clauses.join(", ")}`, ConditionExpression: "#state = :from", ExpressionAttributeNames: names, ExpressionAttributeValues: values, ReturnValues: "ALL_NEW" }));
};
