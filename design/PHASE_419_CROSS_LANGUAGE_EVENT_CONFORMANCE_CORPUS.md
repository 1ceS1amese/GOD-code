# Phase419 Cross-Language Event Conformance Corpus

## 状态

代码、测试与文档已完成。

## 审计结论

Phase417 与 Phase418 已分别在 TypeScript Host 和 Python Engine 实现事件 schema，但两端测试各自内嵌样例。规则修改时，即使单端测试全部通过，也可能因另一端样例未同步而产生协议漂移。现有 turn goldens 验证完整运行结果，不承担 validator accept/reject 矩阵的职责。

## 目标

- 建立一份由 TypeScript 和 Python 同时消费的版本化事件契约语料。
- 对每个当前事件类型至少提供一个合法 case。
- 覆盖 identity、scope、核心 payload 和 discriminated state 的代表性非法 case。
- 保留 case name，使失败输出可直接定位契约分支。
- 语言对象、NaN 和循环引用等 JSON 无法表达的情况继续由语言侧单测覆盖。

## Corpus Format

`protocol/fixtures/god_code_event_contract.json` 包含：

- `contract_version`：loader 必须显式确认的版本号。
- `valid[]`：`name` 与应被接受的完整 event。
- `invalid[]`：`name` 与应被拒绝的完整 event。

语料只使用标准 JSON，因此同一字节内容可由 Node.js 与 Python 无转换读取。

## Test Boundaries

- TypeScript test 对 valid case 调用 `asGodCodeEventEnvelope`，对 invalid case断言 converter 抛错。
- Python test 将同一 event 字段构造成 `GodCodeEventEnvelope`，对 invalid case断言 `ValidationError`。
- 两端都断言 `contract_version === 1`，未知版本不能被静默解释。

## 验收标准

- 八类事件均存在 valid case。
- 共享 corpus 至少覆盖未知 type、空白 identity、错误 turn scope、assistant/tool/result/terminal/error malformed payload。
- TypeScript 与 Python 对所有 case 判定一致。
- 原有语言特有 JSON safety tests 保持通过。
- TypeScript/Python 全量测试与跨语言 integration 全部通过。

## 实现结果

- Phase419 初始新增 8 个 valid、14 个 invalid cases 和 1 个 version gate；Phase421 因 required sequence 将当前 corpus 升级为 version 2，并扩展为 18 个 invalid cases。
- 新增 TypeScript corpus conformance test。
- 新增 Python corpus conformance test。
- corpus 位于 protocol 层，不从任一语言实现目录反向依赖。
