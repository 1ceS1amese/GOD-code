# Phase497 Host Tool Post-Policy Result Preservation

## 状态

代码、测试与文档已完成。

## 审计结论

HostToolRegistry在handler返回后调用permission policy `afterExecute`。旧实现若该回调抛错，会以新的 `policy_error` 替换原始ToolExecutionResult。对Write、Edit或Bash而言，副作用可能已经提交，但调用方只看到失败并可能重试；对原本的domain error而言，after-policy异常也会掩盖真正失败原因。

## 目标

- after-policy异常不能覆盖已完成的工具success。
- after-policy异常不能覆盖原始domain error。
- 已提交副作用必须继续报告为成功事实。
- observer failure通过结构化warning显式可见。
- warning包含code、message、phase和tool_name。
- tool_finished audit记录调用方实际收到的增强结果。
- before-policy异常仍保持阻止执行的policy_error语义。
- approval deny和cancellation语义不变。

## Result Precedence

handler返回的ToolExecutionResult是执行事实：`ok: true`表示handler确认完成，`ok: false`表示具体domain/cancellation错误。`afterExecute`发生在该事实之后，只能观察不能撤销。registry因此先保存原始result，再运行after-policy；若observer失败，通过 `attachPolicyWarning` 在output附加warning，而不是构造新的失败结果。

## Warning Contract

warning使用以下结构：

```json
{
  "code": "policy_error",
  "message": "after policy failed",
  "phase": "after_execute",
  "tool_name": "Write"
}
```

成功结果保留原有output字段，失败结果保留原始error code/message/details。两种结果都可以附带 `output.policy_warning`，使caller和audit consumer同时看到工具事实与观察故障。

## 验收标准

- Write提交文件后after-policy抛错，结果仍为ok=true。
- 文件内容与success output保持。
- success output包含policy_warning。
- Read domain failure后after-policy抛错，仍保持file_not_found。
- failed result同样包含policy_warning。
- tool_finished audit中的result与caller结果一致。
- before-policy exception原有policy_error test保持。
- focused、TS全量、Python全量和integration通过。

## 实现结果

- `runAfterPolicy`改为返回warning metadata而非替代ToolExecutionResult。
- 新增 `attachPolicyWarning` 合并原始output和warning。
- `executeRequest`始终以原始handler result为主结果。
- 新增成功副作用与domain failure双路径测试，并验证audit一致性。
