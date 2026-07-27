# Phase521 Host Tool Audit Full-Durability Parent Metadata Sync

## 状态

代码、测试与文档已完成。

## 审计结论

Phase520的full policy对current FileHandle执行fsync，但首次创建和rotation还修改parent directory中的entry集合。只同步文件不能保证create、旧`.1`删除、current rename到`.1`以及新current create等metadata在故障后可见。Existing append不改变directory metadata，不需要额外目录同步。

## 目标

- POSIX full policy覆盖current-entry metadata durability。
- File fsync先于parent directory fsync。
- 只在本次pipeline创建current entry时同步parent。
- 覆盖首次创建、并发删除后重建和rotation后新建。
- Existing append不增加directory open/sync成本。
- Parent open使用no-follow和directory-only flags。
- Parent descriptor执行directory type验证。
- Directory sync failure沿record Promise传播。
- 明确Windows portable directory sync边界。
- Buffered/data policy保持Phase520语义。

## Metadata Mutation Signal

Phase518的append expectation已准确描述final current path状态：

- `existing`：current entry保持存在，final append不创建directory entry。
- `missing`：final append通过O_EXCL创建current entry；若此前发生rotation，同一serialized pipeline还完成了旧`.1`删除和current到`.1` rename。

因此full policy只需在`expectation.kind === "missing"`时同步parent，不需要新增并行状态变量。

## POSIX Sync Ordering

Final append成功后：

1. `handle.sync()`持久化current file content/metadata。
2. `syncAuditParentDirectory(filePath)`打开parent。
3. Parent FileHandle fstat必须为directory。
4. `parentHandle.sync()`持久化最终entry state。
5. 两个descriptor均通过finally关闭。

Directory open flags按平台常量可用性组合：

```text
O_RDONLY | O_NOFOLLOW | O_DIRECTORY
```

No-follow避免最终parent entry在open时被symlink替换；O_DIRECTORY和fstat形成双重type gate。

## Existing Append

Existing full append只调用current file sync。它不打开或sync parent directory，因为append、chmod和size更新属于file inode状态，不新增、删除或rename directory entry。测试通过捕获所有sync descriptor path证明只有current file被同步。

## Rotation

Rotation pipeline先删除旧`.1`、rename current为`.1`，然后exclusive-create并write新current。Full policy在新current fsync后同步parent一次；该次sync覆盖pipeline完成后的最终directory state，而不是为每个中间mutation分别sync。

## Failure Semantics

Parent sync失败发生在record write和current file fsync之后。Record Promise拒绝并沿Phase499转为audit warning，但不能回滚已写current或rotation metadata。Failure表示最终directory metadata durability未确认，不表示record一定不存在。

## Platform Boundary

POSIX支持以read-only directory FileHandle执行fsync。Windows Node.js没有等价portable directory-open/fsync contract，因此当前full policy在Windows只同步current file。Diagnostics仍报告full policy；README和security文档明确平台差异，不伪造目录持久性保证。

## 验收标准

- POSIX missing/full调用current sync和parent sync各一次。
- Existing/full只调用current sync。
- Rotation/full同步new current和parent最终状态。
- Buffered/data不调用parent sync。
- Parent open使用no-follow/directory-only available flags。
- Parent sync failure拒绝record Promise但written current可存在。
- Windows full不尝试directory sync。
- Existing durability、rotation、path和capacity tests保持。
- TypeScript、Python和integration全量回归通过。

## 实现结果

- 新增`syncAuditParentDirectory`。
- Full/missing append在file sync后调用parent sync。
- Parent descriptor新增directory fstat gate和finally close。
- Tests覆盖first create、existing append、rotation和directory sync failure。
- Audit env example、README、SECURITY、protocol、architecture和extension docs同步metadata durability边界。

## Phase548 加固

Phase548在generation transaction开始时pin immediate parent，并在POSIX full直接sync该handle。Metadata sync前继续验证logical parent path、inspection identity和descriptor identity，不再重新按path打开可能已替换的directory；既有post-write failure semantics保持。

## Phase552 后续加固

Phase552在successful exclusive pre-commit cleanup后，以本阶段同一POSIX full policy同步pinned parent deletion metadata。该sync属于best-effort cleanup且不能覆盖original append/pre-write error；write已经成功后由本阶段产生的file或parent sync failure仍不删除current。

## Phase553 后续加固

Phase553把rotation namespace commit排在new current file sync之后。若previous archive被staged，full policy先sync staging directory的empty state，再rmdir wrapper，最后复用本阶段pinned generation parent sync覆盖最终current、`.1`与staging deletion；pre-commit rollback也同步恢复后的namespace。File或commit failure仍不回滚successful write。

## Phase554 后续加固

Phase554只改变new staging basename derivation并增加read-only inspection，不改变data/full ordering。Inspector不会sync、创建或修改namespace；runtime成功commit和pre-commit rollback继续复用本阶段的file/directory durability边界。
