# Phase550：Host tool audit runtime owner creation failure descriptor handoff

## 背景

Phase543让成功写入的runtime `owner.json` creation handle持续到`release()`或`abandon()`，Phase547又把exclusive create绑定到lock-directory anchor。但creation helper只有在metadata完整写入、snapshot和path gate全部成功后才返回handle。

若`O_CREAT | O_EXCL`已经创建owner entry，而`FileHandle.writeFile()`、post-write fstat或metadata/path validation失败，helper会关闭handle并抛错。Failed acquisition cleanup此时只能重新读取owner metadata；empty或partial JSON会被分类为invalid，因此cleanup不会删除它，最终留下会阻塞后续writer的coordination lock residue。

Phase550把owner entry的“创建所有权”和“metadata持久化完成”拆成两个内部状态。Creation handle在exclusive open和regular/single-link fstat成功后立即交给acquisition；后续持久化失败仍可用original descriptor安全清理exact entry。

## Owner Creation States

新增内部base object：

```ts
interface JsonlAuditLockPinnedOwnerFile {
  handle: FileHandle;
  identity: JsonlAuditLockOwnerFileIdentity;
}
```

成功metadata object扩展该base并增加parsed metadata。Lifecycle区分：

- `uncreated`：exclusive open未成功，没有owner handle；
- `created_pending`：original owner handle和creation-time object identity已经固定，content可能empty、partial或完整但尚未验证；
- `persisted`：完整canonical metadata、final snapshot和logical path gate全部通过；
- `released/abandoned`：沿用Phase543 runtime lifecycle。

Creation-time identity只用于dev/ino object continuity，不要求size、mtime或ctime在write后保持；persisted identity仍使用Phase542完整BigInt snapshot。

## Split Create And Persist

Owner helper拆为两步：

1. 从Phase547已经解析的descriptor-relative/fallback mutation path执行`O_EXCL | O_NOFOLLOW` open；
2. 立即验证regular file、single link和bounded initial state，返回仍打开的`created_pending` handle；
3. acquisition在任何metadata write前保存该handle；
4. persistence step先绑定logical `owner.json` path与creation descriptor，再写canonical JSON；
5. write后建立完整snapshot、解析metadata并再次绑定logical path；
6. 成功后把同一handle提升为`persisted`，不close/reopen。

因此write、fstat、parse或path gate抛错时，outer acquisition catch仍拥有original created file descriptor。

## Failed Acquisition Cleanup

Failed acquisition cleanup接受`created_pending`或`persisted` owner file：

- 先验证original lock directory path、descriptor identity和single-entry layout；
- 对pending object执行owner descriptor/path/descriptor dev/ino gate，不读取或信任partial content；
- 只有logical owner path仍指向original descriptor且directory entry set严格为单一`owner.json`时，才从lock-directory anchor unlink basename；
- unlink后要求logical path missing、original descriptor仍是same regular file且`nlink === 0`；
- 随后按Phase544/547既有规则收缩empty lock directory；
- replacement、extra entry、directory drift或postcondition failure全部保留residue；
- cleanup error继续被吞掉，以原始acquisition failure为caller-visible error；
- 所有pending/persisted owner、lock-directory和parent handles最终关闭。

Pending cleanup不要求valid owner token content，因为exact creation descriptor本身就是本次O_EXCL transaction的ownership evidence。若creation helper未能返回validated handle，仍保留Phase542 reader fallback，只清理能解析并匹配本次token的valid owner。

## Success Path Compatibility

- 成功acquisition继续返回相同`JsonlAuditFileLock`接口。
- `owner.json` schema、0600 mode、token、PID和timestamp不变。
- `release()`继续直接复用same creation handle和persisted snapshot。
- `abandon()`、retry、timeout、inspection、quarantine、disposal和recovery contracts不变。
- 不新增CLI flag、environment variable、JSON-RPC字段或report字段。

## Tests

- Owner exclusive create成功但write在零字节状态失败时，pending descriptor cleanup删除owner和lock directory，并保留原始write error。
- Partial bytes写入后失败时同样通过object identity cleanup，不依赖JSON parse。
- Write failure前owner path被rename并放入replacement file时，cleanup拒绝unlink replacement，保留residue供诊断。
- Successful descriptor-relative owner create/release、failed-acquisition cleanup、release/abandon lifecycle和copied-owner replacement tests保持。
- TypeScript、Python、built integration和CLI smoke全量回归通过。

## 边界

- Exclusive open成功但在creation handle完成regular/single-link fstat前发生不可恢复错误时，runtime仍不能证明残留object，保持fail closed。
- 本阶段不对owner metadata增加fsync；crash consistency与lock liveness仍沿用现有cooperative protocol。
- 不自动清理历史invalid owner residue，只改进本次进程仍持有creation descriptor的失败路径。
- Descriptor-relative mode固定parent lookup；validated fallback仍保留Phase546定义的path syscall窗口。
- Open-file unlink语义仍依赖目标filesystem和平台sharing behavior。

## 验收标准

- Owner creation handle在metadata write之前进入outer acquisition ownership。
- Zero-byte和partial-write failure不再留下本次transaction可证明的lock residue。
- Pending cleanup不解析partial metadata，也不根据path-only identity删除entry。
- Owner replacement或directory drift不会被误删。
- Original acquisition error不被cleanup error覆盖。
- Success lifecycle与全部public contracts保持。
- 所有handles在success、cleanup success、cleanup refusal和cleanup failure路径关闭。
- 全量统一验收通过且无FileHandle GC warning、audit temp residue或workspace临时补丁文件。

## 实现结果

- Current runtime probe确认旧行为：owner O_EXCL create后注入`writeFile` failure会留下包含0-byte `owner.json`的coordination lock；Phase550实现后相同probe保留原始error且lock path为ENOENT。
- 新增`JsonlAuditLockPinnedOwnerFile` base object，`JsonlAuditLockPinnedOwnerMetadata`扩展该base；creation-time object identity与persisted metadata snapshot由类型显式区分。
- Owner helper拆为`createJsonlAuditLockOwnerFile`与`writeJsonlAuditLockOwnerMetadata`：前者在empty regular/single-link fstat后返回open handle，outer acquisition立即记录`acquiredOwnerCreation`；后者在same handle上执行pre-write logical path gate、canonical write、final snapshot和metadata gate。
- Failed acquisition cleanup现在接收pending或persisted owner。Persisted对象继续执行完整metadata validation；pending对象执行descriptor/path/descriptor dev/ino gate，不读取partial content。两者都要求single-entry layout，从lock anchor unlink并执行same-object `nlink === 0` postcondition。
- Success acquisition若在owner持久化后续gate失败，cleanup优先使用persisted snapshot；metadata persistence之前或期间失败则使用pending creation handle。只有creation handle本身未成功返回时才保留token-matched shared-reader fallback。
- 新增三项测试，覆盖zero-byte write failure cleanup、partial JSON write failure cleanup，以及owner rename/replacement后的cleanup refusal与original error preservation。
- 定向audit回归通过：`audit.test.ts` 121项、`cliAudit.test.ts` 45项，共166项；TypeScript build通过。
- 统一验收通过：Python 422项；TypeScript 43个test files、680项；TypeScript build、built CLI integration和CLI smoke全部通过。
- `/tmp`下无`god-code-audit-*`或`god-code-phase550-probe-*`临时残留，workspace无`.tmp`、`.bak`、`.orig`或`.rej`文件，也没有FileHandle GC warning。
