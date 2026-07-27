# Phase595：Host CLI tools catalog cleanup primary continuity

## 背景

Phase594闭合doctor `tool_catalog` diagnostic与prepared-host close之间的ownership，但同一资源在`cli/tools.ts`仍使用直接`try/finally`：

```text
host = await prepareGodCodeHost()
try:
  return host.toolCatalog
finally:
  await host.close()
```

该路径存在两类continuity缺口：

- tool catalog读取成功后，close同步throw或reject会直接以raw cleanup reason拒绝`tools list`/`tools inspect`；
- tool catalog getter本身throw时，`finally`中的close failure会覆盖真正的operation primary。

Phase589保证production prepared-host close当前best-effort resolve，但`PreparedGodCodeHost`公开契约仍是`Promise<void>`，caller必须在自己的operation boundary上正确处理同步throw/reject，不能依赖某个实现永远成功。Phase595把CLI tools查询改为operation outcome加owned close settlement。

## 范围

本阶段只修改`listHostTools()`的short-lived prepared-host lifecycle：

1. `host.toolCatalog`读取形成局部operation outcome；
2. 已返回的prepared host始终single-attempt close；
3. operation primary跨close secondary保持；
4. successful catalog叠加close failure时抛出固定、非敏感cleanup error；
5. `getHostTool()`继续复用`listHostTools()`，无需第二套cleanup。

本阶段不修改tool catalog内容、render函数、`tools list/inspect`参数和输出schema、Phase589 runtime close实现、doctor、headless run、RPC smoke或REPL lifecycle。

## Operation与cleanup规则

`listHostTools()`执行顺序：

```text
host = await prepareGodCodeHost()
operation = read host.toolCatalog
cleanup = owned host.close settlement

if operation failed:
  throw original operation reason
else if cleanup failed:
  throw Error("tool catalog loaded but host cleanup failed")
else:
  return original toolCatalog array
```

约束：

- `prepareGodCodeHost()` setup失败仍由Phase589负责rollback并原样抛出setup primary；
- Tool catalog读取结果保持原数组identity，不clone、不排序、不重新验证schema；
- Host ownership一旦转移，无论catalog读取成功或失败都调用close一次；
- Close同步throw和Promise rejection都进入owned Promise boundary；
- Operation reason以原对象重新throw，不拼接、不包裹、不替换；
- Successful operation叠加cleanup failure时只暴露固定`tool catalog loaded but host cleanup failed`；
- Raw cleanup reason、stack、cause、runtime、MCP/plugin配置、path、command、token、transport或process handle不得进入CLI stdout/stderr或JSON。

## CLI行为

- 正常`tools list`和`tools list --json`输出保持；
- 正常`tools inspect <name>`和JSON输出保持；
- Tool不存在仍由existing command层抛出`Tool not found: <name>`；
- Cleanup uncertainty发生在render前，因此command不输出部分tool list；
- Cleanup failure沿existing CLI error boundary返回exit code 1，不新增专用exit code或JSON error envelope；
- Usage error解析与exit code 2保持。

## Tests

- Catalog读取成功且close成功时返回原数组并close一次；
- Catalog读取成功叠加close rejection时只抛fixed cleanup error，raw reason不泄漏；
- Catalog读取成功叠加close同步throw时同样抛fixed error；
- Catalog getter primary叠加close rejection时保留原primary对象，close仍调用一次；
- Existing built-in、MCP、plugin与single-tool inspection tests全部回归；
- Compiled smoke从`dist/cli/tools.js`注入prepared-host lifecycle，验证fixed projection、primary continuity、sync throw isolation、array identity与single close。

## 接口与安全边界

- `listHostTools()`、`getHostTool()`及四个render函数签名保持；
- `PreparedGodCodeHost`、`PrepareGodCodeHostOptions`和`prepareGodCodeHost()`接口保持；
- Outcome、finalizer、owned invocation wrapper与fixed string均module-private；
- 不新增environment variable、CLI flag、command、exit code、JSON key、warning或protocol field；
- 不修改JSON-RPC、Engine event、provider、tool result、transcript、audit、plugin、MCP或persistent schema。

## 验收标准

- Operation primary跨host close throw/reject保持；
- Successful catalog的cleanup uncertainty通过fixed error可见；
- Raw cleanup reason不进入CLI输出；
- Host ownership转移后close single-attempt；
- 正常tool array identity、list/inspect输出与not-found行为保持；
- Public TS、CLI、environment、protocol与persistent interfaces保持；
- Python、TypeScript、build、built integration和CLI smoke全部通过；
- Workspace与`/tmp`无tools lifecycle、host runtime、engine、smoke、integration、audit、plugin或MCP残留。

## Red Baseline

- `test/toolsLifecycle.test.ts`新增4项prepared-host probe，旧实现3失败/1通过。
- Normal catalog读取与close成功保持原数组identity并只close一次。
- Close rejection和同步throw都直接把raw cleanup reason作为`listHostTools()` rejection，证明successful operation缺少固定安全投影。
- Catalog getter primary叠加close rejection时最终reason变成cleanup secondary，证明direct `finally`覆盖operation primary。

## 实现结果

- `listHostTools()`现在把catalog读取保存为module-private discriminated operation outcome，随后独立观察prepared-host close。Operation failure原对象重新throw；operation success叠加cleanup failure时只抛固定`tool catalog loaded but host cleanup failed`。
- 新增module-private `finalizeHostToolCatalog()`与owned invocation wrapper，捕获`host.close()`同步throw和Promise rejection。Host ownership转移后close single-attempt，原tool catalog array identity保持。
- `getHostTool()`继续只复用`listHostTools()`，render、not-found command逻辑与public function signatures未改变。
- 新增4项CLI tools lifecycle测试，覆盖stable identity、close reject、sync close throw与catalog primary continuity；tools/doctor/MCP/plugin/host setup相关定向回归共71项通过，TypeScript build通过。
- CLI smoke新增`built CLI tools catalog cleanup primary continuity`，从`dist/cli/tools.js`重写module-local host setup dependency到临时fixture，验证构建产物的array identity、single close、fixed cleanup projection、sync throw isolation、operation primary与raw secondary不泄漏；完整CLI smoke通过。
- 2026-07-26统一`tools/check.sh`验收通过：Python 422项、TypeScript 50个文件/967项、TypeScript build、built integration与完整CLI smoke全部成功。Source/dist均包含唯一host-tool finalizer与fixed cleanup marker，六个public tools函数及prepared-host接口保持。
- 全量验收留下6个audit test lock/quarantine fixture；owner PID `1120526`与`1121770`均已退出，随后删除exact `/tmp/god-code-audit-0-*`路径。最终`/tmp`无GOD-code残留，workspace无`.tmp`、`.bak`、`.orig`或`.rej`，也无tools lifecycle、host runtime、engine、integration、Vitest、pytest、plugin或MCP遗留进程。

## Phase596 已完成衔接

Phase596已转向非prepared-host短生命周期资源，并闭合plugin config/list diagnostics的runtime cleanup priority。Prepared-host production调用方仍由Phase590、591、594和595完整覆盖；Phase595 public tools contract未改变。
