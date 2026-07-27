# Phase414 Not-Found Lease Cleanup

## 状态

代码、测试与文档已完成。

## 审计结论

Phase413 让 turn_finished 遵守 Host request lease，但 public cancel 收到 Engine `not_found` 时仍直接删除 controller。若 Host request 正在执行而 Engine 已不再追踪该 turn，直接删除会绕过 lease invariant，允许同身份晚请求创建新 controller，并使 finished state 无法持续到 in-flight result settle。

## 目标

- `not_found` cleanup 与 turn_finished 使用同一 finish lifecycle。
- 无 in-flight request 的 pre-cancel tombstone仍立即回滚。
- 有 in-flight request 时保留 aborted controller 与 finished marker。
- 最后一个 lease 释放后清理全部状态。
- Late executor outcome 继续受 Phase412 cancellation precedence 控制。

## Contract

Public cancel 仍先 abort/create controller。Engine response 为 `not_found` 时调用 `finishTurn(session, turn)`，而不是直接删除 map entry：

- count=0：立即删除 controller/marker。
- count>0：保持 abort、加入 finished set、等待 finally release。

该语义将 `not_found` 解释为 Engine lifecycle 已结束，而不是 Host 可忽略仍存在执行的证明。

## 验收标准

- 无 request 的 not_found cancel 后 map 为空。
- In-flight request 下 not_found 后 controller 仍存在且 finished marker 存在。
- Executor late success 对 Engine 可见为 tool_cancelled。
- Request settle 后 controller/marker 清空。
- Phase413 turn_finished lease test 保持通过。
- 完整 TS/Python/integration 校验通过。

## 实现结果

- `cancelTurn` not_found branch 统一委托 `finishTurn`。
- 新增 not-found-before-result race contract test。
