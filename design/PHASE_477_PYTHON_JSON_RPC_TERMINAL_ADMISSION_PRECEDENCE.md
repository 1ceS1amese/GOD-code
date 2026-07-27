# Phase477 Python JSON-RPC Terminal Admission Precedence

## 状态

代码、测试与文档已完成。

## 审计结论

Phase474-476让post-stop public APIs复用canonical terminal error，但request、notify及handler registration仍先验证method、params或timeout。connection已经停止时，非法新参数会先产生-32600/-32602，遮蔽真正的terminal cause；TS peer则先执行closed gate。生命周期状态应在不再接受任何工作后拥有稳定的错误优先级。

## 目标

- 四类public entry在参数验证前检查stopped状态。
- 已停止连接始终返回canonical code/message/data。
- 统一terminal error复制逻辑，避免各gate漂移。
- request保留pending-lock内的第二次admission gate。
- notify保留writer running gate，覆盖validation期间的并发stop。
- open connection的参数验证行为保持不变。
- handler registry mutation与stop cleanup继续由handler lock串行化。

## Unified Terminal Gate

`_raise_if_stopped` 是post-stop public error的唯一复制边界。它读取first canonical terminal error并为当前调用建立独立data snapshot。request、notify在入口调用；两类registration在handler lock内调用；writer发现stopped后也复用同一helper。

## Error Precedence

当stop已提交时，terminal lifecycle error优先于method/params/timeout validation。对于仍处于running状态的connection，原有validation顺序和错误码保持。若stop与调用并发发生，request的pending-lock gate和send的write-lock running gate继续决定是否能够安全admit。

## 验收标准

- structured terminal cause后使用blank method、非object params和非法timeout发起request，仍返回terminal cause。
- post-stop malformed notify返回terminal cause。
- 两类post-stop malformed registration返回terminal cause。
- code/message/data完整保留并保持snapshot isolation。
- open-state validation tests保持通过。
- Python、TS和integration全量通过。

## 实现结果

- 新增统一 `_raise_if_stopped` lifecycle gate。
- 四类public APIs将stopped check提升到参数验证前。
- request和writer保留并发窗口内的二次gate。
- 新测试覆盖malformed post-stop调用的terminal precedence。
