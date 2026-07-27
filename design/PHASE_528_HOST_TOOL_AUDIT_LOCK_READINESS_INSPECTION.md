# Phase528 Host Tool Audit Lock Readiness Inspection

## 状态

代码、测试与文档已完成。

## 审计结论

Phase527让runtime和`inspect-config`共享derived coordination lock path，但`audit inspect-path`仍无法观察该entry是否已被合法holder占用、被非目录对象阻塞或由crash残留。用户只能等到record超时后看到generic lock error，也无法确认inspection是否会修改未知lock。

## 目标

- 新增shared no-follow lock inspection helper。
- 报告derived lock path、existence、entry type、snapshot acquirable和age。
- Absent lock视为ready。
- Directory lock视为可能有效holder并返回warn。
- Symbolic link、regular file和other blocker返回error。
- Inspection不创建、获取、刷新、跟随或删除lock。
- Age不自动升级为stale verdict。
- 保持Phase527 acquisition path和timing contract不变。
- Human/JSON readiness details保持一致。

## Shared Inspection Contract

`inspectJsonlAuditFileLock(filePath, now)`复用`getJsonlAuditLockPath`，对最终lock entry执行`lstat`：

- `ENOENT`：`exists=false`、`acquirable=true`。
- Directory：`entryType=directory`、`acquirable=false`。
- Symlink：`entryType=symbolic_link`，不跟随target。
- Regular file：`entryType=regular_file`。
- 其他filesystem object：`entryType=other`。

Existing entry的`ageMs`为`max(0, floor(now - mtimeMs))`。Inspection clock必须是finite number；age只反映本次metadata snapshot。

## CLI Status Mapping

`AuditPathDetails`新增：

```text
coordination_lock_path
coordination_lock_exists
coordination_lock_entry_type
coordination_lock_acquirable
coordination_lock_age_ms
```

状态合并规则：

1. Absent lock不增加warning，path readiness保持原状态。
2. Directory holder增加`coordination lock is currently held; writers may wait or time out` warning，report继续`ok=true`。
3. Non-directory blocker加入access error，report为`ok=false`，因为Phase527 atomic mkdir永远无法使用该entry。
4. 其他target、capacity、rotation和permission错误继续按既有优先级合并。

## Why Age Is Not Stale

Long-running fsync、slow filesystem或paused process都可能让合法lock age超过5000ms waiter timeout。PID可能重用，network filesystem和container PID namespace也会削弱liveness判断。因此Phase528不提供：

- stale boolean
- owner PID推断
- automatic cleanup
- force unlock command

后续若增加cleanup，必须引入owner token、identity revalidation和显式确认，而不能只依赖mtime。

## Tests

- Missing lock返回exact absent/acquirable metadata。
- Held directory以deterministic inspection clock返回age。
- Invalid clock稳定拒绝。
- Regular-file blocker被分类且内容保持。
- POSIX symlink blocker不被跟随，victim内容保持。
- CLI absent lock保持ready并报告fields。
- CLI directory holder返回warn且不删除lock。
- CLI regular-file blocker返回error且不修改entry。

## 边界

- Inspection结果在返回后可立即过期，不是reservation。
- `acquirable=true`只表示snapshot时entry absent，不保证后续atomic mkdir成功。
- Directory不区分active holder与crash残留。
- Age受wall-clock和filesystem timestamp精度影响。
- 不读取owner metadata，因为Phase527尚未创建owner record。
- 不改变runtime contention、timeout或release行为。

## 验收标准

- Runtime acquisition与CLI inspection共享lock path derivation。
- Inspector只使用lstat且不跟随symlink。
- All entry classes具有稳定public string值。
- Valid holder为warn而非hard error。
- Invalid blocker为error且无mutation。
- Age不触发cleanup或stale claim。
- Existing inspect-path fields、rendering和status tests保持。
- TypeScript、Python和integration全量回归通过。

## 实现结果

- 新增`JsonlAuditLockEntryType`、`JsonlAuditLockInspection`和`inspectJsonlAuditFileLock`。
- `AuditPathDetails`新增五个coordination lock readiness字段。
- CLI合并occupied warning和invalid-blocker error。
- Tests覆盖absent、directory、regular file、symlink、age和invalid clock。
- README、SECURITY、protocol、architecture、internal design、project plan和extension docs同步Phase528边界。

## Phase565 后续加固

Phase565保留本阶段的derived lock path、entry-type、age与absent/acquirable语义，但把directory holder inspection从单次lstat/owner read升级为same-directory descriptor上的initial/final bounded child scans。Valid owner descriptor保持到final scan之后并验证path/object/content连续性；child/owner drift、truncation或inspection error只形成warning/uncertainty，不发布owner authority或cleanup fingerprint。Inspection仍不是reservation，age与PID仍不构成stale或liveness证明。

## Phase566 后续加固

Phase566在valid owner final snapshot之后再次绑定logical lock leaf与original directory descriptor。即使owner path通过intermediate symlink仍解析到同一owner file，只要lock leaf已经成为symlink、replacement或不再绑定original directory object，readiness inspection就输出state changed并撤销owner authority。Phase528 entry-type/age与absent/acquirable snapshot语义保持，inspection仍不构成reservation。

## Phase567 后续加固

Phase567把readiness inspection的directory gates从same-object验证收紧为open-time full generation验证。Descriptor/path/descriptor都必须匹配pinned device/inode/ctimeNs/birthtimeNs；final scan后的child mutation、owner basename replacement或directory metadata变化不再被same device/inode接受。Phase528 age与entry-type字段不变，generation evidence只通过既有state-changed/authority withdrawal表达。

## Phase570 后续加固

Phase570要求valid active owner authority在terminal lock-directory generation gate之后再执行一次bounded no-follow owner inspection。前后device、inode、ctimeNs、birthtimeNs、mtimeNs、size与canonical metadata任一漂移都会复用Phase528既有state-changed readiness结果并撤销owner fields；entry-type、age与absent/acquirable字段保持，inspection仍不是reservation。
