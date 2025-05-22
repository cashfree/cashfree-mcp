import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export async function connectServer(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport();
  try {
    await server.connect(transport);
    console.error("MCP Server running on stdio");
  } catch (error: unknown) {
    console.error("Failed to connect MCP Server:", error);
  }
}
