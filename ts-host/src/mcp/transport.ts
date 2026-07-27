export interface McpTransport {
  start(): Promise<void>;
  stop(): Promise<void>;
}
