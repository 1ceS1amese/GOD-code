# Phase514 Host Tool Audit Current-Generation Capacity Readiness

## 状态

代码、测试与文档已完成。

## 审计结论

Phase510-513已经能够验证audit配置、current path、append access和rotated `.1` entry，但`inspect-path`没有报告existing current generation相对`GOD_CODE_AUDIT_MAX_BYTES`的位置。一个已经达到或超过上限的安全文件仍只显示一般ready，用户无法在实际写入前判断下一条record是否必然触发rotation。

## 目标

- 复用current target安全lstat，不额外open或读取文件。
- 报告validated maximum capacity。
- 报告current generation byte size。
- 报告clamped remaining capacity。
- 区分at-capacity和over-capacity。
- 只在下一条非空JSONL record必然触发rotation时给出确定提示。
- Missing target按zero-byte current generation报告。
- Capacity warning与既有mode、rotation-entry warning可以组合。
- Path/access错误继续优先于capacity warning。
- Inspection不创建、截断、chmod、rotation或写入文件。
- 不改变runtime capacity与single-generation rotation语义。

## Shared Size Metadata

`inspectJsonlAuditPath(filePath)`在已经验证target为single-link regular file的同一次`lstat`中保存`status.size`为`targetSizeBytes`。Missing target保持该字段undefined。该metadata只描述检查瞬间，不提供跨进程锁或后续write保证。

## CLI Capacity Model

有效配置保证`max_bytes`为positive safe integer。`inspectAuditPath`派生：

- `max_bytes`
- `current_generation_bytes`：existing target size；missing target为0
- `remaining_capacity_bytes`：`max(0, max-current)`
- `current_generation_over_capacity`：`current > max`
- `rotation_expected_on_next_record`：`current > 0 && current >= max`

JSONL record始终包含至少一个字节，因此非空current达到capacity后，下一条合法record必然满足runtime的rotation条件。Current尚有剩余空间时，diagnostic不知道下一条serialized record大小，不声称不会rotation。

## Warning Semantics

- `current === max`：warn，说明current at capacity且下一条record前rotation。
- `current > max`：warn，说明current exceeds capacity且下一条record前rotation。
- `0 <= current < max`：不增加capacity warning。

Directory/target access或path safety error仍先返回error；capacity信息保留在成功完成metadata inspection后的details中。Existing broad mode以及rotated symlink/other warning继续按Phase511/513规则组合。

## No-Mutation Guarantee

Capacity readiness只使用既有lstat结果和整数派生。它不读取audit内容，不调用open、mkdir、chmod、rm、rename、truncate、append或sync。测试同时验证at-capacity和over-capacity inspection前后内容不变。

## 边界

- Size与access一样是TOCTOU snapshot，其他writer可在检查后改变文件。
- 尚有空间不等于下一条record一定无需rotation；record byte size直到preparation完成才确定。
- 单条record自身超过capacity仍由runtime拒绝，不由path inspection预测。
- Cross-process writer ownership边界保持Phase507定义。

## 验收标准

- Existing target size通过shared inspection暴露。
- At-capacity target返回remaining 0、over false、next-record rotation true和warning。
- Over-capacity target返回remaining 0、over true、next-record rotation true和warning。
- Inspection前后target content保持。
- Missing/under-capacity路径不产生capacity warning。
- Existing path、append access和rotated-entry tests保持。
- TypeScript、Python和integration全量回归通过。

## 实现结果

- `JsonlAuditPathInspection`新增`targetSizeBytes`。
- `AuditPathDetails`新增五个capacity readiness字段。
- CLI新增at-capacity与over-capacity warning语义。
- Focused tests覆盖两个exhausted capacity分支及no-mutation。
- README、SECURITY、protocol、architecture和extension docs同步capacity readiness边界。
