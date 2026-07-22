"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");

const scriptPath = path.resolve(__dirname, "api-journey.js");

async function loadAndRun({ responses, secret = { username: "ops", password: "safe" } }) {
  const steps = [];
  const config = [];
  const originalLoad = Module._load;
  const originalFetch = global.fetch;
  const originalEnv = {
    API_URL: process.env.API_URL,
    AUTH_SECRET_ARN: process.env.AUTH_SECRET_ARN,
    DEEP_CHECK_TIMEOUT_MS: process.env.DEEP_CHECK_TIMEOUT_MS,
  };

  Module._load = function mockLoad(request, parent, isMain) {
    if (request === "Synthetics") {
      return {
        executeStep: async (name, fn) => {
          steps.push(name);
          return fn();
        },
        getConfiguration: () => ({ setConfig: (value) => config.push(value) }),
      };
    }
    if (request === "SyntheticsLogger") return { info() {} };
    if (request === "@aws-sdk/client-secrets-manager") {
      return {
        SecretsManagerClient: class {
          async send() {
            return { SecretString: JSON.stringify(secret) };
          }
        },
        GetSecretValueCommand: class {},
      };
    }
    return originalLoad(request, parent, isMain);
  };

  global.fetch = async (url, options) => {
    responses.requests.push({ url, options });
    return responses.queue.shift();
  };
  process.env.API_URL = "https://api.example.test";
  process.env.AUTH_SECRET_ARN = "arn:aws:secretsmanager:example";
  process.env.DEEP_CHECK_TIMEOUT_MS = "3000";
  try {
    // Compile explicitly as CommonJS: the deployed Canary treats this handler as
    // CommonJS even though the monorepo root uses ESM for application packages.
    const handlerModule = new Module(scriptPath);
    handlerModule.filename = scriptPath;
    handlerModule.paths = Module._nodeModulePaths(path.dirname(scriptPath));
    handlerModule._compile(fs.readFileSync(scriptPath, "utf8"), scriptPath);
    const journey = handlerModule.exports;
    await journey.handler();
    return { steps, config, requests: responses.requests };
  } finally {
    Module._load = originalLoad;
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

const validStats = {
  users: 0,
  repos: 0,
  totalFollowers: 0,
  totalPublicRepos: 0,
  topUsers: [],
  languages: [],
};

test("runs shallow and deep checks without exposing credentials in config", async () => {
  const responses = {
    queue: [jsonResponse(200, { status: "ok" }), jsonResponse(200, validStats)],
    requests: [],
  };
  const result = await loadAndRun({ responses });

  assert.deepEqual(result.steps, ["shallow-health", "deep-stats"]);
  assert.equal(result.requests[0].url, "https://api.example.test/health");
  assert.equal(result.requests[1].url, "https://api.example.test/api/stats");
  assert.equal(result.requests[1].options.headers.Authorization, "Basic b3BzOnNhZmU=");
  assert.equal(result.config[0].includeRequestHeaders, false);
  assert.ok(result.config[0].restrictedHeaders.includes("authorization"));
});

test("does not run the protected check after shallow health fails", async () => {
  const responses = { queue: [jsonResponse(503, {})], requests: [] };

  await assert.rejects(loadAndRun({ responses }), /health returned HTTP 503/);
  assert.equal(responses.requests.length, 1);
});

test("rejects an unexpected stats response shape", async () => {
  const responses = {
    queue: [jsonResponse(200, { status: "ok" }), jsonResponse(200, [])],
    requests: [],
  };

  await assert.rejects(loadAndRun({ responses }), /stats response must be a JSON object/);
});
