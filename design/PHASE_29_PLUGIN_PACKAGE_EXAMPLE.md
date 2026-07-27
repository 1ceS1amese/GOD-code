# Phase 29: Plugin Package Example

Phase29 将原来的单文件 `demo-plugin/plugin.json` 扩展为一个可验证的 manifest-only plugin package 示例。

本阶段仍然不执行 plugin 自带代码，不新增 marketplace，不改变 Plugin / Skill runtime 加载语义。

## 示例包内容

`examples/plugins/demo-plugin/` 包含：

- `plugin.json`：声明式 manifest。
- `README.md`：包布局、tool contract、验证命令和 runtime 边界。
- `fixtures/echo-input.json`：`plugin.demo.echo` 的有效输入示例。
- `fixtures/echo-output.json`：host-provided handler 可返回的输出示例。

`examples/plugins/README.md` 说明当前 examples 的 manifest-only 边界和常用检查命令。

## 边界

- 示例包不包含可执行 plugin-owned code。
- tool handler 必须由 host 显式绑定。
- 执行仍走 `HostToolRegistry.executeRequest(...)`，继续受 permission / audit / cancel 约束。
- extra docs / fixtures 不参与 manifest parser。

## 验收

- TS unit 覆盖 demo plugin package 目录 validate、README 和 fixtures。
- Integration 覆盖目录级 `plugins validate` 和 fixture 一致性。
- CLI smoke 覆盖 packaged demo plugin validate、README 边界说明和 fixture 一致性。
- `./tools/check.sh` 全量通过。
