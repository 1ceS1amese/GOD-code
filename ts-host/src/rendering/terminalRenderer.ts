import type { AssistantMessage } from "../types/godCodeProtocol.js";

export interface RenderOutput {
  write(text: string): void;
}

export interface TurnRenderer {
  onAssistantDelta(text: string): void;
  onAssistantMessage(message: AssistantMessage): void;
  onToolCallRequested(): void;
  finish(): void;
}

export class TerminalRenderer implements TurnRenderer {
  private currentStreamedText = "";
  private hasWrittenOutput = false;
  private lineOpen = false;

  public constructor(private readonly output: RenderOutput = process.stdout) {}

  public onAssistantDelta(text: string): void {
    if (text === "") {
      return;
    }
    this.write(text);
    this.currentStreamedText += text;
  }

  public onAssistantMessage(message: AssistantMessage): void {
    const content = message.content;
    if (this.currentStreamedText.length === 0) {
      this.write(content);
      return;
    }

    if (content === this.currentStreamedText) {
      this.currentStreamedText = "";
      return;
    }

    if (content.startsWith(this.currentStreamedText)) {
      this.write(content.slice(this.currentStreamedText.length));
      this.currentStreamedText = "";
      return;
    }

    const prefix = this.lineOpen ? "\n" : "";
    this.write(prefix + content);
    this.currentStreamedText = "";
  }

  public onToolCallRequested(): void {
    this.flushLine();
    this.currentStreamedText = "";
  }

  public finish(): void {
    this.flushLine();
    this.currentStreamedText = "";
  }

  private write(text: string): void {
    if (text === "") {
      return;
    }
    this.output.write(text);
    this.hasWrittenOutput = true;
    this.lineOpen = !text.endsWith("\n");
  }

  private flushLine(): void {
    if (!this.hasWrittenOutput || !this.lineOpen) {
      return;
    }
    this.output.write("\n");
    this.lineOpen = false;
  }
}
