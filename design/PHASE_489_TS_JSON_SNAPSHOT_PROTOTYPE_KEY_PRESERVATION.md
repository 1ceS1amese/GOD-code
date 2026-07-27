# Phase489 TS JSON Snapshot Prototype-Key Preservation

## 状态

代码、测试与文档已完成。

## 审计结论

Phase486/488的snapshot使用 `result[key] = entry` 写入plain object。对own JSON key `__proto__`，该语句调用Object.prototype legacy setter而不是创建data property：新对象原型被替换、key从own entries中消失，writer随后因non-plain prototype返回Invalid outbound。合法JSON键因此无法round-trip，并形成局部prototype manipulation风险。

## 目标

- 所有JSON object key按own data property创建。
- `__proto__` 不触发prototype setter。
- `constructor` 保持普通own JSON value。
- nested prototype-like keys同样保真。
- snapshot prototype保持Object.prototype。
- writer plain-object validation继续通过。
- params、notification和handler result均可round-trip。
- 不产生全局prototype pollution。

## Data Property Materialization

object snapshot对每个entry调用 `Object.defineProperty`，descriptor固定为enumerable、configurable、writable data property。该操作绕过继承setter并保持常规JSON.stringify/Object.entries行为。snapshot仍使用普通 `{}`，因此对常规调用方保持Object.prototype兼容。

## Wire Compatibility

JSON.parse会把 `__proto__` 创建为own property；snapshot现在保持同样语义。outbound validator看到标准Object.prototype，JSON.stringify输出原键，远端JSON.parse重建own data。handler result snapshot复用同一helper，因此双向response也保持。

## 验收标准

- Phase488前的`__proto__` params复现为Invalid outbound。
- 修复后request params成功发送。
- handler result中的`__proto__`和`constructor`完整返回。
- nested `__proto__`保持own property。
- notification params保持相同语义。
- 所有snapshot prototype仍为Object.prototype。
- `{}`不出现polluted属性。
- focused、TS全量、Python全量和integration通过。

## 实现结果

- JSON object snapshot改用explicit data descriptors。
- 添加request/result/notification prototype-like key round-trip测试。
- 验证nested key、prototype identity和global non-pollution。
