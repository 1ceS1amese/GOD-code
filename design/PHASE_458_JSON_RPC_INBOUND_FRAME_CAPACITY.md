# Phase458 JSON-RPC Inbound Frame Capacity

## 状态

代码、测试与文档已完成。

## 审计结论

Phase456-457 限制了 async request和notification consumers，但 `handleChunk`仍会同步遍历一个任意大的 data chunk，并为每条完整line创建独立 `handleLine` Promise。大量快速invalid/response frames可在microtask settlement前形成无界任务；少量接近1 MiB的慢handler frames也可让总保留输入达到数百MiB。单帧上限不等于in-flight总量上限。

## 目标

- 同时限制尚未完成 `handleLine` 生命周期的frame数量和输入字节。
- admission发生在创建handleLine Promise之前。
- counters覆盖parse、route、consumer和response lifecycle。
- normal/error settlement均精确释放frame/byte ownership。
- overflow停止当前chunk后续解析并终止transport。
- close后 `handleChunk` 不再继续遍历remainder。

## Capacity Contract

```text
JSON_RPC_MAX_INBOUND_FRAMES_IN_FLIGHT = 512
JSON_RPC_MAX_INBOUND_BYTES_IN_FLIGHT  = 4 MiB
```

字节按去除newline前的原始frame content UTF-8长度计算，包含可被trim的外围空白。空行不进入admission。任一上限越界时产生 `JSON-RPC inbound frame capacity exceeded.` diagnostic并关闭peer。

## Terminal Overflow Semantics

这里不能像notification capacity一样静默drop，因为被丢弃frame可能是request，peer无法在不知道是否完成处理的情况下继续保证correlation。也不能像单个request admission一样可靠回复，因为overflow发生在通用frame dispatch之前。因此overflow属于terminal framing/resource failure：停止当前chunk，解除transport listeners并reject本端pending requests。

已接纳的异步consumer不会被强制取消，但其frame/byte counters在最终settlement时继续归还；任何迟到response send会被closed gate拒绝。

## 验收标准

- 同一reader turn的第513个未settle frame触发terminal close。
- frame overflow产生protocol diagnostic。
- 4个约900 KiB慢notification可被跟踪且不越过4 MiB。
- settlement后frame/byte counters归零并可继续接纳输入。
- 第5个约900 KiB frame触发byte overflow close。
- overflow后已接纳任务settle时accounting归零。
- TS、Python全量和integration保持通过。

## 实现结果

- TS新增frame/byte in-flight constants与counters。
- `handleChunk`在closed gate建立后立即停止。
- 新增 `dispatchInboundLine` 统一执行admission、terminal overflow和finally release。
- Tests覆盖frame flood、byte accounting、release/reuse和terminal byte overflow。
