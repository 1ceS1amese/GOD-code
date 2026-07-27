# Phase403 Tool Result Construction Invariant

## 状态

代码、测试与文档已完成。

## 审计结论

Phase402 在 TS/Python wire validators 中强制了 result 状态不变量，但内部代码仍可绕过 parser：TS 的宽泛 interface 在编译期允许矛盾对象，Python `ToolExecutionResult` dataclass 也允许直接构造成功带 error 或失败无 error。

## 目标

- 将状态不变量从解析边界下沉到类型/构造边界。
- TS 调用方在编译期获得 `ok` 判别收窄。
- Python 所有直接 dataclass 构造都执行运行时验证。
- 保持现有合法 Host tools、scheduler cancellation 和 parser 路径兼容。

## TS Contract

`ToolExecutionResult` 改为 discriminated union：

- success branch：`ok: true`、optional output、`error?: never`。
- failure branch：`ok: false`、optional output、required error。

使用 `if (result.ok)` 后，TypeScript 能静态收窄 success/failure 字段。

## Python Contract

`ToolExecutionResult.__post_init__` 验证：

- `ok` 必须是严格 bool，拒绝 Python 中等价于 bool 的整数。
- success 不得携带 error。
- failure 必须携带 error。

Parser 和 scheduler 直接构造路径自动共享该不变量。

## 验收标准

- TS 项目在 discriminated union 下完整 typecheck。
- TS 类型测试证明 success/failure narrowing。
- Python 直接构造三类非法结果均抛 ValidationError。
- 合法 parser、scheduler cancellation 和 Host tool 结果保持通过。
- 完整 TS/Python/integration 校验通过。

## 实现结果

- TS interface 替换为 success/failure union。
- Python dataclass 新增 `__post_init__`。
- 新增 TS narrowing test 和 Python direct constructor matrix。
