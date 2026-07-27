# Phase502 Host Tool Audit Private File Mode

## 状态

代码、测试与文档已完成。

## 审计结论

Phase498为新建JSONL audit文件传入 `0600` mode，但open的create mode不会修改既有文件。若用户预先创建了group/world-readable audit文件，后续append会继续暴露完整工具事件；若该文件触发Phase500 rotation，宽松mode还会随rename保留到 `.1` generation。

## 目标

- POSIX新建audit文件保持 `0600`。
- POSIX既有current generation在写入前收敛为 `0600`。
- 权限收敛发生在容量判断和rotation之前。
- rename得到的 `.1` generation保持owner-only。
- final append descriptor在write前重复执行权限收敛。
- 权限操作继续复用Phase501 no-follow和regular/single-link validation。
- chmod失败沿Phase499转换为caller-visible `audit_warnings`，不改变工具事实。
- Windows明确依赖ACL，不宣称POSIX mode等价适用。

## Existing Generation Boundary

`rotateIfNeeded`在确认current是single-link regular file后，通过带 `O_NOFOLLOW` 的write-only descriptor重新校验文件并执行 `fchmod(0600)`。该步骤先于size threshold判断，因此无论本次继续append还是rename为 `.1`，既有generation都会先移除group/world mode bits。

## Final Append Boundary

`appendAuditLine`仍以 `O_APPEND | O_CREAT | O_WRONLY | O_NOFOLLOW` 打开target，并使用 `0600` create mode。descriptor通过regular-file和link-count校验后，在实际write前再次执行 `fchmod(0600)`，覆盖文件在前序检查后被合法但宽权限替换的普通场景。

## 平台边界

POSIX mode不是Windows ACL的替代模型。实现只在非Windows平台执行descriptor chmod；Windows继续依赖部署目录和文件ACL。该阶段也不递归chmod既有parent directories，避免意外修改workspace或共享目录权限。受信任目录ownership和Phase501并发替换边界仍然适用。

## 验收标准

- nested audit目录新建为 `0700`。
- 新audit文件新建为 `0600`。
- 预置 `0666` current在append后变为 `0600`。
- 预置宽权限current触发rotation后，current与 `.1` 均为 `0600`。
- ordered append、capacity、no-follow和Host warning tests保持通过。
- TypeScript、Python和integration全量回归通过。

## 实现结果

- 新增descriptor-based existing generation mode enforcement。
- append和pre-rotation路径共享regular/single-link handle validation。
- focused tests覆盖新建目录/文件、既有宽权限文件和rotation代际。
- README、SECURITY、protocol和audit env example同步POSIX/Windows边界。
