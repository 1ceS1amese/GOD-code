# Phase 35: Plugin / Skill Sandbox Runtime

Phase35 让 Plugin / Skill 从 manifest-only 走向可执行 tool handler 的第一版 sandbox runtime。

本阶段不直接把任意 plugin 代码并入 TS Host 进程，也不改变 Python Engine wire contract。Plugin-owned tools 仍然表现为普通 `ToolCatalogEntry`，执行仍必须经过 `HostToolRegistry.executeRequest(...)`、permission、audit 和 cancel 边界。

## 目标

- 允许本地 plugin package 声明一个受控 runtime entry，用来处理该 plugin 的 tool calls。
- runtime 在 TS Host 管理的隔离子进程中执行，不进入 Python Engine。
- plugin tool 输入 / 输出使用稳定 JSON envelope，最后映射为现有 `ToolExecutionResult`。
- diagnostics 可以展示 runtime metadata、可执行 tool 数量和脱敏 env key，不泄露 env value。
- failure path 可返回结构化错误，便于 CLI、integration 和 smoke 验收。

## 推荐 manifest 扩展

保持当前必填字段不变，新增可选 `runtime`：

```json
{
  "id": "demo-plugin",
  "name": "Demo Plugin",
  "version": "0.1.0",
  "runtime": {
    "kind": "node-subprocess",
    "entry": "handler.mjs",
    "timeout_ms": 5000,
    "env_keys": ["DEMO_PLUGIN_TOKEN"]
  },
  "tools": [
    {
      "name": "demo.echo",
      "description": "Echo a value.",
      "input_schema": {
        "type": "object",
        "properties": {
          "value": { "type": "string" }
        },
        "required": ["value"]
      }
    }
  ]
}
```

第一版支持：

- `kind: "node-subprocess"`。
- `entry` 必须是 plugin root 内的相对路径，禁止绝对路径和 `..` 逃逸。
- `timeout_ms` 可选，默认 5000，上限由 TS Host 固定。
- `env_keys` 可选，只从宿主环境转发这些 key，诊断只显示 key。

暂不支持：

- 任意 shell command。
- 持久 daemon / long-running server lifecycle。
- plugin 自定义安装脚本。
- remote marketplace 自动下载。
- 网络、文件系统、Bash 等细粒度权限执行增强。

## Runtime 调用协议

TS Host 每次 tool call 启动一次 plugin subprocess，向 stdin 写入一个 JSON request：

```json
{
  "protocol_version": "god-code-plugin-runtime/1",
  "plugin_id": "demo-plugin",
  "tool_name": "demo.echo",
  "input": { "value": "hello" },
  "cwd": "/workspace"
}
```

plugin runtime 必须在 stdout 输出一个 JSON response：

```json
{
  "ok": true,
  "output": {
    "content": "hello"
  }
}
```

错误响应：

```json
{
  "ok": false,
  "error": {
    "code": "plugin_error",
    "message": "explanation",
    "details": {}
  }
}
```

TS Host 校验 response shape 后再转成 `ToolExecutionResult`。stdout 只允许承载最终 JSON；调试日志写 stderr，stderr 在错误详情中截断并脱敏。

## TS Host 落点

建议新增或扩展：

- `ts-host/src/plugins/manifest.ts`
  - 增加 `PluginRuntimeSpec`。
  - 校验 `runtime.kind`、`entry`、`timeout_ms`、`env_keys`。
  - schema 输出同步包含 runtime 字段。
- `ts-host/src/plugins/sandboxRuntime.ts`
  - 负责解析 entry 安全路径。
  - 使用 `spawn(process.execPath, [entry])`，不走 shell。
  - 传入 allowlisted env。
  - 写 stdin request、读 stdout response、限制 timeout 和 output size。
  - 处理中止信号并清理子进程。
- `ts-host/src/plugins/runtime.ts`
  - manifest 声明 runtime 且 tool 没有内置 handler 时，注册 sandbox handler。
  - 保留现有 manifest-only 行为：无 runtime 的 plugin 不执行自带代码。
- `ts-host/src/cli/plugins.ts`
  - `plugins validate` 展示 runtime metadata。
  - 后续可增加 `plugins inspect-runtime`；Phase35 第一版不强制新增命令。

## 安全边界

第一版 sandbox 是可测试的进程隔离边界，不宣称完整 OS sandbox：

- 不把 plugin code `import` 到 TS Host 进程。
- 不通过 shell 启动。
- 不继承完整环境变量。
- 不允许 entry 路径逃逸 plugin root。
- timeout 后强制 kill 子进程。
- stdout / stderr 有大小限制。
- tool execution 仍走 `HostToolRegistry.executeRequest(...)`，不绕过 audit。

## 验收

- Unit：
  - manifest parser 接受合法 `runtime`，拒绝非法 `kind`、绝对路径、`..`、非字符串 env key。
  - sandbox runtime 可执行 demo handler，并映射成功 / 错误 / invalid JSON / timeout。
  - `PluginSkillRuntime` 能把 runtime-backed tool 注册进 host registry。
- CLI diagnostics：
  - `plugins validate --json` 输出 runtime kind、entry、timeout、env keys。
  - env value 不出现在文本或 JSON 输出。
- Integration：
  - demo executable plugin 通过 `plugins validate --json` 暴露 runtime metadata。
  - schema diagnostics 覆盖 `runtime.kind=node-subprocess`。
- Smoke：
  - demo plugin validate。
  - executable plugin validate。
  - env value 不出现在 diagnostics 输出。
- 全量：
  - `./tools/check.sh` 通过。

## 不做

- 不实现 marketplace / package install。
- 不实现持久 plugin daemon。
- 不实现 WASI、container、seccomp 或系统级 sandbox。
- 不给 plugin 自动开放文件系统、网络或 Bash 权限。
- 不改变 JSON-RPC wire contract。
- 不把 plugin runtime 移入 Python Engine。
