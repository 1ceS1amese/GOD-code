# Phase486 TS JSON-RPC Handler Result Safe Snapshot

## 状态

代码、测试与文档已完成。

## 审计结论

TS handler success result原先先经过 `isJsonObject`，随后原始对象再次进入writer schema validation和JSON.stringify。动态getter在第1次读取失败时返回handler contract -32603，第2-3次失败变为generic -32000，第4次失败变为encoding -32603。相同非法result的wire错误随读取阶段漂移，writer也持续引用handler-owned object。

## 目标

- result validation和复制在一次递归遍历内完成。
- 每个动态property只读取一次。
- 输出只包含owned plain JSON tree。
- 拒绝non-finite number、non-plain object和cycle。
- property读取异常统一视为invalid result。
- invalid result稳定返回handler contract -32603。
- 不返回generic -32000或encoding-specific error。
- peer保持open且后续request成功。

## Single-Pass Snapshot

`snapshotJsonObject` 调用递归 `snapshotJsonValue`。scalar直接复制；array按index读取并生成新array；plain object通过一次Object.entries读取并生成新object；ancestors set拒绝cycle。symbol sentinel区分合法null与snapshot failure。

## Stable Writer Input

dispatchRequest只把snapshot交给send。outbound validator、queue accounting、JSON.stringify和Writable因此不再读取原始handler result。snapshot失败沿既有invalid-result diagnostic和固定handler contract response处理。

## 验收标准

- getter第二次读取会抛错，但实际只读取一次。
- 合法动态result返回plain result。
- 首次getter异常返回固定-32603。
- responder不关闭。
- 后续request成功。
- focused、TS全量、Python全量和integration通过。

## 实现结果

- 新增JSON snapshot sentinel与递归snapshot helpers。
- handler success path使用snapshot替代原始result。
- invalid snapshot复用handler contract fallback。
- focused test覆盖single-read、invalid getter和recovery。
