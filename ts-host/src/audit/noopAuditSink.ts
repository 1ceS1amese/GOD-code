import type { AuditEvent, AuditSink } from "./auditSink.js";

export class NoopAuditSink implements AuditSink {
  public async record(_event: AuditEvent): Promise<void> {
    // No-op.
  }
}
