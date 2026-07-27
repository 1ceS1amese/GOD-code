# Phase525 Host Tool Audit Pre-Write Current Path Identity Revalidation

## 状态

代码、测试与文档已完成。

## 审计结论

Phase518把final append expectation绑定到最终descriptor open，Phase524又为missing create补了post-create parent gate；但descriptor打开后，current entry仍可能在record write前被rename、replacement或删除。Descriptor会继续指向原file object，既有type、identity和capacity检查仍可通过，record因而可能写入已经从配置path移走的文件。

## 目标

- 从最终validated descriptor保存dev/ino identity。
- Mode convergence后、record write前再次no-follow lstat current path。
- Path必须保持regular file、`nlink === 1`且dev/ino与descriptor一致。
- Gate同时覆盖existing和exclusive-created current。
- Post-open replacement、rename、disappearance、symlink和multi-link漂移稳定拒绝。
- Stable error为`Audit file changed before record write.`。
- 拒绝发生在任何record bytes写入之前。
- 保持expectation、capacity、parent identity和durability语义。

## Final Pre-Write Binding

Final append pipeline现在按以下顺序执行：

1. 按existing/missing expectation选择non-create或O_EXCL open。
2. Descriptor验证regular、single-link和expected identity。
3. Missing current重验parent identity。
4. Descriptor size执行final capacity decision。
5. POSIX mode收敛为0600。
6. Current path执行no-follow lstat并与descriptor identity绑定。
7. 只有全部gate通过后才写入record并执行配置的durability policy。

Path gate不跟随symlink，也不接受另一个安全regular file。只要current entry不再解析到已打开descriptor的同一single-link object，本次record就拒绝。

## Replacement Tests

Existing test先持久化首条record，在final O_APPEND descriptor打开后把current rename到保留路径，并在原path写入replacement regular file。Pre-write gate发现dev/ino mismatch；moved original只保留首条record，replacement内容保持不变。

Missing test在O_EXCL创建empty current后执行同样replacement。Gate拒绝首条record；moved created file保持size 0，replacement内容保持不变，证明敏感record没有进入任一对象。

## 边界

- Gate覆盖final descriptor open到最后一次current path inspection之间的稳定entry漂移。
- 最后一次lstat到write系统调用之间仍有极短竞态；Node.js当前没有portable openat-style append/create或目录entry lock。
- Descriptor已经固定file object，短窗口内的path replacement不会改变write target；可信parent ownership、ACL或外部single-writer约束仍是完整部署边界。
- 该阶段不增加跨进程locking，也不验证既有JSONL内容完整性。

## 验收标准

- Existing和missing append都执行相同pre-write path/descriptor identity gate。
- Path type、single-link、device和inode全部参与判断。
- Post-open replacement稳定返回`Audit file changed before record write.`。
- Existing moved file不新增record，replacement内容不变。
- Missing moved file保持empty，replacement内容不变。
- Parent、capacity、durability、rotation和normal append tests保持。
- TypeScript、Python和integration全量回归通过。

## 实现结果

- 新增内部`assertAuditFilePathIdentity` helper。
- Final descriptor identity只计算一次并复用于expectation与pre-write path binding。
- Pre-write gate位于mode convergence与record write之间。
- Tests覆盖existing和exclusive-created current的真实post-open replacement。
- README、SECURITY、protocol、architecture、internal design、project plan和extension docs同步Phase525边界。

## Phase548 加固

Phase548只改变final descriptor的lookup来源：existing/missing current都从pinned parent anchor打开；写入前仍以canonical logical current path执行本阶段regular/single-link/dev-ino gate，因此parent或leaf drift继续拒绝record write。

## Phase552 后续加固

Phase552可在mode convergence等stable pre-write failure后删除本次O_EXCL创建的empty current，但会先重复执行本阶段path/descriptor identity proof。真实rename/replacement case无法通过该proof，因此moved empty original和replacement entry都不会被cleanup误删。
