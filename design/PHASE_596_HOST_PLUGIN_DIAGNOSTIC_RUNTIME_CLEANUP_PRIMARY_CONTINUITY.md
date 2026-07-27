# Phase596：Host plugin diagnostic runtime cleanup primary continuity

## 背景

Phase595完成prepared-host production调用方后，短生命周期资源审计发现plugin diagnostics仍有两条相同cleanup模式：

```text
try:
  runtime.load()
  push success or operation error
finally:
  await runtime.close().catch(() => undefined)
```

受影响函数：

- `inspectPluginConfig()`的`plugin_runtime` check；
- non-registry `listConfiguredPlugins()`的`plugin_list` check。

该写法只消费Promise rejection。若`runtime.close()`同步throw，`.catch(...)`尚未取得Promise，异常会直接逃逸并覆盖已经形成的load/list primary。若operation成功而close rejection被吞掉，report仍为ok，cleanup uncertainty完全不可见。

`PluginSkillRuntime.close()`当前实现为同步状态重置包装在async function中，但public method仍是可替换、可扩展的`Promise<void>`边界。Diagnostic caller不能把某个具体实现“目前不会失败”当成priority contract。

## 范围

本阶段只修改两条local plugin runtime diagnostic lifecycle：

1. Plugin load/list operation先形成唯一局部diagnostic；
2. Runtime close通过owned Promise boundary single-attempt执行；
3. Operation error跨close同步throw/rejection保持；
4. Successful operation叠加cleanup failure时使用固定、非敏感error projection；
5. 每个函数最终只提交一个runtime/list diagnostic。

本阶段不修改local registry list/inspect路径、manifest validation、plugin install/uninstall/enable/disable/tags、sandbox execution、PluginSkillRuntime内部状态模型、prepared host、MCP diagnostics或public report schema。

## Diagnostic ownership

`inspectPluginConfig()`：

```text
plugin_config check保持既有提交
runtimeDiagnostic = plugin_runtime load/list outcome
cleanup = owned runtime.close settlement

if runtimeDiagnostic is error:
  keep original message/details
else if cleanup failed:
  plugin_runtime:error "plugin runtime cleanup failed"

push runtimeDiagnostic once
```

`listConfiguredPlugins()`在non-registry runtime分支使用相同规则，check name保持`plugin_list`，cleanup failure message同样固定为`plugin runtime cleanup failed`。

约束：

- Config load failure或no-plugin fast path不创建runtime，也不执行close；
- Local registry-backed list/inspect不创建`PluginSkillRuntime`，保持原路径；
- Runtime ownership建立后，无论load/list成功或失败都close一次；
- Close同步throw与Promise rejection都由owned wrapper消费；
- Operation error保持原message/details，不拼接cleanup reason；
- Successful operation叠加cleanup failure时只使用固定message；
- Raw cleanup reason、stack、cause、manifest、runtime object、entrypoint、path、command、token、transport或process handle不得进入human/JSON report。

## Report与CLI行为

- Existing `plugin_config` check及其details保持；
- Existing `plugin_runtime`和`plugin_list` check names/status/message/details shape保持；
- Cleanup failure通过existing check的`status/message`表达，不新增`plugin_cleanup` check或JSON key；
- `report.ok`继续由existing error status推导；
- Human/JSON renderer、command routing和exit behavior保持；
- Registry-backed plugin list/inspect结果完全不受影响。

## Tests

- `inspectPluginConfig()` operation成功叠加close rejection时，`plugin_runtime`唯一fixed error且raw reason不泄漏；
- `inspectPluginConfig()` load primary叠加同步close throw时，返回原primary report而不是reject；
- `listConfiguredPlugins()` operation成功叠加同步close throw时，`plugin_list`唯一fixed error；
- Normal close继续保留既有plugin/runtime counts与details；
- Existing manifest、config file、registry、install/uninstall/enable/disable/tags和executable plugin tests全部回归；
- Compiled smoke从`dist/cli/plugins.js`和built `PluginSkillRuntime`验证fixed projection、primary continuity、sync throw isolation、single close与no raw reason。

## 接口与安全边界

- `inspectPluginConfig()`、`listConfiguredPlugins()`、`inspectConfiguredPlugin()`及render函数签名保持；
- `PluginDiagnosticCheck`、`PluginDiagnosticReport`和registry result types保持；
- Outcome、finalizer、owned invocation wrapper与fixed string均module-private；
- 不新增environment variable、CLI flag、command、exit code、check name、JSON key、warning或protocol field；
- 不修改JSON-RPC、Engine event、provider、tool result、transcript、audit、plugin manifest、MCP或persistent schema。

## 验收标准

- Plugin operation primary跨runtime close throw/reject保持；
- Successful plugin diagnostics的cleanup uncertainty通过fixed existing-check error可见；
- Raw cleanup reason不进入human/JSON输出；
- Runtime ownership建立后close single-attempt；
- Normal plugin counts/details和registry fast path保持；
- Public TS、CLI、environment、protocol与persistent interfaces保持；
- Python、TypeScript、build、built integration和CLI smoke全部通过；
- Workspace与`/tmp`无plugin diagnostic runtime、sandbox、host、engine、smoke、integration、audit或MCP残留。

## Red Baseline

- `test/pluginDiagnosticsLifecycle.test.ts`新增4项runtime lifecycle probe，旧实现3失败/1通过。
- Normal inspect config与runtime close保持既有`plugin_runtime:ok`。
- Successful inspect叠加close rejection仍返回ok，证明cleanup uncertainty被静默吞掉。
- Load primary或successful list叠加同步close throw时整个diagnostic Promise以cleanup secondary拒绝，证明`.close().catch(...)`不能捕获调用阶段同步throw并会覆盖operation/report。

## 实现结果

- `inspectPluginConfig()`与non-registry `listConfiguredPlugins()`现在各自在局部形成唯一runtime/list diagnostic，runtime close settlement完成后只push一次。
- 新增module-private `finalizePluginDiagnosticRuntime()`与owned invocation wrapper，捕获`PluginSkillRuntime.close()`同步throw和Promise rejection。Operation error message/details保持；候选ok叠加cleanup failure时固定投影`plugin runtime cleanup failed`且移除success details。
- Config/no-plugin/registry fast path不创建额外runtime；`inspectConfiguredPlugin()`、manifest validation、registry mutation与sandbox execution路径未改变。
- 新增4项plugin diagnostic lifecycle测试，覆盖normal runtime diagnostic、close rejection downgrade、load primary跨sync close throw，以及list fixed cleanup error；plugin/MCP/platform/host/tools相关定向回归共69项通过，TypeScript build通过。
- CLI smoke新增`built plugin diagnostic runtime cleanup primary continuity`，从`dist/cli/plugins.js`配合built `PluginSkillRuntime`验证inspect/list fixed projection、load primary、sync throw isolation、single close与raw secondary不泄漏；完整CLI smoke通过。
- 首次全量门禁中Phase596新增测试全部通过，但既有audit `terminal directory generation drift` probe在并行负载下未观察到注入后的directory `ctime`变化，导致1项失败。定向复现表明production断言正常；test fixture现在仅在generation尚不可见时等待并执行临时create/unlink pulse，明确证明generation已变化后再继续。Production audit代码和security contract未修改，audit 301项随后通过。
- 2026-07-26第二次统一`tools/check.sh`验收通过：Python 422项、TypeScript 51个文件/971项、TypeScript build、built integration与完整CLI smoke全部成功。Source/dist均包含两处shared plugin finalizer调用与fixed cleanup marker，公开plugin diagnostic types/functions保持。
- 两轮全量验收共留下13个audit test lock/quarantine fixture；owner PID `1168718`、`1169960`、`1175556`、`1175956`与`1177209`均已退出，随后删除exact `/tmp/god-code-audit-0-*`路径。最终`/tmp`无GOD-code残留，workspace无`.tmp`、`.bak`、`.orig`或`.rej`，也无plugin diagnostic runtime、sandbox、host、engine、integration、Vitest、pytest或MCP遗留进程。

## Phase597 已完成衔接

Phase597已收口同一静态审计发现的MCP diagnostic runtime cleanup路径，并分别确定context、connection multi-check与generic operation owner。Existing error保持，successful/warn结果叠加cleanup failure时替换existing owner check，不新增`mcp_cleanup` schema。Phase596 plugin finalizer与public接口保持。
