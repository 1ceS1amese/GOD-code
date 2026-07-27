import type { AuditEvent, AuditSink } from "./auditSink.js";

export class MemoryAuditSink implements AuditSink {
  public readonly events: AuditEvent[] = [];

  public async record(event: AuditEvent): Promise<void> {
    this.events.push(event);
  }
}
