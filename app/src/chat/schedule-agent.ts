import type { ReminderItem } from "../pet/types";
import {
  createChatCompletion,
  createToolCallCompletion,
  type ChatCompletionMessage,
  type ToolDefinition,
} from "./openai-client";

export type ScheduleToolCall =
  | {
      name: "create_reminder";
      arguments: { title: string; dueAt: string; notes?: string };
    }
  | {
      name: "list_reminders";
      arguments: { includeCompleted?: boolean };
    }
  | {
      name: "complete_reminder";
      arguments: { reminderId: number };
    }
  | {
      name: "delete_reminder";
      arguments: { reminderId: number };
    }
  | {
      name: "ask_schedule_clarification";
      arguments: { question: string; reason?: string };
    };

interface PlanScheduleOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  userText: string;
  reminders: ReminderItem[];
  signal?: AbortSignal;
}

const SCHEDULE_TOOL_PROMPT = `你是桌宠小楠的日程工具规划器。你必须根据用户消息选择一个或多个日程工具。

可用工具：
1. create_reminder: 创建提醒。参数 { "title": string, "dueAt": ISO-8601 string, "notes"?: string }
2. list_reminders: 查看提醒。参数 { "includeCompleted"?: boolean }
3. complete_reminder: 标记提醒完成。参数 { "reminderId": number }
4. delete_reminder: 删除提醒。参数 { "reminderId": number }
5. ask_schedule_clarification: 当提醒时间、提醒标题、完成/删除对象不明确时，向用户追问。参数 { "question": string, "reason"?: string }

规则：
- 本规划器只会在上层判断为可能的日程/提醒意图时被调用；不要输出闲聊内容。
- 相对时间必须根据当前时间转换成带时区的 ISO-8601。
- 如果用户要创建提醒，但标题或时间不明确，必须调用 ask_schedule_clarification，不要创建提醒。
- 如果用户要删除或完成提醒，优先使用已有提醒列表里的 id；无法确定唯一提醒时，必须调用 ask_schedule_clarification。
- 如果用户要查看日程或提醒，调用 list_reminders。
- 如果模型服务不支持工具调用并要求 JSON 输出，输出格式必须是：{"actions":[{"name":"工具名","arguments":{...}}]}。`;

const SCHEDULE_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "create_reminder",
      description: "创建一个本地提醒或日程。",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "提醒标题" },
          dueAt: {
            type: "string",
            description: "提醒时间，ISO-8601 字符串，必须带明确日期时间",
          },
          notes: { type: "string", description: "可选备注" },
        },
        required: ["title", "dueAt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_reminders",
      description: "查看本地提醒或日程。",
      parameters: {
        type: "object",
        properties: {
          includeCompleted: { type: "boolean", description: "是否包含已完成提醒" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_reminder",
      description: "把一个提醒标记为已完成。",
      parameters: {
        type: "object",
        properties: {
          reminderId: { type: "integer", description: "提醒 ID" },
        },
        required: ["reminderId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_reminder",
      description: "删除一个提醒。",
      parameters: {
        type: "object",
        properties: {
          reminderId: { type: "integer", description: "提醒 ID" },
        },
        required: ["reminderId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ask_schedule_clarification",
      description: "日程工具执行前向用户追问缺失信息。",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string", description: "要问用户的简短问题" },
          reason: { type: "string", description: "需要追问的原因" },
        },
        required: ["question"],
      },
    },
  },
];

export function shouldPlanScheduleTools(text: string): boolean {
  const value = text.toLowerCase();
  const directIntent =
    /提醒|日程|待办|闹钟|安排|会议|todo|reminder/.test(value);
  const modifyIntent =
    /(完成|删掉|删除|取消).*(提醒|日程|待办|闹钟|安排|会议|todo|reminder|#\d+)/.test(
      value,
    );
  const temporalIntent =
    /(今天|明天|后天|下周|点|分钟|小时).*(提醒|叫我|喊我|告诉我|记得|设个|设置|安排)/.test(
      value,
    ) ||
    /(提醒|叫我|喊我|告诉我|记得|设个|设置|安排).*(今天|明天|后天|下周|点|分钟|小时)/.test(
      value,
    );
  return directIntent || modifyIntent || temporalIntent;
}

export async function planScheduleToolCalls(
  options: PlanScheduleOptions,
): Promise<ScheduleToolCall[]> {
  const now = new Date();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const messages: ChatCompletionMessage[] = [
    { role: "system", content: SCHEDULE_TOOL_PROMPT },
    {
      role: "user",
      content: [
        `当前本地时间：${now.toLocaleString("zh-CN", { timeZoneName: "short" })}`,
        `当前时间 ISO：${now.toISOString()}`,
        `当前时区：${timezone}`,
        `已有提醒：${formatReminderList(options.reminders)}`,
        `用户消息：${options.userText}`,
      ].join("\n\n"),
    },
  ];

  try {
    const toolCalls = await createToolCallCompletion({
      baseUrl: options.baseUrl,
      apiKey: options.apiKey,
      model: options.model,
      messages,
      tools: SCHEDULE_TOOLS,
      toolChoice: "required",
      temperature: 0,
      maxTokens: 512,
      signal: options.signal,
    });
    const calls = toolCalls
      .map((call) =>
        normalizeToolCall({
          name: call.function.name,
          arguments: safeParseArgs(call.function.arguments),
        }),
      )
      .filter((call): call is ScheduleToolCall => call !== null);
    if (calls.length > 0) return calls.slice(0, 5);
  } catch {
    // Some OpenAI-compatible providers or models do not support tools.
  }

  let raw = "";
  try {
    raw = await createChatCompletion({
      baseUrl: options.baseUrl,
      apiKey: options.apiKey,
      model: options.model,
      messages,
      responseFormat: { type: "json_object" },
      temperature: 0,
      maxTokens: 700,
      signal: options.signal,
    });
  } catch (err) {
    if (options.signal?.aborted) throw err;
    raw = await createChatCompletion({
      baseUrl: options.baseUrl,
      apiKey: options.apiKey,
      model: options.model,
      messages,
      temperature: 0,
      maxTokens: 700,
      signal: options.signal,
    });
  }
  return parseToolPlan(raw);
}

export function formatScheduleToolResults(results: string[]): string {
  if (results.length === 0) return "";
  return `\n\n日程工具执行结果：\n${results.map((item) => `- ${item}`).join("\n")}\n\n请根据这些结果自然回复用户。`;
}

export function formatReminderForUser(reminder: ReminderItem): string {
  const due = new Date(reminder.dueAt).toLocaleString();
  const notes = reminder.notes ? `，备注：${reminder.notes}` : "";
  return `#${reminder.id} ${reminder.title}，时间：${due}${notes}`;
}

function formatReminderList(reminders: ReminderItem[]): string {
  if (reminders.length === 0) return "无";
  return reminders.slice(0, 30).map(formatReminderForUser).join("\n");
}

function parseToolPlan(raw: string): ScheduleToolCall[] {
  const match = raw.trim().match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]) as { actions?: unknown };
    if (!Array.isArray(parsed.actions)) return [];
    return parsed.actions
      .map(normalizeToolCall)
      .filter((call): call is ScheduleToolCall => call !== null)
      .slice(0, 5);
  } catch {
    return [];
  }
}

function normalizeToolCall(value: unknown): ScheduleToolCall | null {
  if (!isRecord(value) || typeof value.name !== "string") return null;
  const args = isRecord(value.arguments) ? value.arguments : {};

  if (value.name === "create_reminder") {
    const title = typeof args.title === "string" ? args.title.trim() : "";
    const dueAt = typeof args.dueAt === "string" ? args.dueAt.trim() : "";
    if (!title || !dueAt || Number.isNaN(Date.parse(dueAt))) return null;
    const notes = typeof args.notes === "string" ? args.notes.trim() : "";
    return {
      name: "create_reminder",
      arguments: notes ? { title, dueAt, notes } : { title, dueAt },
    };
  }

  if (value.name === "list_reminders") {
    return {
      name: "list_reminders",
      arguments: { includeCompleted: Boolean(args.includeCompleted) },
    };
  }

  if (value.name === "complete_reminder" || value.name === "delete_reminder") {
    const reminderId = Number(args.reminderId);
    if (!Number.isInteger(reminderId) || reminderId <= 0) return null;
    return {
      name: value.name,
      arguments: { reminderId },
    } as ScheduleToolCall;
  }

  if (value.name === "ask_schedule_clarification") {
    const question = typeof args.question === "string" ? args.question.trim() : "";
    const reason = typeof args.reason === "string" ? args.reason.trim() : "";
    if (!question) return null;
    return {
      name: "ask_schedule_clarification",
      arguments: reason ? { question, reason } : { question },
    };
  }

  return null;
}

function safeParseArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
