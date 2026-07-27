# Phase571：Host tool audit candidate-bound owner confirmation fingerprint

## 背景

Phase530/532/533/535把active cleanup、quarantine cleanup/recovery和disposal cleanup统一到32字符owner fingerprint确认，但当前fingerprint只计算：

```text
SHA-256("god-code-audit-lock-owner\0" || owner_token)[0:32]
```

该值能够确认owner token，却不绑定operator在dry-run中实际观察到的candidate directory、selected owner file generation、layout或command domain。Same-user process若在dry-run与`--yes`之间移走原candidate，并在同一路径创建一份复制相同owner JSON的replacement，replacement会得到相同fingerprint。Mutation入口随后把replacement当作新的current candidate pin住并安全地删除或恢复它；transaction内部的copied-owner replacement保护无法判断operator确认的是此前另一个object。

Built Phase570 baseline probes已分别确认旧fingerprint会：

- 删除active lock path上的copied-owner replacement，同时原lock directory被移到另一位置并保持；
- 删除owner-only quarantine replacement，同时原quarantine保持；
- 删除owner-only disposal replacement，同时原disposal保持；
- 恢复pre-commit quarantine replacement，同时原quarantine保持。

四条路径都满足transaction自身的fresh path/descriptor/content检查，因此问题不在mutation pinning，而在confirmation material没有绑定dry-run candidate generation。这也违反Phase530已记录的“dry-run与`--yes`之间directory replacement必须拒绝旧fingerprint”合同。

## Confirmation Contract

Owner confirmation fingerprint继续保持32个lowercase hexadecimal字符和既有CLI字段/flag，但authority material必须绑定：

1. fingerprint version/domain；
2. command candidate kind：active、quarantine或disposal；
3. absolute candidate path；
4. quarantine/disposal layout与selected owner location；
5. 所有参与candidate authority的directory role、absolute path、device、inode、ctimeNs与birthtimeNs；
6. selected owner absolute path、device、inode、ctimeNs、birthtimeNs、mtimeNs与size；
7. canonical owner version、token、PID、acquired time；
8. owner-only disposal的derived source quarantine path与confirmed-missing marker。

建议canonical material：

```text
SHA-256(
  "god-code-audit-lock-owner-candidate-v2\0"
  || domain-tagged candidate/layout/path fields
  || ordered directory generation fields
  || selected owner generation fields
  || canonical metadata fields
  || optional source-absence binding
)[0:32]
```

每个字段使用role tag与NUL separator更新hash，不使用依赖property order的JSON序列化。BigInt按base-10 canonical string编码，path先`path.resolve(...)`。

Fingerprint仍不是authentication secret、process liveness proof或filesystem reservation。它只把operator confirmation绑定到一次可证明的candidate generation；真实mutation继续执行fresh pinned revalidation。

## Inspection Authority

Token-only helper不能再作为cleanup authority来源。Stable owner-bearing inspections新增Host-local `ownerFingerprint`：

- active：root lock directory + terminal owner；
- quarantine `owner_only`：root + root owner；
- quarantine `lock_with_owner`：root + nested `lock` + nested owner；
- quarantine `lock_and_owner`：root + nested `lock` + root owner；
- disposal `owner_only`：source-missing binding + disposal root + root owner。

Fingerprint只在Phase570 terminal owner snapshot、branch-specific directory/source gates和layout authority全部成功后生成。State changed、inspection error、invalid/missing owner、truncated scan、unknown/empty layout均不生成owner fingerprint。

`JsonlAuditLockInspection`、`JsonlAuditLockQuarantineEntryInspection`和`JsonlAuditLockDisposalEntryInspection`增加Host-local optional `ownerFingerprint`。CLI human/JSON继续投影既有`coordination_lock_owner_fingerprint`或`owner_fingerprint`，不新增字段。

## Mutation Revalidation

每个owner-bearing mutation入口必须从fresh pinned candidate重新计算同一domain fingerprint，并在首个namespace mutation前比较expected value：

- `cleanupJsonlAuditFileLock(...)`：active domain；
- `cleanupJsonlAuditLockQuarantine(...)`：quarantine `owner_only` domain；
- `recoverJsonlAuditLockQuarantine(...)`：quarantine pre-commit layout domain；
- `cleanupJsonlAuditLockDisposal(...)`：disposal `owner_only` + source-missing domain。

Mismatch必须在创建private wrapper、reservation、rename、unlink或rmdir之前拒绝。旧token-only fingerprint、其他path/domain/layout fingerprint及copied-owner replacement fingerprint全部不匹配。

Candidate pinning之后发生的replacement继续由现有directory/owner descriptor、entry-set、source-absence、rollback和detachment proofs处理；Phase571不修改commit point或residual semantics。

## CLI Contract

CLI不再根据`ownerToken`自行计算confirmation，而只使用shared inspector发布的`ownerFingerprint`。Dry-run、direct/list projection和`--yes` preflight因此共享同一candidate-bound material。

保持：

- `--yes --expect-owner <fingerprint>`语法；
- 32 lowercase hex格式；
- `owner_fingerprint_matches`语义；
- token、inode、timestamps、raw metadata不进入human/JSON output；
- wrong fingerprint不回显current correct value的既有拒绝规则。

由于fingerprint含candidate generation，同一owner token在active、quarantine、recovery和disposal中会得到不同值；同一路径被replacement后也会得到不同值。这是预期的confirmation收紧，不是fingerprint instability。

## Tests

- Runtime：四类owner-bearing mutation使用旧dry-run fingerprint面对copied-owner replacement，必须在mutation前拒绝并保留replacement与移走的original。
- CLI：四类命令先dry-run取得fingerprint，再替换candidate并使用旧fingerprint执行`--yes`，必须返回ERROR、`owner_fingerprint_matches: false`且无mutation。
- Stable active/quarantine/recovery/disposal dry-run -> confirmed mutation继续成功。
- 相同owner token在不同domain/path/layout上的fingerprint必须不同，格式仍为32 lowercase hex。
- List/direct projection对同一stable candidate必须输出相同fingerprint。
- State drift与Phase565-570 authority withdrawal继续省略fingerprint。
- Built smoke验证四类replacement拒绝发生在rename/unlink/rmdir之前，且不输出token或raw identity。

## 边界

- Fingerprint依赖filesystem generation metadata；能够复制owner内容并恢复全部directory/owner identity metadata的privileged ABA不在保证范围。
- 返回后candidate仍可变化；mutation入口重新计算fingerprint并继续执行fresh descriptor-bound assertions。
- 不增加JSON-RPC、agent event、provider、tool result、transcript或persistent schema字段。
- Host-local inspection interface新增optional fingerprint，但CLI字段集合、flag与长度保持。

## 验收标准

- Token-only或其他candidate fingerprint不能授权任何owner-bearing cleanup/recovery。
- Dry-run后copied-owner directory/file replacement必须被旧fingerprint拒绝。
- Fingerprint必须绑定domain、absolute path、layout/location、directory generations、owner generation与canonical metadata。
- Stable direct/list/dry-run/mutation使用相同candidate-bound fingerprint。
- Mutation transaction、commit、rollback、residual和bounded scan contracts保持。
- TypeScript build、Python、TypeScript、built integration与CLI smoke全部通过。
- Workspace及`/tmp`无probe、lock、smoke或patch残留，无FileHandle GC warning。

## 实现结果

- Built Phase570 baseline probes复现四条旧authority路径：active、owner-only quarantine、owner-only disposal和pre-commit quarantine在dry-run后被同路径copied-owner candidate替换时，token-only fingerprint仍会删除或恢复replacement；original candidate保持。Probe artifacts已按精确路径清理。
- `jsonlAuditSink.ts`新增module-private candidate fingerprint input/domain/directory类型及tagged field/identity hash helpers。旧exported token-only helper退出authoritative surface；stable active/quarantine/disposal inspector从terminal owner snapshot发布Host-local optional `ownerFingerprint`，authority withdrawal统一清除该值。
- Active、owner-only quarantine、pre-commit recovery和owner-only disposal mutation reader均从fresh pinned candidate重算相同domain material，并在private wrapper/reservation及任何rename/unlink/rmdir之前比较expected fingerprint。Existing descriptor-bound entry-set、source-absence、commit、rollback、contraction和residual流程未改变。
- CLI cleanup/recovery、direct/list projection全部改为使用shared inspector fingerprint，不再从`ownerToken`计算。恢复后的active lock要求重新inspection取得active-domain fingerprint；CLI flags、32-hex格式、human/JSON字段集合及wrong-fingerprint non-disclosure保持。
- 新增5项runtime tests，覆盖四类stale fingerprint copied-candidate拒绝和相同owner metadata跨active/quarantine/recovery/disposal domain/path/layout的fingerprint区分及direct/list一致性；新增4项CLI tests，验证ERROR、`owner_fingerprint_matches: false`、无`mkdir`/`rename`/`unlink`/`rmdir`且original/replacement保持。定向回归为`audit.test.ts` 222项、`cliAudit.test.ts` 80项，共302项。
- Built CLI smoke新增四类candidate-bound confirmation probe：四个stable dry-run fingerprint均为不同的32 lowercase hex；replacement生成后值全部改变；旧fingerprint确认均在namespace mutation前拒绝，mutation调用计数为0，original与replacement目录保持，token、replacement fingerprint及raw identity字段不进入mismatch report。
- Built integration不再复制token-only算法，而从各命令的direct/dry-run output取得confirmation；同一owner metadata在quarantine、disposal、active和recovery中必须得到不同fingerprint，recovery完成后再取得新的active fingerprint执行cleanup。
- 统一`tools/check.sh`验收通过：Python 422项；TypeScript 43个test files、816项；TypeScript no-emit typecheck/build、built CLI integration和CLI smoke全部通过。README、SECURITY、protocol、PROJECT_PLAN、INTERNAL_DESIGN、ARCHITECTURE、EXTENSION_POINTS及Phase530-535/537-538/565-570历史边界已同步。
- 最终静态与接口审计确认source/built artifact只保留private candidate-input helper调用，CLI无owner hash实现，JSON-RPC、agent event、provider、tool result、transcript与persistent schema未增加字段，`jsonlAuditSink.ts`无direct `fs.readdir(...)`。早期故意失败测试留下的6个dead-PID lock目录及手工compile cache已按精确路径清理；workspace与`/tmp`复查无audit/integration/smoke、`.tmp`/`.bak`/`.orig`/`.rej`残留，无相关test/engine/CLI进程。

## Phase572 后续加固

Phase572区分“preflight snapshot匹配”和“同一次runtime existing result确认”。Phase571 candidate-bound算法、shared inspector projection与fresh mutation recomputation保持不变，但六条maintenance CLI在runtime返回前不再发布positive match或fingerprint；runtime rejection/missing省略旧snapshot evidence，existing result携带exact expected fingerprint后才发布`true`。因此Phase571保证authorization candidate正确，Phase572进一步保证operator report中的positive evidence确实来自authoritative runtime attempt。
