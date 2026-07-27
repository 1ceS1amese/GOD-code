# Phase509 Host Tool Audit Redaction Key Extensions

## 状态

代码、测试与文档已完成。

## 审计结论

Phase504/505提供固定的structured credential suffix集合，但plugin、MCP和企业工具可能使用`credential`、`access_key`、`passphrase`或领域特定命名。固定集合无法覆盖所有schema；直接扩大默认启发式又可能对普通字段产生不可接受的误脱敏。

## 目标

- 新增`GOD_CODE_AUDIT_REDACT_KEYS` comma-separated配置。
- JsonlAuditSink direct constructor支持同一additional suffix list。
- Custom规则只追加，不替换或关闭built-ins。
- 所有suffix执行lowercase和separator removal规范化。
- Duplicate normalized suffix自动去重。
- 最多接受64个input entries。
- 每项规范化后长度必须为1-128。
- Empty、whitespace-only或separator-only entry安全拒绝。
- 配置只包含key names，不应包含secret values。
- Custom suffix复用Phase505 value-before-read redaction。
- 不扫描自由文本，也不改变MemoryAuditSink事件。

## Configuration Boundary

Environment adapter在audit持久化启用时读取`GOD_CODE_AUDIT_REDACT_KEYS`。Unset或整体whitespace返回empty extension；其他值按comma拆分，每个entry trim后交给core normalizer。`credential, access_key`被规范化为`credential`和`accesskey`。包含empty segment的`valid,`或`,`被视为配置错误，而不是静默忽略。

## Core Normalization

`normalizeAdditionalAuditSensitiveKeySuffixes`同时服务environment config和direct constructor。Input必须为array且最多64项；每项必须是non-empty string，规范化后必须包含1-128个ASCII letter/digit。结果使用Set保持首次出现顺序并去重。

Constructor总是先放入不可移除的built-in suffix，再追加normalized custom values。Snapshot state携带合并结果，`isSensitiveAuditKey`对event key执行同一规范化和endsWith匹配。

## Matching Boundary

配置`access_key`会命中`aws_access_key`，不会命中`access_key_count`，因为后者规范化后以`count`结束。配置是suffix语义而非substring或正则表达式，避免运行任意pattern和不可预测的中间字段匹配。

## 验收标准

- `service_credential`和`aws_access_key`按custom规则脱敏。
- 默认`password`在custom配置存在时仍脱敏。
- `access_key_count`保持原值。
- 原input对象保持不变。
- Config parser完成trim、normalization和dedupe。
- Empty segment、separator-only、129-char suffix和65 entries拒绝。
- 默认redaction、descriptor safety、capacity、path和rotation tests保持。
- TypeScript、Python和integration全量回归通过。

## 实现结果

- 新增redaction key count/length constants和shared normalizer。
- JsonlAuditSink constructor新增第四个additional suffix参数。
- Config新增`parseAuditRedactKeys`和环境接线。
- Snapshot state使用built-in与custom合并suffix集合。
- tests覆盖custom persistence、default preservation、false-positive boundary和invalid config。
- README、SECURITY、protocol和audit env example同步配置边界。
