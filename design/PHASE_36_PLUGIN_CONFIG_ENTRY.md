# Phase 36: Plugin / Skill Config Entry

Phase36 把 Phase35 的 Plugin / Skill sandbox runtime 接入默认 headless host setup，让显式配置的本地 plugin 能进入 `tools list/inspect`、`run` 和 `rpc-smoke`。

本阶段仍然不自动扫描目录，不下载 marketplace package，不执行安装脚本。Plugin / Skill 必须由宿主配置显式启用；执行仍经过 `HostToolRegistry.executeRequest(...)`、permission、audit 和 cancel。

## 配置入口

环境变量入口：

```text
GOD_CODE_PLUGIN_DIRS='["examples/plugins/executable-plugin"]'
GOD_CODE_PLUGIN_ENABLED_IDS='["executable-plugin"]'
```

配置文件入口：

```text
GOD_CODE_PLUGIN_CONFIG_FILE=examples/config/plugin-runtime.json
```

配置文件格式：

```json
{
  "plugin_dirs": ["../plugins/executable-plugin"],
  "enabled_plugin_ids": ["executable-plugin"]
}
```

规则：

- `GOD_CODE_PLUGIN_DIRS` 非空时优先于 `GOD_CODE_PLUGIN_CONFIG_FILE`。
- env 中的 plugin dir 相对当前 CLI cwd 解析。
- config file 中的相对 plugin dir 相对 config file 所在目录解析。
- `enabled_plugin_ids` 可选；设置后只加载匹配 id 的 plugin / skill。
- diagnostics 只展示 env key，不展示 env value。

## 行为

- `prepareGodCodeHost()` 会读取 plugin 配置。
- 有配置时创建 `PluginSkillRuntime`，加载 manifest，注册 runtime-backed tools。
- `tools list --json` 和 `tools inspect <plugin.tool> --json` 可看到配置的 plugin tools。
- `run --json --raw-events 'tool <tool_name> <json_object>'` 可通过 fake model 验证外部 tool execution。
- `plugins inspect-config --json` 可离线检查配置、加载 manifest，并展示 executable tools。

## 不做

- 不自动扫描项目目录或用户目录。
- 不实现 marketplace / install / update。
- 不执行 plugin 安装脚本。
- 不实现持久 daemon。
- 不实现系统级 sandbox。
- 不改变 JSON-RPC wire contract。
- 不把 plugin runtime 移入 Python Engine。

## 验收

- Unit 覆盖 env / config file plugin 配置加载和 headless tool catalog。
- CLI diagnostics 覆盖 `plugins inspect-config --json`。
- Integration 覆盖配置文件入口、`tools list --json` 和 plugin tool execution。
- CLI smoke 覆盖 executable plugin inspect / tools list / run。
- `./tools/check.sh` 全量通过。

## Phase596 已完成衔接

Phase596保持本阶段plugin config、runtime-backed tools和diagnostic schema不变，并收口`inspectPluginConfig()`与non-registry `listConfiguredPlugins()`的runtime cleanup。Load/list先形成唯一diagnostic，close同步throw/reject通过owned boundary消费；operation primary保持，successful diagnostic叠加cleanup uncertainty时固定投影`plugin runtime cleanup failed`，raw reason不进入human/JSON输出。
