# Phase471 Python JSON-RPC Writer Failure Terminalization

## 状态

代码、测试与文档已完成。

## 审计结论

TS writer error/callback/close failure已统一terminal close，Python `_send_message`的outfile `write()`或`flush()`异常此前只向当前调用栈传播。connection保持running，handler registries和其他pending requests继续存活；在broken stdout上这些waiters只能等timeout，后续request/notify还会重复尝试写入。直接在write lock内调用stop又会因Phase466 stop barrier重入同一非递归lock而死锁。

## 目标

- outfile write/flush异常必须terminalize connection。
- 原始writer异常继续向当前调用方传播。
- terminalization唤醒全部其他pending waiters。
- handler registries和residual state按既有stop lifecycle清理。
- 后续public request/notify由stopped gate拒绝，不再触碰outfile。
- stopped gate rejection本身不能误判为writer failure。
- stop调用必须发生在write lock释放后，避免barrier死锁。
- internal response writer failure采用同一terminal语义。

## Writer State Machine

`_send_message`在write lock内区分两个结果：

```text
require_running && stopped -> stopped flag
write/flush exception      -> captured write_error
success                    -> return
```

离开lock后：

- stopped flag转换为 `JsonRpcRequestError(-32000, connection stopped)`，不再次stop；
- write_error触发 `stop()`，然后重抛原exception。

由此stop的write-lock barrier只在当前writer已释放lock后执行。

## Partial Write Semantics

flush failure可能发生在字符已提交给TextIO之后，无法可靠撤回或判断对端是否收到完整frame。因此任一write/flush异常都视为不可恢复transport failure；connection不尝试重试frame，避免重复request副作用或破坏line framing。

## Pending Propagation

writer failure调用Phase464 stop：pending map原子snapshot/clear，每个其他waiter获得 `-32000 JSON-RPC connection stopped.`。当前调用方保留更具体的原始OSError；若当前调用是request，其外层send rollback面对已清空map保持安全幂等。

## 验收标准

- outfile.write抛OSError时当前notify重抛原错误。
- outfile.flush抛OSError时行为相同。
- 两种失败均设置stop event。
- pending map归零且waiter获得stopped response。
- request/notification registries清空。
- post-failure notify获得stopped error而非再次触碰writer。
- 测试不发生write-lock/stop barrier死锁。
- TS、Python全量和integration保持通过。

## 实现结果

- Python writer在锁内capture transport error、锁外terminal stop。
- running-gate stopped rejection与transport error路径分离。
- 原始write/flush exception保持传播。
- Parameterized tests覆盖write和flush failure及完整terminal cleanup。
- TS现有terminal writer语义无需修改。
