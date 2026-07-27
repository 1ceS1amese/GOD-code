# Phase517 Host Tool Audit Descriptor Identity Binding

## 状态

代码、测试与文档已完成。

## 审计结论

Phase516让rotation与CLI共享current path inspection，但rotation仍先读取path lstat size，再单独打开no-follow descriptor做mode convergence。Target可以在两步之间被替换：descriptor validation能够拒绝symlink/non-regular/multi-link对象，却无法证明descriptor仍对应刚才inspection的同一个single-link regular file；capacity也继续使用较早的path size。

## 目标

- Shared path inspection记录current target filesystem identity。
- No-follow descriptor validation返回observed identity和size。
- Rotation绑定expected path identity与observed descriptor identity。
- Identity mismatch在任何`.1` mutation前稳定拒绝。
- Capacity使用descriptor-authoritative size。
- 保持inspection-open之间target删除的missing recovery。
- 保持append descriptor自己的最终type/link-count验证。
- 不把identity metadata加入公开CLI输出。
- 明确descriptor close之后仍存在的parent-entry TOCTOU边界。

## Identity Contract

`JsonlAuditFileIdentity`包含：

- `device`：filesystem device id
- `inode`：filesystem object id

`inspectJsonlAuditPath`只在target通过regular/single-link检查后返回`targetIdentity`。`jsonlAuditFileIdentityMatches`要求两者dev和ino都相同。该identity用于进程内短窗口绑定，不作为持久记录ID、跨主机ID或授权凭据。

## Descriptor Snapshot

`validateAuditFileHandle`返回FileHandle的fstat结果。`enforcePrivateAuditFileMode`在同一descriptor上：

1. 验证regular file和`nlink === 1`。
2. 执行POSIX `fchmod(0600)`。
3. 返回descriptor `size`、`dev`和`ino`。

Rotation先比较path expected identity与descriptor observed identity。Mismatch抛出：

```text
Audit file changed during rotation preparation.
```

该错误发生在rotated entry inspection、rm和rename之前，因此existing `.1`与两个current候选文件均不被rotation修改。

## Capacity Authority

Identity一致后，rotation使用descriptor fstat size调用Phase515 shared capacity decision，而不是使用更早的path lstat size。这允许同一inode在inspection-open之间发生合法size变化时以较新的descriptor snapshot决定是否rotation。

## Replacement Test

测试在shared path inspection完成后、mode descriptor open前，把原current rename到保留路径并复制出新inode replacement。Runtime打开的replacement仍是regular single-link file，但dev/ino mismatch使record稳定拒绝；`.1`不会创建，原文件和replacement内容均保留。

## 边界

- Identity binding覆盖path inspection到descriptor open之间的replacement。
- FileHandle关闭后到path rename之间仍可能发生parent-entry变化；Node.js当前没有通用openat-style rename capability。
- 部署仍必须保证audit parent directory由可信owner/ACL控制。
- Cross-process append/rotation serialization仍不由该阶段解决。

## 验收标准

- Shared inspection报告与`fs.stat`一致的dev/ino。
- Identity equality同时比较device和inode。
- Replacement为另一个安全regular file时也稳定拒绝。
- Refusal发生在`.1`创建、删除或rename之前。
- Descriptor size驱动capacity decision。
- Normal append、rotation、mode和path safety tests保持。
- TypeScript、Python和integration全量回归通过。

## 实现结果

- 新增`JsonlAuditFileIdentity`和`jsonlAuditFileIdentityMatches`。
- `JsonlAuditPathInspection`新增internal `targetIdentity` metadata。
- Mode convergence返回descriptor identity与size。
- Rotation新增stable identity mismatch refusal并使用descriptor size。
- Tests覆盖identity metadata、match/mismatch和真实replacement窗口。
- README、SECURITY、protocol、architecture和extension docs同步descriptor binding边界。

## Phase548 加固

Phase548让rotation-preparation current descriptor保持到rename postcondition，不再在capacity decision后关闭。Current open从parent anchor解析，rename后rotated logical path与original descriptor必须一致；本阶段identity与descriptor-authoritative size contract保持。
