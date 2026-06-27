import type { MemoryItem } from "../pet/types";
import {
  createChatCompletion,
  type ChatCompletionMessage,
} from "./openai-client";

const MEMORY_EXTRACTOR_PROMPT = `你是桌宠小楠的长期记忆整理器。
只提取对未来对话有帮助、稳定、用户愿意让你记住的信息。
适合记住：用户称呼、偏好、长期项目、重要关系、常用工作流、明确要求你记住的事。
不要记住：一次性任务、闲聊情绪、API Key、密码、token、身份证、手机号、银行卡等敏感信息。
输出严格 JSON 数组。没有可记忆内容就输出 []。
每项格式：
{
  "content": "简短中文事实",
  "category": "profile|preference|project|relationship|workflow|fact",
  "importance": 1-5
}
已存在的记忆不要重复输出，除非新内容能明显更新或合并旧内容。`;

export interface MemoryDraft {
  content: string;
  category: MemoryItem["category"];
  importance: number;
}

interface ExtractMemoryOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  existingMemories: MemoryItem[];
  userText: string;
  assistantText: string;
  signal?: AbortSignal;
}

export function buildMemoryContext(memories: MemoryItem[]): string {
  if (memories.length === 0) return "";
  const facts = memories.slice(0, 16).map(formatMemoryLine).join("\n");
  return `\n\n相关长期记忆：\n${facts}\n\n请自然使用这些记忆，不要无缘无故逐条复述；如果记忆和当前对话无关，可以忽略。`;
}

export async function extractMemoryFacts(
  options: ExtractMemoryOptions,
): Promise<MemoryDraft[]> {
  const existing = options.existingMemories
    .slice(0, 30)
    .map((memory) => `- ${memory.content}`)
    .join("\n");
  const content = [
    existing ? `已有长期记忆：\n${existing}` : "已有长期记忆：无",
    `用户消息：${options.userText}`,
    `小楠回复：${options.assistantText}`,
  ].join("\n\n");

  const messages: ChatCompletionMessage[] = [
    { role: "system", content: MEMORY_EXTRACTOR_PROMPT },
    { role: "user", content },
  ];
  const raw = await createChatCompletion({
    baseUrl: options.baseUrl,
    apiKey: options.apiKey,
    model: options.model,
    messages,
    temperature: 0,
    maxTokens: 512,
    signal: options.signal,
  });
  return parseMemoryJson(raw);
}

function formatMemoryLine(memory: MemoryItem): string {
  const label: Record<MemoryItem["category"], string> = {
    profile: "用户画像",
    preference: "偏好",
    project: "项目",
    relationship: "关系",
    workflow: "工作流",
    fact: "事实",
  };
  return `- [${label[memory.category] ?? "事实"}] ${memory.content}`;
}

function parseMemoryJson(raw: string): MemoryDraft[] {
  const text = raw.trim();
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];

  try {
    const parsed = JSON.parse(match[0]) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeMemoryDraft)
      .filter((item): item is MemoryDraft => item !== null);
  } catch {
    return [];
  }
}

function normalizeMemoryDraft(value: unknown): MemoryDraft | null {
  if (typeof value === "string") {
    const content = value.trim();
    if (!isValidMemoryContent(content)) return null;
    return { content, category: "fact", importance: 3 };
  }
  if (typeof value !== "object" || value === null) return null;

  const record = value as Record<string, unknown>;
  const content =
    typeof record.content === "string" ? record.content.trim() : "";
  if (!isValidMemoryContent(content)) return null;

  const category = normalizeCategory(record.category);
  const importance = Number(record.importance);
  return {
    content,
    category,
    importance: Number.isFinite(importance)
      ? Math.min(5, Math.max(1, Math.round(importance)))
      : 3,
  };
}

function isValidMemoryContent(content: string): boolean {
  return content.length > 0 && content.length <= 120 && !looksSensitive(content);
}

function normalizeCategory(value: unknown): MemoryItem["category"] {
  if (
    value === "profile" ||
    value === "preference" ||
    value === "project" ||
    value === "relationship" ||
    value === "workflow" ||
    value === "fact"
  ) {
    return value;
  }
  return "fact";
}

function looksSensitive(text: string): boolean {
  const lower = text.toLowerCase();
  return [
    "api key",
    "apikey",
    "token",
    "password",
    "密码",
    "密钥",
    "身份证",
    "银行卡",
    "手机号",
  ].some((keyword) => lower.includes(keyword));
}
