# Phase544：Host tool audit descriptor-backed mutation detachment proof

## 背景

Phase539至Phase543已经让empty cleanup、owner cleanup、recovery和runtime owner lifecycle在mutation期间持续持有selected filesystem object descriptors。现有gate能够在`unlink`或`rmdir`前证明current path仍指向原对象，但大多数调用在path-based syscall返回成功后立即设置`committed`或`removed`。

这仍缺少一个关键postcondition：syscall成功不等于原descriptor固定的对象已经脱链。若current entry在最后一次validation和syscall之间被替换，path-based mutation可能删除replacement并返回成功，而original object已被rename到其他位置。

Phase541 recovery rollback已经在path missing时用open directory descriptor的`nlink === 0`区分“原reservation确实被rmdir”和“原reservation只被移动”。Phase544把该证明推广到所有已有descriptor的owner unlink和directory rmdir提交点，并把runtime lock directory descriptor纳入Phase543 lifecycle。

## Detachment Proof Contract

Owner file unlink只有同时满足以下条件才算original owner removed：

- mutation target path当前为missing；
- original owner handle仍指向regular file；
- descriptor dev/ino仍匹配selection/acquisition object；
- descriptor `nlink === 0`。

Directory rmdir只有同时满足以下条件才算original directory removed：

- mutation target path当前为missing；
- original directory handle仍指向directory；
- descriptor dev/ino仍匹配selection/acquisition object；
- descriptor `nlink === 0`。

Timestamp不参与post-unlink identity equality，因为unlink/rmdir本身可以合法改变ctime。Object continuity继续由open handle和device/inode固定。

## Runtime Directory Lifecycle

Runtime acquisition在创建lock directory后立即通过no-follow `O_DIRECTORY`打开并固定该directory。Handle与Phase543 owner handle共同跨越完整hold周期：

- acquisition final layout validation；
- release owner validation和unlink；
- empty-directory validation和rmdir；
- failed release retry；
- explicit abandon；
- failed acquisition cleanup。

`release()`在owner unlink后要求owner detachment proof，在lock rmdir后要求directory detachment proof，两个postcondition都通过后才进入`released`。`abandon()`关闭owner和directory handles但不修改filesystem。

## Mutation Coverage

Detachment proof接入：

- runtime lock release；
- failed runtime acquisition cleanup；
- main lock cleanup的quarantined lock directory与owner file；
- owner-only quarantine cleanup的selected directory与isolated owner；
- owner-only disposal cleanup的owner commit与directory contraction；
- empty quarantine cleanup；
- empty disposal cleanup；
- recovery rollback reservation rmdir；
- recovery post-commit nested/root contraction。

Transaction-created private quarantine/disposal wrapper roots当前没有独立descriptor，仍按既有0700 same-user boundary处理；本阶段不伪造不存在的object proof。

## Failure Semantics

- Pre-commit detachment proof失败按state drift处理，不设置commit marker，并进入既有rollback/error路径。
- Owner unlink是commit point的transaction，只有owner descriptor证明`nlink === 0`后才设置committed。
- Post-commit directory proof失败沿用既有residual result，不递归查找被移动对象。
- Runtime release proof失败保持非released状态；调用方可检查、重试或显式abandon。
- Failed acquisition cleanup吞掉cleanup error以保留原始acquisition failure，但必须关闭所有已取得handles。
- Proof失败不把path missing解释为成功，也不根据PID、age、token或fingerprint猜测对象位置。

## Tests

测试使用受控`fs.unlink`/`fs.rmdir`替身模拟“syscall返回成功，但先移动original并删除同path replacement”：

- Runtime release拒绝wrong-object owner unlink success，并保留original owner object。
- Empty quarantine/disposal cleanup拒绝wrong-object directory rmdir success。
- Owner-only disposal cleanup不把wrong-object owner unlink标记为commit。
- Runtime正常release及release/abandon lifecycle继续通过。
- Main/quarantine/disposal cleanup和recovery正常/rollback/residual测试保持。
- TypeScript、Python、built integration和CLI smoke全量回归通过。

## 边界

- Postcondition能检测wrong-object mutation，但不能撤销已经删除的replacement；它不是kernel atomicity。
- 最终validation与path-based syscall之间的用户态竞态仍存在。彻底预防需要dir-relative `unlinkat`/`renameat2`或等价native capability。
- 本阶段不引入native addon、child helper、FFI或平台专用binary。
- 不改变owner schema、fingerprint、CLI flags、JSON report或JSON-RPC protocol。
- 不递归搜索被rename到未知path的original object。
- Windows/open-handle deletion语义继续由Node和filesystem sharing behavior决定；统一CI必须证明兼容。

## 验收标准

- 所有已有owner descriptor的unlink提交点在承认removed/committed前证明original file `nlink === 0`且target path missing。
- 所有已有directory descriptor的rmdir提交点在承认removed/contraction前证明original directory `nlink === 0`且target path missing。
- Runtime lock从acquisition起持有owner和directory两个handles，并在release/abandon/failed acquisition所有路径关闭。
- Wrong-object fake-success mutation不会被报告为成功提交。
- Phase529至Phase543 public interfaces与既有rollback/residual contract保持，除内部`JsonlAuditFileLock`继续使用已有`abandon()`外不新增API。
- 全量统一验收通过且无FileHandle GC warning、audit temp residue或未关闭descriptor。

## 实现结果

- 新增shared owner-file与directory detachment proof helpers；两者在descriptor stat前后要求target path missing，并核对original dev/ino与`nlink === 0`。
- Runtime acquisition在mkdir后立即pin lock directory。Lock lifecycle现在同时管理owner与directory handles，release在两个postcondition通过后才进入released，abandon和failed acquisition cleanup统一关闭两条object edges。
- Main lock cleanup、owner-only quarantine cleanup、owner-only disposal cleanup、empty quarantine/disposal cleanup全部在对应unlink/rmdir后执行detachment proof。
- Recovery rollback reservation与post-commit nested/root contraction复用同一directory proof；原有missing-path rollback判断不再只依赖path absence。
- Owner-only disposal的`committed` marker移动到owner unlink proof之后；wrong-object unlink不会进入post-commit residual分支。
- 新增runtime owner wrong-object unlink、runtime directory wrong-object rmdir、disposal owner wrong-object unlink和empty quarantine wrong-object rmdir四项fake-success测试。
- 测试resource teardown覆盖故意保留的异常runtime lock path；定向audit回归通过：2个test files、135项，无FileHandle GC warning或temp residue。

## Phase550 后续加固

Phase550把本阶段owner detachment proof复用于metadata persistence尚未完成的`created_pending` file。Failed acquisition cleanup在不解析partial JSON的情况下先绑定logical owner path与original descriptor，unlink后再要求path missing、same dev/ino regular-file handle和`nlink === 0`；replacement或extra entry继续拒绝并保留residue。
- 统一验收通过：Python 422项；TypeScript 43个test files、649项；TypeScript build、built CLI integration和CLI smoke全部通过。
- `/tmp`下无`god-code-audit-*`临时残留，workspace无`.tmp`、`.bak`、`.orig`或`.rej`文件。

## Phase545 后续

Phase545把本阶段明确保留的两类private transaction wrapper roots纳入descriptor graph。Main cleanup quarantine root与owner-only quarantine cleanup disposal root在`mkdtemp`后立即pin original directory，按exact child entry set约束transaction，并在rollback/final rmdir复用本阶段的directory detachment proof。Wrong-object wrapper removal通过拒绝或既有residual path暴露；native dir-relative mutation仍是后续边界。

## Phase546 后续

Phase546在不引入native addon的前提下实现第一段dir-relative parent anchoring：Linux验证`/proc/self/fd/<fd>`后，把Phase545两个private transaction的parent lookup绑定到open directory handles；fallback继续使用本阶段postcondition。该能力不原子比较leaf inode，因此owner/directory detachment proof仍是所有commit/contraction的必要条件。

## Phase547 后续

Phase547把同一parent anchoring扩展到runtime、empty cleanup、owner-only disposal与recovery。所有exact mkdir、rename、unlink和rmdir虽然从open parent解析child，仍不能原子比较leaf inode；本阶段owner/directory detachment proof继续是release、removed、rollback与contraction结果成立的必要条件。
