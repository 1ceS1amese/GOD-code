# Phase522 Host Tool Audit Parent-Directory Identity Binding

## 状态

代码、测试与文档已完成。

## 审计结论

Phase521以no-follow directory descriptor执行POSIX parent fsync，但只验证打开结果是directory。Parent path可以在shared path inspection和metadata sync之间被替换为另一个真实目录；sync会成功，却同步了错误directory，无法确认record实际所在目录entry的durability。

## 目标

- Shared path inspector记录nearest existing directory identity。
- Runtime mkdir后的inspection得到immediate parent identity。
- Missing append expectation携带expected parent identity。
- Parent descriptor同时验证directory type和dev/ino identity。
- Safe directory replacement也必须拒绝metadata sync。
- Identity mismatch使用稳定非敏感错误。
- Mismatch发生在directory sync前。
- Existing append不引入parent identity成本之外的sync。
- 保持Windows file-only full边界。
- 不宣称回滚已经写入或已发生的directory mutation。

## Shared Parent Identity

`JsonlAuditPathInspection`新增：

```text
nearestExistingDirectoryIdentity: {device, inode}
```

Inspector首先lstat filesystem root建立初始identity，随后每通过一个真实parent directory就更新path和identity。CLI inspection遇到missing chain时该字段描述最近存在目录；runtime在recursive mkdir后的第二次inspection和rotation inspection中，只有final target可能missing，因此该identity对应immediate parent。

## Expectation Propagation

Phase518的missing expectation扩展为：

```text
{kind:"missing", parentIdentity}
```

首次missing、mode-open期间disappearance和完成rotation后都保留rotation inspection认可的same parent identity。Existing expectation仍只携带current file identity，因为existing append不执行directory sync。

## Directory Binding

`syncAuditParentDirectory(filePath, expectedIdentity)`：

1. 使用O_RDONLY/O_NOFOLLOW/O_DIRECTORY打开path.dirname(filePath)。
2. Fstat确认descriptor是directory。
3. 比较descriptor dev/ino与expected identity。
4. Mismatch抛出：

```text
Audit parent directory changed before metadata sync.
```

5. 只有identity一致时调用directory sync。

## Replacement Test

测试在current record已经写入并file-sync之后、parent directory open之前，把原parent rename到保留路径并在原path创建新的真实目录。Directory open与type gate都会成功，但dev/ino mismatch使metadata sync拒绝。Written record保留在renamed original parent，新replacement parent保持为空，证明实现没有同步错误目录并误报full durability。

## Failure Semantics

Identity mismatch发生在record write和file fsync之后，不能撤销已写文件或此前rotation mutation。Record Promise拒绝并沿Phase499产生audit warning，语义是parent metadata durability未确认。部署仍应通过ownership/ACL防止不受信任进程替换audit parent。

## 边界

- Binding覆盖shared inspection到directory descriptor open之间的parent replacement。
- Parent descriptor open成功后，后续path replacement不改变该descriptor sync target。
- File creation/rename仍通过path-based Node.js APIs完成；该阶段不是openat-style capability sandbox。
- Cross-process writer coordination仍需外部locking或single-writer ownership。

## 验收标准

- Shared inspector报告与fs.stat一致的nearest parent dev/ino。
- Runtime missing expectation携带parent identity。
- Directory descriptor必须通过type和identity检查。
- Replacement为另一个真实directory时稳定拒绝。
- Replacement directory不被sync。
- Written record保留在original renamed directory。
- Existing append、rotation、durability和path tests保持。
- TypeScript、Python和integration全量回归通过。

## 实现结果

- `JsonlAuditPathInspection`新增nearest directory identity。
- Inspector从filesystem root开始维护directory identity。
- Missing append expectation新增parent identity。
- Parent sync新增dev/ino binding和stable mismatch error。
- Tests覆盖identity metadata和真实parent replacement窗口。
- README、SECURITY、protocol、architecture和extension docs同步parent binding边界。

## Phase548 加固

Phase548把本阶段parent identity从sync-time reopen升级为transaction-lifetime handle。Descriptor/path/descriptor gate从第二次inspection后跨rotation、append和metadata sync保持；recursive parent creation仍在handle建立之前，作为后续独立边界。

## Phase549 加固

Phase549把第一次inspection的nearest directory identity用于missing parent bootstrap起点。每个new或concurrent-existing child都立即形成新的pinned directory identity并提升为下一anchor；bootstrap完成后，coordination lock内第二次inspection仍重新建立Phase548 generation parent identity，不复用bootstrap snapshot越过lock边界。
