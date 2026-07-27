# Phase511 Host Tool Audit Path Readiness Inspection

## 状态

代码、测试与文档已完成。

## 审计结论

Phase510可以预检配置语法，但不能判断当前filesystem path是否包含symlink、non-directory component、hard-linked target、non-regular target或不可写parent。用户只能在第一次tool audit write时收到warning，也无法区分“目标尚未创建但可用”和“路径安全边界失败”。

## 目标

- 新增`god-code audit inspect-path [--json]`。
- 提取runtime和diagnostic共享的no-follow path inspector。
- 报告resolved absolute target。
- 报告target是否存在。
- 报告最近存在的真实目录。
- 报告所有尚未存在的component path。
- 报告nearest existing directory write access。
- Existing target报告POSIX mode和private-mode判断。
- Broad POSIX mode只warn，不修改文件。
- Symlink、hard-link、non-directory parent和non-regular target返回error。
- Disabled audit返回warn/skipped。
- Invalid config在path access前返回error。
- Inspection不创建、打开、修改、删除、轮转或写入target。
- Doctor不隐式执行filesystem path inspection。

## Shared Runtime Inspector

`inspectJsonlAuditPath(filePath)`从resolved root逐component执行`lstat`。在第一个ENOENT后不继续访问filesystem，只构造剩余absolute missing chain。所有已存在parent必须为真实directory；target若存在必须为single-link regular file。Symlink在parent或target位置均立即拒绝。

结果包含：

- `filePath`
- `targetExists`
- `nearestExistingDirectory`
- `missingComponents`
- `targetMode`（existing）
- `targetPrivateMode`（non-Windows existing）

JsonlAuditSink内部`assertSafeAuditPath`直接调用该inspector并丢弃metadata，确保diagnostic与write path不复制安全规则。

## CLI Readiness Layer

`inspectAuditPath`先复用Phase510 config report。Disabled返回warn/skipped；config error返回path error且不访问filesystem。Valid enabled config调用shared inspector，再对nearest existing directory执行`W_OK` access probe。

Missing target在目录可写时为ok，并说明未来创建位置。Existing safe target为ok。Existing broad POSIX mode为warn，说明实际write会由Phase502收敛为owner-only。Directory不可写或shared inspector error使report `ok:false`。

## No-Mutation Guarantee

该命令允许的filesystem操作仅为metadata/readiness查询：`lstat`和directory `access(W_OK)`。它不调用mkdir、open target、chmod、rename、rm、unlink、append或sync。Link target不会被读取或跟随，existing file content和mode保持不变。

## 边界

`access(W_OK)`反映当前进程身份下的即时检查，不保证后续write时ACL、mount或目录状态不变化。Inspection与actual write之间仍存在时间窗口；runtime在每次record时继续重新执行Phase501检查。Cross-process writer和并发parent replacement边界保持Phase507/501定义。

## 验收标准

- Disabled path report为warn/skipped。
- Missing nested target返回完整missing chain和nearest directory。
- Inspection不创建missing parent。
- Existing0666 POSIX target为warn，mode和content保持不变。
- File symlink返回error，victim content保持不变。
- Human/JSON renderer稳定。
- CLI `audit inspect-path --json` smoke通过。
- Existing sink symlink/hard-link/non-regular tests继续通过。
- TypeScript、Python和integration全量回归通过。

## 实现结果

- 新增exported `JsonlAuditPathInspection`与`inspectJsonlAuditPath`。
- Runtime assert复用shared inspector。
- CLI audit模块新增path report、inspection和human/JSON renderer。
- Main CLI新增inspect-path dispatch和help entries。
- Tests覆盖disabled、missing、broad-mode和symlink no-mutation路径。
- README、SECURITY、protocol和audit env example同步readiness边界。

## Phase549 加固

Phase549让runtime直接消费本阶段inspection给出的nearest existing directory path、dev/ino和missing chain语义。Record不再对target parent执行recursive path mkdir，而是固定nearest directory descriptor并逐级exact-create、open和绑定missing parent components；CLI inspection仍保持纯只读，不创建missing path。
