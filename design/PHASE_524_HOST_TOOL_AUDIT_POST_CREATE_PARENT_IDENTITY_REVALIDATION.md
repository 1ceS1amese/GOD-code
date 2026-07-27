# Phase524 Host Tool Audit Post-Create Parent Identity Revalidation

## 状态

代码、测试与文档已完成。

## 审计结论

Phase523在missing current的O_EXCL open之前重验parent identity，但parent仍可在pre-check与create系统调用之间被替换。O_EXCL会安全创建并绑定new file descriptor，却可能把后续敏感audit record写入已经被rename移走的原目录。Phase522 full post-write gate只能在写入后发现该情况，buffered/data没有该阶段。

## 目标

- O_EXCL成功后再次重验parent identity。
- Gate位于record write之前。
- Gate适用于buffered、data和full。
- New current descriptor先通过regular/single-link验证。
- Parent missing/type/identity drift使用独立稳定错误。
- Failure关闭created descriptor。
- Failure不写入任何audit record bytes。
- 允许最多留下empty private-mode current file。
- 保留pre-create和full post-write parent gates。
- 不改变normal create、rotation、capacity或durability语义。

## Three-Stage Parent Model

Missing current pipeline现在有三层parent identity检查：

1. **Pre-create**（Phase523）：O_EXCL open前拒绝稳定replacement。
2. **Post-create / pre-write**（Phase524）：O_EXCL成功后拒绝check-create窗口内replacement。
3. **Post-write metadata sync**（Phase522，POSIX full）：拒绝更晚replacement并避免sync错误directory。

三层都使用Phase522 missing expectation携带的same expected dev/ino，但错误语义和side-effect时点不同。

## Post-Create Gate

`appendAuditLine`完成exclusive open并执行`validateAuditFileHandle`后，如果expectation为missing，再调用：

```text
assertAuditParentDirectoryIdentity(
  filePath,
  expectation.parentIdentity,
  "Audit parent directory changed before record write."
)
```

该调用发生在capacity revalidation、POSIX chmod、`writeFile`和durability sync之前。Mismatch抛出稳定错误，finally关闭new file descriptor。

## Empty-File Containment

O_EXCL create本身已发生，且create mode为0600。Parent mismatch时实现不尝试通过path unlink该文件，因为parent可能已被rename/replaced，盲目unlink可能作用于错误entry。安全结果是：

- 原始renamed parent可能包含一个size 0、mode 0600的current file。
- Replacement parent不包含audit file。
- 无structured event、command、path或tool result bytes写入。

该残留可由部署方在可信目录中清理；相比写入敏感record，empty-file containment是更安全的失败语义。

## Replacement Test

测试通过parent lstat计数在第五次inspection触发replacement：前三次来自path/rotation inspection，第四次是Phase523 pre-create gate，第五次是Phase524 post-create gate。此时O_EXCL已经创建current。原parent被rename并在原path创建replacement directory；post-create gate发现dev/ino mismatch并拒绝。Replacement为空，renamed parent只包含size 0的audit file。

## TOCTOU Boundary

Post-create gate通过后到write之间仍是极短用户态窗口，但write目标已经由open descriptor固定；后续parent path replacement不会改变record写入的file object。是否希望在目录被移走后仍写入该descriptor取决于更强openat-style parent capability；当前full post-write gate会报告metadata identity drift，buffered/data依赖可信parent ownership。

## 验收标准

- Missing O_EXCL open后、write前执行second parent identity gate。
- Stable error明确为before record write。
- Check-create窗口replacement为真实directory时稳定拒绝。
- Replacement parent保持为空。
- Original renamed parent最多留下empty file。
- Empty file size为0且不包含audit record。
- Buffered policy同样受保护。
- Pre-create、post-write、rotation和durability tests保持。
- TypeScript、Python和integration全量回归通过。

## 实现结果

- Parent identity helper新增call-site-specific error message参数。
- Missing final descriptor验证后新增post-create parent gate。
- Test覆盖真实check-create replacement和empty-file containment。
- README、SECURITY、protocol、architecture和extension docs同步post-create boundary。

## Phase548 加固

Phase548保留post-create/pre-write parent gate，并让created current从pinned parent anchor取得。Check-create race仍可能在original directory留下empty 0600 file，但replacement parent保持不变，stable error与no-record-write contract不变。

## Phase552 后续加固

Phase552只在logical parent仍绑定pinned descriptor时回收stable pre-commit empty creation。本阶段测试中的check-create parent replacement会使cleanup revalidation拒绝，因此original moved directory仍保留empty 0600 file，replacement保持为空；该安全边界没有被放宽。
