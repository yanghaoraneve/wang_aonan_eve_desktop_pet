import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import {
  clearMemories,
  deleteMemory,
  getApiKey,
  getSettings,
  listMemories,
  saveSettings,
  setApiKey,
} from "../chat/history-bridge";
import { DEFAULT_SETTINGS } from "../chat/system-prompt";
import { invoke } from "@tauri-apps/api/core";
import type { MemoryItem, OutfitInfo, OutfitsManifest } from "../pet/types";

type SettingsState = typeof DEFAULT_SETTINGS;
type SettingsTab = "api" | "display" | "agent";

const SETTINGS_TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: "api", label: "API" },
  { id: "display", label: "显示" },
  { id: "agent", label: "Agent" },
];

function normalizeSettings(raw: Record<string, unknown>): SettingsState {
  return {
    apiBaseUrl:
      String(raw.apiBaseUrl ?? "").trim() || DEFAULT_SETTINGS.apiBaseUrl,
    model: String(raw.model ?? "").trim() || DEFAULT_SETTINGS.model,
    temperature: Number(raw.temperature) || DEFAULT_SETTINGS.temperature,
    maxTokens: Number(raw.maxTokens) || DEFAULT_SETTINGS.maxTokens,
    systemPrompt: DEFAULT_SETTINGS.systemPrompt,
    petScale: Number(raw.petScale) || DEFAULT_SETTINGS.petScale,
    showChatBubble:
      raw.showChatBubble === undefined
        ? DEFAULT_SETTINGS.showChatBubble
        : Boolean(raw.showChatBubble),
    currentOutfitId:
      String(raw.currentOutfitId ?? "").trim() ||
      DEFAULT_SETTINGS.currentOutfitId,
    enableMemory:
      raw.enableMemory === undefined
        ? DEFAULT_SETTINGS.enableMemory
        : Boolean(raw.enableMemory),
    enableScheduleTools:
      raw.enableScheduleTools === undefined
        ? DEFAULT_SETTINGS.enableScheduleTools
        : Boolean(raw.enableScheduleTools),
  };
}

function SettingsApp() {
  const [apiKey, setApiKeyLocal] = useState("");
  const [settings, setSettings] = useState<SettingsState>({
    ...DEFAULT_SETTINGS,
  });
  const [outfits, setOutfits] = useState<OutfitInfo[]>([]);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [activeTab, setActiveTab] = useState<SettingsTab>("api");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getSettings(),
      getApiKey(),
    ]).then(([s, key]) => {
      setSettings(normalizeSettings(s));
      setApiKeyLocal(key);
    }).catch(console.error);
    fetch("/assets/outfits-manifest.json")
      .then((response) => response.json() as Promise<OutfitsManifest>)
      .then((manifest) => setOutfits(manifest.outfits))
      .catch(console.error);
    listMemories(100).then(setMemories).catch(console.error);
  }, []);

  const handleSave = async () => {
    setError(null);
    try {
      await setApiKey(apiKey);
      await saveSettings({
        ...(settings as unknown as Record<string, unknown>),
        systemPrompt: DEFAULT_SETTINGS.systemPrompt,
      });

      await invoke("emit_settings_changed", {
        petScale: settings.petScale,
        showChatBubble: settings.showChatBubble,
        currentOutfitId: settings.currentOutfitId,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteMemory = async (memoryId: number) => {
    await deleteMemory(memoryId);
    setMemories((prev) => prev.filter((memory) => memory.id !== memoryId));
  };

  const handleClearMemories = async () => {
    await clearMemories();
    setMemories([]);
  };

  return (
    <div class="settings-app">
      <header class="settings-header">
        <h1>小楠设置</h1>
        <button type="button" class="save-btn" onClick={handleSave}>
          保存设置
        </button>
      </header>

      <div class="settings-shell">
        <nav class="settings-tabs">
          {SETTINGS_TABS.map((tab) => (
            <button
              type="button"
              key={tab.id}
              class={activeTab === tab.id ? "active" : ""}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <main class="settings-panel">
          {activeTab === "api" && (
            <section>
              <h2>API 配置</h2>
              <p class="hint">
                默认使用 DeepSeek 官方 API（platform.deepseek.com 获取 Key）。
                模型推荐 deepseek-v4-flash（快速省流）或 deepseek-v4-pro（更强推理）。
              </p>
              <label>
                Base URL
                <input
                  type="url"
                  value={settings.apiBaseUrl}
                  onInput={(e) =>
                    setSettings({
                      ...settings,
                      apiBaseUrl: (e.target as HTMLInputElement).value,
                    })
                  }
                />
              </label>
              <label>
                API Key
                <input
                  type="password"
                  value={apiKey}
                  onInput={(e) =>
                    setApiKeyLocal((e.target as HTMLInputElement).value)
                  }
                  placeholder="DeepSeek API Key"
                  autoComplete="off"
                />
              </label>
              <label>
                Model
                <input
                  type="text"
                  value={settings.model}
                  onInput={(e) =>
                    setSettings({
                      ...settings,
                      model: (e.target as HTMLInputElement).value,
                    })
                  }
                />
              </label>
              <div class="form-grid">
                <label>
                  Temperature
                  <input
                    type="number"
                    min="0"
                    max="2"
                    step="0.1"
                    value={settings.temperature}
                    onInput={(e) =>
                      setSettings({
                        ...settings,
                        temperature: Number((e.target as HTMLInputElement).value),
                      })
                    }
                  />
                </label>
                <label>
                  Max Tokens
                  <input
                    type="number"
                    min="256"
                    max="8192"
                    step="256"
                    value={settings.maxTokens}
                    onInput={(e) =>
                      setSettings({
                        ...settings,
                        maxTokens: Number((e.target as HTMLInputElement).value),
                      })
                    }
                  />
                </label>
              </div>
            </section>
          )}

          {activeTab === "display" && (
            <section>
              <h2>显示</h2>
              <div class="outfit-grid">
                {outfits.map((outfit) => (
                  <button
                    type="button"
                    key={outfit.id}
                    class={`outfit-card ${
                      settings.currentOutfitId === outfit.id ? "active" : ""
                    }`}
                    onClick={() =>
                      setSettings({
                        ...settings,
                        currentOutfitId: outfit.id,
                      })
                    }
                  >
                    <img src={toAssetUrl(outfit.thumbnail)} alt="" />
                    <span>{outfit.name}</span>
                  </button>
                ))}
              </div>
              <label>
                桌宠大小 ({Math.round(settings.petScale * 100)}%)
                <input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.05"
                  value={settings.petScale}
                  onInput={(e) =>
                    setSettings({
                      ...settings,
                      petScale: Number((e.target as HTMLInputElement).value),
                    })
                  }
                />
              </label>
              <label class="checkbox">
                <input
                  type="checkbox"
                  checked={settings.showChatBubble}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      showChatBubble: (e.target as HTMLInputElement).checked,
                    })
                  }
                />
                在桌宠上方显示聊天气泡
              </label>
            </section>
          )}

          {activeTab === "agent" && (
            <section>
              <h2>Agent 能力</h2>
              <p class="hint">
                角色设定固定使用本地 wang_aonan_eve skill；歌词库已作为本地知识库接入聊天。
              </p>
              <label class="checkbox">
                <input
                  type="checkbox"
                  checked={settings.enableMemory}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      enableMemory: (e.target as HTMLInputElement).checked,
                    })
                  }
                />
                启用自动记忆
              </label>
              <label class="checkbox">
                <input
                  type="checkbox"
                  checked={settings.enableScheduleTools}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      enableScheduleTools: (e.target as HTMLInputElement).checked,
                    })
                  }
                />
                启用日程与提醒工具
              </label>
              <div class="memory-list">
                {memories.length === 0 && <p class="empty-memory">暂无记忆</p>}
                {memories.map((memory) => (
                  <div class="memory-item" key={memory.id}>
                    <span>{memory.content}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteMemory(memory.id)}
                    >
                      删除
                    </button>
                  </div>
                ))}
              </div>
              {memories.length > 0 && (
                <button
                  type="button"
                  class="secondary-btn"
                  onClick={handleClearMemories}
                >
                  清空记忆
                </button>
              )}
            </section>
          )}

          {error && <div class="error">{error}</div>}
          {saved && <div class="success">已保存</div>}
        </main>
      </div>
    </div>
  );
}

function toAssetUrl(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

render(<SettingsApp />, document.getElementById("settings-root")!);
