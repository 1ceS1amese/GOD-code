# Phase548：Host tool audit descriptor-relative generation mutation transaction

## 背景

Phase547完成audit lock maintenance namespace的descriptor-relative rollout。Audit JSONL file transaction仍在immediate parent已经存在后使用logical path执行以下single-entry operation：

- existing current generation open；
- missing current generation O_EXCL create；
- replaceable `.1` generation unlink；
- current generation rename到`.1`；
- full durability时重新按logical path打开parent执行metadata sync。

Phase517至Phase526已经提供current file identity、final descriptor capacity、parent identity、pre/post-write path gates和durability顺序，但parent descriptor没有跨完整generation transaction保持，rotation source descriptor也在rename前关闭。Parent replacement或current replacement因此仍可能把path-only syscall导向非selected object。

Phase548把parent已经存在后的current/rotated single-entry lifecycle接入Phase546 shared mutation adapter。递归创建缺失parent chain属于multi-level bootstrap transaction，保留为独立后续阶段。

## Pinned Parent Transaction

Coordination lock取得并完成第二次safe-path inspection后：

1. 使用no-follow `O_DIRECTORY`打开current file的immediate parent；
2. 将descriptor/path/descriptor三次identity与inspection记录的parent dev/ino绑定；
3. parent handle跨current preparation、rotation、final append、durability和post-write gate保持；
4. Linux mutation/open path从`/proc/self/fd/<parent-fd>/<entry>`解析；
5. 非Linux或procfs unavailable时，每次operation继续执行logical parent path/descriptor gate；
6. transaction结束后在coordination lock release前关闭parent handle。

Parent handle只固定single directory object，不取消current/rotated leaf identity与logical path postcondition。

## Current Generation Preparation

Existing current不再通过logical path单独打开后立即关闭，而是：

- 从parent anchor解析current basename；
- no-follow打开regular single-link file；
- 比较shared inspection identity与descriptor identity；
- 通过descriptor收敛0600 mode并使用descriptor size决定capacity；
- 若不需要rotation，关闭preparation handle并把existing identity交给final append；
- 若需要rotation，保持该handle直到rename postcondition完成。

Inspection之后current消失仍按Phase517语义转为missing expectation；identity mismatch继续在任何`.1` mutation前拒绝。

## Rotation Transaction

Rotation顺序改为：

1. 通过shared inspector确认`.1`不是directory；
2. 重验parent与pinned current path/descriptor identity；
3. 从parent anchor unlink `.1` basename，ENOENT保持force-replace语义；
4. 再次重验selected current；
5. 从同一parent anchor rename current basename到rotated basename；
6. 要求logical current path missing；
7. 要求logical rotated path是与原current descriptor相同的single-link regular file；
8. 要求原current descriptor仍是相同object；
9. 返回missing append expectation，由同一parent handle创建新current。

Node公开API仍不提供leaf compare-and-rename。Descriptor-relative parent anchoring阻止operation被parent replacement重定向；current postcondition可检测wrong-source rename，但不能撤销已经发生的rename或被覆盖的destination entry。

## Final Append And Durability

`appendAuditLine`接收pinned parent：

- existing append与missing O_EXCL create都从parent anchor解析current basename；
- missing create前后继续执行Phase523/524 parent identity gate；
- final file descriptor继续执行Phase518至Phase526 identity、capacity、mode、pre-write和post-write gates；
- POSIX full durability直接sync transaction持有的parent handle，不再重新按logical path打开另一个directory；
- metadata sync前仍要求logical parent path与pinned descriptor一致，保持既有stable error和“record可能已写入”语义。

Actual procfd path只作为内部syscall target；公开file path、warning、CLI和JSON report继续使用canonical logical path。

## Failure Semantics

- Parent无法pin或identity mismatch时，在generation mutation前fail closed。
- Procfd descriptor path mismatch不回退；procfs unavailable才使用validated logical path fallback。
- Existing current replacement继续返回rotation-preparation或append identity error。
- Missing current appearance继续由O_EXCL映射为`Audit file appeared before append.`。
- Rotation完成后的postcondition failure可能已经删除旧`.1`或移动current，不承诺rollback。
- Post-write failure可能已经写入、datasync或fsync record，保持Phase526语义。
- Symlink/other `.1`仍只替换entry自身；directory `.1`继续拒绝。
- 不扫描或删除被外部rename到未知path的generation object。

## Tests

- Linux current preparation、missing O_EXCL create、rotated unlink和current rename使用procfd child paths。
- Full durability复用transaction parent handle，不重新按logical path打开parent。
- Parent replacement不能把create、unlink或rename导向replacement directory。
- Rotation source replacement或rename wrong-object success不会返回成功。
- Existing current replacement、disappearance、missing appearance、same-inode growth、pre/post-write replacement tests适配descriptor-relative open path并保持原语义。
- `.1` directory refusal、symlink inspection、serialization、capacity和durability tests保持。
- Forced fallback与Phase546/547 lock mutation tests保持。
- TypeScript、Python、built integration和CLI smoke全量回归通过。

## 边界

- `fs.mkdir(parent, {recursive:true})`仍是独立parent bootstrap边界，不在本阶段改写。
- 不增加native addon、`openat2`、`renameat2`、FFI、helper process或安装依赖。
- 不改变single rotated generation policy、capacity算法或rotation时机。
- 不新增CLI flag、environment variable、JSON-RPC字段、report字段或persistent metadata。
- 不宣称descriptor-relative path等价于kernel atomic leaf identity comparison。
- Windows继续使用validated path fallback和平台filesystem sharing semantics。

## 验收标准

- Parent存在后的current/rotated open/create/unlink/rename都通过shared directory mutation capability解析。
- Parent handle跨rotation、append和full durability保持并在所有路径关闭。
- Rotation source descriptor跨capacity decision和rename postcondition保持。
- Parent replacement不会导致replacement directory中的entry被创建、删除或rename。
- Current/rotated logical path postcondition拒绝wrong-object mutation success。
- Phase513、517至526的inspection、capacity、durability与stable errors保持。
- Source中generation transaction不再直接调用path-based `fs.rm`或`fs.rename`。
- 全量统一验收通过且无FileHandle GC warning、audit temp residue或workspace临时补丁文件。

## 实现结果

- 新增`JsonlAuditPinnedGenerationParent` transaction object；第二次safe-path inspection后以no-follow directory handle绑定immediate parent，并在coordination lock release前保持到rotation、append、durability和post-write gate全部结束。
- Existing current preparation从parent anchor解析basename并保持current file descriptor跨capacity decision与rotation postcondition；identity mismatch现在发生在mode mutation和`.1` mutation之前。
- `.1` replacement由parent-anchored unlink完成，ENOENT保持force语义；current到`.1`的rename通过同一parent anchor执行。Rename后要求current missing、rotated logical path绑定原current identity，并重新验证original current handle。
- Missing O_EXCL create与existing append都从parent anchor解析current basename；Linux使用validated procfd child path，fallback继续执行logical parent path/descriptor gate。
- POSIX full durability直接sync transaction持有的parent handle，不再重新按logical path打开parent；metadata sync前继续执行descriptor/path/descriptor identity gate并保持既有错误语义。
- Source中的generation transaction已移除direct path `fs.rm`与`fs.rename`；audit模块仅剩递归创建missing parent chain的path-based `fs.mkdir`作为后续边界。
- 新增四项测试，覆盖generation open/create/unlink/rename的procfd targets、parent replacement期间current create隔离、rotated unlink隔离，以及wrong-source rename成功后的descriptor postcondition拒绝；既有current replacement、capacity和durability tests已适配procfd path。
- Full-durability rotation测试额外证明transaction parent只open一次并由同一handle执行metadata sync。
- 定向audit回归通过：`audit.test.ts` 112项、`cliAudit.test.ts` 45项，共157项；TypeScript build通过。
- 统一验收通过：Python 422项；TypeScript 43个test files、671项；TypeScript build、built CLI integration和CLI smoke全部通过。
- `/tmp`下无`god-code-audit-*`临时残留，workspace无`.tmp`、`.bak`、`.orig`或`.rej`文件，也没有FileHandle GC warning。

## Phase549 后续

Phase549关闭本阶段保留的recursive parent bootstrap边界。Missing parent chain现在从第一次inspection选出的nearest existing directory descriptor开始逐级exact mkdir、no-follow child open和logical path/descriptor binding；完成后再获取coordination lock并执行第二次inspection，因此本阶段generation transaction和authoritative parent snapshot语义不变。

## Phase551 后续

Phase551复用本阶段跨append保持的current descriptor和parent/path gates，在`writeFile` rejection时对bounded partial suffix执行same-handle truncate rollback。Rotation、missing O_EXCL create、configured durability和post-write validation顺序不变；unknown growth或logical current drift不执行truncate。

## Phase552 后续

Phase552在owned missing creation的pre-commit empty state复用同一generation parent anchor，从shared mutation adapter unlink current basename，并通过original current handle证明detachment。Rotation archive不反向rename；Linux procfd与validated fallback边界保持本阶段定义。

## Phase553 后续

Phase553关闭“rotation archive已提前提交”的边界。Previous `.1` staging、current→`.1`、rollback `.1`→current、previous restore、commit unlink与staging rmdir全部复用本阶段generation parent及nested staging descriptors；original current handle跨append保持。Normal path不再直接unlink logical `.1`。

## Phase554 后续

Phase554从absolute audit target派生target-bound staging prefix，runtime creation仍从本阶段pinned generation parent执行。Read-only inspector打开selected staging root并优先使用validated procfd child path读取entry set与lstat `previous`；fallback保持path/descriptor前后绑定，不增加mutation syscall。
