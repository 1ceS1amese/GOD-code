# Phase498 Host Tool JSONL Audit Persistence

## 状态

代码、测试与文档已完成。

## 审计结论

HostToolRegistry已经定义tool_requested、tool_decision、tool_approval和tool_finished事件，但生产 `prepareGodCodeHost` 未注入AuditSink，因此默认落到NoopAuditSink。Phase496/497完善了事件语义，却没有显式可配置的持久化落点，真实run/repl/tui无法保留本地审计轨迹。

## 目标

- 保持默认不落盘，避免隐式记录敏感工具输入。
- 通过单一环境变量显式启用本地JSONL audit。
- 相对路径按Host当前工作目录解析。
- 每条记录包含UTC timestamp和完整AuditEvent。
- 并发record调用按调用顺序写入。
- 自动创建父目录。
- 新目录使用0700模式，新文件使用0600模式。
- 嵌入方可直接注入自定义AuditSink。
- audit写入失败继续保持best-effort control-flow isolation。

## Configuration Boundary

`createConfiguredAuditSink`读取 `GOD_CODE_AUDIT_FILE`。缺失或blank值返回NoopAuditSink；有效值通过 `path.resolve(cwd, value)` 生成JsonlAuditSink。`prepareGodCodeHost`新增 `auditSink` option，显式option优先于环境解析，使测试、embedding和未来remote sink可以复用同一Host setup。

## JSONL Persistence

JsonlAuditSink为每次record同步构造：

```json
{"recorded_at":"2026-07-21T12:00:00.000Z","event":{"type":"tool_requested"}}
```

内部promise tail串行化append操作；前一次写入失败不会永久毒化队列，后续record仍可重试写入。sink使用recursive mkdir和appendFile，不持有长期文件句柄。

## Security Boundary

AuditEvent可能包含完整request input、shell command、路径、approval reason和tool result。持久化因此必须显式opt-in，不做默认开启；文档要求按敏感日志保护并避免提交源码仓库。权限mode用于降低本地意外暴露，但不替代操作系统ACL、磁盘加密或日志轮换。

## 验收标准

- 两个并发record调用按调用顺序形成两行JSONL。
- 每行包含recorded_at和event。
- sink自动创建nested目录。
- 相对配置解析为cwd下绝对路径。
- blank配置保持NoopAuditSink。
- Host setup允许显式AuditSink注入。
- 默认行为不创建audit文件。
- focused、TS全量、Python全量和integration通过。

## 实现结果

- 新增 `JsonlAuditSink` ordered append实现。
- 新增 `createConfiguredAuditSink` 环境解析器。
- `prepareGodCodeHost`接入环境sink和显式injection option。
- 新增JSONL envelope/order/config/default tests。
- 新增audit env example并同步README、SECURITY和架构文档。
