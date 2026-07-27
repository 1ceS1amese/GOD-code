# Phase405 Tool Result JSON Safety

## 状态

代码、测试与文档已完成。

## 审计结论

Phase400-404 验证了 result/error 顶层 shape 与状态，但 output/details 内部仍是任意 object。TS executor 可返回 BigInt、undefined、function、NaN、Date 或循环引用；JSON.stringify 会抛错、删除字段、转换值或改变 object shape。Python 内部直接构造也可包含 object、set、NaN 或循环容器，最终在 event/transcript/stdio 序列化阶段失败。

## 目标

- 将 output/details 定义为递归 JSON object，而不是任意语言 object。
- 在进入 JSON-RPC writer、event 或 transcript 前拒绝不安全值。
- 检测循环引用，同时允许合法的嵌套 array/object 和共享非循环引用。
- TS/Python 使用相同 primitive、finite number、array、object 规则。

## JSON-safe Contract

合法嵌套值仅包括：

- null
- string
- boolean
- finite number
- JSON-safe array
- string-keyed JSON-safe plain object

禁止：

- undefined/function/symbol/BigInt
- NaN/Infinity
- Date、class instance 和其他非 plain object
- Python arbitrary object/set/tuple/non-string dict key
- 循环引用

## 实现

- TS 新增 `isJsonObject`、recursive value validator 和 ancestor cycle guard。
- `asToolExecutionResult` 的 output 与 error validator 的 details 使用深层校验。
- Python dataclass constructors 对 output/details 执行递归 JSON value 校验。
- cycle guard 只跟踪当前 ancestor chain，因此共享但非循环的子对象仍合法。

## 验收标准

- TS 拒绝 undefined、BigInt、NaN、function、Date 和 cycle。
- Python 拒绝 arbitrary object、NaN 和 cycle。
- 合法 Host tool outputs 与 details 保持通过。
- malformed batch result 仍按 slot 隔离。
- 完整 TS/Python/integration 校验通过。

## 实现结果

Result payload 在生成/接收边界即可证明 JSON.stringify/json.dumps 安全，不再依赖 writer 的隐式转换或异常。
