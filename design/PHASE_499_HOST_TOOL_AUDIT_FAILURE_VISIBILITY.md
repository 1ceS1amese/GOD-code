# Phase499 Host Tool Audit Failure Visibility

## 状态

代码、测试与文档已完成。

## 审计结论

Phase498增加显式JSONL audit后，HostToolRegistry仍在 `recordAudit` 中完全吞掉sink异常。best-effort行为避免审计故障阻断工具，但调用方无法知道tool_requested、decision、approval或finished是否缺失；显式启用持久审计时，静默丢失会产生错误的完整性预期。

## 目标

- audit failure不改变工具success/domain error。
- audit failure不放宽permission deny。
- 每个失败事件对caller可见。
- warning保留失败event type和message。
- 多个warning按审计调用顺序排列。
- 所有early-return路径都携带已发生warning。
- tool_finished写入失败同样对caller可见。
- tool_finished成功时记录包含前序audit warnings的最终result。
- 默认Noop和正常sink不增加output字段。

## Audit Warning Contract

每个warning结构为：

```json
{
  "code": "audit_error",
  "event_type": "tool_approval",
  "message": "audit failed: tool_approval"
}
```

warnings位于 `ToolExecutionResult.output.audit_warnings`。成功与失败结果都允许携带output，因此原始 `ok`、error code/message/details和已有output字段保持不变。

## Unified Finish Boundary

`executeRequest`创建per-request warning list。requested、decision和approval record失败按发生顺序加入列表。policy exception、deny、approval deny、pre-execution cancellation和handler completion全部调用 `finishRequest`：先把已有warnings附到result，再尝试record tool_finished；若最后一次record失败，再把该warning只附给caller。

## Execution Truth

AuditWarning是observability metadata，不是工具失败。已经完成的Write/Edit/Bash不能因日志磁盘故障变成可重试error，原本的permission_denied、policy_error、tool_cancelled或domain error也不能被audit_error覆盖。调用方可根据部署要求自行升级warning，但registry保持默认best-effort。

## 验收标准

- failing sink不阻止approved Write提交文件。
- result保持ok=true。
- requested、decision、approval、finished四个warning顺序稳定。
- 每个warning包含code、event_type和message。
- approval仍只执行一次。
- before-policy exception保持policy_error且不执行Write。
- early failure result包含requested和finished warnings。
- normal Memory/Noop sink结果不新增audit_warnings。
- focused、TS全量、Python全量和integration通过。

## 实现结果

- `recordAudit`改为返回可选AuditWarning。
- `executeRequest`增加per-request warning accumulation。
- 新增统一 `finishRequest` 处理所有结果路径。
- 新增 `attachAuditWarnings` 保留原始result并合并warning。
- tests覆盖approved side effect、完整四事件失败和pre-execution early failure。
