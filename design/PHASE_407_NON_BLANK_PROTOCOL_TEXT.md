# Phase407 Non-Blank Protocol Text

## 状态

代码、测试与文档已完成。

## 审计结论

Phase399/404 要求 identifiers 和 error text 非空，但实现仅检查 truthiness/length。纯空格、tab 或换行字符串仍可作为 session/turn/tool IDs、工具名或 error code/message，造成不可读日志、关联歧义和无诊断价值错误。

## 目标

- 将协议身份字段和 error code/message 从 non-empty 提升为 non-blank。
- TS/Python 使用 trim/strip 后至少一个字符的相同规则。
- 不自动修改合法原字符串，避免隐式重写 provider IDs 或错误文本。
- 在任何 side effect/executor dispatch 前拒绝空白 identity。

## Contract

以下字段必须是 string 且 trim/strip 后非空：

- session_id
- turn_id
- tool_call_id
- tool_name
- ToolExecutionError.code
- ToolExecutionError.message

Leading/trailing whitespace 不会被自动删除；只要字符串包含至少一个非空白字符即保持原值并继续执行。

## 实现

- TS 新增共享 `isNonBlankString`，Host parsers 与 error validator 共用。
- Python TurnEngine identity validation 使用 `strip()`。
- Python ToolExecutionError constructor 使用 `strip()`。
- 标准 provider parser 的更早校验保持不变，最终 Engine defense 捕获 whitespace-only adapter output。

## 验收标准

- Host 拒绝 whitespace turn ID 和 tool call ID。
- Engine 拒绝 whitespace tool ID/name，且无 tool side effect。
- TS/Python error construction 拒绝 whitespace code/message。
- 合法含非空白字符的原值不被规范化。
- 完整 TS/Python/integration 校验通过。

## 实现结果

身份与错误文本不再允许视觉上为空的协议值，同时保持 wire values 的原样传递原则。
