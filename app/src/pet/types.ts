export type PetStateName =
  | "idle"
  | "running-right"
  | "running-left"
  | "waving"
  | "jumping"
  | "failed"
  | "waiting"
  | "running"
  | "review";

export interface StateConfig {
  row: number;
  frames: number;
  loop: boolean;
}

export interface AtlasConfig {
  frameWidth: number;
  frameHeight: number;
  columns: number;
  fps: number;
  displayHeight: number;
  states: Record<PetStateName, StateConfig>;
}

export interface SkinInfo {
  id: string;
  name: string;
  description: string;
  file: string;
  anchor: { x: number; y: number };
  size: { width: number; height: number };
}

export interface SkinsManifest {
  schemaVersion: number;
  recommendedDisplay: { heightPx: number; idleFps: number };
  skins: SkinInfo[];
}

export interface AppSettings {
  apiBaseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  autostart: boolean;
  petScale: number;
  showChatBubble: boolean;
  currentOutfitId: string;
  enableMemory: boolean;
  enableScheduleTools: boolean;
}

export interface OutfitInfo {
  id: string;
  name: string;
  description: string;
  spritesheet: string;
  thumbnail: string;
  contactSheet: string;
  validation: string;
  sourceRun: string;
}

export interface OutfitsManifest {
  schemaVersion: number;
  assetType: "animated-outfits";
  atlas: {
    frameWidth: number;
    frameHeight: number;
    columns: number;
    rows: number;
    fps: number;
    displayHeight: number;
  };
  outfits: OutfitInfo[];
}

export interface ChatMessage {
  id: number;
  sessionId: number;
  role: "user" | "assistant" | "system";
  content: string;
  ts: number;
}

export interface ChatSession {
  id: number;
  title: string;
  createdAt: number;
}

export interface MemoryItem {
  id: number;
  content: string;
  category: "profile" | "preference" | "project" | "relationship" | "workflow" | "fact";
  importance: number;
  sourceSessionId: number | null;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number | null;
}

export interface ReminderItem {
  id: number;
  title: string;
  notes: string | null;
  dueAt: number;
  completed: boolean;
  remindedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export type PetEvent =
  | { type: "click" }
  | { type: "double_click" }
  | { type: "drag_start"; direction: "left" | "right" }
  | { type: "drag_move"; direction: "left" | "right" }
  | { type: "drag_stop" }
  | { type: "drag_end" }
  | { type: "perform"; state: PetStateName; durationMs?: number }
  | { type: "idle_tick" }
  | { type: "edge"; side: "left" | "right" | "none" }
  | { type: "chat_thinking" }
  | { type: "chat_streaming" }
  | { type: "chat_done" }
  | { type: "api_error" };
