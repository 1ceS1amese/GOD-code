# Phase558：Host tool audit recovery failure evidence and rollback status

## 背景

Phase557保留了已知operation result在descriptor/lock finalization failure后的commit evidence，但operation本身reject时仍只传播plain `Error`。

已验证场景中，normal lock取得后在`beforeMutation`发生copied-owner lock replacement：runtime正确拒绝mutation并保留primary message，但logical replacement lock与detached original lock同时存在，thrown error没有任何enumerable或typed fields。CLI只能返回默认`mutation_performed: false`，看不到coordination lock acquisition/release、residual path，也无法区分“未开始mutation”“已mutation并成功rollback”与“rollback不确定”。

Phase558增加JSON-safe typed failure evidence。Primary error message和reject contract保持；secondary candidate/lock finalization不覆盖primary，而是进入failure details。

## Failure Types

新增：

```text
JsonlAuditRotationStagingRecoveryFailureStage =
  | lock_acquisition
  | locked_revalidation
  | candidate_open
  | candidate_revalidation
  | mutation
  | rollback

JsonlAuditRotationStagingRecoveryMutationState =
  | not_started
  | attempted_unconfirmed
  | rolled_back
  | uncertain
```

新增公开error：

```text
JsonlAuditRotationStagingRecoveryError extends Error {
  details: JsonlAuditRotationStagingRecoveryFailureDetails
  cause?: unknown
}
```

`message`保持原primary error文本。`details`只含JSON-safe paths、enum、booleans、fingerprint与warning，不含BigInt、FileHandle、owner token或raw metadata。

## Failure Details

Details包含：

- file、rotated、staging与requested action/fingerprint；
- failure stage与mutation state；
- `rollbackAttempted`和optional `rollbackCompleted`；
- optional current recovery fingerprint；
- optional candidate handles closure结果；
- derived coordination lock path；
- `coordinationLockAcquired`；
- acquisition成功后optional release/residual/warning fields。

Input validation仍在filesystem access前抛出原普通validation error。Lock acquisition timeout/blocker进入typed error，但`coordinationLockAcquired: false`且不把foreign existing lock标记为本次residual。

## Mutation State Rules

- `not_started`：runtime尚未调用任何generation/staging namespace mutation syscall。
- `attempted_unconfirmed`：rename/rmdir已经调用，但未返回可验证success，不能断言entry发生变化。
- `rolled_back`：至少一个namespace mutation已成功，随后initial namespace shape按descriptor/snapshot postcondition恢复。
- `uncertain`：已确认mutation无法恢复，或post-syscall wrong-object/state drift使最终namespace不能证明。

`rollbackAttempted`只在runtime实际进入reverse transaction时为true；`rollbackCompleted`只在attempt存在时输出。Committed generation与post-commit cleanup/durability/lifecycle warning仍走Phase557 resolved result，不进入failure state。

## Runtime Flow

Locked recovery内部使用module-private operation failure封装：

1. initial/second graph expectation与held-lock gate失败映射`locked_revalidation/not_started`；
2. parent/staging/generation candidate opening失败映射`candidate_open/not_started`；
3. final candidate gate失败映射`candidate_revalidation/not_started`；
4. cleanup/rename syscall前记录attempt；
5. restore/full rollback根据successful rename flags和rollback result输出attempted、rolled_back或uncertain；
6. candidate close outcome合并到operation failure；
7. outer release/abandon/residual outcome合并到public typed error；
8. public error以原primary message reject。

Pre-commit error不因secondary close/release failure改变message、stage或mutation state。

## CLI Contract

`audit_rotation_staging_recovery` ERROR details新增：

```text
failure_stage
mutation_state
mutation_attempted
rollback_attempted
rollback_completed
coordination_lock_acquired
```

并复用Phase557：

```text
recovery_handles_closed
recovery_handle_warning
coordination_lock_released
residual_coordination_lock_path
coordination_lock_warning
```

Mapping：

- `not_started`：`mutation_attempted: false`、`mutation_performed: false`；
- `attempted_unconfirmed`：attempted true、performed false；
- `rolled_back`：attempted true、performed true、rollback completed true；
- `uncertain`：attempted true、performed true、rollback completed false或undefined。

所有typed failure仍为`ok: false`与ERROR exit status。CLI不得把failure details中的lock path、residual或rollback evidence丢失，也不得输出owner token。

## Tests

- Lock acquisition timeout输出typed `lock_acquisition/not_started`且acquired false。
- Wrong fingerprint、graph drift与held-lock replacement输出`locked_revalidation/not_started`。
- Candidate open/final gate failure输出对应stage且primary close error不覆盖。
- Cleanup rmdir rejection输出`mutation/attempted_unconfirmed`。
- Restore/full injected failure加成功reverse rollback输出`mutation/rolled_back`。
- Wrong-object rename或rollback failure输出`rollback/uncertain`。
- Primary mutation error叠加candidate close和lock release failure时，message保持primary并附带两层lifecycle warning/residual。
- CLI human/JSON覆盖not-started、rolled-back、uncertain和lock acquisition failure。
- Built smoke使用stale fingerprint执行真实ERROR路径并验证typed fields与clean lock release。
- Phase553-557 success/WARN contracts保持。

## 边界

- Failure evidence不自动恢复、清理或重试任何namespace。
- `attempted_unconfirmed`不推断syscall是否产生side effect。
- `rolled_back`只证明本次runtime验证的initial namespace shape，不证明外部observer未见瞬态状态。
- Typed error不序列化raw cause、FileHandle、BigInt、owner metadata或token。
- 不改变normal JsonlAuditSink、JSON-RPC、agent event、provider、tool result、transcript或persistent metadata schema。

## 验收标准

- 每个post-validation recovery rejection都有稳定stage与mutation state。
- Primary message在candidate/lock finalization failure下保持。
- Rollback success与uncertainty不可在CLI中混淆。
- Acquisition failure不误报本次residual lock ownership。
- CLI ERROR保留mutation、rollback和lifecycle evidence。
- Phase553-557定向回归、TypeScript build、Python、TypeScript、built integration和CLI smoke全部通过。
- `/tmp`与workspace无测试残留或FileHandle GC warning。

## 实现结果

- 新增公开`JsonlAuditRotationStagingRecoveryFailureStage`、`JsonlAuditRotationStagingRecoveryMutationState`、JSON-safe failure details与`JsonlAuditRotationStagingRecoveryError`。Input action、ID、fingerprint和durability validation仍在typed recovery lifecycle之外保持原plain validation error；normal lock acquisition failure单独输出`lock_acquisition/not_started`与`coordinationLockAcquired: false`。
- 锁内operation新增module-private failure envelope。Initial/second graph expectation映射`locked_revalidation`，partial candidate open与final gate分别映射`candidate_open`、`candidate_revalidation`；candidate handles采用all-settled close outcome，并把closed/warning合并到primary failure而不改变message。
- Empty cleanup在调用descriptor-backed rmdir helper前推进attempt marker，helper rejection输出`mutation/attempted_unconfirmed`。Archive restore/full rollback在每次rename调用前记录attempt，并依据verified successful rename flags进入reverse transaction：initial namespace恢复成功输出`mutation/rolled_back`并保留原error；reverse rollback失败输出`rollback/uncertain`与residue message。
- Outer wrapper在operation rejection后仍执行一次Phase557 lock finalization，把release、fallback abandon、logical residual inspection结果合并到public typed error。已取得lock时明确输出acquired/released状态；secondary candidate/lock failure不能覆盖primary stage、mutation state或message。Acquisition timeout不把foreign lock误报为本次residual。
- CLI `audit_rotation_staging_recovery` ERROR details新增`failure_stage`、`mutation_state`、`mutation_attempted`、`rollback_attempted`、`rollback_completed`与`coordination_lock_acquired`，并复用descriptor/lock lifecycle fields。`not_started`、`attempted_unconfirmed`、`rolled_back`和`uncertain`分别映射稳定的attempted/performed语义；human与JSON renderer共享同一details object。
- Runtime tests扩展lock timeout、stale fingerprint、successful rollback、rollback failure、copied-owner lock replacement断言，并新增empty rmdir attempted-unconfirmed、candidate-open close warning、primary final-gate error叠加candidate-close与lock-residual evidence三项。CLI新增rolled-back ERROR projection并扩展stale confirmation human/JSON断言。定向回归通过：`audit.test.ts` 184项、`cliAudit.test.ts` 59项，共243项；TypeScript build通过。
- Built CLI smoke新增真实stale confirmation ERROR路径：从built dry-run提取action/fingerprint，注入staging graph drift，再通过built parser/dispatch执行confirmed command并断言locked revalidation、not-started mutation、rollback false及clean lock release evidence。
- 统一验收通过：Python 422项；TypeScript 43个test files、757项；TypeScript build、built CLI integration和CLI smoke全部通过。README、SECURITY、protocol、PROJECT_PLAN、INTERNAL_DESIGN、ARCHITECTURE、EXTENSION_POINTS及Phase527/543/556/557历史边界已同步；JSON-RPC、agent event、provider、tool result、transcript和persistent schema未变化。
- `/tmp`无`god-code-audit-*`、`god-code-phase558-*`、`.god-code-audit-rotation-*`或`god-code-smoke.*`残留；workspace无staging directory及`.tmp`、`.bak`、`.orig`或`.rej`文件，验收输出无FileHandle GC warning。

## Phase559 后续加固

Phase559修复本阶段`candidate_open` failure details的一处nested ownership遗漏。Pinned parent/staging opener在open成功、return前validation失败时把unreturned handle handoff给candidate catch；outer finalizer因此能把该descriptor与已返回handles一起去重、all-settled关闭，并准确设置`recoveryHandlesClosed`与warning。Failure stage、mutation state、primary message、rollback和coordination lock fields保持Phase558 contract。

## Phase561 后续加固

Phase561让本阶段typed primary message和secondary warning都通过total bounded summary helper。Unprintable primary thrown value使用固定fallback但仍保留实际failure stage/state；hostile candidate/lock reason无法在message extraction时产生新error并覆盖typed details。Raw cause继续只存在in-memory error chain，不进入public details或CLI。

## Phase562 后续加固

Phase562为本阶段typed failure details增加独立post-failure observation。Normal lock仍可证明持有时，runtime在release前输出fresh namespace assessment及current/rotated/staging projection；lock丢失或inspection失败只追加bounded warning。该snapshot不回写本阶段top-level pre-mutation fingerprint，不改变failure stage、mutation state或rollback evidence，也不授权锁释放后的自动retry。
