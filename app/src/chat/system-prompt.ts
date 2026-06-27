import { EVE_SKILL_SYSTEM_PROMPT } from "./eve-skill-config";

export const DEFAULT_SYSTEM_PROMPT = EVE_SKILL_SYSTEM_PROMPT;

export const DEFAULT_SETTINGS = {
  apiBaseUrl: "https://api.deepseek.com",
  model: "deepseek-v4-flash",
  temperature: 0.7,
  maxTokens: 1024,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  petScale: 1,
  showChatBubble: true,
  currentOutfitId: "red_white_dress",
  enableMemory: true,
  enableScheduleTools: true,
};
