# Phase483 TS JSON-RPC Handler Error Response Preparation Fallback

## 状态

代码、测试与文档已完成。

## 审计结论

handler抛出的JsonRpcError会先normalize并验证，再交给通用writer。动态data getter可以在首次validation返回合法值，随后在writer重复schema validation或JSON.stringify时抛错。Phase482虽将serialization exception映射为-32603，但该error发生在dispatchRequest catch内部的response send中，会继续向handleLine传播并terminal close responder；requester因transport未主动结束而只能timeout。

## 目标

- 捕获handler error response的二次validation drift。
- 捕获handler error response的serialization failure。
- 分别发出具体protocol diagnostic。
- 改发plain handler contract -32603 response。
- responder保持open。
- requester获得确定error而非timeout。
- 后续request仍可成功。
- peer已closed时不覆盖terminal cause。

## Final Settlement Fallback

`sendErrorResponseWithSizeFallback` 现在处理三类pre-write failure：oversized error继续回退output-size error；open peer上的invalid outbound和output encoding failure回退handler contract error。fallback payload是内部固定plain object，不保留原始动态data。

## Terminal Precedence

invalid/encoding fallback仅在 `!closed` 时执行。若getter副作用触发close，send抛出的terminal Error不会被message分类转换，继续进入既有first-cause lifecycle。这样recovery只覆盖局部response preparation failure，不复活terminal peer。

## 验收标准

- error data第3次读取失败覆盖writer二次validation drift。
- error data第6次读取失败覆盖JSON.stringify failure。
- 两种情况请求方均收到-32603 handler contract error。
- protocol_error分别报告invalid outbound或encoding failure。
- responder保持open且后续request成功。
- focused、TS全量、Python全量和integration通过。

## 实现结果

- 新增invalid outbound error classifier。
- error response fallback覆盖validation drift和encoding failure。
- closed gate保持terminal cause precedence。
- focused test以两个读取阶段验证settlement和peer recovery。
