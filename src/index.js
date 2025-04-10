var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectServer } from './connect.js';
import { initialize } from './initialize.js';
import { createToolsFromOpenApi } from './openapi/index.js';
import { createSearchTool } from './search.js';
import { isMcpEnabled } from './openapi/helpers.js';
import { readConfig } from './config.js';

// Remove redundant import and use path.dirname instead
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);

// Parse production flag
const isProduction = args.includes('--production');

// Parse tools argument
const toolsEqualFlag = args.find(arg => arg.startsWith('--tools='));
const toolsSpaceIndex = args.indexOf('--tools');
let toolsArg = null;

if (toolsEqualFlag) {
  toolsArg = toolsEqualFlag.split('=')[1];
} else if (toolsSpaceIndex !== -1 && args[toolsSpaceIndex + 1]) {
  toolsArg = args[toolsSpaceIndex + 1];
}

// Configure McpTools based on command line args
const mcpTools = {
  PG: false,
  PO: false,
  VRS: false
};

if (toolsArg) {
  const tools = toolsArg.toLowerCase().split(',');
  tools.forEach(tool => {
    if (tool === 'pg') mcpTools.PG = true;
    if (tool === 'po') mcpTools.PO = true;
    if (tool === 'vrs') mcpTools.VRS = true;
  });
}

// Make mcpTools globally available
global.mcpTools = mcpTools;

let authArg = null;

// Check for --payments_key=value format
const equalFlag = args.find(arg => arg.startsWith('--payments_key='));
if (equalFlag) {
  authArg = equalFlag.split('=')[1];
}

// Check for --payments_key value format
const spaceIndex = args.indexOf('--payments_key');
if (spaceIndex !== -1 && args[spaceIndex + 1]) {
  authArg = args[spaceIndex + 1];
}

if (!authArg) {
  console.error('Please provide authentication using --payments_key=x-client-id:x-client-secret or --payments_key x-client-id:x-client-secret');
  process.exit(1);
}

// Split and validate auth credentials
const [clientId, clientSecret] = authArg.split(':');
if (!clientId || !clientSecret) {
  console.error('Invalid authentication format. Use x-client-id:x-client-secret as the key value');
  process.exit(1);
}

// Configure headers
const pgHeaders = {
  'x-client-id': clientId,
  'x-client-secret': clientSecret
};

// Parse command line arguments for SecureID API
const secureidSpaceIndex = args.indexOf('--secureid_key');
const secureidEqualFlag = args.find(arg => arg.startsWith('--secureid_key='));
let secureidArg = null;

if (secureidEqualFlag) {
  secureidArg = secureidEqualFlag.split('=')[1];
} else if (secureidSpaceIndex !== -1 && args[secureidSpaceIndex + 1]) {
  secureidArg = args[secureidSpaceIndex + 1];
}

// Configure SecureID headers if provided
const vrsHeaders = {};
if (secureidArg) {
  const [clientId, clientSecret] = secureidArg.split(':');
  if (!clientId || !clientSecret) {
    console.error('Invalid SecureID authentication format. Use x-client-id:x-client-secret as the key value');
    process.exit(1);
  }
  vrsHeaders['x-client-id'] = clientId;
  vrsHeaders['x-client-secret'] = clientSecret;
}

// Parse command line arguments for Payouts API
const payoutsSpaceIndex = args.indexOf('--payouts_key');
const payoutsEqualFlag = args.find(arg => arg.startsWith('--payouts_key='));
let payoutsArg = null;

if (payoutsEqualFlag) {
  payoutsArg = payoutsEqualFlag.split('=')[1];
} else if (payoutsSpaceIndex !== -1 && args[payoutsSpaceIndex + 1]) {
  payoutsArg = args[payoutsSpaceIndex + 1];
}

// Configure Payouts headers if provided
const poHeaders = {};
if (payoutsArg) {
  const [clientId, clientSecret] = payoutsArg.split(':');
  if (!clientId || !clientSecret) {
    console.error('Invalid Payouts authentication format. Use x-client-id:x-client-secret as the key value');
    process.exit(1);
  }
  poHeaders['x-client-id'] = clientId;
  poHeaders['x-client-secret'] = clientSecret;
}

export function getConfig() {
  const config = readConfig();
  // Set base_url based on production flag
  if (config['Cashfree Payment Gateway APIs - 2025-01-01']) {
    // console.log("===");
    config['Cashfree Payment Gateway APIs - 2025-01-01'].base_url = isProduction 
      ? 'https://api.cashfree.com/pg'
      : 'https://sandbox.cashfree.com/pg';
      // console.log(config['Cashfree Payment Gateway APIs - 2025-01-01']);
    // Override PG API credentials with command line args if provided
    config['Cashfree Payment Gateway APIs - 2025-01-01'].header = {
      ...config['Cashfree Payment Gateway APIs - 2025-01-01'].header,
      'x-client-id': pgHeaders['x-client-id'],
      'x-client-secret': pgHeaders['x-client-secret']
    };
  }

  // Override SecureID API credentials if provided
  if (secureidArg && config['Cashfree Verification API\'s. - 2023-12-18']) {
    config['Cashfree Verification API\'s. - 2023-12-18'].header = {
      ...config['Cashfree Verification API\'s. - 2023-12-18'].header,
      'x-client-id': vrsHeaders['x-client-id'],
      'x-client-secret': vrsHeaders['x-client-secret']
    };
  }

  // Override Payouts API credentials if provided
  if (payoutsArg && config['Cashfree Payout APIs - 2024-01-01']) {
    config['Cashfree Payout APIs - 2024-01-01'].header = {
      ...config['Cashfree Payout APIs - 2024-01-01'].header,
      'x-client-id': poHeaders['x-client-id'],
      'x-client-secret': poHeaders['x-client-secret']
    };
  }
  
  return config;
}

function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const config = getConfig();
        const server = initialize(config);
        const existingTools = new Set();
        yield createSearchTool(server);
        const openApiDir = path.join(__dirname, 'openapi');
        const openApiFilePaths = fs
            .readdirSync(openApiDir)
            .filter((path) => path.startsWith('openapi-') && path.endsWith('.json'))
            .filter((path) => isMcpEnabled(path));
        yield Promise.all(openApiFilePaths.map((openApiPath, index) => __awaiter(this, void 0, void 0, function* () {
            return yield createToolsFromOpenApi(path.join(openApiDir, openApiPath), index, server, existingTools);
        })));
        yield connectServer(server);
    });
}
main().catch((error) => {
    console.error('Fatal error in trying to initialize MCP server: ', error);
    process.exit(1);
});

