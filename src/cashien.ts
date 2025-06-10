/**
 * Provides the Cashien tool for API integration queries.
 * This tool sends user queries to a specified endpoint and returns the response.
 */

import { z } from "zod";
import { formatErr } from "./utils.js";
import { v4 as uuidv4 } from "uuid";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Constants
const CASHIEN_API_URL =
  "https://receiver.cashfree.com/pgnextgenconsumer/cashien/external/chat/message";
const GENERIC_ERR_MSG =
  "Unable to process your request. Please try again after some time.";

// Types
interface CashienPayload {
  conversationId: string;
  userId: string;
  messageId: string;
  message: string;
}

interface CashienResponse {
  status?: string;
  message?: string;
}

// Tool definition
export function createCashienTool(server: McpServer) {
  return server.tool(
    "cashien",
    "Use this tool to write code to integrate Cashfree APIs and SDKs. Supports both backend and frontend.",
    { query: z.string() },
    async ({ query }) => {
      try {
        const response = await sendMessageToChatbot(query);
        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      } catch (err) {
        console.error("Error in createCashienTool:", err);
        throw new Error(formatErr(err));
      }
    }
  );
}

// Chatbot message handler
export async function sendMessageToChatbot(message: string): Promise<string> {
  const payload: CashienPayload = {
    conversationId: uuidv4(),
    userId: uuidv4(),
    messageId: uuidv4(),
    message,
  };

  try {
    const response = await fetch(CASHIEN_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(`HTTP error: ${response.status} ${response.statusText}`);
      return GENERIC_ERR_MSG;
    }

    const json: CashienResponse = await response.json();

    if (!json || json.status === "ERROR" || typeof json.message !== "string") {
      return GENERIC_ERR_MSG;
    }

    return json.message;
  } catch (error) {
    console.error("Network error in sendMessageToChatbot:", error);
    return GENERIC_ERR_MSG;
  }
}
