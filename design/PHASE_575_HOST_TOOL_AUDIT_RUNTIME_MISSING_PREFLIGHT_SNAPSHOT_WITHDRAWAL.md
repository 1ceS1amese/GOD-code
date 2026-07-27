# Phase575：Host tool audit runtime-missing preflight snapshot withdrawal

## 背景

Phase572把maintenance positive fingerprint evidence移动到authoritative runtime existing result，Phase573与Phase574继续修正terminal existence及residual uncertainty。继续审计六条owner/empty cleanup或recovery的`runtime existed:false`分支时，发现CLI虽然把selected path existence更新为false，却继续保留整组preflight inspection snapshot：

- active cleanup保留lock entry type、bounded scan、owner metadata及state/error fields；
- owner/empty quarantine cleanup保留quarantine entry type、layout、owner或empty inspection fields；
- owner/empty disposal cleanup除selected disposal snapshot外，还保留source quarantine existence/layout evidence；
- pre-commit quarantine recovery除selected quarantine snapshot外，还保留active coordination lock existence、acquirability、scan及owner evidence。

Runtime missing result只证明authoritative candidate selection时selected target不存在，并证明本次operation没有执行mutation。各runtime helper在candidate read返回`undefined`后立即返回，不会重新观察preflight结构或cross-path namespace。因此这些旧fields不再有runtime因果支持。

Phase575 red probe在recovery CLI的preflight之后、runtime candidate first read之前执行两步race：把selected quarantine rename到detached path，并由另一个writer成功创建active coordination lock。Runtime正确返回`existed:false`、`recovered:false`，logical quarantine missing且active lock实际present；旧report却同时输出：

- `quarantine_exists: false`与陈旧`quarantine_entry_type: directory`、layout/owner metadata；
- 陈旧`coordination_lock_exists: false`和`coordination_lock_acquirable: true`，与current filesystem相反。

该问题不影响mutation safety，但会把read-only preflight snapshot伪装成runtime-missing branch的terminal evidence。

## Evidence Contract

1. Runtime `existed:false`只授权selected target absence与no-mutation outcome。
2. Selected absolute path、ID、config、`dry_run`、confirmation/liveness flags以及`removed:false`或`recovered:false`可继续保留。
3. Selected `*_exists`必须明确为false，因为runtime candidate selection已观察missing。
4. Selected entry type、layout、bounded scan、owner location/status/PID/time、state-changed及inspection-error fields必须撤销；它们只属于已失效preflight snapshot。
5. Disposal runtime missing在selected candidate read后立即返回，未重新观察source quarantine；因此保留derived source path，但撤销source existence/type/layout/state/error fields。
6. Recovery runtime missing在selected candidate read后立即返回，未创建或重新观察coordination lock；因此保留derived lock path，但撤销lock existence/type/acquirability/scan/owner/state/error fields。
7. Recovery message中的“no coordination lock was created”只描述本operation，没有资格断言current lock absence。
8. Runtime existing success、post-commit residual、verified rollback-residual、preflight refusal、runtime rejection及dry-run branches保持。
9. Omission通过既有optional fields表达，不增加snapshot provenance或terminal observation字段。

## Covered Commands

- `audit cleanup-lock`
- `audit cleanup-lock-quarantine <quarantine-id>`
- `audit cleanup-empty-lock-quarantine <quarantine-id>`
- `audit cleanup-lock-disposal <quarantine-id> <disposal-id>`
- `audit cleanup-empty-lock-disposal <quarantine-id> <disposal-id>`
- `audit recover-lock-quarantine <quarantine-id>`

Rotation staging recovery直接从runtime result构造report，不先复制同类candidate inspection snapshot，因此不在本阶段范围。

## Implementation

在CLI module增加三个module-private withdrawal helpers：

- active/coordination lock inspection snapshot withdrawal；
- quarantine selected snapshot withdrawal；
- disposal selected与source quarantine snapshot withdrawal。

六个`!result.existed`分支在设置selected `*_exists: false`之前调用对应helper。Recovery同时调用quarantine与coordination lock helper；owner/empty disposal同时调用disposal selected与source helper。

Helpers只把optional evidence fields设置为`undefined`，不删除path、ID、config或operation outcome，也不调用filesystem。Human renderer已跳过undefined，JSON serialization同样省略这些keys。

## Tests

- 收紧现有active cleanup runtime-missing test：selected existence false，所有entry/scan/owner snapshot fields在human/JSON中省略。
- 收紧现有empty quarantine runtime-missing test：selected existence false，entry type/layout/state/error省略。
- 新增owner-only quarantine runtime-missing test，验证owner fields与fingerprint evidence均省略。
- 新增owner-only disposal runtime-missing test；race同时重新建立source quarantine，验证selected structural与source state fields均省略。
- 新增empty disposal runtime-missing test；同样验证source reappearance不能被旧`source_quarantine_exists:false`遮蔽。
- 新增recovery runtime-missing test；race同时创建active lock，验证selected structural与全部coordination lock state fields省略，actual lock保持且token不泄漏。
- Built smoke至少覆盖active、disposal cross-path与recovery cross-path三类compiled-product projection。
- Stable success/residual、replacement rejection、dry-run和verified rollback tests保持。

## 接口边界

- 不增加、删除或重命名CLI字段；只在runtime-missing branch省略既有optional evidence。
- 不修改runtime exported signatures、result types或candidate selection顺序。
- 不增加post-hoc `lstat`，避免把无reservation race snapshot包装成terminal truth。
- 不改变fingerprint、commit point、rollback、descriptor-bound mutation或unknown-entry preservation。
- 不改变JSON-RPC、agent event、provider、tool result、transcript或persistent schema。

## 验收标准

- 六条runtime missing report只保留runtime支持的selected absence与no-mutation outcome。
- 不得输出已消失selected target的preflight type/layout/owner/scan evidence。
- Disposal source与recovery active lock的current state未知时必须省略，不得保留preflight false。
- Human/JSON projection一致且不泄漏owner token或confirmation fingerprint。
- Runtime existing success、residual、rollback、rejection、dry-run与initial missing semantics保持。
- Python、TypeScript、build、built integration与CLI smoke全部通过。
- Workspace及`/tmp`无probe、smoke、integration或patch残留，无相关test/engine/CLI进程和FileHandle GC warning。

## 实现结果

- Phase575 red probe在recovery preflight完成后、runtime candidate first read前rename selected quarantine并由concurrent writer创建active lock。Runtime返回`existed:false`、actual quarantine missing且lock present；旧CLI仍输出`quarantine_entry_type: directory`和相反的`coordination_lock_exists:false`，分别以Vitest failure确认selected与cross-path stale evidence。
- `ts-host/src/cli/audit.ts`新增三个module-private withdrawal helper，分别删除coordination lock、quarantine及disposal/source的optional snapshot properties。六个runtime missing branches先调用对应helper，再设置selected `*_exists:false`；recovery组合quarantine与lock helper，owner/empty disposal共享disposal/source helper。
- 现有active与empty quarantine missing tests收紧全部structural evidence omission；新增owner quarantine、owner disposal/source reappearance、empty disposal/source reappearance和recovery/concurrent-lock四项race tests。Human与JSON均验证stale keys absent、selected absence/no-mutation保留、actual filesystem race state保持、confirmation fingerprint及old/concurrent owner token不泄漏；CLI audit最终为98项。
- Built CLI smoke新增active selected disappearance、owner disposal disappearance加source reappearance、recovery disappearance加concurrent active lock三类compiled-product probe。每类动态测量stable preflight path-read count，在runtime first candidate read注入race，并验证source/dist report properties、rendered keys、filesystem state和non-disclosure；完整smoke输出`CLI smoke ok`。
- 统一`tools/check.sh`验收通过：Python 422项；TypeScript 43个test files、834项；TypeScript build、built integration和CLI smoke全部通过。README、PROJECT_PLAN、INTERNAL_DESIGN、ARCHITECTURE、EXTENSION_POINTS、SECURITY、protocol及Phase530/532/533/535/536/539/572/573历史边界已同步Phase575。
- Source/built artifact静态审计确认六个`existed:false` branches均先执行withdrawal，三个helper未export且compiled implementation一致；runtime result types、candidate selection、CLI字段集合、JSON-RPC、agent event、provider、tool result、transcript及persistent schema未改变。
- `run-cli-smoke.sh`语法与current-phase文档范围复核通过；workspace及`/tmp`无Phase575 probe、smoke、integration、`.tmp`、`.bak`、`.orig`或`.rej`残留，无相关test/engine/CLI进程，验收输出无FileHandle GC warning。

## Phase576 后续边界修正

Phase576只为candidate-existing resolved result增加cleanup/recovery descriptor finalization evidence；本阶段runtime missing fast path仍在任何maintenance handles存在前返回，因此不投影`*_handles_closed`或warning。CLI先按Phase575撤销preflight snapshot，再报告selected absence/no-mutation；secondary finalization contract不会重新引入旧structure、source quarantine或coordination lock evidence。

## Phase577 后续边界修正

Phase577只在candidate reader已经取得operation-owned handle后的typed rejection投影closure fields。Runtime candidate missing仍在handoff前返回并执行Phase575 snapshot withdrawal，不新增handles boolean或warning；preflight refusal同样保持省略。Rejected operation lifecycle evidence不会恢复旧selected/source/lock snapshot。
