# Phase559：Host tool audit recovery candidate-open failure handle handoff

## 背景

Phase558已经为rotation staging recovery rejection增加typed stage、mutation/rollback state以及candidate/coordination lifecycle evidence，但candidate acquisition仍存在一层隐藏ownership gap。

`openAuditPinnedMutationDirectory(...)`在`fs.open()`成功后还要执行descriptor stat、expected identity和logical path binding。若这些validation失败，helper会在内部尝试`handle.close()`并重新抛出primary error。该close rejection为了保持primary message而被吞掉，外层`openJsonlAuditRotationStagingRecoveryCandidate(...)`既拿不到未返回的handle，也拿不到close failure。

Built runtime故障注入已复现：candidate parent descriptor打开后，stat失败且close同时reject；public error正确输出`candidate_open/not_started`和primary stat message，却错误输出`recoveryHandlesClosed: true`且没有warning。Descriptor是否真正关闭因此被误报为确定事实。

Phase559不改变candidate validation或primary failure contract，而是建立failed-open handle ownership handoff：只要recovery caller显式提供handoff sink，pinned opener在open后validation失败时不再close-and-forget，而把descriptor ownership交回外层，由现有all-settled recovery finalization统一关闭和投影。

## Ownership Contract

Pinned directory opener的descriptor ownership分为三条路径：

1. `fs.open()`尚未成功：helper没有descriptor，不发生handoff。
2. Open成功且全部validation成功：helper返回pinned directory，normal caller取得ownership。
3. Open成功但return前validation失败：
   - 未提供handoff sink的既有caller继续由helper best-effort close，并保留原primary error；
   - recovery candidate提供handoff sink时，helper将handle恰好追加一次，不在内部close；outer candidate finalizer取得唯一cleanup authority。

Handoff只在helper未返回时发生。成功返回的handle和failed-open handle不会同时归入两个owner，也不应被重复close。

## Recovery Flow

`openJsonlAuditRotationStagingRecoveryCandidate(...)`维护module-private failed-open handle collector，并把它传给parent和staging pinned open：

1. parent open validation失败：collector持有parent handle；
2. staging open validation失败：正常返回的parent handle与collector中的staging handle同时进入outer finalization；
3. generation open或后续candidate assertion失败：既有generation/parent/staging handles继续进入同一finalizer；
4. all-settled close outcome覆盖全部已取得或handoff的descriptors；
5. close rejection映射`recoveryHandlesClosed: false`及聚合warning；
6. primary candidate-open message、stage、mutation state与recovery fingerprint保持不变；
7. outer coordination lock仍按Phase557/558独立finalize。

Collector只保存live `FileHandle`到当前stack frame，不进入public error details、CLI report、log、transcript或persistent state。

## Compatibility

- `openAuditPinnedMutationDirectory(...)`仍为module-private helper。
- Handoff参数optional；parent bootstrap、normal generation transaction和rotation staging creation等既有caller不改变ownership语义。
- Public runtime result/error types不新增字段；复用Phase557 `recoveryHandlesClosed`和`recoveryHandleWarning`。
- CLI mapping不新增字段；Phase558 ERROR projection会自动显示修正后的candidate close outcome。
- 不改变action/fingerprint、lock acquisition/held assertion、namespace mutation、rollback、durability或commit边界。
- 不改变JSON-RPC、agent event、provider、tool result、transcript、owner metadata或persistent schema。

## Tests

- Candidate parent open后validation failure把unreturned descriptor handoff给outer finalizer；close成功时输出`recoveryHandlesClosed: true`且无warning。
- 同一路径close rejection输出`candidate_open/not_started`、`recoveryHandlesClosed: false`和close warning，primary validation message保持。
- Candidate staging open后validation failure同时关闭已返回parent与未返回staging descriptors；任一close rejection均可见。
- Candidate final gate、mutation rollback、lock residual与Phase558 typed failure tests保持。
- Clean三类recovery、missing no-op、CLI human/JSON、built integration和CLI smoke保持。

## 边界

- Handoff不代表descriptor已经关闭，只转移cleanup ownership。
- Outer finalizer只进行一次best-effort close；close rejection仍视为lifecycle uncertainty，不无限重试。
- 不把close rejection解释为namespace mutation、rollback failure或coordination lock failure。
- 不在public details中暴露descriptor number、raw handle或raw secondary error object。
- 未采用handoff的helper callers继续保持原primary-error-first行为；其更广泛lifecycle projection不在本阶段扩张。

## 验收标准

- Recovery candidate acquisition不得再丢失open后、return前descriptor ownership。
- `recoveryHandlesClosed: true`必须覆盖所有returned和failed-open handed-off candidate descriptors。
- Nested close failure不能覆盖primary message、stage或mutation state。
- Descriptor handoff与outer finalization均恰好一次，无double-close ownership。
- Phase557/558 result、failure和CLI contracts保持。
- TypeScript build、Python、TypeScript、built integration和CLI smoke全部通过。
- `/tmp`与workspace无probe、staging、smoke或patch残留，无FileHandle GC warning。

## 实现结果

- 已用built Phase558 runtime稳定复现旧缺口：candidate parent descriptor完成open后注入stat failure与close rejection，public error保持`candidate_open/not_started`和primary message，却输出`recoveryHandlesClosed: true`且无warning。Phase559后同一probe输出`recoveryHandlesClosed: false`及handed-off close warning，coordination lock仍clean release。
- `openAuditPinnedMutationDirectory(...)`新增module-private optional `failureHandleHandoff`。Open成功后若descriptor stat、expected identity或logical path binding在return前失败，采用handoff的caller取得该handle ownership；未采用handoff的parent bootstrap、normal generation transaction和rotation staging creation继续由helper best-effort close，既有语义不变。
- `openJsonlAuditRotationStagingRecoveryCandidate(...)`为parent和staging opener提供failed-open handle collector。Candidate catch将collector、generation handle、returned staging handle与returned parent handle按object identity去重，再交给现有all-settled recovery finalizer；每个descriptor只进入一次close attempt。
- Phase558 public types和CLI fields无需新增。Nested close成功继续输出`recoveryHandlesClosed: true`且无warning；close rejection输出false和既有warning，同时保持primary candidate-open message、stage、mutation state、fingerprint与coordination lock evidence。
- 新增3项runtime tests，覆盖failed parent handoff加clean close、failed parent handoff加close rejection，以及returned parent与failed staging handle的联合finalization；新增1项CLI test验证candidate-open ERROR的human/JSON projection。定向回归通过：`audit.test.ts` 187项、`cliAudit.test.ts` 60项，共247项；TypeScript build通过。
- Built CLI smoke新增直接加载built runtime的failed-open handoff probe，验证unreturned candidate parent descriptor只close一次、primary validation message保持、handle warning可见且normal coordination lock无残留。
- 统一验收通过：Python 422项；TypeScript 43个test files、761项；TypeScript build、built CLI integration和CLI smoke全部通过。README、SECURITY、protocol、PROJECT_PLAN、INTERNAL_DESIGN、ARCHITECTURE、EXTENSION_POINTS及Phase543/557/558历史边界已同步；public runtime error/result、JSON-RPC、agent event、provider、tool result、transcript和persistent schema未增加字段。
- `/tmp`无`god-code-audit-*`、`god-code-phase559-*`、`.god-code-audit-rotation-*`或`god-code-smoke.*`残留；workspace无staging directory及`.tmp`、`.bak`、`.orig`或`.rej`文件，验收输出无FileHandle GC warning。

## Phase560 后续加固

Phase560保证本阶段handoff到outer finalizer的handle即使`close()`同步throw，也不会在`Promise.allSettled`接管前中止finalization。同步throw先通过async invocation wrapper转换为rejection，其他returned/handed-off handles仍各获得一次close attempt；Phase559 ownership、deduplication和existing warning fields保持不变。
