# Phase503 Host Tool Audit Preparation Failure Promise

## 状态

代码、测试与文档已完成。

## 审计结论

`AuditSink.record(event)`声明返回 `Promise<void>`，但JsonlAuditSink此前在构造write promise之前直接调用clock、`Date.toISOString()`、`JSON.stringify()`和`Buffer.byteLength()`。循环引用、BigInt、throwing getter或无效clock可让方法同步抛出，迫使调用方同时处理同步异常和promise rejection，也破坏sink之间的一致接口语义。

## 目标

- 所有record preparation failure转换为rejected Promise。
- `record()`本身不因timestamp或serialization异常同步抛出。
- 保持call-time JSON snapshot，不延迟读取可变event对象。
- preparation失败的事件不创建或修改audit文件。
- preparation失败不毒化serialized write tail。
- 下一条合法事件仍能正常持久化。
- Host registry继续通过Phase499输出对应event的 `audit_warnings`。
- 不改变JSONL envelope、event schema、rotation或permission语义。

## Call Boundary

`prepareAuditLine`在`record()`调用期间形成 `{recorded_at,event}` JSON line和UTF-8 byte count。外层try/catch只负责把同步异常转换为 `Promise.reject(error)`。成功准备的line仍是独立字符串，不会因调用方在返回后修改event而变化。

## Recovery Boundary

Preparation failure发生在事件加入`writeTail`之前，因此失败事件不会执行path、capacity、rotation或append操作，也不会替换tail。既有queued write继续完成，后续合法record继续从原tail串行追加。文件系统阶段的失败仍使用既有 `.catch(() => undefined)` recovery chain。

## 验收标准

- circular event input不会从`record()`同步抛出。
- 返回Promise以serialization error拒绝。
- 失败事件不产生JSONL record。
- 同一sink随后可写入合法事件。
- 文件最终只包含恢复后的合法事件。
- focused、TypeScript全量、Python全量和integration通过。

## 实现结果

- 新增`PreparedAuditLine`和`prepareAuditLine` preparation boundary。
- `record()`把同步preparation异常转换为rejected Promise。
- audit tests覆盖circular serialization failure、no-sync-throw和post-failure recovery。
- README、SECURITY、protocol、architecture和extension docs同步Promise契约。
