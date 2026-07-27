# Phase594：Host doctor tool catalog cleanup primary continuity

## 背景

Phase589已让`prepareGodCodeHost()`在setup失败时回滚已创建runtime，并让成功返回的`PreparedGodCodeHost.close()`具备memoized、all-settled、best-effort生命周期。Phase593随后闭合doctor的Python Engine与provider-health cleanup priority，但`checkHostTools()`仍在host close前直接提交成功check：

```text
prepare host
  -> push tool_catalog ok
  -> close host
  -> close throw/reject
  -> outer catch再push tool_catalog error
```

因此，prepared-host close异常会让同一次doctor运行包含两个同名`tool_catalog` diagnostic，并把raw cleanup reason公开为第二条error。若读取tool catalog本身失败，现有嵌套`finally`还会让close failure覆盖真正的operation primary。

Phase594把`checkHostTools()`改为operation-owned single diagnostic加prepared-host finalization，再按primary-aware规则只提交一次结果。

## 范围

本阶段只修改doctor对prepared host的调用边界：

1. `prepareGodCodeHost()`与tool count读取形成一个局部operation diagnostic；
2. 已取得host ownership时，无论operation成功或失败都single-attempt调用`host.close()`；
3. operation diagnostic与host cleanup outcome汇合后只向`checks`提交一次；
4. successful operation叠加cleanup failure时使用固定、非敏感error projection；
5. operation failure叠加cleanup failure时保持operation primary。

本阶段不修改Phase589 runtime内部close策略、MCP/plugin配置、tool catalog内容、audit skip逻辑、doctor执行顺序、doctor command/options/schema或其他engine finalizer。

## Diagnostic ownership

`checkHostTools()`按以下顺序执行：

```text
host = await prepareGodCodeHost()
candidate = tool_catalog ok: "<count> tool(s)"
  or
candidate = tool_catalog error: operation reason

if host ownership transferred:
  finalize host.close through owned Promise boundary

if candidate is ok and close failed:
  candidate = tool_catalog error:
    "tool catalog loaded but host cleanup failed"

push candidate exactly once
```

约束：

- `prepareGodCodeHost()`失败时没有caller-owned host，Phase589 rollback继续由setup函数负责；
- host已经返回后，即使tool catalog读取同步throw，doctor仍必须尝试close；
- `host.close()`同步throw和Promise rejection都由owned wrapper消费；
- operation error的原对象message保持，不被cleanup reason替换、拼接或包裹；
- successful tool count在正常cleanup时保持既有`<count> tool(s)`文本；
- successful operation叠加cleanup failure时固定投影为`tool catalog loaded but host cleanup failed`；
- raw cleanup reason、stack、cause、runtime、path、command、token或transport信息不得进入human/JSON report。

## Lifecycle与并发边界

- Doctor每次`checkHostTools()`只拥有一个prepared host generation；
- Caller只调用一次`host.close()`，Phase589继续负责concurrent/post-settlement memoization和runtime exactly-once；
- 本阶段不新增host-level timeout，也不绕过Phase588/589既有settlement contract；
- Doctor等待close settlement后再提交最终diagnostic，避免返回后发生late check mutation；
- `checks`数组只在最终结果确定后写入一次。

## Tests

- Tool count成功叠加host close rejection时，只产生一个fixed `tool_catalog:error`，raw cleanup reason不泄漏；
- Tool count成功叠加host close同步throw时，同样只产生fixed error；
- Tool catalog读取primary叠加host close rejection时，保留operation primary，close仍调用一次；
- 正常close继续返回唯一`tool_catalog:ok`与既有tool count；
- Existing doctor engine/provider/audit skip/human/JSON tests全部回归；
- Compiled smoke从`dist/cli/doctor.js`注入prepared-host success、operation primary和cleanup failure，验证single diagnostic、fixed projection、primary continuity与no raw reason。

## 接口与安全边界

- `runGodCodeDoctor()`、`renderDoctorReport()`、`renderDoctorReportJson()`、`DoctorCheck`、`DoctorReport`和`RunDoctorOptions`签名保持；
- `PreparedGodCodeHost`、`PrepareGodCodeHostOptions`和`prepareGodCodeHost()`接口保持；
- Fixed cleanup string、host finalizer和outcome类型均module-private；
- 不新增environment variable、CLI flag、command、exit code、check name、status、JSON key、warning或protocol field；
- 不修改JSON-RPC、Engine event、provider、tool result、transcript、audit、plugin、MCP或persistent schema。

## 验收标准

- 每次执行最多一个`tool_catalog` check；
- Operation error primary跨host cleanup failure保持；
- Successful operation的cleanup uncertainty通过fixed error可见；
- 已取得host时close调用一次，sync throw/reject均不逃逸；
- Raw cleanup reason不进入doctor human/JSON输出；
- 正常tool count、audit skip和doctor check顺序保持；
- Public TS、CLI、environment、protocol与persistent interfaces保持；
- Python、TypeScript、build、built integration和CLI smoke全部通过；
- Workspace与`/tmp`无doctor、host runtime、engine、smoke、integration、audit、plugin或MCP残留。

## Red Baseline

- `test/doctorHostLifecycle.test.ts`新增4项prepared-host probe，旧实现3失败/1通过。
- Successful close基线保持既有单条tool count。
- Close rejection和同步throw都会先保留一条`tool_catalog:ok`，再追加包含raw secondary的同名error，证明共享checks在finalization前被提前写入。
- Tool catalog getter primary叠加close rejection时只剩cleanup secondary，证明嵌套`finally`会覆盖operation primary。

## 实现结果

- `checkHostTools()`现在先保存caller-owned host和唯一局部diagnostic。Host setup或tool count读取失败形成operation error；已取得host时仍进入cleanup，最终只push一次。
- 新增module-private `finalizeDoctorHost()`，通过existing owned invocation wrapper捕获`host.close()`同步throw与Promise rejection。Operation error保持；候选ok叠加cleanup failure时固定投影`tool catalog loaded but host cleanup failed`，raw reason不进入report。
- `DoctorEngineFinalizationOutcome`泛化为module-private `DoctorFinalizationOutcome`，供engine和host finalizer共享；public doctor与prepared-host types/functions/options未改变。
- 新增4项doctor prepared-host lifecycle测试，覆盖normal count、close reject、sync close throw和tool-catalog primary continuity；doctor/engine/provider/host setup相关定向回归共78项通过，TypeScript build通过。
- CLI smoke新增`built doctor tool catalog cleanup primary continuity`。Smoke从`dist/cli/doctor.js`重写module-local host setup dependency到临时fixture，验证构建产物的single diagnostic、fixed cleanup projection、operation primary、sync throw isolation、close single invocation与raw secondary不泄漏；完整CLI smoke通过。
- Compiled smoke首次执行发现临时fixture只重写`../` import而遗漏built doctor的`./audit.js`与`./provider.js`，因此fixture module无法加载；重写规则扩展到全部`./`/`../`静态import后通过。该失败发生在smoke隔离装载层，production source/dist行为未改变。
- 2026-07-26统一`tools/check.sh`验收通过：Python 422项、TypeScript 49个文件/963项、TypeScript build、built integration与完整CLI smoke全部成功。Source/dist均包含唯一`finalizeDoctorHost()`与fixed cleanup marker，公开doctor函数、types/options及prepared-host接口保持。
- 全量验收留下6个audit test lock/quarantine fixture；owner PID `1072706`与`1073967`均已退出，随后删除exact `/tmp/god-code-audit-0-*`路径。最终`/tmp`无GOD-code残留，workspace无`.tmp`、`.bak`、`.orig`或`.rej`，也无doctor、host runtime、engine、integration、Vitest、pytest、plugin或MCP遗留进程。

## Phase595 已完成衔接

Phase595已审计并闭合CLI剩余short-lived prepared-host调用方`listHostTools()`。`tools list/inspect`现在保持catalog read primary，并在successful read叠加close failure时使用fixed sanitized error；doctor三条资源型check和Phase594 public schema均未改变。
