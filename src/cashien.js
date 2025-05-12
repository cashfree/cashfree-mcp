/**
 * Provides the Cashien tool for API integration queries.
 * This tool sends user queries to a specified endpoint and returns the response.
 */

import { z } from 'zod';
import { formatErr } from './utils.js';
import { v4 as uuidv4 } from 'uuid';

const CASHIEN_API = 'https://receiver.cashfree.com/pgnextgenconsumer/cashien/external/chat/message';
const ERR_MSG = "Unable to process your request. Please try again after sometime";

export function createCashienTool(server) {
    return server.tool(
        'cashien',
        'Use this tool to write code to integrate cashfree apis and sdks. Supports both backend and frontend',
        { query: z.string() },
        async ({ query }) => {
            try {
                const response = await sendMessageToChatbot(query);
                return {
                    content: [
                        {
                            type: 'text',
                            text: response
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

export async function sendMessageToChatbot(message) {
    const messageId = uuidv4();
    const userId = uuidv4();
    const conversationId = uuidv4();
    const payload = {
        conversationId,
        userId,
        messageId,
        message
    };
    try {
        const response = await fetch(`${CASHIEN_API}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });
        const finalResp = await response.json();
        if (finalResp.status === undefined || finalResp.status === "ERROR") {
            return ERR_MSG;
        }
        return finalResp.message;
    } catch (error) {
        console.error("Error in sendMessageToChatbot:", error);
        return ERR_MSG;
    }
}
