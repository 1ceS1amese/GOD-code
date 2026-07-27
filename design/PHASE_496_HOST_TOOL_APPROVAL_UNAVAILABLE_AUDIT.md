# Phase496 Host Tool Approval Unavailable Audit

## 状态

代码、测试与文档已完成。

## 审计结论

HostToolRegistry在permission policy返回 `prompt` 且没有配置approval prompt时，会从 `executeRequest` 内部早退并直接返回permission_denied。该分支保留过时的“phase 1未实现”错误文本，而且没有生成ToolApprovalDecision或 `tool_approval` audit event。相同prompt decision在配置prompt时则拥有完整approval审计，导致安全决策链因运行配置不同而缺项。

## 目标

- 所有policy prompt decisions进入统一approval boundary。
- 未配置prompt规范化为deny/source=unavailable。
- prompt调用异常规范化为deny/source=unavailable。
- unavailable decision必须记录 `tool_approval`。
- 拒绝结果继续使用permission_denied contract。
- unavailable路径绝不执行tool handler。
- unavailable路径不运行after-policy。
- audit顺序固定为requested、decision、approval、finished。
- 移除过时phase 1错误措辞。

## Unified Approval Boundary

`executeRequest`不再检查 `approvalPrompt` 并自行早退。policy返回prompt后始终调用 `requestApproval`：有prompt时调用实际交互接口；无prompt时返回 `deny/unavailable`；prompt throw或reject时也转换为 `deny/unavailable`。调用方随后无条件记录 `tool_approval`，再按allow/deny进入既有执行或拒绝分支。

## Audit Semantics

每个prompt decision现在具有完整四阶段审计：

1. `tool_requested`
2. `tool_decision`，记录policy要求prompt
3. `tool_approval`，记录interactive、non_interactive或unavailable结果
4. `tool_finished`，记录最终工具结果

unavailable denial与用户主动deny都不产生tool side effect，但source字段允许审计消费者区分拒绝原因。

## 验收标准

- 无approval prompt时返回permission_denied。
- 错误消息明确为approval未配置，不再引用phase 1。
- audit包含source=unavailable的tool_approval。
- approval prompt抛错时同样记录unavailable decision。
- prompt异常文本进入permission_denied reason。
- unavailable路径不创建目标文件或执行命令。
- interactive allow/deny原有行为保持。
- focused、TS全量、Python全量和integration通过。

## 实现结果

- 删除 `executeRequest` 中missing-prompt早退分支。
- 统一复用 `requestApproval` unavailable normalization。
- missing prompt和prompt exception均进入tool_approval审计。
- 更新过时测试语义并新增prompt failure审计测试。
