import { render } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { emit, listen } from "@tauri-apps/api/event";
import type { ChatMessage, ChatSession, ReminderItem } from "../pet/types";
import {
  addMessage,
  addMemory,
  completeReminder,
  createSession,
  createReminder,
  deleteReminder,
  emitPetEvent,
  emitPetBubble,
  getApiKey,
  getMessages,
  getRecentMessages,
  getSettings,
  listReminders,
  listSessions,
  searchMemories,
  updateSessionTitle,
} from "../chat/history-bridge";
import { buildMemoryContext, extractMemoryFacts } from "../chat/memory-agent";
import {
  formatReminderForUser,
  formatScheduleToolResults,
  planScheduleToolCalls,
  shouldPlanScheduleTools,
  type ScheduleToolCall,
} from "../chat/schedule-agent";
import {
  streamChatCompletion,
  truncateMessages,
  type ChatCompletionMessage,
} from "../chat/openai-client";
import { EVE_SKILL_SYSTEM_PROMPT } from "../chat/eve-skill-config";
import { buildLocalKnowledgeContext } from "../chat/local-knowledge";

const CHAT_DISPLAY_PROMPT = `

回复格式要求：
- 尽量使用短段落，长回复按语义自然换行。
- 涉及步骤、日程、清单时使用分行列表。
- 不要把多个事项挤在同一段里。`;

function ChatApp() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [activeView, setActiveView] = useState<"chat" | "schedule">("chat");
  const [showCompletedReminders, setShowCompletedReminders] = useState(false);
  const [input, setInput] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [petDockedChat, setPetDockedChat] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const miniChatSubmitRef = useRef<(text: string) => void>(() => {});

  const scrollMessagesToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const list = listRef.current;
        if (!list) return;
        list.scrollTop = list.scrollHeight;
      });
    });
  }, []);

  const loadSessions = useCallback(async () => {
    const list = await listSessions();
    setSessions(list);
    if (list.length === 0) {
      const id = await createSession("新对话");
      setSessionId(id);
      setSessions([{ id, title: "新对话", createdAt: Date.now() }]);
    } else if (!sessionId) {
      setSessionId(list[0].id);
    }
  }, [sessionId]);

  useEffect(() => {
    loadSessions().catch(console.error);
  }, [loadSessions]);

  useEffect(() => {
    if (sessionId == null) return;
    getMessages(sessionId).then(setMessages).catch(console.error);
  }, [sessionId]);

  useEffect(() => {
    const current = sessions.find((session) => session.id === sessionId);
    setTitleDraft(current?.title ?? "新对话");
    setEditingTitle(false);
  }, [sessionId, sessions]);

  useEffect(() => {
    if (activeView === "chat") scrollMessagesToBottom();
  }, [activeView, messages, scrollMessagesToBottom, sessionId]);

  const loadReminders = useCallback(async () => {
    setScheduleLoading(true);
    setScheduleError(null);
    try {
      const list = await listReminders(showCompletedReminders, 100);
      setReminders(list);
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : String(err));
    } finally {
      setScheduleLoading(false);
    }
  }, [showCompletedReminders]);

  useEffect(() => {
    if (activeView === "schedule") {
      loadReminders().catch(console.error);
    }
  }, [activeView, loadReminders]);

  const handleNewSession = async () => {
    const id = await createSession("新对话");
    setSessionId(id);
    setMessages([]);
    await loadSessions();
  };

  const handleRenameSession = async () => {
    if (sessionId == null) return;
    const title = titleDraft.trim() || "新对话";
    await updateSessionTitle(sessionId, title);
    setSessions((prev) =>
      prev.map((session) =>
        session.id === sessionId ? { ...session, title } : session,
      ),
    );
    setEditingTitle(false);
  };

  const handleCompleteReminder = async (reminderId: number) => {
    await completeReminder(reminderId);
    await loadReminders();
  };

  const handleDeleteReminder = async (reminderId: number) => {
    await deleteReminder(reminderId);
    await loadReminders();
  };

  const handleSend = useCallback(async (messageText?: string) => {
    const text = (messageText ?? input).trim();
    if (!text || streaming || sessionId == null) return;

    if (messageText == null) setInput("");
    setError(null);
    setStreaming(true);

    const userMsg = await addMessage(sessionId, "user", text);
    setMessages((prev) => [...prev, {
      id: userMsg,
      sessionId,
      role: "user",
      content: text,
      ts: Date.now(),
    }]);

    const isFirst = messages.filter((m) => m.role === "user").length === 0;
    if (isFirst) {
      await updateSessionTitle(sessionId, text.slice(0, 24));
      await loadSessions();
    }

    try {
      const [settings, apiKey, recent] = await Promise.all([
        getSettings(),
        getApiKey(),
        getRecentMessages(sessionId, 20),
      ]);

      if (!apiKey) {
        throw new Error("请先在设置中配置 API Key");
      }

      await emitPetEvent("chat-thinking");

      const showBubble = settings.showChatBubble !== false;
      const memoryEnabled = settings.enableMemory !== false;
      const scheduleToolsEnabled = settings.enableScheduleTools !== false;
      const [memories, reminders, localKnowledgeContext] = await Promise.all([
        memoryEnabled ? searchMemories(text, 12) : Promise.resolve([]),
        scheduleToolsEnabled ? listReminders(false, 30) : Promise.resolve([]),
        buildLocalKnowledgeContext(text),
      ]);
      abortRef.current = new AbortController();
      let scheduleToolResults: string[] = [];

      if (scheduleToolsEnabled && shouldPlanScheduleTools(text)) {
        try {
          const calls = await planScheduleToolCalls({
            baseUrl: String(settings.apiBaseUrl),
            apiKey,
            model: String(settings.model),
            userText: text,
            reminders,
            signal: abortRef.current.signal,
          });
          scheduleToolResults = await executeScheduleToolCalls(calls);
          if (calls.length > 0) void loadReminders();
        } catch (err) {
          console.warn("schedule tool planning failed", err);
        }
      }

      const apiMessages: ChatCompletionMessage[] = truncateMessages([
        {
          role: "system",
          content: `${EVE_SKILL_SYSTEM_PROMPT}${CHAT_DISPLAY_PROMPT}${localKnowledgeContext}${buildMemoryContext(memories)}${formatScheduleToolResults(scheduleToolResults)}`,
        },
        ...recent
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
      ]);

      let assistantText = "";
      let lastBubbleEmit = 0;

      await emitPetEvent("chat-streaming");

      await streamChatCompletion({
        baseUrl: String(settings.apiBaseUrl),
        apiKey,
        model: String(settings.model),
        messages: apiMessages,
        temperature: Number(settings.temperature),
        maxTokens: Number(settings.maxTokens),
        signal: abortRef.current.signal,
        onDelta: (delta) => {
          assistantText += delta;
          const now = Date.now();
          if (showBubble && assistantText.trim() && now - lastBubbleEmit > 120) {
            lastBubbleEmit = now;
            void emitPetBubble(assistantText);
          }
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant" && last.id === -1) {
              return [...prev.slice(0, -1), { ...last, content: assistantText }];
            }
            return [
              ...prev,
              {
                id: -1,
                sessionId,
                role: "assistant" as const,
                content: assistantText,
                ts: Date.now(),
              },
            ];
          });
        },
        onDone: () => {},
        onError: (err) => { throw err; },
      });

      if (showBubble && assistantText.trim()) {
        await emitPetBubble(assistantText);
      }

      const msgId = await addMessage(sessionId, "assistant", assistantText);
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== -1);
        return [
          ...withoutTemp,
          {
            id: msgId,
            sessionId,
            role: "assistant",
            content: assistantText,
            ts: Date.now(),
          },
        ];
      });

      if (memoryEnabled && assistantText.trim()) {
        void extractMemoryFacts({
          baseUrl: String(settings.apiBaseUrl),
          apiKey,
          model: String(settings.model),
          existingMemories: memories,
          userText: text,
          assistantText,
        })
          .then((facts) =>
            Promise.all(
              facts.map((fact) =>
                addMemory(
                  fact.content,
                  fact.category,
                  fact.importance,
                  sessionId,
                ),
              ),
            ),
          )
          .catch((err) => console.warn("memory extraction failed", err));
      }

      await emitPetEvent("chat-done");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      await emitPetEvent("api-error");
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, loadReminders, loadSessions, messages, sessionId, streaming]);

  useEffect(() => {
    miniChatSubmitRef.current = (text: string) => {
      void handleSend(text);
    };
  }, [handleSend]);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | null = null;

    listen<{ text: string }>("pet-mini-chat-submit", (event) => {
      miniChatSubmitRef.current(event.payload.text);
    })
      .then((cleanup) => {
        if (active) {
          unlisten = cleanup;
        } else {
          cleanup();
        }
      })
      .catch(console.error);

    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  const togglePetDockedChat = async () => {
    const enabled = !petDockedChat;
    setPetDockedChat(enabled);
    await emit("pet-chat-dock", {
      enabled,
      text: getLatestDisplayMessage(messages),
    });
  };

  return (
    <div class="chat-app">
      <header class="chat-header">
        <div class="chat-title-area">
          <span class="window-title">与小楠聊天</span>
          {editingTitle ? (
            <div class="title-editor">
              <input
                type="text"
                value={titleDraft}
                autoFocus
                onInput={(e) =>
                  setTitleDraft((e.target as HTMLInputElement).value)
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleRenameSession();
                  if (e.key === "Escape") setEditingTitle(false);
                }}
              />
              <button type="button" onClick={handleRenameSession}>
                保存
              </button>
            </div>
          ) : (
            <div class="title-display">
              <h1>{titleDraft}</h1>
              <button type="button" onClick={() => setEditingTitle(true)}>
                重命名
              </button>
            </div>
          )}
        </div>
        <div class="chat-header-actions">
          <div class="view-switch" role="tablist" aria-label="聊天页面">
            <button
              type="button"
              class={activeView === "chat" ? "active" : ""}
              onClick={() => setActiveView("chat")}
            >
              聊天
            </button>
            <button
              type="button"
              class={activeView === "schedule" ? "active" : ""}
              onClick={() => setActiveView("schedule")}
            >
              日程
            </button>
          </div>
          <button
            type="button"
            class={petDockedChat ? "dock-active" : ""}
            onClick={togglePetDockedChat}
          >
            桌面小聊
          </button>
          <button type="button" onClick={handleNewSession}>新对话</button>
        </div>
      </header>

      <aside class="session-list">
        {sessions.map((s) => (
          <button
            type="button"
            key={s.id}
            class={`session-item ${s.id === sessionId ? "active" : ""}`}
            onClick={() => setSessionId(s.id)}
          >
            {s.title}
          </button>
        ))}
      </aside>

      <main class="chat-main">
        {activeView === "chat" ? (
          <>
            <div class="messages" ref={listRef}>
              {messages.length === 0 && (
                <p class="empty-hint">你好！我是小楠，有什么想聊的吗？</p>
              )}
              {messages.map((m) => (
                <div key={m.id} class={`message ${m.role}`}>
                  {m.role === "assistant" && (
                    <img
                      class="assistant-avatar"
                      src="/assets/ui/xiaonan-avatar.png"
                      alt="小楠"
                    />
                  )}
                  <div class="message-bubble">
                    <span class="role">{m.role === "user" ? "你" : "小楠"}</span>
                    <p class="message-text">{m.content}</p>
                  </div>
                </div>
              ))}
            </div>

            {error && <div class="error-toast">{error}</div>}

            <div class="input-bar">
              <textarea
                value={input}
                onInput={(e) => setInput((e.target as HTMLTextAreaElement).value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="输入消息… Enter 发送"
                rows={2}
                disabled={streaming}
              />
              <button type="button" onClick={() => handleSend()} disabled={streaming}>
                {streaming ? "…" : "发送"}
              </button>
            </div>
          </>
        ) : (
          <section class="schedule-page">
            <div class="schedule-toolbar">
              <div>
                <h2>日程提醒</h2>
                <p>{reminders.length} 条{showCompletedReminders ? "提醒" : "待办提醒"}</p>
              </div>
              <div class="schedule-actions">
                <label class="schedule-toggle">
                  <input
                    type="checkbox"
                    checked={showCompletedReminders}
                    onChange={(e) =>
                      setShowCompletedReminders(
                        (e.target as HTMLInputElement).checked,
                      )
                    }
                  />
                  显示已完成
                </label>
                <button type="button" onClick={loadReminders} disabled={scheduleLoading}>
                  {scheduleLoading ? "刷新中" : "刷新"}
                </button>
              </div>
            </div>

            {scheduleError && <div class="error-toast">{scheduleError}</div>}

            <div class="schedule-list">
              {reminders.length === 0 && (
                <div class="schedule-empty">
                  <p>还没有提醒。</p>
                  <span>可以在聊天里说“明天上午十点提醒我...”来创建。</span>
                </div>
              )}
              {reminders.map((reminder) => (
                <article
                  class={`schedule-item ${
                    reminder.completed ? "completed" : ""
                  } ${isOverdue(reminder) ? "overdue" : ""}`}
                  key={reminder.id}
                >
                  <div class="schedule-time">
                    <strong>{formatReminderDay(reminder.dueAt)}</strong>
                    <span>{formatReminderClock(reminder.dueAt)}</span>
                  </div>
                  <div class="schedule-content">
                    <h3>{reminder.title}</h3>
                    {reminder.notes && <p>{reminder.notes}</p>}
                    <span>
                      {reminder.completed
                        ? "已完成"
                        : isOverdue(reminder)
                          ? "已到期"
                          : "待提醒"}
                    </span>
                  </div>
                  <div class="schedule-item-actions">
                    {!reminder.completed && (
                      <button
                        type="button"
                        onClick={() => handleCompleteReminder(reminder.id)}
                      >
                        完成
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteReminder(reminder.id)}
                    >
                      删除
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function formatReminderDay(ts: number): string {
  return new Date(ts).toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
    weekday: "short",
  });
}

function formatReminderClock(ts: number): string {
  return new Date(ts).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isOverdue(reminder: ReminderItem): boolean {
  return !reminder.completed && reminder.dueAt <= Date.now();
}

function getLatestDisplayMessage(messages: ChatMessage[]): string {
  const latest =
    [...messages].reverse().find((message) => message.content.trim())?.content ??
    "";
  if (!latest) return "我在这里，随时可以聊。";
  return latest.length > 180 ? `${latest.slice(0, 180)}...` : latest;
}

async function executeScheduleToolCalls(
  calls: ScheduleToolCall[],
): Promise<string[]> {
  const results: string[] = [];
  for (const call of calls) {
    if (call.name === "create_reminder") {
      const reminder = await createReminder(
        call.arguments.title,
        Date.parse(call.arguments.dueAt),
        call.arguments.notes,
      );
      results.push(`已创建提醒：${formatReminderForUser(reminder)}`);
    }

    if (call.name === "list_reminders") {
      const reminders = await listReminders(
        Boolean(call.arguments.includeCompleted),
        50,
      );
      results.push(
        reminders.length === 0
          ? "当前没有待办提醒。"
          : `当前提醒：${reminders.map(formatReminderForUser).join("；")}`,
      );
    }

    if (call.name === "complete_reminder") {
      await completeReminder(call.arguments.reminderId);
      results.push(`已完成提醒 #${call.arguments.reminderId}。`);
    }

    if (call.name === "delete_reminder") {
      await deleteReminder(call.arguments.reminderId);
      results.push(`已删除提醒 #${call.arguments.reminderId}。`);
    }

    if (call.name === "ask_schedule_clarification") {
      results.push(`需要向用户追问：${call.arguments.question}`);
    }
  }
  return results;
}

render(<ChatApp />, document.getElementById("chat-root")!);
