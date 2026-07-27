# Phase478 Python JSON-RPC Outbound Preparation Terminal Precedence

## 状态

代码、测试与文档已完成。

## 审计结论

Phase477统一了public entry的terminal precedence，但 `_send_message(require_running=True)` 仍先执行outbound schema validation、JSON encoding和size check，最后才在write lock内检查stop。直接进入已停止send时，invalid payload可遮蔽terminal cause；encoding期间并发stop时，oversized错误也可能先返回。writer boundary应继续维持同一lifecycle precedence。

## 目标

- running-required send在frame preparation前检查stopped状态。
- invalid outbound错误提交前重新检查stop。
- oversized outbound错误提交前重新检查stop。
- encoding期间发生stop时返回canonical code/message/data。
- terminalized frame不得进入TextIO write/flush。
- write-lock gate继续作为最终admission check。
- 非running-required response/fallback发送保持既有settlement能力。

## Preparation Gates

`_send_message` 对 `require_running=True` 使用三层terminal observation：

1. payload validation前；
2. invalid/oversized本地错误分支提交前；
3. write lock内最终admission时。

第一层处理已停止调用，第二层处理validation/encoding阶段的并发stop，第三层处理准备完成到实际write之间的竞态。

## Compatibility

request/notify仍由public validation提供正常参数错误。handler response、error fallback等内部发送使用默认 `require_running=False`，即使shutdown handler已触发stop，也可完成当前已接纳request的response，不改变既有shutdown协议。

## 验收标准

- 已停止connection上的running-required malformed frame返回terminal cause。
- encoding触发stop并产生oversized结果时返回terminal cause而非size error。
- code/message/data保持完整快照。
- 该frame不会写入output。
- open-stateinvalid/oversized验证与内部response路径保持。
- Python、TS和integration全量通过。

## 实现结果

- running-required send增加preparation-entry terminal gate。
- invalid和oversized分支增加concurrent-stop recheck。
- focused test覆盖pre-stopped malformed frame和stop-during-encoding oversized frame。
