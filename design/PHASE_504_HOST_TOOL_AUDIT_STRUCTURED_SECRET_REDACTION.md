# Phase504 Host Tool Audit Structured Secret Redaction

## 状态

代码、测试与文档已完成。

## 审计结论

JSONL audit会持久化完整AuditEvent树。Tool input、plugin/MCP result或policy metadata可能包含`Authorization`、`api_key`、`password`、`refresh_token`、`session_cookie`等结构化凭据。即使Phase501/502保护了文件路径和mode，明文凭据仍会扩大日志泄露后的影响范围。

## 目标

- JSONL持久化默认递归脱敏常见structured credential keys。
- 匹配忽略大小写、下划线、连字符和其他separator差异。
- 覆盖authorization、password/passwd、secret、token、API key、private key和cookie类别。
- 命中值统一替换为`[REDACTED]`。
- 不修改原AuditEvent或嵌套input/result对象。
- 非敏感字段、数组和JSONL envelope保持原结构。
- `token_count`等不以敏感词结尾的统计字段保持可见。
- 明确不扫描Bash command、message和output等自由文本内容。
- 不改变MemoryAuditSink、permission、rotation或warning语义。

## Matching Boundary

JSON replacer对每个非root key执行lowercase，再移除非ASCII字母数字字符。归一化结果若以`authorization`、`password`、`passwd`、`secret`、`token`、`apikey`、`privatekey`或`cookie`结尾，则value不再进入持久化结果，改写为固定marker。由此`X-API-Key`、`refresh_token`、`session_cookie`和大小写变体使用同一规则。

## Ownership Boundary

Redaction只作用于`JSON.stringify`生成的line。共享AuditEvent、Host request/result以及MemoryAuditSink持有的对象均不被修改，避免审计保密策略反向改变工具事实或测试观察值。

## Free-Text Boundary

该阶段不尝试解析shell command、自然语言message、path或任意output string。自动扫描自由文本容易产生不可预测误删，也不能可靠识别所有secret格式。JSONL文件仍必须使用Phase502权限和受信任目录，并按敏感日志管理。

## 验收标准

- nested Authorization和X-API-Key值被脱敏。
- password、refresh_token和session_cookie被脱敏。
- raw JSONL不包含这些原始secret值。
- Accept、token_count和自由文本command保持原值。
- 原input对象在record后保持不变。
- circular preparation recovery、rotation、path和mode tests保持通过。
- TypeScript、Python和integration全量回归通过。

## 实现结果

- 新增固定redaction marker和敏感key suffix集合。
- `prepareAuditLine`通过JSON replacer递归脱敏。
- audit tests覆盖nested/case/separator matching、false-positive boundary和event immutability。
- README、SECURITY、protocol和audit env example同步free-text边界。
