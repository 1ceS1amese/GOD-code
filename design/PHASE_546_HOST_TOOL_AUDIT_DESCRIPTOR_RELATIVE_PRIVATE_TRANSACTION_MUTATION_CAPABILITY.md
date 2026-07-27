# Phase546：Host tool audit descriptor-relative private transaction mutation capability

## 背景

Phase540至Phase545已经把selected directories、owner files、runtime lock和两类private wrapper roots纳入descriptor graph，并在path-based unlink/rmdir返回后验证original object确实脱链。

剩余mutation仍把absolute path传给Node `fs.rename`、`fs.unlink`、`fs.rmdir`和`fs.mkdtemp`。即使transaction在syscall前后都验证descriptor，父目录entry仍会在path resolution期间重新解析。Phase544/545能够检测wrong-object success，但不能把syscall的parent lookup固定到transaction持有的directory descriptor。

Node公共`fs`接口不提供`renameat`、`unlinkat`或dirfd参数。Linux运行时可通过`/proc/self/fd/<fd>/<child>`把path resolution起点绑定到已打开directory descriptor；该能力不是跨平台保证，因此必须动态验证并保留现有path-based fallback。

Phase546先把该capability接入Phase545的两个private transaction，形成可测试的纵向切片。Runtime lock和其余cleanup/recovery mutation在后续阶段复用同一primitive，不在本阶段一次性改写全部事务。

## Capability Contract

新增内部directory mutation anchor：

- logical directory path；
- transaction-owned open directory handle。

每次解析child mutation path时：

1. child name必须是single entry name，拒绝empty、`.`、`..`、NUL和POSIX/Windows separator；
2. Linux尝试读取`/proc/self/fd/<fd>`；
3. descriptor、procfd target、descriptor三份BigInt stat都必须是同一directory device/inode；
4. 验证成功返回`descriptor_relative` path；
5. procfs absent、permission denied或unsupported时返回`path` fallback；
6. procfd object mismatch或descriptor failure不降级，直接拒绝。

Fallback不是静默降低transaction gate：caller仍执行Phase545 current logical path、exact entry set和Phase544 post-syscall detachment proof。

## Private Root Creation

Private root helper先pin `path.dirname(prefix)`：

- Linux capability可用时，`mkdtemp`使用`/proc/self/fd/<parent-fd>/<prefix-name>`；
- 返回值保留descriptor-relative actual creation path，只取validated generated basename重新派生logical root path；root先从actual path打开，再独立验证logical path仍指向同一object；
- fallback继续使用logical absolute prefix；
- root创建后立即pin original directory；
- mode通过root handle收敛为0700，不再对logical path执行chmod；
- returned temporary root同时持有root和parent handles。

Parent handle跨完整transaction保持，成功、rollback、residual和initialization failure路径全部关闭。

## Main Lock Cleanup

以下mutation改为directory-anchor relative：

- selected lock：parent anchor / lock basename -> quarantine root / `lock`；
- owner isolation：selected lock descriptor / `owner.json` -> quarantine root / `owner.json`；
- selected child rmdir：quarantine root / `lock`；
- rollback owner与lock rename；
- isolated owner unlink：quarantine root / `owner.json`；
- final private root rmdir：parent anchor / generated wrapper name。

Logical path assertions、candidate handles、commit point和`residualQuarantinePath`保持Phase545 contract。

## Owner-Only Quarantine Cleanup

以下mutation改为directory-anchor relative：

- owner isolation：selected quarantine descriptor / `owner.json` -> disposal root / `owner.json`；
- selected quarantine rmdir：parent anchor / quarantine basename；
- rollback owner rename；
- isolated owner unlink：disposal root / `owner.json`；
- final private disposal root rmdir：parent anchor / generated wrapper name。

Logical path、fingerprint、selected quarantine rmdir commit point和`residualDisposalPath`保持不变。

## Failure Semantics

- Linux procfd capability unavailable时使用path fallback，不改变现有CLI可用性。
- Procfd path与open descriptor不匹配时fail closed，不回退到logical path。
- Descriptor-relative syscall仍按child entry name操作，不能原子断言leaf inode；Phase544 detachment proof继续负责拒绝wrong-object unlink/rmdir success。
- Wrapper或candidate logical path drift仍按Phase545拒绝/rollback/residual语义处理。
- Descriptor-relative mutation不扫描被移动对象的新名称，也不扩大recursive deletion范围。
- Native addon、FFI、helper process和新安装依赖均不引入。

## Tests

- Linux resolver返回经过descriptor identity验证的`/proc/self/fd/<fd>/<child>` path。
- Forced non-Linux resolver返回logical child path，证明fallback稳定。
- Invalid child name在任何platform mode下都拒绝。
- Main cleanup的private-root create/rename/unlink/rmdir走descriptor-relative路径。
- Owner-only quarantine cleanup走同一capability。
- 两类final wrapper wrong-object fake-success测试适配descriptor-relative parent path并继续返回residual。
- Existing replacement、rollback、extra-entry、CLI和report tests保持。
- TypeScript、Python、built integration与CLI smoke全量回归通过。

## 边界

- 本阶段只接入Phase545两个private transaction，不改runtime acquisition/release、empty cleanup、owner-only disposal cleanup或recovery；这些调用点已完成清单审计，后续复用同一capability。
- `/proc/self/fd`是Linux feature-probed optimization，不作为跨平台公共contract。
- Dir-relative parent anchoring不等于leaf compare-and-delete，也不取消postcondition。
- 不新增CLI flag、JSON字段、environment variable、owner schema或fingerprint。
- 不承诺Windows open-directory deletion sharing语义改变。

## 验收标准

- 两类private root创建可在Linux绑定到parent descriptor，返回logical canonical path。
- 两个private transaction的所有rename/unlink/rmdir都通过shared directory mutation capability。
- Linux procfd不可用时现有path-based transaction仍可运行且保持全部pre/post gates。
- Parent/root handles在所有路径关闭，无FileHandle GC warning。
- Wrapper replacement与wrong-object success仍不被报告为完整成功。
- CLI、JSON report、commit point和residual fields保持。
- 全量统一验收通过且无audit temp residue或workspace临时补丁文件。

## 实现结果

- 新增`jsonlAuditDirectoryMutation.ts`内部模块，统一提供single-entry validation、Linux procfd identity probe、logical path fallback、descriptor-relative `mkdtemp`、rename、unlink和rmdir。
- Procfd resolver在operation前读取descriptor/procfd/descriptor三份BigInt stat并要求directory device/inode一致；procfs absent、permission denied或unsupported时才fallback，对descriptor mismatch保持fail closed。
- Path fallback在返回mutation path前执行descriptor/path/descriptor object gate；logical directory被replacement后不会静默操作replacement。
- Private root creation先以object-identity-only parent opener固定shared temp parent，再通过parent anchor执行`mkdtemp`。Root从actual returned mutation path打开，随后验证logical path与root descriptor，mode通过root handle收敛为0700。
- `JsonlAuditLockPinnedTemporaryDirectory`现在同时持有generated name、logical path、root handle和parent handle；initialization、success、rollback、residual路径均关闭两条directory edges。
- Main lock cleanup的lock isolation、owner isolation、selected child rmdir、rollback、owner unlink和final root contraction全部改用shared adapter。
- Owner-only quarantine cleanup的owner isolation、selected quarantine rmdir、rollback、owner unlink和final disposal contraction全部改用同一adapter。
- 新增八项测试，覆盖Linux procfd resolution、forced non-Linux fallback、invalid child拒绝、fallback anchor drift、descriptor-relative root creation、logical parent replacement后的actual path、descriptor-anchored mutation，以及两条private transaction全mutation接线；Phase545两项wrong-object final rmdir测试已适配procfd path并继续返回residual。
- 定向audit回归通过：`audit.test.ts` 102项、`cliAudit.test.ts` 45项，共147项；TypeScript build通过。
- 统一验收通过：Python 422项；TypeScript 43个test files、661项；TypeScript build、built CLI integration和CLI smoke全部通过。
- `/tmp`下无`god-code-audit-*`临时残留，workspace无`.tmp`、`.bak`、`.orig`或`.rej`文件，也没有FileHandle GC warning。

## Phase547 后续

Phase547为shared adapter补充exact directory creation，并把capability推广到runtime acquisition/release/failed cleanup、empty quarantine/disposal、owner-only disposal及quarantine recovery/rollback/contraction。Audit lock maintenance namespace因此统一使用descriptor-relative或validated fallback mutation；Phase546 private transaction行为保持，audit file generation rotation仍是独立边界。
