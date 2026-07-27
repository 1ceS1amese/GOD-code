# Phase552：Host tool audit exclusive generation pre-commit cleanup

## 背景

Phase551在`writeFile(line)` rejection后，可把same current descriptor上的bounded partial suffix truncate回pre-write size。Existing generation因此恢复exact baseline；missing generation则恢复成size 0，但本次`O_CREAT | O_EXCL`创建的`audit.jsonl` entry仍会保留。

现有runtime test稳定证明该状态：首次record注入partial write failure后，record Promise以original write error拒绝，而`fs.stat(filePath).size === 0`。文件不含敏感record bytes，但failed operation仍改变了generation namespace；rotation后同类failure还会形成`.1`存在、current为空的中间状态。

Phase552为exclusive-created current增加pre-commit cleanup。只有本次transaction拥有missing-to-created转换、record write尚未成功、current已确认恢复为空、logical path与pinned descriptor仍绑定same object时，runtime才通过pinned parent执行descriptor-relative unlink并证明descriptor detached。Existing generation以及成功write后的durability/post-write failure保持原语义。

## Transaction State

Final append在内部记录以下状态：

- `expectation.kind === "missing"`：本次open使用`O_CREAT | O_EXCL`，transaction拥有entry creation；
- validated descriptor identity；
- initial descriptor size；
- record write是否已经开始；
- `writeFile`是否成功返回；
- failed write rollback是否确认descriptor恢复到pre-write bytes。

Exclusive cleanup只属于pre-commit failure：

1. `writeFile`尚未开始，且validated creation baseline为0；或
2. `writeFile`已reject，Phase551 rollback确认same descriptor恢复到0。

一旦`writeFile`成功返回，即使后续`datasync`、`sync`、parent metadata sync或post-write path gate失败，也禁止删除current，因为完整record可能已经存在。

## Cleanup Eligibility

清理必须同时满足：

1. append expectation为`missing`；
2. O_EXCL descriptor已经完成regular-file identity validation；
3. initial size为0；
4. record write未成功；
5. 若write已经开始，则bounded rollback明确返回restored；
6. current descriptor仍是same dev/ino regular file、size 0且`nlink === 1`；
7. logical current path仍是single-link regular file并绑定same descriptor；
8. pinned parent descriptor与expected parent identity保持一致。

任一条件不能证明时都保留filesystem state。Runtime不依据basename、size 0或path存在单独推断ownership，也不删除existing empty generation。

## Descriptor-Relative Cleanup

Eligible cleanup执行：

1. 重验pinned parent descriptor/path/descriptor identity；
2. 重验current handle为same identity、size 0、single-link regular file；
3. 重验logical current path绑定same object；
4. 通过shared directory mutation adapter从pinned parent unlink exact current basename；
5. 要求logical current path missing；
6. 重新fstat original handle，要求same dev/ino、regular file、size 0且`nlink === 0`；
7. `full` durability在POSIX同步pinned parent directory metadata；`buffered`和`data`不新增parent sync。

Handle仍由outer final append `finally`关闭。Cleanup helper的任何failure都不能覆盖触发本次pre-commit failure的original error。

## Failure Semantics

- Missing create + pre-write failure + stable empty object：删除本次创建的current entry，传播original error。
- Missing create + zero-growth write rejection：删除本次创建的current entry，传播original write error。
- Missing create + bounded partial write rejection + truncate成功：删除恢复为空的current entry，传播original write error。
- Missing create + rollback失败、unknown growth、path/parent drift或link-state drift：不unlink，传播original error。
- Existing generation write rejection：仅执行Phase551 bounded truncate，不删除generation。
- Write成功后的durability、parent sync或post-write failure：不进入exclusive cleanup。
- Rotation已完成后append失败：不反向rename `.1`；若exclusive cleanup成功，current保持missing。

## Tests

- 首次partial append failure后current path恢复missing，后续record可重新exclusive-create并形成单一合法JSONL line。
- 首次zero-growth write rejection同样删除empty current。
- Stable pre-write failure在write调用前删除本次创建的empty current。
- Current被rename/replacement或出现unknown growth时拒绝unlink任何不确定对象。
- Rotation后missing append failure保留`.1`原generation并删除empty current，不执行unrotation。
- Full durability成功cleanup同步parent；buffered/data不新增parent metadata sync。
- Existing generation rollback、successful write后的failure、capacity、rotation和descriptor-relative mutation tests保持。

## 边界

- 不回滚已经完成的rotation，不恢复已删除的旧`.1`。
- 不删除existing empty generation。
- 不删除包含任何未归因bytes的exclusive-created generation。
- Shared adapter在Linux使用validated procfd parent；fallback仍存在最后一次path gate到unlink syscall之间的平台窗口。
- 不提供kernel-level compare-and-unlink、file lease或non-cooperative writer原子性。
- 不新增CLI、environment、JSON-RPC、report或persistent metadata字段。

## 验收标准

- Failed first append不再留下empty current entry。
- Cleanup只发生在owned exclusive creation和pre-commit empty state。
- Existing generation与post-write failure永不被本阶段删除。
- Path replacement、unknown growth和rollback uncertainty保持原对象/bytes。
- Original failure始终优先于cleanup failure。
- Full durability cleanup覆盖parent metadata sync。
- 后续record可从missing current恢复正常写入。
- 定向audit、TypeScript build、Python、TypeScript、built integration和CLI smoke全部通过。
- 无FileHandle GC warning、audit临时残留或workspace补丁残留。

## 实现结果

- Phase551基线测试稳定证明首次partial append failure后logical current仍存在且size为0；Phase552将该断言升级为`ENOENT`，随后record可重新O_EXCL创建并形成单一合法JSONL line。
- `appendAuditLine`新增exclusive zero baseline、write-started、write-completed和failed-write-restored内部状态；只有missing expectation、initial size 0与pre-commit restored proof同时成立时才尝试entry cleanup。
- `rollbackFailedAuditLineWrite`现在返回same-object restored boolean；zero growth经path identity确认后返回true，bounded positive growth仍按Phase551执行truncate与data/full file sync，unsafe state返回false。
- 新增`cleanupFailedExclusiveAuditGeneration`与`assertEmptyAuditFilePathIdentity`。Cleanup重复执行parent和descriptor/path/descriptor gate，通过shared directory mutation adapter unlink current basename，并验证logical missing、same dev/ino regular handle、size 0和`nlink === 0`；POSIX full复用pinned parent handle同步deletion metadata。
- 升级一项existing missing-append test并新增五项测试，覆盖descriptor-relative unlink与后续恢复、zero-growth三种durability、stable pre-write mode failure、moved/replaced current保留、beyond-bound growth保留，以及post-rotation current cleanup/`.1`保留。
- Phase524 parent-replacement test增加一次cleanup revalidation observation；replacement parent仍为空，moved original仍保留empty file，证明无法绑定logical parent时不会删除。
- 定向audit回归通过：`audit.test.ts` 131项、`cliAudit.test.ts` 45项，共176项；TypeScript build通过。
- 统一验收通过：Python 422项；TypeScript 43个test files、690项；TypeScript build、built CLI integration和CLI smoke全部通过。
- 新helpers保持module-private，CLI、JSON-RPC、report、environment和persistent metadata接口未变化；source没有新增direct `fs.unlink`/`fs.rm`/`fs.rename`/`fs.mkdir`/`fs.mkdtemp` namespace mutation。
- `/tmp`下无`god-code-audit-*`或`god-code-phase552-probe-*`残留，workspace无`.tmp`、`.bak`、`.orig`或`.rej`文件，验收输出中无FileHandle GC warning。

## Phase553 后续加固

Phase553在本阶段成功删除exclusive-created empty current后继续执行rotation rollback：若original current仍由`.1`与retained descriptor证明，则恢复current；若previous archive已进入private staging，则按snapshot恢复`.1`。本阶段existing/unknown-growth/path-drift cleanup refusal仍会阻止rotation rollback覆盖未知current entry。

## Phase554 后续加固

Phase554不改变本阶段cleanup或rotation rollback顺序，只把新private staging目录绑定到target hash并提供只读snapshot。Inspector输出不能替代Phase552/553 transaction内持有的descriptor ownership，也不授权对crash residue执行cleanup。
