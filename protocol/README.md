# GOD-code protocol

当前 GOD-code wire protocol version 为 **2.0**，transport 使用 **JSON-RPC 2.0 over stdio**，消息边界为一行一个 JSON 对象。

术语约定与主文档保持一致：

- **TS 宿主**：发起 `initialize`、`create_session`、`submit_turn` 等请求的一侧
- **Python 引擎**：负责会话状态、回合执行和事件发射的一侧
- **会话 / 回合**：分别对应 `session` / `turn`
- 代码字段名、事件名、方法名保持协议原样

## 宿主 -> 引擎

- `initialize`
- `create_session`
- `submit_turn`
- `cancel_turn`
- `shutdown`

## 引擎 -> 宿主

- request: `execute_tool`
- request: `execute_tools`
- notification: `god_code_event`
- notification: `cancel_tool_execution`

`execute_tools` 是 capability-negotiated enhancement。Bundled TS Host 声明 `execute_tools: true` 和 `execute_tools_max_batch_size: 4`；未声明方法能力的 Host 会让 scheduler 回退到多个并发 `execute_tool`。Engine 使用合法正整数 max size 限制 dependency waves，缺失或非法值按 4 处理。

Batch response 与 request tool calls 按位置一一对应。Bundled Host 会隔离单项 executor 异常并在对应位置返回 `tool_executor_failed`，不会因为一个 executor promise reject 而丢弃同批其他结果；单项 `execute_tool` 仍保留原有 RPC 错误边界。

同一个 `execute_tools` request 内的 `tool_call_id` 必须唯一。Engine 在记录事件/transcript 和调度前拒绝 model batch 中的重复 ID；Bundled Host 也会在 wire boundary 以 invalid params 拒绝重复 ID payload。

`execute_tool` / `execute_tools` 的 `session_id`、`turn_id`、`tool_call_id` 和 `tool_name` 必须是非空字符串。Engine 还会在任何 tool side effect 前验证工具名属于当前 session catalog，使自定义 ModelAdapter 与标准 provider adapter 遵守同一执行边界。

Host 返回的 `ToolExecutionResult` 会在 TS runtime boundary 校验：`ok` 必须为 boolean，`output` 必须缺失或为 object，`error.code/message` 必须为非空字符串，`error.details` 必须缺失或为 object。Batch malformed result 被隔离为对应位置的 `tool_executor_failed`；serial malformed result 保持 RPC error boundary。

Optional result 字段采用严格 missing 语义：`output`、`error`、`error.details` 可以省略，但显式 `null` 不等同于省略，TS 与 Python 均会拒绝。该规则同时适用于 array 和其他 primitive 值。

`ok` 与 `error` 组成可判别状态：`ok: true` 时 `error` 必须缺失；`ok: false` 时必须提供合法 `error`。`output` 在两种状态下都可选，从而允许失败结果携带结构化 partial output。

该不变量不只存在于 wire parser：TS 将 `ToolExecutionResult` 定义为 success/failure discriminated union，Python dataclass 在 `__post_init__` 强制相同规则，因此内部直接构造也不能绕过协议状态约束。

嵌套 `ToolExecutionError` 同样具有构造边界：code/message 必须是非空字符串，details 必须缺失或为 object。Python dataclass 直接强制；TS 内置 Host/MCP/plugin 错误统一经过 `asToolExecutionError`/`toolError` factory。

`output` 与 `error.details` 必须是递归 JSON-safe object：只允许 null、string、boolean、finite number、array 和 plain object，禁止 undefined、BigInt、function、NaN/Infinity、语言对象实例及循环引用。该检查在 JSON-RPC writer、event 和 transcript 之前完成。

同一规则适用于 `execute_tool.input` 和 batch 中每个 tool input。Engine 在记录/发射/调度前验证自定义 adapter action，Host 在 executor 前再次验证 wire payload，因此请求与结果两个方向共享同一 transport-safe object contract。

身份字段和错误文本采用 non-blank 规则：session/turn/tool call ID、tool name、error code/message 必须在 trim 后至少包含一个字符。实现只验证、不自动 trim，合法 wire value 保持原样。

Tool cancellation 的完整身份是 `(session_id, turn_id)`。Host 的 AbortController lookup、cancel notification 和 turn_finished cleanup 均按该复合身份执行；`cancel_tool_execution` 必须同时携带 non-blank session_id 与 turn_id。

Cancellation 允许先于 tool request 到达。Host 会为该 session+turn 保留 pre-aborted controller，后到 execute_tool/execute_tools 复用已取消 signal；public cancel 返回 `not_found` 时回滚该 tombstone，正常取消由 turn_finished 清理。

Host 在 ToolExecutor dispatch 前强制检查 pre-aborted signal。已取消 single request 直接返回 `tool_cancelled`；batch 为所有 slots 返回有序 `tool_cancelled`，不会进入 executor/policy/audit/MCP/plugin。已开始执行的工具仍通过 AbortSignal 协作取消。

Batch 还在每个 slot 调用 executor 前重新检查共享 signal。某个已启动 slot 触发取消后，尚未 dispatch 的后续 slots 返回 `tool_cancelled`；已经启动的 slots 保留真实/协作取消结果，response 位置与请求保持一致。

Executor 完成后、结果提交前还会再次检查 signal。若 turn 已取消，late resolve/reject 都转换为 `tool_cancelled`，取消优先于 executor success、failure 或 exception mapping；该规则不代表可回滚执行期间已产生的外部副作用。

Host controller 使用 request lease 管理生命周期。`turn_finished` 若遇到仍在 flight 的 execute_tool/execute_tools，会 abort 并标记 finished，但延迟到最后一个 request lease 释放后再删除 controller；无 in-flight request 时立即清理。

Public `cancel_turn` 返回 `not_found` 时也进入相同 finish lifecycle：无 Host request 时立即回滚 pre-cancel tombstone；仍有 in-flight request 时保留 aborted controller/finished marker，直到最后 lease settle。

Host 还保留最近 1024 个 finalized `(session_id, turn_id)` identity。Late cancel notification 被忽略，late execute_tool/execute_tools 返回 `tool_cancelled` 且不 dispatch executor；有界 insertion-order registry 超容量淘汰最旧 identity。

`god_code_event` envelope 在 Host runtime boundary 完整验证：event_type 必须属于协议 union，session_id non-blank，payload 递归 JSON-safe；session_started 不得带 turn_id，其余事件必须带 non-blank turn_id。Validation 成功后才执行 turn_finished lifecycle mutation 和 listener emission。

事件 payload 同样按 event_type 校验核心 schema：session metadata、assistant delta/message、ToolCall、ToolExecutionResult、TurnResult 和 ToolExecutionError 必须满足各自不变量。TypeScript 将 envelope 建模为 discriminated union；额外 batch scheduler metadata 只要 JSON-safe 仍可保留。Headless、REPL 与 TUI 只接收并消费通过该边界的 typed payload。

Python Engine 在 `GodCodeEventEnvelope` 构造点执行同一事件类型、identity、JSON safety 和 payload schema 检查；`TurnResult` 也强制 success/error/cancelled 的字段组合。Engine construction guard 与 Host wire validator 独立存在，避免内部 emitter 生成无效 notification，同时保留跨进程防御边界。

跨语言一致性由 [`fixtures/god_code_event_contract.json`](fixtures/god_code_event_contract.json) 提供共享证据。该版本化 corpus 的 valid/invalid 命名 cases 被 TypeScript converter tests 和 Python constructor tests 同时消费；修改事件契约时必须同步更新 corpus 和版本语义。NaN、循环引用等标准 JSON 无法表达的边界仍由各语言本地测试负责。

Host 在事件 schema validation 后还应用 finalized fan-out guard：首个 `turn_finished` 完成 lifecycle cleanup 并正常 emit，同一 `(session_id, turn_id)` 的后续 assistant/tool/error 事件和重复 terminal event 被静默吸收。`session_started` 及其他 session 的相同 turn_id 不受影响；非法 late event 仍先按 invalid params 拒绝，不由 suppression 掩盖。

每个 event 还携带 required `sequence`：`session_started` 固定为 0；turn-scoped event 使用从 1 开始、按 turn 严格递增的 JSON safe integer。Host 为每个 `(session_id, turn_id)` 记录 last-seen sequence，静默吸收 `sequence <= last_seen` 的 duplicate/regression，接受更高 sequence（允许 gap），并在 terminal lifecycle 删除 active sequence state。共享 event corpus 因该 breaking wire requirement 升级为 contract version 2。

`initialize.protocol_version` 采用 exact lock。Bundled Host 和 Engine 当前都要求 `2.0`：Host 在发送 RPC 前拒绝其他 request version；Engine 在 capability state mutation 前以 `-32602` 拒绝其他版本，并在 `engine_info.protocol_version` 返回自身 canonical 2.0；Host 再验证 response version。由于 event sequence 是 required breaking field，本版本不提供 1.x downgrade/fallback。

`initialize` 还是一次性 lifecycle transition。Host 在协商期间拒绝第二个并发 initialize，在成功后拒绝重复 initialize；Engine 同样不允许 capability renegotiation。`create_session`、`submit_turn` 和 `cancel_turn` 只能在成功初始化后使用，错误状态返回 `-32002`（Host 本地调用则在发 wire 前失败）。`shutdown` 始终允许，以保证版本/握手失败后的 cleanup；Host stop 或 child exit 会清除本地 initialized/initializing state。

Host 不直接信任 initialize result。`engine_info.name/version/protocol_version` 必须 non-blank；`supported_tools` 必须是 name/description non-blank、可选 JSON-safe object schema 且名称唯一的目录；`supported_model_adapters` 必须是 non-blank 且唯一的 string list；整个 response（含扩展字段）必须递归 JSON-safe。只有该 converter 和 exact 2.0 check 都成功，Host 才提交 initialized state；malformed response 会回滚并允许重试。

Initialize request 同样在两个方向验证。`host_info` 必须包含 non-blank `name` 和 `version`，`capabilities` 必须是 JSON-safe object，整个 request 的扩展字段也必须递归 JSON-safe。Host 在合并 bundled execute_tools capability 后验证实际 wire payload；Engine 在 capability mutation 前再次验证。Capability key set 保持开放，但 array/null/non-JSON shape 不会再被当成空 capability 静默接受。

Host 也不直接信任 `create_session` result。Response 必须是递归 JSON-safe object，包含 non-blank `session_id` 和 exact `status: "created"`；schema validation 后，response session_id 还必须与当前 request session_id 严格一致。Malformed 或 cross-session response 不会进入 typed caller。

`create_session` request 同样执行双层 validation。Host 在发 wire 前验证 non-blank session_id/cwd/model_adapter、名称唯一且 schema JSON-safe 的 tool_catalog，以及符合 user/assistant/tool_call/tool_result discriminated union 的 initial_messages；Engine 在 provider lookup、session creation 和 session_started emission 前再次验证整个 request。Malformed request 不会发送 Host RPC，也不会产生 Engine session 或 event。

Host 不直接信任 `submit_turn` result。Response 必须是递归 JSON-safe object，包含 non-blank session_id/turn_id 和 exact `status: "accepted"`；随后 response session_id 必须与当前 request session_id 严格一致。只有通过 schema 与 correlation 两层 gate 的 turn_id 才能用于事件过滤和取消。

`submit_turn` request 也执行双层 validation。Host 发 wire 前、Engine 分配 turn_id 和 active-turn slot 前，都会验证 non-blank session_id、exact user prompt、non-empty content、JSON-safe turn_options，以及 stream/max_tokens/temperature/provider 等已知 option 类型。未知 option keys 仍允许扩展，但 malformed request 不会启动 turn thread 或发出事件。

Host 不直接信任 `cancel_turn` result。Response 必须是 JSON-safe object，包含 non-blank session_id/turn_id，status 只能是 `cancel_requested` 或 `not_found`，且两个 identity 都必须与 request 严格一致。本地 abort 仍在 RPC 前立即发生，但只有 fully validated `not_found` 才会调用 finish lifecycle 清理 pre-cancel tombstone。

`cancel_turn` request 也执行双层 validation。Host 在创建/abort controller 和发 wire 前，Engine 在设置 cancel_event 与发送 cancel_tool_execution notification 前，都会验证完整 JSON safety 和 non-blank session_id/turn_id。Malformed request 不产生本地 tombstone、远端 cancellation mutation 或 notification。

`shutdown` acknowledgement 也由 Host 验证：result 必须是 JSON-safe object 且 status 精确为 `shutting_down`。显式 shutdown 遇到 malformed response 会报错；`stop()` 仍捕获 acknowledgement、timeout 或 peer failure，并继续关闭 stdin、等待/终止 child 和释放 peer，保证 cleanup 始终可达。

`shutdown` request 是 exact empty JSON object `{}`。Host 以 runtime converter 锁定 wire shape；Engine 在调用 connection.stop 前验证 params 为 JSON-safe dict 且无任何字段。Reason、deadline 或 drain policy 等未来语义必须显式进入版本化 contract，非空 params 不会被旧 Engine 静默忽略并触发停止。

Python Engine 不直接信任 Host 的 `execute_tool` / `execute_tools` result。每个 ToolExecutionResult 必须满足 success/failure discriminated state、non-blank error identity 和递归 JSON safety；batch envelope 同样必须 JSON-safe，results count 必须与 request slot count 一致。Batch scheduler 会先解析全部 slots，再统一写入 scheduled state，任一 malformed slot 不产生部分提交。

Engine 发送 `execute_tool` / `execute_tools` 前也执行 construction validation。ToolCall 在创建时保证 non-blank call/name identity 与 JSON-safe input；scheduler 再验证 non-blank session/turn scope、non-empty batch 和 batch call-id uniqueness，并由集中 builder 复核最终 payload JSON safety。Invalid outbound state 不会调用 requester，Host ingress validation 仍作为独立边界保留。

`cancel_tool_execution` notification 同样有双端边界。Engine 通过 typed object 构造 non-blank session/turn canonical payload；Host converter 验证整个 object 递归 JSON-safe 后，才执行 finalized suppression 和 controller abort。Malformed notification 不创建或改变 cancellation controller。

JSON-RPC error response 本身也受 transport contract 约束：error code 必须是 JSON safe integer，message 必须 non-blank，optional data 与扩展字段必须递归 JSON-safe，response 不得同时含 result/error。TS 对 malformed error 拒绝并清理对应 pending request、发出 protocol_error；Python 将其稳定归一为 `-32603 Invalid JSON-RPC error response payload.`，不执行 int/string coercion。

GOD-code 的 JSON-RPC success profile 要求 result 字段存在且为递归 JSON-safe object。TS 在 resolve pending 前验证，Python 通过 `parse_json_rpc_result` 验证；missing、null、array、primitive、non-JSON nested value 或 result/error 双字段均以 transport error 拒绝。业务 converter 随后继续验证 initialize/session/turn/tool 等具体 schema。

## 当前工具目录

- `Read`
- `Edit`
- `Bash`
- `ListFiles`
- `Search`
- `Write`

## 模型适配器能力

`initialize` 返回的 `supported_model_adapters` 是 Python 引擎启动时的运行时能力列表，不是固定常量。默认只有 `fake`；如果 Phase4 provider 环境变量配置完整，列表里会额外出现对应 provider 名。

Phase5 的 OpenAI-compatible provider client 不改变 JSON-RPC wire contract。配置 `openai` / `openai-compatible` 后，也仍然通过 `supported_model_adapters` 宣告运行时可用的模型适配器。

Phase 7 的 Responses API provider 也不改变 JSON-RPC wire contract。配置 `openai-responses` / `openai-compatible-responses` 后，它们同样只通过 `supported_model_adapters` 宣告运行时能力；provider 专属上下文保持在 Python 内部，不进入协议层。

Phase 8 已落地的 MCP stdio runtime 也不改变 JSON-RPC wire contract。MCP tools 作为普通 `ToolCatalogEntry` 进入 `create_session.tool_catalog`，执行时仍走现有 `execute_tool` request；MCP server、transport 和 lifecycle 都保持在 TS 宿主内部。

Phase 9 已落地的 Plugin / Skill runtime 同样不改变 JSON-RPC wire contract。plugin / skill tools 作为普通 `ToolCatalogEntry` 进入 `create_session.tool_catalog`，执行时仍走现有 `execute_tool` request；manifest 加载、handler 绑定和 prompt fragments 汇总都保持在 TS 宿主内部。

Phase 10 已落地的基础 REPL 也不改变 JSON-RPC wire contract。`god-code repl` 只是让 TS 宿主复用同一个 Python Engine session 连续提交 `submit_turn`，slash command 和 renderer 状态都留在 TS CLI 内部。

Phase 11 已落地的 session history / replay 也不改变 JSON-RPC wire contract。`god-code sessions list/replay` 直接读取本地 JSONL transcript 文件，不通过新增 RPC 恢复或重放 Python Engine 状态。

Phase 16 已落地的 session history management 同样不改变 JSON-RPC wire contract。`god-code sessions search`、`god-code sessions replay --json` 和 `god-code sessions delete --yes` 都由 TS Host 离线读取或删除本地 JSONL transcript 文件，不新增 Python Engine RPC。

Phase 12 已落地的 CLI diagnostics / tools UX 也不改变 JSON-RPC 方法集合。`god-code run --json` 只是改变 CLI 输出格式，`god-code tools list/inspect` 读取 TS Host tool catalog，`god-code doctor` 只复用 `initialize` 和宿主侧检查。`ToolCatalogEntry` 允许可选 `input_schema` 字段，用于 CLI 诊断和 provider tool schema 格式化；缺失时仍按旧格式兼容。

Phase 17 已落地的 provider health diagnostics 同样不新增 JSON-RPC 方法。`god-code doctor provider-health` 复用现有 `initialize`、`create_session` 和 `submit_turn`，显式执行一次空 tool catalog 的最小 provider turn。

Phase 18 已落地的 MCP / Plugin diagnostics 同样不新增 JSON-RPC 方法。`god-code mcp inspect-config` 和 `god-code plugins validate` 都在 TS Host 本地解析配置或 manifest；`mcp inspect-config --connect` 只连接 MCP runtime，不启动 Python Engine。

Phase 25 已落地的 MCP server config file 同样不新增 JSON-RPC 方法。`GOD_CODE_MCP_CONFIG_FILE` 只改变 TS Host 加载 MCP server 配置的来源；MCP tools 仍作为普通 `ToolCatalogEntry` 进入现有 `create_session.tool_catalog`。

Phase 26 已落地的 MCP tool schema display 同样不新增 JSON-RPC 方法。它只增强 TS Host CLI diagnostics / tools inspect 对现有 `ToolCatalogEntry.input_schema` 的展示，不改变 Engine wire payload 或 tool execution flow。

Phase 27 已落地的 MCP runtime error diagnostics 同样不新增 JSON-RPC 方法。它只把 TS Host MCP runtime 的连接 / tools/list / duplicate tool name 失败转成结构化 CLI diagnostics，不改变 Engine wire payload 或 tool execution flow。

Phase 28 已落地的 Plugin / Skill manifest schema 同样不新增 JSON-RPC 方法。`god-code plugins schema` 只导出 TS Host 本地 `plugin.json` / `skill.json` manifest parser 对应的 schema，不改变 Engine wire payload 或 plugin runtime 加载语义。

Phase 29 已落地的 manifest-only plugin package example 同样不新增 JSON-RPC 方法。它只扩展 `examples/plugins/demo-plugin/` 的 docs 和 fixtures，不改变 Engine wire payload 或 plugin runtime 加载语义。

Phase 30 已落地的 archived transcript gzip compression 同样不新增 JSON-RPC 方法。`god-code sessions archive compress` 只由 TS Host 本地压缩 `<transcriptDir>/archive/*.jsonl`，archive replay/search/restore/delete 对 `.jsonl.gz` 的支持也只发生在 TS Host 文件层。

Phase 31 已落地的 session history search index 同样不新增 JSON-RPC 方法。`god-code sessions index build/search` 只由 TS Host 本地读取 transcript JSONL / gzip 并写入 `<transcriptDir>/search-index.json`，不启动 Python Engine，也不改变 transcript JSONL 格式。

Phase 32 已落地的 session history incremental index refresh 同样不新增 JSON-RPC 方法。`god-code sessions index refresh` 和 `sessions index search --refresh` 只由 TS Host 本地比较 transcript source file metadata 并更新 `<transcriptDir>/search-index.json`，不启动 Python Engine，也不改变 Engine wire payload。

Phase 70 已落地的 session transcript timeline diagnostics 同样不新增 JSON-RPC 方法，设计见 [`../design/PHASE_70_SESSION_TRANSCRIPT_TIMELINE.md`](../design/PHASE_70_SESSION_TRANSCRIPT_TIMELINE.md)。该实现只由 TS Host 本地读取 active / archived transcript JSONL 或 `.jsonl.gz` 并渲染紧凑事件时间线；`initialize`、`create_session`、`submit_turn`、tool execution request、MCP/plugin payload、transcript JSONL schema 和现有 JSON-RPC method set 都保持不变。

Phase 75 已落地的 session global transcript search 同样不新增 JSON-RPC 方法，设计见 [`../design/PHASE_75_SESSION_GLOBAL_TRANSCRIPT_SEARCH.md`](../design/PHASE_75_SESSION_GLOBAL_TRANSCRIPT_SEARCH.md)。`sessions global-search` 只由 TS Host 本地读取显式 transcript roots；不会自动扫描用户目录、不会启动 Python Engine、不会写 search index、不会改变 transcript JSONL schema 或现有 JSON-RPC method set。

Phase 76 已落地的 session transcript root discovery diagnostics 同样不新增 JSON-RPC 方法，设计见 [`../design/PHASE_76_SESSION_TRANSCRIPT_ROOT_DISCOVERY.md`](../design/PHASE_76_SESSION_TRANSCRIPT_ROOT_DISCOVERY.md)。`sessions roots` 只由 TS Host 在显式 search roots 下做受限本地目录诊断；不会自动扫描用户目录、不会读取 transcript payload、不会启动 Python Engine、不会写 search index、不会改变 transcript JSONL schema 或现有 JSON-RPC method set。

Phase 77 已落地的 discovery-backed global transcript search 同样不新增 JSON-RPC 方法，设计见 [`../design/PHASE_77_DISCOVERY_BACKED_GLOBAL_TRANSCRIPT_SEARCH.md`](../design/PHASE_77_DISCOVERY_BACKED_GLOBAL_TRANSCRIPT_SEARCH.md)。`sessions global-search --search-root <workspace>` 只由 TS Host 组合 Phase76 bounded discovery 与 Phase75 root-aware search；不会自动扫描用户目录、不会读取 discovery 阶段的 transcript payload、不会启动 Python Engine、不会写 search index、不会改变 transcript JSONL schema 或现有 JSON-RPC method set。

Phase 78 已落地的 session transcript watch diagnostics 同样不新增 JSON-RPC 方法，设计见 [`../design/PHASE_78_SESSION_TRANSCRIPT_WATCH_DIAGNOSTICS.md`](../design/PHASE_78_SESSION_TRANSCRIPT_WATCH_DIAGNOSTICS.md)。`sessions watch` 只由 TS Host 在显式 transcript roots / bounded discovery roots 下启动短生命周期文件 watcher；不会启动后台 daemon、不会读取 transcript payload、不会自动刷新 search index、不会启动 Python Engine、不会改变 transcript JSONL schema 或现有 JSON-RPC method set。

Phase 79 已落地的 session index watch-refresh diagnostics 同样不新增 JSON-RPC 方法，设计见 [`../design/PHASE_79_SESSION_INDEX_WATCH_REFRESH.md`](../design/PHASE_79_SESSION_INDEX_WATCH_REFRESH.md)。`sessions index watch-refresh` 只由 TS Host 在显式 transcript roots / bounded discovery roots 下组合短生命周期 watcher 与本地 incremental index refresh；不会启动后台 daemon、不会隐式自动刷新 index、不会启动 Python Engine、不会改变 transcript JSONL schema 或现有 JSON-RPC method set。

Phase 80 已落地 interactive permission approval UI 基础实现，设计见 [`../design/PHASE_80_INTERACTIVE_PERMISSION_APPROVAL.md`](../design/PHASE_80_INTERACTIVE_PERMISSION_APPROVAL.md)。Approval prompt 只停留在 TS Host 的 `HostToolRegistry.executeRequest(...)` 路径内；Python Engine 仍只接收普通 tool result，不新增 JSON-RPC 方法或修改现有 method set。

Phase 81 已落地 multi session runtime 基础实现，设计见 [`../design/PHASE_81_MULTI_SESSION_RUNTIME.md`](../design/PHASE_81_MULTI_SESSION_RUNTIME.md)。实现仍复用现有 `session_id` 字段和 `create_session` / `submit_turn` / `cancel_turn` 方法；不新增 JSON-RPC 方法、不改变 request/response shape、不改变 transcript schema 或 provider API。

Phase 82 已完成 multi tool concurrent scheduling 基础实现，设计见 [`../design/PHASE_82_MULTI_TOOL_CONCURRENT_SCHEDULING.md`](../design/PHASE_82_MULTI_TOOL_CONCURRENT_SCHEDULING.md)。该阶段最初通过多个 `execute_tool` in-flight request 执行 bounded parallel waves；Phase394 已将 parallel-safe chunk 升级为显式 `execute_tools` Host batch RPC，单工具和 serial-only wave 仍使用 `execute_tool`。

Phase 83 已完成 session advanced recovery 基础实现，设计见 [`../design/PHASE_83_SESSION_ADVANCED_RECOVERY.md`](../design/PHASE_83_SESSION_ADVANCED_RECOVERY.md)。`sessions recover` 仍停留在 TS Host transcript/history 层，复用 `create_session.initial_messages` 和既有 `submit_turn` flow；不新增 Python replay RPC、不改变 JSON-RPC method set、不改变 request/response shape、不改变 transcript schema 或 archive format，也不重放历史工具。

Phase 84 已完成 provider-native parallel tool calls 基础实现，设计见 [`../design/PHASE_84_PROVIDER_NATIVE_PARALLEL_TOOL_CALLS.md`](../design/PHASE_84_PROVIDER_NATIVE_PARALLEL_TOOL_CALLS.md)。该阶段在 Python provider / normalizer 边界做显式 opt-in 归一化，把 provider 原生多个 tool calls 映射为内部 `ToolCallBatchAction`；Phase394 进一步让其中 parallel-safe scheduler chunk 走 `execute_tools`，transcript 与 event schema 保持不变。

Phase 85 已完成 tool dependency graph scheduling 基础实现，设计见 [`../design/PHASE_85_TOOL_DEPENDENCY_GRAPH_SCHEDULING.md`](../design/PHASE_85_TOOL_DEPENDENCY_GRAPH_SCHEDULING.md)。dependency graph plan 仍决定 serial/parallel wave；Phase394 仅改变 parallel chunk 的 Host transport 为 `execute_tools`，不改变 plan、结果顺序、transcript 或 event schema。

Phase 86 已完成 TUI session dashboard 基础实现，边界见 [`../design/PHASE_86_TUI_SESSION_DASHBOARD.md`](../design/PHASE_86_TUI_SESSION_DASHBOARD.md)。该阶段只在 TS Host 侧新增 `god-code tui` terminal UI shell，复用现有 REPL/session/history/approval 边界；不新增 JSON-RPC 方法、不改变 request/response shape、不改变 transcript schema，也不让 Python Engine 感知 TUI。

Phase 87 已完成 TUI interaction polish 基础实现，边界见 [`../design/PHASE_87_TUI_INTERACTION_POLISH.md`](../design/PHASE_87_TUI_INTERACTION_POLISH.md)。该阶段只增强 TS Host TUI 的 raw-mode rendering、history timeline detail、approval suspend-redraw bridge 和 terminal control tests；不新增 JSON-RPC 方法、不改变 request/response shape、不改变 transcript schema，也不让 Python Engine 感知 TUI。

Phase 88 已完成 TUI modal approval 基础实现，边界见 [`../design/PHASE_88_TUI_MODAL_APPROVAL.md`](../design/PHASE_88_TUI_MODAL_APPROVAL.md)。该阶段只在 TS Host TUI 内新增 modal approval prompt，继续使用既有 `ToolApprovalPrompt` / `ToolApprovalDecision` contract；不新增 JSON-RPC 方法、不改变 request/response shape、不改变 transcript schema，也不让 Python Engine 感知 TUI。

Phase 89 已完成 TUI pane scrolling 基础实现，边界见 [`../design/PHASE_89_TUI_PANE_SCROLLING.md`](../design/PHASE_89_TUI_PANE_SCROLLING.md)。该阶段只在 TS Host TUI 内新增 events/history/timeline pane scroll state 和输入映射；不新增 JSON-RPC 方法、不改变 request/response shape、不改变 transcript schema，也不让 Python Engine 感知 TUI。

Phase 90 已完成 TUI assistant stream coalescing 基础实现，边界见 [`../design/PHASE_90_TUI_ASSISTANT_STREAM_COALESCING.md`](../design/PHASE_90_TUI_ASSISTANT_STREAM_COALESCING.md)。该阶段只在 TS Host TUI 内合并 `assistant_delta` 和最终 `assistant_message` 的展示行；不新增 JSON-RPC 方法、不改变 request/response shape、不改变 transcript schema，也不让 Python Engine 感知 TUI。

Phase 91 已完成 TUI keyboard help overlay 基础实现，边界见 [`../design/PHASE_91_TUI_KEYBOARD_HELP_OVERLAY.md`](../design/PHASE_91_TUI_KEYBOARD_HELP_OVERLAY.md)。该阶段只在 TS Host TUI 内新增 pane-aware help line 生成和渲染；不新增 JSON-RPC 方法、不改变 request/response shape、不改变 transcript schema，也不让 Python Engine 感知 TUI。

Phase 92 已完成 TUI adaptive layout 基础实现，边界见 [`../design/PHASE_92_TUI_ADAPTIVE_LAYOUT.md`](../design/PHASE_92_TUI_ADAPTIVE_LAYOUT.md)。该阶段只在 TS Host TUI renderer 内新增 compact layout；不新增 JSON-RPC 方法、不改变 request/response shape、不改变 transcript schema，也不让 Python Engine 感知 TUI。

Phase 93 已完成 TUI debug diagnostics 基础实现，边界见 [`../design/PHASE_93_TUI_DEBUG_DIAGNOSTICS.md`](../design/PHASE_93_TUI_DEBUG_DIAGNOSTICS.md)。该阶段只在 TS Host TUI 内新增 bounded state snapshot；不新增 JSON-RPC 方法、不改变 request/response shape、不改变 transcript schema，也不让 Python Engine 感知 TUI。

Phase 94 已完成 TUI pane focus style 基础实现，边界见 [`../design/PHASE_94_TUI_PANE_FOCUS_STYLE.md`](../design/PHASE_94_TUI_PANE_FOCUS_STYLE.md)。该阶段只在 TS Host TUI renderer 内新增 active pane title marker；不新增 JSON-RPC 方法、不改变 request/response shape、不改变 transcript schema，也不让 Python Engine 感知 TUI。

Phase 95 已完成 TUI PTY smoke harness 基础实现，边界见 [`../design/PHASE_95_TUI_PTY_SMOKE_HARNESS.md`](../design/PHASE_95_TUI_PTY_SMOKE_HARNESS.md)。该阶段只在 TS Host 内新增 TUI screen lifecycle smoke harness；不新增 JSON-RPC 方法、不改变 request/response shape、不改变 transcript schema，也不让 Python Engine 感知 TUI。

Phase 96 已完成 TUI session switcher 基础实现，边界见 [`../design/PHASE_96_TUI_SESSION_SWITCHER.md`](../design/PHASE_96_TUI_SESSION_SWITCHER.md)。该阶段只在 TS Host TUI 内新增 transcript session view switching 状态与输入映射；不新增 JSON-RPC 方法、不改变 request/response shape、不改变 transcript schema，也不让 Python Engine 感知 TUI。

Phase 97 已完成 TUI live session switching 基础实现，边界见 [`../design/PHASE_97_TUI_LIVE_SESSION_SWITCHING.md`](../design/PHASE_97_TUI_LIVE_SESSION_SWITCHING.md)。该阶段只在 TS Host TUI 内维护多个 live session abstraction 并切换 active session；不新增 JSON-RPC 方法、不改变 request/response shape、不改变 transcript schema，也不改变 provider/MCP/plugin protocol。

Phase 98 已完成 TUI live session list pane 基础实现，边界见 [`../design/PHASE_98_TUI_LIVE_SESSION_LIST_PANE.md`](../design/PHASE_98_TUI_LIVE_SESSION_LIST_PANE.md)。该阶段只在 TS Host TUI 内新增 live session list pane state/input/rendering；不新增 JSON-RPC 方法、不改变 request/response shape、不改变 transcript schema，也不改变 provider/MCP/plugin protocol。

Phase 99 已完成 TUI per-session event buffers 基础实现，边界见 [`../design/PHASE_99_TUI_PER_SESSION_EVENT_BUFFERS.md`](../design/PHASE_99_TUI_PER_SESSION_EVENT_BUFFERS.md)。该阶段只在 TS Host TUI 内新增 per-session event buffer state 和按 `session_id` 的事件路由；不新增 JSON-RPC 方法、不改变 request/response shape、不改变 transcript schema，也不改变 provider/MCP/plugin protocol。

Phase 100 已完成 TUI per-session status indicators 基础实现，边界见 [`../design/PHASE_100_TUI_PER_SESSION_STATUS_INDICATORS.md`](../design/PHASE_100_TUI_PER_SESSION_STATUS_INDICATORS.md)。该阶段只在 TS Host TUI 内新增 per-live-session status state 和 rendering；不新增 JSON-RPC 方法、不改变 request/response shape、不改变 transcript schema，也不改变 provider/MCP/plugin protocol。

Phase 101 已完成 TUI per-session unread counters 基础实现，边界见 [`../design/PHASE_101_TUI_PER_SESSION_UNREAD_COUNTERS.md`](../design/PHASE_101_TUI_PER_SESSION_UNREAD_COUNTERS.md)。该阶段只在 TS Host TUI 内新增 per-live-session unread state 和 rendering；不新增 JSON-RPC 方法、不改变 request/response shape、不改变 transcript schema，也不改变 provider/MCP/plugin protocol。

Phase 102 已完成 TUI live session close command 基础实现，边界见 [`../design/PHASE_102_TUI_LIVE_SESSION_CLOSE_COMMAND.md`](../design/PHASE_102_TUI_LIVE_SESSION_CLOSE_COMMAND.md)。该阶段只在 TS Host TUI 内新增 selected live session close action、input mapping 和 controller cleanup；不新增 JSON-RPC 方法、不改变 request/response shape、不改变 transcript schema，也不改变 provider/MCP/plugin protocol。

Phase 103 已完成 TUI live session pin command 基础实现，边界见 [`../design/PHASE_103_TUI_LIVE_SESSION_PIN_COMMAND.md`](../design/PHASE_103_TUI_LIVE_SESSION_PIN_COMMAND.md)。该阶段只在 TS Host TUI 内新增 selected live session pin state、input mapping、sorting 和 rendering；不新增 JSON-RPC 方法、不改变 request/response shape、不改变 transcript schema，也不改变 provider/MCP/plugin protocol。

Phase 104 已完成 TUI live session rename command 基础实现，边界见 [`../design/PHASE_104_TUI_LIVE_SESSION_RENAME_COMMAND.md`](../design/PHASE_104_TUI_LIVE_SESSION_RENAME_COMMAND.md)。该阶段只在 TS Host TUI 内新增 selected live session display-name state、input mapping 和 rendering；不新增 JSON-RPC 方法、不改变 request/response shape、不改变 transcript schema，也不改变 provider/MCP/plugin protocol。

Phase 105 已完成 TUI live session filter 基础实现，边界见 [`../design/PHASE_105_TUI_LIVE_SESSION_FILTER.md`](../design/PHASE_105_TUI_LIVE_SESSION_FILTER.md)。该阶段只在 TS Host TUI 内新增 live session filter state、input mapping、visible-row selection 和 rendering；不新增 JSON-RPC 方法、不改变 request/response shape、不改变 transcript schema，也不改变 provider/MCP/plugin protocol。

Phase 106 已完成 TUI live session sort modes 基础实现，边界见 [`../design/PHASE_106_TUI_LIVE_SESSION_SORT_MODES.md`](../design/PHASE_106_TUI_LIVE_SESSION_SORT_MODES.md)。该阶段只在 TS Host TUI 内新增 live session sort mode state、input mapping、visible-row ordering 和 rendering；不新增 JSON-RPC 方法、不改变 request/response shape、不改变 transcript schema，也不改变 provider/MCP/plugin protocol。

Phase 33 已落地的 MCP Streamable HTTP config diagnostics 同样不新增 JSON-RPC 方法。`god-code mcp inspect-config` 可在 TS Host 本地解析 `transport: "streamable-http"` 的 URL / header keys，并保持 header values 脱敏。

Phase 34 已落地的 MCP Streamable HTTP runtime 同样不新增 JSON-RPC 方法。Streamable HTTP MCP tools 仍作为普通 `ToolCatalogEntry` 进入 `create_session.tool_catalog`，执行时仍走现有 `execute_tool` request；HTTP transport、headers 和 lifecycle 都保持在 TS Host 内部。

Phase 38 已落地的 MCP resources / prompts diagnostics 同样不新增 JSON-RPC 方法。`god-code mcp inspect-config --resources/--prompts` 只在 TS Host 内部连接 MCP server 并列出 resources / prompts metadata，不读取 resource 内容，不获取 prompt 结果，也不把这些 metadata 注入 Engine payload。

Phase 39 已落地的 MCP resource read / prompt get diagnostics 同样不新增 JSON-RPC 方法。`god-code mcp read-resource` 和 `god-code mcp get-prompt` 只在 TS Host 内部调用 `resources/read` / `prompts/get`，结果停留在 CLI diagnostics 输出，不进入 `create_session`、`submit_turn` 或 PromptBuilder。

Phase 40 已落地的 MCP resource templates diagnostics 同样不新增 JSON-RPC 方法。`god-code mcp inspect-config --resource-templates` 只在 TS Host 内部调用 `resources/templates/list` 并输出 sanitized metadata，不做 template completion，不构造 concrete URI，也不改变 Engine wire payload。

Phase 41 已落地的 MCP resource subscription diagnostics 同样不新增 JSON-RPC 方法。`god-code mcp subscribe-resource` 和 `god-code mcp unsubscribe-resource` 只在 TS Host 内部调用 `resources/subscribe` / `resources/unsubscribe`，不保持跨命令 MCP 连接，不监听 resource update notification，也不改变 Engine wire payload。

Phase 42 已落地的 MCP completion diagnostics 同样不新增 JSON-RPC 方法。`god-code mcp complete-prompt` 和 `god-code mcp complete-resource-template` 只在 TS Host 内部调用 `completion/complete`，不构造 concrete URI，也不改变 Engine wire payload。面向 shell/readline wrapper 的 candidate 输出已在 Phase45 补齐。

Phase 45 已落地的 MCP completion candidate output 同样不新增 JSON-RPC 方法。`god-code mcp complete-prompt --values-only/--jsonl` 和 `god-code mcp complete-resource-template --values-only/--jsonl` 只是把 Phase42 的 completion 结果渲染为 shell/readline wrapper 可消费的候选输出；它不写入 shell rc 文件、不启动交互式 readline UI，也不改变 Engine wire payload。

Phase 46 已落地的 MCP completion shell hook script 同样不新增 JSON-RPC 方法。`god-code mcp completion-script bash|zsh` 只在 TS Host CLI 生成可 source 的 shell script，并由该 script 在 shell completion 时回调 Phase45 `--values-only` 输出；它不写入 shell rc 文件、不启动后台进程，也不改变 Engine wire payload。

Phase 47 已落地的 MCP completion guarded rc installer 同样不新增 JSON-RPC 方法。`god-code mcp completion-install bash|zsh` 只由 TS Host 在本地 shell rc 文件中 dry-run 或显式 `--yes` 更新 `# >>> GOD-code MCP completion >>>` 管理块；它不启动 Python Engine、不 source rc 文件、不启动后台进程，也不改变 Engine wire payload。

Phase 43 已落地的 MCP resource update diagnostics 同样不新增 JSON-RPC 方法。`god-code mcp wait-resource-update` 只在 TS Host 内部注册 `notifications/resources/updated` handler、调用 `resources/subscribe`、等待一次匹配 URI 的 update，然后 best-effort `resources/unsubscribe`；它不保持跨命令订阅，不把 resource update 自动注入 PromptBuilder，也不改变 Engine wire payload。

Phase 44 已落地的 MCP resource update watch diagnostics 同样不新增 JSON-RPC 方法。`god-code mcp watch-resource-updates` 只在 TS Host 内部注册 `notifications/resources/updated` handler、调用 `resources/subscribe`、在短生命周期连接内收集多次匹配 URI 的 update，然后 best-effort `resources/unsubscribe`；它不实现后台 daemon、不维护跨命令订阅、不把 resource update 自动注入 PromptBuilder，也不改变 Engine wire payload。

Phase 48 已落地的 MCP resource update loop diagnostics 同样不新增 JSON-RPC 方法。`god-code mcp loop-resource-updates` 只在 TS Host 内部保持一个连接生命周期、为一个或多个 resource 注册 update handler、收集 `notifications/resources/updated`，然后 best-effort unsubscribe；它不实现跨命令后台 daemon、不把 resource update 自动注入 PromptBuilder，也不改变 Engine wire payload。

Phase 49 已落地的 MCP context injection 不新增 JSON-RPC 方法。TS Host 通过 `GOD_CODE_MCP_CONTEXT` 或 `GOD_CODE_MCP_CONTEXT_FILE` 显式读取指定 MCP resource / prompt，并复用 Phase21 已有的 `create_session.initial_messages` 把结果传给 Python Engine；它不自动发现所有 resources / prompts，不订阅未来 update，也不改变 `submit_turn` 或 `execute_tool` payload。

Phase 50 已落地的 MCP Streamable HTTP auth env diagnostics 同样不新增 JSON-RPC 方法。TS Host 在本地解析 `headers_env` / `bearer_token_env` 并把 resolved headers 传给 MCP HTTP transport；diagnostics 只展示 header/env key metadata，不把 token/header value 放进 Engine wire payload 或 CLI 输出。

Phase 51 已落地的 MCP context limits 同样不新增 JSON-RPC 方法。TS Host 在构造 Phase49 的 `create_session.initial_messages` 前执行稳定去重、字符级 entry/total 限额和截断；Engine 仍只接收普通 `initial_messages`，不知道 MCP context stats 或限额策略。

Phase 52 已落地的 MCP legacy SSE transport 同样不新增 JSON-RPC 方法。`transport: "sse"` 只改变 TS Host 连接 MCP server 的本地 transport 选择；SSE MCP tools 仍作为普通 `ToolCatalogEntry` 进入 `create_session.tool_catalog`，执行时仍走现有 `execute_tool` request；SSE endpoint、headers 和 lifecycle 都保持在 TS Host 内部。

Phase 53 已落地的 provider retry policy 同样不新增 JSON-RPC 方法。retry 配置只影响 Python provider 层对真实 provider HTTP 请求的本地重试行为；Engine 仍通过现有 `submit_turn` 返回同样的 action/event，TS Host 只在 provider diagnostics 中展示脱敏 retry metadata。

Phase 54 已落地的 provider fallback chain 同样不新增 JSON-RPC 方法。`GOD_CODE_PROVIDER_FALLBACKS` 只影响 Python provider 层在 retryable failure 且当前 provider retry 耗尽后的本地 fallback 选择；Engine 仍通过现有 `submit_turn` 返回同样的 action/event，TS Host 只在 provider diagnostics 中展示脱敏 fallback provider/model/API-key env presence/timeout/retry metadata。

Phase 55 已落地的 Anthropic Messages provider 同样不新增 JSON-RPC 方法。Anthropic content block、tool_use/tool_result 和 streaming event 细节停留在 Python provider client 内，Engine 仍只通过现有 `submit_turn` 返回标准 action/event。

Phase 56 已落地的 context budget / deterministic compaction 同样不新增 JSON-RPC 方法。Compaction 只发生在 Python `PromptBuilder -> CompactionStrategy` 构造 `ModelRequest.messages` 时；transcript JSONL、tool execution request 和 provider diagnostics payload 都保持现有协议边界。

Phase 57 已落地的 Local OpenAI-compatible provider 同样不新增 JSON-RPC 方法。该实现只在 Python provider config / provider client 层增加本地 OpenAI-compatible endpoint 和可选 API-key 语义；Engine 仍通过现有 `supported_model_adapters` 暴露运行时能力，TS Host 仍只通过现有 provider diagnostics 展示脱敏配置 metadata。

Phase 58 已落地的 provider usage accounting and budget guard 同样不新增 JSON-RPC 方法。该实现只在 Python provider 层解析 provider-reported usage metadata 并执行可配置预算 guard；transcript JSONL、tool execution request、MCP/plugin payload 和现有 JSON-RPC method set 都保持不变。

Phase 59 已落地的 provider-specific error mapping 同样不新增 JSON-RPC 方法。该实现只在 Python provider 层解析 HTTP/API error body、生成脱敏 error metadata 并复用现有 `ProviderClientError.retryable` 影响 retry / fallback；transcript JSONL、tool execution request、MCP/plugin payload 和现有 JSON-RPC method set 都保持不变。

Phase 60 已落地的 system prompt builder 同样不新增 JSON-RPC 方法。该实现只在 Python `PromptBuilder -> ModelRequest` 内部边界增加 `system_prompt` 组合和 provider-specific request encoding；`create_session`、`submit_turn`、transcript JSONL、tool execution request、MCP/plugin payload 和现有 JSON-RPC method set 都保持不变。

Phase 61 已落地的 token budget manager 同样不新增 JSON-RPC 方法，设计见 [`../design/PHASE_61_TOKEN_BUDGET_MANAGER.md`](../design/PHASE_61_TOKEN_BUDGET_MANAGER.md)。该实现只在 Python `PromptBuilder -> ModelRequest.budget` 内部边界增加本地估算型 budget metadata；`create_session`、`submit_turn`、transcript JSONL、tool execution request、MCP/plugin payload 和现有 JSON-RPC method set 都保持不变。

Phase 62 已落地的 summary compaction strategy 同样不新增 JSON-RPC 方法，设计见 [`../design/PHASE_62_SUMMARY_COMPACTION_STRATEGY.md`](../design/PHASE_62_SUMMARY_COMPACTION_STRATEGY.md)。该实现只在 Python `PromptBuilder -> CompactionStrategy -> ModelRequest.messages` 内部边界调整模型输入消息；`create_session`、`submit_turn`、transcript JSONL、tool execution request、MCP/plugin payload 和现有 JSON-RPC method set 都保持不变。

Phase 63 已落地的 prompt injection guard 同样不新增 JSON-RPC 方法，设计见 [`../design/PHASE_63_PROMPT_INJECTION_GUARD.md`](../design/PHASE_63_PROMPT_INJECTION_GUARD.md)。该实现只在 Python `PromptBuilder -> ModelRequest.prompt_injection_report` 内部边界增加本地脱敏 finding metadata；`create_session`、`submit_turn`、transcript JSONL、tool execution request、MCP/plugin payload 和现有 JSON-RPC method set 都保持不变。

Phase 64 已落地的 provider rate limit policy 同样不新增 JSON-RPC 方法，设计见 [`../design/PHASE_64_PROVIDER_RATE_LIMIT_POLICY.md`](../design/PHASE_64_PROVIDER_RATE_LIMIT_POLICY.md)。该实现只在 Python provider 层增加本地 process-scope request throttle；`create_session`、`submit_turn`、transcript JSONL、tool execution request、MCP/plugin payload 和现有 JSON-RPC method set 都保持不变。

Phase 65 已落地的 local provider daemon lifecycle 同样不新增 JSON-RPC 方法，设计见 [`../design/PHASE_65_LOCAL_PROVIDER_DAEMON_LIFECYCLE.md`](../design/PHASE_65_LOCAL_PROVIDER_DAEMON_LIFECYCLE.md)。该实现只在 TS Host CLI 诊断 / 进程管理边界增加本地 daemon status / dry-run start / stop 语义；`initialize`、`create_session`、`submit_turn`、transcript JSONL、tool execution request、MCP/plugin payload 和现有 JSON-RPC method set 都保持不变。

Phase 66 已落地的 local provider model discovery 同样不新增 JSON-RPC 方法，设计见 [`../design/PHASE_66_LOCAL_PROVIDER_MODEL_DISCOVERY.md`](../design/PHASE_66_LOCAL_PROVIDER_MODEL_DISCOVERY.md)。该实现只在 TS Host CLI provider diagnostics 边界增加本地 OpenAI-compatible `GET /models` 查询语义；`initialize`、`create_session`、`submit_turn`、transcript JSONL、tool execution request、MCP/plugin payload 和现有 JSON-RPC method set 都保持不变。

Phase 67 已落地的 local provider model pull command 同样不新增 JSON-RPC 方法，设计见 [`../design/PHASE_67_LOCAL_PROVIDER_MODEL_PULL.md`](../design/PHASE_67_LOCAL_PROVIDER_MODEL_PULL.md)。该实现只在 TS Host CLI 显式进程执行边界增加本地 model pull dry-run / confirmed execution 语义；`initialize`、`create_session`、`submit_turn`、transcript JSONL、tool execution request、MCP/plugin payload 和现有 JSON-RPC method set 都保持不变。

Phase 68 已落地的 local provider model remove command 同样不新增 JSON-RPC 方法，设计见 [`../design/PHASE_68_LOCAL_PROVIDER_MODEL_REMOVE.md`](../design/PHASE_68_LOCAL_PROVIDER_MODEL_REMOVE.md)。该实现只在 TS Host CLI 显式进程执行边界增加本地 model remove dry-run / confirmed execution 语义；`initialize`、`create_session`、`submit_turn`、transcript JSONL、tool execution request、MCP/plugin payload 和现有 JSON-RPC method set 都保持不变。

Phase 69 已落地的 local provider model prune command 同样不新增 JSON-RPC 方法，设计见 [`../design/PHASE_69_LOCAL_PROVIDER_MODEL_PRUNE.md`](../design/PHASE_69_LOCAL_PROVIDER_MODEL_PRUNE.md)。该实现只在 TS Host CLI 显式进程执行边界增加本地 model/cache prune dry-run / confirmed execution 语义；`initialize`、`create_session`、`submit_turn`、transcript JSONL、tool execution request、MCP/plugin payload 和现有 JSON-RPC method set 都保持不变。

Phase 35 已落地的 Plugin / Skill sandbox runtime 同样不新增 JSON-RPC 方法。runtime-backed plugin tools 仍作为普通 `ToolCatalogEntry` 进入 `create_session.tool_catalog`，执行时仍走现有 `execute_tool` request；plugin subprocess lifecycle、env allowlist、timeout 和 JSON envelope 都保持在 TS Host 内部。

Phase 36 已落地的 Plugin / Skill config entry 同样不新增 JSON-RPC 方法。TS Host 通过 `GOD_CODE_PLUGIN_DIRS` 或 `GOD_CODE_PLUGIN_CONFIG_FILE` 加载本地 plugin dirs，把 executable plugin tools 合并进 `create_session.tool_catalog`；Python Engine 仍只看到标准 tool catalog 和 `execute_tool` request。

Phase 37 已落地的 Plugin / Skill local registry 同样不新增 JSON-RPC 方法。TS Host 通过 `GOD_CODE_PLUGIN_REGISTRY_FILE` 读取本地 registry 文件，只把 enabled plugin package 合并进 `create_session.tool_catalog`；disabled entries 只用于 TS Host CLI diagnostics。

Phase 71 已落地的 Plugin / Skill local registry install command 同样不新增 JSON-RPC 方法。`plugins install` 只在 TS Host CLI 边界验证本地 manifest 并写入 registry JSON；不会执行 plugin runtime code，不改变 `initialize`、`create_session`、`submit_turn`、tool execution request、MCP/plugin payload 或现有 JSON-RPC method set。

Phase 72 已落地的 Plugin / Skill local registry uninstall command 同样不新增 JSON-RPC 方法。`plugins uninstall` 只在 TS Host CLI 边界从本地 registry JSON 移除 entry；不会删除 package directory，不会执行 plugin runtime code，不改变 `initialize`、`create_session`、`submit_turn`、tool execution request、MCP/plugin payload 或现有 JSON-RPC method set。

Phase 73 已落地的 Plugin / Skill local registry enable / disable command 同样不新增 JSON-RPC 方法。`plugins enable` / `plugins disable` 只在 TS Host CLI 边界切换本地 registry entry 的 `enabled` 字段；不会热加载或卸载 plugin runtime，不会执行 plugin runtime code，不改变 `initialize`、`create_session`、`submit_turn`、tool execution request、MCP/plugin payload 或现有 JSON-RPC method set。

Phase 74 已落地的 Plugin / Skill local registry tags command 同样不新增 JSON-RPC 方法。`plugins tags` 只在 TS Host CLI 边界调整本地 registry entry 的 `tags` 元数据；不会同步远程 marketplace metadata，不会执行 plugin runtime code，不改变 `initialize`、`create_session`、`submit_turn`、tool execution request、MCP/plugin payload 或现有 JSON-RPC method set。

Phase 19 已落地的 provider contract tests 同样不新增 JSON-RPC 方法。`god-code provider contract-test` 由 TS Host 启动 Python 侧离线 contract runner，使用 fixtures 和 recording transport 验证 provider client / adapter contract，不访问真实 provider HTTP，也不改变 Engine wire payload。

Phase 20 已落地的 provider config inspection 同样不新增 JSON-RPC 方法。`god-code provider inspect-config` 只在 TS Host 侧检查 provider 环境变量形状并输出 sanitized metadata，不启动 Python Engine，也不访问真实 provider HTTP。

Phase 21 已落地的 session resume 不新增 JSON-RPC 方法，但给 `create_session` 增加向后兼容的可选字段 `initial_messages`。`god-code sessions resume` 由 TS Host 读取旧 JSONL transcript，把 user / assistant / tool_call / tool_result 转成 `initial_messages`，再创建新的 Engine session 并提交新 prompt；旧客户端不传该字段时行为不变。

Phase 22 已落地的 session cleanup 同样不新增 JSON-RPC 方法。`god-code sessions cleanup` 由 TS Host 本地扫描 active JSONL transcript，根据 `lastTimestamp` 做 dry-run、archive 或 delete；不会启动 Python Engine，也不读取 `archive/` 下的归档文件。

Phase 23 已落地的 archived session management 同样不新增 JSON-RPC 方法。`god-code sessions archive list/replay/restore` 只由 TS Host 读取或移动 `<transcriptDir>/archive/*.jsonl`；restore 只是把归档 JSONL 移回 active transcript 目录，不恢复 live Engine 状态。

Phase 24 已落地的 archived session search / delete 同样不新增 JSON-RPC 方法。`god-code sessions archive search/delete` 只由 TS Host 读取或删除 `<transcriptDir>/archive/*.jsonl`；active `sessions search/delete` 仍不访问归档文件。

Phase 13 已落地的 integration baseline 同样不改变 JSON-RPC wire contract。`protocol/goldens/*.json` 记录归一化后的真实 CLI raw event sequence；集成测试会把 `session_id`、`turn_id`、`tool_call_id` 和临时 cwd 归一化后再比较。

## 事件封装

```json
{
  "event_type": "turn_finished",
  "session_id": "session-1",
  "turn_id": "turn-1",
  "payload": {
    "status": "success",
    "assistant_message": {
      "role": "assistant",
      "content": "Read completed for README.md"
    }
  }
}
```

`assistant_delta` 已经被 Phase 2 / Phase 6 正式用起来。当前 fake streaming 和 OpenAI-compatible SSE streaming 都会发这个事件；TS Host CLI 也会消费它来做基础增量输出。JSON-RPC wire contract 本身不需要为 streaming 再加新方法。

GOD-code 的 JSON-RPC transport profile 要求 method 为非空白字符串，request/response `id` 为正 JSON-safe integer；布尔值、零、负数、小数、超出 safe integer 范围的数字和 string ID 均不会进入 handler dispatch 或 pending correlation。

所有 request 和 notification 还必须显式携带 recursive JSON-safe object `params`。当前协议不接受省略 params、positional array、primitive 或含 non-JSON nested value 的 object；非法 request params 返回 `-32602`，非法 notification params 不进入业务分发。

消息角色的核心字段保持互斥：request/notification 不得携带 `result` 或 `error`，response 不得携带 `method` 或 `params`。合法 ID 的混合 request 返回 `-32600`；混合 notification/response 不进入 handler 或 pending correlation。非核心 JSON extension 字段仍允许保留。

双向 request handler 的返回值也在发送前受同一 transport profile 约束：success 必须是 JSON-safe object，error 必须具有 safe-integer code、非空白 message 和 JSON-safe optional data。非法本地 handler 输出统一转换为 `-32603 / Invalid JSON-RPC request handler response.`，不会写出 malformed response。

最终 writer 会再次验证完整 outbound envelope，包括 `jsonrpc: "2.0"`、消息角色、identity、params/result/error 和 recursive JSON safety。非法或循环 payload 在序列化前失败且不会写出 partial bytes；合法非核心 JSON extension 字段保持原样。

stdio framing 的单条 JSON payload 上限为 1 MiB UTF-8 bytes，LF/CRLF delimiter 不计入上限。reader 在 parse 前丢弃 oversized line；无换行超限输入不会继续累积，找到下一处 delimiter 后恢复处理后续合法消息。

writer 使用同一 1 MiB 上限并在 stream write 前检查 UTF-8 bytes。oversized request/notification 不写入 wire；oversized handler success/error 返回紧凑 `-32603 / JSON-RPC output line exceeds maximum size.`，避免远端丢弃 frame 后 requester 超时。

每个 JSON-RPC peer/connection 最多允许 256 个 pending requests。第 257 个 request 在 ID、timer/waiter 和 wire write 前失败，错误为 `JSON-RPC pending request limit exceeded.`；response、timeout、send failure 或 close 清理 entry 后容量可再次使用。

request timeout 必须在 runtime timer 安全范围内：TS 接受 1..2,147,483,647 的整数毫秒，Python 接受 0.001..2,147,483.647 的有限秒数。NaN、infinity、bool、零、负数、TS fractional ms 和超范围值在 pending admission 前以 `JSON-RPC request timeout is out of range.` 失败。

request ID allocator 的最大值为 `9,007,199,254,740,991`。最后一个 safe ID 分配后 allocator 进入不可逆的 null/None terminal state；后续 request 以 `JSON-RPC request id space exhausted.` 失败，不生成 unsafe integer、不 wrap，也不复用旧 ID。

peer 保留最近 512 个已离开 pending 的 request ID：正常或 malformed response 消费的 ID 标记为 `completed`，timeout 标记为 `timed_out`。后续 response 分别诊断为 `Duplicate JSON-RPC response id`、`Late JSON-RPC response id` 或 `Unexpected JSON-RPC response id`；历史按 FIFO 有界淘汰。

notification consumers 按注册顺序执行且逐个隔离失败。TS 公共 observer 失败诊断为 `JSON-RPC notification observer failed: <method>`，两端 method handler 失败诊断为 `JSON-RPC notification handler failed: <method>`；失败不生成 response、不阻断后续 consumer，诊断 consumer 自身失败也不会改变 control flow。

TS 的所有 `protocol_error` 均通过 failure-isolated dispatcher 发出。每个 listener 独立调用；同步 throw 和 Promise rejection 都被吞入诊断边界，不会中断 framing recovery、message routing、handler fallback、pending rejection/cleanup 或后续 diagnostic listener。

TS close transition 先设置 closed、清理 timer、reject并清空全部 pending，再逐个隔离调用 `close` observers。observer 同步 throw 或 Promise rejection 诊断为 `JSON-RPC close observer failed.`，不会让 `close()` 抛错、阻断后续 observer 或破坏重复 close 幂等。

TS writer 通过串行 Promise chain写入 frames。`send` 只有在 write callback成功且 false backpressure对应的 `drain` 到达后才完成；write throw、callback error、stream error或 mid-write close会关闭 peer并 reject pending。notification和双向 response paths均观察异步写入结果，terminal close后的 queued frame不会继续写入。

TS outbound writer同时限制 active/queued frames为 256 个、最终 UTF-8 encoded frames总量为 4 MiB。容量检查在进入 write chain前完成；overflow只拒绝当前发送且不关闭 peer，frame无论正常完成或失败都会在 Promise settlement时归还容量。

TS peer在 close transition中解除其拥有的 readable/writable长期 listeners并清空 partial framing state，因此关闭后的新输入不会继续 dispatch。idle output stream close同样关闭 peer；transport迟到 error由不捕获 peer引用的模块级 guard处理。

TS async inbound request handler最多允许 256 个 active IDs。同一 active ID的重复request回复 `-32600`且不再次执行handler；容量overflow回复 `-32000`。admission覆盖完整handler/response lifecycle，并在任一settlement路径释放。

TS async inbound notification最多允许256条active consumer chains。达到上限后的notification在调用任何observer/handler前被诊断并丢弃，不产生response且不关闭peer；已接纳notification在consumer chain结束后归还容量。

TS line router同时限制512个in-flight frames和4 MiB原始frame content。admission覆盖parse到response/consumer settlement；越界时无法安全drop未知角色frame，因此产生diagnostic并terminal close，已接纳任务最终仍归还accounting。

TS request若在serialized writer queue等待期间已timeout或提前settle，会在进入Writable前因pending membership失效而取消。该本地cancellation不关闭peer、不会发送过期frame，并正常归还outbound queue容量；已进入Writable的frame仍不可撤回。

两端method-specific notification handlers均按dispatch-start snapshot执行。TS registry使用copy-on-write并在分发前复制数组；处理中新增handler只从下一条notification开始生效，不会扩张当前consumer chain。

两端method notification registration均返回专属幂等unsubscribe handle。相同function的多次registration按对象identity独立管理；当前dispatch snapshot不受中途unsubscribe影响，后续notification立即使用更新后的registry。Python mutation/snapshot由短锁保护，handler调用不持锁。

两端request handler registration均返回专属幂等unregister handle。每个method只有一个current owner；replacement接管后，旧registration的stale cleanup不会删除新owner。dispatch开始时捕获owner，current request继续完成，后续request观察最新registry。

两端terminal close/stop会清空request与notification registries并拒绝新的handler registration，避免关闭连接继续持有业务closure。已有cleanup handles在registry disposal后仍可幂等调用；Python stopped gate、registry mutation与clear共享同一短锁。

Python connection stop会立即清空outbound pending map，并向每个等待线程投递 `-32000 JSON-RPC connection stopped.`，不再让request等待原始timeout。stop后新request在ID分配前失败；通用response writer仍允许完成触发stop的shutdown request响应。

Python reader loop无论因stdin EOF、explicit stop还是reader/dispatch异常退出，都会在finally进入幂等stop。EOF正常返回但先完成registry/pending cleanup；异常在相同terminal cleanup后继续传播原错误。

Python public outbound request/notification在write lock内检查connection仍running；stop设置event后经过write-lock barrier，返回后不会再出现public frame。内部response writer不受该gate限制，从而允许触发stop的shutdown request完成最终ack。

TS peer close会在observer dispatch后同步释放public notification和close EventEmitter listeners；protocol diagnostic listeners保留到所有async close observers完成失败隔离报告，随后也被释放。closed peer不再长期持有这些consumer closures。

TS peer close会清理所有custom/known EventEmitter events，而非只处理协议事件；closed后 `on`、`addListener`、`once`、`prependListener`、`prependOnceListener`均拒绝新observer。protocol_error仅在async close diagnostic窗口内短暂保留。

两端terminal transition会清空settled response history并将request ID allocator置为null/None，不再保留仅供live correlation使用的状态。Python stop还会释放optional protocol diagnostic callback；pending wakeup和TS async close diagnostics保持各自独立生命周期。

TS peer close会主动abort已进入Writable但尚未获得callback/drain acknowledgement的active frame，不依赖底层stream自行结束。queued frames随后命中closed gate，所有send Promise和queue accounting都会settle；迟到write callback由幂等settled gate忽略。

Python outfile `write`或`flush`异常会在write lock释放后terminal stop connection，并向当前调用方重抛原异常。其他pending waiters获得统一stopped response，registries被清理，后续public request/notification不会再次触碰broken writer。

Python first terminal transition会保存reader/writer真实错误message；全部pending requests及后续public request/notification共享该-32000 terminal reason，直接故障调用方仍获得原exception。stop lock保证后续stop不能覆盖首因；graceful stop继续使用generic stopped message。

TS first close transition会保存唯一terminal Error对象。pending requests、active/queued writes及后续request/notify/handler/observer registration均共享该cause；重复close不能覆盖首因。graceful close使用统一generic Error，stream/manual failure保留具体对象和message。

Python post-stop request/notification handler registration也复用first terminal cause，并统一抛 `JsonRpcRequestError(-32000, reason)`。reader/writer failure和graceful stop在pending、outbound及registry control APIs上具有一致terminal reason。

Python terminal register保存canonical `JsonRpcRequestError`。若首因包含非默认code或structured data，pending response及后续request/notify/handler registration完整保留code、message和data；普通reader/writer exception仍规范化为-32000。

Python canonical terminal error在提交前执行wire-safe normalization：code必须是JSON safe integer，否则回退-32000；data必须递归JSON-safe，否则省略。合法data在terminal register、每个pending envelope和每次post-stop public error之间使用独立快照，外部mutation不会改变后续terminal cause。

Python connection的post-stop lifecycle error优先于新调用的参数错误。request、notification及两类handler registration先执行统一terminal gate，再验证method/params/timeout；因此连接停止后即使调用参数非法，仍返回同一canonical code/message/data。request admission和writer gate继续处理参数验证期间发生的并发stop。

Python running-required outbound send同样让terminal state优先于frame preparation错误。send在payload validation/encoding前检查stop，并在返回invalid-frame或oversized-frame错误前重新检查；若encoding期间connection停止，则返回canonical terminal cause且不会写入frame。内部response/fallback发送不要求running，仍可完成已接纳请求的协议settlement。

Python outbound JSON serialization和UTF-8 byte measurement由统一encoding boundary保护。孤立surrogate或其他pre-write encoder exception转换为 `-32603 / JSON-RPC output encoding failed.`，不泄漏Python异常且不关闭仍可用connection；若encoding期间connection已停止，canonical terminal cause优先。handler success遇到该错误会通过既有handler error path返回安全的-32603 response。

Python terminal error data快照只使用内建JSON scalar/list/dict操作并输出plain values，不调用对象自定义的 `__deepcopy__`。data validation或snapshot本身抛错时，该optional字段被省略，但code/message和stop cleanup仍会提交；每个pending envelope及post-stop exception继续获得独立快照。

Python structured terminal error对象本身也视为不可信输入。读取code或data的descriptor抛错时分别回退-32000或省略data；int子类会先归一为plain int再检查JSON safe range，不执行其自定义abs钩子。metadata失效不会阻断stop event、handler cleanup或pending wakeup。

TS outbound JSON.stringify同样由protocol containment boundary保护。validation后发生的dynamic getter异常转换为 `-32603 / JSON-RPC output encoding failed.`，附带sanitized cause message；由于尚未进入queue或transport，peer保持open且后续合法frame可继续发送。若getter副作用在encoding期间关闭peer，则first terminal Error对象优先返回。

TS handler error response还具有最终preparation fallback。structured error data若在首次validation后发生读取漂移，使writer二次validation返回invalid outbound，或在JSON.stringify阶段抛错，responder会发出protocol diagnostic并改发plain `-32603 / Invalid JSON-RPC request handler response.`。peer保持open，请求方获得确定响应而非timeout；已closed状态仍直接传播terminal cause。

Python handler error在进入writer前由builder转换为plain snapshot。JsonRpcRequestError的code/data getter由builder内部隔离，code转为plain safe int，data只验证一次后使用内建JSON tree copy；无效或检查失败的data使整个structured error回退 `-32603 / Invalid JSON-RPC request handler response.`，而getter不可读时使用generic -32000和省略data。dispatch不会因动态metadata逃逸，connection可继续处理后续request。

Python handler success result也在writer前建立plain snapshot。原始result只接受一次不可信JSON-object validation，随后通过内建tree copy转换为owned JsonObject；validation或snapshot抛错统一发送 `-32603 / Invalid JSON-RPC request handler response.`。writer不会再次读取原始动态容器，因此同一非法result不会因失败阶段不同而在-32000、encoding -32603和contract -32603之间漂移。

TS handler success result采用单次validation-and-copy snapshot。递归snapshot只接受finite number、string、boolean、null、array和plain object，拒绝cycle及property读取异常，并输出owned plain tree。writer的schema validation与JSON.stringify只读取该snapshot；动态getter失败统一发送handler contract -32603，peer保持open并可继续处理request。

Python public request/notify params在admission时建立deep plain snapshot。`require_json_rpc_params` 同时执行JSON-object validation和内建tree copy，inspection或snapshot异常统一返回 `-32602 / JSON-RPC params must be a JSON-safe object.`；两个调用路径使用返回的snapshot构造wire payload，不再引用调用方动态容器。post-stop terminal precedence仍先于params validation。

TS public request/notify params同样在admission时使用single-pass snapshot，并以owned plain object构造payload。snapshot getter失败且peer仍open时返回 `JSON-RPC params must be a JSON-safe object.`；getter若触发close，无论随后抛错或返回合法值，调用都返回first terminal Error identity。request ID、pending timer和writer queue只在snapshot与closed recheck成功后创建。

TS JSON snapshot按data property语义创建对象键。`__proto__`、`constructor`及nested同名键作为enumerable own JSON data保留，不调用Object.prototype上的legacy setter，不改变snapshot的Object.prototype，也不会污染其他对象。该规则同时覆盖outbound params和handler success result，合法payload可完整round-trip。

TS notification fan-out为每个public `notification` observer和method-specific handler提供独立deep plain params snapshot。全部consumer payload在首个callback前生成，随后仍按observer注册顺序、再按method handler注册顺序逐个await执行；一个consumer修改顶层或nested值不会改变其他consumer看到的原始notification数据，failure isolation和registration snapshot语义保持。

Python notification fan-out同样为每个method-specific handler提供独立deep plain params snapshot。connection先冻结registration list，再建立canonical params并预生成完整consumer snapshot tuple；只有全部snapshot成功后才开始handler调用。一个handler修改顶层或nested值不会污染后续handler，单个handler异常与unsubscribe仍保持既有隔离和本次dispatch snapshot语义。

TS `protocol_error` fan-out不会把transport或pending settlement使用的原始Error直接暴露给observer。dispatcher为每个observer预生成独立diagnostic Error；generic Error保留name/message/stack，JsonRpcError同时保留code并深复制JSON-safe data。observer mutation不会改变后续observer输入或请求调用方最终收到的控制流错误。

TS `close` fan-out同样不暴露connection保存的原始terminal Error。显式close cause会为每个close observer生成独立副本，未提供cause时继续传递undefined；observer修改message或JsonRpcError nested data不会改变其他observer、pending request rejection以及后续request/notify/registration API复用的first terminal cause。

Python inbound response在pending settlement前被复制为connection-owned plain JSON tree，随后success result或error object在request parser边界再次snapshot为caller-owned数据。远端message、settlement queue与public request返回值不共享nested containers；动态payload inspection失败稳定映射为-32603 response contract error，不会把peer-owned引用交给调用方。

TS inbound response在 `handleResponse` settlement boundary建立caller-owned plain snapshots。success result经deep snapshot后resolve；error object先整体snapshot和验证，再以owned data构造JsonRpcError。source nested mutation或dynamic getter drift不会改变request caller结果，snapshot失败沿用invalid success/error response contract并清理pending entry。

Host tool permission policy返回 `prompt` 时，Host始终形成一条显式approval decision并写入audit。未配置interactive prompt或prompt调用异常会转换为 `action: deny, source: unavailable`，返回 `permission_denied` 且不执行工具；审计顺序保持 `tool_requested -> tool_decision -> tool_approval -> tool_finished`。

Host tool handler返回后，permission policy的 `afterExecute` 仅作为观察边界。若该回调失败，Host保留原始工具success或domain error，并在result `output.policy_warning` 中附加 `{code: "policy_error", message, phase: "after_execute", tool_name}`；不会把已经提交的文件或命令副作用改写成新的可重试policy_error失败。

Host tool audit默认不落盘；显式设置 `GOD_CODE_AUDIT_FILE` 后，TS Host按事件调用顺序追加JSONL envelope，每行包含 `recorded_at` UTC时间和完整 `event`。Audit payload可能包含工具输入、路径、命令和结果，因此该配置为opt-in，新目录/文件使用受限权限，且不应指向公开或共享位置。

Audit sink写入失败不会把已完成工具结果改写成失败，也不会放宽permission decision。Host会在最终result `output.audit_warnings` 中按事件顺序附加 `{code: "audit_error", event_type, message}`。`tool_finished` 自身写入失败也会出现在caller result中；由于该事件未能持久化，其warning自然只对调用方可见。

JSONL sink的record preparation保持`Promise<void>`失败契约：clock/ISO timestamp、JSON serialization或UTF-8 byte sizing异常会返回rejected Promise而不是同步抛出。该失败由相同的 `audit_warnings` 路径观察，且不会污染serialized write tail；后续合法event仍可写入。

JSONL envelope持久化前默认递归脱敏structured credential keys。Key经lowercase和separator removal后，authorization/password/passwd/secret/token/api-key/private-key/cookie类后缀的值写为`[REDACTED]`；原AuditEvent不变。该规则不扫描command、message或output中的自由文本secret。

`GOD_CODE_AUDIT_REDACT_KEYS`允许以comma-separated key suffix追加业务规则。Entries经相同lowercase/separator normalization并去重，最多64项、每项规范化后1-128字符；empty entry或仅separator entry会使Host setup失败。Custom规则与built-ins合并，不能关闭默认redaction。直接构造JsonlAuditSink时可通过第四参数传入相同additional suffix list。

`god-code audit inspect-config [--json]`只读解析audit环境配置，报告enabled、resolved path、max bytes、rotation generation count、`process_and_filesystem` coordination scope、same-user hashed temp lock path、5000ms lock timeout、10ms retry interval、append durability、default redaction状态和normalized custom key names。`GOD_CODE_AUDIT_DURABILITY`接受buffered、data或full，默认buffered；data映射per-record datasync，full映射file fsync，并在POSIX current entry新建/重建时同步parent directory。Runtime先从shared inspection报告的nearest existing directory开始逐级exact-create missing parent、no-follow pin child并绑定logical path/descriptor identity；bootstrap完成后在coordination lock内第二次inspection并pin immediate parent，missing current从该anchor exclusive-create。Create前和create成功后/write前，所有policy都要求logical parent path、parent descriptor与authoritative inspection dev/ino一致。POSIX full在write后再次执行同一identity gate并sync transaction持有的parent handle，不重新按path打开directory。Windows full保持file-only。未配置file但存在辅助设置时返回warn；enabled invalid配置返回error和non-secret validator message。Doctor复用该检查，error时跳过Host tool setup。Inspection命令本身不创建、读取或写入audit target或lock path。

Runtime JSONL coordination lock先pin derived lock path的immediate parent，通过shared mutation adapter exact-create reservation并从actual mutation path打开original lock directory，再通过该directory anchor执行`owner.json`的O_EXCL/no-follow creation。Owner exclusive open和initial regular/single-link fstat成功后，creation handle在metadata write前立即进入outer acquisition ownership；canonical write、final snapshot或logical path gate失败时，failed acquisition cleanup可按original descriptor验证owner path和exact single-entry layout，unlink本次zero-byte/partial owner并收缩empty lock。Replacement、extra entry或directory drift拒绝cleanup并保留residue，caller仍收到original acquisition error。成功holder持续保持parent、lock-directory与owner-file三个descriptors，直到成功`release()`或显式`abandon()`。Release直接复用三个handles重验current paths、完整BigInt owner snapshot、canonical metadata和single-entry invariant，不在release-time重新open对象；owner unlink从lock anchor解析，directory rmdir从parent anchor解析。两次mutation后还要求target path missing、original descriptor dev/ino一致且`nlink === 0`，之后才进入released。`abandon()`只终止本进程descriptor ownership，不rename、unlink或rmdir磁盘entry；release/abandon由per-lock promise tail串行，成功终态幂等，release-after-abandon拒绝。Linux使用validated procfd child paths，其他平台或procfs unavailable时执行logical path/descriptor fallback gate。Detachment proof能拒绝wrong-object fake-success，但不能撤销已删除replacement。该low-level lifecycle不新增JSON-RPC字段、CLI输出或cleanup authority。

`god-code audit inspect-path [--json]`在有效配置上显式执行与record及runtime rotation相同的component lstat/no-follow检查，并报告target existence、nearest existing directory、missing component paths、directory write access、existing target write access和POSIX mode。Command还lstat shared coordination lock path，报告existence、directory/symbolic_link/regular_file/other type、snapshot acquirable和non-negative age：absent为ready，directory holder为warn，非目录blocker为error；age不构成stale或cleanup判定。Directory lock的0600 owner metadata通过shared pinned-owner reader在4096-byte上限内绑定path/descriptor BigInt identity并解析，read-only projection完成后立即关闭handle；CLI只投影valid/missing/invalid status、PID和canonical acquired time，不输出UUID token。Missing/invalid metadata追加warning但不授权cleanup。Current target existence、size、regular-file和single-link规则由`inspectJsonlAuditPath`统一拥有；record初次inspection若发现parent chain缺失，会固定nearest existing directory并按missing components逐级exact mkdir/no-follow open/bind，`EEXIST` child只有确认为directory才接管。Runtime随后获取coordination lock并执行第二次inspection，pin immediate parent，existing current从parent anchor打开并保持descriptor跨capacity和rotation postcondition。`.1` unlink及current→`.1` rename从同一anchor执行，完成后要求current missing且rotated path绑定original current descriptor。Final append继续执行expectation gate：existing generation用anchored non-create open并重验identity，missing/rotated generation用anchored exclusive create；replacement、disappearance和unexpected appearance均在write前拒绝。Final descriptor以最新fstat size再次调用shared capacity decision，same-inode growth若使本次record需要rotation则拒绝write；mode收敛后还会再次no-follow lstat current path，要求regular、single-link和dev/ino仍与descriptor一致，拒绝post-open path漂移。若`writeFile`拒绝，runtime只在post-error size增长不超过exact line bytes且logical path仍绑定same descriptor时truncate回pre-write size；configured data/full policy同步rollback，unknown growth或path drift保留。Record write及durability步骤完成后，同一gate再次验证成功返回时的current entry；post-write mismatch会拒绝Promise，但record可能已经写入moved descriptor target。Missing target只要求directory W_OK；existing target还要求target W_OK以支持O_WRONLY append。Command从相同lstat metadata报告`max_bytes`、`current_generation_bytes`、clamped `remaining_capacity_bytes`、`current_generation_over_capacity`和`rotation_expected_on_next_record`；该状态以one-byte minimum record调用与runtime相同的overflow-safe capacity decision，current非空且size大于等于capacity时返回warn，尚有空间时不预测未知record大小。Command同时报告`.1` rotation path/existence/type/replaceability：directory为error，symlink/other non-directory为warn且不跟随。Broad current mode为warn且inspection不chmod；current symlink、hard-link、non-directory parent、non-regular或不可写target为error。该命令不mkdir、不open target、不acquire/refresh/remove lock、不rotation、不unlink也不写入。

`god-code audit inspect-rotation-stagings [--json]`只读枚举当前configured audit target的same-parent rotation staging namespace。Runtime与inspector都从resolved absolute audit path计算SHA-256并截取32 lowercase hex，形成`.god-code-audit-rotation-<target-hash>-` prefix；scanner最多消费4096个audit parent entries并materialize 128个exact六字符ID结果。Other-target hashed names不会进入count/result或CLI输出；Phase553固定prefix的exact legacy names只增加`legacy_unscoped_entry_count`和warning，不推断target ownership。每个selected root执行no-follow lstat、pinned directory read、entry-set与前后identity验证，并只把exact empty、single `previous`或其他状态投影为`empty`、`previous_only`、`unknown`。`previous`只报告no-follow type与safe size，不读取archive bytes。Command不恢复、rename、unlink、rmdir或生成fingerprint。

`god-code audit inspect-rotation-staging <staging-id> [--json]`只接受exact六字符ASCII alphanumeric ID，并从当前configured target重新派生single staging path。该direct command不扫描parent，复用list的single-entry projection和uncertainty rules；missing返回`exists: false`与OK，existing返回manual-review warning，non-directory、unknown、state drift或inspection error追加warning。List/direct均为TS Host本地diagnostics，不新增JSON-RPC method、agent event、tool result或persistent metadata字段，也不授予后续mutation authority。

`god-code audit inspect-rotation-recovery <staging-id> [--json]`把selected target-bound staging、current generation、`.1` generation和derived coordination lock组合为只读recovery readiness graph。Runtime对current/rotated执行前后full BigInt no-follow snapshot，复用detailed staging reader验证root descriptor、exact entry set与optional `previous` snapshot，并在图读取前后比较lock projection。Stable exact-empty private staging、`previous_only + valid current + missing .1`和`previous_only + missing current + valid .1`分别输出cleanup、archive restore或full rollback action以及32-hex domain-separated fingerprint；ambiguous current+`.1`、invalid/unsupported state、active lock或任一graph drift无fingerprint。Report `audit_rotation_recovery`固定`confirmation_required: true`、`mutation_performed: false`。该Host-local command不读取JSONL/archive content、不执行mutation，也不新增JSON-RPC method、notification、agent event、tool result或persistent metadata字段；future mutation必须获取normal coordination lock并在锁内重新计算匹配。

`god-code audit recover-rotation-staging <staging-id>`仍是TS Host-local maintenance command。默认dry-run复用Phase555 report；真实mutation要求`--yes --expect-action <action> --expect-recovery <fingerprint>`。Runtime进入与JsonlAuditSink相同的target serialization tail，获取normal coordination lock并验证held owner graph，在锁内重复读取/classify/fingerprint后固定parent、staging与generation descriptors，再执行empty cleanup、archive restore或full rollback。Pre-commit failure按可证明identity reverse rollback；generation commit后的wrapper residue和directory durability uncertainty只进入`audit_rotation_staging_recovery` WARN details，不产生wire event或Engine-visible tool result。该命令不增加JSON-RPC method/notification、agent event、provider request、transcript或persistent schema字段。

Phase557扩展同一Host-local report的commit evidence与lifecycle fields：`performed_action`只表示实际完成的action，`recovery_handles_closed`描述candidate descriptors，`coordination_lock_released`与optional residual path描述normal lock finalization。已知operation result在close/release failure后仍保留，CLI以WARN呈现；pre-commit primary error仍保持ERROR。字段只存在CLI/runtime diagnostic object中，不进入JSON-RPC envelope、Engine event、tool result、transcript或persistent metadata。

Phase558继续只扩展该Host-local ERROR report。`failure_stage`、`mutation_state`、`mutation_attempted`、rollback fields与`coordination_lock_acquired`描述normal lock acquisition、锁内validation、candidate lifecycle、namespace syscall和reverse rollback结果；candidate/lock finalization warning可与primary rejection同时存在但不替换其message。Typed runtime error的raw cause、FileHandle、BigInt与owner metadata/token不被序列化。以上字段不新增JSON-RPC method/notification、Engine-visible event、tool result、provider payload、transcript或persistent metadata。

Phase559不增加report或wire字段，只修正`recovery_handles_closed`现有字段的覆盖范围。Candidate pinned opener在open后、return前validation失败时把unreturned parent/staging handle交给outer finalizer；returned与handed-off descriptors统一关闭并把failure映射到既有warning。Handoff collector和FileHandle只存在TS Host当前stack frame，不进入JSON-RPC envelope、Engine event、tool result、transcript或persistent metadata。

Phase560同样不增加字段，只规范化Host-local descriptor close invocation。每个close通过async boundary转成独立Promise后再all-settled，因此同步throw与async rejection使用相同`recovery_handles_closed`/warning projection，且不能覆盖performed action或typed primary failure。Invocation helper、FileHandle和raw failure都不进入JSON-RPC、Engine event、tool result、provider payload、transcript或persistent metadata。

Phase561只收紧这些Host-local message/warning值：arbitrary reason通过total formatter提取，formatter hook失败使用固定fallback，控制/line separator字符被替换，summary限制为512字符。Raw reason、stack、cause与properties不进入CLI diagnostic object，更不进入JSON-RPC、Engine event、tool result、provider payload、transcript或persistent metadata；wire字段集合不变。

Phase562在同一Host-local recovery ERROR details中新增`post_failure_observation_completed`、optional nested `post_failure_observation`和warning。Nested object只包含锁释放前current/rotated/staging metadata、assessment、eligibility及optional action/fingerprint；它与mutation前top-level fingerprint分离，也不授权自动retry。Observation前后lock assertion、graph reader和classifier均留在TS Host，failure只追加bounded warning。以上字段不进入JSON-RPC method/notification、Engine event、tool result、provider payload、transcript或persistent metadata，wire contract仍不变。

Phase563为Host-local staging projection新增`entry_scan_count`、`entry_scan_limit`和`entry_scan_truncated`。这些字段描述selected staging内部有界stream scan；`entry_count`仅在未截断时保留exact语义，child names和overflow total不被序列化。Truncation只影响Host readiness/recovery authority与CLI diagnostics，不新增JSON-RPC method/notification、Engine event、tool result、provider payload、transcript或persistent metadata字段。

Phase564为Host-local quarantine/disposal projection新增`root_entry_scan_count`、`root_entry_scan_limit`、`root_entry_scan_truncated`，并为quarantine nested `lock`增加对应`lock_entry_scan_*`字段。Exact `root_entry_count`/`lock_entry_count`仅在scan未截断时存在；truncated state固定`unknown`且无owner或empty fingerprint authority。Child names与overflow total不序列化。Active lock、cleanup和recovery exact-entry gates复用同一descriptor-bound scanner，但不新增JSON-RPC method/notification、Engine event、tool result、provider payload、transcript或persistent metadata字段。

Phase565为active coordination lock的Host-local projection新增`coordination_lock_entry_count`、`coordination_lock_entry_scan_count`、`coordination_lock_entry_scan_limit`、`coordination_lock_entry_scan_truncated`、`coordination_lock_owner_entry_exclusive`、`coordination_lock_state_changed`和`coordination_lock_inspection_error_code`。Inspector在同一directory descriptor上执行initial/final bounded scans；valid owner descriptor保持到final scan之后并验证path/object/content连续性。Child/owner drift、truncation或inspection error撤销owner metadata与cleanup fingerprint authority，rotation readiness将internal uncertainty归类为`state_changed`。这些scalar fields用于inspect-path、cleanup、quarantine recovery preflight和rotation recovery CLI diagnostics；child names、owner token与raw error不序列化，也不进入JSON-RPC method/notification、Engine event、tool result、provider payload、transcript或persistent metadata。

Phase566不增加Host-local字段，而是收紧valid-owner projection顺序。Final owner snapshot之后，inspector必须再次使用original lock directory descriptor执行no-follow terminal lock-leaf binding；logical lock path若已变为symlink、replacement或不再绑定original directory object，则复用`coordination_lock_state_changed: true`并撤销owner/exclusive/fingerprint authority。这样owner path经intermediate symlink仍解析到原file也不能把symlink leaf报告为stable directory。Inspect-path、cleanup、quarantine recovery preflight和rotation recovery readiness自动继承该结果；wire、persistent metadata和CLI字段集合不变。

Phase567继续不增加Host-local字段，而是把active inspection的两个directory gates绑定到open-time full identity。每次descriptor/path/descriptor读取都必须匹配pinned device/inode/ctimeNs/birthtimeNs；final scan后的child entry、owner basename、chmod或directory namespace变化即使保留same device/inode，也会复用`coordination_lock_state_changed: true`并撤销owner/exclusive/fingerprint authority。Mutation cleanup/recovery/release继续使用允许transaction rename/unlink改变ctime的object matcher。Inspect-path、cleanup、quarantine recovery preflight与rotation readiness字段、wire和persistent schema均不变。

Phase568仍不增加Host-local或wire字段。Quarantine/disposal residue在final bounded scan和strict root/nested generation gates之后重新读取唯一selected owner；initial/final owner path、status、device/inode与canonical metadata必须一致，owner reread后再次终检参与layout判断的directory generation。Drift继续复用既有`state_changed: true`、`layout: unknown`并省略owner/empty fingerprint；strict empty opener同样只接受open-time exact-empty generation。CLI human/JSON、JSON-RPC、agent event、provider、tool result、transcript和persistent schema字段集合不变。

Phase569继续复用现有Host-local字段。Initially-missing source quarantine在owner-only或empty disposal fingerprint返回前再次通过no-follow `lstat`确认；late present entry投影`source_quarantine_exists: true`、entry type、`source_quarantine_state_changed: true`，disposal复用`state_changed: true`与`layout: unknown`并省略owner/empty fingerprint。Late source内部不扫描，path-chain/error uncertainty同样撤销authority。CLI、JSON-RPC、agent event、provider、tool result、transcript和persistent schema字段集合不变。

Phase570继续不增加Host-local或wire字段。Active lock、owner-bearing quarantine与owner-only disposal在各自terminal directory/source gate后重新执行bounded owner inspection，并要求前后device、inode、ctimeNs、birthtimeNs、mtimeNs、size及canonical metadata连续。Terminal owner drift复用既有`coordination_lock_state_changed: true`或`state_changed: true`/`layout: unknown`，省略owner fields、fingerprint与cleanup confirmation；CLI、JSON-RPC、agent event、provider、tool result、transcript和persistent schema字段集合不变。

Phase571为`JsonlAuditLockInspection`、`JsonlAuditLockQuarantineEntryInspection`和`JsonlAuditLockDisposalEntryInspection`增加Host-local optional `ownerFingerprint`，但不增加CLI human/JSON、JSON-RPC、agent event、provider、tool result、transcript或persistent schema字段。该32 lowercase hex值不再由CLI从owner token计算，而由shared inspector在stable terminal authority后生成，并绑定version/domain、absolute candidate path、layout/owner location、参与authority的directory full generations、selected owner full generation与canonical metadata；owner-only disposal还绑定derived source quarantine path的confirmed-missing marker。List/direct/dry-run对同一stable candidate投影同一值；不同path/domain/layout或replacement generation得到不同值。四类mutation从fresh pinned candidate重算相同material，并在任何private wrapper、reservation、rename、unlink或rmdir前拒绝mismatch。

Phase572不增加或删除Host-local、CLI human/JSON、JSON-RPC、agent event、provider、tool result、transcript或persistent schema字段，只收紧六条maintenance command中optional positive fingerprint字段的出现时机。Preflight expected mismatch继续投影对应`*_fingerprint_matches: false`且不回显current fingerprint；preflight match只控制runtime调用。Runtime throw或`existed: false`省略positive match/fingerprint，只有runtime existing result携带exact expected owner/quarantine/disposal fingerprint时才投影`true`和该runtime value。Mutation result、post-commit residual、flag语法和32-hex格式保持。

Phase573继续不增加或删除任何Host-local、CLI human/JSON或跨层schema字段。`cleanup-lock`与`cleanup-lock-quarantine`在runtime返回existing candidate后，把原selected path existence分别投影为`coordination_lock_exists: false`和`quarantine_exists: false`；该terminal value与`removed: true`一致，且不受private `residual_quarantine_path`或`residual_disposal_path`影响。Dry-run和pre-runtime refusal仍保留inspection snapshot，其他entry/layout/owner evidence、fingerprint与mutation contract不变。

Phase574继续保持Host-local、CLI human/JSON及跨层schema字段集合不变，并收紧两个optional existence字段的出现条件。`cleanup-lock-disposal`和successful `recover-lock-quarantine`在runtime existing且无residual时分别投影`disposal_exists: false`与`quarantine_exists: false`；存在对应residual locator时保留该path和WARN，但省略selected existence boolean，因为locator只表达cleanup uncertainty而不证明logical path current state。Recovery rollback-residual verified branch、confirmation fingerprint、commit/rollback与wire contract保持。

Phase575继续不增加、删除或重命名Host-local、CLI human/JSON或跨层schema字段。六条maintenance command在runtime返回`existed:false`时保留selected path/ID、selected `*_exists:false`及`removed:false`或`recovered:false`，但省略preflight entry/layout/scan/owner/state fields。Owner/empty disposal同时省略source quarantine state，recovery同时省略coordination lock state；这些cross-path values未被runtime missing fast path观察。Existing success、residual、rollback、dry-run、runtime result及wire contract保持。

Phase576为五类cleanup runtime result增加optional `cleanupHandlesClosed`/`cleanupHandleWarning`，为quarantine recovery result增加optional `recoveryHandlesClosed`/`recoveryHandleWarning`；对应Host-local CLI human/JSON details使用`cleanup_handles_closed`/`cleanup_handle_warning`与`recovery_handles_closed`/`recovery_handle_warning`。Candidate-existing stable result报告closed，secondary close failure保留operation outcome并返回false加bounded warning，candidate missing省略这些fields。它们不进入JSON-RPC method/notification、Engine event、provider payload、tool result、transcript或persistent metadata；CLI flags、command names、mutation、commit/rollback与wire contract保持。

Phase577新增Host runtime `JsonlAuditLockMaintenanceError`、operation type和failure details interface。Candidate reader已取得handles后的selection rejection与top-level maintenance rejection都携带neutral `handlesClosed`/`handleWarning`；CLI根据operation kind映射到Phase576既有cleanup/recovery fields，ERROR status与primary message保持。它不增加CLI human/JSON field names，也不进入JSON-RPC、Engine event、provider、tool result、transcript或persistent metadata。Preflight refusal、initial missing、flags、mutation与wire contract保持。

Phase578不新增Host/CLI/protocol字段，而是扩展Phase576/577 lifecycle fields的descriptor coverage。Maintenance opener在open成功但return前失败时可把transient handle交给candidate或operation outer finalizer；private parent/root、recovery reservation和empty assertion clone也进入同一deduplicated all-settled graph。CLI继续使用既有cleanup/recovery boolean与bounded warning，zero-descriptor failure和initial missing仍省略这些fields。该collector为module-private stack-local ownership，不进入JSON-RPC、Engine event、provider、tool result、transcript、owner metadata或persistent schema。

Phase579继续复用相同Host-local lifecycle fields，把maintenance bounded scan的`Dir` stream close outcome累计到module-private finalization context。Scan result或read primary rejection保持原control flow，outer finalizer将completed stream evidence与pending `FileHandle` closure合并后再投影cleanup/recovery boolean和bounded warning。Context不进入JSON-RPC、Engine event、provider payload、tool result、transcript、owner metadata或persistent schema；inspection-only、rotation staging、CLI flags和field names保持。

Phase580仍不新增Host/CLI/protocol字段，而是为maintenance-owned descriptor close Promise增加module-private 5000ms settlement deadline。Timeout复用既有cleanup/recovery false和bounded warning；success/primary error保持，late resolve/reject只被私有observer消费。Deadline、pending Promise和raw resource不进入JSON-RPC、Engine event、provider payload、tool result、transcript、owner metadata或persistent schema；CLI flags、field names、inspection和rotation contracts保持。

Phase581同样不新增跨层字段，而是为read-only inspection `Dir`/`FileHandle`增加module-private 5000ms deadline。Parent list timeout沿既有ERROR message，single-entry timeout沿既有`inspection_error_code`与unknown/authority-withdrawal projection；read primary保持。Timer、pending Promise、raw resource和late reason不进入JSON-RPC、Engine event、provider、tool result、transcript、owner metadata或persistent schema；CLI flags、field names和filesystem read-only contract保持。

Phase582继续保持跨层schema不变，为mutating rotation recovery candidate `FileHandle`增加module-private 5000ms deadline。Timeout沿既有`recovery_handles_closed:false`与bounded warning投影，committed action、mutation/rollback primary、candidate-open stage和coordination lock evidence保持；pending Promise、timer、raw handle与late reason不进入JSON-RPC、Engine event、provider、tool result、transcript、owner metadata或persistent schema，CLI flags和field names不变。

Phase583继续保持跨层schema不变，为successful cooperative lock lifecycle增加module-private 5000ms deadline与memoized exactly-once finalizer。Release/abandon timeout只沿runtime error或既有coordination released false/warning投影；owner/lock/parent handles、pending Promise、timer、typed internal error、fd与late reason不进入JSON-RPC、Engine event、provider、tool result、transcript、owner metadata或persistent schema，public lock interface、CLI flags和field names不变。

Phase584继续保持跨层schema不变，为ownership transfer前的lock acquisition `FileHandle`/`Dir`增加module-private 5000ms deadline。Validation/write primary与`EEXIST` retry保持；successful scan timeout只沿既有runtime rejection或rotation recovery lock-acquisition ERROR message投影。Pending Promise、timer、raw handle/stream、fd与late reason不进入JSON-RPC、Engine event、provider、tool result、transcript、owner metadata或persistent schema，public lock options、CLI flags和field names不变。

Phase585继续保持跨层schema不变，为常规JSONL writer的bootstrap/generation parent、append/current generation、rotation transaction、backup staging directory和writer staging `Dir`增加module-private 5000ms deadline。Existing write/validation/rotation primary保持；无primary时timeout只沿既有`AuditSink.record()` rejection传播，已提交record/rotation不回滚。Pending Promise、timer、raw handle/stream、fd、filesystem identity与late reason不进入JSON-RPC、Engine event、provider、tool result、transcript、audit envelope、CLI fields或persistent schema，public sink constructor和environment不变。

Phase586继续保持跨层schema不变，把successful lock transfer后的`assertHeld()`、pre-owner release和post-owner empty child-scan `Dir`纳入既有lifecycle 5000ms deadline。Read primary保持；timeout只沿existing runtime rejection、rotation recovery failure或coordination warning/residual fields投影。Pending Promise、timer、raw stream、fd、entry name、owner token与late reason不进入JSON-RPC、Engine event、provider、tool result、transcript、audit envelope、owner metadata或persistent schema，public lock methods/options和CLI field names不变。

Phase587继续保持跨层schema不变，把successful rotation recovery candidate的staging child-scan `Dir`纳入既有recovery 5000ms deadline。Read primary保持；candidate-open timeout沿existing recovery ERROR fields投影，pre-commit timeout沿existing rollback fields投影，post-commit cleanup timeout只沿existing recovery warning与residual staging fields投影。Pending Promise、timer、raw stream、fd、entry name、generation content、fingerprint与late reason不进入JSON-RPC、Engine event、provider、tool result、transcript、audit envelope、owner metadata或persistent schema，public recovery options、CLI flags和field names不变。

Phase588继续保持跨层schema不变，为MCP runtime connected client与fallback transport close建立module-private 5000ms deadline和memoized close lifecycle。Timeout只使best-effort teardown继续；connect/list-tools primary diagnostic保持，且不新增shutdown notification、tool error、CLI warning或report field。Pending Promise、timer、client/transport object、server command/URL/header、process handle与late reason不进入JSON-RPC、Engine event、provider、tool result、transcript、plugin manifest或persistent schema，public `McpRuntime`签名和environment不变。

Phase589继续保持跨层schema不变，为`prepareGodCodeHost()`增加MCP/plugin runtime ownership rollback与terminal close lifecycle。Setup primary跨all-settled cleanup保持；成功close的sync throw/reject只在Host内部消费，concurrent/post-settlement repeated caller共享同一Promise。Runtime object、cleanup reason、MCP/plugin配置、server command/URL/header/token、plugin path、transport和process handle不进入JSON-RPC、Engine event、provider、tool result、transcript、audit、CLI report、plugin manifest或persistent schema，public Host options和environment不变。

Phase590继续保持跨层schema不变，为headless run/RPC smoke增加renderer、prepared host与engine composite finalizer。Operation primary跨all-settled cleanup保持；无primary时只沿既有renderer/host/engine priority传播首个reason，不新增event、notification、warning或report field。Listener、Promise、cleanup reason、renderer/host/engine object、prompt、path、token、transport和process handle不进入JSON-RPC、Engine event、provider、tool result、transcript、audit、CLI report、plugin manifest或persistent schema，public run signatures和environment不变。

Phase591继续保持跨层schema不变，为REPL start/stop/cleanup、active turn和outer readline runner增加generation-scoped composite lifecycle。Pending cancel不参与cleanup join；active submit只在Host本地以固定reason结束，renderer/host/engine failure按primary-aware规则消费或传播，不新增event、notification、warning、report或persistent field。Promise、cleanup/cancel reason、session resource object、prompt、path、token、transport和process handle不进入JSON-RPC、Engine event、provider、tool result、transcript、audit、CLI report、plugin manifest或persistent schema，public REPL signatures和environment不变。

Phase592继续保持跨层schema不变，为`GodCodeEngineProcess`增加start/stop generation settlement、bounded shutdown和forced-exit verification。Existing `shutdown` request/response与`exit` event payload保持；5000ms shutdown observation、2000ms graceful/forced waits和fixed local uncertainty reason不新增notification、warning、report或field。Promise、timer、kill result、stderr、cleanup reason、child/peer object、command、path、token、transport和process handle不进入JSON-RPC、Engine event、provider、tool result、transcript、audit、CLI report、plugin manifest或persistent schema，public engine signatures和environment不变。

Phase593继续保持跨层schema不变，只调整doctor check提交与Host本地cleanup priority。Provider-health仍使用existing initialize/create/submit/event contract和相同timeout；waiter cleanup与engine stop failure只决定existing check的status/message，不新增check name、JSON key、event、notification或protocol field。Raw cleanup reason、Promise、timer、listener、stderr、signal、PID、engine/child/peer object、path、command、token和transport不进入JSON-RPC、Engine event、provider、tool result、transcript、audit、CLI report、plugin manifest或persistent schema，public doctor signatures和environment不变。

Phase594继续保持跨层schema不变，只调整doctor `tool_catalog` check与prepared-host close的Host本地提交顺序。Tool count/setup result和cleanup outcome仍投影到existing check name/status/message，不新增JSON key、event、notification、warning或protocol field。Raw cleanup reason、Promise、runtime object、MCP/plugin配置、path、command、token、transport和process handle不进入JSON-RPC、Engine event、provider、tool result、transcript、audit、CLI report、plugin manifest或persistent schema，public doctor与prepared-host signatures及environment不变。

Phase595继续保持跨层schema不变，只调整Host本地`listHostTools()`的catalog读取与prepared-host close priority。`tools list/inspect`继续返回existing human/JSON payload，cleanup uncertainty沿existing CLI error boundary投影固定message，不新增JSON key、event、notification、warning、exit code或protocol field。Raw cleanup reason、Promise、runtime object、MCP/plugin配置、path、command、token、transport和process handle不进入JSON-RPC、Engine event、provider、tool result、transcript、audit、CLI output、plugin manifest或persistent schema，public tools与prepared-host signatures及environment不变。

Phase596继续保持跨层schema不变，只调整Host本地plugin config/list diagnostic与runtime close priority。Cleanup uncertainty仍通过existing `plugin_runtime`或`plugin_list` check status/message表达，不新增check name、JSON key、event、notification、warning、exit code或protocol field。Raw cleanup reason、Promise、runtime object、manifest内容、entrypoint、path、command、token、transport和process handle不进入JSON-RPC、Engine event、provider、tool result、transcript、audit、CLI report、plugin manifest或persistent schema，public plugin diagnostic signatures及environment不变。

Phase597继续保持跨层schema不变，只调整Host本地MCP diagnostic checks与runtime close priority。Cleanup uncertainty通过existing `mcp_context`、`mcp_connect`或generic operation check status/message表达，不新增check name、JSON key、event、notification、warning、exit code或MCP/JSON-RPC field。Raw cleanup reason、Promise、server config value、header/token、runtime/client/transport、PID、path和command不进入JSON-RPC、Engine event、provider、tool result、transcript、audit、CLI report、plugin manifest或persistent schema，public MCP diagnostic signatures及environment不变。

Phase598继续保持跨层schema不变，只调整Host本地terminal approval和TUI PTY smoke的同步cleanup priority。Approval cleanup uncertainty复用existing `ToolApprovalDecision` deny shape，TUI cleanup uncertainty复用existing throw boundary；不新增JSON key、event、notification、warning、exit code、approval source、tool result或JSON-RPC field。Raw cleanup reason、stack、cause、input/output/screen object、request内容、frame、terminal sequence、path、command和token不进入JSON-RPC、Engine event、provider、tool result、transcript、audit、CLI report、plugin manifest或persistent schema，public approval/TUI signatures及environment不变。

Phase599继续保持跨层schema不变，只调整Host本地TUI controller start/run/stop ownership与cleanup priority。Fixed cleanup error沿existing rejected Promise/CLI boundary传播，不新增TUI action/state field、JSON key、event、notification、warning、exit code、tool result或JSON-RPC field。Raw cleanup reason、Promise、session/screen/input/output object、frame、prompt、path、command、token、transport和process handle不进入JSON-RPC、Engine event、provider、tool result、transcript、audit、CLI report、plugin manifest或persistent schema，public TUI signatures及environment不变。

Phase600继续保持跨层schema不变，只调整Host本地transcript watch watcher ownership、close fan-out和pending event observer。Cleanup uncertainty复用existing root `ok/error`字段，不新增root、event、discovery、JSON key、notification、warning、exit code、tool result或JSON-RPC field。Raw cleanup reason、stack、cause、watcher/event Promise、native handle、descriptor和额外path细节不进入JSON-RPC、Engine event、provider、tool result、transcript、audit、CLI report、plugin manifest或persistent schema，public watch signatures及environment不变。

Phase601继续保持跨层schema不变，只调整Host本地provider daemon/model operation的日志descriptor finalization。Cleanup uncertainty复用existing `ProviderDiagnosticReport` first check，不新增check name、details key、JSON key、event、notification、warning、exit code、tool result或JSON-RPC field。Raw cleanup reason、stack、cause、fd、native handle、log payload、command、args、environment、marker内容和child object不进入JSON-RPC、Engine event、provider request、tool result、transcript、audit、CLI report、plugin manifest或persistent schema，public provider signatures及environment不变。

`god-code audit cleanup-lock [--dry-run|--yes --expect-owner <fingerprint>] [--json]`是独立的显式残留锁运维边界。无flag时等价dry-run：只在active lock initial/final bounded scans一致、directory与pinned owner连续、两个read-only directory gates匹配open-time full generation、scan未截断且目录exact仅含valid `owner.json`时输出32字符candidate-bound SHA-256 owner fingerprint、PID、acquired time、`liveness_verified: false`和`removed: false`；state drift、inspection error、truncation、nonexclusive set、terminal symlink/replacement或final scan后的child generation drift在fingerprint生成前拒绝。Mutation要求`--yes`与exact fingerprint同时出现；底层先pin fresh selected lock与owner objects并重算active-domain candidate material，mismatch在创建private quarantine或任何namespace mutation前拒绝。匹配后才重新验证完整metadata，将candidate rename到同temp filesystem的0700 private quarantine，隔离owner后只删除仍与原descriptors绑定的owner和空lock directory。Private quarantine root持有root与parent handles，并按empty、`lock`、`lock + owner.json`、`owner.json`、empty的exact entry set约束rename、rollback和contraction；final rmdir还必须证明original wrapper descriptor已脱链。Linux在descriptor/procfd/descriptor stat一致时，通过`/proc/self/fd/<fd>/<child>`执行private `mkdtemp`和全部transaction mutation；其他平台或procfs unavailable时重验logical parent path与handle后fallback。Handles跨rename、rollback和residual return保持open并最终关闭。Fingerprint不是secret或liveness proof；wrong/old/token-only/other-domain fingerprint、missing/invalid metadata、非目录blocker、额外entry、wrapper/candidate path drift与copied-owner replacement全部拒绝，post-commit wrapper failure沿用`residual_quarantine_path`。该命令可能中断live cooperative writer，但不会读取或修改audit target。

`god-code audit inspect-lock-quarantines [--json]`只读枚举当前configured audit path派生的quarantine namespace。名称必须匹配`<lock>.cleanup-`后的六个ASCII alphanumeric字符；parent scanner最多消费4096个temp directory entries并返回128个结果，分别通过`scan_truncated`和`result_truncated`声明不完整性。Selected root及nested `lock`分别由no-follow open descriptor绑定，并使用2-entry stream scan加1个sentinel；CLI映射`root_entry_scan_*`和`lock_entry_scan_*`，exact count只在not-truncated时存在。Directory candidate按`owner_only`、`lock_with_owner`、`lock_and_owner`、`empty`或`unknown`分类；任一child scan truncated都固定`unknown`，不选择owner或生成empty fingerprint。Bounded owner parser与最终path/descriptor stability gate保持。Command不输出child names/overflow total，不restore、rename、unlink、rmdir，也不把layout、age或PID解释为mutation authority。

`god-code audit inspect-lock-quarantine <quarantine-id> [--json]`直接检查operator已知的单项quarantine。ID必须匹配六字符ASCII alphanumeric，Host使用当前configured audit path重新派生exact quarantine path并调用与list相同的single-entry inspector、mapper和uncertainty predicate，不消费4096/128 scan预算。Missing返回`exists: false`与`ok`；existing返回manual-review warning；unknown、non-directory、state drift、inspection error或layout-selected invalid owner追加warning。Command保持no-follow、read-only和non-secret，不输出owner token，也不执行cleanup或recovery。

`god-code audit cleanup-lock-quarantine <id> [--dry-run|--yes --expect-owner <fingerprint>] [--json]`只处理Phase531分类为valid `owner_only`的residue。ID必须为六字符ASCII alphanumeric并与当前configured audit path重新组合，不能选择任意path。Dry-run投影root owner fingerprint且不修改entry；mutation要求`--yes`和exact fingerprint。执行保持selected quarantine directory和owner file handles open，在same-ID directory仍与原descriptor绑定时把owner rename到0700 private disposal root，随后要求moved owner path仍绑定原file descriptor并验证empty invariant才rmdir。Private disposal root从creation起持有root与parent handles，按empty、`owner.json`、empty的exact entry set约束owner isolation、rollback和final contraction；Linux procfd capability可用时owner rename、selected quarantine rmdir、rollback、owner unlink与final root rmdir都从相应open parent解析single child name，fallback保持logical path/descriptor gate。Successful final rmdir要求original wrapper descriptor `nlink === 0`，post-commit failure通过`residual_disposal_path`暴露。提交前extra entry或wrapper replacement不被删除，原candidate可安全识别时恢复owner；复制相同owner metadata的replacement也会拒绝并保持。Pre-commit layout、empty、unknown、invalid metadata和non-directory entry均不可通过该命令删除。

`god-code audit cleanup-empty-lock-quarantine <quarantine-id> [--dry-run|--yes --expect-quarantine <fingerprint>] [--json]`只处理stable exact `empty` quarantine。Phase531/538 projection为该layout输出empty-quarantine domain fingerprint；mutation不接受owner或disposal fingerprint。Runtime以no-follow handles固定原candidate及其immediate parent，把current path和descriptor的BigInt dev/inode/ctimeNs/birthtimeNs、fingerprint与empty entry set重新绑定后，从parent anchor只rmdir selected basename。Descriptors在revalidation到commit期间保持open，因此快速remove/recreate不能利用inode/timestamp reuse冒充原对象。Owner-only、pre-commit、unknown和non-directory state全部拒绝。

`god-code audit recover-lock-quarantine <id> [--dry-run|--yes --expect-owner <fingerprint>] [--json]`只处理valid `lock_with_owner`或`lock_and_owner` pre-commit residue。Dry-run输出layout-selected owner fingerprint和derived lock snapshot；mutation要求exact fingerprint且coordination lock path absent。Runtime在candidate selection时分别pin shared parent、quarantine root、nested `lock`和layout-selected owner file，再从parent anchor exact-create 0700 reservation并通过actual mutation path立即pin其directory descriptor；existing entry不会被覆盖。Owner transfer/restore从layout-selected与recovered anchors执行，rollback reservation与post-commit nested/root contraction从对应parent anchors执行，并持续重验所有directory paths、owner path与原descriptors、完整metadata和entry sets。提交前failure把owner恢复到原layout并只删除descriptor-bound exact-empty reservation；path missing还要求reservation descriptor证明原directory已unlinked。Copied-layout/owner replacement与unknown entry全部保留并通过既有error或`residual_lock_path`报告；提交后旧quarantine清理失败通过`residual_quarantine_path`warning暴露。恢复后的lock会参与正常writer coordination，若需要删除必须单独运行`audit cleanup-lock`。

`god-code audit inspect-lock-disposals [--json]`只读枚举当前configured audit path派生的exact disposal namespace。Basename必须包含六字符quarantine ID、literal `.dispose-`和六字符disposal ID；parent scanner最多消费4096个temp entries并返回128项。Selected disposal root由no-follow open descriptor绑定，并使用2-entry stream scan加1个sentinel；CLI投影`root_entry_scan_*`，exact `root_entry_count`只在not-truncated时存在。Truncated root固定分类为`unknown`，不解析selected owner authority或生成empty fingerprint。每项仍关联source quarantine existence/layout/state；non-directory candidate只报告type。Command不输出UUID token、child names或overflow total，source absence和metadata不构成cleanup authority，也不执行restore或delete。

`god-code audit inspect-lock-disposal <quarantine-id> <disposal-id> [--json]`直接检查operator已知的单项disposal。两个ID必须分别匹配六字符ASCII alphanumeric，Host使用当前configured audit path重新派生source quarantine与exact disposal path，调用与list相同的single-entry inspector和projection，不消费4096/128 scan预算。Missing返回`exists: false`与`ok`；existing返回manual-review warning；unknown、non-directory、state drift、invalid owner或uncertain source追加warning。Command保持no-follow、read-only和non-secret，不输出owner token，也不执行cleanup。

`god-code audit cleanup-lock-disposal <quarantine-id> <disposal-id> [--dry-run|--yes --expect-owner <fingerprint>] [--json]`只处理valid exact `owner_only`且source quarantine absent的disposal。Dry-run输出selected owner fingerprint；mutation重新绑定qid/did，并持续打开root directory、owner regular-file与immediate parent descriptors，以同一2-entry bounded scanner重验not-truncated exact single-owner set和source absence后从root anchor unlink owner，该unlink是commit point。Current paths必须持续指向descriptors固定的原objects，因此copied-owner replacement或overflow state不能接收原candidate mutation。随后只从parent anchor rmdir descriptor-bound exact-empty root。提交前drift不删除对象；提交后source appearance、extra entry、replacement或rmdir failure通过`residual_disposal_path`warning暴露。Empty、unknown、source-present、invalid metadata和non-directory state全部拒绝。

`god-code audit cleanup-empty-lock-disposal <quarantine-id> <disposal-id> [--dry-run|--yes --expect-disposal <fingerprint>] [--json]`只处理source-absent exact `empty` disposal。Inspector为该directory输出绑定absolute path、BigInt dev/inode/ctimeNs/birthtimeNs的32字符fingerprint；mutation不接受owner fingerprint，而是保持原directory与immediate parent descriptors open，重新绑定current path与descriptor identity并验证source absence、fingerprint和empty entry set后，从parent anchor执行selected basename rmdir。成功rmdir是唯一commit；extra entry、replacement、source appearance、non-directory或fingerprint drift全部返回error且不删除未知对象。

Redaction snapshot通过own property descriptors在JSON encoding前形成。敏感key不读取原value；自定义`toJSON`不会执行，普通accessor不会被调用而是使record Promise拒绝。Snapshot只接受array和plain/null-prototype object；cycle、BigInt或custom container failure继续由 `audit_warnings` 暴露，后续event可恢复写入。

Snapshot preparation最大depth为64，value/slot预算为100000；data value、redacted property和sparse array slot都计入预算。单个object key或string value若UTF-8 bytes已超过`GOD_CODE_AUDIT_MAX_BYTES`也会在JSON encoding前拒绝。最终line仍执行精确byte检查，所有限额failure均不污染后续write tail。

JSONL audit current generation默认上限为10 MiB，可通过 `GOD_CODE_AUDIT_MAX_BYTES` 设置positive safe integer字节数。下一条record会使current超限时，Host把现有文件轮换为同路径 `.1` 并创建新current；只保留一个rotated generation。单条record本身超过上限时不写入，并通过 `output.audit_warnings` 报告对应event failure。

JsonlAuditSink constructor同样强制non-empty file path和positive safe-integer maxBytes。Config parser在校验decimal string后复用该numeric invariant；直接注入sink时，zero、negative、fraction、NaN、Infinity和超安全整数会在实例创建阶段失败，不进入record或warning路径。

JSONL audit拒绝配置路径中的现有symbolic link、hard-linked target和非regular target。Host先检查path components；missing parent从nearest existing directory descriptor逐级exact-create、no-follow open并绑定logical path，之后再次执行完整inspection，并在支持的平台使用O_NOFOLLOW打开最终文件后校验file descriptor。安全检查失败不写入current target，并通过 `output.audit_warnings` 返回；已经成功创建的parent prefix不会回滚，工具permission与执行结果保持原语义。

JsonlAuditSink在constructor中把target固定为absolute path。单个Node.js进程内，所有使用同一absolute path的sink实例共享serialized Promise tail；独立same-user进程还竞争由absolute path SHA-256派生的OS-temp lock directory。Parent bootstrap与lock acquisition都使用descriptor-relative/fallback exact mkdir：前者逐层提升audit path anchor，后者pin shared temp parent并占用lock basename，再从pinned lock directory exclusive-create owner metadata。Owner creation handle在content persistence前完成ownership handoff，因此本次进程仍持有original descriptor时，zero-byte或partial-write acquisition failure可安全回收；无法证明object continuity的invalid residue仍保持。持锁后的generation transaction另行pin audit file parent。若rotation需要替换existing `.1`，runtime先创建same-parent 0700 `.god-code-audit-rotation-*` directory，把旧entry按no-follow BigInt snapshot移动为`previous`，再把current移动到`.1`；original current与staging handles跨final append保持。Append write rejection仍先执行same-object bounded truncate与exclusive-created current cleanup；record未成功时transaction按identity恢复current和previous `.1`。Record成功后先完成selected file durability，再unlink staged previous、rmdir staging并在POSIX full下同步parent最终namespace；commit uncertainty保留staging residue，不回滚已写record。完整safe-path/rotation/append/durability transaction结束时，release要求原lock parent/directory/owner graph、UUID token和single-owner-file invariant全部一致后才从对应anchors执行unlink/rmdir。竞争者有界重试，超时返回stable error。该机制是cooperative filesystem protocol，不是强制内核lock，不自动恢复process-crash staging或未知持有者，也不约束不同user namespace及绕过该实现的writer。

Phase554把上述rotation staging wildcard收紧为target-bound basename：same-parent不同absolute audit paths使用不同32-hex scope，runtime只在自身scope创建新transaction directory。旧anonymous six-character suffix目录仍可能作为historical residue存在，但只由read-only inspector计数告警，不参与runtime rollback、commit或未来cleanup选择。

POSIX平台上的JSONL audit新文件以 `0600` 创建；既有current generation会在容量检查和rotation前通过opened descriptor收敛为 `0600`，最终append前再次执行同一收敛，因此rename得到的 `.1` 也不会继承旧的group/world访问位。Windows访问控制仍由文件系统ACL负责。

取消正在执行的工具时，引擎会通知宿主：

```json
{
  "session_id": "session-1",
  "turn_id": "turn-1"
}
```

这条消息对应 JSON-RPC notification method：

```text
cancel_tool_execution
```

## V0 约束

- 一个引擎进程允许多个活动会话
- 每个会话只允许一个 in-flight turn
- 工具执行权始终在 TS 宿主
- Python 引擎不直接触碰本地文件和 shell
- `create_session.initial_messages` 只恢复模型上下文，不重新执行历史工具，也不恢复 live process 或 provider opaque context
- session cleanup 只管理 active transcript JSONL，不影响 Engine runtime 状态
- archived session search / delete / restore / compress 只读取、删除、移动、压缩或解压 transcript 文件，不创建或恢复 Python Engine session
