import type { AtlasConfig, PetStateName } from "./types";

const MIN_NON_LOOP_PLAYS = 2;

export class PetRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private atlas: AtlasConfig;
  private image: HTMLImageElement | null = null;
  private state: PetStateName = "idle";
  private frameIndex = 0;
  private frameTimer = 0;
  private completedLoops = 0;
  private completionNotified = false;
  private rafId = 0;
  private scale = 1;
  private scaleMultiplier = 1;
  private spritesheetUrl = "";

  constructor(canvas: HTMLCanvasElement, atlas: AtlasConfig) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D not supported");
    this.ctx = ctx;
    this.atlas = atlas;
    this.scale = atlas.displayHeight / atlas.frameHeight;
    this.resizeCanvas();
  }

  private resizeCanvas(): void {
    const displayHeight = Math.ceil(this.atlas.displayHeight * this.scaleMultiplier);
    const w = Math.ceil(this.atlas.frameWidth * this.scale);
    this.canvas.width = w;
    this.canvas.height = displayHeight;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${displayHeight}px`;
  }

  async loadSpritesheet(url: string): Promise<void> {
    if (url === this.spritesheetUrl && this.image) return;
    this.image = await this.loadImage(url);
    this.spritesheetUrl = url;
    this.frameIndex = 0;
    this.frameTimer = 0;
  }

  setDisplayScale(multiplier: number): void {
    this.scaleMultiplier = multiplier;
    this.scale =
      (this.atlas.displayHeight / this.atlas.frameHeight) * multiplier;
    this.resizeCanvas();
  }

  getDisplayScale(): number {
    return this.scaleMultiplier;
  }

  getCanvasSize(): { width: number; height: number } {
    return { width: this.canvas.width, height: this.canvas.height };
  }

  setState(state: PetStateName): void {
    if (this.state !== state) {
      this.state = state;
      this.frameIndex = 0;
      this.frameTimer = 0;
      this.completedLoops = 0;
      this.completionNotified = false;
    }
  }

  getState(): PetStateName {
    return this.state;
  }

  start(): void {
    const tick = (ts: number) => {
      if (!this.frameTimer) this.frameTimer = ts;
      const dt = ts - this.frameTimer;
      const frameDuration = 1000 / this.atlas.fps;
      if (dt >= frameDuration) {
        this.frameTimer = ts - (dt % frameDuration);
        this.advanceFrame();
      }
      this.draw();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop(): void {
    cancelAnimationFrame(this.rafId);
  }

  onAnimationComplete(callback: (state: PetStateName) => void): void {
    this.onComplete = callback;
  }

  private onComplete: ((state: PetStateName) => void) | null = null;

  private advanceFrame(): void {
    const cfg = this.atlas.states[this.state];
    this.frameIndex += 1;
    if (this.frameIndex >= cfg.frames) {
      this.completedLoops += 1;
      if (cfg.loop || this.completedLoops < MIN_NON_LOOP_PLAYS) {
        this.frameIndex = 0;
      } else {
        this.frameIndex = cfg.frames - 1;
        if (!this.completionNotified) {
          this.completionNotified = true;
          this.onComplete?.(this.state);
        }
      }
    }
  }

  private draw(): void {
    const { frameWidth, frameHeight } = this.atlas;
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.ctx.clearRect(0, 0, w, h);

    if (!this.image) return;

    const cfg = this.atlas.states[this.state];
    const col = this.frameIndex;
    const sx = col * frameWidth;
    const sy = cfg.row * frameHeight;
    this.ctx.drawImage(
      this.image,
      sx,
      sy,
      frameWidth,
      frameHeight,
      0,
      0,
      w,
      h,
    );
  }

  private loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
      img.src = url;
    });
  }
}
