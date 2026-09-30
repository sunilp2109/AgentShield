import type { AgentChatRequest, AgentChatResponse } from "@/types";

import { api } from "@/lib/api";

export function sendChat(payload: AgentChatRequest) {
  return api.post<AgentChatResponse>("/api/v1/chat", {
    message: payload.message,
    ...(payload.session_id ? { session_id: payload.session_id } : {}),
  });
}
