/**
 * Citizen Chat Controller
 *
 * Sends commands/messages to individual citizens (AI agents) in the Republic
 * and retrieves their conversation history.
 *
 * Uses the existing republic.citizen.command and republic.citizen.history RPCs.
 */

import type { GatewayBrowserClient } from "../gateway.ts";

export interface CitizenChatState {
  client: GatewayBrowserClient | null;
  connected: boolean;
  citizenChatHistory: Record<string, Array<{ role: string; content: string; ts: number }>>;
  citizenChatSending: boolean;
  citizenChatError: string | null;
}

/**
 * Send a message/command to a specific citizen agent.
 * Appends the message to the local chat history optimistically,
 * then sends it over RPC and appends the response.
 */
export async function sendCitizenMessage(
  state: CitizenChatState,
  citizenId: string,
  message: string,
): Promise<void> {
  if (!state.client || !state.connected || !message.trim()) {
    return;
  }

  state.citizenChatSending = true;
  state.citizenChatError = null;

  // Optimistically append user message
  const existing = state.citizenChatHistory[citizenId] ?? [];
  const userMsg = { role: "user", content: message.trim(), ts: Date.now() };
  state.citizenChatHistory = {
    ...state.citizenChatHistory,
    [citizenId]: [...existing, userMsg],
  };

  try {
    const result = await state.client.request<{
      reply: string;
      history?: Array<{ role: string; content: string; ts: number }>;
    }>("republic.citizen.command", { citizenId, message: message.trim() });

    if (result) {
      const reply = { role: "assistant", content: result.reply ?? "(no reply)", ts: Date.now() };
      const updatedHistory = result.history ?? [
        ...(state.citizenChatHistory[citizenId] ?? []),
        reply,
      ];
      state.citizenChatHistory = {
        ...state.citizenChatHistory,
        [citizenId]: updatedHistory,
      };
    }
  } catch (err) {
    state.citizenChatError = String(err);
    // Append error message to chat
    const errMsg = { role: "error", content: `Error: ${String(err)}`, ts: Date.now() };
    state.citizenChatHistory = {
      ...state.citizenChatHistory,
      [citizenId]: [...(state.citizenChatHistory[citizenId] ?? []), errMsg],
    };
  } finally {
    state.citizenChatSending = false;
  }
}

/**
 * Load the conversation history for a specific citizen from the gateway.
 */
export async function loadCitizenChatHistory(
  state: CitizenChatState,
  citizenId: string,
): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }

  try {
    const result = await state.client.request<{
      history: Array<{ role: string; content: string; ts: number }>;
    }>("republic.citizen.history", { citizenId });

    if (result?.history) {
      state.citizenChatHistory = {
        ...state.citizenChatHistory,
        [citizenId]: result.history,
      };
    }
  } catch {
    // Silently fail — history is a nice-to-have
  }
}

/**
 * Clear local chat history for a citizen (does not affect server-side).
 */
export function clearCitizenChatHistory(state: CitizenChatState, citizenId: string): void {
  const updated = { ...state.citizenChatHistory };
  delete updated[citizenId];
  state.citizenChatHistory = updated;
}
