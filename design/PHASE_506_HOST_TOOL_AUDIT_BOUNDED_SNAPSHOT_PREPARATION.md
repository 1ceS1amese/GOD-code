# Phase506 Host Tool Audit Bounded Snapshot Preparation

## 状态

代码、测试与文档已完成。

## 审计结论

Phase500的byte cap在完整JSON line形成后检查，Phase505的descriptor walker也没有计算预算。超深event可在递归snapshot时制造stack pressure，超宽array/object可在encoding前消耗大量CPU和heap；单个明显超过maxBytes的string仍会先被复制进snapshot和JSON output，再被最终capacity gate拒绝。

## 目标

- Snapshot最大depth固定为64。
- Snapshot最大value/slot预算固定为100000。
- 普通data value、敏感redacted value和sparse array slot均计数。
- 深/宽限额在JSON encoding前拒绝。
- 单个string value超过record maxBytes时提前拒绝。
- 单个object key超过record maxBytes时提前拒绝。
- 最终encoded line继续执行精确UTF-8 byte cap。
- 限额失败返回rejected Promise并沿Phase499形成audit warning。
- 失败不创建record、不轮转文件，也不毒化后续write tail。
- 不改变redaction、path、mode和tool result语义。

## Depth Boundary

Walker从AuditEvent root的depth 0开始，每次进入nested data value增加depth。超过64时立即抛出稳定错误，不继续读取更深descriptor。该上限高于正常protocol event结构，同时把递归调用控制在远低于常见JavaScript stack极限的范围。

## Node Boundary

每次snapshot value消耗一个node。Sensitive property虽然不读取原value，但marker slot仍显式消费预算；array hole也消费预算，避免使用超大sparse length绕过。超过100000时立即停止。Node是preparation work unit，不等价于JSON字节或对象数量。

## Scalar Byte Preflight

每个string value和enumerable object key在复制时计算UTF-8 bytes。若单项自身已大于sink `maxBytes`，完整record不可能满足capacity contract，因此直接复用`Audit record exceeds GOD_CODE_AUDIT_MAX_BYTES.`错误。该预检查只处理确定超限的单项；组合后的精确line size仍由Phase500 gate决定。

## 验收标准

- 70层nested input在encoding前因depth gate拒绝。
- 100000元素宽数组连同event wrapper因node gate拒绝。
- 两个失败事件均不写入文件。
- 同一sink随后可写入合法recovery event。
- 文件只包含recovery event。
- descriptor redaction、circular recovery、rotation、path和mode tests保持。
- TypeScript、Python和integration全量回归通过。

## 实现结果

- 新增公开snapshot depth/node constants和per-record state。
- Walker覆盖普通值、redacted slot和array hole计数。
- 新增key/string byte preflight并复用capacity error。
- tests覆盖depth、width和post-limit recovery。
- README、SECURITY、protocol、architecture和extension docs同步资源边界。
