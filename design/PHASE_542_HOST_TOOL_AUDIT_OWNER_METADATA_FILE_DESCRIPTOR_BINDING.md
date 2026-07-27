# Phase542：Host tool audit owner metadata file descriptor binding

## 背景

Phase529为`owner.json`建立了bounded no-follow parser、dev/ino identity、UUID token和single-entry release gate。Phase530/532/535 cleanup与Phase533 recovery继续复用这些evidence。现有inspection只在单次读取期间打开owner descriptor，返回后立即关闭；后续release、rename或unlink仍依赖owner path、number dev/ino和token重新识别文件。

Phase539至Phase541已经证明，快速remove/recreate可能复用path metadata，持续打开descriptor才能把mutation绑定到原filesystem object。Phase542把该模型扩展到owner metadata regular file。

范围覆盖：

- acquisition完整owner snapshot到runtime release-time descriptor binding；
- failed acquisition cleanup；
- Phase530 main lock cleanup；
- Phase532 owner-only quarantine cleanup；
- Phase535 owner-only disposal cleanup；
- Phase533/541 pre-commit quarantine recovery与rollback。

CLI command、fingerprint、metadata schema、eligible state、commit point和report contract保持不变。

## Pinned Owner Contract

Shared pinned owner对象包含：

- no-follow regular-file `FileHandle`；
- BigInt device/inode/ctimeNs/birthtimeNs/mtimeNs/size identity；
- 完整parsed owner metadata。

Owner snapshot gate按以下顺序执行：

1. descriptor fstat，要求regular、single-link和bounded size。
2. current owner path lstat，要求相同filesystem object。
3. 从固定descriptor以offset 0读取最多4097 bytes。
4. 再次执行descriptor fstat与path lstat。
5. 要求本次检查中的path与前后descriptor完整BigInt snapshot一致。
6. 解析metadata并要求version、token、PID和canonical timestamps与candidate metadata完全一致。

Object continuity使用open handle固定的device/inode。Owner rename会合法改变ctime，因此不要求transaction期间始终等于initial ctime；但每个gate内的current path/descriptor snapshots必须一致。Descriptor保持open时原inode不能被释放并复用。

## Acquisition And Release

Owner file使用`O_CREAT | O_EXCL | O_RDWR | O_NOFOLLOW`和0600创建。写入canonical JSON后立即建立完整BigInt owner snapshot，验证结束后关闭creation handle；lock object保存该snapshot和完整metadata，不长期占用FileHandle。

Release开始时重新no-follow pin current owner file，并要求其完整BigInt identity与acquisition snapshot一致。这样既能拒绝通常的copied-file replacement，也不会让故意形成orphan/quarantine residue的lock object长期持有无法显式释放的descriptor。

Release要求：

1. lock directory仍匹配acquisition identity。
2. release-time owner descriptor完整identity仍等于acquisition snapshot。
3. current owner path绑定该release descriptor，且内容仍等于完整acquisition metadata。
4. directory仍只包含`owner.json`。
5. 最终owner gate通过后unlink owner并rmdir lock directory。

Release-time handle在成功或失败路径都关闭。若owner已经unlink而directory rmdir失败，lock object记录owner-removed状态，后续release只继续验证并收缩原lock directory。

Failed acquisition cleanup重新pin current owner，并只在directory、owner descriptor、acquisition snapshot和metadata都匹配时unlink；所有路径关闭handle。

## Cleanup Transactions

`JsonlAuditLockCleanupCandidate`增加pinned owner对象。Handle从candidate selection跨越：

- main lock quarantine rename、owner isolation、rollback和owner unlink；
- owner-only quarantine owner isolation、rollback和disposal unlink；
- owner-only disposal owner unlink commit与residual return。

Owner path发生rename后，后续gate用新owner directory重新绑定同一descriptor。Copied metadata replacement不能匹配仍被handle固定的原owner file。

## Recovery Transaction

`JsonlAuditLockQuarantineRecoveryCandidate`增加pinned owner对象。Handle跨越：

- source layout validation；
- owner rename到coordination reservation；
- recovered-lock validation；
- pre-commit rollback回原layout；
- success或residual result construction。

Root/nested/reservation directory handles继续由Phase541管理；owner handle提供第四条独立object edge。

## Descriptor Lifecycle

- Read-only inspection通过shared pinned reader取得snapshot后立即关闭handle，外部report不增加字段。
- Runtime acquisition保存完整owner identity/metadata snapshot；release临时取得pinned handle并在本次调用内关闭。
- Cleanup/recovery candidate成功后由top-level transaction持有，并在所有return/error路径关闭。
- Candidate selection或initialization failure关闭已经打开的全部handles。
- Handles不进入CLI report，不跨进程或跨command持久化。

## Failure Semantics

- Owner path replacement即使复制完全相同JSON，也因path/descriptor mismatch拒绝。
- In-place metadata drift通过descriptor content与full metadata equality拒绝。
- Directory replacement、entry-set drift、fingerprint mismatch和owner token drift保持既有错误语义。
- Cleanup/recovery rollback不会删除无法绑定到原owner descriptor的文件。
- Owner unlink后的既有commit/residual semantics保持。

## Tests

- Runtime release拒绝同directory内copied-metadata owner file replacement。
- Main cleanup拒绝copied-metadata owner file replacement并保留replacement/original。
- Owner-only disposal cleanup拒绝copied-metadata owner file replacement。
- Recovery拒绝copied-metadata source owner file replacement。
- Main/quarantine/disposal正常cleanup继续跨rename验证同一owner descriptor。
- 两类recovery与rollback继续通过。
- Read-only inspection和CLI output不新增handle、token或metadata原文。
- Built CLI integration与smoke保持通过。

## 边界

- 本阶段不改变owner schema、fingerprint算法或CLI flags。
- 本阶段不判断PID liveness或age-based stale。
- 本阶段不提供force release、recursive cleanup或background reaper。
- Phase542本身不让lock object跨整个hold周期长期占用owner FileHandle；该边界已由Phase543新增的显式`abandon()`生命周期和creation-handle retention继续加固。
- Release validation与path-based unlink之间仍是用户态窗口；本阶段不引入native `unlinkat`/`renameat2` addon。
- POSIX允许unlink open regular file；Windows是否允许删除open owner file仍取决于Node与filesystem sharing semantics，既有cross-platform测试边界保持。

## 验收标准

- 所有owner-bearing mutation transaction都持有原owner descriptor直到commit/rollback结束。
- Acquisition保存完整owner snapshot，release transaction重新pin并绑定同一snapshot。
- Copied-metadata replacement不能通过owner gate。
- Read-only inspection、CLI projection和metadata schema保持兼容。
- Phase529至Phase541 directory descriptor、rollback和residual语义保持。
- TypeScript、Python、built integration与smoke全量回归通过。

## 实现结果

- 新增shared pinned-owner reader，以BigInt device/inode/ctimeNs/birthtimeNs/mtimeNs/size绑定path和descriptor，并从固定handle重复读取完整metadata。
- Existing read-only owner inspection改为调用shared reader后立即关闭handle，public inspection与CLI projection不变。
- Acquisition写入后保存完整owner snapshot；release重新pin current owner，核对snapshot、完整metadata和single-entry invariant后才unlink。
- `JsonlAuditLockCleanupCandidate`与`JsonlAuditLockQuarantineRecoveryCandidate`持有pinned owner对象，handle跨rename、owner isolation、rollback、unlink和residual return保持有效。
- Failed acquisition cleanup、main/quarantine/disposal cleanup和recovery rollback均使用同一owner descriptor gate。
- 新增release、main cleanup、owner-only disposal cleanup和recovery四项copied-metadata owner replacement测试；targeted audit测试无FileHandle GC warning。
- CLI command、flags、fingerprint、owner schema、eligible state、commit point和human/JSON report未改变。
- 统一验收通过：Python 422项；TypeScript 43个test files、642项；TypeScript build、built CLI integration和CLI smoke全部通过。

## Phase543 后续加固

Phase543不再在acquisition完成后关闭owner creation handle。Runtime lock直接持有original pinned owner直到成功`release()`或显式`abandon()`；release不再重新open current owner，failed acquisition优先复用original handle，sink退出路径显式终止descriptor ownership。Phase542 shared reader继续服务read-only inspection以及没有creation handle的fallback路径，cleanup/recovery transaction contract保持不变。

## Phase565 后续加固

Phase565让read-only active lock inspection也短期保持Phase542 pinned owner handle：initial child scan未截断且owner valid时，handle跨越同一directory descriptor上的final bounded scan，并在projection前再次读取snapshot、绑定logical path与原file object。Owner replacement或in-place content drift撤销全部owner authority并设置state changed；close failure进入bounded inspection error。该handle仍只存在于单次inspection内，不跨command持久化，也不改变runtime holder与mutation transaction的长期descriptor ownership。

## Phase566 后续加固

Phase566在Phase542 pinned owner的final read完成后重新绑定logical lock leaf与持有中的directory descriptor。该terminal gate防止owner path的intermediate symlink traversal证明了同一owner，却遗漏lock leaf本身已变为symlink或replacement。Pinned owner lifecycle、owner schema、object/content checks和all-path close语义不变。

## Phase567 后续加固

Phase567把owner snapshot前后的directory evidence绑定到open-time full generation。Owner in-place content仍由Phase542 pinned descriptor检测；owner basename replacement或同时发生的其他child mutation则通过directory ctime drift撤销authority。Pinned owner lifecycle和mutation transaction object matching保持不变。
