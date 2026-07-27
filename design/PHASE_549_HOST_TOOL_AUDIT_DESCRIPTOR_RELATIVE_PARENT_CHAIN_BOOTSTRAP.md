# Phase549：Host tool audit descriptor-relative parent chain bootstrap

## 背景

Phase548完成parent已经存在后的audit generation transaction，audit模块仅剩record入口中的：

```text
mkdir(path.dirname(filePath), {recursive:true, mode:0700})
```

该调用在coordination lock之前创建missing parent chain。Phase511 path inspection虽然已经拒绝existing symlink和non-directory component，nearest existing directory仍可能在inspection与recursive mkdir之间被replacement；path-based traversal可能因此在replacement tree内创建目录。第二次inspection可以拒绝最终状态，却不能撤销或隔离已经发生的bootstrap mutation。

Phase549把multi-level parent bootstrap拆为validated single-entry loop，并复用Phase546 directory mutation adapter。Public path inspection、recursive/idempotent语义和后续coordination flow保持。

## Bootstrap Input

Record准备完成后先调用`inspectJsonlAuditPath(filePath)`，得到：

- canonical file path；
- nearest existing directory path与dev/ino；
- missing component chain。

Bootstrap target只到`path.dirname(filePath)`，不创建current file。Runtime计算nearest existing directory到target parent的relative components；结果必须是零个或多个validated single names，不能包含absolute、empty、`.`或`..` traversal。

## Pinned Existing Anchor

若target parent缺失：

1. no-follow打开nearest existing directory；
2. 将descriptor/path/descriptor identity与inspection dev/ino绑定；
3. Linux通过validated procfd child path创建下一层；
4. fallback在每次operation前重新绑定logical path与descriptor；
5. Linux descriptor-relative mode下，nearest anchor被replacement时mutation仍固定在原descriptor；fallback只保证syscall前的logical path/descriptor gate，保留Phase546定义的check-to-syscall窗口。

Root或任意已存在ancestor都只作为single-directory anchor，不递归follow symlink。

## Per-Component State Machine

对每个missing parent component：

1. 从current parent anchor执行exact mkdir 0700；
2. mkdir成功时记录actual mutation path；
3. `EEXIST`表示并发creator可能已完成该component，重新从current anchor解析existing child；
4. 从actual/anchored path以no-follow `O_DIRECTORY`打开child；
5. 将logical child path与child descriptor绑定；
6. 只有child是same-object directory时才把它提升为下一轮anchor；
7. 提升后关闭previous parent handle；
8. final parent验证完成后关闭最后handle。

Regular file、symlink、other object、logical path replacement或descriptor mismatch全部fail closed。Created directory在mkdir与open之间仍存在leaf race；Node没有atomic mkdir-and-open primitive，因此最终以opened child与logical path postcondition判定，不声明创建对象身份的kernel atomic proof。

## Concurrency And Idempotency

- 多个cooperative process可同时观察同一missing chain。
- 一个process mkdir成功后，另一个收到`EEXIST`并安全打开same logical directory继续。
- Existing directory mode不修改；new directory沿用0700 create mode和process umask语义。
- Bootstrap不获取audit coordination lock，因为lock namespace本身依赖canonical file path而不依赖parent存在；完整audit write仍在bootstrap后获取lock并执行第二次safe-path inspection。
- Bootstrap失败不删除已创建ancestor，保持原recursive mkdir的persistent/idempotent semantics，避免误删其他process已经开始使用的directory。

## Failure Semantics

- Initial nearest parent在descriptor绑定时已被replacement会在首个mkdir前拒绝；若Linux replacement发生在绑定后，mkdir仍只到达detached original，child logical path gate随后拒绝。
- Linux mid-chain parent replacement不会把后续mkdir导向replacement parent；logical path gate使transaction拒绝。Fallback检测operation前可见的drift，但不宣称消除path syscall窗口。
- `EEXIST` child若不是directory或不能与logical path绑定则拒绝。
- Permission、read-only filesystem、quota和I/O错误保持原Node error传播。
- 已成功创建的prefix可能在后续failure后保留；不报告rollback success。
- 第二次`inspectJsonlAuditPath`仍是coordination lock内generation transaction的authoritative path snapshot。
- Procfd unavailable使用validated logical path fallback，不降低component/type checks。

## Tests

- Nested missing parent chain的每次mkdir在Linux使用procfd child path。
- Bootstrap创建的logical chain和final audit file可正常写入。
- Linux nearest existing parent在first mkdir syscall前replacement时，replacement tree不出现created child。
- Linux mid-chain logical parent replacement时，next child不会创建到replacement directory。
- `EEXIST` directory由runtime安全接管并继续；file/symlink blocker拒绝。
- Existing parent、generation rotation、full durability、lock lifecycle和CLI inspection tests保持。
- Forced fallback resolver与Phase546至548 tests保持。
- TypeScript、Python、built integration和CLI smoke全量回归通过。

## 边界

- 不对existing directory chmod或修复ownership/ACL。
- 不删除bootstrap创建的partial chain。
- 不增加native addon、`openat2`、`mkdirat` binding、FFI或helper process。
- 不把bootstrap纳入audit coordination lock，也不改变lock path hash。
- 不新增CLI、environment、JSON-RPC、report或persistent metadata字段。
- Descriptor-relative parent anchoring不等于atomic leaf create-and-open；validated fallback也不等于dirfd-relative syscall。

## 验收标准

- `jsonlAuditSink.ts`不再直接调用path-based recursive `fs.mkdir`。
- Missing parent chain由nearest existing directory开始逐级exact mkdir和no-follow pin。
- `EEXIST`只在child成功绑定为directory时视为可继续。
- Linux descriptor-relative parent replacement不会把后续creation导向replacement tree；fallback保持Phase546的validated path boundary。
- 所有bootstrap handles在success与failure路径关闭。
- Existing path safety、generation transaction、coordination和public contracts保持。
- Audit source中所有filesystem namespace mutation统一经过shared directory mutation capability或descriptor-resolved O_EXCL file create。
- 全量统一验收通过且无FileHandle GC warning、audit temp residue或workspace临时补丁文件。

## 实现结果

- `JsonlAuditSink.record()`现在先保存第一次`inspectJsonlAuditPath`结果并调用`ensureAuditParentDirectory`，不再执行recursive `fs.mkdir`；bootstrap完成后才获取coordination lock，锁内第二次inspection保持authoritative。
- Phase548的generation-only parent object泛化为`JsonlAuditPinnedMutationDirectory`。Shared opener支持logical/open path分离、optional expected identity、no-follow `O_DIRECTORY` open以及descriptor/path/descriptor gate，供bootstrap与generation transaction共同使用。
- Runtime把nearest existing directory到target parent转换为validated relative single-name sequence；absolute、empty、`.`、`..`、NUL或cross-platform separator component在任何mutation前拒绝。
- 每层通过`createJsonlAuditDirectoryEntry`执行exact 0700 mkdir；`EEXIST`时从current anchor重新解析child。New/existing child都从actual anchored path打开，并在提升为下一anchor前绑定logical path与descriptor identity。
- Anchor promotion后立即关闭previous handle，top-level `finally`关闭current handle；后续component失败保留已创建prefix，不执行可能误删并发使用目录的rollback。
- `jsonlAuditSink.ts`已无direct `fs.mkdir`、`fs.mkdtemp`、`fs.rename`、`fs.unlink`、`fs.rmdir`或`fs.rm` namespace mutation call；single-entry mutation统一经过shared adapter，current/owner file create继续使用descriptor-resolved O_EXCL path。
- 新增六项测试，覆盖nested procfd mkdir、procfd unavailable logical fallback、concurrent directory `EEXIST` adoption、file/symlink blocker、Linux nearest parent replacement及Linux intermediate parent replacement；descriptor-relative replacement tree保持为空，detached original只保留已发生的prefix mutation。
- 定向audit回归通过：`audit.test.ts` 118项、`cliAudit.test.ts` 45项，共163项；TypeScript build通过。
- 统一验收通过：Python 422项；TypeScript 43个test files、677项；TypeScript build、built CLI integration和CLI smoke全部通过。
- `/tmp`下无`god-code-audit-*`临时残留，workspace无`.tmp`、`.bak`、`.orig`或`.rej`文件，也没有FileHandle GC warning。
