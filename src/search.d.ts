import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InitializationConfiguration } from './types.js';
export declare function fetchSearchConfigurationAndOpenApi(subdomain: string): Promise<InitializationConfiguration>;
export declare function createSearchTool(server: McpServer): Promise<void>;
