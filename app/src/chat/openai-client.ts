export interface ChatCompletionMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
}

export interface StreamOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatCompletionMessage[];
  temperature?: number;
  maxTokens?: number;
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (err: Error) => void;
  signal?: AbortSignal;
}

export interface CompletionOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatCompletionMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: ResponseFormat;
  signal?: AbortSignal;
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export type ResponseFormat = { type: "text" | "json_object" };

export type ToolChoice =
  | "none"
  | "auto"
  | "required"
  | { type: "function"; function: { name: string } };

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolCompletionOptions extends CompletionOptions {
  tools: ToolDefinition[];
  toolChoice?: ToolChoice;
}

interface CompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
      tool_calls?: ToolCall[];
    };
  }>;
}

export async function streamChatCompletion(
  options: StreamOptions,
): Promise<void> {
  const url = `${options.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify({
      model: options.model,
      messages: serializeMessages(options.messages),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 1024,
      stream: true,
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`API ${response.status}: ${text || response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") {
        options.onDone();
        return;
      }
      try {
        const json = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) options.onDelta(delta);
      } catch {
        // skip malformed chunks
      }
    }
  }
  options.onDone();
}

export async function createChatCompletion(
  options: CompletionOptions,
): Promise<string> {
  const url = `${options.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify({
      model: options.model,
      messages: serializeMessages(options.messages),
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 512,
      stream: false,
      ...(options.responseFormat
        ? { response_format: options.responseFormat }
        : {}),
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`API ${response.status}: ${text || response.statusText}`);
  }

  const json = (await response.json()) as CompletionResponse;
  return json.choices?.[0]?.message?.content ?? "";
}

export async function createToolCallCompletion(
  options: ToolCompletionOptions,
): Promise<ToolCall[]> {
  const url = `${options.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify({
      model: options.model,
      messages: serializeMessages(options.messages),
      temperature: options.temperature ?? 0,
      max_tokens: options.maxTokens ?? 256,
      stream: false,
      tools: options.tools,
      tool_choice: options.toolChoice ?? "auto",
      ...(options.responseFormat
        ? { response_format: options.responseFormat }
        : {}),
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`API ${response.status}: ${text || response.statusText}`);
  }

  const json = (await response.json()) as CompletionResponse;
  return json.choices?.[0]?.message?.tool_calls ?? [];
}

export function truncateMessages(
  messages: ChatCompletionMessage[],
  maxMessages = 20,
): ChatCompletionMessage[] {
  const system = messages.filter((m) => m.role === "system");
  const rest = messages.filter((m) => m.role !== "system");
  const trimmed = rest.slice(-maxMessages);
  return [...system, ...trimmed];
}

function serializeMessages(messages: ChatCompletionMessage[]) {
  return messages.map((message) => {
    if (message.role === "tool") {
      return {
        role: message.role,
        content: message.content,
        tool_call_id: message.toolCallId,
      };
    }
    return {
      role: message.role,
      content: message.content,
    };
  });
}
