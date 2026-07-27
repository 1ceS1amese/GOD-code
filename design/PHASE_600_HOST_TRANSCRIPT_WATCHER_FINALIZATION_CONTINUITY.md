# Phase600：Host transcript watcher finalization continuity

## 背景

Phase599 final lifecycle audit确认`watchTranscriptSessions()`仍有两个callback-owned lifecycle缺口：

1. Timeout/max-event `closeAndResolve()`按顺序直接调用全部`FSWatcher.close()`；任一同步throw会从timer/interval callback逃逸，阻断后续watcher close、pending event settlement和outer Promise resolve；
2. `createTranscriptScopeWatcher()`使用裸`eventPromise.finally(...)`删除pending Set；unexpected event rejection会创建无人观察的rejected derivative Promise。

该路径由`god-code sessions watch`和index watch-refresh diagnostics实际调用。Watchers使用`persistent: false`，但close failure仍表示native watch ownership不确定，不能让CLI永久pending或泄漏raw filesystem reason。

## 范围

本阶段只修改transcript watch callback lifecycle：

- active/archive watcher ownership记录；
- timeout/max-event close fan-out；
- cleanup failure到existing root diagnostic的固定投影；
- pending event Set observer。

本阶段不修改root discovery、watch event classifier、path formatting、archive layout、search index refresh、CLI routing、JSON field names、Python Engine、JSON-RPC、provider、MCP、plugin、tool result、audit或persistent transcript schema。

## Watcher ownership contract

固定cleanup error：

```text
transcript watcher cleanup failed
```

每个successful `fs.watch()` result与创建它的`TranscriptWatchRootResult`共同进入local ownership record。Finalization规则：

1. `closeAndResolve()`通过existing finished guard single-attempt执行；
2. Timer与interval先清除，再同步attempt全部watcher close；
3. 每个close经过owned wrapper，首个throw不能阻断后续watcher；
4. Close failure若owner root仍为`ok: true`，把该existing root降级为`ok: false`并写固定error；
5. Owner root已有active/archive setup或validation error时保持原primary，不拼接或替换；
6. 同一root多个watcher failure只产生一个existing error字段，不新增cleanup array、scope error或top-level field；
7. Watcher close完成attempt后snapshot pending events并`Promise.allSettled`，最终仍执行event bound和resolve；
8. Raw close reason、stack、cause、watcher object、directory descriptor、path细节或native handle不得进入report、CLI或日志。

`watchedScopes`继续表示watcher曾成功创建，不伪造其close结果；`timedOut`、eventCount、events和discovery evidence保持operation outcome。

## Pending event observer

- Event Promise加入Set后使用双分支`then`删除；
- Fulfillment与rejection都删除original Promise；
- Rejection立即获得owned observer，不创建rejected derivative；
- Event failure不新增public warning/schema，outer finalization仍通过`allSettled`等待当时pending的event work；
- Existing expected stat races继续由event builder内部归一化。

## Tests

- Active watcher close throw叠加archive watcher normal close时，全部close一次、watch Promise及时resolve、owner root固定降级且raw reason不泄漏；
- Archive setup primary叠加active watcher close throw时，保持setup error并及时resolve；
- Unexpected event Promise rejection被owned observer消费，不产生Vitest unhandled derivative；
- Normal timeout、event limit、active/archive event normalization和discovery metadata保持；
- Compiled smoke从`dist/transcripts/history.js`配合built watcher seam验证all-watcher close、fixed root projection和no raw reason。

## 接口与安全边界

- `watchTranscriptSessions(...)`、`TranscriptWatchResult`、root/event/discovery types和render functions保持；
- Watcher ownership record、fixed string和owned observer均module-private；
- 不新增environment variable、CLI flag、command、exit code、JSON key、event kind、warning或protocol field；
- 不修改JSON-RPC、Engine event、provider、MCP、plugin、tool result、audit、manifest或persistent transcript schema。

## 验收标准

- Watcher close sync throw不能逃逸callback、阻断其他close或让outer Promise pending；
- Existing root setup primary保持，cleanup-only uncertainty固定可见；
- Pending event rejection无unhandled derivative；
- Normal watch result、event ordering/bounds、timedOut和discovery保持；
- Public TS、CLI、environment、protocol与persistent interfaces保持；
- Python、TypeScript、build、built integration和CLI smoke全部通过；
- Workspace与`/tmp`无watcher、transcript、engine、MCP、plugin、host、smoke、integration、Vitest、pytest或audit残留。

## Red Baseline

- `test/transcriptWatcherLifecycle.test.ts`新增3项watcher lifecycle probe，旧实现3/3失败。
- Active watcher close同步throw会从terminal callback逃逸，使archive watcher未close且outer watch Promise永久pending；Vitest同时捕获uncaught close exception。
- Archive setup primary叠加active close throw时，原setup diagnostic无法完成返回。
- Unexpected event Promise rejection经裸`finally`产生无人观察的rejected derivative。

## 实现结果

- `watchTranscriptSessions()`现在以`FSWatcher`和owner `TranscriptWatchRootResult`组成module-private ownership record；active/archive watcher均在成功创建后登记。
- Terminal finalizer先清除timer/interval，再逐一通过同步owned wrapper attempt全部watcher close。Cleanup-only failure把对应existing successful root降级为固定`transcript watcher cleanup failed`；existing setup/validation primary保持。
- Watcher fan-out完成后继续snapshot并`Promise.allSettled` pending events，event bound与outer resolve不再被同步close throw阻断。
- Pending event Set删除改为双分支`then` observer，fulfillment/rejection均删除original Promise且不创建unhandled derivative。
- 新增3项lifecycle测试，旧实现3/3失败，实现后3/3通过且无unhandled；transcript history、CLI diagnostics和lifecycle相关定向回归共67项通过，TypeScript build通过。
- CLI smoke新增`built transcript watcher finalization continuity`，从`dist/transcripts/history.js`配合real `FSWatcher` prototype seam验证all-watcher close、fixed root projection、setup primary continuity与raw reason不泄漏；完整CLI smoke通过。
- 2026-07-27统一`tools/check.sh`验收通过：Python 422项；TypeScript 55个test files、996项；TypeScript build、built integration和完整CLI smoke全部通过。
- Source与built artifact均包含owner-root watcher record、fixed cleanup marker、all-watcher close wrapper和pending event双分支observer；旧pending裸`finally`与unisolated watcher close路径已移除，public watch exports和result fields保持。
- 全量门禁留下6个audit fixture目录；对应owner PID `3310`和`4583`均已退出。完成owner核验后使用depth-first delete清理，最终workspace相关临时文件、`/tmp/god-code-*`与Vitest、pytest、integration、smoke进程均无残留。

## Phase601 后续衔接（已完成）

Phase601已闭合final audit确认的local provider daemon/model operation log descriptor finalization。Start/report primary跨`fs.closeSync()` failure保持；successful operation的descriptor cleanup uncertainty通过existing provider diagnostic固定投影，event-callback close throw不再让model operation Promise永久pending。Public provider report、CLI JSON和environment保持。
