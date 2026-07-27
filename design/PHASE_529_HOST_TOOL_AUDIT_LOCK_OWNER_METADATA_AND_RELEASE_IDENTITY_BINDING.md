# Phase529 Host Tool Audit Lock Owner Metadata and Release Identity Binding

## 状态

代码、测试与文档已完成。

## 审计结论

Phase527的lock holder只有directory existence，Phase528只能报告entry type和age。Runtime release直接rmdir path，无法证明该path仍是自己创建的directory；未来cleanup也缺少可验证owner token。Same-user replacement可能让holder误删新的lock directory，空目录crash残留则没有来源metadata。

## 目标

- Atomic mkdir后创建bounded owner metadata。
- Metadata file使用O_EXCL、O_NOFOLLOW和0600。
- Schema包含version、UUID token、PID和canonical acquired timestamp。
- Owner metadata读取上限为4096 bytes。
- Parser绑定path lstat与descriptor identity，不跟随symlink。
- Release同时验证directory dev/ino、owner token和single-entry invariant。
- Directory replacement即使复制metadata也拒绝release。
- Token replacement拒绝release且不删除lock。
- CLI只报告metadata status、PID和acquired time，不泄露token。
- Missing/invalid metadata仅增加warning，不推断stale或自动cleanup。

## Owner Schema

Lock directory内固定文件名为：

```text
owner.json
```

Persisted JSON字段：

```json
{
  "version": 1,
  "owner_token": "uuid-v4",
  "pid": 12345,
  "acquired_at": "2026-07-22T10:30:00.000Z",
  "acquired_at_ms": 1784716200000
}
```

`acquired_at`必须等于`acquired_at_ms`的canonical ISO表示。PID必须是positive safe integer；token必须匹配UUID v4。Metadata不是授权secret，但token不进入CLI projection，避免把未来cleanup identity误当普通诊断文本传播。

## Acquisition Sequence

1. Atomic mkdir创建0700 lock directory。
2. lstat捕获directory dev/ino。
3. 生成UUID token和canonical acquisition time。
4. O_EXCL/no-follow创建0600 owner file并写入单行JSON。
5. 再次lstat lock directory并要求identity不变。
6. 返回携带lock path、owner path、token和release closure的lock object。

Initialization failure执行best-effort identity-aware cleanup。只有当前directory仍匹配初始dev/ino且owner metadata token匹配时才unlink owner；不确定状态保留给diagnostics，原始acquisition error优先。

## Bounded Owner Inspection

`inspectJsonlAuditLockOwnerMetadata`先lstat owner path，要求single-link regular file且metadata size不超过4096 bytes。随后no-follow open并绑定path与descriptor dev/ino，以4097-byte buffer检测并拒绝growth或oversize，再次绑定descriptor与最终path identity后解析JSON。

Directory inspection公开：

- `ownerMetadataStatus`: valid / missing / invalid
- `ownerToken`: internal shared inspection only
- `ownerPid`
- `ownerAcquiredAt`
- `ownerAcquiredAtMs`

CLI仅映射status、PID和acquired time。

## Release Contract

Release依次要求：

1. Lock path仍为directory。
2. Directory dev/ino与acquisition snapshot一致。
3. Owner metadata valid且token与holder一致。
4. Directory entry list只包含`owner.json`。
5. Unlink owner file后rmdir directory。

任何identity、token、entry-list或remove drift返回：

```text
Audit file lock changed before release.
```

Release失败不会删除replacement lock。若audit transaction此前已经失败，Phase527 primary-error preservation继续阻止release error覆盖原始原因。

## CLI Contract

`AuditPathDetails`新增：

```text
coordination_lock_owner_metadata_status
coordination_lock_owner_pid
coordination_lock_acquired_at
```

Valid runtime holder显示PID和acquired time。Empty legacy/crash directory显示missing warning；invalid、oversize、linked或malformed owner record显示invalid warning。PID、age、timestamp和valid metadata都不能证明process仍存活。

## Tests

- Acquired lock inspection返回exact token、PID和canonical time。
- POSIX owner file mode为0600。
- Missing empty-directory metadata与invalid content稳定分类。
- CLI valid holder展示status/PID/time且human/JSON不包含token。
- CLI missing metadata追加warning且不修改目录。
- Owner token替换后release拒绝，replacement metadata保留。
- Lock directory replacement复制相同metadata后仍因dev/ino mismatch拒绝。
- Phase527真实child-process empty lock仍能阻塞并在外部release后恢复。

## 边界

- Token只证明metadata与holder snapshot一致，不证明PID仍活跃。
- Same-user adversary仍可读取或修改temp namespace；修改会导致拒绝而非安全绕过。
- Release validation与unlink/rmdir之间仍是短用户态窗口，不是内核事务。
- Metadata未执行fsync，不作为durable ownership journal。
- Crash可能留下valid owner metadata；本阶段仍不提供force unlock。
- Future cleanup必须同时绑定directory identity、owner token和显式用户确认，不能只看age/PID。

## Phase542 加固

Phase542将bounded owner parser抽取为shared pinned-owner reader。Acquisition保存完整BigInt owner snapshot；release开始时no-follow pin current `owner.json`，要求snapshot、完整metadata和single-entry invariant一致后才unlink。Copied-metadata owner replacement因此拒绝，read-only inspection与CLI字段保持不变。

## Phase543 加固

Phase543把acquisition-time creation handle持续保留到release或显式`abandon()`。Release直接复用original owner descriptor，不再release-time reopen；per-lock lifecycle tail串行化资源终止，abandon只关闭handle并保留磁盘lock。Phase529 owner schema、inspection projection和release拒绝语义保持不变。

## 验收标准

- Every runtime-acquired lock拥有valid bounded owner metadata。
- Owner file创建mode、no-follow和single-link约束保持。
- Inspection不读取超过4096 bytes。
- CLI不泄露owner token。
- Release拒绝token和directory identity replacement。
- Missing/invalid metadata不触发自动删除。
- Existing contention、parent replacement、rotation和durability tests保持。
- TypeScript、Python和integration全量回归通过。

## 实现结果

- 新增owner schema constants、types、path helper和bounded parser。
- `JsonlAuditFileLock`新增owner path与token。
- Acquisition写入owner metadata并重验directory identity。
- Release绑定directory dev/ino、owner token和single-entry invariant。
- CLI新增owner metadata status、PID和acquired time fields。
- Tests覆盖valid/missing/invalid metadata、token篡改和directory replacement。
- README、SECURITY、protocol、architecture、internal design、project plan和extension docs同步Phase529边界。

## Phase555 后续使用

Phase555只复用read-only lock inspection projection来阻断rotation recovery fingerprint。Recovery report可显示lock existence、entry type与acquirable状态，但不输出owner token，也不把PID、age或metadata解释为stale/liveness authority。Lock前后projection变化使整个recovery graph进入`state_changed`；future mutation仍由normal acquisition与release identity binding负责。

## Phase556 后续使用

Phase556在normal acquisition成功后复用本阶段owner metadata与identity binding建立internal held-lock assertion。每次critical recovery gate都要求original directory与owner descriptors、完整canonical metadata、token和single-entry layout仍一致；copied metadata replacement无法把新directory解释为当前holder。CLI与runtime result仍不输出token，readiness fingerprint也不包含owner secret；release失败不覆盖已经发生的primary recovery error。
