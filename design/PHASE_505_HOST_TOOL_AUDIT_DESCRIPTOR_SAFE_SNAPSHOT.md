# Phase505 Host Tool Audit Descriptor-Safe Snapshot

## 状态

代码、测试与文档已完成。

## 审计结论

Phase504使用`JSON.stringify` replacer按key脱敏，但ECMAScript serialization会先调用对象的`toJSON`，也会先读取property getter，再调用replacer。恶意或异常对象可以在脱敏前把credential移动到普通key，敏感getter也会在决定写`[REDACTED]`前执行，形成凭据绕过和副作用边界缺口。

## 目标

- 在任何JSON encoding hook之前形成redacted snapshot。
- 敏感key不读取原property value。
- 不调用自定义`toJSON`。
- 不调用非敏感accessor；该event安全拒绝。
- 只接受array、plain object和null-prototype object容器。
- 保持null/string/boolean/finite number语义。
- JSON兼容地处理undefined/function/symbol、sparse array和non-finite number。
- cycle、BigInt和custom container作为preparation failure返回rejected Promise。
- 使用defineProperty保留`__proto__`等prototype-like own keys。
- 原AuditEvent与嵌套对象保持不变。

## Descriptor Walk

`snapshotRedactedAuditValue`维护当前ancestor集合并通过own property descriptors遍历。Object key先执行Phase504敏感匹配：命中时直接向snapshot定义marker，不访问descriptor value，即使原属性是throwing getter也不会执行。普通属性必须是data descriptor，再递归snapshot其value；accessor descriptor立即拒绝。

Array按index descriptor复制。Sparse slot以及array中的undefined/function/symbol按JSON语义写为null；object中的这些值被省略；non-finite number写为null。BigInt和cycle保持显式错误，沿Phase503 rejected Promise契约传播。

## Hook Containment

Snapshot只复制enumerable own data properties到新plain object。Non-enumerable `toJSON`不会被复制，enumerable function-valued `toJSON`按普通JSON function property省略，因此最终`JSON.stringify`只观察新建的无hook snapshot。Custom-prototype对象被拒绝，避免继承serializer hooks。

## 威胁模型边界

该阶段阻断普通object/array的`toJSON`和accessor执行，不提供通用JavaScript membrane。Proxy的`ownKeys`、descriptor或prototype traps仍可能在反射操作中执行；AuditEvent正常来源应是已验证JSON-RPC数据或Host生成的plain data。自由文本secret边界保持Phase504定义。

## 验收标准

- 自定义`toJSON`不能把Authorization secret搬到普通key。
- 敏感throwing getter不执行且持久值为`[REDACTED]`。
- 非敏感getter不执行并返回rejected Promise。
- raw JSONL不包含bypass secret。
- 原structured redaction和event immutability tests保持。
- circular preparation recovery、rotation、path和mode tests保持。
- TypeScript、Python和integration全量回归通过。

## 实现结果

- JSON replacer替换为descriptor-safe pre-redaction snapshot walker。
- 新增plain-container、cycle、BigInt和accessor validation。
- tests覆盖toJSON bypass、sensitive getter non-evaluation和普通accessor拒绝。
- README、SECURITY、protocol、architecture和extension docs同步hook/Proxy边界。
