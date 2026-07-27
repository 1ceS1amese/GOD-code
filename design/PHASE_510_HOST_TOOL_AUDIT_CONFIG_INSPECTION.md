# Phase510 Host Tool Audit Config Inspection

## 状态

代码、测试与文档已完成。

## 审计结论

Phase498-509已经提供完整JSONL audit配置和运行边界，但用户缺少独立预检入口。无效capacity或redaction配置通常要到Host setup才暴露，并可能被归类为generic tool catalog failure；用户也无法在不运行工具的情况下确认relative path解析结果、effective maxBytes或custom suffix规范化结果。

## 目标

- 新增`god-code audit inspect-config [--json]`。
- 提供共享pure `inspectAuditConfig(environ,cwd)`。
- 报告enabled状态和resolved absolute path。
- 报告effective maxBytes和single rotated generation。
- 报告process-scope writer coordination。
- 报告default redaction enabled和normalized custom key names。
- Disabled且无辅助配置返回ok。
- Disabled但配置max/redaction返回warn ignored。
- Enabled invalid配置返回error。
- Error不回显原始environment value。
- Inspection不创建目录、文件或sink，不读取audit内容。
- Doctor复用同一检查并输出`audit_config`。
- Audit error时doctor跳过Host setup，避免重复或误分类错误。

## Diagnostic Report

Report沿用项目diagnostic风格：顶层`{ok,checks}`，单check名称为`audit_config`，status为ok/warn/error，并附details：

- `enabled`
- `file_path`（enabled时）
- `max_bytes`（有效或disabled default时）
- `rotation_generations: 1`
- `coordination_scope: "process"`
- `default_redaction_enabled: true`
- `custom_redaction_keys`

Human renderer输出稳定逐行字段，JSON renderer直接pretty-print report。Custom key names是schema metadata，不是secret value；invalid raw value不进入report。

## Disabled Semantics

`GOD_CODE_AUDIT_FILE` unset/blank时持久化disabled。若max/redaction也unset，status为ok；若任一辅助变量非空，status为warn并说明配置在file启用前被忽略。Ignored值不解析，因此disabled模式与production Noop sink语义一致。

## Enabled Semantics

Enabled时分别解析maxBytes和redaction keys，以便一次报告多个独立错误。Path仅使用`path.resolve(cwd,configuredPath)`计算，不执行mkdir、lstat、open或access。成功message只包含effective metadata；failure message只包含validator模板。

## Doctor Integration

Doctor在provider config之后加入audit config check。Provider错误仍只控制Python engine check；audit错误控制Host tool setup：doctor保留Python engine诊断，同时把tool catalog标记为warn/skipped，避免prepareGodCodeHost再次消费同一invalid audit配置。

## 验收标准

- Disabled report为ok且filesystem保持空。
- Disabled辅助设置产生warn。
- Enabled report解析absolute path、2048 bytes和normalized custom keys。
- Inspect不创建target parent。
- Invalid capacity/redaction同时报告且不回显raw values。
- CLI `audit inspect-config --json`正常输出。
- Doctor默认输出`OK audit_config: disabled`。
- Doctor audit error时tool catalog为warn/skipped。
- TypeScript、Python和integration全量回归通过。

## 实现结果

- 新增`src/cli/audit.ts` report、inspection和human/JSON renderer。
- Main CLI新增audit command dispatch和help entries。
- Doctor新增共享audit_config检查与Host setup skip gate。
- 新增CLI audit四类状态测试及doctor错误集成测试。
- README、SECURITY、protocol、architecture和extension docs同步inspection边界。
