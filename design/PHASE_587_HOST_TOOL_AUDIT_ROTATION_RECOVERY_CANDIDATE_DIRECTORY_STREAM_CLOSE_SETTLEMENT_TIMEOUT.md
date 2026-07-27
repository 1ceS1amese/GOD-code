# Phase587：Host tool audit rotation recovery candidate directory stream close settlement timeout

## 背景

Phase582为rotation recovery candidate的parent、staging与generation `FileHandle` finalizer建立5000ms settlement deadline，并保留candidate-open或mutation primary。Phase585随后覆盖writer-owned rotation staging child-scan `Dir`。但successful recovery candidate打开后，同一staging directory descriptor仍在下列gate中反复执行child scan：

- candidate-open验证`previous_only`或exact empty layout；
- mutation前candidate revalidation；
- archive rename后的committed-generation验证；
- pre-commit failure rollback前后验证；
- committed recovery最终staging removal前验证；
- empty-staging cleanup mutation gate。

这些scan仍落入raw `await stream.close()`。如果native close已经执行、returned Promise永久pending：

- candidate-open无法形成`candidate_open/not_started`失败，也无法启动Phase582 handle finalizer；
- scan read primary可能被late close rejection覆盖；
- archive已经rename后，recovery永久停在commit proof，rollback无法启动；
- generation已经committed后，safe staging cleanup永久pending，成功状态、residual和coordination lock都无法返回；
- same-process audit write tail持续占用，后续writer或recovery无法前进。

Phase587用四条red probe冻结candidate-open timeout、scan primary、pre-commit rollback与post-commit residue行为。所有probe均按resolved staging directory定点选择stream，让stream执行真实native close后返回受控pending Promise；旧实现推进60秒虚拟时间后仍不settle。

## Recovery Stream Contract

Phase587不新增timeout constant或message，复用Phase582：

```text
JSONL_AUDIT_ROTATION_RECOVERY_CLOSE_SETTLEMENT_TIMEOUT_MS = 5000
recovery descriptor close timed out after 5000 ms
```

Successful recovery candidate的parent与staging directory新增module-private recovery marker。Marker只在各自open validation成功后写入；failed-open handles继续交给Phase582 handle finalizer，不通过stream closer收口。

Recovery candidate scan resources遵守：

1. 同一finalization set按object identity去重；
2. unique resources并发、single-attempt调用close；
3. scan read primary优先于secondary close reject或timeout；
4. scan成功但close在5000ms event-loop deadline前未settle时，当前recovery gate失败；
5. timeout不重试、不cancel，也不推断kernel stream、directory descriptor或namespace状态；
6. late resolve/reject由shared owned observer消费，不形成unhandled rejection或重入mutation；
7. stream close failure保持普通operation error，不改写Phase582 `recoveryHandlesClosed`语义；candidate FileHandles仍由既有finalizerexactly-once关闭；
8. inspection与writer staging scan继续分别使用Phase581和Phase585策略，unmarked generic directory保持既有fallback。

## Candidate-open与Primary优先

Candidate-open staging scan close timeout发生在namespace mutation前：

- operation投影为`candidate_open/not_started`；
- `rollbackAttempted`保持false；
- current、rotated与staging layout保持原状；
- candidate handles通过Phase582 finalizer关闭，`recoveryHandlesClosed:true`；
- coordination lock与post-failure observation继续完成。

如果stream read与close同时失败，read primary必须保持为operation message；close timeout或late rejection不得进入public error、warning或post-failure report。

## Mutation与Rollback

Archive已经从staging rename到rotated后，committed-generation proof仍属于pre-commit gate。其stream close timeout必须：

- 阻止`generationCommitted=true`；
- 进入既有rollback路径；
- 将rotated archive rename回staging `previous`；
- 返回`mutation/rolled_back`、`rollbackAttempted:true`、`rollbackCompleted:true`；
- 保持current、rotated missing与`previous_only`初始namespace；
- 不把late stream settlement解释为commit或再次触发rename。

Rollback自己的后续scan也使用同一bounded recovery marker；任一rollback scan无法证明状态时继续遵守既有`rollback/uncertain`语义。

## Post-commit Cleanup

Generation proof完成并设置`generationCommitted=true`后，final staging cleanup scan close timeout不得回滚已提交generation：

- recovery保持`recovered:true`与`mutationPerformed:true`；
- `stagingRemoved:false`；
- exact empty staging directory保留并通过`residualStagingPath`报告；
- warning固定前缀为`recovered staging could not be safely removed:`，后接shared recovery timeout；
- candidate handles与coordination lock继续finalize；
- fresh inspection仍可生成`cleanup_empty_staging` fingerprint供后续显式清理。

## CLI与Compiled Smoke

- CLI apply覆盖post-commit cleanup stream timeout，输出WARN而非ERROR；human与JSON都保留performed action、committed mutation、empty residual、handle和coordination lock finalization字段。
- Compiled smoke从`dist/`执行真实recovery，在final cleanup gate注入pending close，验证current/rotated commit、empty staging residue、fixed warning、late rejection消费与无unhandled rejection。
- Runtime保留candidate-open、read primary和rollback三条更细粒度状态断言。

## 接口与安全边界

- 不新增public recovery option、CLI flag、command、exit code、field或environment variable。
- 不修改JSON-RPC、Engine event、provider/tool result、transcript、audit envelope、lock owner metadata、rotation staging layout或persistent schema。
- Timeout message不包含path、fd、raw stream、entry name、generation content、fingerprint、owner token或late reason。
- Marker与closer保持module-private；source与dist public declarations不变化。
- Recovery timeout不证明kernel close、rename、rollback、rmdir或descriptor finalization状态；所有namespace结论继续来自既有runtime checks。

## 验收标准

- 任一successful recovery candidate child-scan close Promise永久pending时，当前gate在5000ms event-loop deadline后settle。
- Scan read primary优先，scan成功时fixed recovery timeout可见。
- Candidate-open timeout保持`not_started`；post-archive timeout完成rollback；post-commit timeout保持commit并报告empty staging residual。
- Candidate FileHandle finalizer仍保留Phase582 close outcome和warning语义。
- Inspection、writer、lock acquisition、lock lifecycle与maintenance close policy不回归。
- Public TypeScript、CLI、protocol、environment和persistent interfaces保持。
- Python、TypeScript、build、built integration与CLI smoke全部通过。
- Workspace与`/tmp`无probe、smoke、integration、audit lock、staging或patch残留，无相关test、engine或CLI进程和FileHandle/Dir GC warning。

## Red Baseline

- Runtime新增四条probe后，`test/audit.test.ts`共301项；仅Phase587四项失败，其余297项在定向执行中跳过。
- 四项失败均为`settledWithinBound:false`，证明旧raw `await stream.close()`在真实native close完成后仍无限等待returned Promise。
- Candidate-open、read-primary、archive-restore rollback与committed cleanup四个probe均命中exact resolved staging directory，未误选inspection或lock directory stream。

## 实现结果

- `JsonlAuditPinnedMutationDirectory`新增module-private recovery marker；recovery parent与staging directory仅在各自pinned open validation成功后获得marker，failed-open handles仍交给Phase582 handoff/finalizer。Writer与inspection marker/policy保持独立。
- Rotation staging scanner新增recovery branch，并通过identity-deduplicated concurrent recovery resource closer与primary-preserving closer复用Phase582 5000ms wrapper。Read primary优先；无primary时fixed recovery timeout可见；late resolve/reject由shared observer消费。
- Runtime四条probe全部转绿：candidate-open timeout保持`not_started`且handles/coordination lock完成；read primary覆盖secondary timeout；archive restore后的commit-proof timeout完成rollback并恢复`previous_only`；post-commit cleanup timeout保持current/rotated commit和exact empty staging residual。`test/audit.test.ts`共301项通过。
- CLI新增一项post-commit cleanup stream timeout测试，human/JSON保持WARN、performed action、committed mutation、`staging_removed:false`、exact residual、fixed recovery warning、handles closed与coordination lock released，且不泄漏late reason。`test/cliAudit.test.ts`共116项通过。
- Compiled smoke从`dist/`执行真实CLI recovery，按resolved staging path选中第二个committed empty scan，验证5000ms deadline、current/archive commit、empty staging residue、clean lock release与late rejection consumption；完整CLI smoke通过。
- 全量`tools/check.sh`通过：Python 422项；TypeScript 43个test files、931项；TypeScript build、built integration与完整CLI smoke全部成功。
- 全量期间发现既有CLI terminal directory generation drift测试依赖自然ctime变化，在并发suite中偶发未漂移；测试注入现对post-mutation bigint status确定增加1ns，仅稳定既有generation-drift证据，不修改runtime实现或public contract。单项、完整CLI文件与全量suite均通过。
- 静态接口校验通过：source/dist各只有一个recovery timeout constant、一个recovery resource closer、一个primary-preserving closer和一个recovery wrapper；successful candidate open点明确标记parent/staging，marked scanner不再进入raw close。Marker/helpers均未export，public recovery options、CLI/protocol/environment、rotation layout和persistent schema未变化。
- 主README、项目计划、内部设计、架构、扩展点、安全与protocol文档已同步到Phase587，并在Phase582/585文档记录candidate handle与writer staging operation-family衔接。
- 残留审计完成：23个本轮测试遗留lock/quarantine fixture的owner PID 691734、691891、706506、708552、712109、712487与713737均已退出，随后清理exact test prefix。最终`/tmp`无Phase587、audit、CLI、smoke、integration、lock或staging残留；workspace无`.tmp`、`.bak`、`.orig`或`.rej`，也无check、Vitest、pytest、engine或CLI进程。

## Phase588 后续衔接

Phase587完成后重新审计audit source中的剩余direct close，确认当前public call graph均已由maintenance、inspection、acquisition、lifecycle、writer或recovery ownership覆盖，剩余raw分支只是unowned internal fallback。下一处可由public lifecycle真实触发的永久pending缺口转向MCP runtime shutdown；Phase588因此为connected client/transport close增加独立bounded concurrent lifecycle，不改变Phase587 audit timeout family或跨层schema。
