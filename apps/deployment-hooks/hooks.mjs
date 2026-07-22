import { CodeDeployClient, PutLifecycleEventHookExecutionStatusCommand } from "@aws-sdk/client-codedeploy";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";

const codeDeploy = new CodeDeployClient({});
const lambda = new LambdaClient({});

const apiGatewayHealthEvent = {
  version: "2.0",
  routeKey: "GET /health",
  rawPath: "/health",
  rawQueryString: "",
  headers: {},
  requestContext: {
    accountId: "deployment-hook",
    apiId: "deployment-hook",
    domainName: "deployment-hook",
    domainPrefix: "deployment-hook",
    http: { method: "GET", path: "/health", protocol: "HTTP/1.1", sourceIp: "127.0.0.1", userAgent: "deployment-hook" },
    requestId: "deployment-hook",
    routeKey: "GET /health",
    stage: "$default",
    time: "01/Jan/1970:00:00:00 +0000",
    timeEpoch: 0,
  },
  isBase64Encoded: false,
};

async function report(event, status) {
  await codeDeploy.send(new PutLifecycleEventHookExecutionStatusCommand({
    deploymentId: event.DeploymentId,
    lifecycleEventHookExecutionId: event.LifecycleEventHookExecutionId,
    status,
  }));
}

function assertHealthyResponse(response) {
  if (response.statusCode !== 200) throw new Error(`health check returned ${response.statusCode}`);
  const body = JSON.parse(response.body ?? "{}");
  if (body.status !== "ok" || body.role !== "proxy") throw new Error("health response contract mismatch");
}

async function runHook(event, check) {
  let status = "Succeeded";
  try {
    await check();
  } catch (error) {
    status = "Failed";
    console.error("deployment health check failed", { deploymentId: event.DeploymentId, error: String(error) });
  }
  await report(event, status);
}

export async function preTraffic(event) {
  await runHook(event, async () => {
    const result = await lambda.send(new InvokeCommand({
      FunctionName: process.env.TARGET_FUNCTION_NAME,
      Qualifier: process.env.TARGET_FUNCTION_VERSION,
      InvocationType: "RequestResponse",
      Payload: Buffer.from(JSON.stringify(apiGatewayHealthEvent)),
    }));
    if (result.FunctionError) throw new Error(`candidate invocation failed: ${result.FunctionError}`);
    assertHealthyResponse(JSON.parse(Buffer.from(result.Payload ?? []).toString("utf8")));
  });
}

export async function postTraffic(event) {
  await runHook(event, async () => {
    const result = await lambda.send(new InvokeCommand({
      FunctionName: process.env.TARGET_FUNCTION_NAME,
      Qualifier: process.env.TARGET_FUNCTION_VERSION,
      InvocationType: "RequestResponse",
      Payload: Buffer.from(JSON.stringify(apiGatewayHealthEvent)),
    }));
    if (result.FunctionError) throw new Error(`live alias invocation failed: ${result.FunctionError}`);
    assertHealthyResponse(JSON.parse(Buffer.from(result.Payload ?? []).toString("utf8")));
  });
}
