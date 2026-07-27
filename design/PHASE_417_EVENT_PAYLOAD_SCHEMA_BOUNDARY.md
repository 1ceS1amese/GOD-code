# Phase417 Event Payload Schema Boundary

## 状态

代码、测试与文档已完成。

## 审计结论

Phase416 已封闭 `god_code_event` 的事件类型、身份和 JSON transport shape，但 `payload` 仍统一暴露为 `Record<string, unknown>`。这允许缺失核心字段或状态矛盾的 payload 通过 Host boundary；TUI 也因此把 `tool_call_requested`、`tool_result_received` 和 `god_code_error` 错按扁平字段读取，只能显示 fallback 文本。

## 目标

- 将 `GodCodeEventEnvelope` 改为以 `event_type` 判别的 TypeScript union。
- 在 listener emission 和 lifecycle mutation 前校验每种事件的核心 payload schema。
- 复用已有 ToolCall、ToolExecutionResult、ToolExecutionError 和 TurnResult 不变量。
- 保留 batch scheduler metadata 等额外 JSON-safe 字段的扩展能力。
- 让 headless、REPL 和 TUI 消费者依靠类型收窄读取 payload，不再二次猜测 wire shape。

## Payload Contract

- `session_started`：non-blank `cwd`、`model_adapter`。
- `turn_started`：JSON-safe object，无新增必填业务字段。
- `assistant_delta`：`delta.text` string。
- `assistant_message`：assistant role 与 string content。
- `tool_call_requested`：合法 ToolCall；可选 `execution_mode` 必须 non-blank。
- `tool_result_received`：non-blank tool identity 与合法 ToolExecutionResult。
- `turn_finished`：success 必须带 assistant message；error 必须带 error；cancelled 不得携带二者。
- `god_code_error`：合法 ToolExecutionError。

## Consumer Correction

TUI 现在从真实嵌套结构读取 tool call 名称、result 状态和 error message。Headless/REPL 直接消费已验证的 delta 与 TurnResult，不再通过 `unknown` cast 完成正常控制流。

## 验收标准

- 八种事件的合法 payload 均通过 converter。
- 缺字段、错误角色、非法 tool input/result/error 和矛盾 turn status 均被拒绝。
- Malformed turn_finished 仍不能写 finalized registry 或 emit listener。
- TUI 能显示真实工具名、`ok/error` 状态和 Engine error message。
- TypeScript build、全量测试、Python tests 与跨语言 integration 全部通过。

## 实现结果

- `GodCodeEventEnvelope` 已成为 payload-aware discriminated union。
- `asGodCodeEventEnvelope` 已增加逐事件 payload validator。
- Headless、REPL 与 TUI 已迁移到类型收窄后的直接字段读取。
- Protocol、Engine process 与 TUI tests 已覆盖成功和失败路径。
