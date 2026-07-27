# Phase425 Initialize Request Schema Boundary

## 状态

代码、测试与文档已完成。

## 审计结论

Phase424 已验证 Engine response，但 request 侧除 exact protocol version 外仍无完整边界。Python Engine 忽略 `host_info`，并把非 object capabilities 当成默认值；Host 的 TypeScript 类型也可被 JavaScript caller、cast 或 non-JSON extension 绕过。Malformed handshake metadata 因此可能被静默接受并进入 initialized state。

## 目标

- Host 在发送 initialize RPC 前验证最终 wire request。
- Engine 在 capability mutation 和 initialized transition 前执行同一核心 schema。
- Host identity metadata 必须可诊断且 non-blank。
- capabilities 保持开放扩展，但必须是 JSON-safe object。
- 所有额外 request 字段必须满足递归 JSON safety。
- malformed request 不发送 RPC或不改变 Engine negotiation state。

## Request Contract

- 整个 request 是 JSON-safe object。
- `protocol_version` 是 non-blank string，随后 exact-check 为 2.0。
- `host_info` 是 object：
  - `name` non-blank string。
  - `version` non-blank string。
  - 扩展字段 JSON-safe。
- `capabilities` 是 JSON-safe object。

Capability object 保持 open schema。Engine 当前只解释：

- `execute_tools === true`
- `execute_tools_max_batch_size` 的合法正整数值

其他 capability keys 继续透传/忽略，便于后续版本内扩展；array、null 和 non-JSON object 不再被静默降级为空 capability。

## Host Flow

Host 先合并 bundled execute_tools capability，再调用 `asInitializeRequest`。因此 converter 验证的是实际发送的 wire payload，而不是调用方输入的部分对象。Validation 失败发生在 `initializing = true` 和 RPC request 之前。

## Engine Flow

Engine 在 version check 后：

1. 验证整个 request 递归 JSON-safe。
2. 要求 host_info object。
3. 验证 host name/version non-blank。
4. 要求 capabilities object。
5. 验证 metadata 与 capability object。
6. 读取 known capabilities。
7. 提交 initialized state。

## 验收标准

- Bundled Host request 正常通过。
- 缺失/空白 host metadata 被两端拒绝。
- 非 object capabilities 被两端拒绝。
- nested non-JSON metadata/capability 被两端拒绝。
- Host malformed request invocation count 为零。
- Engine malformed request 不改变 initialized/batch capability state。
- protocol examples、全量测试和 integration 保持通过。

## 实现结果

- InitializeRequest host_info 类型收紧为 name/version metadata object。
- 新增 `asInitializeRequest` runtime converter。
- Host 对 capability merge 后的最终 payload 执行 preflight。
- Engine initialize 增加 host/capability object 和 JSON safety validation。
- TS/Python tests 覆盖 missing、blank、array 和 runtime non-JSON cases。
