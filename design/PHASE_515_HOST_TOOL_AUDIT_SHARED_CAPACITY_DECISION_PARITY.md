# Phase515 Host Tool Audit Shared Capacity Decision Parity

## 状态

代码、测试与文档已完成。

## 审计结论

Phase514让CLI暴露current generation capacity状态，但runtime和diagnostic仍分别维护容量条件：runtime使用`current + next > max`，CLI使用`current >= max`推断最小下一条record。两者当前等价，但后续修改可能产生边界漂移；加法在safe-integer上界附近也会失去精确整数语义。

## 目标

- 建立共享pure capacity decision helper。
- Runtime oversized-record gate复用该helper。
- Runtime rotation gate复用该helper。
- CLI next-record readiness复用该helper。
- 明确current、next record和max byte-count invariants。
- 使用overflow-safe comparison决定rotation。
- 保持empty current generation不做无意义rotation。
- 保持单条record超过capacity时先拒绝且不触碰filesystem。
- 不改变JSONL envelope、rotation generation count或warning shape。

## Shared Decision Contract

`evaluateJsonlAuditCapacity(currentBytes,nextRecordBytes,maxBytes)`返回：

- `currentBytes`
- `nextRecordBytes`
- `maxBytes`
- `remainingBytes`
- `recordFits`
- `rotationRequired`
- `overCapacity`

Inputs要求current为non-negative safe integer，next record和max为positive safe integer。Max继续复用`validateJsonlAuditMaxBytes`，使constructor、config与decision保持同一capacity invariant。

## Overflow-Safe Rotation Rule

在`nextRecordBytes <= maxBytes`时：

```text
rotationRequired = currentBytes > 0
  && currentBytes > maxBytes - nextRecordBytes
```

该表达式等价于runtime原有的`current + next > max`，但不会先形成可能超过`Number.MAX_SAFE_INTEGER`的和。Empty current即使接收一条恰好等于capacity的record也直接写入，不先产生空archive。

## Runtime Integration

- Record进入filesystem阶段前，以`current=0`检查`recordFits`；false继续抛出稳定`Audit record exceeds GOD_CODE_AUDIT_MAX_BYTES.`。
- `rotateIfNeeded`取得current size后调用同一decision；只有`rotationRequired`时才检查和替换`.1`。
- Path、mode、descriptor和single-generation replacement边界保持Phase500-513定义。

## CLI Integration

CLI不知道未来record的serialized byte size，因此使用`nextRecordBytes=1`查询最小合法JSONL growth。结果为true表示任意下一条合法record都必然触发rotation；false只表示至少一字节仍可容纳，不保证实际下一条record无需rotation。

Phase514的remaining、over-capacity和rotation字段现在全部来自shared decision，不再复制runtime边界条件。

## 验收标准

- Empty current + exact-capacity record不rotation。
- Exact fit不rotation。
- One-byte overflow触发rotation。
- At-capacity + one byte触发rotation。
- Over-capacity current触发rotation。
- Oversized single record返回recordFits false且不rotation。
- `Number.MAX_SAFE_INTEGER`边界不依赖溢出加法。
- Invalid current/next/max inputs稳定拒绝。
- Existing runtime rotation与CLI capacity tests保持。
- TypeScript、Python和integration全量回归通过。

## 实现结果

- 新增`JsonlAuditCapacityDecision`和`evaluateJsonlAuditCapacity`。
- Runtime record-fit和rotation gate接入shared helper。
- CLI capacity readiness以one-byte minimum record接入shared helper。
- Tests覆盖exact-fit、overflow、over-capacity、oversized、safe-integer edge和invalid inputs。
- README、SECURITY、protocol、architecture和extension docs同步shared decision边界。
