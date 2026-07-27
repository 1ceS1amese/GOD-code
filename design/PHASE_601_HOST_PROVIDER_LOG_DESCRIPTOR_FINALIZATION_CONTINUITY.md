# Phase601：Host provider log descriptor finalization continuity

## 背景

Phase600关闭transcript watcher callback lifecycle后，final lifecycle audit只剩local provider daemon/model operation的同步日志descriptor边界未闭合：

1. `startLocalProviderDaemon()`在`finally`直接调用`fs.closeSync(logFd)`，close failure会覆盖spawn、PID marker write或existing error report，也会把successful start变成raw rejected Error；
2. model pull/remove/prune的同步spawn catch先调用`closeSync`再形成error report，cleanup failure会覆盖原start primary；
3. 三个model process waiter在`error`/`close` event callback内先`closeSync`再`resolve`，close同步throw会逃逸callback，使operation Promise永久pending，并可能产生uncaught exception；
4. Successful daemon/model operation遇到descriptor cleanup uncertainty时没有existing diagnostic内的固定、脱敏投影。

这些路径由`god-code provider local-daemon start`和`provider local-models pull/remove/prune`实际调用。Descriptor只承载child stdout/stderr日志，但parent-side finalization仍必须single-attempt、primary-aware且不能泄漏raw filesystem reason。

## 范围

本阶段只修改：

- local daemon start日志descriptor finalization；
- local model pull/remove/prune spawn failure finalization；
- 三个model process waiter的terminal event callback settlement；
- successful operation cleanup uncertainty到existing provider check的固定投影。

本阶段不修改daemon stop/status、models list HTTP、command/args/env validation、PID marker schema、timeout/kill policy、log内容、CLI command/flag、renderer、Python Engine、JSON-RPC、provider request、MCP、plugin、tool result、audit、transcript或persistent schema。

## Descriptor ownership contract

固定cleanup error：

```text
local provider log cleanup failed
```

规则：

1. `openSync()`成功后descriptor由当前daemon/model operation持有；
2. Daemon spawn/marker operation和model spawn/process operation先形成唯一primary outcome，再attempt descriptor close；
3. 每个descriptor最多close一次；close同步throw由module-private wrapper消费；
4. Operation抛出的原对象保持，不由cleanup reason替换、拼接或包装；
5. Existing error report保持原status、message、details和object，不由cleanup secondary降级为另一错误；
6. Successful report叠加cleanup failure时复用existing first provider check：`report.ok=false`、check `status="error"`、message为固定字符串，existing details保持；
7. Committed daemon start、model pull/remove/prune不因parent descriptor cleanup uncertainty回滚PID marker或模型侧效果；
8. Raw close reason、stack、cause、fd number、native handle、log payload、command、args、environment、PID marker内容或child object不得进入report、CLI或日志。

## Callback settlement contract

- Model waiter的first `error`/`close` event通过existing settled guard取得terminal authority；
- Timer清理、operation report construction、descriptor finalization和outer resolve位于同一owned finish path；
- Descriptor close throw不能阻断`resolve(...)`；
- Later duplicate `error`/`close` event不得重复close或改写first operation outcome；
- Existing timeout、SIGTERM/SIGKILL、exit code、signal和duration evidence保持。

## Tests

- Successful daemon start叠加close throw时返回fixed existing diagnostic，marker/start evidence保持且raw reason不泄漏；
- Daemon marker write primary叠加close throw时原rejection object保持；
- Pull/remove/prune successful close event叠加close throw时Promise及时resolve为fixed diagnostic，各descriptor close一次；
- Pull/remove/prune non-zero exit primary叠加close throw时原exit report保持；
- Model synchronous spawn primary叠加close throw时仍返回原sanitized start error report；
- Existing normal daemon/model contract tests保持；
- Compiled smoke从`dist/cli/provider.js`验证daemon primary/fixed projection与三类model callback settlement/no-leak。

## 接口与安全边界

- `LocalProviderDaemonOptions`、model operation options、`ProviderDiagnosticReport`、render functions和public operation signatures保持；
- Fixed string、report projection和descriptor finalizer均module-private；
- 不新增environment variable、CLI flag、command、exit code、JSON key、check name、details key、event、warning或protocol field；
- 不修改PID marker、log file、provider request、JSON-RPC、Engine event、tool result、audit、transcript、plugin manifest或persistent schema。

## 验收标准

- Daemon/model operation primary跨`closeSync` failure保持；
- Successful operation cleanup uncertainty固定、脱敏且通过existing check可见；
- Model event callback close throw不能逃逸或让outer Promise pending；
- Same descriptor close single-attempt，duplicate child event不重复finalize；
- Normal start/exit/timeout、marker、log和render behavior保持；
- Public TS、CLI、environment、protocol与persistent interfaces保持；
- Python、TypeScript、build、built integration和CLI smoke全部通过；
- Workspace与`/tmp`无provider child、daemon、model、engine、MCP、plugin、host、smoke、integration、Vitest、pytest或audit残留。

## Red Baseline

- `test/providerLogDescriptorLifecycle.test.ts`新增9项daemon/model descriptor lifecycle probe，旧实现9/9失败，并由三个success与三个non-zero model callback各产生1个Vitest捕获的uncaught close exception，共6个uncaught。
- Successful daemon start被raw close Error改写为rejection；marker write primary被cleanup secondary覆盖。
- Pull/remove/prune的success与non-zero exit callback均在`closeSync`处逃逸，outer operation Promise在2秒settlement probe内保持pending。
- Synchronous model spawn error report同样被catch-path close failure覆盖为raw rejection。

## 实现结果

- Daemon start现在先形成spawn/PID marker operation report；operation throw路径best-effort close并重抛原对象，report路径再通过shared finalizer结算descriptor。
- Pull/remove/prune的同步spawn catch先形成existing error report，再attempt close；cleanup secondary不再替换sanitized start primary。
- 三个model waiter的terminal callback在settled guard后清除timers、构造operation report，并通过shared finalizer消费close failure后始终resolve。Later `error`/`close` event不重复close。
- Shared report projection在cleanup成功或operation report already error时返回原report；successful report叠加cleanup failure时只把first existing check固定降级为`local provider log cleanup failed`，保留details且不泄漏raw reason。
- 新增9项lifecycle测试，旧实现9/9失败且有6个uncaught，实现后9/9通过且无uncaught；provider contract与lifecycle定向回归共60项通过，TypeScript build通过。
- CLI smoke新增`built provider log descriptor finalization continuity`，从`dist/cli/provider.js`验证daemon successful fixed projection、marker primary object continuity，以及pull/remove/prune callback fixed settlement与single-attempt/no-leak；完整CLI smoke通过。
- 2026-07-27统一`tools/check.sh`验收通过：Python 422项；TypeScript 56个test files、1005项；TypeScript build、built integration和完整CLI smoke全部通过。
- Source与built artifact均只在module-private descriptor wrapper内保留`closeSync`，daemon/model operation全部调用shared report join；public provider exports、report/check/details keys和environment保持。
- 全量门禁留下6个audit fixture目录；对应owner PID `53374`和`54303`均已退出。完成owner核验后使用depth-first delete清理，最终provider child、workspace相关临时文件、`/tmp/god-code-*`与Vitest、pytest、integration、smoke进程均无残留。

## 最终收口衔接（已完成）

[Release-level final static audit](FINAL_RELEASE_AUDIT_AFTER_PHASE_601.md)已复查全部active Host callback/finalizer、source/dist一致性、public接口、跨层schema、full gate和残留，未发现新的runtime-reproducible缺口。当前Phase1-Phase601 agent设计与lifecycle-hardening计划可正式关闭。
