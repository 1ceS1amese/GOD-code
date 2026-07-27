# Phase396 Batch Size Negotiation

## 状态

代码、测试与文档已完成。

## 审计结论

Phase395 协商了 `execute_tools` 布尔能力，但没有表达 Host 容量。Host parser 接受任意长度 batch，第三方 Host 也无法要求 Python scheduler 使用更小 chunk。

## 目标

- Bundled Host 声明并强制最大 batch size。
- Python Engine 读取 Host limit 并限制 scheduler `max_parallel`。
- 缺失或非法 limit 保持兼容默认值。
- 超限请求在执行任何 tool 前被拒绝。

## Capability 与边界

Bundled Host 声明 `execute_tools_max_batch_size: 4`。Python 接受 1..64 的正整数，缺失、boolean、非正数或其他非法值回退为 4。

Host parser 拒绝空 batch 和超过 4 项的 batch。Engine 将协商值用于 `ToolConcurrencyPolicy.max_parallel`，dependency graph 因而在发送前切分 waves。长度 2..limit 的 wave 使用 `execute_tools`，单项尾 wave 使用 `execute_tool`。

## 验收标准

- TS Host 同时声明方法能力和 max size 4。
- 五项 batch 在 Host handler 层返回 `-32602`。
- Engine 保存合法较小 limit，对缺失声明恢复默认 4。
- max size 2 下五个独立 Read 被切为 batch 2、batch 2、serial 1。
- 结果顺序和 scheduler metadata 保持不变。
- 完整 TS/Python/integration 校验通过。

## 实现结果

- 新增 `MAX_EXECUTE_TOOLS_BATCH_SIZE = 4` Host contract。
- Host capability 与 payload parser 共用该上限。
- Engine 保存 `_host_execute_tools_max_batch_size` 并注入 concurrency policy。
- 新增 Host 超限拒绝、capability limit 和 scheduler chunk split 测试。
