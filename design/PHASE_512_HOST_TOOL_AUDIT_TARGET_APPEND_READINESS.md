# Phase512 Host Tool Audit Target Append Readiness

## 状态

代码、测试与文档已完成。

## 审计结论

Phase511只对nearest existing directory执行`access(W_OK)`。当audit target已经存在时，directory可写并不表示文件本身可通过`O_WRONLY`打开。例如目标ACL或ownership可能拒绝append，而parent仍允许创建、删除或rename其他entries。旧诊断会把这种路径报告为ready，第一次record才通过audit warning暴露open failure。

## 目标

- Directory和existing target分别执行write-access probe。
- Missing target只检查nearest existing directory。
- Existing target同时报告`directory_writable`和`target_writable`。
- Target不可写时report `ok:false`和status error。
- Directory与target均不可写时一次报告两个原因。
- Broad POSIX mode warning不能覆盖实际target不可写错误。
- Access probe可注入，以便root测试环境稳定模拟EACCES。
- Production默认继续使用`fs.access(target,W_OK)`。
- Inspection不打开、chmod、读取或写入target。
- 不改变runtime实际open和warning语义。

## Independent Capabilities

Nearest directory W_OK代表创建missing components和执行rotation directory-entry mutation的当前能力。Existing target W_OK代表以write descriptor打开current generation并执行Phase502 chmod/append的当前能力。两者由不同inode/ACL控制，必须独立检查。

## Report Semantics

`AuditPathDetails`新增optional `target_writable`：target missing时省略，existing时为boolean。Inspector先收集directory与target access结果，再构建error list：

- `nearest existing directory is not writable: ...`
- `existing audit target is not writable: ...`

任一存在则status error。只有两项access通过后才考虑Phase511 broad-mode warn或ready message。

## Testability Boundary

`inspectAuditPath`第三参数接受`AuditAccessCheck`，默认委托`fs.access`。测试可仅对target path抛出EACCES，同时让directory probe成功，精确证明错误分支而不依赖运行测试进程的UID、root权限或平台ACL。该注入只影响diagnostic access probe，不进入runtime sink。

## TOCTOU边界

W_OK结果只代表检查瞬间的当前进程权限。ACL、ownership、mount或path entry可在检查后变化；真正record仍以`fs.open(O_WRONLY|O_APPEND|O_NOFOLLOW)`结果为准，并由Phase499向caller报告失败。Diagnostic不作为授权或锁。

## 验收标准

- Existing normal target报告`target_writable:true`。
- 注入target EACCES时directory仍为true。
- Report status为error并明确existing target不可写。
- Target content保持不变。
- Missing target不要求target access。
- Broad mode、symlink和missing-chain tests保持。
- TypeScript、Python和integration全量回归通过。

## 实现结果

- `AuditPathDetails`新增`target_writable`。
- `inspectAuditPath`新增可注入`AuditAccessCheck`。
- Existing target执行独立W_OK probe并聚合access errors。
- Tests覆盖directory-ready/target-denied分支和no-mutation结果。
- README、SECURITY、protocol、architecture和extension docs同步append-readiness边界。
