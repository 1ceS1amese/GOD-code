# Phase470 JSON-RPC Active Write Close Abort

## 状态

代码、测试与文档已完成。

## 审计结论

Phase453 writer等待Writable callback及必要drain，Phase455 detach transport listeners，Phase467-469完善terminal cleanup；但调用 `peer.close()`时，已经进入 `writeFrame`的active write只监听stream error/close，不观察peer自身close。如果底层Writable永不callback、drain或close，active send Promise永久pending，writeTail后续frames无法settle，Phase454 queue frame/byte accounting也永久占用。

## 目标

- peer close立即reject当前active write，不依赖stream callback/drain/close。
- active write使用close传入error；无error时使用明确close-during-write错误。
- queued writes在active abort后继续展开并命中closed gate。
- active/queued send Promises全部settle。
- frame/byte queue accounting归零。
- writeFrame局部stream listeners和abort registration同步清理。
- 迟到stream callback不得二次settle或抛错。
- terminal write failure原有close语义保持幂等。

## Abort Registry

peer维护当前active writer fail callback集合：

```text
activeWriteAborters: Set<(error) => void>
```

`writeFrame`在注册stream listeners前加入自身fail callback；任一success/failure cleanup均从set删除。serialized writer正常情况下集合最多含一个entry，但set contract避免未来writer策略变化时丢失ownership。

## Close Ordering

close建立closed gate并detach长期transport listeners后，snapshot active aborters并逐个传入terminal error，然后clear set。active write rejection使writeTail恢复链继续推进；每个queued write执行前重新检查closed并reject，不进入Writable。

每个write Promise的existing settlement callback继续负责Phase454 capacity release，因此close不直接修改queued counters，避免与Promise microtask重复释放。

## Late Callback Safety

active abort调用writeFrame的幂等 `fail`，将settled置true并解除error/close/drain listeners。底层Writable之后调用原write callback时，callback只更新局部flag并调用 `finish`；settled gate阻止二次resolve/reject，且不会访问已释放peer registry。

## 验收标准

- Writable接收active frame但不调用callback。
- 第二frame停留在writeTail queue。
- peer close后两个send Promise均立即reject。
- active rejection保留manual close error。
- queued rejection来自closed gate。
- active abort registry归零。
- queued frame/byte accounting归零。
- 迟到callback安全。
- TS、Python全量和integration保持通过。

## 实现结果

- TS新增activeWriteAborters registry。
- writeFrame lifecycle注册/解除active abort callback。
- close主动abort active writer后展开queued closed gates。
- Tests覆盖无stream acknowledgement close、两类rejection、accounting和late callback。
- Python synchronous locked writer不存在等待callback/drain的对应状态机，无需修改。
