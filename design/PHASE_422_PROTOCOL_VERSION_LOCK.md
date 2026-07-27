# Phase422 Protocol Version Lock

## 状态

代码、测试与文档已完成。

## 审计结论

Phase421 将 event `sequence` 变为 required wire field，属于 breaking protocol change；但 initialize 的 `protocol_version` 仅被 Python Engine 读取后原样回显，Host 也未验证 response。旧 Host 与新 Engine、或新 Host 与旧 Engine 都可能表面初始化成功，随后在首个 event 才失败。

## 目标

- 将当前 wire contract 明确提升为 `2.0`。
- Host 只能发送 canonical protocol version。
- Engine 在写入 capability negotiation state 前拒绝不兼容版本。
- Engine response 返回自身 canonical version，而不是回显请求。
- Host 在 initialize 成功返回前验证 Engine version。
- 版本错配必须在 session 创建和 turn side effect 前失败。

## Version Contract

- TypeScript：`GOD_CODE_PROTOCOL_VERSION = "2.0"`。
- Python：`GOD_CODE_PROTOCOL_VERSION = "2.0"`。
- 本阶段采用 exact-version lock，不做 major-range 或 capability fallback。
- Host request mismatch：本地拒绝，不发送 initialize RPC。
- Engine request mismatch：JSON-RPC invalid params `-32602`。
- Engine response mismatch/missing：Host 抛出 incompatible protocol error。

Exact lock 是有意选择：event sequence 已是 required field，降级到 1.x 无法保持 lifecycle/order correctness，不能伪装为兼容能力缺失。

## Initialization Order

Engine：

1. 解析 non-empty protocol_version。
2. 与 canonical `2.0` 比较。
3. mismatch 立即失败。
4. 成功后才读取并写入 execute_tools capability state。

Host：

1. 验证调用方 request version。
2. 发送包含 Host capabilities 的 initialize。
3. 验证 `engine_info.protocol_version === 2.0`。
4. 成功后才向上层返回 InitializeResponse。

## 验收标准

- Bundled Host 默认生成 2.0 request。
- Bundled Engine response 明确返回 2.0。
- Host 旧版本 request 不触发 RPC。
- Engine 旧版本 request 返回 -32602 且不修改 capability state。
- Host 拒绝旧/missing Engine response version。
- initialize examples、TS/Python tests 和 integration 全部使用 2.0。
- 全量 build/tests/integration 通过。

## 实现结果

- 新增 TS/Python canonical version constants。
- Host initialize 增加 request preflight 和 response confirmation。
- Engine initialize 增加 pre-capability exact version check。
- InitializeResponse 的 engine_info 获得明确版本字段类型。
- 协议示例与错配测试已同步。
