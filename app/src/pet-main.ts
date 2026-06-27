import {
  getCurrentWindow,
  LogicalPosition,
  LogicalSize,
} from "@tauri-apps/api/window";
import { emit, listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import atlasConfig from "./config/atlas-config.json";
import type { AtlasConfig, OutfitInfo, OutfitsManifest, PetStateName } from "./pet/types";
import { PetRenderer } from "./pet/renderer";
import { PetStateMachine } from "./pet/state-machine";
import {
  hideBubble,
  initBubble,
  onBubbleLayoutChange,
  setBubbleEnabled,
  setDockedChat,
  setupMiniChat,
  showBubble,
} from "./pet/bubble";

const atlas = atlasConfig as AtlasConfig;
const WINDOW_PAD = 24;
const DEFAULT_OUTFIT_ID = "red_white_dress";
const DEFAULT_SPRITESHEET = "/assets/spritesheet.webp";
const IDLE_SHOWCASE_INTERVAL_MS = 9000;
const DRAG_STOP_DELAY_MS = 220;

interface PetSettings {
  petScale: number;
  showChatBubble: boolean;
  currentOutfitId: string;
}

interface ReminderEventPayload {
  id: number;
  title: string;
  notes: string | null;
  dueAt: number;
}

async function main(): Promise<void> {
  initBubble();
  const canvas = document.getElementById("pet-canvas") as HTMLCanvasElement;
  const renderer = new PetRenderer(canvas, atlas);
  const machine = new PetStateMachine();
  const outfits = await loadOutfitsManifest();

  await applyPetSettings(renderer, outfits);
  onBubbleLayoutChange(() => void syncPetWindowSize(renderer));

  machine.onChange((state) => renderer.setState(state));
  renderer.onAnimationComplete((state) => machine.onAnimationComplete(state));
  renderer.start();

  setupInteractions(machine);
  setupReminderPopup();
  setupMiniChat((text) => emit("pet-mini-chat-submit", { text }));
  setupIdleShowcase(machine);
  setupTauriEvents(machine, renderer, outfits);
}

async function syncPetWindowSize(renderer: PetRenderer): Promise<void> {
  const { width, height } = renderer.getCanvasSize();
  const win = getCurrentWindow();
  const size = await win.outerSize().catch(() => null);
  const position = await win.outerPosition().catch(() => null);
  const nextWidth = Math.ceil(width + WINDOW_PAD);
  const nextHeight = Math.ceil(
    height + WINDOW_PAD + visibleElementHeight("pet-bubble-panel") +
      visibleElementHeight("pet-mini-chat"),
  );

  await win.setSize(new LogicalSize(nextWidth, nextHeight));

  if (size && position) {
    const heightDelta = size.height - nextHeight;
    if (heightDelta !== 0) {
      await win
        .setPosition(new LogicalPosition(position.x, position.y + heightDelta))
        .catch(() => {});
    }
  }
}

function visibleElementHeight(id: string): number {
  const element = document.getElementById(id);
  if (!element || element.hidden) return 0;
  const rect = element.getBoundingClientRect();
  const styles = window.getComputedStyle(element);
  return (
    rect.height +
    Number.parseFloat(styles.marginTop || "0") +
    Number.parseFloat(styles.marginBottom || "0")
  );
}

async function applyPetSettings(
  renderer: PetRenderer,
  outfits: OutfitsManifest | null,
): Promise<void> {
  try {
    const settings = await invoke<PetSettings>("get_settings");
    await renderer.loadSpritesheet(
      getOutfitSpritesheet(outfits, settings.currentOutfitId),
    );
    renderer.setDisplayScale(clampScale(settings.petScale));
    setBubbleEnabled(settings.showChatBubble);
    await syncPetWindowSize(renderer);
  } catch {
    await renderer.loadSpritesheet(DEFAULT_SPRITESHEET);
  }
}

async function loadOutfitsManifest(): Promise<OutfitsManifest | null> {
  try {
    const response = await fetch("/assets/outfits-manifest.json");
    if (!response.ok) return null;
    return (await response.json()) as OutfitsManifest;
  } catch {
    return null;
  }
}

function getOutfitSpritesheet(
  outfits: OutfitsManifest | null,
  outfitId: string | undefined,
): string {
  const outfit = findOutfit(outfits, outfitId) ?? findOutfit(outfits, DEFAULT_OUTFIT_ID);
  return outfit ? toAssetUrl(outfit.spritesheet) : DEFAULT_SPRITESHEET;
}

function findOutfit(
  outfits: OutfitsManifest | null,
  outfitId: string | undefined,
): OutfitInfo | null {
  if (!outfits || !outfitId) return null;
  return outfits.outfits.find((outfit) => outfit.id === outfitId) ?? null;
}

function toAssetUrl(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function clampScale(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(2, Math.max(0.5, value));
}

function getActionDurationMs(state: PetStateName): number | undefined {
  if (state === "idle") return undefined;
  const config = atlas.states[state];
  const twoLoopsMs = Math.ceil((config.frames / atlas.fps) * 2 * 1000);
  return Math.max(twoLoopsMs, 4200);
}

function setupInteractions(machine: PetStateMachine): void {
  const win = getCurrentWindow();
  const canvas = document.getElementById("pet-canvas") as HTMLCanvasElement;
  const DRAG_THRESHOLD = 8;
  const DOUBLE_CLICK_MS = 350;

  let downX = 0;
  let downY = 0;
  let pointerDown = false;
  let dragStarted = false;
  let dragActive = false;
  let lastWindowX: number | null = null;
  let dragStopTimer: ReturnType<typeof setTimeout> | null = null;
  let lastClickTime = 0;
  let clickTimer: ReturnType<typeof setTimeout> | null = null;

  const clearDragStopTimer = () => {
    if (dragStopTimer) {
      clearTimeout(dragStopTimer);
      dragStopTimer = null;
    }
  };

  const scheduleDragStop = () => {
    clearDragStopTimer();
    dragStopTimer = setTimeout(() => {
      if (dragActive) machine.dispatch({ type: "drag_stop" });
    }, DRAG_STOP_DELAY_MS);
  };

  const endDrag = () => {
    pointerDown = false;
    dragStarted = false;
    dragActive = false;
    lastWindowX = null;
    clearDragStopTimer();
    machine.dispatch({ type: "drag_end" });
  };

  void win.onMoved(({ payload }) => {
    if (!dragActive) {
      lastWindowX = payload.x;
      return;
    }
    if (lastWindowX === null) {
      lastWindowX = payload.x;
      scheduleDragStop();
      return;
    }

    const dx = payload.x - lastWindowX;
    lastWindowX = payload.x;
    if (Math.abs(dx) < 1) return;

    machine.dispatch({
      type: "drag_move",
      direction: dx < 0 ? "left" : "right",
    });
    scheduleDragStop();
  });

  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    pointerDown = true;
    dragStarted = false;
    downX = e.clientX;
    downY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!pointerDown || dragStarted) return;
    const dx = e.clientX - downX;
    const dy = e.clientY - downY;
    if (Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
      dragStarted = true;
      dragActive = true;
      lastWindowX = null;
      machine.dispatch({
        type: "drag_start",
        direction: dx < 0 ? "left" : "right",
      });
      scheduleDragStop();
      void win.startDragging();
    }
  });

  const finishPointer = (e: PointerEvent) => {
    if (!pointerDown) return;
    pointerDown = false;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      // pointer already released
    }

    if (dragStarted) {
      endDrag();
      return;
    }

    const now = Date.now();
    if (now - lastClickTime < DOUBLE_CLICK_MS) {
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
      }
      lastClickTime = 0;
      void invoke("show_chat_window");
      return;
    }

    lastClickTime = now;
    if (clickTimer) clearTimeout(clickTimer);
    clickTimer = setTimeout(() => {
      clickTimer = null;
      machine.dispatch({ type: "click" });
      lastClickTime = 0;
    }, DOUBLE_CLICK_MS);
  };

  canvas.addEventListener("pointerup", finishPointer);
  canvas.addEventListener("pointercancel", finishPointer);
  window.addEventListener("blur", () => {
    pointerDown = false;
  });

  setupContextMenu(canvas, machine);
}

function setupContextMenu(
  canvas: HTMLCanvasElement,
  machine: PetStateMachine,
): void {
  document.querySelectorAll("#pet-context-menu").forEach((node) => node.remove());

  const MENU_MARGIN = 8;
  const MENU_MAX_HEIGHT = 360;
  const MENU_MIN_HEIGHT = 96;
  const menu = document.createElement("div");
  menu.id = "pet-context-menu";
  menu.hidden = true;
  document.body.appendChild(menu);

  let menuView: "root" | "actions" = "root";
  let menuAnchor = { x: MENU_MARGIN, y: MENU_MARGIN };

  const renderRootMenu = () => {
    menuView = "root";
    menu.innerHTML = `
      <button type="button" data-action="chat">聊天</button>
      <button type="button" data-action="settings">设置</button>
      <button type="button" data-action="actions">动作</button>
    `;
  };
  const renderActionMenu = () => {
    menuView = "actions";
    menu.innerHTML = `
      <button type="button" class="menu-back" data-action="root">返回</button>
      <div class="menu-title">动作表情</div>
      <div class="menu-separator"></div>
      <button type="button" data-state="idle">安静待机</button>
      <button type="button" data-state="waving">打招呼</button>
      <button type="button" data-state="jumping">开心跳一下</button>
      <button type="button" data-state="waiting">认真思考</button>
      <button type="button" data-state="running">活力小跑</button>
      <button type="button" data-state="running-left">向左小跑</button>
      <button type="button" data-state="running-right">向右小跑</button>
      <button type="button" data-state="review">专注看屏幕</button>
      <button type="button" data-state="failed">有点委屈</button>
    `;
  };

  const hideMenu = () => {
    menu.hidden = true;
  };

  const showMenuAt = (x: number, y: number) => {
    menuAnchor = { x, y };
    menu.hidden = false;
    menu.style.visibility = "hidden";
    menu.style.maxHeight = "";
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    requestAnimationFrame(() => {
      const menuHeight = menu.scrollHeight;
      const menuWidth = menu.offsetWidth;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - y - MENU_MARGIN;
      const spaceAbove = y - MENU_MARGIN;
      const availableHeight = Math.max(spaceBelow, spaceAbove);
      const maxHeight = Math.max(
        MENU_MIN_HEIGHT,
        Math.min(MENU_MAX_HEIGHT, availableHeight),
      );
      const renderedHeight = Math.min(menuHeight, maxHeight);
      const preferBelow = spaceBelow >= renderedHeight || spaceBelow >= spaceAbove;
      const left = Math.min(
        Math.max(MENU_MARGIN, x),
        Math.max(MENU_MARGIN, viewportWidth - menuWidth - MENU_MARGIN),
      );
      const top = preferBelow
        ? Math.min(y, Math.max(MENU_MARGIN, viewportHeight - renderedHeight - MENU_MARGIN))
        : Math.max(MENU_MARGIN, y - renderedHeight);

      menu.style.setProperty("--pet-menu-max-height", `${maxHeight}px`);
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
      menu.style.visibility = "";
    });
  };

  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    renderRootMenu();
    showMenuAt(e.clientX, e.clientY);
  });

  menu.addEventListener("click", (e) => {
    const clicked = e.target as HTMLElement;
    const target = clicked.closest<HTMLElement>("[data-action]");
    const stateTarget = clicked.closest<HTMLElement>("[data-state]");
    if (!target && !stateTarget) return;

    const state = stateTarget?.getAttribute("data-state") as PetStateName | null;
    if (menuView === "actions" && state) {
      machine.dispatch({ type: "perform", state, durationMs: getActionDurationMs(state) });
      hideMenu();
      return;
    }

    const action = target?.getAttribute("data-action");
    if (action === "chat") {
      hideMenu();
      void invoke("show_chat_window");
      return;
    }
    if (action === "settings") {
      hideMenu();
      void invoke("show_settings_window");
      return;
    }
    if (action === "actions") {
      renderActionMenu();
      showMenuAt(menuAnchor.x, menuAnchor.y);
      return;
    }
    if (action === "root") {
      renderRootMenu();
      showMenuAt(menuAnchor.x, menuAnchor.y);
    }
  });

  menu.addEventListener("wheel", (e) => {
    e.stopPropagation();
  });

  document.addEventListener("pointerdown", (e) => {
    if (!menu.hidden && !menu.contains(e.target as Node)) hideMenu();
  });
  window.addEventListener("blur", hideMenu);
}

function setupIdleShowcase(machine: PetStateMachine): void {
  window.setInterval(() => {
    machine.dispatch({ type: "idle_tick" });
  }, IDLE_SHOWCASE_INTERVAL_MS);
}

function setupTauriEvents(
  machine: PetStateMachine,
  renderer: PetRenderer,
  outfits: OutfitsManifest | null,
): void {
  listen<{ side: "left" | "right" | "none" }>("pet-edge", (event) => {
    machine.dispatch({ type: "edge", side: event.payload.side });
  });

  listen("chat-thinking", () => {
    machine.dispatch({ type: "chat_thinking" });
    showBubble("让我想想…");
  });
  listen("chat-streaming", () => machine.dispatch({ type: "chat_streaming" }));
  listen("chat-done", () => machine.dispatch({ type: "chat_done" }));
  listen("api-error", () => {
    machine.dispatch({ type: "api_error" });
    showBubble("出错了，请检查 API 设置");
  });

  listen<{ text: string }>("pet-bubble", (event) => {
    showBubble(event.payload.text);
  });

  listen<{ text: string }>("pet-bubble-hide", () => {
    hideBubble();
  });

  listen<{ enabled: boolean; text?: string }>("pet-chat-dock", (event) => {
    setDockedChat(Boolean(event.payload.enabled), event.payload.text);
  });

  listen<ReminderEventPayload>("schedule-reminder", (event) => {
    machine.dispatch({ type: "perform", state: "waving", durationMs: 2500 });
    showReminderPopup(event.payload);
  });

  listen<PetSettings>("settings-changed", async (event) => {
    const { petScale, showChatBubble, currentOutfitId } = event.payload;
    await renderer.loadSpritesheet(getOutfitSpritesheet(outfits, currentOutfitId));
    renderer.setDisplayScale(clampScale(petScale));
    setBubbleEnabled(showChatBubble);
    await syncPetWindowSize(renderer);
  });
}

function setupReminderPopup(): void {
  const popup = document.getElementById("pet-reminder-popup");
  if (!popup) return;

  popup.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-reminder-action]",
    );
    if (!target) return;
    const action = target.getAttribute("data-reminder-action");
    if (action === "dismiss") {
      popup.hidden = true;
      return;
    }
    if (action === "chat") {
      popup.hidden = true;
      void invoke("show_chat_window");
    }
  });
}

function showReminderPopup(reminder: ReminderEventPayload): void {
  const popup = document.getElementById("pet-reminder-popup");
  const title = document.getElementById("reminder-title");
  const notes = document.getElementById("reminder-notes");
  if (!popup || !title || !notes) return;

  title.textContent = reminder.title;
  notes.textContent = reminder.notes || formatReminderTime(reminder.dueAt);
  popup.hidden = false;
  showBubble(
    reminder.notes ? `提醒：${reminder.title}\n${reminder.notes}` : `提醒：${reminder.title}`,
    true,
  );
}

function formatReminderTime(dueAt: number): string {
  return new Date(dueAt).toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

main().catch(console.error);
