import { invoke } from "@tauri-apps/api/core";
import type {
  ChatMessage,
  ChatSession,
  MemoryItem,
  ReminderItem,
} from "../pet/types";

export async function listSessions(): Promise<ChatSession[]> {
  return invoke<ChatSession[]>("list_sessions");
}

export async function createSession(title?: string): Promise<number> {
  return invoke<number>("create_session", { title: title ?? null });
}

export async function getMessages(sessionId: number): Promise<ChatMessage[]> {
  return invoke<ChatMessage[]>("get_messages", { sessionId });
}

export async function addMessage(
  sessionId: number,
  role: "user" | "assistant" | "system",
  content: string,
): Promise<number> {
  return invoke<number>("add_message", { sessionId, role, content });
}

export async function deleteSession(sessionId: number): Promise<void> {
  return invoke("delete_session", { sessionId });
}

export async function getRecentMessages(
  sessionId: number,
  limit = 20,
): Promise<ChatMessage[]> {
  return invoke<ChatMessage[]>("get_recent_messages", { sessionId, limit });
}

export async function updateSessionTitle(
  sessionId: number,
  title: string,
): Promise<void> {
  return invoke("update_session_title", { sessionId, title });
}

export async function listMemories(limit = 50): Promise<MemoryItem[]> {
  return invoke<MemoryItem[]>("list_memories", { limit });
}

export async function addMemory(
  content: string,
  category = "fact",
  importance = 3,
  sourceSessionId?: number,
): Promise<number> {
  return invoke<number>("add_memory", {
    content,
    category,
    importance,
    sourceSessionId: sourceSessionId ?? null,
  });
}

export async function searchMemories(
  query: string,
  limit = 12,
): Promise<MemoryItem[]> {
  return invoke<MemoryItem[]>("search_memories", { query, limit });
}

export async function deleteMemory(memoryId: number): Promise<void> {
  return invoke("delete_memory", { memoryId });
}

export async function clearMemories(): Promise<void> {
  return invoke("clear_memories");
}

export async function createReminder(
  title: string,
  dueAt: number,
  notes?: string,
): Promise<ReminderItem> {
  return invoke<ReminderItem>("create_reminder", {
    title,
    dueAt,
    notes: notes ?? null,
  });
}

export async function listReminders(
  includeCompleted = false,
  limit = 50,
): Promise<ReminderItem[]> {
  return invoke<ReminderItem[]>("list_reminders", {
    includeCompleted,
    limit,
  });
}

export async function completeReminder(reminderId: number): Promise<void> {
  return invoke("complete_reminder", { reminderId });
}

export async function deleteReminder(reminderId: number): Promise<void> {
  return invoke("delete_reminder", { reminderId });
}

export async function getApiKey(): Promise<string> {
  return invoke<string>("get_api_key");
}

export async function setApiKey(key: string): Promise<void> {
  return invoke("set_api_key", { key });
}

export async function getSettings(): Promise<Record<string, unknown>> {
  return invoke("get_settings");
}

export async function saveSettings(
  settings: Record<string, unknown>,
): Promise<void> {
  return invoke("save_settings", { settings });
}

export async function emitPetEvent(
  event: "chat-thinking" | "chat-streaming" | "chat-done" | "api-error",
): Promise<void> {
  return invoke("emit_pet_event", { event });
}

export async function emitPetBubble(text: string): Promise<void> {
  return invoke("emit_pet_bubble", { text });
}
