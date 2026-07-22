#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { redact } from "./core.js";
import { createServer } from "./server.js";
import { OpsService } from "./service.js";

const main = async () => {
  const config = loadConfig();
  const server = createServer(new OpsService(config));
  await server.connect(new StdioServerTransport());
};

main().catch((error) => {
  // stdout is reserved for MCP protocol frames.
  process.stderr.write(`${JSON.stringify({ event: "mcp_start_failed", error: redact((error as Error).message) })}\n`);
  process.exitCode = 1;
});
