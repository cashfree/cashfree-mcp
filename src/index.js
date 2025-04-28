/**
 * Entry point for Cashfree MCP server.
 * Initializes server, loads OpenAPI tools, and starts the server.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectServer } from './connect.js';
import { initialize } from './initialize.js';
import { createToolsFromOpenApi } from './openapi/index.js';
import { createSearchTool } from './search.js';
import { isMcpEnabled } from './openapi/helpers.js';
import { readConfig } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    const config = readConfig();
    const server = initialize(config);
    const existingTools = new Set();

    await createSearchTool(server);

    const openApiDir = path.join(__dirname, 'openapi');
    const openApiFilePaths = fs
        .readdirSync(openApiDir)
        .filter((file) => file.startsWith('openapi-') && file.endsWith('.json'))
        .filter((file) => isMcpEnabled(file));

    await Promise.all(
        openApiFilePaths.map(async (openApiPath, index) => {
            return createToolsFromOpenApi(
                path.join(openApiDir, openApiPath),
                index,
                server,
                existingTools
            );
        })
    );

    await connectServer(server);
}

main().catch((error) => {
    console.error('Fatal error in trying to initialize MCP server:', error);
    process.exit(1);
});

