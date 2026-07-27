# Phase500 Host Tool Bounded JSONL Audit Rotation

## 状态

代码、测试与文档已完成。

## 审计结论

Phase498提供opt-in JSONL audit persistence，但文件会随长期run/repl/tui和高频工具调用无界增长。Audit payload还可能包含较大的tool input/result，单条record即可造成异常磁盘占用。Phase499能暴露写入失败，但没有主动容量边界。

## 目标

- current audit generation具有默认字节上限。
- 可通过环境变量显式覆盖容量。
- 配置只接受positive safe integer。
- append前按UTF-8 encoded bytes检查容量。
- 超限时保留一个rotated generation。
- rotation与append保持record调用顺序。
- 单条record超限时不修改current/rotated文件。
- 单条超限通过Phase499 audit warning对caller可见。
- 前一次容量/写入失败不永久毒化后续record queue。

## Capacity Configuration

`GOD_CODE_AUDIT_MAX_BYTES`仅在启用 `GOD_CODE_AUDIT_FILE` 时解析。缺失或blank使用 `10485760` bytes；非数字、零、负数、小数或超过JavaScript safe integer范围的值在Host配置阶段抛出明确错误。JsonlAuditSink也公开 `maxBytes`，供embedding直接设置。

## Rotation Semantics

每次record先序列化完整JSONL line并计算UTF-8 bytes。如果单条line大于maxBytes，立即拒绝且不创建文件。否则在serialized write tail内读取current size：

- current不存在或追加后未超限：直接append。
- current非空且追加会超限：删除旧 `<file>.1`，rename current为 `<file>.1`，再append到新current。

只保留一个rotated generation，最大稳定占用约为两个generation加单条文件系统metadata开销。

## Failure Integration

Oversized record返回rejected `AuditSink.record` promise。HostToolRegistry Phase499捕获该failure并附加对应event的 `output.audit_warnings`，但不改变permission、tool success/domain error或已提交副作用。非法环境配置则在Host setup前失败，避免用户误以为容量策略已生效。

## 验收标准

- 默认maxBytes为10 MiB。
- 显式capacity正确传入configured sink。
- 两条记录跨上限时第一条进入 `.1`、第二条进入current。
- rotated/current内容可独立解析为JSONL。
- 单条record超限时拒绝且不创建文件。
- invalid capacity values全部被拒绝。
- capacity failure经Host registry变为ordered audit warnings。
- 原始工具domain result保持。
- focused、TS全量、Python全量和integration通过。

## 实现结果

- JsonlAuditSink新增default/maxBytes与UTF-8 line size检查。
- 新增serialized `rotateIfNeeded` 单代rotation。
- config新增 `parseAuditMaxBytes` 和环境接线。
- tests覆盖rotation、oversized record、invalid config和Phase499 warning集成。
- README、SECURITY、protocol和audit env example同步容量语义。

## Phase553 后续加固

Phase553保持单个current与单个`.1`的正常稳定状态，但不再在new current成功前永久删除旧archive。Existing `.1`先进入same-parent private staging；pre-commit failure恢复pre-rotation current/archive，successful write完成selected file durability后才commit清理。Crash或commit uncertainty可留下额外private staging residue，属于后续maintenance边界。

## Phase554 后续加固

Phase554把private staging从shared anonymous prefix升级为absolute target path派生的32-hex scope，并增加4096/128 bounded list与exact-ID direct只读inspection。不同audit targets不互相枚举；Phase553 legacy residue只计数告警，不恢复、不删除也不获得target authority。
