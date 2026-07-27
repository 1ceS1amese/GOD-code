import type { McpToolRegistry } from "./registry.js";

export interface McpClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  toolRegistry(): McpToolRegistry;
}
