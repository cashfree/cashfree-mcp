#!/usr/bin/env node
/**
 * Entry point for Cashfree MCP server.
 * Initializes the server, loads tools (OpenAPI, search, cashien), and connects the server over stdio.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectServer } from "./connect.js";
import { initialize } from "./initialize.js";
import { createToolsFromOpenApi } from "./openapi/index.js";
import { createSearchTool } from "./search.js";
import { isMcpEnabled } from "./openapi/helpers.js";
import { readConfig } from "./config.js";
import { createCashienTool } from "./cashien.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const config = readConfig();
  const server = initialize(config);
  const existingTools: Set<string> = new Set();

  await createSearchTool(server);
  await createCashienTool(server);

  // Dynamically load OpenAPI-based tools
  const openApiDir = path.join(__dirname, "openapi");
  if (!fs.existsSync(openApiDir)) {
    throw new Error(`OpenAPI directory not found at path: ${openApiDir}`);
  }

  const openApiFilePaths = fs
    .readdirSync(openApiDir)
    .filter((file) => file.startsWith("openapi-") && file.endsWith(".json"))
    .filter(isMcpEnabled);

  await Promise.all(
    openApiFilePaths.map((openApiPath, index) =>
      createToolsFromOpenApi(
        path.join(openApiDir, openApiPath),
        index,
        server,
        existingTools
      )
    )
  );

  await connectServer(server);
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.stack ?? error.message : String(error);
  console.error("Fatal error while initializing MCP server:\n", message);
  process.exit(1);
});
