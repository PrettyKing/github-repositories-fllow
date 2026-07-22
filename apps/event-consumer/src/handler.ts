import type { SQSBatchResponse, SQSEvent, SQSRecord } from "aws-lambda";
import { CloudWatchClient, PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import { DeleteItemCommand, DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { parseEvent } from "./contract.js";

const dynamodb = new DynamoDBClient({});
const cloudwatch = new CloudWatchClient({});
const tableName = process.env.IDEMPOTENCY_TABLE_NAME ?? "";
const allowFailure = process.env.ALLOW_TEST_FAILURE === "true";

async function processRecord(record: SQSRecord): Promise<void> {
  const event = parseEvent(record.body);
  const expiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
  try {
    await dynamodb.send(new PutItemCommand({TableName: tableName, Item: {eventId:{S:event.eventId},expiresAt:{N:String(expiresAt)}}, ConditionExpression:"attribute_not_exists(eventId)"}));
  } catch (error) {
    if (error instanceof Error && error.name === "ConditionalCheckFailedException") {
      console.log(JSON.stringify({level:"info",event:"duplicate_skipped",eventId:event.eventId,correlationId:event.correlationId}));
      return;
    }
    throw error;
  }
  try {
    if (allowFailure && event.testMode === "force-consumer-failure") throw new Error("intentional consumer failure");
    console.log(JSON.stringify({level:"info",event:"github_user_synced",eventId:event.eventId,correlationId:event.correlationId,userId:event.userId,reposCount:event.reposCount,created:event.created}));
    await cloudwatch.send(new PutMetricDataCommand({Namespace:"GitHubRepositoriesFollow/Messaging",MetricData:[{MetricName:"EventsProcessed",Unit:"Count",Value:1}]}));
  } catch (error) {
    // Release the claim so Lambda retries can process the message after the cause is fixed.
    await dynamodb.send(new DeleteItemCommand({TableName:tableName,Key:{eventId:{S:event.eventId}}}));
    throw error;
  }
}

export async function handler(input: SQSEvent): Promise<SQSBatchResponse> {
  const settled = await Promise.allSettled(input.Records.map(processRecord));
  return {batchItemFailures:settled.flatMap((result,index)=>result.status === "rejected" ? [{itemIdentifier:input.Records[index]!.messageId}] : [])};
}
