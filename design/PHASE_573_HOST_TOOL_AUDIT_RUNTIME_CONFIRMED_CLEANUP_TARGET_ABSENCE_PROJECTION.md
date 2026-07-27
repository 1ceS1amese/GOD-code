# Phase573：Host tool audit runtime-confirmed cleanup target absence projection

## 背景

Phase572已经保证六条maintenance CLI只有在runtime existing result返回exact expected fingerprint后才发布positive confirmation。继续审计terminal state projection时发现，active lock cleanup与owner-only quarantine cleanup仍保留read-only preflight中的selected-path existence：

- `cleanupAuditLock(...)`成功后返回`removed: true`，实际coordination lock path已经missing，但report仍为`coordination_lock_exists: true`；
- `cleanupAuditLockQuarantine(...)`成功后返回`removed: true`，实际selected quarantine path已经missing，但report仍为`quarantine_exists: true`。

Built Phase572产物的稳定成功探针已经复现两组矛盾。两条runtime transaction在`existed: true`返回时都已经完成selected path commit；即使private quarantine/disposal wrapper收缩失败并返回residual，原active/quarantine basename仍然不存在。因此该问题只影响operator-facing terminal existence evidence，不影响mutation safety。

其余covered maintenance command已经使用runtime outcome更新selected state：owner-only disposal根据`residualDisposalPath`设置`disposal_exists`，empty quarantine/disposal在成功后设置false，recovery根据residual lock/quarantine paths设置两侧existence，runtime missing分支也统一设置false。

## State Projection Contract

1. Dry-run继续投影stable inspection时的selected path existence，eligible candidate为`true`。
2. Preflight eligibility或fingerprint mismatch在runtime调用前返回时，保留inspection snapshot；本阶段不把read-only observation改写成terminal claim。
3. Runtime返回`existed: false`时，selected path existence为`false`、`removed: false`，继续使用既有idempotent warning。
4. Active cleanup runtime返回`existed: true`时，selected coordination lock path已经从active namespace移除；CLI必须设置`coordination_lock_exists: false`，无论private quarantine wrapper是否留下residual。
5. Owner-only quarantine cleanup runtime返回`existed: true`时，selected quarantine basename已经删除；CLI必须设置`quarantine_exists: false`，无论private disposal wrapper是否留下residual。
6. `residual_quarantine_path`和`residual_disposal_path`只描述transaction-owned private wrapper，不得把原selected path existence重新投影为true。
7. Phase572 positive fingerprint规则保持：runtime existing result通过exact expected invariant后才发布`true`与runtime fingerprint。
8. Entry type、layout、owner metadata等字段继续作为本次preflight candidate description保留；本阶段只修正already-terminal `*_exists`字段，不增加snapshot/terminal provenance字段。

## Covered Commands

- `audit cleanup-lock`
- `audit cleanup-lock-quarantine <quarantine-id>`

Owner/empty disposal、empty quarantine cleanup与quarantine recovery已经具有runtime-derived terminal existence projection，不修改。

## Implementation

两条CLI在runtime `existed` gate之后、构造success或residual report之前执行单一terminal assignment：

```text
runtime result
  -> existed false: selected exists=false, removed=false, idempotent WARN
  -> existed true: validate runtime fingerprint
                  -> selected exists=false
                  -> publish positive confirmation
                  -> project OK or private-wrapper residual WARN
```

不修改runtime result type。`removed: true`仍表示selected active/quarantine target已经完成commit；private wrapper contraction uncertainty继续只由residual path和WARN表达。

## Tests

- Stable active confirmed cleanup必须同时返回`removed: true`、`coordination_lock_exists: false`，且current lock path missing。
- Stable owner-only quarantine confirmed cleanup必须同时返回`removed: true`、`quarantine_exists: false`，且selected quarantine path missing。
- Active private quarantine wrong-object contraction probe必须返回WARN、`removed: true`、`coordination_lock_exists: false`和`residual_quarantine_path`。
- Owner-only quarantine private disposal wrong-object contraction probe必须返回WARN、`removed: true`、`quarantine_exists: false`和`residual_disposal_path`。
- Phase572 replacement rejection与pre-runtime disappearance tests保持原语义：rejection不伪造terminal absence，missing仍明确false。
- Built smoke覆盖stable与private residual两类terminal projection，并验证human/JSON一致。
- Built integration继续验证stable two-step cleanup flow。

## 接口边界

- 不增加、删除或重命名CLI human/JSON字段，只修正两个existing boolean的成功值。
- 不改变runtime exported signatures或result types。
- 不改变owner fingerprint算法、confirmation flags、commit point、rollback、residual或descriptor-bound mutation contract。
- 不增加JSON-RPC、agent event、provider、tool result、transcript或persistent schema字段。

## 验收标准

- `removed: true`不得再与原selected active/quarantine `*_exists: true`同时出现。
- Private wrapper residual不得被误报为原selected path仍存在。
- Dry-run、preflight mismatch、runtime rejection与runtime missing语义保持。
- Positive fingerprint仍可追溯到同一次runtime existing result。
- Python、TypeScript、build、built integration与CLI smoke全部通过。
- Workspace及`/tmp`无probe、lock、smoke或patch残留，无相关test/engine进程和FileHandle GC warning。

## 实现结果

- Built Phase572产物稳定成功探针复现active与owner-only quarantine两组矛盾：filesystem中的selected path已经missing，report却同时包含`removed: true`与对应`*_exists: true`。Static audit确认其他owner/empty disposal、empty quarantine与recovery branch已经使用runtime outcome更新terminal existence。
- `ts-host/src/cli/audit.ts`在两条runtime existing gate之后分别设置`quarantine_exists: false`与`coordination_lock_exists: false`，并在随后继续执行Phase572 exact fingerprint invariant与positive projection。Runtime missing分支原有false assignment、preflight refusal和mutation transaction均未改变。
- `cliAudit.test.ts`把两条stable confirmed cleanup收紧为terminal false断言，并新增active private quarantine与owner-only quarantine private disposal wrong-object contraction测试。两条residual case均验证WARN、`removed: true`、selected `*_exists: false`、residual path存在于report、原selected path missing、detached transaction wrapper保持且human/JSON不泄漏owner token；CLI audit测试最终为90项。
- Built CLI smoke新增stable active/quarantine与private residual active/quarantine四类编译产物探针，验证human/JSON terminal existence、selected path absence、residual separation和token non-disclosure。Integration稳定two-step flow新增初始active cleanup、owner-only quarantine cleanup及recovery后active cleanup三处`*_exists: false`黑盒断言。
- 统一`tools/check.sh`验收通过：Python 422项；TypeScript 43个test files、826项；TypeScript build、built integration和CLI smoke全部通过。README、PROJECT_PLAN、INTERNAL_DESIGN、ARCHITECTURE、EXTENSION_POINTS、SECURITY、protocol及Phase530/532/572历史边界已同步Phase573。
- Source/built artifact静态审计确认两个terminal false assignment都位于runtime existing gate之后、positive fingerprint projection之前；runtime exports、result types、CLI字段集合、JSON-RPC、agent event、provider、tool result、transcript与persistent schema未改变。Workspace与`/tmp`无Phase573、smoke、integration、`.tmp`、`.bak`、`.orig`或`.rej`残留，无相关test/engine/CLI进程。

## Phase574 后续边界修正

Phase573背景中把owner-only disposal与successful recovery概括为“根据residual path更新terminal existence”，但后续built probe证明residual locator不能支持current-path truth：同一residual field可在logical path present或wrong-object contraction后missing时出现。Phase574因此保持本阶段active/quarantine selected-path terminal false规则，同时把disposal/recovery residual branch改为保留locator并省略optional `*_exists`；无residual stable success仍明确false，runtime与跨层接口不变。

## Phase575 后续边界修正

Phase573保留entry/layout/owner fields作为successful runtime existing candidate evidence；Phase575只收紧不同的runtime missing branch。Candidate selection返回missing时，selected `*_exists:false`继续保留，但旧preflight structure/owner/scan fields被撤销，disposal source与recovery lock cross-path snapshot也不再发布。Existing success及本阶段terminal absence contract不变。

## Phase576 后续边界修正

Phase576保持本阶段runtime-confirmed selected absence，即使candidate/parent/private wrapper descriptor close失败也不把committed cleanup退化为ERROR。CLI继续报告`removed:true`与selected `*_exists:false`，同时增加cleanup finalization false/warning并返回WARN；private residual仍由独立locator表达。Missing和pre-runtime rejection分支不伪造closure evidence。
