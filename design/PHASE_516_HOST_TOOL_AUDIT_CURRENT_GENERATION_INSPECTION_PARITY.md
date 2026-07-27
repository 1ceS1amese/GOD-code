# Phase516 Host Tool Audit Current-Generation Inspection Parity

## 状态

代码、测试与文档已完成。

## 审计结论

Phase511提取了`inspectJsonlAuditPath`供record path gate和CLI readiness复用，Phase514又将target size加入该结果；但`rotateIfNeeded`仍直接调用`lstat`并独立维护symlink、regular-file、link-count和size规则。三条路径当前结果相同，却存在后续修改只更新其中一处的漂移风险。

## 目标

- Runtime rotation复用shared current-generation inspector。
- 删除rotation内部重复的target type/link-count判断。
- Rotation capacity使用shared inspection返回的size。
- Missing current保持zero-byte语义。
- Existing current仍在capacity decision前收敛POSIX private mode。
- 保留inspection后并发删除的恢复行为。
- Descriptor validation继续作为最终no-follow write boundary。
- 不削弱parent component检查。
- 不改变rotation、capacity或warning contract。

## Shared Ownership

`inspectJsonlAuditPath(filePath)`统一拥有：

- resolved path与逐component lstat
- parent必须为真实directory
- target existence
- target必须为regular file
- target必须`nlink === 1`
- target byte size
- POSIX mode/private-mode metadata

调用方分工保持清晰：CLI组合access与readiness信息；record path gate只要求inspection成功；rotation使用existence和size；append/mode convergence继续通过FileHandle验证最终descriptor。

## Runtime Flow

`rotateIfNeeded(nextLineBytes)`现在：

1. 调用`inspectJsonlAuditPath`。
2. Missing target使用current bytes 0。
3. Existing target执行no-follow descriptor private-mode convergence。
4. 若target在步骤1和3之间消失，收敛为missing/0-byte状态，让最终append在安全路径重新创建。
5. 调用Phase515 shared capacity decision。
6. 只有需要rotation时才检查和替换`.1`。

Symbolic link、hard link、directory/non-regular target以及unsafe parent都由shared inspector以与CLI相同的错误拒绝。

## TOCTOU Boundary

Shared inspection消除规则复制，但不把path metadata snapshot变成锁。Existing target可在inspection后改变；mode convergence和append仍使用`O_NOFOLLOW`与descriptor `fstat/nlink`验证。Node.js缺少通用openat-style parent capability时，受信任directory ownership与ACL要求保持Phase501定义。

## 验收标准

- Direct shared inspection报告existing target size。
- Shared inspection拒绝变为multi-link的current target。
- Runtime normal append和rotation保持。
- Runtime symlink、parent symlink、hard-link和non-regular拒绝保持。
- Current permission normalization保持。
- Capacity decision与rotated-entry tests保持。
- TypeScript、Python和integration全量回归通过。

## 实现结果

- `rotateIfNeeded`改为使用`inspectJsonlAuditPath`。
- 删除rotation手写lstat/type/nlink判断。
- 保留mode convergence期间ENOENT到missing current的恢复。
- Tests新增shared size metadata和link-count contract验证。
- README、SECURITY、protocol、architecture和extension docs同步inspection ownership边界。
