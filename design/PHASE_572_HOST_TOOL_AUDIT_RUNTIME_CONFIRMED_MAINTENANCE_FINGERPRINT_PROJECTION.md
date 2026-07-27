# Phase572：Host tool audit runtime-confirmed maintenance fingerprint projection

## 背景

Phase571已经把owner confirmation绑定到fresh candidate generation，empty quarantine/disposal fingerprint也早已绑定absolute path和full directory generation。Runtime mutation入口会重新pin candidate、重算fingerprint并在namespace mutation前拒绝replacement，因此destructive transaction本身能够fail closed。

CLI report仍存在一条独立的evidence-ordering窗口。六条lock maintenance命令在只读preflight中比较expected fingerprint后，会立即写入：

- `owner_fingerprint_matches: true`及owner fingerprint；或
- `quarantine_fingerprint_matches: true` / `disposal_fingerprint_matches: true`及empty directory fingerprint。

随后才调用runtime mutation。若candidate在preflight返回后、runtime fresh selection前被replacement，runtime会正确拒绝，但outer `catch`复用已写入的details，最终ERROR仍宣称fingerprint matched并投影旧fingerprint。该report把“较早inspection曾匹配”误表示为“本次runtime confirmation已匹配”。Mutation未被绕过，但operator-facing evidence与authoritative transaction outcome冲突。

Built Phase571 baseline probes已经确认：

- active cleanup在confirmed command第六次logical lock-path `lstat`前替换candidate，runtime返回`Audit file lock owner fingerprint does not match.`，original/replacement均保持，但report仍包含`owner_fingerprint_matches: true`和旧fingerprint；
- empty quarantine cleanup先测得stable preflight对selected path执行9次`lstat`，在下一次runtime path read前替换candidate，runtime返回empty fingerprint mismatch，目录均保持，但report仍包含`quarantine_fingerprint_matches: true`和旧fingerprint；
- code audit确认owner-only quarantine/disposal、pre-commit recovery和empty disposal使用相同“publish true -> call runtime -> catch reused details”顺序。

## Authority Contract

CLI preflight只决定是否可以进入runtime调用，不产生可公开的positive mutation confirmation。Positive match evidence必须来自runtime return object：

1. Dry-run继续发布当前stable inspection fingerprint和`confirmation_required: true`。
2. Confirmed command若preflight expected value与current inspection不同，继续返回`*_fingerprint_matches: false`，并且不回显current correct fingerprint。
3. Preflight match只保存在local control flow中；调用runtime前不得写入public `*_fingerprint_matches: true`或confirmation fingerprint字段。
4. Runtime返回`existed: true`且携带与expected完全相同的fingerprint时，CLI才发布positive match和该runtime-returned fingerprint。
5. Runtime返回`existed: false`时，candidate在authoritative selection前已消失；CLI保持既有idempotent warning，但省略match和fingerprint，不把preflight snapshot冒充runtime confirmation。
6. Runtime抛错时，CLI保留primary error及既有preflight scalar evidence，但省略positive match和fingerprint。Plain runtime errors无法可靠区分fingerprint mismatch、later drift或filesystem failure，因此不得猜测`false`或保留`true`。
7. Runtime已返回existing candidate但operation产生post-commit residual，或recovery返回verified candidate加`residual_lock_path`时，runtime-returned fingerprint仍可支持`true`；mutation/result状态继续由`removed`、`recovered`和residual字段表达。

该收紧只改变optional field出现时机，不改变fingerprint算法、preflight eligibility、runtime transaction或error status。

## Covered Commands

Owner-bearing commands：

- `audit cleanup-lock`
- `audit cleanup-lock-quarantine <id>`
- `audit recover-lock-quarantine <id>`
- `audit cleanup-lock-disposal <qid> <did>`

Empty-directory commands：

- `audit cleanup-empty-lock-quarantine <id>`
- `audit cleanup-empty-lock-disposal <qid> <did>`

Rotation staging recovery不在本阶段范围。其confirmed path不先发布CLI preflight match，而是直接使用lock-held runtime result/typed failure构造`action_matches`与`recovery_fingerprint_matches`。

## Implementation

每条covered command应执行相同顺序：

```text
stable inspection
  -> local expected comparison
  -> mismatch: publish false and return
  -> match: call runtime without publishing positive evidence
  -> runtime missing: return idempotent warning without match/fingerprint
  -> runtime existing result: validate returned fingerprint == expected
  -> publish true + runtime fingerprint
  -> project mutation/residual outcome
```

新增module-private helper验证runtime existing result必须携带exact expected fingerprint。Missing或不一致表示Host invariant violation，转为普通ERROR且仍不发布positive evidence。Helper不读取owner token或raw metadata。

`details`中的fingerprint必须从runtime result赋值，而不是复用preflight local value。Catch path因为positive fields尚未写入，自然保持省略，无需基于error message做字符串分类。

## Tests

- 六条CLI confirmed command分别在preflight完成后、runtime first candidate read前替换candidate；runtime必须拒绝，report为ERROR，positive match/fingerprint字段省略，original/replacement保持，且无runtime `mkdir`/`rename`/`unlink`/`rmdir`。
- Active与至少一条empty command验证candidate在同一窗口直接消失时返回existing idempotent warning，但不发布positive match/fingerprint。
- Preflight wrong fingerprint继续显式返回`false`且不回显current correct value。
- 六条stable confirmed mutation继续发布`true`和runtime-returned fingerprint。
- Recovery的successful、post-commit residual及verified rollback-residual result保持原`removed`/`recovered`/residual semantics。
- Built smoke覆盖owner和empty六条replacement窗口，并确认human/JSON不泄漏token、replacement fingerprint或raw identity。
- Built integration继续验证stable two-step CLI flow，不依赖preflight-only positive evidence。

## 接口边界

- 不增加或删除CLI human/JSON字段；只收紧optional positive字段的出现条件。
- 不改变`--yes --expect-owner`、`--expect-quarantine`或`--expect-disposal`语法与32-hex格式。
- 不改变runtime exported function signatures；existing result types已经携带owner/quarantine/disposal fingerprint。
- 不增加JSON-RPC、agent event、provider、tool result、transcript或persistent schema字段。
- 不改变commit point、rollback、residual、source-absence、bounded scan或descriptor-relative mutation contracts。

## 验收标准

- Runtime rejection绝不能与`*_fingerprint_matches: true`同时出现。
- Runtime rejection或pre-runtime disappearance不得投影preflight fingerprint为confirmed evidence。
- Positive match必须可追溯到同一次runtime existing result携带的exact expected fingerprint。
- Preflight mismatch的explicit false及non-disclosure contract保持。
- Stable owner/empty cleanup与recovery、post-commit residual和idempotent missing语义保持。
- Python、TypeScript、typecheck/build、built integration与CLI smoke全部通过。
- Workspace及`/tmp`无probe、lock、smoke或patch残留，无相关测试/engine进程和FileHandle GC warning。

## 实现结果

- Built Phase571 baseline probe复现active与empty quarantine的evidence-ordering缺口，并通过code audit确认owner quarantine/disposal、recovery与empty disposal具有相同“preflight先发布positive fields、runtime后拒绝”的顺序；mutation本身保持fail closed。
- `ts-host/src/cli/audit.ts`新增module-private `requireAuditRuntimeConfirmedFingerprint(...)`。六条covered command只在preflight mismatch时发布`false`，runtime existing result通过exact expected invariant后才发布`true`和runtime-returned fingerprint；runtime throw与`existed: false`均保持positive fields absent。
- `cliAudit.test.ts`新增六条replacement-window回归和两条pre-runtime disappearance回归。每条replacement case动态测量stable preflight path-read数量，在runtime first candidate read前替换目录，验证ERROR、positive evidence省略、零`mkdir`/`rename`/`unlink`/`rmdir`、original/replacement保持及human/JSON non-disclosure；active与empty quarantine missing case验证幂等WARN同样不投影旧fingerprint。
- Built CLI smoke新增六类runtime replacement probe，直接加载编译产物并覆盖active、owner/empty quarantine、owner/empty disposal与recovery；每类都验证runtime mismatch、positive fields absent、mutation计数为0、candidate generations保持，且human/JSON不包含token、old/replacement fingerprint或raw identity字段。
- Stable success、wrong-preflight explicit false、recovery rollback/residual与post-commit residual既有测试全部保持通过。统一`tools/check.sh`验收为Python 422项、TypeScript 43个test files/824项、TypeScript build、built integration和CLI smoke全部通过；`cliAudit.test.ts`最终为88项。
- 静态source/built artifact审计确认六个positive assignments均位于runtime call和`existed` gate之后，helper未export，runtime signatures、CLI字段集合、JSON-RPC、agent event、provider、tool result、transcript与persistent schema均未改变。新增race tests已登记OS-temp candidate/moved paths进入teardown；workspace与`/tmp`无Phase572、smoke、integration、`.tmp`、`.bak`、`.orig`或`.rej`残留，无相关test/engine/CLI进程。

## Phase573 后续加固

Phase573继续使用本阶段runtime existing result作为authoritative report source，并补齐active与owner-only quarantine的selected-path terminal absence。Positive fingerprint时序不变；existing branch现在同时将原active/quarantine `*_exists`设置为false，private wrapper residual只通过独立residual path表达。Phase572解决“是否由本次runtime确认”，Phase573进一步保证同一runtime result中的removed/existence状态不矛盾。

## Phase575 后续加固

Phase575扩展本阶段的runtime evidence ordering：`existed:false`不仅撤销positive fingerprint，也撤销已失效的selected preflight structure/owner snapshot；disposal source与recovery active-lock cross-path evidence因missing fast path未观察而一并省略。Selected absence与no-mutation outcome仍由runtime result明确投影，Phase572 mismatch、replacement与existing positive confirmation rules保持。

## Phase576 后续加固

Phase576保证本阶段runtime-confirmed positive fingerprint不会被其后的descriptor close failure擦除。Candidate-existing result先固定fingerprint和operation outcome，finalizer再附加cleanup/recovery closure evidence；secondary failure使CLI返回WARN但仍保留positive match与exact runtime fingerprint。Runtime missing仍不发布fingerprint或closure fields，preflight mismatch与replacement rejection规则保持。

## Phase577 后续加固

Phase577使runtime rejection中的candidate fingerprint mismatch也保持authoritative primary message，不再被close failure替换。Typed ERROR可投影closure outcome，但仍不发布positive match/current fingerprint；existing positive confirmation、preflight mismatch、replacement与missing ordering保持。
