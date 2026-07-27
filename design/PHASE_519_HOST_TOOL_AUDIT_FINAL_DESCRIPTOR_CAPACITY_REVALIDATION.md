# Phase519 Host Tool Audit Final Descriptor Capacity Revalidation

## 状态

代码、测试与文档已完成。

## 审计结论

Phase517使用rotation preparation descriptor size决定是否轮转，Phase518又绑定了final append path identity；但同一个inode仍可在两个descriptor open之间增长。Final identity检查会通过，随后append可能使current generation超过`maxBytes`，从而削弱Phase500的bounded-generation约束。

## 目标

- Final descriptor write前重新验证capacity。
- 使用final FileHandle fstat的authoritative size。
- 复用Phase515 shared capacity decision。
- 使用同一prepared line byte count与configured max bytes。
- Same-inode growth导致overflow时稳定拒绝。
- 拒绝发生在chmod/write之前。
- 保持path identity与exclusive creation gates。
- Missing exclusive-created file按size 0通过同一决策。
- 不在final append阶段隐式重新执行rotation。
- 后续record可以从最新size重新进入完整pipeline。

## Final Descriptor Decision

`appendAuditLine`现在接收：

- prepared `line`
- exact UTF-8 `lineBytes`
- validated `maxBytes`
- Phase518 append expectation

Open成功后，`validateAuditFileHandle`返回descriptor fstat。Type/link-count与existing identity检查通过后，调用：

```text
evaluateJsonlAuditCapacity(status.size, lineBytes, maxBytes)
```

若`rotationRequired`为true，抛出：

```text
Audit file capacity changed before append.
```

只有decision允许直接append时才执行mode convergence和write。

## Why Reject Instead of Rotate

Final append阶段已经消费了Phase518 expectation，且可能刚刚exclusive-create新current。此处重新进入rotation会重复执行archive mutation并扩大状态机复杂度。Stable rejection保留current与`.1`状态；serialized tail可恢复，下一条record会从path inspection、descriptor binding和rotation decision完整重试。

## Same-Inode Growth Test

测试创建一条current record，并将max设置为恰好容纳第二条同尺寸record。Preparation阶段判断exact fit、不rotation；在final descriptor open前，通过另一个descriptor向同一inode追加一个字节。Final identity仍匹配，但最新size使shared decision要求rotation，因此第二条record被拒绝，外部追加字节保留，`.1`不创建且第二条marker不写入。

## 边界

- Check覆盖rotation decision到final descriptor fstat之间的same-inode size增长。
- Final fstat后仍可能有另一个process向同一inode并发append；完整cross-process serialization仍需外部locking或single-writer ownership。
- 该阶段不验证现有JSONL内容完整性，只维护byte capacity。
- Single record自身超过max仍在filesystem访问前拒绝。

## 验收标准

- Final descriptor使用最新size调用shared capacity helper。
- Same-inode one-byte growth使exact-fit record稳定拒绝。
- Refusal发生在audit record write前。
- Existing file identity保持相同时仍执行capacity gate。
- Missing creation、normal append和normal rotation保持。
- Path replacement/disappearance/appearance tests保持。
- TypeScript、Python和integration全量回归通过。

## 实现结果

- `appendAuditLine`新增lineBytes和maxBytes输入。
- Final descriptor fstat同时服务identity与capacity revalidation。
- 新增stable capacity-drift error。
- Test覆盖same-inode growth、no-record-write和no-rotation side effect。
- README、SECURITY、protocol、architecture和extension docs同步final capacity boundary。
