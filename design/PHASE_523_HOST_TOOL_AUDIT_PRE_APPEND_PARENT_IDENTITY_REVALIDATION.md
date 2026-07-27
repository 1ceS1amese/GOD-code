# Phase523 Host Tool Audit Pre-Append Parent Identity Revalidation

## 状态

代码、测试与文档已完成。

## 审计结论

Phase522在POSIX full的post-write directory sync阶段绑定parent identity，但发现replacement时record可能已经在替换目录中创建和写入；buffered与data没有post-write parent descriptor阶段。Missing expectation已经携带trusted parent identity，因此应在O_EXCL create之前对所有durability policy重验parent。

## 目标

- Missing current create前重验immediate parent identity。
- Gate适用于buffered、data和full。
- Parent必须仍为真实directory。
- Parent dev/ino必须匹配missing expectation。
- Missing parent、non-directory、symlink或safe-directory replacement稳定拒绝。
- Refusal发生在current file create和record write之前。
- 保留Phase522 full post-write descriptor identity binding。
- Existing append继续依赖current file identity，不新增parent check。
- 不改变O_EXCL、capacity、rotation或sync语义。

## Pre-Append Gate

`appendAuditLine`在处理missing expectation时，首先调用：

```text
assertAuditParentDirectoryIdentity(filePath, expectation.parentIdentity)
```

Helper对`path.dirname(filePath)`执行lstat：

- ENOENT：稳定parent changed error。
- Symlink或其他non-directory：稳定parent changed error。
- Directory dev/ino mismatch：稳定parent changed error。
- Identity一致：继续计算O_EXCL create flags并打开current。

稳定错误为：

```text
Audit parent directory changed before append.
```

该错误不包含path或filesystem identity值。

## All-Durability Coverage

Parent safety与durability policy无关。Buffered和data虽然不执行directory fsync，也不能把audit record写入shared inspection后出现的替换目录。因此pre-append gate位于durability分支之前，所有policy共享。

Full仍保留Phase522 post-write binding：pre-check覆盖inspection到create前的稳定replacement；post-write directory descriptor binding覆盖pre-check之后、metadata sync之前发生的replacement。两者分工不同，不能互相替代。

## Replacement Test

测试预创建空parent并为missing current执行record。通过lstat spy在第四次parent inspection，即rotation preparation已完成而pre-append gate即将运行时，把原parent rename到保留路径并创建新的真实replacement directory。Pre-check看到新dev/ino并拒绝；原parent和replacement parent均保持为空，证明没有current file被创建或record被写入。

## TOCTOU Boundary

Pre-check与path-based O_EXCL open之间仍存在短窗口。Node.js当前没有portable openat-style create relative to a held directory descriptor。O_EXCL防止target entry抢占；final file descriptor gates验证created target；POSIX full post-sync binding检测后续parent replacement。部署仍必须用可信ownership/ACL约束parent mutation。

## 验收标准

- Missing append在open前调用parent identity gate。
- Gate验证directory type和dev/ino。
- Stable replacement为真实directory时也拒绝。
- Refusal前不创建current file。
- Original和replacement parent均无audit record。
- Buffered policy同样受保护。
- Existing append、full metadata sync、rotation和path tests保持。
- TypeScript、Python和integration全量回归通过。

## 实现结果

- 新增`assertAuditParentDirectoryIdentity`。
- Missing append在O_EXCL flags/open前调用shared gate。
- ENOENT/type/identity drift统一映射stable error。
- Test覆盖真实parent replacement和no-create/no-write结果。
- README、SECURITY、protocol、architecture和extension docs同步pre-append boundary。

## Phase548 加固

Phase548的pre-append gate同时比较logical parent path、pinned descriptor和inspection identity；随后O_EXCL create从该descriptor解析basename。Parent在gate与open之间replacement时，empty current最多出现在original pinned directory，不会创建到replacement directory。
