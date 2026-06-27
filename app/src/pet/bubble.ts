const BUBBLE_HIDE_MS = 8000;

let bubbleEl: HTMLDivElement | null = null;
let bubblePanel: HTMLDivElement | null = null;
let miniChatForm: HTMLFormElement | null = null;
let miniChatInput: HTMLInputElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
let enabled = true;
let dockedChat = false;
let latestText = "";
let layoutChangeHandler: (() => void) | null = null;

export function initBubble(): HTMLDivElement {
  bubbleEl = document.getElementById("pet-bubble") as HTMLDivElement;
  bubblePanel = document.getElementById("pet-bubble-panel") as HTMLDivElement;
  miniChatForm = document.getElementById("pet-mini-chat") as HTMLFormElement;
  miniChatInput = document.getElementById(
    "pet-mini-chat-input",
  ) as HTMLInputElement;
  if (bubblePanel) bubblePanel.hidden = true;
  return bubbleEl;
}

export function onBubbleLayoutChange(handler: () => void): void {
  layoutChangeHandler = handler;
}

export function setBubbleEnabled(value: boolean): void {
  enabled = value;
  if (!value) hideBubble();
}

export function setDockedChat(value: boolean, text?: string): void {
  dockedChat = value;
  if (miniChatForm) miniChatForm.hidden = !value;
  notifyLayoutChanged();

  if (!value) {
    hideBubble();
    return;
  }

  showBubble(text?.trim() || latestText || "我在这里，随时可以聊。", true);
  requestAnimationFrame(() => miniChatInput?.focus());
}

export function setupMiniChat(
  onSubmit: (text: string) => void | Promise<void>,
): void {
  if (!miniChatForm || !miniChatInput) return;
  const input = miniChatInput;
  miniChatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    void onSubmit(text);
  });
}

export function showBubble(text: string, persistent = false): void {
  if (!enabled || !bubbleEl) return;
  const trimmed = text.trim();
  if (!trimmed) return;

  latestText = trimmed;
  bubbleEl.textContent = trimmed;
  bubbleEl.hidden = false;
  if (bubblePanel) bubblePanel.hidden = false;
  notifyLayoutChanged();

  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = null;
  if (!persistent && !dockedChat) {
    hideTimer = setTimeout(() => hideBubble(), BUBBLE_HIDE_MS);
  }
}

export function hideBubble(): void {
  if (!bubbleEl) return;
  if (dockedChat) return;
  bubbleEl.hidden = true;
  if (bubblePanel) bubblePanel.hidden = true;
  bubbleEl.textContent = "";
  notifyLayoutChanged();
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
}

function notifyLayoutChanged(): void {
  requestAnimationFrame(() => layoutChangeHandler?.());
}
