import type { PetEvent, PetStateName } from "./types";

const ONE_SHOT_STATES: PetStateName[] = ["waving", "jumping", "failed"];
const CLICK_SEQUENCE: PetStateName[] = [
  "waving",
  "jumping",
  "waiting",
  "running",
  "review",
];
const IDLE_SHOWCASE_STATES: PetStateName[] = [
  "waving",
  "waiting",
  "running",
  "review",
  "jumping",
];
const DEFAULT_PERFORM_DURATION_MS = 4200;

export class PetStateMachine {
  private state: PetStateName = "idle";
  private failedTimer: ReturnType<typeof setTimeout> | null = null;
  private performTimer: ReturnType<typeof setTimeout> | null = null;
  private clickIndex = 0;
  private listeners = new Set<(state: PetStateName) => void>();

  getState(): PetStateName {
    return this.state;
  }

  onChange(listener: (state: PetStateName) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispatch(event: PetEvent): void {
    const next = this.transition(this.state, event);
    if (next && (next !== this.state || event.type === "perform")) {
      this.setState(next, this.getPerformDuration(event, next));
    }
  }

  onAnimationComplete(state: PetStateName): void {
    if (!ONE_SHOT_STATES.includes(state)) return;
    if (state === "failed") return;
    if (this.state === state) {
      this.setState("idle");
    }
  }

  private setState(state: PetStateName, durationMs?: number): void {
    if (this.failedTimer) {
      clearTimeout(this.failedTimer);
      this.failedTimer = null;
    }
    if (this.performTimer) {
      clearTimeout(this.performTimer);
      this.performTimer = null;
    }
    this.state = state;
    this.listeners.forEach((l) => l(state));

    if (state === "failed") {
      this.failedTimer = setTimeout(() => {
        if (this.state === "failed") this.setState("idle");
      }, durationMs ?? 3000);
      return;
    }

    if (durationMs && state !== "idle") {
      this.performTimer = setTimeout(() => {
        if (this.state === state) this.setState("idle");
      }, durationMs);
    }
  }

  private transition(
    current: PetStateName,
    event: PetEvent,
  ): PetStateName | null {
    switch (event.type) {
      case "click":
        return this.nextClickState();
      case "drag_start":
        return event.direction === "left" ? "running-left" : "running-right";
      case "drag_move":
        return event.direction === "left" ? "running-left" : "running-right";
      case "drag_stop":
        if (current === "running-left" || current === "running-right") {
          return "idle";
        }
        return null;
      case "drag_end":
        return "idle";
      case "perform":
        return event.state;
      case "idle_tick":
        if (current !== "idle") return null;
        return this.randomShowcaseState();
      case "edge":
        return null;
      case "chat_thinking":
        return "waiting";
      case "chat_streaming":
        return "review";
      case "chat_done":
        return "idle";
      case "api_error":
        return "failed";
      default:
        return null;
    }
  }

  private getPerformDuration(
    event: PetEvent,
    state: PetStateName,
  ): number | undefined {
    if (event.type === "perform") {
      if (state === "idle") return undefined;
      return event.durationMs ?? DEFAULT_PERFORM_DURATION_MS;
    }
    if (event.type === "idle_tick") return DEFAULT_PERFORM_DURATION_MS;
    if (event.type === "click" && !ONE_SHOT_STATES.includes(state)) {
      return DEFAULT_PERFORM_DURATION_MS;
    }
    return undefined;
  }

  private nextClickState(): PetStateName {
    const state = CLICK_SEQUENCE[this.clickIndex % CLICK_SEQUENCE.length];
    this.clickIndex += 1;
    return state;
  }

  private randomShowcaseState(): PetStateName {
    const index = Math.floor(Math.random() * IDLE_SHOWCASE_STATES.length);
    return IDLE_SHOWCASE_STATES[index];
  }
}
