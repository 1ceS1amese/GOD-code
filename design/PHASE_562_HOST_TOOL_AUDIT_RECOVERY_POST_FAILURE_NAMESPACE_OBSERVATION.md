# Phase562：Host tool audit recovery post-failure namespace observation

## 背景

Phase557-561已经把rotation staging recovery的primary operation、candidate handle和coordination lock lifecycle错误保存在同一个typed failure中，但失败证据仍停留在operation control flow：

```text
failure_stage
mutation_state
rollback_attempted / rollback_completed
recovery_fingerprint
```

其中`recovery_fingerprint`可能是在mutation前完成locked revalidation时得到的旧证据。若mutation已经开始、reverse rollback失败或cleanup结果无法确认，caller只能看到`rolled_back`或`uncertain`，无法知道锁释放前current generation、`.1`和selected staging实际形成了什么namespace。

失败返回后再单独执行`inspect-rotation-recovery`也不能补回这一证据：coordination lock已经释放，其他writer可能先改变状态。Phase562因此在primary operation失败、candidate handles已经finalize、正常coordination lock仍可证明由当前recovery持有时，执行一次bounded、read-only、lock-held namespace observation。

## Runtime Contract

新增public observation：

```text
JsonlAuditRotationStagingRecoveryFailureObservation
  observedWhileCoordinationLockHeld: true
  assessment
  eligible
  recommendedAction?
  recoveryFingerprint?
  currentGeneration
  rotatedGeneration
  staging
```

`JsonlAuditRotationStagingRecoveryFailureDetails`新增：

```text
postFailureObservationCompleted: boolean
postFailureObservation?
postFailureObservationWarning?
```

语义如下：

1. `postFailureObservationCompleted: true`只在观察前后两次lock-held assertion均成功、namespace graph读取完成且classification成功时出现；
2. observation使用现有no-follow metadata inspection，不读取generation或archive内容，不执行rename、unlink、rmdir、mkdir或durability mutation；
3. observation中的classification忽略当前recovery自己持有的coordination lock，仅分类current/rotated/staging namespace；
4. `eligible`与nested `recoveryFingerprint`只描述锁内快照。锁释放后重试仍必须重新取得正常coordination lock并执行fresh graph/fingerprint revalidation；
5. mutation前的top-level `recoveryFingerprint`与post-failure nested fingerprint并存，不能互相覆盖或被解释为同一时点；
6. lock acquisition失败时没有可验证的正常锁内观察，`postFailureObservationCompleted`为`false`，不伪造warning或namespace；
7. lock已被替换、观察期间发生变化、inspection/classification失败时，completed为`false`，只附加安全的`postFailureObservationWarning`；
8. observation failure永远不能覆盖primary message、stage、mutation state、rollback evidence、candidate handle evidence或coordination lock finalization evidence。

## Ordering

失败路径顺序固定为：

1. `recoverJsonlAuditRotationStagingUnderLock(...)`完成或reject；
2. under-lock candidate finalizer完成所有descriptor close settlement；
3. 若operation reject，执行post-failure read-only observation；
4. observation前后均验证当前normal coordination lock仍由本次recovery持有；
5. 执行既有lock release/abandon/residual inspection；
6. 组合primary failure、observation和lock finalization后抛出public typed error。

该顺序保证snapshot属于failure之后、lock release之前，同时避免observation与candidate descriptor ownership重叠。

## CLI Contract

`AuditRotationStagingRecoveryDetails`新增：

```text
post_failure_observation_completed
post_failure_observation
  observed_while_coordination_lock_held
  assessment
  eligible
  recommended_action?
  recovery_fingerprint?
  current_generation
  rotated_generation
  staging
post_failure_observation_warning
```

Human renderer使用独立nested section，不把对象打印成`[object Object]`。JSON renderer保留同一结构。CLI不得把nested fingerprint写回top-level `recovery_fingerprint`，也不得把snapshot eligibility转换为自动retry。

## Tests

- Stale fingerprint / no mutation failure：观察完成，锁内namespace仍给出原action和fresh fingerprint。
- Mutation失败且reverse rollback完成：primary `rolled_back`保持，观察重新证明原candidate可恢复。
- Wrong-object archive rename导致rollback uncertainty：观察完成并投影实际current、rotated和invalid staging state。
- Empty-staging cleanup处于attempted-unconfirmed：观察完成并显示residual cleanup candidate或实际missing状态。
- Coordination lock replacement：观察不完成，primary lock-change error保持，warning和lock residual evidence并存。
- Observation inspection自身失败：primary error保持，completed false并使用Phase561 total bounded summary。
- CLI human/JSON覆盖completed observation和incomplete warning。
- Built runtime smoke复现rollback uncertainty，并断言snapshot在lock release前取得且无自动重试。

## 边界

- Observation不是transaction rollback，也不提高`mutation_state`确定性；它只记录随后读到的namespace。
- `eligible: true`不代表failure返回后仍可直接mutation；任何retry都必须重新inspect、确认action和fingerprint。
- 不扫描其他staging id，不扩大到lock quarantine/disposal，不输出owner token、inode/device或raw descriptor。
- 不修改success result schema、JSON-RPC、agent event、provider、tool result、transcript或persistent schema。
- 不在观察失败时重试或延迟lock release。

## 验收标准

- 所有normal-lock-acquired recovery failures都明确报告post-failure observation完成或未完成。
- Completed observation能够区分pre-mutation fingerprint与post-failure namespace fingerprint。
- Lock丢失或inspection失败不能产生伪造的lock-held snapshot，也不能覆盖primary failure。
- Human和JSON CLI输出保持结构化、可序列化且不出现`[object Object]`。
- Phase557-561 operation/rollback/handle/lock/error-summary contracts全部保持。
- TypeScript build、Python、TypeScript、built integration和CLI smoke全部通过。
- `/tmp`与workspace无probe、staging、smoke或patch残留，无FileHandle GC warning。

## 实现结果

- 新增public `JsonlAuditRotationStagingRecoveryFailureObservation`，并在typed failure details中加入required `postFailureObservationCompleted`、optional snapshot和warning。Lock acquisition failure明确输出completed false；normal-lock-acquired failure则总是在lock finalization前尝试观察。
- 新增module-private failure observation helper。它在existing recovery graph reader前后调用held-lock assertion，随后复用Phase555 classifier，并只投影current/rotated generation、selected staging、assessment、eligibility及optional action/fingerprint。任何assert/read/classify failure都被收敛为Phase561 total bounded warning，primary operation error保持。
- Outer recovery ordering现在为under-lock operation与candidate handle settlement、failure-only observation、normal lock release/abandon/residual inspection、public typed error组合。Success path不执行额外graph read，success result schema与status规则不变。
- CLI新增`post_failure_observation_completed`、nested `post_failure_observation`和warning映射。Human renderer分别渲染nested summary、current generation、rotated generation与staging，不出现`[object Object]`；JSON保留相同结构，nested fingerprint不覆盖top-level confirmation fingerprint。
- Runtime coverage新增observation inspection failure primary-preservation测试，并增强stale fingerprint、successful rollback、attempted-unconfirmed cleanup、wrong-object rollback uncertainty、lock replacement及descriptor lifecycle tests。CLI新增incomplete observation projection测试并增强rolled-back nested human/JSON snapshot。定向回归通过：`audit.test.ts` 192项、`cliAudit.test.ts` 62项，共254项；TypeScript build通过。
- Built CLI smoke新增wrong-object archive rename probe，稳定形成`rollback/uncertain`，并验证锁释放前snapshot为current与rotated同时存在、selected staging `unknown`、assessment `invalid_staging_state`且无retry fingerprint；coordination lock最终干净释放。
- 统一验收通过：Python 422项；TypeScript 43个test files、768项；TypeScript build、built CLI integration和CLI smoke全部通过。README、SECURITY、protocol、PROJECT_PLAN、INTERNAL_DESIGN、ARCHITECTURE、EXTENSION_POINTS及Phase556/558/561历史边界已同步；JSON-RPC、agent event、provider、tool result、transcript和persistent schema未变化。
- `/tmp`无`god-code-audit-*`、`god-code-phase562-*`、`.god-code-audit-rotation-*`或`god-code-smoke.*`残留；workspace无staging directory及`.tmp`、`.bak`、`.orig`或`.rej`文件，无残留integration/smoke/engine进程，验收输出无FileHandle GC warning。

## Phase563 后续加固

Phase563使本阶段post-failure graph observation继承selected staging的2-entry bounded stream scan。Observation能够报告scan count/limit/truncated，但不完整物化、排序或泄露overflow names；truncated snapshot稳定分类为`invalid_staging_state`且无retry fingerprint。Primary failure、lock-held assertion和observation warning语义不变。
