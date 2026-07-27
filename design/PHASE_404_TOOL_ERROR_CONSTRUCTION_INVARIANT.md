# Phase404 Tool Error Construction Invariant

## 状态

代码、测试与文档已完成。

## 审计结论

Phase400 在 wire result validator 中检查 error shape，但 Python `ToolExecutionError` 可直接构造空 code/message 或非 object details；TS 内置工具共用的 `toolError` helper 也没有运行时校验。内部错误生成仍可能绕过 wire contract，直到更晚阶段才失败。

## 目标

- 在 Python error dataclass 构造时强制完整 shape。
- 将 TS error validator 提升为可复用 runtime constructor boundary。
- 让所有内置 Host/MCP/plugin `toolError` 路径立即验证。
- 保持合法错误代码、消息和 details 输出不变。

## Python Contract

`ToolExecutionError.__post_init__` 强制：

- code 是非空字符串。
- message 是非空字符串。
- details 缺失/None 或 dict。

`build_tool_error`、parser 和直接实例化都共享该约束。

## TS Contract

新增导出的 `asToolExecutionError` runtime validator。`toolError` factory 在返回 failure result 前调用它，因此 Read/Edit/Bash/ListFiles/Search/Write、registry、MCP 和 plugin runtime 的内置错误都在生成点被验证。

## 验收标准

- Python 直接构造空 code、空 message、数组 details 均失败。
- TS direct validator 拒绝空 code/message 和数组 details。
- 所有现有 Host tool tests 在 factory guard 下通过。
- Phase400-403 result contract 保持通过。
- 完整 TS/Python/integration 校验通过。

## 实现结果

- Python error dataclass 新增 `__post_init__`。
- TS 私有 predicate 外新增公共 asserting converter。
- `host_tools/common.ts` 的统一 factory 接入 converter。
- 两侧 direct construction tests 已补齐。
