# Phase553：Host tool audit transactional rotation pre-commit rollback

## 背景

Phase552可在missing current的pre-commit failure后删除本次exclusive-created empty generation，但rotation本身已经在更早阶段提交：runtime先删除旧`<audit>.1`，再把current rename为`.1`，最后创建并写入新current。

运行探针已复现实际损失状态：初始同时存在current与旧`.1`，第二条record触发rotation并在新current partial write后失败。Phase552成功删除empty current后，目录只剩`.1`；该`.1`保存原current，而旧archive已被永久删除。Probe结果为：

```text
current_exists=false
rotated_is_previous_current=true
old_archive_preserved=false
```

Phase553把rotation从“先删除旧archive的立即 mutation”改为跨append保持的generation transaction。旧`.1`先进入同parent内的private staging directory；原current再移动到`.1`。新record完成file-level write/durability后才commit并删除staged archive；任何record pre-commit failure都尝试恢复原current与原`.1`。

## Generation Transaction

Rotation preparation返回内部transaction，而不只返回`missing` expectation。Transaction保持：

- pinned generation parent descriptor；
- original current descriptor与dev/ino identity；
- rotated logical path；
- previous rotated entry是否存在及其no-follow snapshot；
- 可选private staging directory的logical path、basename、descriptor与identity；
- write是否已经成功完成；
- rotation是否已commit或rollback。

Original current handle与staging directory handle跨final append保持，直到commit/rollback与postcondition结束后统一关闭。Public `JsonlAuditAppendExpectation`仍是内部状态，不新增CLI或protocol字段。

## Previous Archive Staging

若`.1`不存在，rotation不创建staging directory。

若`.1`是replaceable non-directory entry：

1. 以generation parent anchor创建0700 private temporary directory，prefix固定为`.god-code-audit-rotation-`；
2. 从actual mutation path no-follow打开并pin该directory；
3. 要求logical directory path与descriptor identity一致且entry set为空；
4. 以no-follow lstat保存旧`.1`的entry type、BigInt dev/ino、mode、nlink、size、mtimeNs和birthtimeNs；
5. 重验parent、旧`.1` snapshot和empty staging directory；
6. 通过shared adapter把`.1` rename到staging directory内固定basename `previous`；
7. 要求logical `.1` missing、staged `previous`仍匹配snapshot且directory entry set精确为单entry。

Directory `.1`继续沿Phase513稳定拒绝，不创建staging。Symlink与其他non-directory entry只移动entry自身，不跟随target。

## Current Rotation

旧archive完成staging后：

1. 重验generation parent；
2. 重验logical current绑定original current descriptor；
3. 要求logical `.1` missing；
4. 从same parent anchor rename current到`.1`；
5. 要求current missing、`.1`绑定original current identity，original handle仍是same regular single-link object。

之后final append按existing Phase548/552流程O_EXCL创建新current。Rotation transaction继续持有original current handle；new current使用独立append handle。

## Commit Ordering

`writeFile(line)`成功后，transaction标记record write completed。Commit顺序为：

1. `data`先完成new current `datasync()`；`full`先完成new current `sync()`；
2. 重验new current logical path、generation parent、`.1`与original current descriptor；
3. 若previous archive已staged，重复验证staging directory exact single-entry set和snapshot；
4. unlink staged `previous`并要求entry missing；
5. `full`在POSIX同步staging directory；
6. 从generation parent rmdir empty staging directory，并证明logical path missing及original directory descriptor `nlink === 0`；
7. `full`在POSIX同步generation parent，覆盖current create、current→`.1`、staging cleanup与最终namespace状态；
8. 执行既有post-write current path gate。

Commit cleanup发生在record bytes与选定file durability成功之后。Commit失败不回滚record或rotation；caller收到failure，并允许staging residue保留旧archive供后续诊断。

## Pre-Commit Rollback

Final append在`writeFile`成功前失败时，caller在append handle完成Phase552 cleanup并关闭后尝试rollback：

1. 重验generation parent；
2. 若original current仍在logical current，说明current rename未提交；否则要求current missing且`.1`绑定original current descriptor，再rename `.1`回current；
3. 要求current重新绑定original descriptor；
4. 若previous archive不存在，要求`.1` missing；
5. 若previous archive已staged，要求`.1` missing、staging directory只含`previous`且snapshot匹配，再rename `previous`回`.1`；
6. 要求`.1`恢复original snapshot、staging directory为空；
7. `full`在POSIX同步staging directory；
8. rmdir staging directory并证明descriptor detached；
9. `full`在POSIX同步generation parent；
10. 标记transaction rolled back。

Rollback仅在current namespace没有未知entry、original current与previous archive均可按identity证明时执行。Replacement、unknown new current、snapshot drift或parent drift均拒绝mutation并保留current、`.1`或staging residue。

Rollback failure不能覆盖original append/pre-write error。Rotation preparation自身在返回transaction前失败时也复用相同rollback逻辑。

## Failure Semantics

- Rotation + failed first write + no previous `.1`：恢复original current，`.1`恢复missing。
- Rotation + failed first write + previous `.1`：恢复original current和previous `.1` exact entry，删除empty staging directory。
- Rotation preparation在archive staging或current rename后失败：尝试恢复pre-rotation generation state。
- Write成功后的file durability failure：不rollback；previous archive仍保留在staging，避免在new record durability未确认前删除。
- Commit cleanup failure：record可能已写入并达到file durability，rotation保持，staging residue保留previous archive。
- Path/parent/snapshot drift：不猜测、不覆盖、不递归删除，传播original failure。
- Process crash可留下`.god-code-audit-rotation-*` private staging residue；本阶段不自动扫描或恢复crash residue。

## Tests

- 无previous `.1`的post-rotation partial append failure恢复original current且`.1` missing。
- 有previous `.1`的同类failure恢复current与old archive exact contents。
- Successful rotation有previous `.1`时commit删除staged old archive，current与`.1`分别为new/previous-current。
- Stable pre-write failure同样rollback完整rotation。
- Rotation preparation在previous archive已staged后失败时恢复old `.1`。
- Descriptor-relative Linux path覆盖staging mkdir/open、两次rename、commit unlink/rmdir与rollback rename。
- Moved/replaced current、rotated或staging entry使rollback/commit拒绝未知mutation并保留evidence。
- Buffered/data/full ordering、parent sync、existing append、capacity、Phase551 rollback和Phase552 cleanup tests保持。

## 边界

- 不回滚`writeFile`成功后的record、rotation或durability failure。
- Crash residue inspection/recovery留给后续maintenance阶段。
- Staged symlink/other entry按opaque directory entry处理，不读取target或内容。
- Shared adapter仍受fallback path syscall窗口限制；不存在portable kernel compare-and-rename。
- Non-cooperative writer可制造拒绝和residue，但不应导致runtime覆盖无法证明ownership的entry。
- 不新增CLI、environment、JSON-RPC、report或persistent metadata字段。

## 验收标准

- Pre-commit rotation failure不再丢失旧`.1`。
- Safe rollback恢复pre-rotation current/rotated namespace和contents。
- Successful rotation最终仍只保留current与单个`.1`，无staging directory。
- Previous archive只在new record完成选定file durability后删除。
- Commit/rollback全部使用pinned directories与descriptor/snapshot postconditions。
- Original pre-commit error优先于rollback error。
- Post-write failure不被错误回滚。
- Public interfaces与inspect-path schema保持不变。
- 定向audit、TypeScript build、Python、TypeScript、built integration和CLI smoke全部通过。
- 无正常路径staging residue、FileHandle GC warning或workspace补丁残留。

## 实现结果

- 旧runtime probe稳定复现损失：post-rotation partial append failure后目录只剩`audit.jsonl.1`，`current_exists=false`、`.1`为previous current且`old_archive_preserved=false`。
- 新runtime probe在同一场景中得到`current_restored=true`、`archive_restored=true`，目录精确恢复为`audit.jsonl`与`audit.jsonl.1`。
- 新增内部`JsonlAuditAppendTransaction`、`JsonlAuditRotationTransaction`、pinned temporary mutation directory与BigInt rotation entry snapshot；original current和staging directory handles跨append、commit或rollback保持。
- Rotation不再direct unlink logical `.1`。Existing replaceable entry通过shared adapter进入same-parent `.god-code-audit-rotation-*` 0700 directory的`previous` entry，随后current才rename为`.1`；directory、entry set、snapshot和current descriptor均执行前后postcondition。
- `appendAuditLine`在write成功后标记transaction committed-to-record，按buffered/data/full先完成selected file durability，再调用rotation commit。Commit验证new current、original current at `.1`和staged snapshot，unlink previous、同步full staging directory、rmdir wrapper，最终full parent sync继续覆盖namespace。
- Pre-commit append或rotation preparation failure调用rotation rollback：若original current位于`.1`则恢复current，再按snapshot把staged previous恢复到`.1`；unknown current/rotated/staging或parent drift拒绝mutation，rollback error不覆盖original failure。
- 升级三项既有rotation测试并新增六项测试，覆盖previous archive完整恢复、stable pre-write rollback、staged-archive preparation failure恢复、post-write commit failure residue、data durability前archive保留，以及rotated symlink opaque staging/no-follow target。
- Descriptor-relative测试证明staging mkdtemp、previous/current rename、commit unlink与wrapper rmdir均通过validated procfd paths；parent replacement只影响original anchored tree并保留staging evidence，不写入replacement objects。
- 定向audit回归通过：`audit.test.ts` 137项、`cliAudit.test.ts` 45项，共182项；TypeScript build通过。
- 统一验收通过：Python 422项；TypeScript 43个test files、696项；TypeScript build、built CLI integration和CLI smoke全部通过。
- Rotation transaction types/helpers保持module-private，CLI、environment、JSON-RPC、inspect-path/report和persistent metadata接口未变化；source没有direct `fs.unlink`/`fs.rm`/`fs.rename`/`fs.mkdir`/`fs.mkdtemp` namespace mutation。
- `/tmp`下无`god-code-audit-*`、`god-code-phase553-probe-*`或`.god-code-audit-rotation-*`残留，workspace无staging directory及`.tmp`、`.bak`、`.orig`或`.rej`文件，验收输出中无FileHandle GC warning。

## Phase554 后续加固

Phase554关闭本阶段anonymous staging attribution边界。New runtime transaction使用absolute audit target SHA-256前32 hex派生same-parent prefix；bounded list只返回当前target exact suffix，exact-ID direct inspector不扫描parent。Legacy Phase553 names仅计数告警，不能据此恢复或删除；本阶段transaction-held descriptors仍是runtime commit/rollback的唯一authority。

## Phase555 后续加固

Phase555只对Phase554 target-bound selected residue建立read-only recovery graph。Current、`.1`、staging root、optional `previous`和coordination lock必须稳定；commit cleanup failure留下的`previous_only + current + .1`被明确判为ambiguous且无fingerprint，commit已删除previous但wrapper rmdir失败留下的exact-empty staging可获得cleanup-only fingerprint。该readiness不改变Phase553 live transaction的descriptor authority，也不自动提交、回滚或删除任何residue。

## Phase556 后续加固

Phase556只对Phase555已分类的三类safe residue执行显式maintenance。Empty commit residue可descriptor-backed收缩；current-only加staged previous可恢复archive；missing current加rotated original current与staged previous可按Phase553 rollback顺序恢复两代generation。Mutation重新取得normal lock并建立新的descriptor authority，不继承crashed process handles；current与`.1`并存的post-commit previous residue仍保持ambiguous且不自动删除。Recovery generation commit后沿用本阶段原则，不因wrapper cleanup或durability failure反向撤销已恢复namespace。

## Phase563 后续加固

Phase563将本阶段temporary staging的exact empty/single-`previous` assertions改为descriptor-bound bounded scanner。Scanner最多保留2个child names并读取一个sentinel；overflow state在rename、unlink或rmdir前拒绝，不再因损坏staging规模产生无界`readdir`物化。正常transaction action、rollback顺序和commit边界保持不变，overflow entries不会被忽略或自动删除。
