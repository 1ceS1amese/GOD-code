# Phase501 Host Tool Audit No-Follow Path

## 状态

代码、测试与文档已完成。

## 审计结论

显式 `GOD_CODE_AUDIT_FILE` 常使用workspace-relative路径。旧JsonlAuditSink通过mkdir、stat和append直接访问该路径，文件或父目录若被预置为symbolic link，append会跟随链接并把包含命令、路径和工具结果的audit写入配置边界之外。Hard-linked regular file也可能被追加修改。

## 目标

- 拒绝audit target symbolic link。
- 拒绝任一已存在parent component symbolic link。
- 拒绝非directory parent component。
- 拒绝非regular target。
- 拒绝link count不为1的hard-linked target。
- mkdir前后重复检查现有path components。
- 最终open在支持的平台使用O_NOFOLLOW。
- opened descriptor在write前再次fstat。
- rotation使用lstat且遵守同一target约束。
- 安全拒绝经Phase499 warning暴露，不改变工具事实。

## Path Component Gate

`assertSafeAuditPath`从resolved path root开始逐级lstat。已存在的parent必须是real directory，任何symlink立即拒绝；最终target若存在，必须是regular file且 `nlink === 1`。遇到首个ENOENT后返回，由受限mode mkdir创建缺失目录，随后再次执行完整检查。

## Final Open Boundary

Append不再使用path-based `appendFile`。sink以 `O_APPEND | O_CREAT | O_WRONLY` 打开文件，并在平台提供时加入 `O_NOFOLLOW`。取得FileHandle后执行fstat，只有single-link regular file才允许write。即使target在前序lstat后被替换为symlink，no-follow open也会失败；hard-link替换由descriptor nlink检查拒绝。

## Rotation Boundary

Capacity rotation用lstat读取current generation，拒绝symlink、non-file或multi-link target后才允许rename。Rotated `.1` 通过unlink自身路径后替换，不跟随其symlink target。所有检查与rename仍位于serialized write tail。

## 威胁模型边界

该阶段覆盖稳定预置link和final target替换，不宣称提供通用openat-style目录capability。若攻击者可以在检查与open之间并发替换父目录本身，仍应依赖受信任目录ownership、ACL、容器mount或操作系统sandbox。文档明确要求audit目录不由不受信任进程写入。

## 验收标准

- file symlink record被拒绝。
- symlink target内容保持不变。
- parent directory symlink record被拒绝。
- link外目录不生成audit文件。
- hard-linked target被拒绝且原文件保持不变。
- directory target被拒绝为non-regular。
- normal append与rotation tests保持。
- failure继续可由Host registry转换为audit_warnings。
- focused、TS全量、Python全量和integration通过。

## 实现结果

- 新增逐component `assertSafeAuditPath`。
- append改为no-follow FileHandle并执行fstat/nlink检查。
- rotation改用lstat及regular/non-linked约束。
- tests覆盖file symlink、parent symlink、hard link、directory target与victim unchanged。
- README、SECURITY、protocol和audit env example同步no-follow边界。
