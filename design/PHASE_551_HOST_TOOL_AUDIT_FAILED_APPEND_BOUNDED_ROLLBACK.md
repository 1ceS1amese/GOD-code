# Phase551：Host tool audit failed append bounded rollback

## 背景

Phase526在record write和durability完成后重验current path identity，并明确post-write validation failure可能已经留下完整record。该语义适用于`datasync`、`fsync`、parent sync或最终path gate失败，不能笼统回滚。

但`FileHandle.writeFile(line)`自身拒绝时存在不同问题：底层可能已经追加部分bytes。Current实现直接关闭handle并传播error，因此JSONL末尾会永久保留截断JSON；后续合法record继续append后，日志仍无法逐行解析。

Runtime probe已复现：existing current为307 bytes时，注入append先写入`{"partial":`再抛错，record Promise拒绝，但current增长到318 bytes并保留11-byte invalid suffix。

Phase551仅处理`writeFile` rejection，在same current descriptor上执行有界、对象绑定的best-effort truncate rollback。Durability failure和post-write identity failure继续沿用Phase520/526既有“record可能已存在”语义。

## Rollback Eligibility

Append前已经拥有：

- current descriptor；
- descriptor dev/ino；
- final pre-write size；
- exact UTF-8 `lineBytes`；
- logical current path；
- active coordination lock与pinned parent。

`writeFile`抛错后，rollback只有同时满足以下条件才可执行：

1. current handle仍是regular single-link file；
2. descriptor dev/ino仍等于pre-write identity；
3. current size严格大于pre-write size；
4. current size不超过`preWriteBytes + lineBytes`；
5. logical current path仍是regular single-link且绑定same descriptor identity；
6. size arithmetic保持safe integer。

Size等于pre-write size表示没有观察到partial append，不执行truncate。Size小于原值、超出单条record上界或path identity drift都视为存在外部/未知mutation，禁止rollback。

## Rollback Transaction

Eligible rollback执行：

1. 再次绑定logical path与descriptor identity；
2. `handle.truncate(preWriteBytes)`；
3. `data` policy对truncate执行`datasync()`，`full` policy执行`sync()`，`buffered`不主动sync；
4. 重新fstat，要求regular、single-link、same dev/ino且size精确恢复；
5. 再次绑定logical path identity。

Rollback不删除newly-created current entry；missing-generation write failure成功回滚后允许留下合法empty 0600 current。下一条record可按existing generation正常append。

Rollback helper的任何failure都不能覆盖original write error。Caller仍收到原始`writeFile` rejection；helper没有新增public result字段。实现不声称在rollback失败时日志一定完整。

## Concurrency Boundary

Cooperative writers仍由process tail和filesystem coordination lock串行，因此`preWriteBytes + lineBytes`是本transaction可解释的最大size。Non-cooperative writer可绕过lock；若观察到size超过该上界，runtime保留所有bytes而不是猜测哪部分属于本record。

Gate与truncate之间仍存在用户态窗口。Trusted directory ownership、ACL和Phase517/525 identity checks继续是部署边界；本阶段不引入native append transaction、file lease或kernel record lock。

## Failure Semantics

- `writeFile` rejection + eligible partial append + rollback成功：caller收到original write error，current恢复到pre-write bytes。
- `writeFile` rejection + zero observed growth：caller收到original error，不执行truncate。
- `writeFile` rejection + path/descriptor drift：不truncate任何对象，caller收到original error。
- `writeFile` rejection + size beyond record bound：不truncate未知bytes，caller收到original error。
- Truncate/sync/postcondition failure：best-effort rollback失败，caller仍收到original write error。
- `datasync`、`sync`、parent sync或final post-write gate failure：不进入rollback，保持Phase520/526语义。

## Tests

- Existing current partial append failure恢复exact baseline，后续record可继续写入且每行JSON可解析。
- Missing current partial append failure恢复为empty file，后续record形成单一合法JSONL line。
- Write failure期间current path被rename/replacement时，不truncatemoved original或replacement。
- Failed write后size增长超过本record上界时不truncate未知suffix。
- Buffered/data/full正常durability、post-write replacement、capacity、rotation和descriptor-relative generation tests保持。
- TypeScript、Python、built integration和CLI smoke全量回归通过。

## 边界

- 本阶段不把JSONL append改为temporary-file rewrite或copy-on-write generation。
- 不回滚成功write之后发生的durability或post-write validation failure。
- 不删除rollback后的empty current，也不回滚已经完成的rotation。
- 不保证non-cooperative writer与rollback并发时的record级原子性。
- 不新增CLI、environment、JSON-RPC、report或persistent metadata字段。

## 验收标准

- `writeFile` rejection不再在eligible cooperative path留下partial JSON suffix。
- Rollback只在same current object和bounded size window内truncate。
- Path replacement和beyond-bound growth不会被误截断。
- Original write error始终优先。
- Missing/existing generation后续写入均可恢复。
- Phase520/526 durability和post-write error contracts保持。
- 全量统一验收通过且无FileHandle GC warning、audit temp residue或workspace临时补丁文件。

## 实现结果

- 旧runtime probe稳定复现partial append：existing current由307 bytes增长到318 bytes，失败后遗留`{"partial":`这11 bytes无效suffix。
- `appendAuditLine`现在只在`writeFile(line)` rejection分支调用`rollbackFailedAuditLineWrite`；helper复用pre-write descriptor identity、size和exact `lineBytes`，仅对same-object bounded positive growth执行same-handle truncate。
- Rollback按`buffered`、`data`、`full`分别执行no sync、`datasync()`、`sync()`，并在truncate后验证descriptor size/identity与logical path identity；任何rollback error均被隔离，original append error保持不变。
- 新runtime probe中同一注入失败后current保持307 bytes，`unchanged=true`，不再留下partial suffix。
- 新增五项audit测试，覆盖existing current恢复与继续写入、missing current恢复为空文件、三种durability策略、moved/replaced current拒绝truncate，以及beyond-bound unknown growth拒绝truncate。
- 定向audit回归通过：`audit.test.ts` 126项、`cliAudit.test.ts` 45项，共171项；TypeScript build通过。
- 统一验收通过：Python 422项；TypeScript 43个test files、685项；TypeScript build、built CLI integration和CLI smoke全部通过。
- `/tmp`下无`god-code-audit-*`或`god-code-phase551-probe-*`残留，workspace无`.tmp`、`.bak`、`.orig`或`.rej`文件，验收输出中无FileHandle GC warning。

## Phase552 后续加固

Phase552让本阶段rollback helper返回same-object restored proof。Existing generation仍只恢复pre-write bytes；missing expectation若由本次O_EXCL从0 bytes创建、rollback确认恢复到0且parent/path identity稳定，则继续执行descriptor-relative empty entry cleanup。Unknown growth、rollback uncertainty和successful write后的failure仍不删除。
