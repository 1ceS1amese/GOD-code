# Phase527 Host Tool Audit Cooperative Cross-Process Coordination Lock

## 状态

代码、测试与文档已完成。

## 审计结论

Phase507只在单个Node.js isolate内按absolute path共享Promise tail。两个独立CLI进程仍可同时完成current inspection、capacity decision、rotation和append，从而产生double rotation、unexpected appearance或generation overflow。Phase517-526能拒绝多类path drift，但不能把多个协作writer的完整transaction串行化。

## 目标

- 保留同进程per-path Promise tail。
- 为独立same-user进程增加filesystem-visible coordination lock。
- Lock identity由absolute audit path稳定派生。
- Lock namespace不随audit parent rename移动。
- Atomic acquisition覆盖safe-path、capacity、rotation、append和durability transaction。
- Contention按10ms interval有界等待5000ms。
- Timeout返回`Timed out waiting for audit file lock.`。
- 不自动删除未知或可能仍有效的lock holder。
- Transaction首因不被release failure覆盖。
- CLI只读报告coordination scope、lock path、timeout和retry。

## Lock Namespace

`getJsonlAuditLockPath(filePath)`先解析absolute path，再计算SHA-256。POSIX使用uid作为user scope；没有`getuid`的平台使用home directory hash。最终lock path位于OS temp directory：

```text
god-code-audit-<user-scope>-<absolute-path-sha256>.lock
```

Lock不放在audit parent内。这样parent directory在transaction中被rename时，lock仍保持原identity，release不会因target parent replacement丢失，也不会允许另一个协作writer在新parent立即获得不同sidecar lock。

## Acquisition Protocol

`acquireJsonlAuditFileLock`使用atomic `mkdir(mode=0700)`：

1. 成功创建者成为holder。
2. `EEXIST`表示已有holder或占位，按retry interval等待。
3. Elapsed达到timeout后稳定拒绝。
4. 其他filesystem error原样传播。
5. Holder通过`rmdir`释放empty lock directory；release对同一lock object幂等。

没有stale-age heuristic、PID probing或自动删除。进程crash可能留下lock directory；后续writer选择拒绝而不是冒险删除仍在使用的holder。运维只有在确认没有活动writer后才能手动移除诊断报告的lock path。

## Transaction Boundary

Record preparation和single-record max check仍在锁外。Parent创建完成后获取lock，持锁区内执行：

1. 第二次safe path validation。
2. Current inspection与mode convergence。
3. Capacity/rotation decision及`.1` mutation。
4. Final expectation、descriptor和parent gates。
5. Record append、durability及pre/post-write identity checks。

Finally始终尝试release。若transaction已经失败，release failure不会替换原始error；若transaction成功但release失败，则record Promise拒绝，因为后续协作writer可能被永久阻塞。

## Diagnostics Contract

`audit inspect-config`的details现在包含：

```text
coordination_scope: process_and_filesystem
coordination_lock_path: <derived temp path>
coordination_lock_timeout_ms: 5000
coordination_lock_retry_ms: 10
```

Disabled配置仍报告scope和timing defaults，但不构造lock path。Inspection只做字符串派生，不创建target、parent或lock directory。

## Tests

- 真实child process先创建derived lock并等待stdin；parent sink保持pending且不创建audit file，child release后record成功。
- Deterministic injected clock/wait覆盖retry次数和timeout stable error。
- Invalid explicit timeout/retry options在filesystem mutation前拒绝。
- POSIX lock directory mode为0700。
- 既有parent replacement tests证明temp lock不会移动或覆盖原始identity error。
- CLI human/JSON details与runtime constants保持一致。

## 边界

- Protocol只协调采用相同lock derivation和acquisition规则的same-user writers。
- 非协作程序可直接写、rename或删除audit target。
- 不同user scope不会共享lock；跨用户写权限仍由filesystem ACL决定。
- Same-user进程可预创建lock path造成有界denial of service。
- Crash残留没有自动recovery；lock readiness/stale diagnostics可作为后续阶段扩展。
- Distributed filesystem对atomic mkdir和一致性语义必须由部署环境保证。

## 验收标准

- Lock path对同一absolute target跨进程稳定一致。
- Lock不位于可替换audit parent中。
- 独立process holder阻止runtime transaction直到release。
- Timeout有界且不删除existing lock。
- Lock覆盖rotation与append完整transaction。
- Transaction primary error在release异常时保持。
- CLI公开新coordination contract且inspection无副作用。
- Parent、path identity、capacity、rotation和durability tests保持。
- TypeScript、Python和integration全量回归通过。

## 实现结果

- 新增`getJsonlAuditLockPath`、`acquireJsonlAuditFileLock`和timing constants。
- Runtime在parent创建后获取lock，并在finally释放。
- Lock namespace迁移到same-user OS temp hashed path，避免parent rename移动sidecar。
- CLI coordination scope升级为`process_and_filesystem`并报告lock metadata。
- Tests覆盖真实子进程阻塞、retry/timeout、option validation和既有parent replacement兼容性。
- README、SECURITY、protocol、architecture、internal design、project plan和extension docs同步Phase527边界。

## Phase555 后续使用

Phase555 recovery readiness在selected rotation graph读取前后调用本阶段derived lock inspector。任一次观察到holder或non-directory blocker都不生成fingerprint，前后projection变化返回`state_changed`。两次absent只允许输出dry-run expectation，不是持续liveness保证；future mutation仍必须通过本阶段normal acquisition path取得coordination lock，并在锁内重验全部generation与staging objects。

## Phase556 后续使用

Phase556 recovery mutation与normal writer共享同一in-process serialization key，并通过本阶段acquisition path取得真实coordination lock。新增internal held assertion持续验证lifecycle、lock directory descriptor、single `owner.json`、owner descriptor/metadata与token；它不扩展public lock interface或磁盘schema。Readiness fingerprint仍来自lock absent snapshot，mutation只在当前调用方持有并证明该normal lock后于锁内重新计算；timeout、copied-owner lock replacement或release identity drift都不会授权staging mutation。

## Phase557 后续使用

Phase557不改变本阶段normal writer语义：successful record后release失败仍reject，因为后续cooperative writer可能阻塞。显式rotation recovery则在operation result已确定时把release outcome结构化返回；release失败后才调用abandon关闭handles，并对logical lock path做no-follow existence inspection。Pre-commit error仍优先于release/abandon failure，public lock methods与owner schema保持不变，logical path missing也不提升为安全release证明。

## Phase558 后续使用

Phase558把显式rotation recovery的acquisition与post-acquisition failure分开编码。Timeout或blocker failure输出`lock_acquisition/not_started`与`coordinationLockAcquired: false`，不会把本阶段foreign existing lock标记为本次residual；取得normal lock后的revalidation、candidate、mutation或rollback failure则在release/abandon/residual finalization后保留对应typed details。该扩展不改变本阶段acquisition、held assertion、public lock methods、owner metadata schema或normal writer release rejection语义。
