# Event consumer

Consumes `GitHubUserSynced` events from SQS. The handler validates contract v1,
claims `eventId` in DynamoDB, emits an audit log/metric, and returns Lambda's
partial batch failure response. Set `AllowTestFailure=true` only outside prod;
messages containing `testMode: force-consumer-failure` will then reach the DLQ
after three receives.

For a non-production drill, deploy the messaging stack with
`AllowTestFailure=true`, then publish a contract-v1 JSON message to the
`TopicArn` output with AWS CLI. Use unique `eventId`/`correlationId` values and
set `testMode` to `force-consumer-failure`. Never include a GitHub token or any
credential in the message. Confirm three receives and the DLQ alarm before
disabling failure injection.

To recover, first fix/disable the injected failure, then use SQS **Start DLQ
redrive** with the source queue selected and a low initial velocity. Monitor the
DLQ alarm and `EventsProcessed`; do not delete the DLQ manually.
