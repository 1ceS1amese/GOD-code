# Phase520 Host Tool Audit Configurable Append Durability

## 状态

代码、测试与文档已完成。

## 审计结论

Phase498-519建立了安全、受限并可诊断的JSONL audit write pipeline，但成功路径在`handle.writeFile`后直接close，没有显式datasync/fsync。Close通常只把数据交给内核缓存，无法给需要更强故障持久性的部署提供明确策略；同时不应无条件让所有开发和测试环境承担per-record fsync成本。

## 目标

- 新增明确的append durability枚举。
- 默认保持现有buffered性能语义。
- 支持per-record data synchronization。
- 支持per-record full file synchronization。
- Environment config和direct sink construction共享validation。
- Audit config diagnostics报告effective durability。
- Disabled audit下durability设置按辅助配置报告ignored。
- Sync位于write成功后、descriptor close前。
- Sync failure沿record Promise和audit warning边界传播。
- 明确file sync不等于parent-directory metadata durability。

## Durability Policy

`JsonlAuditDurability`允许：

- `buffered`：write后直接close，不显式调用sync。
- `data`：write后调用`FileHandle.datasync()`。
- `full`：write后调用`FileHandle.sync()`。

`DEFAULT_JSONL_AUDIT_DURABILITY`为`buffered`。`validateJsonlAuditDurability`拒绝其他值并返回不包含原配置值的稳定错误。JsonlAuditSink第五个constructor参数接受相同policy，并公开normalized readonly `durability`属性。

## Configuration

新增：

```text
GOD_CODE_AUDIT_DURABILITY=buffered|data|full
```

`parseAuditDurability`trim并lowercase输入；unset/blank返回buffered。`createConfiguredAuditSink`把解析结果传给sink。未配置`GOD_CODE_AUDIT_FILE`时不会构造持久sink，但非空durability仍使inspect-config提示辅助设置被忽略。

## Diagnostic Contract

`AuditConfigDetails`新增optional `durability`：

- Disabled report显式输出buffered default。
- Valid enabled report输出normalized policy。
- Invalid enabled report返回error，durability保持undefined且不回显原始值。

Human renderer和JSON renderer共享同一details，不访问audit filesystem。

## Write Ordering

Final descriptor成功通过Phase518/519的type、identity和capacity gates后：

1. POSIX mode convergence。
2. `writeFile(line)`。
3. 根据policy执行none、datasync或sync。
4. `finally`关闭descriptor。

Sync失败时record Promise拒绝，Host registry沿Phase499输出audit warning。因为write已经发生，文件中可能存在完整record，但requested durability没有得到确认；实现不尝试truncate回滚。

## Durability Boundary

Data/full policy同步current file descriptor。它们不对以下事项作保证：

- parent directory中新文件entry的持久化
- current到`.1` rename metadata的持久化
- 被删除旧`.1` entry的持久化
- filesystem、device或虚拟化层超出fsync contract的行为

Rotation metadata durability需要独立的parent-directory synchronization设计，不能由file fsync暗示。

## 验收标准

- Default/unset policy为buffered。
- Config trim/case normalization工作。
- Invalid policy稳定拒绝且不回显值。
- Buffered不调用datasync或sync。
- Data每条成功record调用一次datasync且不调用sync。
- Full每条成功record调用一次sync且不调用datasync。
- Sync发生在write后、close前。
- Sync failure拒绝record Promise但已写record可存在。
- Existing path、rotation、capacity与append expectation tests保持。
- TypeScript、Python和integration全量回归通过。

## 实现结果

- 新增durability constant、type和validator。
- JsonlAuditSink constructor与final append接入policy。
- 新增environment parser和configured sink wiring。
- Audit inspect-config新增durability metadata与human output。
- Tests覆盖三种sync策略、normalization、invalid config和sync failure。
- Audit env example、README、SECURITY、protocol、architecture和extension docs同步durability边界。

## Phase551 后续加固

Phase551只在`writeFile(line)`本身reject且same current object的size增长位于exact record byte上界内时执行truncate rollback。Rollback成功后按本阶段policy处理：`data`调用datasync，`full`调用fsync，`buffered`不主动sync。原本由datasync/fsync或parent metadata sync抛出的failure仍不回滚，保持“完整record可能已写入但durability未确认”的本阶段语义。
