# Phase 37: Plugin / Skill Local Registry

Phase37 在 Phase36 显式 plugin config entry 基础上增加本地 registry 文件，让多个本地 plugin / skill package 可以被集中列出、检查和按 enabled 状态启用。

本阶段仍然只处理本地文件，不下载 marketplace package，不执行安装脚本，不做自动发现。

## 配置入口

```text
GOD_CODE_PLUGIN_REGISTRY_FILE=examples/config/plugin-registry.json
```

registry 文件格式：

```json
{
  "plugins": [
    {
      "id": "executable-plugin",
      "path": "../plugins/executable-plugin",
      "enabled": true,
      "tags": ["demo", "sandbox"]
    }
  ]
}
```

规则：

- `path` 相对 registry 文件所在目录解析。
- `enabled` 缺省为 `true`。
- enabled plugin 会进入 `prepareGodCodeHost()` 的 runtime config。
- disabled plugin 只在 `plugins list` / `plugins inspect` 中展示，不进入 tool catalog。
- registry `id` 必须和对应 manifest `id` 一致。
- 配置优先级仍是 `GOD_CODE_PLUGIN_DIRS` > `GOD_CODE_PLUGIN_CONFIG_FILE` > `GOD_CODE_PLUGIN_REGISTRY_FILE`。

## CLI

新增：

```bash
god-code plugins list
god-code plugins list --json
god-code plugins inspect <plugin_id>
god-code plugins inspect <plugin_id> --json
```

已有：

```bash
god-code plugins inspect-config --json
```

当使用 registry 文件时，`plugins inspect-config` 会加载 enabled entries 并展示 runtime-backed executable tools。

## 不做

- 不实现 marketplace 下载。
- 不实现 package install / update。
- 不执行 plugin 安装脚本。
- 不自动扫描项目目录或用户目录。
- 不做远程 registry。

## 验收

- Unit 覆盖 registry 文件解析、enabled / disabled 状态、`plugins list` 和 `plugins inspect`。
- Integration 覆盖 registry 配置入口、disabled plugin 不进入 tools、enabled plugin 可执行。
- CLI smoke 覆盖 registry list / inspect / inspect-config。
- `./tools/check.sh` 全量通过。
