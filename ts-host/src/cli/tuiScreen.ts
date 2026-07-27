import type { TuiDimensions } from "./tuiRenderer.js";

export interface TuiScreenOutput {
  write(text: string): void;
  columns?: number;
  rows?: number;
  isTTY?: boolean;
}

export const TUI_SCREEN_SEQUENCE = {
  enterAlternate: "\x1b[?1049h",
  leaveAlternate: "\x1b[?1049l",
  hideCursor: "\x1b[?25l",
  showCursor: "\x1b[?25h",
  clear: "\x1b[2J",
  home: "\x1b[H"
} as const;

export class TuiScreen {
  private active = false;

  public constructor(private readonly output: TuiScreenOutput) {}

  public start(): void {
    if (this.active) {
      return;
    }
    this.output.write(
      TUI_SCREEN_SEQUENCE.enterAlternate +
        TUI_SCREEN_SEQUENCE.hideCursor +
        TUI_SCREEN_SEQUENCE.clear +
        TUI_SCREEN_SEQUENCE.home
    );
    this.active = true;
  }

  public render(frame: string): void {
    if (!this.active) {
      this.output.write(frame);
      return;
    }
    this.output.write(TUI_SCREEN_SEQUENCE.home + TUI_SCREEN_SEQUENCE.clear + frame);
  }

  public suspend(): void {
    if (!this.active) {
      return;
    }
    this.output.write(
      TUI_SCREEN_SEQUENCE.showCursor +
        TUI_SCREEN_SEQUENCE.leaveAlternate
    );
  }

  public resume(): void {
    if (!this.active) {
      return;
    }
    this.output.write(
      TUI_SCREEN_SEQUENCE.enterAlternate +
        TUI_SCREEN_SEQUENCE.hideCursor +
        TUI_SCREEN_SEQUENCE.clear +
        TUI_SCREEN_SEQUENCE.home
    );
  }

  public stop(): void {
    if (!this.active) {
      return;
    }
    this.output.write(
      TUI_SCREEN_SEQUENCE.showCursor +
        TUI_SCREEN_SEQUENCE.leaveAlternate
    );
    this.active = false;
  }

  public isActive(): boolean {
    return this.active;
  }

  public getDimensions(): TuiDimensions {
    return {
      columns: this.output.columns ?? 80,
      rows: this.output.rows ?? 24
    };
  }
}
