# Phase561：Host tool audit recovery error summary normalization

## 背景

Phase557-560已经保证candidate/lock lifecycle failure不会在正常Error message路径覆盖operation outcome，但warning生成仍调用：

```text
error instanceof Error ? error.message : String(error)
```

Thrown/rejected reason在JavaScript中可以是任意值。Object的`Symbol.toPrimitive`、`toString`或Error的custom `message` getter都可能再次throw；message也可能包含控制字符、换行或无界长文本。若secondary reason在warning格式化时throw，candidate finalizer本身会reject，已提交result或primary typed error仍会被formatter failure覆盖。

Built runtime已复现：committed `restore_previous_archive`的candidate close抛出带throwing `Symbol.toPrimitive`的object；所有handles已经settle且parent close成功，但warning formatter抛出新的error，caller最终收到`locked_revalidation/not_started`，current与`.1`实际已经commit。

Phase561把recovery error message extraction升级为total、bounded、single-line summary。任何unknown reason都必须返回安全字符串，不能throw，也不能让untrusted formatting hook决定control flow。

## Summary Contract

Module-private summary helper满足：

1. 对任意`unknown`输入总是返回string且不throw；
2. 普通`Error.message`和string reason在安全范围内保持原文本；
3. Error message getter、`String(reason)`、`Symbol.toPrimitive`或`toString`失败时返回固定fallback：`unavailable error detail`；
4. C0、DEL/C1以及Unicode line/paragraph separators替换为`?`，确保human diagnostics保持单行；
5. Summary最多512个UTF-16 code units，超限时保留509个并追加`...`；
6. 不读取stack、cause、enumerable properties、custom JSON或raw metadata；
7. 不输出object identity、descriptor number、owner token或其他secret-bearing structure。

Sanitization只应用于reason summary，不改变固定runtime prefix、file/staging path字段或primary validation constants。

## Runtime Coverage

现有`getJsonlAuditRotationRecoveryErrorMessage(...)`统一服务于：

- operation error normalization；
- candidate descriptor close warning；
- coordination lock release/abandon/residual-inspection warning；
- post-commit staging cleanup与durability warning；
- residual staging inspection warning。

因此helper必须在所有这些路径保持total。Secondary formatter failure不得产生新的operation stage，也不得改变mutation/rollback state。

## Outcome Preservation

- Committed result加unprintable close reason：resolve，handles false，warning使用fallback。
- Primary operation error加unprintable secondary reason：reject原primary message/stage/state，并附加fallback warning。
- Unprintable primary thrown value：typed error使用fallback message，但stage/state仍由实际control-flow gate决定。
- Control/newline message：只在summary中替换为`?`，不能注入额外human report lines。
- Oversized message：bounded truncate，不影响JSON validity或CLI renderer。

## CLI Contract

不新增字段。Human与JSON继续复用：

```text
recovery_handle_warning
coordination_lock_warning
recovery_warning
message
```

Phase561只保证这些recovery-derived strings可打印、单行且有界。CLI不得重新访问raw reason。

## Tests

- Candidate close抛出throwing `Symbol.toPrimitive` object，committed result保持且warning使用fallback。
- Primary rollback error叠加hostile secondary close reason，primary message/state保持。
- Error message包含control/newline和超过512字符时，summary被单行化并严格bounded。
- Coordination lock finalization的hostile reason不覆盖missing/committed result。
- CLI human输出不产生注入行，JSON保持同一bounded warning。
- Built runtime smoke复现旧formatter overwrite并验证修复。
- Existing normal messages、async/sync close、handoff、rollback和lock residual tests保持。

## 边界

- Summary不是完整日志，不保留stack/cause/object properties。
- Truncation不表示原message不重要；raw reason只作为in-memory cause存在于typed error链，不进入diagnostics。
- 本阶段不建立全项目通用error sanitizer，只收紧audit recovery outcome-preservation边界。
- 不改变namespace mutation、rollback、descriptor ownership、lock、durability或status rules。
- 不新增JSON-RPC、agent event、provider、tool result、transcript或persistent schema字段。

## 验收标准

- 任意recovery reason formatting hook不能覆盖operation result或primary error。
- Recovery-derived warning/message为single-line且summary部分最多512字符。
- Hostile reason不阻止其他handles、lock finalization或report serialization。
- Phase557-560 success/WARN/ERROR contracts保持。
- TypeScript build、Python、TypeScript、built integration和CLI smoke全部通过。
- `/tmp`与workspace无probe、staging、smoke或patch残留，无FileHandle GC warning。

## 实现结果

- 已用built Phase560 runtime稳定复现旧行为：committed archive restore的candidate close抛出带throwing `Symbol.toPrimitive`的object，all handles已settle且parent close执行，但warning formatter再次throw；caller收到formatter message和错误的`locked_revalidation/not_started`，已提交result被擦除。
- Recovery-local summary新增固定512字符上限与`unavailable error detail` fallback。String reason直接使用；Error message或其他reason coercion全部位于try边界内，getter、`Symbol.toPrimitive`、`toString`或String conversion失败不会逃逸。
- Summary将C0、DEL/C1、Unicode line separator与paragraph separator替换为`?`；超过512字符时保留509字符并追加`...`。Helper不读取stack、cause、enumerable properties、custom JSON或raw metadata。
- Existing operation normalization、candidate close warning、coordination lock release/abandon/residual warning、staging cleanup/durability及residual inspection统一复用该total helper。Unprintable primary reason得到fallback message但保留实际stage/state；unprintable secondary reason只形成fallback warning，不影响operation outcome。
- 新增4项runtime tests，覆盖hostile non-Error close reason、throwing Error message getter叠加successful rollback、控制字符与512字符bound，以及unprintable primary reason；新增1项CLI test验证WARN human/JSON使用fallback且不泄露formatter failure。定向回归通过：`audit.test.ts` 191项、`cliAudit.test.ts` 61项，共252项；TypeScript build通过。
- Built CLI smoke新增hostile `Symbol.toPrimitive` recovery close probe，验证committed performed action、fallback warning和clean coordination lock release全部保持。
- 统一验收通过：Python 422项；TypeScript 43个test files、766项；TypeScript build、built CLI integration和CLI smoke全部通过。README、SECURITY、protocol、PROJECT_PLAN、INTERNAL_DESIGN、ARCHITECTURE、EXTENSION_POINTS及Phase557/558/560历史边界已同步；JSON-RPC、agent event、provider、tool result、transcript和persistent schema未变化。
- `/tmp`无`god-code-audit-*`、`god-code-phase561-*`、`.god-code-audit-rotation-*`或`god-code-smoke.*`残留；workspace无staging directory及`.tmp`、`.bak`、`.orig`或`.rej`文件，验收输出无FileHandle GC warning。

## Phase562 后续加固

Phase562复用本阶段total summary helper处理post-failure observation自身的lock、inspection或classification failure。Observation warning不能throw、不能覆盖primary typed failure，且与candidate/coordination lock warning保持独立。Completed snapshot只包含既有JSON-safe metadata projection；raw observation error、stack和cause仍不进入CLI或跨层协议。
