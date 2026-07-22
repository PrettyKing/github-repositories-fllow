"use strict";

const synthetics = require("Synthetics");
const log = require("SyntheticsLogger");
const {
  GetSecretValueCommand,
  SecretsManagerClient,
} = require("@aws-sdk/client-secrets-manager");

const DEFAULT_DEEP_CHECK_TIMEOUT_MS = 3_000;

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function endpoint(baseUrl, path) {
  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

async function readJsonResponse(response, stepName) {
  if (!response.ok) {
    throw new Error(`${stepName} returned HTTP ${response.status}`);
  }

  try {
    return await response.json();
  } catch {
    throw new Error(`${stepName} returned invalid JSON`);
  }
}

async function getBasicAuth(secretArn) {
  const client = new SecretsManagerClient({});
  const output = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  if (!output.SecretString) {
    throw new Error("Basic Auth secret has no SecretString");
  }

  let secret;
  try {
    secret = JSON.parse(output.SecretString);
  } catch {
    throw new Error("Basic Auth secret is not valid JSON");
  }

  if (typeof secret.username !== "string" || typeof secret.password !== "string") {
    throw new Error("Basic Auth secret must contain username and password");
  }

  return Buffer.from(`${secret.username}:${secret.password}`, "utf8").toString("base64");
}

async function checkHealth(baseUrl) {
  const response = await fetch(endpoint(baseUrl, "health"), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  const body = await readJsonResponse(response, "health");
  if (body.status !== "ok") {
    throw new Error("health response does not contain status=ok");
  }
}

async function checkStats(baseUrl, authorization, timeoutMs) {
  const startedAt = Date.now();
  const response = await fetch(endpoint(baseUrl, "api/stats"), {
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${authorization}`,
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await readJsonResponse(response, "stats");
  const durationMs = Date.now() - startedAt;

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new Error("stats response must be a JSON object");
  }
  const numericFields = ["users", "repos", "totalFollowers", "totalPublicRepos"];
  if (numericFields.some((field) => typeof body[field] !== "number")) {
    throw new Error("stats response is missing required numeric fields");
  }
  if (!Array.isArray(body.topUsers) || !Array.isArray(body.languages)) {
    throw new Error("stats response is missing required collection fields");
  }
  if (durationMs > timeoutMs) {
    throw new Error(`stats exceeded the ${timeoutMs}ms latency budget`);
  }
}

exports.handler = async () => {
  const baseUrl = requiredEnv("API_URL");
  const authSecretArn = requiredEnv("AUTH_SECRET_ARN");
  const parsedTimeout = Number.parseInt(process.env.DEEP_CHECK_TIMEOUT_MS || "", 10);
  const timeoutMs = Number.isFinite(parsedTimeout)
    ? parsedTimeout
    : DEFAULT_DEEP_CHECK_TIMEOUT_MS;

  // Do not enable request/response header or body logging: the deep check carries
  // production Basic Auth and its response may contain operational data.
  const configuration = synthetics.getConfiguration();
  configuration.setConfig({
    includeRequestHeaders: false,
    includeResponseHeaders: false,
    restrictedHeaders: ["authorization", "cookie", "set-cookie"],
    restrictedUrlParameters: [],
  });

  await synthetics.executeStep("shallow-health", () => checkHealth(baseUrl));

  // Resolve the credential immediately before the protected request and never
  // interpolate it into logs or error messages.
  const authorization = await getBasicAuth(authSecretArn);
  await synthetics.executeStep("deep-stats", () =>
    checkStats(baseUrl, authorization, timeoutMs),
  );

  log.info("API journey completed: shallow-health and deep-stats succeeded");
};
