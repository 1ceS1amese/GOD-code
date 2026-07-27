# Phase 28: Plugin / Skill Manifest Schema

Phase28 将 plugin / skill manifest 的隐式 parser contract 文档化，并提供 CLI 可查看的 schema。

本阶段仍然是 TS Host 本地诊断能力：不新增 JSON-RPC 方法，不执行 plugin 自带代码，不改变 Plugin / Skill runtime 的加载语义。

## CLI

```bash
god-code plugins schema
god-code plugins schema --json
```

## Schema 边界

- `plugin.json` 和 `skill.json` 使用同一 manifest schema。
- 必填字段：
  - `id`
  - `name`
  - `version`
- 可选字段：
  - `tools`
  - `permissions`
  - `promptFragments`
- `tools[]` 的必填字段：
  - `name`
  - `description`
- `tools[].input_schema` 是可选 object，会作为 `ToolCatalogEntry.input_schema` 透传。
- unknown fields 目前不报错，但当前 parser 会忽略它们。
- `permissions` 只是声明，不绕过 Host permission policy。

## 验收

- TS unit 覆盖 schema text / JSON 输出。
- Integration 覆盖 `plugins schema --json`。
- CLI smoke 覆盖 required fields、tool fields 和 `input_schema`。
- `./tools/check.sh` 全量通过。
