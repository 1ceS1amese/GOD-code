# Phase536：Host tool audit guarded empty disposal cleanup

## 背景

Phase535把owner unlink定义为owner-only disposal cleanup的提交点。若提交后出现extra state、source quarantine race或rmdir failure，Phase534可能重新发现一个没有owner metadata的`empty` disposal。该状态不能继续使用`--expect-owner`，也不能因为目录为空就自动删除。

Phase536新增独立命令：

```text
god-code audit cleanup-empty-lock-disposal <quarantine-id> <disposal-id> [--dry-run|--yes --expect-disposal <fingerprint>] [--json]
```

该命令只删除exact empty、source-quarantine-absent disposal directory。

## Selection Contract

两个ID都必须为六字符ASCII alphanumeric。Runtime重新派生：

```text
<derived-lock-path>.cleanup-<quarantine-id>.dispose-<disposal-id>
```

CLI不接受任意path，也不复用owner-only cleanup的confirmation flags。

## Empty Directory Fingerprint

Empty disposal没有owner token，因此Phase536使用独立的32字符non-secret directory fingerprint。Fingerprint输入包括：

- domain separator；
- absolute disposal path；
- directory device；
- directory inode；
- nanosecond ctime；
- nanosecond birthtime。

概念形式：

```text
sha256(
  "god-code-audit-empty-disposal\0"
  + absolute_path + "\0"
  + dev + "\0"
  + ino + "\0"
  + ctime_ns + "\0"
  + birthtime_ns
)[0:32]
```

Fingerprint不是authentication secret，只把operator确认绑定到当前path上的当前directory object。Directory内容变化、replacement、chmod或大多数inode reuse场景会改变identity/ctime并使confirmation失效。

## Eligibility

候选必须同时满足：

- disposal path存在且为directory；
- exact layout为`empty`；
- root entry count为0；
- source quarantine path不存在；
- BigInt no-follow lstat确认dev/inode/ctimeNs/birthtimeNs；
- dry-run或mutation重验期间directory identity和empty invariant保持；
- expected disposal fingerprint exact match。

以下状态全部拒绝：

- `owner_only`
- `unknown`
- source quarantine存在
- regular file、symbolic link或other blocker
- directory replacement或内容漂移
- fingerprint mismatch

## Confirmation

默认dry-run输出：

- quarantine ID/path与source absence；
- disposal ID/path/layout；
- 32字符`empty_directory_fingerprint`；
- `confirmation_required: true`；
- `liveness_verified: false`；
- `removed: false`。

真实删除必须同时提供：

```text
--yes --expect-disposal <fingerprint>
```

错误fingerprint返回error且不回显当前正确fingerprint。

## Removal Transaction

`cleanupJsonlAuditEmptyLockDisposal`只执行一个mutation：

1. 读取source-absent exact-empty candidate。
2. 以no-follow directory handle绑定path与原directory object。
3. 捕获BigInt directory identity并计算fingerprint。
4. 验证expected fingerprint。
5. Mutation前在原handle保持open时再次验证source absence、path/descriptor identity和empty invariant。
6. 对selected disposal path执行rmdir，随后关闭descriptor。

成功rmdir即为commit。由于candidate必须为空，不需要owner rollback、private quarantine或purge namespace。

## Failure Semantics

- rmdir前任何failure都不删除对象。
- Source quarantine race、extra entry、replacement和fingerprint drift均返回error。
- `ENOTEMPTY`、`ENOENT`或`ENOTDIR`统一视为state change，不递归清理。
- Active coordination lock和其他disposal entry不修改。
- 命令没有post-commit residual状态：rmdir成功时selected directory已经消失，失败时目录保持或由外部race改变。

## CLI Safety

- 默认dry-run。
- `--dry-run`与`--yes`互斥。
- `--expect-disposal`必须与`--yes`同时出现。
- `--expect-owner`不被该命令接受。
- 两个ID必须为六字符ASCII alphanumeric。
- Fingerprint必须为32字符lowercase hex。
- Invalid config或disabled persistence拒绝mutation。
- PID、age、source absence和directory fingerprint都不证明进程liveness。
- Human/JSON输出不包含owner token或raw filesystem metadata identity。

## Tests

- Phase534 inspection为empty disposal输出稳定fingerprint。
- Valid source-absent empty disposal按exact fingerprint删除。
- Wrong fingerprint保留directory且不泄露正确fingerprint。
- Source quarantine existing/race拒绝删除。
- Extra entry race和directory replacement拒绝并保留新状态。
- Owner-only、unknown和non-directory state均被CLI拒绝。
- Built CLI integration验证inspection -> dry-run -> wrong fingerprint -> confirmed cleanup。

## 边界

- 本阶段不清理unknown disposal。
- 本阶段不删除owner metadata。
- 本阶段不批量扫描后自动清理。
- 本阶段不根据age或PID判断stale。
- Fingerprint不能阻止same-user制造拒绝服务，但会把mutation限制到operator确认的directory snapshot。

## 验收标准

- 只有source-absent exact-empty disposal可进入confirmation。
- Fingerprint绑定absolute path与BigInt dev/inode/ctime/birthtime identity。
- Mutation前重新验证identity、empty invariant和source absence。
- Race drift不删除unknown或replacement entry。
- CLI不接受owner fingerprint作为empty cleanup authority。
- Phase530至Phase535行为与接口保持。
- TypeScript、Python和integration全量回归通过。

## 实现结果

- Phase534 disposal inspection为exact empty directory新增non-secret fingerprint projection。
- 新增BigInt dev/inode/ctimeNs/birthtimeNs snapshot、identity comparison和fingerprint helper。
- Phase539将identity helper泛化并增加open directory descriptor pinning，防止快速replacement触发inode/timestamp reuse误判；disposal fingerprint domain和CLI contract保持不变。
- 新增`cleanupJsonlAuditEmptyLockDisposal` exact-empty rmdir transaction。
- 新增`audit cleanup-empty-lock-disposal` human/JSON CLI及独立`--expect-disposal` parser。
- Tests覆盖success、mismatch、source presence、extra entry和directory replacement race。
- Integration覆盖inspection -> dry-run -> wrong fingerprint -> confirmed cleanup完整流程。
- README、SECURITY、protocol、architecture、internal design、project plan和extension docs同步Phase536边界。

## Phase544 加固

Phase544在empty disposal `rmdir`返回后要求target path missing、original open directory descriptor dev/ino一致且`nlink === 0`。Wrong-object fake-success mutation因此不会被报告为removed，fingerprint domain和CLI contract不变。

## Phase547 加固

Phase547在candidate descriptor之外持续持有immediate-parent handle，并从该parent anchor解析exact disposal basename执行rmdir。Procfd unavailable时回退到validated logical path；Phase536 fingerprint、source-absence gate、single commit和detachment proof保持。

## Phase568 加固

Phase568把共享empty-directory opener的logical path gates切换为open-time full generation matching。Initial/final exact-empty scans之间或path binding期间发生的child、metadata、symlink或replacement drift不能产生empty disposal fingerprint，也不能成为cleanup candidate。Source-absence、parent anchor、confirmed rmdir和detachment proof保持不变。

## Phase569 加固

Phase569在empty disposal fingerprint完成后增加terminal source quarantine absence check。Source若在initial correlation之后重新出现，dry-run清除empty fingerprint和confirmation、更新source state并拒绝rmdir；late source目录不扫描。Phase536 confirmed cleanup仍独立重验source absence、empty identity、parent anchor和detachment proof。

## Phase572 加固

Phase572把empty disposal的`disposal_fingerprint_matches: true`与`empty_directory_fingerprint`延迟到runtime existing result返回exact expected disposal fingerprint之后。Preflight match后的replacement rejection和selection前missing均不再投影旧positive evidence；preflight mismatch仍显式为`false`。Exact-empty identity、source absence、parent-anchored rmdir和detachment proof保持不变。

## Phase575 投影边界修正

Phase575在empty disposal runtime candidate missing时撤销preflight empty structure/state与source quarantine state，只保留paths/IDs、`disposal_exists: false`和`removed: false`。Runtime missing fast path未重新观察source，late source appearance不再与旧`source_quarantine_exists: false`冲突；Phase536 existing exact-empty deletion contract保持。

## Phase576 descriptor finalization 加固

Phase576让exact-empty disposal rmdir成功后的result在candidate与parent descriptor close失败时仍保持`removed:true`、runtime-confirmed empty fingerprint和terminal selected absence。Stable close投影true，secondary failure投影false加bounded warning并使CLI返回WARN；source-absence、identity-bound rmdir、detachment proof及missing branch保持。

## Phase577 rejection lifecycle 加固

Phase577让empty-disposal fingerprint mismatch及pre-rmdir primary error在candidate/parent descriptor finalization后形成typed rejection。Close failure不再替换primary message，CLI ERROR复用cleanup lifecycle fields；source absence、exact-empty identity、rmdir与missing semantics保持。
