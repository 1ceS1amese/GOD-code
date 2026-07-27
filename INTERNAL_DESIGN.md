# GOD-code Internal Design

这份文档是 GOD-code 的内部设计总览。它面向维护者和二次开发者，重点解释系统边界、状态归属、运行流程和扩展原则。

如果只想快速运行项目，先看 [`README.md`](README.md)。如果想看更细的调用链，继续看 [`ARCHITECTURE.md`](ARCHITECTURE.md)。如果要扩展模型、工具、MCP 或 plugin，看 [`EXTENSION_POINTS.md`](EXTENSION_POINTS.md)。

---

## 1. 文档目标

这份文档回答四个问题：

1. GOD-code 当前要解决什么问题。
2. TS Host、Python Engine、Provider、MCP、Plugin 之间如何分工。
3. 哪些接口是稳定边界，扩展时不应该绕过。
4. Phase1 到 Phase601 已经推进到什么程度、Phase601 Host provider log descriptor finalization continuity 实现边界是什么，以及后续扩展边界。

它不是：

- 用户安装手册。
- 完整 API 参考。
- 真实 provider 凭证配置指南。
- 产品路线图承诺。

---

## 2. 系统目标与非目标

### 2.1 目标

GOD-code 的目标是演示一个可拆分的 AI coding agent 架构：

- TS Host 管理宿主能力。
- Python Engine 管理会话、回合和模型边界。
- Provider 细节限制在 Python `providers/` 层。
- MCP / Plugin / Skill 限制在 TS Host 平台层。
- TS 和 Python 只通过 JSON-RPC over stdio 通信。
- 默认 fake model 可以离线、可重复地跑通主链路。

### 2.2 非目标

当前实现不是生产级 AI IDE：

- REPL 只做基础 CLI 版本；Phase86 已完成 TUI session dashboard 基础实现，Phase87 已完成 TUI interaction polish 基础实现，Phase88 已完成 TUI modal approval 基础实现，Phase89 已完成 TUI pane scrolling 基础实现，Phase90 已完成 TUI assistant stream coalescing 基础实现，Phase91 已完成 TUI keyboard help overlay 基础实现，Phase92 已完成 TUI adaptive layout 基础实现，Phase93 已完成 TUI debug diagnostics 基础实现，Phase94 已完成 TUI pane focus style 基础实现，Phase95 已完成 TUI PTY smoke harness 基础实现，Phase96 已完成 TUI session switcher 基础实现，Phase97 已完成 TUI live session switching 基础实现，Phase98 已完成 TUI live session list pane 基础实现，Phase99 已完成 TUI per-session event buffers 基础实现，Phase100 已完成 TUI per-session status indicators 基础实现，Phase101 已完成 TUI per-session unread counters 基础实现，Phase102 已完成 TUI live session close command 基础实现，Phase103 已完成 TUI live session pin command 基础实现，Phase104 已完成 TUI live session rename command 基础实现，Phase105 已完成 TUI live session filter 基础实现，Phase106 已完成 TUI live session sort modes 基础实现，Phase107 已完成 TUI live session quick actions 基础实现，Phase108 已完成 TUI live session bulk actions 基础实现，Phase109 已完成 TUI live session command palette 基础实现，Phase110 已完成 TUI live session command search 基础实现，Phase111 已完成 TUI live session command categories 基础实现，Phase112 已完成 TUI live session command grouping UI 基础实现，Phase113 已完成 TUI live session command favorites 基础实现，Phase114 已完成 TUI live session command history 基础实现，Phase115 已完成 TUI live session command pinned history 基础实现，Phase116 已完成 TUI live session command history clear 基础实现，Phase117 已完成 TUI live session command usage counts 基础实现，Phase118 已完成 TUI live session command usage sorting 基础实现，Phase119 已完成 TUI live session command usage ranking summary 基础实现，Phase120 已完成 TUI live session command usage ranking visibility 基础实现，Phase121 已完成 TUI live session command usage ranking size 基础实现，Phase122 已完成 TUI live session command usage ranking adaptive layout 基础实现，Phase123 已完成 TUI live session command usage ranking overflow indicator 基础实现，Phase124 已完成 TUI live session command usage ranking multi-line layout 基础实现，Phase125 已完成 TUI live session command usage ranking line-count controls 基础实现，Phase126 已完成 TUI live session command usage ranking row-budget safeguards 基础实现，Phase127 已完成 TUI live session command summary priority controls 基础实现，Phase128 已完成 TUI live session command summary visibility profiles 基础实现，Phase129 已完成 TUI live session command palette scrolling 基础实现，Phase130 已完成 TUI live session command palette scroll position indicators 基础实现，Phase131 已完成 TUI live session command palette page-size controls 基础实现，Phase132 已完成 TUI live session command palette Home/End navigation 基础实现，Phase133 已完成 TUI live session command palette selection wrapping controls 基础实现，Phase134 已完成 TUI live session command palette group navigation 基础实现，Phase135 已完成 TUI live session command palette group position indicators 基础实现，Phase136 已完成 TUI live session command palette group size indicators 基础实现，Phase137 已完成 TUI live session command palette in-group position indicators 基础实现，Phase138 已完成 TUI live session command palette group neighbor indicators 基础实现，Phase139 已完成 TUI live session command palette group neighbor size indicators 基础实现，Phase140 已完成 TUI live session command palette group neighbor command-key indicators 基础实现，Phase141 已完成 TUI live session command palette group neighbor command-position indicators 基础实现，Phase142 已完成 TUI live session command palette group neighbor command-id indicators 基础实现，Phase143 已完成 TUI live session command palette group neighbor visibility profiles 基础实现，Phase144 已完成 TUI live session command palette group neighbor adaptive visibility 基础实现，Phase145 已完成 TUI live session command palette group neighbor adaptive threshold controls 基础实现，Phase146 已完成 TUI live session command palette group neighbor adaptive threshold indicators 基础实现，Phase147 已完成 TUI live session command palette group neighbor adaptive threshold distance indicators 基础实现，Phase148 已完成 TUI live session command palette group neighbor adaptive threshold target indicators 基础实现，Phase149 已完成 TUI live session command palette group neighbor adaptive threshold progress indicators 基础实现，Phase150 已完成 TUI live session command palette group neighbor adaptive threshold progress buckets 基础实现，Phase151 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket labels 基础实现，Phase152 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help visibility 基础实现，Phase153 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help status indicators 基础实现，Phase154 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help shortcut indicators 基础实现，Phase155 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help compact indicators 基础实现，Phase156 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help compact legend indicators 基础实现，Phase157 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help legend display profiles 基础实现，Phase158 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend profiles 基础实现，Phase159 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend effective-profile indicators 基础实现，Phase160 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend threshold indicators 基础实现，Phase161 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend threshold distance indicators 基础实现，Phase162 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width indicators 基础实现，Phase163 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage indicators 基础实现，Phase164 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage buckets 基础实现，Phase165 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket labels 基础实现，Phase166 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility controls 基础实现，Phase167 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility profiles 基础实现，Phase168 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility threshold indicators 基础实现，Phase169 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility threshold distance indicators 基础实现，Phase170 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width indicators 基础实现，Phase171 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage indicators 基础实现，Phase172 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage buckets 基础实现，Phase173 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket labels 基础实现，Phase174 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility controls 基础实现，Phase175 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility profiles 基础实现，Phase176 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility threshold indicators 基础实现，Phase177 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility threshold distance indicators 基础实现，Phase178 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width indicators 基础实现，Phase179 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage indicators 基础实现，Phase180 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage buckets 基础实现，Phase181 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket labels 基础实现，Phase182 已完成 TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility controls 基础实现，但完整 TUI 仍待增强。
- Python Engine 多 session runtime 已在 Phase81 补齐基础实现；Phase96 已补 transcript-level TUI session switcher 基础实现；Phase97 已补 TUI live session switching 基础实现；当前仍不做 session daemon、跨进程 handoff 或同一 session 内多 active turns。
- Phase82 已补 Python Engine 内部多工具并发调度基础实现；Phase84 已补 provider-native parallel tool calls 显式 opt-in 基础实现，默认仍 fail-closed / disabled；Phase85 已补 tool dependency graph scheduling 基础实现；TS Host batch API 和跨 session / 跨 turn 调度仍不在当前范围内。
- Phase83 已完成 session advanced recovery 基础实现；当前支持 `sessions recover` dry-run / JSON / raw-events workflow，仍不做 live process restore、历史工具重放、transcript destructive repair 或 Python replay RPC。
- 显式交互式权限确认 UI 已在 Phase80 补齐基础实现；当前仍不做完整 TUI、持久 approval daemon、跨命令 approval cache 或长期规则文件。
- system prompt builder 已在 Phase60 补齐基础实现；暂不做远程 prompt registry、自动项目扫描、prompt injection classifier、retrieval 或语义摘要。
- token budget manager 已在 Phase61 补齐基础实现；当前不做精确 provider tokenizer、自动 context-window discovery、价格表或 billing。
- summary compaction strategy 已在 Phase62 补齐基础实现；当前不做 provider-backed LLM summarization、向量检索或 transcript rewrite。
- prompt injection guard 已在 Phase63 补齐基础实现；当前不做 LLM-backed classifier、provider moderation API 或默认阻断。
- provider rate limit policy 已在 Phase64 补齐基础实现，当前不做 provider quota API、跨进程 limiter 或持久 request ledger；provider retry policy 已在 Phase53 补齐，provider fallback chain 已在 Phase54 补齐。
- Anthropic Messages provider 已在 Phase55 补齐基础实现，Phase84 已补显式 opt-in 的 provider-native 多 tool_use 归一化；暂不做 Anthropic server-side tools、extended thinking UI、prompt caching 或 provider-managed parallel tool use。
- 不做精确 token budget 或语义摘要式 compaction；Phase56 已补 context budget / deterministic compaction 基础实现。
- 不做账户级 billing、价格表或持久 spend ledger；Phase58 已补 provider-reported usage accounting / budget guard 基础实现。
- provider-specific error mapping 已在 Phase59 补齐基础实现；暂不做 provider dashboard、账户级故障诊断或 OAuth refresh。
- local provider daemon lifecycle 已在 Phase65 补齐基础实现，local provider model discovery 已在 Phase66 补齐基础实现，local provider model pull command 已在 Phase67 补齐基础实现，local provider model remove command 已在 Phase68 补齐基础实现，local provider model prune command 已在 Phase69 补齐基础实现；Phase57 已补本地 OpenAI-compatible endpoint 基础支持，当前不做 runtime-native API、runtime-native prune API 或自动缓存配额管理。
- 不做 MCP 后台 daemon / 跨命令持久 resource update event loop、prompt/resource 自动发现注入或 OAuth / token refresh flow；resources/read、prompts/get、subscribe/unsubscribe、resource update wait/watch/loop、completion、completion candidate 输出、bash/zsh hook script 和 guarded rc install 当前只做显式诊断、生成或受控写入；显式 MCP context 配置可以把指定 resource / prompt 转成 `create_session.initial_messages`，并支持字符级限额、稳定去重和截断统计；Streamable HTTP 与 legacy SSE auth 当前只支持 env-backed headers。
- 不做远程 plugin marketplace、下载安装、安装脚本、远程 metadata sync、持久 plugin daemon 或系统级 sandbox runtime；Phase35 已落地本地 `node-subprocess` 基础路径，Phase71 已落地本地 registry install command，Phase72 已落地本地 registry uninstall command，Phase73 已落地本地 registry enable / disable command，Phase74 已落地本地 registry tags command。
- Phase75 已落地跨目录 global transcript search，Phase76 已落地受限 transcript root discovery diagnostics，Phase77 已落地 discovery-backed global transcript search，Phase78 已落地短生命周期 transcript watch diagnostics，Phase79 已落地显式 index watch-refresh diagnostics；当前不做无界自动 root discovery、后台 daemon、persistent global index、语义搜索或跨 root mutation。
- 不做 live process 级 session 恢复；当前 resume 只基于 transcript 恢复模型上下文。

---

## 3. 当前实现状态

| Phase | 状态 | 设计主题 |
| --- | --- | --- |
| Phase1 | 已实现 | 执行边界、permission、audit、cancel |
| Phase1/2 repair | 已实现 | audit 闭环、Bash cwd 限制、streaming cancel |
| Phase2 | 已实现 | 模型边界和 `ModelRequest -> ModelAdapter` |
| Phase3 | 已实现骨架 | transcript、provider registry、平台化接口 |
| Phase4 | 已实现 | provider 配置和 `RealProviderModelAdapter` |
| Phase5 | 已实现 | OpenAI-compatible Chat Completions client |
| Phase6 | 已实现 | SSE streaming 和 CLI 增量渲染 |
| Phase7 | 已实现 | OpenAI Responses provider 和 `provider_context` |
| Phase8 | 基础实现 | MCP stdio runtime |
| Phase9 | 基础实现 | Plugin / Skill 本地 manifest runtime |
| Phase10 | 基础实现 | REPL session UX |
| Phase11 | 基础实现 | Session history / replay UX |
| Phase12 | 基础实现 | CLI diagnostics / tools UX |
| Phase13 | 基础实现 | Integration baseline |
| Phase14 | 基础实现 | Open source release baseline |
| Phase15 | 基础实现 | Config examples |
| Phase16 | 基础实现 | Session history management |
| Phase17 | 基础实现 | Provider health diagnostics |
| Phase18 | 基础实现 | MCP / Plugin diagnostics |
| Phase19 | 基础实现 | Provider contract tests |
| Phase20 | 基础实现 | Provider config inspection |
| Phase21 | 基础实现 | Session resume from transcript |
| Phase22 | 基础实现 | Session history retention / cleanup |
| Phase23 | 基础实现 | Archived session management |
| Phase24 | 基础实现 | Archived session search / delete |
| Phase25 | 基础实现 | MCP server config file |
| Phase26 | 基础实现 | MCP tool schema display |
| Phase27 | 基础实现 | MCP runtime structured error diagnostics |
| Phase28 | 基础实现 | Plugin / Skill manifest schema |
| Phase29 | 基础实现 | Manifest-only plugin package example |
| Phase30 | 基础实现 | Archived transcript gzip compression |
| Phase31 | 基础实现 | Session history search index |
| Phase32 | 基础实现 | Session history incremental index refresh |
| Phase33 | 基础实现 | MCP Streamable HTTP config diagnostics |
| Phase34 | 基础实现 | MCP Streamable HTTP runtime |
| Phase35 | 基础实现 | Plugin / Skill sandbox runtime |
| Phase36 | 基础实现 | Plugin / Skill config entry |
| Phase37 | 基础实现 | Plugin / Skill local registry |
| Phase38 | 基础实现 | MCP resources / prompts diagnostics |
| Phase39 | 基础实现 | MCP resource read / prompt get diagnostics |
| Phase40 | 基础实现 | MCP resource templates diagnostics |
| Phase41 | 基础实现 | MCP resource subscription diagnostics |
| Phase42 | 基础实现 | MCP completion diagnostics |
| Phase43 | 基础实现 | MCP resource update wait diagnostics |
| Phase44 | 基础实现 | MCP resource update watch diagnostics |
| Phase45 | 基础实现 | MCP completion candidate output |
| Phase46 | 基础实现 | MCP completion shell hook script |
| Phase47 | 基础实现 | MCP completion guarded rc installer |
| Phase48 | 基础实现 | MCP resource update loop diagnostics |
| Phase49 | 基础实现 | MCP explicit context injection |
| Phase50 | 基础实现 | MCP Streamable HTTP auth env diagnostics |
| Phase51 | 基础实现 | MCP context limits / dedupe / truncation |
| Phase52 | 基础实现 | MCP legacy SSE transport |
| Phase53 | 基础实现 | Provider retry policy |
| Phase54 | 基础实现 | Provider fallback chain |
| Phase55 | 基础实现 | Anthropic Messages provider |
| Phase56 | 基础实现 | Context budget and deterministic compaction |
| Phase57 | 基础实现 | Local OpenAI-compatible provider |
| Phase58 | 基础实现 | Provider usage accounting and budget guard |
| Phase59 | 基础实现 | Provider-specific error mapping |
| Phase60 | 基础实现 | System prompt builder |
| Phase61 | 基础实现 | Token budget manager |
| Phase62 | 基础实现 | Summary compaction strategy |
| Phase63 | 基础实现 | Prompt injection guard |
| Phase64 | 基础实现 | Provider rate limit policy |
| Phase65 | 基础实现 | Local provider daemon lifecycle |
| Phase66 | 基础实现 | Local provider model discovery |
| Phase67 | 基础实现 | Local provider model pull command |
| Phase68 | 基础实现 | Local provider model remove command |
| Phase69 | 基础实现 | Local provider model prune command |
| Phase70 | 基础实现 | Session transcript timeline diagnostics |
| Phase71 | 基础实现 | Plugin / Skill local registry install command |
| Phase72 | 基础实现 | Plugin / Skill local registry uninstall command |
| Phase73 | 基础实现 | Plugin / Skill local registry enable / disable command |
| Phase74 | 基础实现 | Plugin / Skill local registry tags command |
| Phase75 | 基础实现 | Session global transcript search |
| Phase76 | 基础实现 | Session transcript root discovery diagnostics |
| Phase77 | 基础实现 | Discovery-backed global transcript search |
| Phase78 | 基础实现 | Session transcript watch diagnostics |
| Phase79 | 基础实现 | Session index watch-refresh diagnostics |
| Phase80 | 基础实现 | Interactive permission approval UI |
| Phase81 | 基础实现 | Multi session runtime |
| Phase82 | 基础实现 | Multi tool concurrent scheduling |
| Phase83 | 基础实现 | Session advanced recovery |
| Phase84 | 基础实现 | Provider-native parallel tool calls |
| Phase85 | 基础实现 | Tool dependency graph scheduling |
| Phase86 | 基础实现 | TUI session dashboard |
| Phase87 | 基础实现 | TUI interaction polish |
| Phase88 | 基础实现 | TUI modal approval |
| Phase89 | 基础实现 | TUI pane scrolling |
| Phase90 | 基础实现 | TUI assistant stream coalescing |
| Phase91 | 基础实现 | TUI keyboard help overlay |
| Phase92 | 基础实现 | TUI adaptive layout |
| Phase93 | 基础实现 | TUI debug diagnostics |
| Phase94 | 基础实现 | TUI pane focus style |
| Phase95 | 基础实现 | TUI PTY smoke harness |
| Phase96 | 基础实现 | TUI session switcher |
| Phase97 | 基础实现 | TUI live session switching |
| Phase98 | 基础实现 | TUI live session list pane |
| Phase99 | 基础实现 | TUI per-session event buffers |
| Phase100 | 基础实现 | TUI per-session status indicators |
| Phase101 | 基础实现 | TUI per-session unread counters |
| Phase102 | 基础实现 | TUI live session close command |
| Phase103 | 基础实现 | TUI live session pin command |
| Phase104 | 基础实现 | TUI live session rename command |
| Phase105 | 基础实现 | TUI live session filter |
| Phase106 | 基础实现 | TUI live session sort modes |
| Phase107 | 基础实现 | TUI live session quick actions |
| Phase108 | 基础实现 | TUI live session bulk actions |
| Phase109 | 基础实现 | TUI live session command palette |
| Phase110 | 基础实现 | TUI live session command search |
| Phase111 | 基础实现 | TUI live session command categories |
| Phase112 | 基础实现 | TUI live session command grouping UI |
| Phase113 | 基础实现 | TUI live session command favorites |
| Phase114 | 基础实现 | TUI live session command history |
| Phase115 | 基础实现 | TUI live session command pinned history |
| Phase116 | 基础实现 | TUI live session command history clear |
| Phase117 | 基础实现 | TUI live session command usage counts |
| Phase118 | 基础实现 | TUI live session command usage sorting |
| Phase119 | 基础实现 | TUI live session command usage ranking summary |
| Phase120 | 基础实现 | TUI live session command usage ranking visibility |
| Phase121 | 基础实现 | TUI live session command usage ranking size |
| Phase122 | 基础实现 | TUI live session command usage ranking adaptive layout |
| Phase123 | 基础实现 | TUI live session command usage ranking overflow indicator |
| Phase124 | 基础实现 | TUI live session command usage ranking multi-line layout |
| Phase125 | 基础实现 | TUI live session command usage ranking line-count controls |
| Phase126 | 基础实现 | TUI live session command usage ranking row-budget safeguards |
| Phase127 | 基础实现 | TUI live session command summary priority controls |
| Phase128 | 基础实现 | TUI live session command summary visibility profiles |
| Phase129 | 基础实现 | TUI live session command palette scrolling |
| Phase130 | 基础实现 | TUI live session command palette scroll position indicators |
| Phase131 | 基础实现 | TUI live session command palette page-size controls |
| Phase132 | 基础实现 | TUI live session command palette Home/End navigation |
| Phase133 | 基础实现 | TUI live session command palette selection wrapping controls |
| Phase134 | 基础实现 | TUI live session command palette group navigation |
| Phase135 | 基础实现 | TUI live session command palette group position indicators |
| Phase136 | 基础实现 | TUI live session command palette group size indicators |
| Phase137 | 基础实现 | TUI live session command palette in-group position indicators |
| Phase138 | 基础实现 | TUI live session command palette group neighbor indicators |
| Phase139 | 基础实现 | TUI live session command palette group neighbor size indicators |
| Phase140 | 基础实现 | TUI live session command palette group neighbor command-key indicators |
| Phase141 | 基础实现 | TUI live session command palette group neighbor command-position indicators |
| Phase142 | 基础实现 | TUI live session command palette group neighbor command-id indicators |
| Phase143 | 基础实现 | TUI live session command palette group neighbor visibility profiles |
| Phase144 | 基础实现 | TUI live session command palette group neighbor adaptive visibility |
| Phase145 | 基础实现 | TUI live session command palette group neighbor adaptive threshold controls |
| Phase146 | 基础实现 | TUI live session command palette group neighbor adaptive threshold indicators |
| Phase147 | 基础实现 | TUI live session command palette group neighbor adaptive threshold distance indicators |
| Phase148 | 基础实现 | TUI live session command palette group neighbor adaptive threshold target indicators |
| Phase149 | 基础实现 | TUI live session command palette group neighbor adaptive threshold progress indicators |
| Phase150 | 基础实现 | TUI live session command palette group neighbor adaptive threshold progress buckets |
| Phase151 | 基础实现 | TUI live session command palette group neighbor adaptive threshold progress bucket labels |
| Phase152 | 基础实现 | TUI live session command palette group neighbor adaptive threshold progress bucket help visibility |
| Phase153 | 基础实现 | TUI live session command palette group neighbor adaptive threshold progress bucket help status indicators |

阶段文档位于 [`design/`](design/)。

---

## 4. 总体架构

核心原则：

> 外部能力先进 TS Host，模型能力先进 Python providers，Engine 只看标准接口。

```text
User CLI
  -> TS Host
  -> JSON-RPC over stdio
  -> Python Engine
  -> ModelAdapter / Provider
  -> ToolScheduler
  -> execute_tool
  -> HostToolRegistry.executeRequest
  -> Host tools / MCP tools / Plugin tools
```

分层职责：

- `ts-host/`：CLI、engine process、JSON-RPC client、宿主工具、权限、审计、renderer、MCP runtime、plugin runtime。
- `py-engine/`：session、turn engine、prompt builder、model adapter、provider、tool scheduler、transcript。
- `protocol/`：跨语言 JSON-RPC wire contract。
- `design/`：分阶段设计与实现边界说明。

---

## 5. 核心边界

### 5.1 TS Host 是宿主能力边界

真实文件读写、shell、MCP tool、plugin tool 都必须在 TS Host 侧执行。

正式工具入口是：

```text
HostToolRegistry.executeRequest(...)
```

这个入口负责串起：

```text
tool_requested audit
  -> permissionPolicy.beforeExecute
  -> tool_decision audit
  -> raw handler
  -> permissionPolicy.afterExecute
  -> tool_finished audit
```

不要从 runtime、MCP 或 plugin 直接绕过 `executeRequest(...)` 调工具 handler。

### 5.2 Python Engine 是回合状态边界

Python Engine 拥有：

- `SessionState`
- `TurnEngine`
- `PromptBuilder`
- `ModelRequest`
- `ToolScheduler`
- transcript store

Python Engine 不应该：

- 直接读写宿主文件。
- 直接运行 shell。
- 管理 MCP 子进程。
- 加载 plugin 文件。
- 知道 provider 的 HTTP/SSE wire 格式。

### 5.3 Provider 细节只在 Python `providers/`

真实模型接入通过 provider 边界完成：

```text
ModelRequest
  -> RealProviderModelAdapter
  -> HttpProviderClient
  -> provider-specific formatter / mapper
  -> ModelAction / AssistantDelta
```

`TurnEngine` 只看：

- `ModelAdapter.next_action(request)`
- `StreamingModelAdapter.stream_actions(request)`
- `AssistantMessageAction`
- `ToolCallAction`
- `AssistantDelta`

### 5.4 JSON-RPC wire contract 保持稳定

TS Host -> Python Engine：

- `initialize`
- `create_session`
- `submit_turn`
- `cancel_turn`
- `shutdown`

Python Engine -> TS Host：

- `execute_tool`
- `god_code_event`
- `cancel_tool_execution`

Phase5 到 Phase20 都不新增 JSON-RPC 方法。Phase21 也不新增方法，只给 `create_session` 增加可选 `initial_messages` 字段。新能力通过 provider registry、tool catalog、runtime 配置或向后兼容字段进入现有协议。

---

## 6. 关键运行流程

### 6.1 Headless run

```text
god-code run "<prompt>"
  -> cli/main.ts
  -> runGodCodeSession(...)
  -> GodCodeEngineProcess.start()
  -> initialize
  -> create_session
  -> submit_turn
  -> god_code_event / execute_tool
  -> TerminalRenderer
```

### 6.1.1 Session resume

```text
god-code sessions resume <session_id> "<prompt>"
  -> cli/main.ts
  -> readTranscriptEntriesForSession(...)
  -> buildTranscriptResumeMessages(...)
  -> runGodCodeResumedSession(...)
  -> create_session(initial_messages=[...])
  -> submit_turn
```

Resume 会创建新的 engine session；旧 transcript 只读，不重新执行历史工具。

### 6.2 Turn loop

```text
submit_turn
  -> SessionState.messages append user message
  -> PromptBuilder.build(...)
  -> ModelAdapter / StreamingModelAdapter
  -> AssistantMessageAction or ToolCallAction
  -> ToolScheduler.execute_tool(...)
  -> append tool_result
  -> continue until final assistant message
```

### 6.3 Tool execution

```text
ToolCallAction
  -> ToolScheduler
  -> execute_tool JSON-RPC request
  -> TS Host
  -> HostToolRegistry.executeRequest
  -> permission / audit / abort
  -> built-in tool or MCP tool or plugin tool
  -> ToolExecutionResult
  -> Python Engine
```

### 6.4 Streaming

```text
Provider SSE or fake streaming
  -> StreamingModelAdapter.stream_actions(...)
  -> AssistantDelta
  -> TurnEngine emits god_code_event: assistant_delta
  -> TS Host renderer
  -> CLI incremental output
```

Final assistant message 仍然会作为完整 message 进入事件流；TS renderer 负责避免重复输出。

### 6.5 Responses API provider context

Responses API 需要保存 provider 专属 opaque items。GOD-code 用 Python 内部 `provider_context` 承载：

```text
OpenAI Responses output
  -> provider_context
  -> SessionState.provider_context
  -> transcript entry: provider_context
  -> replay helper rebuild_provider_context(...)
  -> next ModelRequest.provider_context
```

`provider_context` 不进入 JSON-RPC，不暴露给 TS Host。

### 6.6 MCP runtime

```text
GOD_CODE_MCP_SERVERS
GOD_CODE_MCP_CONFIG_FILE
  -> TS MCP config
  -> SdkMcpStdioRuntime
  -> MCP tools / resources / prompts list
  -> ToolCatalogEntry
  -> HostToolRegistry.executeRequest
```

MCP transport、server lifecycle、tool call、resources / prompts 列表诊断和显式 resource update wait/watch/loop 诊断都在 TS Host 内部。Python Engine 只看到普通 tool catalog。

### 6.7 Plugin / Skill runtime

```text
plugin manifest
  -> schema / validate
  -> PluginSkillRuntime
  -> PluginRegistry
  -> ToolCatalogEntry / prompt fragments
  -> HostToolRegistry.executeRequest
```

当前 plugin / skill runtime 加载本地 manifest，并绑定宿主已提供的 handler；manifest 声明 `runtime.kind="node-subprocess"` 时，也可以把 plugin-owned tool handler 作为 TS Host 管理的子进程执行。Phase36 起，显式配置的 plugin dirs 会进入 `prepareGodCodeHost()`，因此 `tools list/inspect`、`run` 和 `rpc-smoke` 都能看到 runtime-backed plugin tools。Phase37 起，本地 registry 文件可集中声明 enabled / disabled plugin package，并通过 `plugins list/inspect` 查看。Phase71 起，`plugins install` 可把本地 package 写入 registry JSON，但不执行 plugin runtime code。Phase72 起，`plugins uninstall` 可从 registry 移除条目，但不删除 package directory。Phase73 起，`plugins enable` / `plugins disable` 可切换 registry enabled 状态。Phase74 起，`plugins tags` 可调整 registry tags 元数据。

---

## 7. 核心接口契约

### 7.1 Tool execution

关键接口：

- `HostToolRegistry.executeRequest(...)`
- `ToolExecutionResult`
- `ToolExecutionError`
- `PermissionPolicy`

要求：

- 所有工具执行必须走 `executeRequest(...)`。
- deny / prompt / policy error 也要有最终结果。
- audit 失败不应该改变工具结果。
- cancellation 要传到可取消工具，例如 `Bash`。

### 7.2 Model boundary

关键接口：

- `ModelRequest`
- `ModelOptions`
- `ModelAdapter.next_action(request)`
- `StreamingModelAdapter.stream_actions(request)`

要求：

- adapter 只能返回 assistant message、tool call 或 stream event。
- adapter 不执行工具。
- streaming 中间态只能通过 `AssistantDelta` 暴露。
- tool name 必须能在当前 tool catalog 中找到。

### 7.3 Provider boundary

关键接口：

- `ProviderRegistry`
- `ProviderConfig`
- `HttpProviderClient`
- `RealProviderModelAdapter`
- `OpenAICompatibleProviderClient`
- `OpenAIResponsesProviderClient`

要求：

- `ProviderRegistry` 负责选择 adapter。
- provider client 只返回内部 provider payload，不直接返回 `ModelAction`。
- provider response normalizer 负责转成统一 action。
- provider-specific context 不能进入 JSON-RPC。

### 7.4 Protocol events

关键事件：

- `assistant_delta`
- `assistant_message`
- `tool_call_requested`
- `tool_call_finished`
- `turn_finished`

要求：

- `turn_finished` 是回合完成信号。
- streaming 可以先发多个 `assistant_delta`。
- 最终 message 仍然要保持完整，便于 transcript 和非 streaming 消费方使用。

---

## 8. 状态与持久化

### 8.1 Session state

`SessionState` 当前拥有：

- session id
- cwd
- tool catalog
- model adapter
- transcript store
- messages
- provider context

### 8.2 Messages

内部 messages 用于构造 `ModelRequest`，当前覆盖：

- user
- assistant
- tool_call
- tool_result

`tool_result` 保留 `tool_call_id`，用于真实 provider 的多步 tool loop。

### 8.3 Transcript store

当前有：

- noop
- in-memory
- JSONL

`GOD_CODE_TRANSCRIPT_DIR` 存在时启用 JSONL transcript，否则默认内存/默认 store 路径不强制落盘。

Replay helper 负责从 transcript 恢复：

- messages
- provider_context

TS Host 的 `sessions resume` 当前只使用 messages，不恢复 `provider_context`。

---

## 9. Provider 设计

### 9.1 Provider family

当前 provider family：

- `fake`
- `openai`
- `openai-compatible`
- `openai-responses`
- `openai-compatible-responses`

`openai` / `openai-compatible` 走 Chat Completions 风格。

`openai-responses` / `openai-compatible-responses` 走 Responses API 风格。

两条 provider family 不互相替换，避免静默改变语义。

### 9.2 Provider config

环境变量：

```text
GOD_CODE_PROVIDER
GOD_CODE_MODEL
GOD_CODE_API_KEY_ENV
GOD_CODE_BASE_URL
GOD_CODE_PROVIDER_TIMEOUT_S
```

规则：

- 默认不设置 provider 时只用 `fake`。
- 非 fake provider 必须显式配置 model 和 API key env 名。
- `GOD_CODE_API_KEY_ENV` 保存的是 API key 所在环境变量名，不是 key 值。
- provider 配置错误应在启动或创建 registry 时清晰失败，不进入 `TurnEngine`。

### 9.3 Provider streaming

provider streaming 统一向上暴露：

- `AssistantDelta`
- 完整 `AssistantMessageAction`
- 完整 `ToolCallAction`

SSE parser、tool call delta 聚合、Responses item 聚合都留在 provider 层。

---

## 10. MCP / Plugin / Skill 设计

### 10.1 MCP

MCP 是宿主能力，不是 Python Engine 能力。

当前实现：

- 读取 `GOD_CODE_MCP_SERVERS` 或 `GOD_CODE_MCP_CONFIG_FILE`。
- 启动 stdio、Streamable HTTP 或 legacy SSE MCP server。
- 为 Streamable HTTP 和 legacy SSE MCP server 解析 literal headers、`headers_env` 和 `bearer_token_env`。
- 拉取 tool list。
- 映射为 GOD-code `ToolCatalogEntry`。
- 通过 MCP diagnostics 和 `tools inspect` 展示 MCP tool input schema。
- 通过 `mcp inspect-config --resources/--prompts` 展示 MCP resources / prompts metadata。
- 通过 `mcp inspect-config --resource-templates` 展示 MCP resource templates metadata。
- 通过 `mcp read-resource` / `mcp get-prompt` 显式读取 resource 或获取 prompt。
- 通过 `GOD_CODE_MCP_CONTEXT` / `GOD_CODE_MCP_CONTEXT_FILE` 显式选择要注入模型上下文的 resource / prompt。
- 通过 `mcp inspect-context` 预检显式 MCP context 配置和生成的 `initial_messages`。
- 通过 `GOD_CODE_MCP_CONTEXT_MAX_ENTRY_CHARS` / `GOD_CODE_MCP_CONTEXT_MAX_TOTAL_CHARS` / `GOD_CODE_MCP_CONTEXT_DEDUP` 控制 context 去重、字符级限额和截断。
- 通过 `mcp subscribe-resource` / `mcp unsubscribe-resource` 显式验证 resource subscription 请求。
- 通过 `mcp wait-resource-update` 在短生命周期连接内等待一次 resource update notification。
- 通过 `mcp watch-resource-updates` 在短生命周期连接内收集多次 resource update notification。
- 通过 `mcp loop-resource-updates` 在一个连接生命周期内订阅一个或多个 resource 并收集 update notification。
- 通过 `mcp complete-prompt` / `mcp complete-resource-template` 显式验证 MCP completion 请求。
- 通过 `mcp complete-* --values-only/--jsonl` 输出 shell/readline wrapper 可消费的 completion candidate。
- 通过 `mcp completion-script bash|zsh` 输出可 source 的 MCP completion shell hook。
- 通过 `mcp completion-install bash|zsh` 在显式 `--yes` 时写入受管理的 shell rc block。
- 连接 / tools/list / duplicate tool name 失败时输出结构化、脱敏诊断。
- 执行时仍走 `HostToolRegistry.executeRequest(...)`。

当前不做：

- MCP 后台 daemon / 跨命令持久 resource update event loop 或 OAuth / token refresh flow。
- resources / prompts 自动发现注入 PromptBuilder 或 model context。
- OAuth / token refresh 或 credential store。

### 10.2 Plugin / Skill

Plugin / Skill 也是宿主能力。

当前实现：

- `PluginSkillRuntime` 读取本地 manifest。
- `plugins schema` 输出 plugin.json / skill.json 共享 manifest schema。
- `examples/plugins/demo-plugin/` 提供 manifest-only package 示例和 fixtures。
- `examples/plugins/executable-plugin/` 提供 `node-subprocess` runtime 示例。
- `GOD_CODE_PLUGIN_DIRS` / `GOD_CODE_PLUGIN_CONFIG_FILE` 显式启用本地 plugin dirs。
- `PluginRegistry` 汇总 tools 和 prompt fragments。
- 无 runtime 的 plugin 只有宿主已注册 handler 的 tool 才可执行。
- manifest 声明 runtime 时，plugin-owned tool handler 可在 TS Host 管理的子进程中执行。
- 执行仍走 `HostToolRegistry.executeRequest(...)`。
- `plugins install <plugin_or_skill_dir>` 可用 dry-run / `--yes` 写入本地 registry。
- `plugins uninstall <plugin_id>` 可用 dry-run / `--yes` 从本地 registry 移除条目。
- `plugins enable <plugin_id>` / `plugins disable <plugin_id>` 可用 dry-run / `--yes` 切换本地 registry entry 的 enabled 状态。
- `plugins tags <plugin_id>` 可用 dry-run / `--yes` 调整本地 registry entry 的 tags 元数据。

当前不做：

- 远程 marketplace、下载安装。
- 安装脚本、持久 daemon 或系统级 sandbox runtime。
- 动态 npm install。
- CLI/env 自动加载 plugin。

---

## 11. Permission / Audit / Cancel 设计

### 11.1 Permission

permission policy 负责在工具执行前做决策：

- allow
- deny
- prompt

Phase80 已把 prompt 分支接入显式、可选的 TS Host 终端确认流程。默认模式仍保持 Phase1 行为：未启用 approval prompt 时，prompt 继续按 deny 处理。

### 11.2 Audit

正式工具路径应尽量形成：

```text
tool_requested
tool_decision
tool_finished
```

deny、prompt、policy error 也要记录最终 `tool_finished`。

### 11.3 Cancel

取消从 TS Host 到 Python Engine，再回到宿主工具：

```text
cancel_turn
  -> Python cancel event
  -> ToolScheduler / streaming loop checks
  -> cancel_tool_execution if tool is running
  -> TS Host abort signal
```

`Bash` 支持通过 abort 终止子进程。

---

## 12. 配置矩阵

| 配置 | 所属层 | 作用 |
| --- | --- | --- |
| `GOD_CODE_PROVIDER` | Python provider | 选择 fake / OpenAI-compatible / Responses provider |
| `GOD_CODE_MODEL` | Python provider | 指定真实 provider 模型名 |
| `GOD_CODE_API_KEY_ENV` | Python provider | 指定 API key 所在环境变量名 |
| `GOD_CODE_BASE_URL` | Python provider | 指定 OpenAI-compatible base URL |
| `GOD_CODE_PROVIDER_TIMEOUT_S` | Python provider | 指定 provider 请求超时 |
| `GOD_CODE_TRANSCRIPT_DIR` | Python transcript | 启用 JSONL transcript 目录 |
| `GOD_CODE_MCP_SERVERS` | TS Host MCP | 显式配置 MCP stdio、Streamable HTTP 或 legacy SSE servers |
| `GOD_CODE_MCP_CONFIG_FILE` | TS Host MCP | 显式从 JSON 文件配置 MCP stdio、Streamable HTTP 或 legacy SSE servers |
| `GOD_CODE_MCP_CONTEXT` | TS Host MCP | 显式配置要注入模型上下文的 MCP resource / prompt entries |
| `GOD_CODE_MCP_CONTEXT_FILE` | TS Host MCP | 显式从 JSON 文件读取 MCP context entries |
| `GOD_CODE_MCP_CONTEXT_MAX_ENTRY_CHARS` | TS Host MCP | 限制单条 MCP context message 的字符数 |
| `GOD_CODE_MCP_CONTEXT_MAX_TOTAL_CHARS` | TS Host MCP | 限制全部 MCP context message 的总字符数 |
| `GOD_CODE_MCP_CONTEXT_DEDUP` | TS Host MCP | 控制 MCP context entry 稳定去重，默认开启 |
| MCP server `headers_env` | TS Host MCP | Streamable HTTP / legacy SSE header name 到 env var name 的映射 |
| MCP server `bearer_token_env` | TS Host MCP | Streamable HTTP / legacy SSE Authorization bearer token 的 env var name |
| `GOD_CODE_PLUGIN_DIRS` | TS Host Plugin / Skill | 显式配置本地 plugin / skill 目录 JSON array |
| `GOD_CODE_PLUGIN_ENABLED_IDS` | TS Host Plugin / Skill | 可选限制启用的 plugin / skill id JSON array |
| `GOD_CODE_PLUGIN_CONFIG_FILE` | TS Host Plugin / Skill | 显式从 JSON 文件配置 plugin / skill dirs |
| `GOD_CODE_PLUGIN_REGISTRY_FILE` | TS Host Plugin / Skill | 显式从本地 registry 文件列出和启用 plugin / skill package |

Plugin / Skill 当前通过 `PluginSkillRuntime` 配置对象加载本地 manifest；Phase36 已提供显式 CLI env / config file 加载入口，Phase37 已提供本地 registry 文件入口，Phase71 已提供本地 registry install command，Phase72 已提供本地 registry uninstall command，Phase73 已提供本地 registry enable / disable command，Phase74 已提供本地 registry tags command，但仍不做自动扫描、远程 marketplace、下载安装、安装脚本或远程 metadata sync。

---

## 13. 测试与验证矩阵

### 13.1 Python

重点测试：

- `test_turn_engine.py`
- `test_fake_model.py`
- `test_provider_registry.py`
- `test_openai_compatible_provider.py`
- `test_openai_responses_provider.py`
- `test_real_provider_adapter.py`
- `test_transcripts.py`

命令：

```bash
./tools/run-python-tests.sh
```

当前 reconstructed workspace 中，该脚本位于 workspace 顶层，不在 `GOD-code/` 子目录里。

### 13.2 TS

重点测试：

- `hostTools.test.ts`
- `godCodeEngineProcess.test.ts`
- `terminalRenderer.test.ts`
- `mcpRuntime.test.ts`
- `platform.test.ts`

命令：

```bash
cd GOD-code/ts-host
npx tsc -p tsconfig.json --noEmit
npm test -- --run
```

### 13.3 Smoke

```bash
cd GOD-code
node ts-host/dist/cli/main.js rpc-smoke
node ts-host/dist/cli/main.js run "read README.md"
node ts-host/dist/cli/main.js run "bash printf ok"
printf "/status\n/tools\n/exit\n" | node ts-host/dist/cli/main.js repl
```

MCP smoke 示例：

```bash
GOD_CODE_MCP_SERVERS='[{"id":"demo","command":"python3","args":["ts-host/test/fixtures/mcp-demo-server.py"]}]' \
node ts-host/dist/cli/main.js rpc-smoke

GOD_CODE_MCP_CONFIG_FILE=examples/config/mcp-stdio-servers.json \
node ts-host/dist/cli/main.js mcp inspect-config --connect --json

GOD_CODE_MCP_CONFIG_FILE=examples/config/mcp-stdio-servers.json \
GOD_CODE_MCP_CONTEXT='[{"type":"resource","uri":"memory://demo/readme"}]' \
node ts-host/dist/cli/main.js mcp inspect-context --json

GOD_CODE_DEMO_MCP_TOKEN=replace-me \
GOD_CODE_MCP_CONFIG_FILE=examples/config/mcp-streamable-http-auth-servers.json \
node ts-host/dist/cli/main.js mcp inspect-config --json

GOD_CODE_DEMO_MCP_TOKEN=replace-me \
GOD_CODE_MCP_CONFIG_FILE=examples/config/mcp-sse-servers.json \
node ts-host/dist/cli/main.js mcp inspect-config --json
```

---

## 14. 当前限制

当前仍有限制：

- system prompt builder 已在 Phase60 补齐基础实现；当前不做远程 prompt registry、自动项目扫描、prompt injection classifier、retrieval 或语义摘要。
- token budget manager 已在 Phase61 补齐基础实现；当前不做精确 provider tokenizer、自动 context-window discovery、价格表或 billing。
- summary compaction strategy 已在 Phase62 补齐基础实现；当前不做 provider-backed LLM summarization、向量检索或 transcript rewrite。
- prompt injection guard 已在 Phase63 补齐基础实现；当前不做 LLM-backed classifier、provider moderation API 或默认阻断。
- Anthropic Messages provider 只有基础 Messages API 路径，Phase84 已补显式 opt-in 的 provider-native 多 tool_use 归一化；暂不支持 Anthropic server-side tools、extended thinking UI、prompt caching 或 provider-managed parallel tool use。
- provider rate limit policy 已在 Phase64 补齐基础实现；当前不做 provider quota API、跨进程 limiter 或持久 request ledger，provider retry policy 已在 Phase53 补齐，provider fallback chain 已在 Phase54 补齐。
- 没有精确 token budget 或语义摘要式 compaction；Phase56 已补 context budget / deterministic compaction 基础实现。
- 没有账户级 provider billing 或持久 spend ledger；Phase58 已补 provider-reported usage accounting / budget guard 基础实现。
- provider-specific error mapping 已在 Phase59 补齐基础实现；当前只覆盖 OpenAI-compatible / Responses / Anthropic 常见 HTTP/API 错误分类。
- Local OpenAI-compatible provider 已在 Phase57 补齐基础实现；local provider daemon lifecycle 已在 Phase65 补齐基础实现；local provider model discovery 已在 Phase66 补齐基础实现；local provider model pull command 已在 Phase67 补齐基础实现；local provider model remove command 已在 Phase68 补齐基础实现；local provider model prune command 已在 Phase69 补齐基础实现，当前没有 runtime-native API、runtime-native prune API 或自动缓存配额管理。
- 没有 MCP 后台 daemon / 跨命令持久 resource update event loop / OAuth / token refresh flow。
- MCP resource templates 当前只有列表诊断；resources/read、prompts/get、resource subscriptions 和 completion 当前只有显式诊断；模型上下文注入只支持 `GOD_CODE_MCP_CONTEXT` / `GOD_CODE_MCP_CONTEXT_FILE` 显式列出的条目。
- 没有远程 plugin marketplace / 下载安装 / 安装脚本 / 远程 metadata sync / 持久 daemon / 系统级 sandbox runtime；Phase35 已有本地 `node-subprocess` sandbox runtime 基础路径，Phase37 已有本地 registry，Phase71 已有本地 registry install command，Phase72 已有本地 registry uninstall command，Phase73 已有本地 registry enable / disable command，Phase74 已有本地 registry tags command。
- MCP / Plugin 支持基础 CLI 诊断；没有自动修复或自动配置生成。
- REPL 只有基础 CLI 版本；Phase86 已完成 TUI session dashboard 基础实现，Phase87 已完成 TUI interaction polish 基础实现，Phase88 已完成 TUI modal approval 基础实现，Phase89 已完成 TUI pane scrolling 基础实现，Phase90 已完成 TUI assistant stream coalescing 基础实现，Phase91 已完成 TUI keyboard help overlay 基础实现，Phase92 已完成 TUI adaptive layout 基础实现，Phase93 已完成 TUI debug diagnostics 基础实现，Phase94 已完成 TUI pane focus style 基础实现，Phase95 已完成 TUI PTY smoke harness 基础实现，Phase96 已完成 TUI session switcher 基础实现，Phase97 已完成 TUI live session switching 基础实现，Phase98 已完成 TUI live session list pane 基础实现，Phase99 已完成 TUI per-session event buffers 基础实现，Phase100 已完成 TUI per-session status indicators 基础实现，Phase101 已完成 TUI per-session unread counters 基础实现，Phase102 已完成 TUI live session close command 基础实现，Phase103 已完成 TUI live session pin command 基础实现，Phase104 已完成 TUI live session rename command 基础实现，Phase105 已完成 TUI live session filter 基础实现，Phase106 已完成 TUI live session sort modes 基础实现，Phase107 已完成 TUI live session quick actions 基础实现，Phase108 已完成 TUI live session bulk actions 基础实现，Phase109 已完成 TUI live session command palette 基础实现，Phase110 已完成 TUI live session command search 基础实现，Phase111 已完成 TUI live session command categories 基础实现，Phase112 已完成 TUI live session command grouping UI 基础实现，Phase113 已完成 TUI live session command favorites 基础实现，Phase114 已完成 TUI live session command history 基础实现，Phase115 已完成 TUI live session command pinned history 基础实现，Phase116 已完成 TUI live session command history clear 基础实现，Phase117 已完成 TUI live session command usage counts 基础实现，Phase118 已完成 TUI live session command usage sorting 基础实现，Phase119 已完成 TUI live session command usage ranking summary 基础实现，Phase120 已完成 TUI live session command usage ranking visibility 基础实现，Phase121 已完成 TUI live session command usage ranking size 基础实现，Phase122 已完成 TUI live session command usage ranking adaptive layout 基础实现，Phase123 已完成 TUI live session command usage ranking overflow indicator 基础实现，Phase124 已完成 TUI live session command usage ranking multi-line layout 基础实现，Phase125 已完成 TUI live session command usage ranking line-count controls 基础实现，Phase126 已完成 TUI live session command usage ranking row-budget safeguards 基础实现，Phase127 已完成 TUI live session command summary priority controls 基础实现，Phase128 已完成 TUI live session command summary visibility profiles 基础实现，Phase129 已完成 TUI live session command palette scrolling 基础实现，Phase130 已完成 TUI live session command palette scroll position indicators 基础实现，Phase131 已完成 TUI live session command palette page-size controls 基础实现，Phase132 已完成 TUI live session command palette Home/End navigation 基础实现，Phase133 已完成 TUI live session command palette selection wrapping controls 基础实现，Phase134 已完成 TUI live session command palette group navigation 基础实现，Phase135 已完成 TUI live session command palette group position indicators 基础实现，Phase136 已完成 TUI live session command palette group size indicators 基础实现，Phase137 已完成 TUI live session command palette in-group position indicators 基础实现，Phase138 已完成 TUI live session command palette group neighbor indicators 基础实现，Phase139 已完成 TUI live session command palette group neighbor size indicators 基础实现，Phase140 已完成 TUI live session command palette group neighbor command-key indicators 基础实现，Phase141 已完成 TUI live session command palette group neighbor command-position indicators 基础实现，Phase142 已完成 TUI live session command palette group neighbor command-id indicators 基础实现，Phase143 已完成 TUI live session command palette group neighbor visibility profiles 基础实现，完整 TUI 仍待增强。
- Session history 支持基础 list/replay/timeline/resume/recover/search/global-search/roots/watch/cleanup/index/archive/delete；resume 是 transcript-based，不恢复 live process；recover 是 transcript-backed advanced recovery，不重放历史工具；cleanup 支持 dry-run、archive 和 delete；archive 支持 list/replay/timeline/search/restore/compress/delete 和 `.jsonl.gz`；index 支持本地 build/refresh/search/watch-refresh；Phase70 已补单 session transcript timeline diagnostics；Phase75 已补跨目录 global transcript search；Phase76 已补受限 transcript root discovery diagnostics；Phase77 已补 discovery-backed global transcript search；Phase78 已补短生命周期 transcript watch diagnostics；Phase79 已补显式 index watch-refresh diagnostics；Phase83 已完成 session advanced recovery 基础实现；当前仍没有后台 watcher daemon、TUI timeline、无界自动 transcript root discovery 或语义搜索。
- Doctor 支持基础本地检查和显式 provider health check；provider inspect-config / contract-test 支持离线 provider 诊断；没有自动修复。
- Python Engine 多 session runtime 已在 Phase81 补齐基础实现；Phase96 已补 transcript-level TUI session switcher 基础实现；Phase97 已补 TUI live session switching 基础实现；当前仍不做 session daemon 或跨进程 handoff。
- Phase82 已补 Python Engine 内部多工具并发调度基础实现；Phase84 已完成 provider-native parallel tool calls 显式 opt-in 基础实现；Phase85 已完成 tool dependency graph scheduling 基础实现；默认仍不启用 provider-native parallel tool calls，也不提供 TS Host batch API。
- 显式交互式权限确认 UI 已在 Phase80 补齐基础实现；当前仍不做完整 TUI 或持久 approval daemon。

---

## 15. 后续演进原则

后续扩展时优先遵守这些规则：

1. 不绕过 `HostToolRegistry.executeRequest(...)`。
2. 不把宿主文件/命令能力移进 Python Engine。
3. 不把 provider HTTP/SSE 细节塞进 `TurnEngine`。
4. 不把 MCP 或 plugin runtime 塞进 Python Engine。
5. 不为单个 provider 改 JSON-RPC wire contract。
6. 不让 Responses API 的 opaque items 泄漏到 TS Host。
7. 新能力优先通过 registry、adapter、tool catalog 或 renderer 边界接入。
8. README 保持短，内部细节放在本文件或 `ARCHITECTURE.md`。

---

## 16. 相关文档

- [`README.md`](README.md)：项目总览和快速开始。
- [`ARCHITECTURE.md`](ARCHITECTURE.md)：详细调用链。
- [`EXTENSION_POINTS.md`](EXTENSION_POINTS.md)：扩展点说明。
- [`protocol/README.md`](protocol/README.md)：JSON-RPC 协议。
- [`design/PHASE_61_TOKEN_BUDGET_MANAGER.md`](design/PHASE_61_TOKEN_BUDGET_MANAGER.md)：Phase61 token budget manager。
- [`design/PHASE_62_SUMMARY_COMPACTION_STRATEGY.md`](design/PHASE_62_SUMMARY_COMPACTION_STRATEGY.md)：Phase62 summary compaction strategy。
- [`design/PHASE_63_PROMPT_INJECTION_GUARD.md`](design/PHASE_63_PROMPT_INJECTION_GUARD.md)：Phase63 prompt injection guard。
- [`design/PHASE_64_PROVIDER_RATE_LIMIT_POLICY.md`](design/PHASE_64_PROVIDER_RATE_LIMIT_POLICY.md)：Phase64 provider rate limit policy。
- [`design/PHASE_65_LOCAL_PROVIDER_DAEMON_LIFECYCLE.md`](design/PHASE_65_LOCAL_PROVIDER_DAEMON_LIFECYCLE.md)：Phase65 local provider daemon lifecycle。
- [`design/PHASE_66_LOCAL_PROVIDER_MODEL_DISCOVERY.md`](design/PHASE_66_LOCAL_PROVIDER_MODEL_DISCOVERY.md)：Phase66 local provider model discovery。
- [`design/PHASE_67_LOCAL_PROVIDER_MODEL_PULL.md`](design/PHASE_67_LOCAL_PROVIDER_MODEL_PULL.md)：Phase67 local provider model pull command。
- [`design/PHASE_68_LOCAL_PROVIDER_MODEL_REMOVE.md`](design/PHASE_68_LOCAL_PROVIDER_MODEL_REMOVE.md)：Phase68 local provider model remove command。
- [`design/PHASE_69_LOCAL_PROVIDER_MODEL_PRUNE.md`](design/PHASE_69_LOCAL_PROVIDER_MODEL_PRUNE.md)：Phase69 local provider model prune command。
- [`design/PHASE_70_SESSION_TRANSCRIPT_TIMELINE.md`](design/PHASE_70_SESSION_TRANSCRIPT_TIMELINE.md)：Phase70 session transcript timeline diagnostics。
- [`design/PHASE_71_PLUGIN_LOCAL_REGISTRY_INSTALL.md`](design/PHASE_71_PLUGIN_LOCAL_REGISTRY_INSTALL.md)：Phase71 Plugin / Skill local registry install command。
- [`design/PHASE_72_PLUGIN_LOCAL_REGISTRY_UNINSTALL.md`](design/PHASE_72_PLUGIN_LOCAL_REGISTRY_UNINSTALL.md)：Phase72 Plugin / Skill local registry uninstall command。
- [`design/PHASE_73_PLUGIN_LOCAL_REGISTRY_ENABLE_DISABLE.md`](design/PHASE_73_PLUGIN_LOCAL_REGISTRY_ENABLE_DISABLE.md)：Phase73 Plugin / Skill local registry enable / disable command。
- [`design/PHASE_74_PLUGIN_LOCAL_REGISTRY_TAGS.md`](design/PHASE_74_PLUGIN_LOCAL_REGISTRY_TAGS.md)：Phase74 Plugin / Skill local registry tags command。
- [`design/PHASE_75_SESSION_GLOBAL_TRANSCRIPT_SEARCH.md`](design/PHASE_75_SESSION_GLOBAL_TRANSCRIPT_SEARCH.md)：Phase75 session global transcript search。
- [`design/PHASE_76_SESSION_TRANSCRIPT_ROOT_DISCOVERY.md`](design/PHASE_76_SESSION_TRANSCRIPT_ROOT_DISCOVERY.md)：Phase76 session transcript root discovery diagnostics。
- [`design/PHASE_77_DISCOVERY_BACKED_GLOBAL_TRANSCRIPT_SEARCH.md`](design/PHASE_77_DISCOVERY_BACKED_GLOBAL_TRANSCRIPT_SEARCH.md)：Phase77 discovery-backed global transcript search。
- [`design/PHASE_78_SESSION_TRANSCRIPT_WATCH_DIAGNOSTICS.md`](design/PHASE_78_SESSION_TRANSCRIPT_WATCH_DIAGNOSTICS.md)：Phase78 session transcript watch diagnostics。
- [`design/PHASE_79_SESSION_INDEX_WATCH_REFRESH.md`](design/PHASE_79_SESSION_INDEX_WATCH_REFRESH.md)：Phase79 session index watch-refresh diagnostics。
- [`design/PHASE_80_INTERACTIVE_PERMISSION_APPROVAL.md`](design/PHASE_80_INTERACTIVE_PERMISSION_APPROVAL.md)：Phase80 interactive permission approval UI。
- [`design/PHASE_81_MULTI_SESSION_RUNTIME.md`](design/PHASE_81_MULTI_SESSION_RUNTIME.md)：Phase81 multi session runtime。
- [`design/PHASE_82_MULTI_TOOL_CONCURRENT_SCHEDULING.md`](design/PHASE_82_MULTI_TOOL_CONCURRENT_SCHEDULING.md)：Phase82 multi tool concurrent scheduling 基础实现。
- [`design/PHASE_83_SESSION_ADVANCED_RECOVERY.md`](design/PHASE_83_SESSION_ADVANCED_RECOVERY.md)：Phase83 session advanced recovery 基础实现。
- [`design/PHASE_84_PROVIDER_NATIVE_PARALLEL_TOOL_CALLS.md`](design/PHASE_84_PROVIDER_NATIVE_PARALLEL_TOOL_CALLS.md)：Phase84 provider-native parallel tool calls 基础实现。
- [`design/PHASE_85_TOOL_DEPENDENCY_GRAPH_SCHEDULING.md`](design/PHASE_85_TOOL_DEPENDENCY_GRAPH_SCHEDULING.md)：Phase85 tool dependency graph scheduling 基础实现。
- [`design/PHASE_86_TUI_SESSION_DASHBOARD.md`](design/PHASE_86_TUI_SESSION_DASHBOARD.md)：Phase86 TUI session dashboard 基础实现边界。
- [`design/PHASE_87_TUI_INTERACTION_POLISH.md`](design/PHASE_87_TUI_INTERACTION_POLISH.md)：Phase87 TUI interaction polish 基础实现。
- [`design/PHASE_88_TUI_MODAL_APPROVAL.md`](design/PHASE_88_TUI_MODAL_APPROVAL.md)：Phase88 TUI modal approval 基础实现。
- [`design/PHASE_89_TUI_PANE_SCROLLING.md`](design/PHASE_89_TUI_PANE_SCROLLING.md)：Phase89 TUI pane scrolling 基础实现。
- [`design/PHASE_90_TUI_ASSISTANT_STREAM_COALESCING.md`](design/PHASE_90_TUI_ASSISTANT_STREAM_COALESCING.md)：Phase90 TUI assistant stream coalescing 基础实现。
- [`design/PHASE_91_TUI_KEYBOARD_HELP_OVERLAY.md`](design/PHASE_91_TUI_KEYBOARD_HELP_OVERLAY.md)：Phase91 TUI keyboard help overlay 基础实现。
- [`design/PHASE_92_TUI_ADAPTIVE_LAYOUT.md`](design/PHASE_92_TUI_ADAPTIVE_LAYOUT.md)：Phase92 TUI adaptive layout 基础实现。
- [`design/PHASE_93_TUI_DEBUG_DIAGNOSTICS.md`](design/PHASE_93_TUI_DEBUG_DIAGNOSTICS.md)：Phase93 TUI debug diagnostics 基础实现。
- [`design/PHASE_94_TUI_PANE_FOCUS_STYLE.md`](design/PHASE_94_TUI_PANE_FOCUS_STYLE.md)：Phase94 TUI pane focus style 基础实现。
- [`design/PHASE_95_TUI_PTY_SMOKE_HARNESS.md`](design/PHASE_95_TUI_PTY_SMOKE_HARNESS.md)：Phase95 TUI PTY smoke harness 基础实现。
- [`design/PHASE_96_TUI_SESSION_SWITCHER.md`](design/PHASE_96_TUI_SESSION_SWITCHER.md)：Phase96 TUI session switcher 基础实现。
- [`design/PHASE_97_TUI_LIVE_SESSION_SWITCHING.md`](design/PHASE_97_TUI_LIVE_SESSION_SWITCHING.md)：Phase97 TUI live session switching 基础实现。
- [`design/PHASE_98_TUI_LIVE_SESSION_LIST_PANE.md`](design/PHASE_98_TUI_LIVE_SESSION_LIST_PANE.md)：Phase98 TUI live session list pane 基础实现。
- [`design/PHASE_99_TUI_PER_SESSION_EVENT_BUFFERS.md`](design/PHASE_99_TUI_PER_SESSION_EVENT_BUFFERS.md)：Phase99 TUI per-session event buffers 基础实现。
- [`design/PHASE_100_TUI_PER_SESSION_STATUS_INDICATORS.md`](design/PHASE_100_TUI_PER_SESSION_STATUS_INDICATORS.md)：Phase100 TUI per-session status indicators 基础实现。
- [`design/PHASE_101_TUI_PER_SESSION_UNREAD_COUNTERS.md`](design/PHASE_101_TUI_PER_SESSION_UNREAD_COUNTERS.md)：Phase101 TUI per-session unread counters 基础实现。
- [`design/PHASE_102_TUI_LIVE_SESSION_CLOSE_COMMAND.md`](design/PHASE_102_TUI_LIVE_SESSION_CLOSE_COMMAND.md)：Phase102 TUI live session close command 基础实现。
- [`design/PHASE_103_TUI_LIVE_SESSION_PIN_COMMAND.md`](design/PHASE_103_TUI_LIVE_SESSION_PIN_COMMAND.md)：Phase103 TUI live session pin command 基础实现。
- [`design/PHASE_104_TUI_LIVE_SESSION_RENAME_COMMAND.md`](design/PHASE_104_TUI_LIVE_SESSION_RENAME_COMMAND.md)：Phase104 TUI live session rename command 基础实现。
- [`design/PHASE_105_TUI_LIVE_SESSION_FILTER.md`](design/PHASE_105_TUI_LIVE_SESSION_FILTER.md)：Phase105 TUI live session filter 基础实现。
- [`design/PHASE_106_TUI_LIVE_SESSION_SORT_MODES.md`](design/PHASE_106_TUI_LIVE_SESSION_SORT_MODES.md)：Phase106 TUI live session sort modes 基础实现。
- [`design/PHASE_107_TUI_LIVE_SESSION_QUICK_ACTIONS.md`](design/PHASE_107_TUI_LIVE_SESSION_QUICK_ACTIONS.md)：Phase107 TUI live session quick actions 基础实现。
- [`design/PHASE_108_TUI_LIVE_SESSION_BULK_ACTIONS.md`](design/PHASE_108_TUI_LIVE_SESSION_BULK_ACTIONS.md)：Phase108 TUI live session bulk actions 基础实现。
- [`design/PHASE_109_TUI_LIVE_SESSION_COMMAND_PALETTE.md`](design/PHASE_109_TUI_LIVE_SESSION_COMMAND_PALETTE.md)：Phase109 TUI live session command palette 基础实现。
- [`design/PHASE_110_TUI_LIVE_SESSION_COMMAND_SEARCH.md`](design/PHASE_110_TUI_LIVE_SESSION_COMMAND_SEARCH.md)：Phase110 TUI live session command search 基础实现。
- [`design/PHASE_111_TUI_LIVE_SESSION_COMMAND_CATEGORIES.md`](design/PHASE_111_TUI_LIVE_SESSION_COMMAND_CATEGORIES.md)：Phase111 TUI live session command categories 基础实现。
- [`design/PHASE_112_TUI_LIVE_SESSION_COMMAND_GROUPING_UI.md`](design/PHASE_112_TUI_LIVE_SESSION_COMMAND_GROUPING_UI.md)：Phase112 TUI live session command grouping UI 基础实现。
- [`design/PHASE_113_TUI_LIVE_SESSION_COMMAND_FAVORITES.md`](design/PHASE_113_TUI_LIVE_SESSION_COMMAND_FAVORITES.md)：Phase113 TUI live session command favorites 基础实现。
- [`design/PHASE_114_TUI_LIVE_SESSION_COMMAND_HISTORY.md`](design/PHASE_114_TUI_LIVE_SESSION_COMMAND_HISTORY.md)：Phase114 TUI live session command history 基础实现。
- [`design/PHASE_115_TUI_LIVE_SESSION_COMMAND_PINNED_HISTORY.md`](design/PHASE_115_TUI_LIVE_SESSION_COMMAND_PINNED_HISTORY.md)：Phase115 TUI live session command pinned history 基础实现。
- [`design/PHASE_116_TUI_LIVE_SESSION_COMMAND_HISTORY_CLEAR.md`](design/PHASE_116_TUI_LIVE_SESSION_COMMAND_HISTORY_CLEAR.md)：Phase116 TUI live session command history clear 基础实现。
- [`design/PHASE_117_TUI_LIVE_SESSION_COMMAND_USAGE_COUNTS.md`](design/PHASE_117_TUI_LIVE_SESSION_COMMAND_USAGE_COUNTS.md)：Phase117 TUI live session command usage counts 基础实现。
- [`design/`](design/)：Phase1 到 Phase601 设计与实现边界。
## Phase230：最深层分段标签显隐控制

最深层宽度百分比提示现在把紧凑分段符号和文字标签分离：`L/M/H` 始终保留，`(low/mid/high)` 由 `liveSessionCommandDeepestNestedBucketLabelVisible` 独立控制。状态默认开启，仅由命令面板内的 `:` action 改变，并在面板关闭/重开期间保持。Help、Debug 和 profile formatter 均从同一状态读取，避免交互提示与实际格式化结果不一致。

## Phase231：最深层分段标签显隐配置档

Phase231 使用 `liveSessionCommandDeepestNestedBucketLabelVisibilityProfile` 取代 Phase230 的布尔字段。`shown` 和 `hidden` 直接生效，`adaptive` 通过共享解析器在 120 列以下隐藏、120 列及以上显示。reducer 负责三档循环，formatter 只接收解析后的布尔结果，Help 和 Debug 同时展示配置值与有效值。

## Phase232：最深层分段标签显隐阈值提示

最深层 adaptive indicator 现在将共享阈值编码为 `[120]`。该值直接读取 `LIVE_SESSION_COMMAND_NEIGHBOR_PROGRESS_BUCKET_HELP_ADAPTIVE_WIDTH`，与 resolver 的判断来源一致；显式 `shown/hidden` 输出不受影响。Help 和 Debug 不单独实现阈值拼接，而是继续复用 indicator helper。

## Phase233：最深层分段标签显隐阈值距离提示

`liveSessionCommandDeepestNestedBucketLabelVisibilityThresholdDistance(...)` 将距离计算从展示函数中拆成纯函数。它只为低于阈值的 adaptive profile 返回正整数；显式 profile 和达到阈值的场景返回 `null`。indicator 使用该结果形成 `hidden+N[120]`，状态与 reducer 无需变化。

## Phase234：最深层分段标签显隐宽度提示

`liveSessionCommandDeepestNestedBucketLabelVisibilityWidthIndicator(...)` 负责格式化当前宽度与共享阈值。adaptive indicator 组合 profile resolver、距离 helper 和 width helper，形成 `adaptive>hidden+1[119/120]` 等输出。显式 profile 仍保持紧凑，且没有新增状态或跨层依赖。

## Phase235：最深层分段标签显隐宽度百分比提示

`liveSessionCommandDeepestNestedBucketLabelVisibilityWidthPercentage(...)` 复用已有的共享宽度百分比算法。width indicator 将其组合为 `current/120=N%`，从而保持所有嵌套层级的取整和 100% 封顶规则一致。该阶段只增强 formatter 输出，不改变状态机。

## Phase236：最深层分段标签显隐宽度百分比分段

`liveSessionCommandDeepestNestedBucketLabelVisibilityWidthPercentageBucket(...)` 委托共享 bucket helper 返回 `L/M/H`。width indicator 将 bucket 直接附加在百分比后，使低、中、高边界与此前所有嵌套层保持一致。profile resolver、距离 helper 和 reducer 均无需变化。

## Phase237：最深层分段标签显隐宽度百分比分段标签

`liveSessionCommandDeepestNestedBucketLabelVisibilityWidthPercentageBucketLabel(...)` 委托共享标签 helper 返回 `low/mid/high`。width indicator 将文字标签放在 bucket 后的括号中，且不改变 bucket 本身、百分比封顶或 adaptive profile 解析。该阶段只扩展 formatter 输出。

## Phase238：最深层分段文字标签显隐控制

`liveSessionCommandDeepestNestedBucketLabelTextVisible` 将最深层文字标签与 `L/M/H` 分离。状态默认开启，仅在命令面板打开时由 `,` action 切换，并跨面板关闭/重开保持。formatter 接收解析后的布尔值，Help 和 Debug 使用独立 indicator 展示 `on/off`。

## Phase239：最深层分段文字标签显隐配置档

`liveSessionCommandDeepestNestedBucketLabelTextVisibilityProfile` 取代 Phase238 的布尔字段。`shown/hidden` 直接生效，`adaptive` 通过共享 resolver 在 120 列以下隐藏、120 列及以上显示。reducer 负责三档循环，formatter 只接收有效布尔值，Help 和 Debug 展示配置值与有效值。

## Phase240：最深层分段文字标签显隐阈值提示

文字标签 adaptive indicator 现在将共享边界编码为 `[120]`。阈值来源与 resolver 相同，显式 `shown/hidden` 输出不受影响。Help 和 Debug 不重复拼接阈值，而是继续使用同一 indicator helper。

## Phase241：最深层分段文字标签显隐阈值距离提示

`liveSessionCommandDeepestNestedBucketLabelTextVisibilityThresholdDistance(...)` 将距离计算拆成纯函数。它仅为低于阈值的 adaptive profile 返回正整数，显式 profile 和达到阈值时返回 `null`。indicator 使用该结果形成 `hidden+N[120]`，状态机不变。

## Phase242：最深层分段文字标签显隐宽度提示

`liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthIndicator(...)` 负责格式化当前宽度和共享阈值。adaptive indicator 组合 resolver、距离 helper 与 width helper，形成 `adaptive>hidden+1[119/120]`。显式 profile 和状态机均不受影响。

## Phase243：最深层分段文字标签显隐宽度百分比提示

`liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentage(...)` 复用共享宽度百分比算法。width indicator 将其组合为 `current/120=N%`，统一保持整数截断和 100% 封顶规则。该阶段只增强 formatter 输出，不改变状态机。

## Phase244：最深层分段文字标签显隐宽度百分比分段

`liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucket(...)` 复用共享的 `L/M/H` 分段函数。width indicator 在百分比后追加分段字符，resolver、阈值距离、显式 profile 与状态机保持不变。

## Phase245：最深层分段文字标签显隐宽度百分比分段标签

`liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabel(...)` 复用共享的 `low/mid/high` 映射。width indicator 将标签放入分段字符后的括号中，既保持紧凑分段值，也提供可读语义；状态机和接口边界不变。

## Phase246：最深层分段文字标签显隐宽度百分比分段标签控制

`liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisible` 由 TUI reducer 持有，默认开启并在命令面板重开后保持。输入层只映射 `.`，Help 和 Debug 将该布尔值传给同一 width indicator，并额外输出 control indicator；状态不跨越 TS Host 边界。

## Phase247：最深层分段文字标签显隐宽度百分比分段标签配置档

`liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityProfile` 取代 Phase246 布尔值。resolver 将 `adaptive` 按共享 120 列边界解析为 `shown/hidden`，reducer 循环三档配置，Help、Debug 和 formatter 使用同一有效值。

## Phase248：最深层分段文字标签显隐宽度百分比分段标签阈值提示

最新 profile indicator 在 `adaptive` 有效值后追加共享阈值 `[120]`。阈值常量与 resolver 来源一致，因此展示边界与实际 formatter 行为保持同步；显式 `shown/hidden`、状态机和跨层接口均不变。

## Phase249：最深层分段文字标签显隐宽度百分比分段标签阈值距离提示

`liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance(...)` 将剩余距离拆成纯函数。它只为低于阈值的 adaptive profile 返回正整数，indicator 使用该结果形成 `hidden+N[120]`。

## Phase250：最深层分段文字标签显隐宽度百分比分段标签宽度提示

`liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(...)` 负责格式化当前宽度与共享阈值。最新 profile indicator 组合 resolver、距离 helper 和 width helper，显式 profile 与状态机保持不变。

## Phase251：最深层分段文字标签显隐宽度百分比分段标签宽度百分比提示

`liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(...)` 复用共享百分比算法。width indicator 将结果组合为 `current/120=N%`，统一保持整数截断和 100% 封顶规则。

## Phase252：最深层分段文字标签显隐宽度百分比分段标签宽度百分比分段

`liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(...)` 复用共享 `L/M/H` 分段函数。width indicator 在百分比后追加分段字符，resolver、距离 helper 和状态机保持不变。

## Phase253：最深层分段文字标签显隐宽度百分比分段标签宽度百分比分段标签

`liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(...)` 复用共享 `low/mid/high` 映射。width indicator 将标签放入分段字符后的括号中，状态机和接口边界不变。

## Phase254：最深层分段文字标签显隐宽度百分比分段标签宽度百分比分段标签控制

`liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisible` 由 TUI reducer 持有。输入层只映射面板内 `-`，Help 和 Debug 将布尔值传给同一 width indicator，并额外输出 control indicator。

## Phase255：最深层分段文字标签显隐宽度百分比分段标签宽度百分比分段标签配置档

`liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile` 取代 Phase254 布尔值。resolver 将 `adaptive` 按共享 120 列边界解析为 `shown/hidden`，reducer 循环三档配置，Help、Debug 和 formatter 使用同一有效值。

## Phase256：最深层分段文字标签显隐宽度百分比分段标签宽度百分比分段标签阈值提示

最新 profile indicator 在 `adaptive` 有效值后追加共享阈值 `[120]`。阈值常量与 resolver 来源一致，因此展示边界与实际 formatter 行为保持同步；状态机和跨层接口不变。

## Phase257：最深层分段文字标签显隐宽度百分比分段标签宽度百分比分段标签阈值距离提示

`liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance(...)` 将剩余距离拆成纯函数。它只为低于阈值的 adaptive profile 返回正整数，indicator 使用结果形成 `hidden+N[120]`。

## Phase258：最深层分段文字标签显隐宽度百分比分段标签宽度百分比分段标签宽度提示

`liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(...)` 复用 resolver 的 120 列阈值并生成 `current/threshold`。该 helper 只参与 adaptive indicator 展示，不改变 profile 解析、reducer 状态或 formatter 的标签显隐判定。

## Phase259：最深层分段文字标签显隐宽度百分比分段标签宽度百分比分段标签宽度百分比提示

`liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentage(...)` 复用共享百分比算法，按整数截断计算并在 100% 封顶。width helper 将该结果追加为 `current/threshold=percentage%`，不改变原始宽度和阈值距离。

## Phase260：最深层分段文字标签显隐宽度百分比分段标签宽度百分比分段标签宽度百分比分段

`liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucket(...)` 复用共享 bucket helper，将当前宽度映射为 `L/M/H`。width indicator 将分段紧跟在百分比后，未引入新的状态或 formatter 分支。

## Phase261：最深层分段文字标签显隐宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签

`liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(...)` 复用共享文字标签映射。width helper 以 `L(low)`、`M(mid)`、`H(high)` 形式组合紧凑分段与可读语义，不改变任何状态机分支。

## Phase262：最深层分段文字标签显隐宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签控制

最新文字标签显隐状态只存在于 `TuiState`。输入层将 `#` 映射为 toggle action，reducer 仅在命令面板打开时切换；formatter、Help 和 Debug 读取同一布尔值，不影响 profile resolver 或跨进程数据。

## Phase263：最深层分段文字标签显隐宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签配置档

最新状态升级为三档 profile。`#` 在面板内循环配置，resolver 将 `adaptive` 按 120 列边界解析为 `shown/hidden`，formatter 与诊断层复用该结果，不改变跨层协议。

## Phase264：最深层分段文字标签显隐宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签阈值提示

最新 adaptive indicator 使用 resolver 同源的共享常量显示 `[120]`。该变化只增强诊断文本，不新增状态或改变标签显隐判定。

## Phase265：最深层分段文字标签显隐宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签阈值距离提示

最新 threshold-distance helper 只为阈值以下 adaptive profile 返回正整数。indicator、Help 和 Debug 复用结果，不改变状态机或跨层协议。

## Phase266：最深层分段文字标签显隐宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签宽度提示

最新 width helper 复用 resolver 的共享阈值并生成 `current/threshold`，只增强 adaptive indicator 文本，不改变 profile 或 formatter 判定。

## Phase267：最深层分段文字标签显隐宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签宽度百分比提示

最新 percentage helper 复用共享截断与封顶算法，width helper 将结果追加为 `current/threshold=percentage%`，状态机与跨层协议不变。

## Phase268：最深层分段文字标签显隐宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签宽度百分比分段

最新 bucket helper 复用共享边界，将宽度映射为 `L/M/H` 并追加在百分比后，不改变状态机或跨层协议。

## Phase269：最深层分段文字标签显隐宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签

最新 label helper 复用共享映射并生成 `low/mid/high`，width helper 以 `bucket(label)` 形式组合，不改变状态机或跨层协议。

## Phase270：最深层分段文字标签显隐宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签控制

最新标签控制状态只存在于 `TuiState`，默认开启并在命令面板关闭/重开后保持。输入层仅在面板内将 `$` 映射为 toggle action；formatter、Help 和 Debug 读取同一状态，关闭时保留紧凑 `L/M/H` 分段。

## Phase271：最深层分段文字标签显隐宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签配置档

最新状态升级为三档 profile。`$` 在命令面板内循环配置，resolver 将 `adaptive` 按共享 120 列边界解析为 `shown/hidden`，formatter 与诊断层复用该结果，不改变跨层协议。

## Phase272：最深层分段文字标签显隐宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签阈值提示

最新 adaptive indicator 使用 resolver 同源的共享常量显示 `[120]`。该变化只增强诊断文本，不新增状态或改变标签显隐判定。

## Phase273：最深层分段文字标签显隐宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签阈值距离提示

最新 threshold-distance helper 只为阈值以下 adaptive profile 返回正整数。indicator、Help 和 Debug 复用结果，不改变状态机或跨层协议。

## Phase274：最深层分段文字标签显隐宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签宽度提示

最新 width helper 复用 resolver 的共享阈值并生成 `current/threshold`，只增强 adaptive indicator 文本，不改变 profile 或 formatter 判定。

## Phase275：最深层分段文字标签显隐宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签宽度百分比提示

最新 percentage helper 复用共享截断与封顶算法，width helper 将结果追加为 `current/threshold=percentage%`，状态机与跨层协议不变。

## Phase276：最深层分段文字标签显隐宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签宽度百分比分段

最新 bucket helper 复用共享边界，将宽度映射为 `L/M/H` 并追加在百分比后，不改变状态机或跨层协议。

## Phase277：最深层分段文字标签显隐宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签

最新 label helper 复用共享映射并生成 `low/mid/high`，width helper 以 `bucket(label)` 形式组合，不改变状态机或跨层协议。

## Phase278：最深层分段文字标签显隐宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签控制

最新标签控制状态只存在于 `TuiState`，默认开启并在命令面板关闭/重开后保持。输入层仅在命令面板内将 `0` 映射为 toggle action；formatter、Help 和 Debug 读取同一状态，关闭时保留紧凑 `L/M/H` 分段。

## Phase279：最深层分段文字标签显隐宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签配置档

最新状态升级为三档 profile。`0` 在命令面板内循环配置，resolver 将 `adaptive` 按共享 120 列边界解析为 `shown/hidden`，formatter 与诊断层复用该结果，不改变跨层协议。

## Phase280：最深层分段文字标签显隐宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签阈值提示

最新 adaptive indicator 使用 resolver 同源的共享常量显示 `[120]`。该变化只增强诊断文本，不新增状态或改变标签显隐判定。

## Phase281：最深层分段文字标签显隐宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签阈值距离提示

最新 threshold-distance helper 只为阈值以下 adaptive profile 返回正整数。indicator、Help 和 Debug 复用结果，不改变状态机或跨层协议。

## Phase282：最深层分段文字标签显隐宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签宽度提示

最新 width helper 复用 resolver 的共享阈值并生成 `current/threshold`，只增强 adaptive indicator 文本，不改变 profile 或 formatter 判定。

## Phase283：最深层分段文字标签显隐宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签宽度百分比提示

最新 width helper 复用既有同层 percentage helper，生成 `current/threshold=percentage%`。百分比沿用整数截断与 100% 封顶规则；该变化只增强 adaptive indicator、Help 和 Debug 文本，不改变状态、action、快捷键、profile 解析或跨层协议。

## Phase284：最深层分段文字标签显隐宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签宽度百分比分段

最新 width helper 继续复用同层 bucket helper，在百分比后追加 `L/M/H`。分段沿用 0-39、40-79、80 以上的共享边界；该变化不增加文字标签、状态、action、快捷键或跨层接口。

## Phase285：最深层分段文字标签显隐宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签

最新 width helper 复用同层 label helper，将分段组合为 `bucket(label)`。标签映射仍来自共享 helper；该变化不新增状态、action、快捷键、profile 解析或跨层接口。

## Phase286：最深层分段文字标签显隐宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签控制

最新标签控制状态只存在于 `TuiState`，默认开启并在命令面板关闭、重开后保持。输入层仅在命令面板内将 `9` 映射为 toggle action；formatter、Help 和 Debug 读取同一状态，关闭时仅移除 `(low/mid/high)`。

## Phase287：最深层分段文字标签显隐宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签配置档

最新状态升级为三档 profile。`9` 在命令面板内循环配置，resolver 将 `adaptive` 按共享 120 列边界解析为 `shown/hidden`；formatter、Help、Debug 和 control indicator 复用该结果，不改变跨层协议。

## Phase288：最深层分段文字标签显隐宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签宽度百分比分段标签阈值提示

最新 adaptive indicator 使用 resolver 同源的共享常量显示 `[120]`。该变化只增强 control indicator 文本，不新增状态、action、快捷键，也不改变标签显隐判定或跨层协议。

## Phase305：最新分段标签阈值距离提示

最新 threshold-distance helper 只为阈值以下 adaptive profile 返回正整数。control indicator、Help 和 Debug 复用结果；显式 profile、状态机、标签显隐判定和跨层协议保持不变。

## Phase306：最新分段标签宽度提示

最新 width helper 复用 resolver 的共享阈值并生成 `current/threshold`。该 helper 只增强 adaptive control indicator、Help 和 Debug 文本，不改变 profile、formatter、状态机或跨层协议。

## Phase307：最新分段标签宽度百分比提示

最新 percentage helper 委托共享算法，保持整数截断、最小 0 和最大 100 的规则。width helper 将其追加到 `current/threshold` 后；该变化不增加状态、action、快捷键或跨层接口。

## Phase308：最新分段标签宽度百分比分段

最新 bucket helper 委托共享算法，在百分比后追加 `L/M/H`。分段继续使用 0-39、40-79、80 以上边界；本阶段不增加文字标签，也不改变状态机或跨层协议。

## Phase309：最新分段标签宽度百分比分段标签

最新 label helper 委托共享映射，将分段组合为 `bucket(label)`。该变化只增强 width indicator、Help 和 Debug 文本，不新增状态、action、快捷键或跨层接口。

## Phase310：最新分段标签控制

最新标签控制状态只存在于 `TuiState`，默认开启并在命令面板关闭、重开后保持。输入层仅在命令面板内将 `6` 映射为 toggle action；formatter、Help 和 Debug 读取同一状态，关闭时仅移除 `(low/mid/high)`。

## Phase311：最新分段标签配置档

最新标签状态使用三档 profile，默认 `shown`。输入层仅在命令面板内循环配置；resolver 以共享 120 列阈值解析 `adaptive`，父级 formatter、Help、Debug 和 control indicator 读取同一有效配置，状态保持为 TUI 本地边界。

## Phase312：最新分段标签阈值提示

最新 adaptive control indicator 直接复用 resolver 的共享 120 列常量并显示 `[120]`。显式 profile 不显示阈值；本阶段只增强展示文本，不改变状态、action、快捷键或跨层接口。

## Phase313：最新分段标签阈值距离提示

最新 threshold-distance helper 只为阈值以下的 adaptive profile 返回正整数。control indicator、Help 和 Debug 复用结果；显式 profile、状态机、标签显隐判定和跨层协议保持不变。

## Phase314：最新分段标签宽度提示

最新 width helper 复用 resolver 的共享阈值并生成 `current/threshold`。该 helper 只增强 adaptive control indicator、Help 和 Debug 文本，不改变 profile、formatter、状态机或跨层协议。

## Phase315：最新分段标签宽度百分比提示

最新 percentage helper 委托共享算法，保持整数截断、最小 0 和最大 100 的规则。width helper 将其追加到 `current/threshold` 后；该变化不增加状态、action、快捷键或跨层接口。

## Phase316：最新分段标签宽度百分比分段

最新 bucket helper 委托共享算法，在百分比后追加 `L/M/H`。分段继续使用 0-39、40-79、80 以上边界；本阶段不增加文字标签，也不改变状态机或跨层协议。

## Phase317：最新分段标签宽度百分比分段标签

最新 label helper 委托共享映射，将分段组合为 `bucket(label)`。该变化只增强 width indicator、control indicator、Help 和 Debug 文本，不新增状态、action、快捷键或跨层接口。

## Phase318：最新分段标签控制

最新标签控制状态只存在于 `TuiState`，默认开启并在命令面板关闭、重开后保持。输入层仅在命令面板内将 `5` 映射为 toggle action；formatter、Help 和 Debug 读取同一状态，关闭时仅移除 `(low/mid/high)`。

## Phase319：最新分段标签配置档

最新标签状态使用三档 profile，默认 `shown`。输入层仅在命令面板内循环配置；resolver 以共享 120 列阈值解析 `adaptive`，父级 formatter、Help、Debug 和 control indicator 读取同一有效配置，状态保持为 TUI 本地边界。

## Phase320：最新分段标签阈值提示

最新 adaptive control indicator 直接复用 resolver 的共享 120 列常量并显示 `[120]`。显式 profile 不显示阈值；本阶段只增强展示文本，不改变状态、action、快捷键或跨层接口。

## Phase321：最新分段标签阈值距离提示

最新 threshold-distance helper 只为阈值以下的 adaptive profile 返回正整数。control indicator、Help 和 Debug 复用结果；显式 profile、状态机、标签显隐判定和跨层协议保持不变。

## Phase322：最新分段标签宽度提示

最新 width helper 复用 resolver 的共享阈值并生成 `current/threshold`。该 helper 只增强 adaptive control indicator、Help 和 Debug 文本，不改变 profile、formatter、状态机或跨层协议。

## Phase323：最新分段标签宽度百分比提示

最新 percentage helper 委托共享算法，保持整数截断、最小 0 和最大 100 的规则。width helper 将其追加到 `current/threshold` 后；该变化不增加状态、action、快捷键或跨层接口。

## Phase324：最新分段标签宽度百分比分段

最新 bucket helper 委托共享算法，在百分比后追加 `L/M/H`。分段继续使用 0-39、40-79、80 以上边界；本阶段不增加文字标签，也不改变状态机或跨层协议。

## Phase325：最新分段标签宽度百分比分段标签

最新 label helper 委托共享映射，将分段组合为 `bucket(label)`。该变化只增强 width indicator、control indicator、Help 和 Debug 文本，不新增状态、action、快捷键或跨层接口。

## Phase326：最新分段标签控制

最新标签控制状态只存在于 `TuiState`，默认开启并在命令面板关闭、重开后保持。输入层仅在命令面板内将 `4` 映射为 toggle action；formatter、Help 和 Debug 读取同一状态，关闭时仅移除 `(low/mid/high)`。

## Phase297：最新分段标签阈值距离提示

最新 threshold-distance helper 只为阈值以下 adaptive profile 返回正整数。control indicator、Help 和 Debug 复用结果；显式 profile、状态机、标签显隐判定和跨层协议保持不变。

## Phase298：最新分段标签宽度提示

最新 width helper 复用 resolver 的共享阈值并生成 `current/threshold`。该 helper 只增强 adaptive control indicator、Help 和 Debug 文本，不改变 profile、formatter、状态机或跨层协议。

## Phase299：最新分段标签宽度百分比提示

最新 percentage helper 委托共享算法，保持整数截断、最小 0 和最大 100 的规则。width helper 将其追加到 `current/threshold` 后；该变化不增加状态、action、快捷键或跨层接口。

## Phase300：最新分段标签宽度百分比分段

最新 bucket helper 委托共享算法，在百分比后追加 `L/M/H`。分段继续使用 0-39、40-79、80 以上边界；本阶段不增加文字标签，也不改变状态机或跨层协议。

## Phase301：最新分段标签宽度百分比分段标签

最新 label helper 委托共享映射，将分段组合为 `bucket(label)`。该变化只增强 width indicator、Help 和 Debug 文本，不新增状态、action、快捷键或跨层接口。

## Phase302：最新分段标签控制

最新标签控制状态只存在于 `TuiState`，默认开启并在命令面板关闭、重开后保持。输入层仅在命令面板内将 `7` 映射为 toggle action；formatter、Help 和 Debug 读取同一状态，关闭时仅移除 `(low/mid/high)`。

## Phase303：最新分段标签配置档

最新状态升级为三档 profile。`7` 在命令面板内循环配置，resolver 将 `adaptive` 按共享 120 列边界解析为 `shown/hidden`；formatter、Help、Debug 和 control indicator 复用该结果，不改变跨层协议。

## Phase304：最新分段标签阈值提示

最新 adaptive indicator 使用 resolver 同源的共享常量显示 `[120]`。该变化只增强 control indicator 文本，不新增状态、action、快捷键，也不改变标签显隐判定或跨层协议。

## Phase289：最新分段标签阈值距离提示

最新 threshold-distance helper 只为阈值以下 adaptive profile 返回正整数。control indicator、Help 和 Debug 复用结果；显式 profile、状态机、标签显隐判定和跨层协议保持不变。

## Phase290：最新分段标签宽度提示

最新 width helper 复用 resolver 的共享阈值并生成 `current/threshold`。该 helper 只增强 adaptive control indicator、Help 和 Debug 文本，不改变 profile、formatter、状态机或跨层协议。

## Phase291：最新分段标签宽度百分比提示

最新 width helper 复用既有 percentage helper，生成 `current/threshold=percentage%`。百分比沿用整数截断与 100% 封顶规则；该变化只增强 control indicator、Help 和 Debug 文本。

## Phase292：最新分段标签宽度百分比分段

最新 width helper 继续复用同层 bucket helper，在百分比后追加 `L/M/H`。分段沿用 0-39、40-79、80 以上的共享边界；该变化不增加文字标签、状态、action、快捷键或跨层接口。

## Phase293：最新分段标签宽度百分比分段标签

最新 width helper 复用同层 label helper，将分段组合为 `bucket(label)`。标签映射仍来自共享 helper；该变化不新增状态、action、快捷键、profile 解析或跨层接口。

## Phase294：最新分段标签控制

最新标签控制状态只存在于 `TuiState`，默认开启并在命令面板关闭、重开后保持。输入层仅在命令面板内将 `8` 映射为 toggle action；formatter、Help 和 Debug 读取同一状态，关闭时仅移除 `(low/mid/high)`。

## Phase295：最新分段标签配置档

最新状态升级为三档 profile。`8` 在命令面板内循环配置，resolver 将 `adaptive` 按共享 120 列边界解析为 `shown/hidden`；formatter、Help、Debug 和 control indicator 复用该结果，不改变跨层协议。

## Phase296：最新分段标签阈值提示

最新 adaptive indicator 使用 resolver 同源的共享常量显示 `[120]`。该变化只增强 control indicator 文本，不新增状态、action、快捷键，也不改变标签显隐判定或跨层协议。

## Phase327：最新分段标签配置档

最新快捷键 `4` 状态升级为 `shown/hidden/adaptive`。resolver 按共享 120 列阈值解析 adaptive；Help、Debug、受控 formatter 与父级 `5` indicator 统一消费解析结果，确保 119 列隐藏文字标签、120 列显示文字标签。状态仍只属于 TS Host TUI。

## Phase328：最新分段标签阈值提示

最新 adaptive control indicator 直接复用 resolver 的共享 120 列常量并追加 `[120]`。该变化只增强 Help 和 Debug 可观测文本，不新增状态、action、快捷键或跨层接口，也不改变有效 profile 的解析结果。

## Phase329：最新分段标签阈值距离提示

最新 threshold-distance helper 在 adaptive 且当前宽度低于 120 列时返回 `120 - maxWidth`，到达阈值或使用显式 profile 时返回 `null`。indicator、Help 和 Debug 共用结果，不新增状态、action、快捷键或跨层接口。

## Phase330：最新分段标签宽度提示

最新 width indicator helper 直接组合当前 `maxWidth` 与共享 120 列阈值。adaptive indicator、Help 和 Debug 统一展示 `[current/threshold]`；显式 profile 不附加宽度详情，且不新增状态、action、快捷键或跨层接口。

## Phase331：最新分段标签宽度百分比提示

最新 percentage helper 复用共享算法，将当前宽度相对 120 列阈值转换为 0-100 的整数百分比。width helper 组合为 `[current/threshold=percentage%]`，Help 和 Debug 复用该结果，不新增状态、action、快捷键或跨层接口。

## Phase332：最新分段标签宽度百分比分段

最新 bucket helper 复用共享分段算法，将百分比映射为 `L/M/H` 并组合进 width indicator。边界仍为 0-39、40-79、80 以上；Help 和 Debug 复用结果，不新增文字标签、状态、action、快捷键或跨层接口。

## Phase333：最新分段标签宽度百分比分段标签

最新 label helper 复用共享映射，将 bucket 组合为 `L(low)`、`M(mid)`、`H(high)`。width indicator、Help 和 Debug 统一消费结果，不新增状态、action、快捷键或跨层接口。

## Phase334：最新分段标签控制

最新标签控制状态只存在于 `TuiState`，默认开启并在命令面板关闭、重开后保持。输入层仅在命令面板内将 `3` 映射为 toggle action；formatter、Help 和 Debug 读取同一状态，关闭时仅移除 `(low/mid/high)`，面板外 `3` 的 live-session 关闭行为保持不变。

## Phase335：最新分段标签配置档

快捷键 `3` 状态升级为 `shown/hidden/adaptive`。resolver 按共享 120 列阈值解析 adaptive；Help、Debug、受控 formatter 与父级 `4` indicator 统一消费解析结果，确保 119 列隐藏文字标签、120 列显示文字标签。状态仍只属于 TS Host TUI。

## Phase336：最新分段标签阈值提示

最新 adaptive control indicator 直接复用 resolver 的共享 120 列常量并追加 `[120]`。该变化只增强 Help 和 Debug 可观测文本，不新增状态、action、快捷键或跨层接口，也不改变有效 profile 的解析结果。

## Phase337：最新分段标签阈值距离提示

最新 threshold-distance helper 在 adaptive 且当前宽度低于 120 列时返回 `120 - maxWidth`，到达阈值或使用显式 profile 时返回 `null`。indicator、Help 和 Debug 共用结果，不新增状态、action、快捷键或跨层接口。

## Phase338：最新分段标签宽度提示

最新 width indicator helper 直接组合当前 `maxWidth` 与共享 120 列阈值。adaptive indicator、Help 和 Debug 统一展示 `[current/threshold]`；显式 profile 不附加宽度详情，且不新增状态、action、快捷键或跨层接口。

## Phase339：最新分段标签宽度百分比提示

最新 percentage helper 复用共享算法，将当前宽度相对 120 列阈值转换为 0-100 的整数百分比。width helper 组合为 `[current/threshold=percentage%]`，Help 和 Debug 复用该结果，不新增状态、action、快捷键或跨层接口。

## Phase340：最新分段标签宽度百分比分段

最新 bucket helper 复用共享分段算法，将百分比映射为 `L/M/H` 并组合进 width indicator。边界仍为 0-39、40-79、80 以上；Help 和 Debug 复用结果，不新增文字标签、状态、action、快捷键或跨层接口。

## Phase341：最新分段标签宽度百分比分段标签

最新 label helper 复用共享映射，将 bucket 组合为 `L(low)`、`M(mid)`、`H(high)`。width indicator、Help 和 Debug 统一消费结果，不新增状态、action、快捷键或跨层接口。

## Phase342：最新分段标签宽度百分比分段标签显隐

最新文字标签显隐状态归 `TuiState` 所有，默认开启，且在命令面板关闭和重开后保持。输入层只在命令面板内把 `2` 映射为 toggle action；formatter 关闭标签时继续输出 `L/M/H`，Help、Debug 和父级 `3` indicator 展示同一 `on@2/off@2` 状态。面板外 `2` 的 pin 行为和跨层接口不变。

## Phase343：最新分段标签宽度百分比分段标签显隐配置档

快捷键 `2` 状态升级为默认 `shown` 的三态 profile，并按 `shown -> hidden -> adaptive -> shown` 循环。adaptive 在 119 列及以下解析为 hidden、120 列及以上解析为 shown；父级 formatter、Help、Debug 和子级 indicator 使用同一 resolver，确保展示与实际标签显隐一致。面板外 pin action 和跨层接口保持不变。

## Phase344：最新分段标签宽度百分比分段标签显隐阈值提示

adaptive 子级 indicator 直接从共享常量读取 120 列阈值并输出 `[120]`，119/120 列的有效 profile 仍分别为 hidden/shown。显式 profile、resolver、父级 formatter、状态归属和跨层接口保持不变。

## Phase345：最新分段标签宽度百分比分段标签显隐阈值距离提示

最新纯距离 helper 在 adaptive 且当前宽度低于 120 列时返回差值，到达阈值或使用显式 profile 时返回 `null`。子级 indicator、Help 和 Debug 复用结果，分别形成 `hidden+40`、`hidden+1` 或无距离的 `shown`，不新增状态、action、快捷键或跨层接口。

## Phase346：最新分段标签宽度百分比分段标签显隐宽度提示

最新 width helper 统一返回 `current/120`，保留超过阈值后的真实宽度。adaptive indicator、Help 和 Debug 共用结果；显式 profile、resolver、距离算法、状态归属和跨层接口均不改变。

## Phase347：最新分段标签宽度百分比分段标签显隐宽度百分比提示

最新 percentage helper 委托共享算法生成 0-100 的整数百分比，并由 width helper 组合为 `current/120=percentage%`。80、119、120、180 列分别为 66%、99%、100%、100%；Help、Debug 和 indicator 共用结果，不新增状态或跨层接口。

## Phase364：最新分段标签宽度百分比分段标签显隐宽度百分比分段标签显隐宽度百分比分段标签显隐宽度百分比分段

最新 bucket helper 委托共享算法将百分比映射为 `L/M/H`，并由 width helper 追加在百分比后。分段边界仍为 0-39、40-79、80 以上；F2 indicator、Help 和 Debug 共用结果，不新增文字标签、状态或跨层接口。

## Phase365：最新分段标签宽度百分比分段标签显隐宽度百分比分段标签显隐宽度百分比分段标签显隐宽度百分比分段标签

最新 label helper 复用共享算法将 `L/M/H` 映射为 `low/mid/high`，并由 width helper 组合为 `percentage%bucket(label)`。F2 indicator、Help 和 Debug 共用结果；不新增状态、action、快捷键、profile 或跨层接口。

## Phase366：TUI Help 溢出治理

`buildTuiHelpLines` 将命令面板帮助拆为稳定 section，并在提供 `maxWidth` 时按 ` | ` token 边界换行；超宽 indicator 使用快捷键优先的紧凑表达。`TuiState.helpScrollOffset` 只属于 TUI 本地展示状态，Up/Down 与 PageUp/PageDown 复用 `scroll_pane`。full、compact 和 active Help pane 统一通过 renderer helper clamp offset、切片内容并显示 `Help [start-end/total]`。命令执行、F2 profile、protocol、session 和 provider contract 均未改变。

## Phase367：TUI profile cycle registry 基础

`tuiProfileRegistry.ts` 提供与 `TuiState` 解耦的通用 cycle helper；`LIVE_SESSION_COMMAND_LATEST_PROFILE_CYCLE_REGISTRY` 声明 10 个 latest action 的 state field、values 和 fallback。reducer 在主 switch 前应用 registry，并继续使用命令面板 guard 与 `helpVisible: false` patch。既有 action union、输入映射、Help/Debug indicator 和跨层接口不变。

## Phase368：TUI profile cycle registry family migration

neighbor legend 9 个 action 与 deepest nested 7 个 action分别进入 family registry，再与 latest family 合并为 26 项统一 registry。主 legend profile 继续使用 `compact/full/adaptive`，其他迁移项继续使用 visibility 三态；reducer 仅保留 8 个尚未迁移的 cycle domain。

## Phase369：TUI enum cycle registry completion

通用 helper 泛化为 value cycle，同时保留 profile 命名兼容别名。剩余 page size、category、sort、ranking 和独立 profile 共 8 个 action并入统一 34 项 registry；category/sort 仍在 reducer 边界执行 visible command 派生重置，所有重复 cycle switch case 已移除。

## Phase370：TUI adaptive visibility formatter foundation

`tuiAdaptiveVisibility.ts` 提供纯 resolver、threshold distance 和 indicator formatter。具体 TUI 导出函数继续作为兼容 wrapper，并由 name、shortcut、threshold 与 width callback 注入具体表现；首批覆盖 deepest nested、latest deepest text 和 F2 latest width bucket label。

## Phase371：TUI adaptive visibility resolver migration

所有同构 shown/hidden resolver 与通用 threshold distance wrapper 已委托给共享 helper。neighbor legend 的 compact/full resolver 与 neighbor adaptive threshold distance 保持独立，避免把不同 profile domain 错误归一化。

## Phase372：TUI adaptive indicator formatter migration

全部 26 个 adaptive indicator wrapper 统一由 formatter 组合 name、profile、effective value、distance、width detail 和 shortcut。特殊 legend 注入 compact/full effective value，其余 wrapper 使用默认 shown/hidden 算法，公开函数与文本 contract 不变。

## Phase373：TUI width metrics formatter migration

`tuiWidthMetrics.ts` 统一宽度百分比、L/M/H 分段、low/mid/high 标签和完整 width 文本。长名称 wrapper 继续提供兼容接口，但 26 个 width indicator 不再重复模板字符串与标签显隐逻辑。

## Phase374：TUI width metrics accessor aliases

没有附加行为的 percentage、bucket、label wrapper 改为直接导出根函数别名。调用方继续使用原名称，TypeScript 签名由根函数推断；带参数、格式化或状态语义的 wrapper 不参与转换。

## Phase375：TUI command palette constants module

28 个不依赖状态或运行时逻辑的命令面板快捷键及宽度常量迁入 `tuiCommandPaletteConstants.ts`。新模块保持零依赖，`tuiState.ts` 负责内部消费和兼容重导出；profile、registry 和 reducer action 继续留在原有依赖边界内。

## Phase376：TUI type model module

51 个纯 type/interface 迁入 `tuiTypes.ts`，覆盖 pane、session、event、timeline、approval、state 和 reducer action。模块不产生运行时导出；`tuiState.ts` 以 type-only import 消费并兼容重导出，依赖运行时 command catalog 的分组接口继续留在状态模块。

## Phase377：TUI command catalog module

九项命令元数据和 group key、连续分组、邻组解析、邻组标签四个纯函数迁入 `tuiCommandCatalog.ts`。模块只 type-only 依赖共享类型层；state selector 和 reducer 通过导入使用同一实现，旧 `tuiState.js` 值与类型入口继续兼容。

## Phase378：TUI command selectors module

搜索归一化、可见命令过滤与排序、当前选择和 usage ranking 迁入 `tuiCommandSelectors.ts`。selector 接收最小 state 视图并保持无副作用；renderer、Debug、session 和 reducer 经由兼容 facade 使用同一派生逻辑。

## Phase379：TUI command actions module

command id 与 reducer action 的双向映射，以及 history、usage counts、pinned history 的纯更新迁入 `tuiCommandActions.ts`。模块只依赖共享类型协议；input 使用正向映射，reducer 使用反向映射和 bookkeeping helper。

## Phase380：TUI command palette subreducer

16 个非 registry command palette transition 迁入 `tuiCommandReducer.ts`。子 reducer 以 `TuiState | undefined` 区分 handled 与 unhandled；返回原 state 表示已处理但无变化。主 reducer 在来源统计和 cycle registry 后组合该子 reducer。

## Phase381：TUI live session subreducer

13 个 live session transition 迁入 `tuiLiveSessionReducer.ts`，14 个排序、过滤、归一化、事件选择、未读和索引 helper 迁入 `tuiLiveSessionState.ts`。主 reducer 继续编排 engine/event 跨域 action，但复用同一 helper 层。

## Phase382：TUI history/timeline subreducer

历史选择、激活、加载、数据设置、timeline 设置和 history/timeline 滚动迁入 `tuiHistoryReducer.ts`。`scroll_pane` 根据目标 pane 部分接管；events/live/help 等目标返回 `undefined` 并继续由主 reducer处理。

## Phase383：TUI shell/approval subreducer

pane 切换、events/live/help 滚动、Help/Debug、强制重绘和 approval modal 迁入 `tuiShellReducer.ts`。shell reducer 对 history/timeline scroll 返回 `undefined`，与前置 history reducer共同实现按 pane 分派。

## Phase384：TUI prompt/turn subreducer

status、prompt append/backspace/clear、submit、turn finished、cancel 和 exit 迁入 `tuiPromptReducer.ts`。模块复用 active live session status helper，并保持 approval/running/stopping/exit 门控；session-started 和 event-stream 仍由主 reducer编排。

## Phase385：TUI event-stream subreducer and composition

session-started、普通 event、assistant delta/finalize 和 error 迁入 `tuiEventReducer.ts`，event buffer 与 stream helper 同步迁移。`reduceTuiState` 不再包含 action switch，只保留 command 来源统计、cycle registry 和六个子 reducer 的有序组合。

## Phase386：TUI reducer composer module

组合流程迁入 `tuiReducer.ts` 的 `createTuiReducer(cycleRegistry)`。cycle registry 通过参数注入，组合模块不反向导入 facade；`tuiState.ts` 仅使用正式 registry 创建兼容 `reduceTuiState` 实例。

## Phase387：TUI cycle registries module

cycle values、profile arrays 与 registry composition 迁入 `tuiCycleRegistries.ts`。该模块仅 type-only 依赖共享 contract；`tuiState.ts` 只消费最终 34-action registry 并兼容重导出，不再拥有配置定义。

## Phase388：TUI state factory module

70 字段初始状态和 event 构造迁入 `tuiStateFactory.ts`。factory 保留 clock 注入并为每次调用创建独立集合；模块不依赖 facade，`tuiState.ts` 仅兼容重导出两个构造函数。

## Phase389：TUI neighbor adaptive foundation

neighbor visibility 限制、三档 threshold、距离、目标、进度、bucket 和 compact help 的 12 个基础 helper 迁入 `tuiNeighborAdaptive.ts`。长链 presentation wrapper 继续复用该模块，facade 不再拥有基础算法实现。

## Phase390：TUI neighbor legend presentation module

neighbor progress legend 从 profile resolution 到八层 visibility width indicator 的 48 个 helper/alias 整体迁入 `tuiNeighborLegendPresentation.ts`。模块组合通用 adaptive visibility 与 width metrics，不依赖 state facade；deepest/latest wrapper 通过少量直接导入继续复用。

## Phase391：TUI nested presentation module and pure state facade

剩余 deepest nested、latest deepest 和 F2 width 的 104 个 helper/alias 整体迁入 `tuiNestedPresentation.ts`，避免交叉复用形成横向模块循环。`tuiState.ts` 现在只有模块重导出和正式 reducer 实例，不再拥有状态、算法或 presentation 实现。

## Phase392：TUI facade dependency boundary

正式 reducer 实例迁入 `tuiConfiguredReducer.ts`，7 个生产 consumer 改为从 constants、types、selectors、factories 和 presentation 所有者模块直接导入。`tuiState.ts` 现在是 19 行 re-export-only compatibility facade，生产模块禁止反向消费它。

## Phase393：TUI module graph contract

测试从当前 31 个 `tui*.ts` source 实时解析 import/export 图，并通过 Tarjan SCC 检测循环。foundation 零依赖、presentation/reducer 隔离、configured reducer 精确依赖和 facade 单向聚合均成为自动化架构门禁。

## Phase394：TS Host batch tool API

Engine -> Host 新增 `execute_tools` request。Python scheduler 将 parallel-safe chunk 作为单个 batch 发送，Host 使用 `Promise.all` 并发调用既有 `ToolExecutor`，按请求顺序返回；serial-only wave、permission/audit/sandbox、turn cancellation 和 transcript/event schema 保持不变。

## Phase395：Batch tool capability negotiation

Bundled TS Host 在 initialize 时声明 `execute_tools: true`，Python Engine 将协商结果传入 turn scheduler。未声明 capability 的 Host 自动回退到 Phase82 bounded thread pool + 多个 `execute_tool`，避免新协议方法破坏旧 Host 兼容性。

## Phase396：Batch size negotiation

Host 同时声明 `execute_tools_max_batch_size: 4` 并在 parser 强制执行。Engine 将合法正整数 limit 注入 `ToolConcurrencyPolicy.max_parallel`，dependency graph 在发送前完成 wave/chunk 限制；非法或缺失值回退到 4。

## Phase397：Batch failure isolation

TS Host 在每个 batch executor promise 内建立独立错误边界。executor 抛异常或返回非法结果时，仅对应位置转换为 `tool_executor_failed`；其他结果、数组长度和请求顺序保持不变，单项 `execute_tool` 语义不变。

## Phase398：Batch tool call ID integrity

TurnEngine 在 batch plan、event 和 transcript 之前验证 `tool_call_id` 唯一性，防止自定义 adapter 绕过 provider normalizer。TS Host 在 `execute_tools` parser 再次执行唯一性检查，形成 model boundary 与 wire boundary 两层防线。

## Phase399：Tool action boundary validation

TurnEngine 统一验证单项和 batch 的非空 tool ID、非空工具名、batch ID 唯一性及 session catalog membership。TS Host single/batch parser 同步要求所有 request identifiers 非空，使自定义 adapter 与外部 Engine request 都无法绕过执行前身份约束。

## Phase400：Tool result schema boundary

TS `asToolExecutionResult` 完整校验 output/error/details shape，并由 single 与 batch Host handler 共用。Malformed serial result 停留在 RPC boundary；malformed batch slot 由 Phase397 error isolation 转换为 `tool_executor_failed`，不会污染其他结果。

## Phase401：Tool result null parity

Python parser 改为区分 optional 字段缺失和显式 null。`output`、`error`、`error.details` 存在时必须为 object，与 TS validator 完全一致；非法 details 不再被静默转换为缺失。

## Phase402：Tool result state invariant

TS 与 Python result validators 同时强制成功不得携带 error、失败必须携带 error。`ok` 现在可安全作为状态判别字段，同时 output 继续允许作为成功数据或失败 partial output。

## Phase403：Tool result construction invariant

TS result 类型升级为 discriminated union，Python result dataclass 增加 constructor invariant。状态一致性从 stdio parsing boundary 延伸到项目内部所有静态赋值和直接实例化路径。

## Phase404：Tool error construction invariant

Python ToolExecutionError dataclass 在实例化时验证 code/message/details；TS 导出 error asserting converter，并让内置 toolError factory 统一调用。错误 payload 在生成点而不是 stdio 消费点失败。

## Phase405：Tool result JSON safety

TS result/error validators 与 Python dataclass constructors 对 output/details 执行递归 JSON value 检查和 ancestor cycle detection。Result 在进入 stdio writer、event 或 transcript 前即可证明可稳定序列化。

## Phase406：Tool input JSON safety

TurnEngine adapter-independent validation 与 TS Host single/batch parsers 复用递归 JSON object contract。Tool input 在 transcript、event、scheduler request 和 executor 之前完成双边 transport-safety 检查。

## Phase407：Non-blank protocol text

TS `isNonBlankString` 统一 Host identity parser 和 error validator；Python TurnEngine/error dataclass 使用 strip-based check。纯空白 identity/error text 在生成或执行边界被拒绝，但合法原字符串不被隐式规范化。

## Phase408：Session-scoped tool cancellation

Host AbortController map 改用 JSON tuple `(session_id, turn_id)` key。Public cancel、Engine notification、single/batch tool handler 和 turn_finished cleanup 共享该 identity，消除多 session 同 turn ID 的交叉取消风险。

## Phase409：Pre-dispatch cancellation tombstone

Host abort 变为 get-or-create-and-abort，使早到 cancel 在 map 中留下 pre-aborted controller。晚到 tool request 复用该 signal；not_found response 回滚 tombstone，正常 turn_finished 负责生命周期清理。

## Phase410：Host pre-dispatch cancellation

Single/batch Host handlers 在 ToolExecutor 前检查复合 turn controller。Pre-aborted request 直接生成 tool_cancelled result，batch 保持 slot 数量/顺序且零 executor invocation；in-flight cancellation 继续通过 signal。

## Phase411：Batch slot cancellation gate

Batch async map callback 在每个 executor invocation 前再次检查 signal。中途取消只允许已启动 slots 继续，后续未 dispatch slots 直接生成 tool_cancelled，同时维持 batch result ordering。

## Phase412：Cancellation result precedence

Single/batch handlers 在 executor await 完成后、result validation/exception mapping 前再次检查 turn signal。已知 cancellation 覆盖 late success/error/throw，使 Engine 可见结果与 turn lifecycle 一致。

## Phase413：Turn controller lease cleanup

Host single/batch RPC 持有复合 turn request lease。turn_finished 会 abort 并在 in-flight count 非零时延迟清理；最后一个 finally release 原子删除 controller、计数和 finished marker。

## Phase414：Not-found lease cleanup

Public cancel 的 not_found branch 不再直接 delete controller，而是委托 finishTurn。无 lease 仍立即清理；有 lease 时保持 cancellation/finished state，等待 request finally release。

## Phase415：Finalized turn guard

Host 使用容量 1024 的 insertion-ordered finalized composite-key registry。Late cancel 不重建 active state；late tool lease 使用临时 aborted controller 并在 release 后清理，executor 不会被调用。

## Phase416：Event envelope boundary

TS protocol 层新增 `asGodCodeEventEnvelope`，验证封闭 event type、session/turn identity 和 JSON-safe payload。Host 只有在 converter 成功后才执行 finishTurn 和 typed listener emission。

## Phase417：Event payload schema boundary

`GodCodeEventEnvelope` 进一步成为以 event_type 判别的 payload union。Converter 逐类验证 session、assistant、tool、finish 与 error payload；headless、REPL 和 TUI 直接消费已收窄字段，TUI 的 tool/error 展示与 Python Engine 实际嵌套结构重新一致。

## Phase418：Engine event construction invariant

Python `GodCodeEventEnvelope.__post_init__` 在 Engine emitter 前强制 event type、identity、JSON safety 和逐类型 payload schema。`TurnResult` 同步增加 success/error/cancelled discriminated construction invariant，使 Engine 不能构造 Host 必然拒绝的 terminal event。

## Phase419：Cross-language event conformance corpus

Protocol 层新增版本化 JSON accept/reject corpus，由 TypeScript converter tests 与 Python constructor tests 同时消费。事件 schema 变更必须让两端对同一命名 case 保持一致判定；非 JSON 的 cycle/NaN 等语言特有边界继续留在各自测试。

## Phase420：Finalized event fan-out guard

Host 在完整 event validation 后使用 finalized `(session_id, turn_id)` registry 过滤晚到 turn-scoped events。首次 turn_finished 仍完成 cleanup 并 emit；late assistant/tool/error 和重复 terminal event 不再进入 TUI、headless 或 raw-event listeners。

## Phase421：Turn event sequence contract

Engine 为每个 turn 生成从 1 开始的单调 sequence，session_started 固定为 0。Host 使用 session+turn scoped last-seen map 抑制 active turn 的 duplicate/regression，允许 gap，并在 terminal lifecycle 回收 sequence state。

## Phase422：Protocol version lock

Current wire version 提升并 exact-lock 为 2.0。Host request preflight、Engine initialize pre-capability check 和 Host response confirmation 共同保证不兼容进程在 create_session/turn/event 前失败，Engine 不再回显任意请求版本。

## Phase423：Initialization state machine

Host 使用 uninitialized/initializing/initialized 状态封闭一次性握手和并发调用，Engine 使用 `_initialized` 阻止预握手业务 RPC 与 capability renegotiation。Stop/exit 清理 Host 状态，shutdown 始终保持 cleanup 可达。

## Phase424：Initialize response schema boundary

Host initialize RPC 先接收 unknown，再通过 `asInitializeResponse` 验证 JSON-safe engine metadata、唯一 tool catalog 和唯一 adapter list。只有 converter 与 exact version check 均成功才提交 initialized；malformed response 自动回滚到可重试状态。

## Phase425：Initialize request schema boundary

Host 在 capability merge 后用 `asInitializeRequest` 验证最终 wire payload；Engine 在 capability mutation 前验证 host_info name/version、capabilities object 和递归 JSON safety。Open capability keys 保留，但非法 shape 不再按默认 capability 静默接受。

## Phase426：Create session response schema and identity boundary

Host 将 create_session result 作为 unknown 接收，并用 `asCreateSessionResponse` 验证 non-blank session identity、exact created status 与递归 JSON safety。Converter 通过后还必须与原 request session_id 严格匹配，避免合法 response 被错误关联到另一 session。

## Phase427：Create session request schema boundary

Host 用 `asCreateSessionRequest` 对实际 wire request 执行 preflight；Engine 在任何 provider/session/event mutation 前重复验证完整 JSON safety、non-blank identity、唯一工具目录和严格 resume history union。Malformed request 在两端都无法进入 session state。

## Phase428：Submit turn response schema and identity boundary

Host 将 submit_turn result 作为 unknown 接收，并验证 non-blank session/turn identity、exact accepted status 与递归 JSON safety；随后将 response session_id 与原 request 严格关联，只有通过两层 gate 的 turn identity 才进入上层生命周期。

## Phase429：Submit turn request schema boundary

Host 用 `asSubmitTurnRequest` 验证最终 wire payload；Engine 将 prompt 与 known turn option parsing 前移到 begin_turn/thread 之前。Open option keys 继续允许 JSON-safe 扩展，但非法 role、identity、known option type 或 transport value 无法占用 active-turn state。

## Phase430：Cancel turn response schema and identity boundary

Host 先表达本地 cancellation intent，再将 cancel_turn result 作为 unknown 验证。Response status 和 session/turn 双 identity 全部成立后才允许 not_found 驱动 finishTurn；malformed 或错误关联结果不会删除 pre-cancel tombstone。

## Phase431：Cancel turn request schema boundary

Host 用 `asCancelTurnRequest` 在 abort/controller 创建前验证最终 wire payload；Engine 在 cancel_event 和 notification 前重复验证 JSON safety 与双 non-blank identity。Malformed request 在两端均无法产生 cancellation mutation。

## Phase432：Shutdown response schema boundary

Host 将 shutdown acknowledgement 作为 unknown 验证，要求 JSON-safe object 与 exact `shutting_down` status。显式 shutdown 暴露协议错误，而 stop orchestration 继续捕获所有 shutdown failure 并完成 child/peer cleanup。

## Phase433：Shutdown request schema boundary

Shutdown request 被建模为 exact empty JSON object。Host 用 `asShutdownRequest` 固定 wire shape；Engine 在 connection.stop 前验证 dict、JSON safety 和零字段，未声明 metadata 不再被静默忽略并触发停止。

## Phase434：Host tool response schema boundary

Python Engine 对 execute_tool(s) response 建立独立 ingress boundary。共享 ToolExecutionResult parser 验证完整 JSON safety 和 discriminated state；batch envelope 与每个 slot 全部先解析成功，随后才原子写入 scheduler results。

## Phase435：Host tool request construction boundary

ToolCall 构造点保证 non-blank identity 与 JSON-safe input；ToolScheduler 在 requester 前验证 session/turn scope、non-empty unique batch，并由集中 builders 构造和复核最终 execute_tool(s) payload。无效 Engine state 不再依赖 Host 拒绝。

## Phase436：Tool cancellation notification boundary

Engine 用 typed `CancelToolExecutionNotification` 构造 canonical payload；Host 用独立 converter 验证 whole-object JSON safety 和双 identity，再执行 finalized suppression/controller abort。Malformed notification 不进入 lifecycle state。

## Phase437：JSON-RPC error response boundary

TS 与 Python transport 统一要求 safe-integer code、non-blank message、JSON-safe data/extension 和 result/error exclusivity。Malformed error 在 TS 明确 reject pending并 emit protocol_error，在 Python 稳定映射为 -32603，不再执行宽松类型 coercion。

## Phase438：JSON-RPC success response boundary

GOD-code transport profile 将 success result 约束为 required JSON-safe object。TS 在 resolve pending 前验证并发出 protocol diagnostics；Python 通过 `parse_json_rpc_result` 拒绝缺失/primitive/array/coercible shape，统一映射 -32603。

## Phase439：JSON-RPC transport identity boundary

共享 transport profile 将 method 约束为 non-blank string，将 request/response ID 约束为正 JSON-safe integer。两端均在业务 dispatch 或 pending correlation 前验证 identity；TS 发出 protocol diagnostics，Python 保持 malformed ingress 静默丢弃。

## Phase440：JSON-RPC params boundary

共享 transport profile 将 request/notification params 约束为 required recursive JSON-safe object。egress 在 pending mutation 前 fail fast；ingress request 对 malformed params 返回 -32602，notification 则在业务 event/handler 分发前被抑制。

## Phase441：JSON-RPC message shape exclusivity

transport routing 禁止 request/notification 携带 result/error，也禁止 response 携带 method/params。合法 ID 的混合 request 返回 -32600；混合 notification 和 response 在进入 handler 或 pending correlation 前被抑制，同时保留非核心 extension 字段兼容性。

## Phase442：JSON-RPC handler response construction

双向 request handler 的 success/error 输出在写 wire 前通过 transport contract。非法 result 或异常 payload 统一构造为 JSON-safe -32603；TS 额外发出本地 protocol diagnostic，Python 避免 `json.dumps` 因 handler-owned value 中断连接循环。

## Phase443：JSON-RPC writer boundary

TS `send` 与 Python `_send_message` 现在是完整 outbound envelope 的最终 gate。writer 统一复核 version、message role、identity、params/result/error 与 recursive JSON safety；上游 construction guards 保持 fail-fast，writer 防止未来调用点绕过边界。

## Phase444：JSON-RPC reader resource boundary

双向 stdio reader 将单行 payload 限制为 1 MiB UTF-8 bytes。TS 对无换行超限输入切换到 delimiter discard mode；Python 使用 size-limited readline 和 bounded drain。超限行不进入 parser，丢弃后继续处理下一帧。

## Phase445：JSON-RPC outbound frame size boundary

writer 与 reader 共用 1 MiB UTF-8 payload limit。oversized request/notification 在 write 前失败并回滚 pending；oversized handler success/error 被转换为紧凑 -32603 response，避免远端静默丢弃后超时。

## Phase446：JSON-RPC pending request capacity

每个 transport requester 最多保留 256 个 pending request。overflow 在 ID/timer/waiter/write 前 fail fast；Python 将 capacity check、ID allocation 和 waiter insertion 放在同一 lock 临界区，避免并发 tool workers 超额 admission。

## Phase447：JSON-RPC request timeout boundary

request timeout 在 pending admission 前通过明确 runtime contract。TS 只接受 Node timer 安全范围内的正整数毫秒；Python 只接受对应范围内的有限秒数且拒绝 bool。非法值不再由 setTimeout/Queue.get 隐式解释。

## Phase448：JSON-RPC request ID exhaustion boundary

request ID allocator 在分配最后一个 positive safe integer 后进入 null/None terminal state。两端不再递增 unsafe integer 或依赖每次事后 validation；exhausted request 在 pending/write side effect 前稳定失败，且不会循环复用旧 ID。

## Phase449：JSON-RPC response lifecycle diagnostics

两端通过 512 项 settled history 区分 duplicate、late(timeout) 和 unexpected response ID。history 保持有界；Python 增加 optional diagnostic callback，并将 response pop/record/queue delivery 放在同一 pending lock 临界区，降低 timeout edge race。

## Phase450：JSON-RPC notification handler failure boundary

TS 将公共 notification observers 与 method-specific handlers 改为逐个 await/catch，失败只产生隔离 diagnostic，不形成 unhandled rejection或阻断后续 consumer。Python 补齐对称 notification registration/dispatch，并保持无 response 语义。

## Phase451：JSON-RPC protocol diagnostic isolation

TS 全部 protocol diagnostics 统一经 `emitProtocolError` snapshot dispatch。同步 throw 和 Promise rejection 都被隔离；reader recovery、request handler fallback、pending rejection/cleanup 和 lifecycle classification 不再受 diagnostic consumer 代码影响。

## Phase452：JSON-RPC close observer failure boundary

TS close transition 先完成 closed flag、timer cleanup、pending rejection/map clear，再通过隔离 dispatcher 调用 observers。同步/异步 observer failure 只产生 protocol diagnostic，不改变 close() 返回、后续 observers 或 repeated-close idempotence。

## Phase453：JSON-RPC async writer backpressure boundary

TS outbound frames 通过 callback/drain acknowledged `writeTail` 串行化。notify和response helpers await实际 write completion；write throw/callback/error/close failure关闭 peer并清理 pending，queued frames在closed gate停止。

## Phase454：JSON-RPC outbound queue capacity

TS writer 对 active 与 queued frames统一执行 256 frame / 4 MiB admission。检查发生在进入 `writeTail` 前；溢出只拒绝当前 send且不关闭 peer。每个 admitted frame在 Promise成功或失败 settlement时精确释放 frame/byte counters，request preflight失败沿既有 rollback路径清理 pending。

## Phase455：JSON-RPC transport listener lifecycle

TS peer将 readable data/end/close/error 与 writable close/error callbacks改为稳定可解除的 owned listeners。close transition先 detach并清空 partial reader state，再完成 pending cleanup和observer dispatch；post-close input不再进入 handler。idle writable close被永久 listener捕获，late stream error由不捕获 peer的模块级 guard处理。

## Phase456：JSON-RPC inbound request admission

TS async request dispatch增加 active ID set与256项上限。duplicate active ID回复 -32600且不重复执行handler；容量overflow回复 -32000且不关闭peer。admitted ID覆盖method lookup、handler和response settlement，并由finally统一释放。Python inbound handler为同步串行路径，无对应并发累积面。

## Phase457：JSON-RPC inbound notification admission

TS async notification dispatch增加256项active counter。overflow在公共observer和method handler之前被诊断并丢弃，不产生response也不关闭peer；admitted notification覆盖完整consumer chain并由finally释放。既有逐consumer failure isolation保持不变，Python同步reader无需并发admission。

## Phase458：JSON-RPC inbound frame capacity

TS reader在创建handleLine task前执行512 frame / 4 MiB in-flight admission。counter覆盖parse、route、consumer和response生命周期并在finally释放；overflow无法安全区分可drop notification与必须响应的request，因此产生diagnostic并terminal close。closed gate同时停止当前chunk remainder继续分发。

## Phase459：JSON-RPC queued request cancellation

TS request frame在serialized writer turn开始时重检对应ID是否仍在pending map。queue等待期间已timeout/settle的request以内部cancellation跳过Writable，不产生远端副作用；该rejection仍释放frame/byte容量但不触发terminal close，后续writer chain继续运行。已进入Writable的frame保持不可撤回和late-response诊断语义。

## Phase460：JSON-RPC notification registry snapshot

TS method notification registration改为copy-on-write，dispatch再显式复制当前handler数组。consumer membership在每条notification开始时冻结；处理中注册的新handler从下一条notification才可见，避免同一iterator被动态追加甚至自注册扩张。Python现有tuple snapshot保持对称行为。

## Phase461：JSON-RPC notification subscription lifecycle

两端method notification registration改为独立registration object并返回幂等unsubscribe closure。相同function的多次注册可按identity精确移除；当前dispatch snapshot继续完成，后续notification立即观察解除结果。Python新增handler lock保护copy-on-write mutation与snapshot，实际consumer调用保持锁外。

## Phase462：JSON-RPC request handler ownership

两端request registry改为method到registration object的single-owner映射，registration返回幂等unregister。cleanup仅在当前map identity仍属于自身时删除，因此stale owner不会误删replacement；dispatch捕获当前registration后锁外执行。Python register/unregister/lookup复用handler lock。

## Phase463：JSON-RPC handler registry close disposal

两端terminal lifecycle清空request/notification registries并拒绝新的registration，释放connection到业务handler closure的引用。旧cleanup handles在map清空后仍保持幂等。Python stop event check、registry write和stop-time clear共享handler lock，消除clear后late add竞态。

## Phase464：Python JSON-RPC stop pending rejection

Python stop在pending lock内snapshot/clear全部outbound correlations，并向每个waiter投递-32000 stopped response，使跨线程request立即结束而非等待timeout。request在同一lock内先检查stop event，再执行capacity和ID allocation。通用writer保持可用，以允许触发stop的shutdown inbound request完成response。

## Phase465：Python JSON-RPC reader exit terminalization

Python serve_forever以try/finally统一所有reader退出到幂等stop。stdin EOF正常返回，但先释放handler registries并唤醒pending requests；reader/dispatch异常在相同cleanup完成后继续传播原异常。该语义与TS readable end/close/error terminal close对齐。

## Phase466：Python JSON-RPC post-stop outbound gate

Python public request/notify通过 `_send_message(require_running=True)`在write lock内原子检查stop event和写入。stop设置event后经过write-lock barrier，保证返回前已开始write完成、未开始write被拒绝。内部response writer不设gate，保留shutdown handler先stop后发送最终ack的协议顺序。

## Phase467：JSON-RPC event listener close disposal

TS close在snapshot/invoke close observers后立即移除notification和close EventEmitter listeners。async close observers由隔离completion Promise统一等待，rejection仍向protocol_error listeners诊断；全部settle后再移除diagnostic listeners。closed peer不再长期持有observer closures。

## Phase468：JSON-RPC post-close observer gate

TS close改为遍历eventNames并清理除async diagnostic窗口外的所有events，覆盖custom/future events和once wrappers。JsonRpcPeer覆盖EventEmitter五种registration API，closed gate后统一抛错；open状态继续委托Node原语，removal/query APIs不受限制。

## Phase469：JSON-RPC terminal residual state disposal

两端terminal lifecycle清空bounded settled response history并将next request ID设为null/None，明确关闭后allocator不可恢复。Python同时释放optional protocol diagnostic callback closure。pending waiter wakeup仍使用terminal transition前snapshot的request IDs，TS async close diagnostics沿独立listener窗口完成。

## Phase470：JSON-RPC active write close abort

TS writeFrame将active fail callback注册到peer-owned abort set。close在closed gate和transport detach后主动reject active write，不等待Writable callback/drain/close；writeTail后续frames继续展开并命中closed gate。existing Promise settlement统一归还queue容量，迟到callback受settled gate隔离。

## Phase471：Python JSON-RPC writer failure terminalization

Python `_send_message`在write lock内捕获outfile write/flush exception，离锁后调用stop并重抛原错误，避免与stop write barrier死锁。running-gate stopped路径独立返回-32000。writer failure因此清理registries/residual state并唤醒所有其他pending waiters。

## Phase472：Python JSON-RPC terminal cause propagation

Python stop支持optional exception并由stop lock建立first-cause ownership。reader/dispatch和writer failure把真实cause传入stop；pending waiters及后续public request/notify统一获得该message与-32000，直接故障调用栈继续传播原exception。graceful stop保持generic message，后续stop不能覆盖首因。

## Phase473：TS JSON-RPC terminal cause propagation

TS peer新增first terminal Error register。first close保存provided或generic Error对象；pending、active/queued writer和全部post-close request/notify/handler/observer registration gates复用同一对象。repeated close保持首因，close observer仍接收原optional cause以维持graceful API。

## Phase474：Python JSON-RPC registration terminal cause

Python request/notification handler registration stopped gates改为JsonRpcRequestError(-32000)并读取first terminal cause field。reader/writer failure后的registration与pending/request/notify观察相同reason；graceful stop使用canonical generic message。gate仍位于handler lock内，ownership与cleanup handle语义不变。

## Phase475：Python JSON-RPC structured terminal error

Python terminal register从message升级为canonical JsonRpcRequestError。若first cause为结构化RPC error，code/message/data完整进入pending response和request/notify/两类registration gates；普通Exception仍规范化为-32000。first-cause stop lock和graceful generic语义保持。

## Phase476：Python JSON-RPC terminal error normalization

Python terminal normalization在提交canonical error前验证safe-integer code与递归JSON-safe data。非法code回退-32000，非法data被移除；合法data在首因提交、pending fan-out和每次post-stop exception复制时建立深快照，调用方不能通过后续mutation改变connection持有的终止语义。

## Phase477：Python JSON-RPC terminal admission precedence

Python request、notify和两类handler registration在参数验证前执行统一stopped gate。若connection已终止，非法method/params/timeout不再遮蔽canonical terminal cause；request仍在pending lock内保留第二次gate，notify仍由writer running gate覆盖validation后的并发stop窗口。

## Phase478：Python JSON-RPC outbound preparation terminal precedence

Python `_send_message(require_running=True)` 在outbound payload validation/encoding前执行terminal gate，并在准备抛出invalid或oversized错误前再次检查stop。已停止send和encoding期间发生的并发stop都优先返回canonical terminal cause，response/fallback等非running-required内部发送保持原有协议错误语义。

## Phase479：Python JSON-RPC outbound encoding failure containment

Python outbound serialization和UTF-8 byte measurement统一进入exception boundary。孤立surrogate或encoder failure被映射为 `JsonRpcRequestError(-32603, "JSON-RPC output encoding failed.")`，未写入frame时不terminalize connection；若encoding期间stop已提交，则统一gate仍优先返回canonical terminal cause。

## Phase480：Python JSON-RPC safe terminal data snapshot

Python terminal data快照不再依赖通用 `deepcopy`。clone boundary仅通过内建str/int/float/list/dict操作递归生成plain JSON values，避免执行自定义 `__deepcopy__`；normalization中的validation或snapshot异常会移除data而不阻断stop，pending和post-stop复制继续保持隔离。

## Phase481：Python JSON-RPC terminal metadata containment

Python structured terminal error的code和data读取分别进入failure-isolated extraction。code getter或规范化失败时回退-32000，data getter失败时省略data；int子类先通过 `int.__int__` 转为plain int再执行safe-range判断，避免自定义数值钩子影响stop lifecycle。

## Phase482：TS JSON-RPC outbound encoding failure containment

TS writer将 `JSON.stringify` exception转换为 `JsonRpcError(-32603, "JSON-RPC output encoding failed.")`并保留sanitized cause message。pre-write失败不占用queue capacity、不关闭peer且允许后续发送；若dynamic getter在encoding中关闭peer，catch boundary优先抛first terminal Error对象。

## Phase483：TS JSON-RPC handler error response preparation fallback

TS error-response sender将已通过首次handler error validation、但在writer二次validation或serialization阶段失效的dynamic data降级为固定handler contract error。两类pre-write failure先产生protocol diagnostic，再发送plain -32603 response；若peer已closed则不fallback，terminal cause继续传播。

## Phase484：Python JSON-RPC handler error safe snapshot

Python handler error builder自行读取JsonRpcRequestError code/data，隔离getter、类型、范围和JSON validation失败，并在返回前复制为plain JSON tree。call site不再预读异常metadata；合法动态容器只读取一次，失效data回退固定-32603，getter失败的code/data分别降级为-32000/省略。

## Phase485：Python JSON-RPC handler result safe snapshot

Python handler success result在首次JSON-object validation后立即通过内建tree clone转换为plain JsonObject。validation或snapshot异常统一视为handler contract failure并发送固定-32603；writer不再重复读取原始动态容器，因此错误码不随失败发生在validation、outbound check或encoding阶段而漂移。

## Phase486：TS JSON-RPC handler result safe snapshot

TS handler success result通过 `snapshotJsonObject` 在一次递归遍历中同时验证和复制。snapshot拒绝non-finite number、非plain object、cycle和读取异常，并输出plain object/array/scalar tree；writer只观察snapshot，invalid result统一进入既有handler contract -32603路径。

## Phase487：Python JSON-RPC outbound params safe snapshot

Python `require_json_rpc_params` 将validation和内建JSON tree clone合并为deep snapshot，并把inspection/snapshot异常统一映射-32602。request与notify不再丢弃返回值，而是把owned plain params交给pending payload和writer；terminal gate优先级及open-state method/timeout validation保持。

## Phase488：TS JSON-RPC outbound params safe snapshot

TS `requireJsonRpcParams` 返回Phase486 single-pass plain snapshot，request与notify使用snapshot构造payload。snapshot失败后若peer已closed则返回terminal Error，否则保持params validation error；snapshot成功后也重查closed，防止getter side effect让后续timeout validation遮蔽首因。

## Phase489：TS JSON snapshot prototype-key preservation

TS JSON tree snapshot不再使用普通property assignment写入对象键，而是通过 `Object.defineProperty` 创建enumerable writable configurable data property。own `__proto__`、`constructor`及nested同名键按JSON数据保留，不触发legacy prototype setter；snapshot输出仍保持Object.prototype并通过writer plain-object validation。

## Phase490：TS JSON-RPC notification payload consumer isolation

TS notification dispatch在任何callback执行前冻结observer/handler registries，并从canonical plain params为每个consumer预生成独立deep snapshot。observer与method handler仍按既有顺序await和failure isolation执行，但任一consumer的顶层、nested或prototype-like key mutation都不影响其他consumer。

## Phase491：Python JSON-RPC notification payload consumer isolation

Python notification dispatch先冻结method handler registrations，再从inbound params建立canonical plain snapshot，并在首个handler执行前为全部registrations预生成独立deep snapshot。handler仍按注册顺序执行并保持failure isolation；任一handler修改顶层或nested值不会改变其他handler输入，snapshot失败则在任何handler side effect前统一诊断并放弃该notification。

## Phase492：TS JSON-RPC protocol diagnostic observer isolation

TS `protocol_error` dispatch先冻结observer列表并预生成独立Error snapshots，再开始同步callback。generic Error保留name/message/stack，JsonRpcError额外保留code并为每个observer深复制JSON-safe data；observer对message、stack或nested data的修改不再污染其他observer，也不能回写pending rejection使用的原始控制流Error。

## Phase493：TS JSON-RPC close observer Error isolation

TS `close` dispatch复用Error snapshot boundary：先冻结close observer列表，并在首个callback前为每个observer生成独立terminal Error副本。close observer仍接收显式传入的close cause，未提供cause时仍接收undefined；但任何observer对message或structured data的修改都不会改变其他observer、pending rejection、terminalError identity或post-close API first-cause。

## Phase494：Python JSON-RPC inbound response safe snapshot ownership

Python response settlement在移除pending entry和唤醒waiter前，把完整response复制为owned plain JSON tree；success parser再次为request caller深复制result，error parser则先snapshot完整error object再构造JsonRpcRequestError。动态dict只在snapshot validation边界读取一次，source nested mutation不再穿透settlement queue或public返回值。

## Phase495：TS JSON-RPC inbound response safe snapshot ownership

TS response settlement不再直接resolve原始result或把原始error.data交给JsonRpcError。success与error payload都先通过single-pass JSON tree snapshot materialize为plain owned object，再进行contract validation和pending settlement；动态getter只在snapshot阶段读取一次，snapshot失败稳定进入现有invalid response -32603边界。

## Phase496：Host tool approval unavailable audit completeness

HostToolRegistry不再为缺失approval prompt维护独立的早退拒绝分支。所有policy `prompt` decisions都调用统一 `requestApproval`，并始终记录 `tool_approval`；未配置prompt或prompt调用异常被规范化为 `action=deny, source=unavailable`，随后使用同一permission_denied和tool_finished路径结束，审计事件顺序固定为requested、decision、approval、finished。

## Phase497：Host tool post-policy failure committed-result preservation

PermissionPolicy `afterExecute`被明确视为post-execution observation boundary。异常不再用新的policy_error失败覆盖handler已产生的success或domain error；registry保留原始 `ok/error/output`，并在output附加包含code、message、phase和tool_name的 `policy_warning`。最终tool_finished audit记录同一增强结果，调用方因此可以区分工具事实与policy observer故障。

## Phase498：Host tool opt-in JSONL audit persistence

生产Host setup现在通过 `createConfiguredAuditSink` 解析显式 `GOD_CODE_AUDIT_FILE`。未配置时继续使用NoopAuditSink；配置后使用JsonlAuditSink按调用顺序追加 `{recorded_at,event}` envelope，并以0700目录、0600新文件模式减少本地泄露。嵌入方也可通过PrepareGodCodeHostOptions直接注入AuditSink覆盖环境配置。

## Phase499：Host tool audit failure caller visibility

HostToolRegistry仍采用best-effort audit，不让sink故障改写工具success/domain error或制造重复副作用；但record failure不再静默丢失。每次失败被规范化为 `{code:"audit_error", event_type, message}`，按事件顺序累积到最终 `output.audit_warnings`。所有提前拒绝、policy failure、approval、cancellation和正常执行分支复用统一finish boundary，tool_finished写入失败也会追加到caller result。

## Phase500：Host tool bounded JSONL audit rotation

JsonlAuditSink现在默认限制当前generation为10 MiB，并在下一条record将超过上限时，把当前文件替换轮换为 `<audit>.1` 后创建新current generation。`GOD_CODE_AUDIT_MAX_BYTES`允许显式positive safe integer覆盖；单条record自身超过上限时拒绝写入，由Phase499转换为caller-visible audit_warning，工具事实保持。

## Phase501：Host tool JSONL audit no-follow path enforcement

JsonlAuditSink在mkdir前后检查所有已存在path components，拒绝父目录或target symlink、非目录parent、非regular target及multi-link file。最终append通过O_NOFOLLOW open并对opened handle执行regular-file/nlink校验；rotation同样使用lstat。稳定的workspace symlink/hard-link fixture因此不能把audit内容追加到配置路径之外，拒绝结果继续由Phase499向caller报告。

## Phase502：Host tool JSONL audit private file mode enforcement

JsonlAuditSink不再只依赖create-time `0600` mode。POSIX平台上，既有current generation会在容量判断和rotation之前通过no-follow opened descriptor执行`fchmod(0600)`；最终append descriptor也在write前重复收敛权限。由此新建文件、继续使用的既有文件以及rename得到的 `.1` generation都保持owner-only。Windows继续依赖ACL，不把POSIX mode位当作等价安全边界。

## Phase503：Host tool JSONL audit preparation failure promise containment

JsonlAuditSink继续在`record()`调用时同步形成immutable JSON line snapshot，但时间戳生成、`JSON.stringify`和UTF-8 byte计算现在由显式preparation boundary包裹。任何同步异常都会转换为rejected Promise，而不是逃逸出声明为`Promise<void>`的AuditSink接口。Preparation failure不写入write tail，也不会毒化其recovery chain；下一条合法事件仍按既有serialized append路径写入。

## Phase504：Host tool JSONL audit structured secret redaction

`prepareAuditLine`使用JSON replacer递归处理request、context、decision、approval和result中的structured fields。Key先lowercase并移除非字母数字字符，再按authorization/password/passwd/secret/token/api-key/private-key/cookie后缀匹配；命中值持久化为`[REDACTED]`。序列化只生成独立line，不修改MemoryAuditSink看到的事件或调用方对象。自由文本command/output仍不可可靠分类，继续按敏感日志保护。

## Phase505：Host tool JSONL audit descriptor-safe pre-redaction snapshot

JsonlAuditSink不再依赖JSON.stringify replacer读取原事件。Snapshot walker只接受array和plain/null-prototype object，使用own property descriptor遍历；敏感key直接写marker而不读取descriptor value，普通data property递归复制，非敏感accessor、BigInt、cycle和custom container安全拒绝。非enumerable `toJSON`不会进入snapshot，因此无法在replacer之前重排secret；`__proto__`等prototype-like key继续通过defineProperty保留为普通own property。

## Phase506：Host tool JSONL audit bounded snapshot preparation

Descriptor snapshot现在携带显式resource state：最大depth为64，最大node/slot预算为100000。每个递归value、sensitive redaction slot和sparse array slot均消费预算，避免通过宽数组、宽对象或大量敏感key绕过计数。String value及object key在复制时先计算UTF-8 bytes；单项已超过sink maxBytes时直接沿Phase500容量错误拒绝，不再先构造更大的JSON line。所有failure仍沿Phase503 Promise契约恢复。

## Phase507：Host tool JSONL audit path identity and in-process coordination

JsonlAuditSink构造时立即把输入path解析为absolute `filePath`，后续path checks、mkdir、rotation和append不再受process cwd变化影响。同模块维护按absolute path索引的shared Promise tail；任意sink实例提交同一target时都接在前一write之后，failure通过catch recovery隔离，最终pending write完成后条件删除map entry。不同target保持并行，跨进程writer仍不在该协调边界内。

## Phase508：Host tool JSONL audit constructor invariant validation

JsonlAuditSink constructor现在在任何path resolution或writer登记前拒绝empty/whitespace path，并通过共享`validateJsonlAuditMaxBytes`要求maxBytes为positive safe integer。`NaN`、Infinity、fraction、zero、negative和超过`Number.MAX_SAFE_INTEGER`的值无法形成实例。Config parser继续负责string grammar，再复用同一numeric validator并保留环境变量专用错误文本；直接注入与生产setup因此拥有一致capacity不变量。

## Phase509：Host tool JSONL audit configurable redaction key extensions

JsonlAuditSink constructor新增additional sensitive suffix list，config通过`GOD_CODE_AUDIT_REDACT_KEYS` comma list接入。Custom suffix与默认集合合并而不是替换，统一执行lowercase/separator removal、dedupe、最多64项和每项最多128个normalized字符校验。Snapshot state持有最终suffix集合并继续在读取descriptor value前匹配；自定义`credential`或`access_key`因此获得与内建password/token相同的getter-safe redaction语义。

## Phase510：Host tool audit configuration inspection diagnostics

新增pure `inspectAuditConfig(environ,cwd)`，输出enabled、resolved file path、max bytes、single rotation generation、process coordination scope、default redaction状态和normalized custom suffixes。Disabled且无辅助设置为ok；仅配置max/redaction而未设置file时warn ignored；enabled invalid config为error且不回显原始值。CLI提供human/JSON renderer，doctor复用同一report并在error时显式skip Host setup，所有inspection均不创建目录或文件。

## Phase511：Host tool audit path readiness inspection diagnostics

Runtime path gate现在通过exported `inspectJsonlAuditPath`形成结构化结果，sink的`assertSafeAuditPath`直接复用该函数。Inspector逐component lstat并拒绝symlink、non-directory parent、non-regular或multi-link target，同时报告missing path chain、nearest existing directory和existing target mode。CLI `audit inspect-path`在有效配置上额外执行nearest directory W_OK检查；broad POSIX target mode为warn且不chmod，所有path error为error，disabled为warn/skipped。

## Phase512：Host tool audit target append readiness diagnostics

`inspectAuditPath`现在对nearest existing directory和existing target分别执行W_OK access probe。Directory可写用于missing component creation和rotation；target可写用于当前generation O_WRONLY append/mode convergence，两者不是同一权限。Report新增optional `target_writable`；existing target false时即使directory true也返回error。Access function可注入测试以稳定模拟EACCES，生产默认仍使用`fs.access`，inspection保持no-mutation。

## Phase513：Host tool audit rotated generation readiness inspection

新增`inspectJsonlAuditRotationPath`以lstat分类`<audit>.1`为regular_file、symbolic_link、directory或other。Directory不可由现有non-recursive force rm替换，runtime在rm前稳定拒绝；其他entry可在parent目录中unlink而不跟随。`inspect-path`输出rotation path/existence/type/replaceable，directory为error，symlink/other为warn，并保持entry与link target不变。

## Phase514：Host tool audit current-generation capacity readiness diagnostics

共享`inspectJsonlAuditPath`现在同时返回existing target的lstat size。CLI结合已验证的`max_bytes`输出current generation bytes、clamped remaining capacity、over-capacity状态与`rotation_expected_on_next_record`。Current size大于或等于capacity且非空时返回readiness warning；检查不读取内容、不执行rotation，也不预测未知下一条record是否会在尚有空间时越界。

## Phase515：Host tool audit shared capacity decision parity

新增纯函数`evaluateJsonlAuditCapacity(currentBytes,nextRecordBytes,maxBytes)`，统一验证byte-count invariants并返回recordFits、rotationRequired、remainingBytes和overCapacity。Runtime用它拒绝oversized record并决定是否rotation；CLI以最小一字节next record调用同一函数，得到Phase514的deterministic next-record状态。Rotation比较改用`current > max-next`，避免`current+next`在safe-integer上界附近溢出。

## Phase516：Host tool audit current-generation inspection parity

`rotateIfNeeded`不再自行lstat并复制symlink、regular-file和single-link判断，而是调用`inspectJsonlAuditPath`取得target existence与size。Existing target随后仍通过no-follow descriptor执行mode normalization；若target在inspection和open之间被删除，runtime把current size收敛为0并允许最终append重新创建。CLI readiness、pre-mkdir path gate和rotation现在共享同一个current-generation metadata/safety contract。

## Phase517：Host tool audit descriptor identity binding

Shared path inspection现在记录current target的device/inode identity。Rotation的no-follow mode-normalization descriptor返回fstat identity与size；path identity和descriptor identity不一致时，在检查或删除`.1`之前抛出稳定replacement error。Capacity使用descriptor size而非更早的path lstat size，缩小inspection-open之间的size陈旧窗口；open后到rename之间仍依赖受信任parent ownership边界。

## Phase518：Host tool audit final append expectation binding

`rotateIfNeeded`现在返回append expectation：未rotation的existing generation携带Phase517 descriptor identity；missing或完成rotation后要求current path仍不存在。Final append对existing路径不再使用O_CREAT并再次比较fstat identity；missing路径使用`O_CREAT|O_EXCL`原子创建。Replacement、disappearance或unexpected appearance均在write前转为稳定错误，防止把audit record静默追加到准备阶段未认可的文件。

## Phase519：Host tool audit final descriptor capacity revalidation

Final append在identity/type/link-count验证后、write前，用该descriptor最新fstat size、prepared lineBytes和maxBytes再次调用Phase515 shared capacity decision。若same-inode在rotation preparation后增长并使本次record需要rotation，则抛出`Audit file capacity changed before append.`，不写入record也不创建`.1`。Missing/exclusive-created current从size 0进入同一检查，保持单条record fit invariant。

## Phase520：Host tool audit configurable append durability

JsonlAuditSink新增validated durability policy：buffered保持write后close，data在每条record后调用FileHandle.datasync，full调用FileHandle.sync。`GOD_CODE_AUDIT_DURABILITY`默认buffered并由createConfiguredAuditSink与audit inspect-config共享parser；disabled audit下该辅助设置按既有规则报告ignored。Sync发生在write成功后、descriptor close前，failure使record Promise拒绝但不能回滚已经进入page cache的record。

## Phase521：Host tool audit full-durability parent metadata sync

Full policy在POSIX上对missing expectation增加parent directory fsync：final current file先fsync，再以O_RDONLY/O_DIRECTORY/O_NOFOLLOW打开parent、验证directory descriptor并sync。该路径覆盖首次create、inspection后delete/recreate和rotation后的rename/delete/create最终目录状态；existing append没有directory metadata变化，只执行file fsync。Windows缺少同等portable directory-handle sync，保持file-only full边界并显式文档化。

## Phase522：Host tool audit parent-directory identity binding

`inspectJsonlAuditPath`现在记录nearest existing directory的device/inode identity；runtime在mkdir后执行时，该目录就是immediate parent。Missing append expectation携带parent identity，POSIX full directory descriptor通过type gate后还必须匹配dev/ino，否则抛出`Audit parent directory changed before metadata sync.`并跳过sync。该绑定避免parent path在write后被安全directory替换时错误确认metadata durability。

## Phase523：Host tool audit pre-append parent identity revalidation

Missing expectation在final O_EXCL open前调用`assertAuditParentDirectoryIdentity`，lstat immediate parent并要求真实directory与expected dev/ino一致。Mismatch或ENOENT统一抛出`Audit parent directory changed before append.`，因此buffered/data/full都不会在稳定替换后的parent中创建current或写入record。Phase522的post-write full directory descriptor binding继续保留，用于捕获pre-check之后的后续replacement。

## Phase524：Host tool audit post-create parent identity revalidation

Missing expectation的exclusive open成功并通过new current descriptor type/link-count验证后，再次调用parent identity helper，错误为`Audit parent directory changed before record write.`。该gate位于capacity、chmod、write和durability之前，捕获Phase523 pre-check与O_EXCL create之间的parent replacement；失败时created descriptor被关闭，最多在原目录留下0600 empty file，不持久化audit record。

## Phase525：Host tool audit pre-write current path identity revalidation

Final append从validated descriptor取得dev/ino，并在mode convergence后、record write前对current path执行no-follow lstat。Path必须仍是single-link regular file且identity与descriptor一致；existing和exclusive-created current若在open后被rename、replacement或删除，都会以`Audit file changed before record write.`拒绝。该gate不改变已经打开descriptor，但避免pipeline在可观察path已经漂移时继续把record写入移走对象。

## Phase526：Host tool audit post-write current path identity revalidation

Final append在record write及配置的data/full durability步骤完成后，再次以同一descriptor identity验证current path。Existing和missing current若在pre-write gate之后发生rename、replacement、disappearance或link-state漂移，会以`Audit file changed after record write.`拒绝成功返回。该错误明确表示record bytes可能已持久化到移走对象，不能按pre-write failure理解为无副作用。

## Phase527：Host tool audit cooperative cross-process coordination lock

Record preparation后、rotation transaction前，JsonlAuditSink以absolute audit path的SHA-256和same-user scope派生稳定temp lock directory。Atomic mkdir成功者持有锁；竞争writer按10ms interval最多等待5秒。锁覆盖locked path revalidation、capacity、rotation、append和durability，并在finally释放；transaction首因不会被并发release failure覆盖。进程内shared Promise tail继续减少本地竞争，CLI把scope、lock path、timeout和retry公开为read-only diagnostics。

## Phase528：Host tool audit lock readiness inspection

Shared `inspectJsonlAuditFileLock`对derived temp lock path执行lstat，不跟随symlink并返回existence、entry type、snapshot acquirable和non-negative age。`audit inspect-path`把absent lock视为ready；真实directory holder为warn；regular file、symlink或other blocker为error并保持原entry不变。Age只用于观测，不证明holder stale，也不触发删除、PID probing或lock acquisition。

## Phase529：Host tool audit lock owner metadata and release identity binding

Atomic mkdir成功后，runtime以O_EXCL/no-follow创建0600 `owner.json`，记录schema version、UUID owner token、PID和canonical acquired timestamp，最大读取预算4096 bytes。Release要求lock directory仍匹配acquisition dev/ino、owner metadata仍valid且token一致、目录只包含owner file，随后才unlink/rmdir。CLI展示metadata valid/missing/invalid、PID和时间但不展示token；PID与age都不被解释为liveness或cleanup授权。

## Phase530：Host tool audit guarded residual lock cleanup

`audit cleanup-lock`默认执行只读dry-run，只在valid单一owner lock上投影32字符domain-separated SHA-256 fingerprint。Mutation必须同时提供`--yes`和exact `--expect-owner`；底层再次绑定lock directory dev/ino、owner file dev/ino与完整token，然后把candidate rename到同一temp filesystem内的0700 private quarantine。Owner file先从quarantined directory隔离，目录identity与empty invariant再次成立后才rmdir；提交前竞态执行best-effort identity-aware restore，无法恢复时保留quarantine而不递归删除未知对象。该命令明确不验证PID liveness，并可能中断仍活跃的cooperative writer。

## Phase531：Host tool audit bounded lock quarantine inspection

`audit inspect-lock-quarantines`只扫描当前configured audit path派生的exact quarantine prefix，并要求suffix恰为六个ASCII alphanumeric字符。Scanner最多读取4096个temp entries、返回128个匹配项；truncation显式进入report。Directory candidate按`owner_only`、`lock_with_owner`、`lock_and_owner`、`empty`或`unknown`分类，对root与nested lock分别执行lstat、entry-set读取、bounded owner metadata inspection及最终dev/ino/content revalidation。CLI只投影fingerprint、PID和canonical time；任何residue或uncertain state返回warning，但命令不恢复、rename或删除对象。

## Phase532：Host tool audit guarded owner-only quarantine cleanup

`audit cleanup-lock-quarantine <id>`只接受Phase531输出的六字符ID，并重新派生当前audit path prefix。Dry-run仅对valid `owner_only` root owner输出fingerprint；mutation必须有`--yes --expect-owner`。底层在同ID directory仍占位时把owner file隔离到0700 disposal root，重验moved owner identity/token和原directory dev/ino/empty invariant后才rmdir。提交前extra entry不会被删除；只要directory identity仍匹配，owner会恢复并留下unknown residue供Phase531诊断。Pre-commit、empty、unknown、invalid或non-directory状态全部拒绝。

## Phase533：Host tool audit guarded pre-commit quarantine recovery

`audit recover-lock-quarantine <id>`只接受Phase531分类为valid `lock_with_owner`或`lock_and_owner`的六字符ID。Dry-run输出layout-selected owner fingerprint和当前coordination lock acquirable snapshot；mutation要求`--yes --expect-owner`且derived lock path必须不存在。底层以atomic mkdir创建0700 reservation，绑定新lock directory、quarantine root、nested lock和owner file dev/ino后把owner rename到标准lock path。提交前失败先恢复owner到原layout，再只删除same-identity空reservation；未知extra entry保留并通过`residual_lock_path`报告。提交后旧quarantine清理失败通过`residual_quarantine_path`warning暴露，恢复出的lock必须另行使用Phase530命令确认删除。

## Phase534：Host tool audit bounded lock disposal inspection

`audit inspect-lock-disposals`只读扫描当前audit path派生的`<lock>.cleanup-<qid>.dispose-<did>` namespace，qid与did都必须是六字符ASCII alphanumeric。Scanner固定4096-entry scan和128-result output预算，对directory disposal绑定root dev/ino与entry set并分类为`owner_only`、`empty`或`unknown`；non-directory entry只lstat分类。每项还复用Phase531 direct inspection关联source quarantine existence/layout/state。CLI只投影valid exact owner-only disposal的fingerprint、PID和time，不输出token；source absence、age和metadata都不授予mutation能力。

## Phase535：Host tool audit guarded owner-only disposal cleanup

`audit cleanup-lock-disposal <qid> <did>`只接受Phase534分类为valid `owner_only`且source quarantine absent的selected disposal。Dry-run输出owner fingerprint；mutation要求`--yes --expect-owner`。底层在unlink前重新绑定disposal directory dev/ino、owner file dev/ino、token、single-entry invariant和source absence；owner unlink是提交点，不创建新的递归purge namespace。提交后若source重新出现、extra entry出现、directory replacement或rmdir失败，owner保持已删除并通过`residual_disposal_path`warning暴露，未知entry不删除。Active coordination lock始终不参与该事务。

## Phase536：Host tool audit guarded empty disposal cleanup

`audit cleanup-empty-lock-disposal <qid> <did>`只接受Phase534分类为source-absent exact `empty`的selected disposal。Dry-run输出由absolute path、BigInt dev/inode/ctimeNs/birthtimeNs派生的32字符directory fingerprint；mutation使用独立`--expect-disposal`而不是owner authority。底层在rmdir前重新验证source absence、same directory identity、fingerprint和empty invariant；任何extra entry、replacement或source race都拒绝删除。成功rmdir是唯一commit，不创建新namespace，也没有post-commit partial state。

## Phase537：Host tool audit targeted lock disposal inspection

`audit inspect-lock-disposal <qid> <did>`面向已经从residual报告或外部记录获得exact ID的operator。CLI只接受两个六字符ASCII alphanumeric ID，runtime从当前configured audit path重新派生selected disposal与source quarantine path，直接复用Phase534单项inspector和共享entry projection，不执行temp directory枚举。Missing返回`exists: false`与`ok`；existing返回manual-review warning；unknown、non-directory、state drift、invalid owner或uncertain source追加uncertain-state warning。Command保持no-follow、read-only和non-secret，不生成cleanup token，也不改变4096/128 bounded scanner预算。

## Phase538：Host tool audit targeted lock quarantine inspection

`audit inspect-lock-quarantine <qid>`为已知quarantine ID提供scan-independent只读验证。CLI只接受一个六字符ASCII alphanumeric ID，runtime从当前configured audit path重新派生`<lock>.cleanup-<qid>`并复用Phase531 single-entry inspector。Bounded list与direct command共享entry mapper和uncertainty predicate，因此owner-only、pre-commit、empty、unknown、non-directory、owner status、fingerprint与state drift字段保持一致。Missing返回`exists: false`与`ok`；existing返回manual-review warning；uncertain state追加warning。Command不枚举temp namespace、不输出owner token，也不执行cleanup或recovery。

## Phase539：Host tool audit guarded empty quarantine cleanup

`audit cleanup-empty-lock-quarantine <qid>`只接受Phase531/538分类为stable exact `empty`的selected quarantine。List/direct inspection为该layout输出独立empty-quarantine fingerprint；dry-run默认不修改entry，mutation要求`--yes --expect-quarantine`。底层保持no-follow directory descriptor open，把current path与BigInt dev/inode/ctimeNs/birthtimeNs identity、fingerprint和empty invariant重新绑定后只执行rmdir。Descriptor pinning防止快速replacement复用inode/timestamp，并同步加固Phase536 empty disposal cleanup；owner-only、pre-commit、unknown和non-directory状态没有删除语义。

## Phase540：Host tool audit owner cleanup directory descriptor binding

Phase540把open-directory descriptor pinning推广到Phase530、Phase532和Phase535共享owner cleanup candidate。初始selection完整绑定path lstat与descriptor fstat；事务期间持续打开no-follow `O_DIRECTORY` handle，并在每次mutation gate要求current path与该descriptor指向同一directory object。Main lock handle跨quarantine rename和rollback，owner-only quarantine handle跨owner isolation，owner-only disposal handle跨owner unlink与residual return；所有路径在top-level `finally`关闭。Directory ctime可因事务自身的rename/unlink合法变化，因此对象连续性以仍被open handle固定的device/inode为锚点，同时每次检查要求当前path与descriptor snapshot完整一致。CLI、fingerprint、eligibility和report contract不变，Phase533 recovery不在本阶段修改。

## Phase541：Host tool audit quarantine recovery directory descriptor binding

Phase541把相同descriptor transaction model接入Phase533 recovery。Candidate selection分别pin quarantine root与nested `lock`；atomic mkdir reservation成功后立即pin recovered-lock directory。三个handles跨owner transfer、pre-commit rollback、post-commit old-quarantine contraction和result construction保持open，并在top-level `finally`关闭。Root/nested/recovered-lock path每次都必须与对应descriptor的current BigInt snapshot一致；事务自身导致的ctime变化不解除device/inode对象绑定。Rollback只rmdir descriptor-bound exact-empty reservation，path missing还需descriptor证明原directory已unlinked。Copied-layout或copied-owner replacement因此被拒绝，CLI、eligible layout、owner fingerprint、commit point和residual report保持Phase533 contract。

## Phase542：Host tool audit owner metadata file descriptor binding

Phase542为`owner.json`建立shared pinned regular-file reader。每个snapshot同时绑定current path、固定descriptor的BigInt device/inode/ctimeNs/birthtimeNs/mtimeNs/size和完整parsed metadata。Read-only inspection取得snapshot后立即关闭handle；acquisition保存完整identity/metadata，release重新pin并要求同一snapshot；cleanup/recovery candidate则把owner handle跨rename、isolation、unlink和rollback保持到top-level `finally`。Phase541的三目录graph由此增加owner file第四条object edge。Copied JSON replacement与in-place metadata drift均拒绝，CLI projection、fingerprint、owner schema和既有commit/residual contract不变。

## Phase543：Host tool audit runtime lock owner descriptor lifecycle

Phase543把runtime acquisition通过`O_EXCL`创建的original owner handle保留到lock生命周期结束。`release()`直接用该handle重验current owner path、完整BigInt snapshot、metadata、directory dev/ino和single-entry invariant，不再release-time reopen；新增`abandon()`只关闭descriptor并明确保留磁盘lock。Per-lock promise tail串行化release与abandon，成功release和abandon都幂等，release-after-abandon明确拒绝，failed release仍可重试。Failed acquisition cleanup优先复用creation handle，`JsonlAuditSink.record()`在释放失败后显式abandon。最终path-based unlink/rmdir窗口、CLI和cleanup/recovery接口保持不变。

## Phase544：Host tool audit descriptor-backed mutation detachment proof

Phase544为所有已有descriptor的owner unlink和directory rmdir增加统一postcondition：target path必须missing，original handle仍匹配selection/acquisition dev/ino，且descriptor `nlink === 0`。Runtime acquisition同时pin lock directory与owner file，两条object edges跨hold、release retry和abandon保持；cleanup/recovery则复用Phase540/541 handles。Commit marker只在detachment proof后设置，wrong-object fake-success syscall不会被报告为成功。Private transaction wrapper roots仍没有独立descriptor，最终path syscall竞态仍需native dir-relative capability才能预防而非仅检测。

## Phase545：Host tool audit private wrapper root descriptor binding

Phase545为main cleanup的`<lock>.cleanup-XXXXXX` quarantine root和owner-only quarantine cleanup的`.dispose-XXXXXX` root增加creation-time no-follow directory handle。Transaction从`mkdtemp`后立即固定original wrapper object，child mutation前后都要求current path继续绑定该descriptor并匹配exact entry set；pre-commit rollback和final wrapper rmdir复用Phase544 detachment proof。Wrapper replacement在commit前拒绝，post-commit wrong-object final rmdir通过既有residual path暴露。Selected lock/quarantine directory与owner file handles、CLI、fingerprint、commit point和report schema保持不变。

## Phase546：Host tool audit descriptor-relative private transaction mutation capability

Phase546新增独立directory mutation module。Linux先以descriptor/procfd/descriptor三份BigInt stat验证`/proc/self/fd/<fd>`，再把single child name解析为descriptor-relative mutation path；非Linux或procfs unavailable时重验logical parent path与handle后使用path fallback。Private root creation先pin shared parent，并通过parent descriptor执行`mkdtemp`；main cleanup与owner-only quarantine cleanup的全部private rename/unlink/rmdir都走该capability。Exact entry set、leaf detachment proof、commit/residual和CLI schema不变；runtime与其余cleanup/recovery mutation随后由Phase547接入。

## Phase547：Host tool audit descriptor-relative runtime and maintenance mutation rollout

Phase547把Phase546 adapter接入剩余audit lock namespace。Runtime acquisition先pin shared parent，以descriptor-relative exact mkdir创建reservation，从actual mutation path固定lock directory，再从该directory anchor O_EXCL创建owner；holder因此同时拥有parent、lock directory和owner file handles。Release、failed acquisition、empty quarantine/disposal、owner-only disposal及recovery reservation/transfer/rollback/contraction均从对应open directory解析single child mutation。每个transaction继续保留selected leaf handles、exact entry set、path/descriptor revalidation和Phase544 detachment proof；procfs unavailable时使用validated path fallback。Audit file current/`.1` rotation、CLI、JSON-RPC和report schema未改变。

## Phase548：Host tool audit descriptor-relative generation mutation transaction

Phase548把shared mutation adapter接入parent已经存在后的audit JSONL generation lifecycle。第二次path inspection绑定immediate parent handle；existing current从parent anchor打开并保持descriptor跨capacity与rotation，`.1` unlink和current→`.1` rename从同一anchor执行，missing current通过descriptor-relative/fallback O_EXCL create。Rotation完成后同时检查current missing、rotated path identity和original current handle；full durability复用transaction parent handle sync metadata。Phase517至526的current identity、capacity、pre/post-write和stable errors保持。递归parent bootstrap仍是唯一未接入的path-based audit mutation。

## Phase549：Host tool audit descriptor-relative parent chain bootstrap

Phase549移除record入口最后一个path-based recursive mkdir。初次shared inspection提供nearest existing directory及identity；runtime固定该directory descriptor，并对到target parent的每个validated single component执行exact mkdir、no-follow child open和descriptor/path/descriptor binding。Concurrent `EEXIST`仅在existing child确认是同一logical directory后接管。每轮成功后child handle提升为下一anchor并关闭previous handle；failure保留已创建prefix但关闭所有持有handles。Bootstrap仍位于coordination lock之前，随后第二次inspection继续作为generation transaction的authoritative snapshot；CLI、JSON-RPC和report contracts不变。

## Phase550：Host tool audit runtime owner creation failure descriptor handoff

Phase550把runtime `owner.json` exclusive create与metadata persistence拆成两个内部状态。O_EXCL open和initial regular/single-link fstat成功后，creation handle立即进入outer acquisition ownership；write、final snapshot或logical path gate失败时，cleanup不再依赖partial JSON parse，而是用original descriptor执行owner path object gate、exact entry-set验证、parent-anchored unlink和detachment proof。Zero-byte/partial owner因此可在同一失败transaction内移除；replacement或directory drift继续fail closed并保留residue。成功lock lifecycle和全部public contracts保持。

## Phase551：Host tool audit failed append bounded rollback

Phase551在final append的`writeFile` rejection分支增加same-descriptor rollback。Runtime只在post-error size位于`preWriteBytes < size <= preWriteBytes + lineBytes`、descriptor identity不变且logical current仍绑定same object时truncate回原size；data/full policy同步rollback并再次验证size与path identity。Moved/replaced current或beyond-bound growth保持原bytes，rollback error不覆盖original append error。Durability和post-write gate failure仍不回滚，保持Phase520/526 contract。

## Phase552：Host tool audit exclusive generation pre-commit cleanup

Phase552把missing current的O_EXCL creation纳入generation pre-commit rollback。Final append跟踪creation baseline、write-started、write-completed与Phase551 rollback-restored状态；只有本次独占创建从0 bytes开始、record尚未成功写入且same descriptor/path仍为空时，才从pinned parent unlink current basename。Cleanup在unlink前重复验证parent与empty descriptor/path/descriptor identity，unlink后要求logical path missing、original handle保持same dev/ino且`nlink === 0`；POSIX full还同步parent deletion metadata。Existing generation、parent/path drift、unknown growth和success-write后的failure不删除，rotation也不反向恢复。

## Phase553：Host tool audit transactional rotation pre-commit rollback

Phase553把rotation变为跨final append持有的generation transaction。Previous `.1`先以no-follow snapshot进入same-parent 0700 staging directory，original current handle保持跨current→`.1` rename、new current append、commit或rollback。Pre-commit failure只有在current/rotated/staging identities均可证明时恢复original current与previous archive；successful write先完成selected file durability，再删除staged archive并收缩private directory，POSIX full最后同步generation parent。Commit failure不回滚已写record，previous archive以staging residue保留；crash residue inspection/recovery仍是后续maintenance边界。

## Phase554：Host tool audit target-bound rotation staging inspection

Phase554为rotation staging增加target provenance与只读maintenance projection。Runtime以resolved absolute audit path的SHA-256前32 lowercase hex派生same-parent `.god-code-audit-rotation-<target-hash>-` prefix，`mkdtemp`只追加六字符ID；不同target即使共享parent也不会互相枚举。List inspector最多消费4096个parent entries、materialize 128项，只匹配当前prefix的exact ID，并单独计数无法归属的Phase553 legacy names。Direct inspector从configured file与exact ID重新派生path，不扫描parent。Single-entry reader对root与`previous`执行no-follow lstat、pinned directory read及前后identity/entry-set验证，只输出`empty`、`previous_only`或`unknown`、type、age、count与size。CLI human/JSON仅产生OK/WARN/ERROR diagnostics；本阶段不恢复、cleanup、fingerprint或授予mutation authority，JSON-RPC与persistent contracts保持不变。

## Phase555：Host tool audit rotation staging recovery readiness

Phase555把Phase554 selected residue projection与current、`.1`和coordination lock组合成稳定recovery graph。Runtime对current/rotated执行full BigInt no-follow双快照，复用detailed staging reader绑定root、entry set与optional `previous`，并在图读取前后检查derived lock。只有stable private empty staging、current-only加staged previous、或rotated-only加staged previous三类shape获得action-bound 32-hex fingerprint；current与`.1`并存、invalid generation/staging、unsupported namespace、active lock或任一object drift都fail closed。CLI `audit inspect-rotation-recovery <id> [--json]`只投影assessment、eligible action、generation/staging/lock details与fingerprint，固定声明需要后续confirmation且未执行mutation。未来写命令仍必须先取得normal coordination lock，并在锁内重新读取全部对象和重算fingerprint；本阶段不增加JSON-RPC、agent event、tool result或persistent schema。

## Phase556：Host tool audit guarded rotation staging recovery

Phase556把Phase555 action-bound fingerprint接入真正的maintenance transaction。Runtime recovery与normal sink共享absolute target write tail并获取同一coordination lock；内部held assertion持续绑定lock parent、directory、single `owner.json` descriptor、完整metadata与token。锁内graph先匹配action/fingerprint，callback或等待窗口后再次完整读取并重算，随后固定generation parent、selected staging directory以及current或rotated generation descriptor，按full BigInt snapshots与exact entry set执行最后candidate gate。Empty cleanup只做descriptor-backed wrapper rmdir；archive restore与full rollback使用anchored rename和generation postcondition，commit前failure按reverse order恢复initial namespace，无法证明时保留evidence并报错。Generation commit后不反向回滚；staging sync、wrapper contraction或parent sync failure分别返回residual与durability warning。CLI默认dry-run，`--yes`必须同时携带exact action和fingerprint；该Host-local能力不读取record/archive content，也不改变JSON-RPC或persistent contracts。

## Phase557：Host tool audit recovery commit evidence and lock finalization

Phase557把recovery operation outcome与两层resource finalization分离。Candidate generation/staging/parent handles使用all-settled closure outcome；operation已返回时close rejection转为`recoveryHandlesClosed: false`与warning，operation已失败时secondary close error不替换primary。Outer normal lock只调用一次release，失败后才abandon并对logical lock path做no-follow existence inspection；已知operation result会合并`coordinationLockReleased`、residual path与warning后resolve，pre-commit error仍原样reject。`performedAction`只在真实mutation通过generation postcondition后存在。CLI把descriptor/lock uncertainty映射为WARN并保留mutation、staging和durability事实；该边界不自动cleanup residual lock，也不改变normal writer、lock schema或跨进程协议。

## Phase558：Host tool audit recovery failure evidence and rollback status

Phase558把post-validation recovery rejection从plain error升级为typed failure envelope。Public error保留primary message，并以stage区分lock acquisition、locked graph revalidation、candidate open/final gate、namespace mutation和rollback；mutation state区分未开始、syscall已调用但结果不可确认、已完成reverse rollback和最终namespace不确定。Restore/full rollback transaction在成功恢复initial shape时继续reject原primary error但输出`rolled_back`，reverse transaction失败时输出`rollback/uncertain`。Candidate close outcome与outer lock release、abandon、logical residual inspection结果合并为JSON-safe details，secondary lifecycle error不改变stage/message。CLI将这些字段映射到ERROR report中的failure、mutation、rollback和lock acquisition evidence；raw cause、FileHandle、owner metadata/token及跨进程协议均不进入projection。

## Phase559：Host tool audit recovery candidate-open failure handle handoff

Phase559补齐pinned directory opener在open后、return前失败时的descriptor ownership。Recovery candidate给module-private opener传入failed-open handle collector；parent或staging descriptor完成`fs.open`后若stat、expected identity或logical path binding失败，helper把handle恰好handoff一次而不在内部close-and-forget。Candidate catch将这些未返回handles与已返回parent/staging/generation handles去重后交给同一all-settled finalizer，因此Phase558 typed error中的`recoveryHandlesClosed`和warning覆盖完整candidate acquisition graph。未采用handoff的既有caller维持原best-effort close语义；public types、CLI fields、mutation/rollback、normal writer和跨进程协议不变。

## Phase560：Host tool audit recovery close invocation settlement

Phase560修复all-settled helper在进入`Promise.allSettled`前由eager `map`直接调用`handle.close()`的问题。新的module-private async invocation helper把同步throw转换为returned Promise rejection，并保持async rejection原样；全部handles因此都会启动一次close，随后统一聚合closed/warning。Committed recovery result继续resolve为WARN，operation failure继续保留primary stage和mutation/rollback state，Phase559 handed-off handles也获得相同settlement。Shared throwing multi-handle closer复用normalization但仍在全部settle后传播第一个failure；public fields和跨层协议不变。

## Phase561：Host tool audit recovery error summary normalization

Phase561把recovery reason formatting变为total diagnostic boundary。任意unknown thrown/rejected value先在try内安全提取Error message或String projection；custom getter、`Symbol.toPrimitive`或`toString`失败时使用固定fallback。随后C0/C1及Unicode line separators替换为`?`，summary严格限制512字符。该helper同时服务operation typed message、candidate close、coordination lock finalization、staging cleanup/durability和residual inspection warning，因此formatter本身不能再创建新的failure stage或擦除已知result。CLI不访问raw reason，只映射bounded single-line strings；public schema与跨层协议不变。

## Phase562：Host tool audit recovery post-failure namespace observation

Phase562在typed recovery rejection和normal lock finalization之间增加read-only observation stage。Under-lock operation reject并完成candidate descriptor settlement后，runtime先证明当前lock仍由本次recovery持有，再读取stable current/rotated/staging graph，随后再次证明lock ownership并执行既有classifier。Completed snapshot独立保存assessment、eligibility、optional action/fingerprint及三组public metadata projection；它不覆盖mutation前top-level fingerprint，也不授权锁释放后的直接retry。Lock replacement、graph inspection或classification failure只产生total bounded observation warning，primary stage/state/rollback、handle和lock lifecycle evidence保持。CLI映射nested observation并专门渲染其generation/staging sections；该Host-local字段不进入Engine或wire contracts。

## Phase563：Host tool audit rotation staging bounded child scan

Phase563把selected rotation staging内部entry-set读取从两次无界`readdir().sort()`改为shared descriptor-bound stream scanner。Scanner从open staging handle解析procfd或经过path/handle gate的fallback directory path，`opendir` buffer和保留集合均限制为2项，再用单次sentinel read声明truncation。Public staging inspection分别输出scan count、limit、truncated；exact `entryCount`只在未截断时存在。Initial/final scan names或truncation漂移继续形成`stateChanged`，任何truncated state固定`unknown`且不产生root snapshot、action或fingerprint。Normal rotation和explicit recovery的exact-entry assertions复用同一扫描器，因此overflow directory在mutation syscall前被有界拒绝。

## Phase564：Host tool audit lock maintenance bounded child scan

Phase564把active lock、quarantine root、nested `lock`和disposal root的child-set读取统一到第二个descriptor-bound bounded scanner。Safe layout最多需要两个名称，因此scanner只保留2项并用第三次read形成truncation bit；inspection期间selected directory descriptor持续open，initial/final names、truncation与logical path binding共同形成stable evidence。Quarantine分别输出root/lock scan metadata，disposal输出root scan metadata；exact count仅在not-truncated时存在，truncated state固定`unknown`且不选择owner或生成empty fingerprint。Shared exact-entry assertion同时接管acquire/release、owner/empty cleanup、quarantine recovery和private wrapper contraction，使overflow state在rename、unlink或rmdir前有界拒绝。CLI只接收scalar count/limit/truncated，不接收child names或overflow total。

## Phase565：Host tool audit active lock stable bounded observation

Phase565把active lock read-only inspection从一次child scan升级为same-directory descriptor上的initial/final bounded observation。Initial scan未截断时才读取owner；valid owner descriptor保持到final scan之后，并再次验证logical path、file object与canonical metadata内容。Initial/final names或truncation、directory path binding、owner path/object/content任一变化都会设置`stateChanged`并清除owner token/PID/time与exclusive authority；stable truncated scan和non-race inspection failure也不会生成cleanup evidence。CLI在inspect-path、cleanup、quarantine recovery preflight和rotation readiness中统一投影entry count/scan limit/truncated、exclusive、state/error fields；cleanup dry-run在这些不确定状态下先行拒绝，rotation recovery把internal lock uncertainty直接归入`state_changed`。Destructive transaction继续依赖fresh descriptor-bound revalidation，read-only snapshot不升级为reservation。

## Phase566：Host tool audit active lock terminal directory binding

Phase566在Phase565 valid-owner observation的最后增加第二个directory binding node。原顺序的final directory gate后仍有一次awaited owner snapshot，logical lock leaf可在该间隔变为指向renamed original directory的symlink，而owner path检查会跟随中间组件并继续命中同一owner。现在owner snapshot成功后必须再次以original lock directory descriptor执行descriptor/path/descriptor验证；logical leaf不是directory、未绑定original object或descriptor/path identity不一致时，inspection进入`stateChanged`并撤销owner/exclusive authority。CLI复用Phase565字段，cleanup、quarantine recovery和rotation readiness自动继承拒绝语义；read-only observation仍不是reservation。

## Phase567：Host tool audit active lock directory generation continuity

Phase567把active inspection两个directory binding node改为read-only strict generation gates。Mutation-oriented helper只以device/inode关联open-time object，允许current descriptor/path/descriptor采用一致的新ctime；这会漏掉final scan后、owner snapshot期间发生的child mutation。Strict helper要求每次读取的descriptor/path/descriptor都与pinned device/inode/ctimeNs/birthtimeNs完全一致，因而child entry、owner basename、chmod或directory namespace变化都会在authority projection前形成`stateChanged`。Mutation cleanup/recovery/release仍使用object-oriented matcher以容纳transaction自身的rename/unlink，CLI和跨层接口不变。

## Phase568：Host tool audit lock residue stable authority observation

Phase568把quarantine/disposal inspection从“initial owner snapshot + final entry scan”收紧为stable residue authority闭包。Root与optional nested directory的final/terminal gates全部绑定open-time full generation；layout分类后只重新读取唯一selected owner，并要求initial/final owner path、status、device/inode和canonical metadata一致。Selected owner reread完成后再次验证所有参与layout判断的directory，stable result只从final owner inspection发布token/PID/time。Owner原地改写、basename replacement或root/nested generation drift统一输出`stateChanged`与`layout: unknown`，empty fingerprint opener也拒绝非open-time generation。Mutation transaction仍使用object matcher，Host-local字段和跨层接口不变。

## Phase569：Host tool audit disposal source quarantine terminal continuity

Phase569为disposal authority graph补充source-absence terminal node。Initial source missing只是一条候选edge；owner-only selected owner continuity或empty exact-generation完成后，返回前必须再次对derived source path执行no-follow `lstat`。Persistent late source entry会更新source existence/type，标记source与disposal state changed，并切断owner/empty fingerprint projection；late directory不扫描内部而固定layout unknown。Terminal path-chain或inspection failure同样fail closed。Confirmed owner/empty disposal cleanup仍依赖既有fresh source-absence assertions，Host-local字段与跨层接口不变。

## Phase570：Host tool audit terminal owner file generation continuity

Phase570把owner-bearing read-only authority的终点从branch-specific terminal directory/source gate推进到最后一次owner inspection。Active lock、owner-bearing quarantine和owner-only disposal均在这些non-owner gates成功后重新no-follow打开并有界读取selected owner；valid inspection必须匹配device、inode、ctimeNs、birthtimeNs、mtimeNs、size和canonical metadata，stable fields只从terminal snapshot发布。Persistent owner rewrite会复用既有`stateChanged`/`layout: unknown`并清除owner authority、fingerprint与cleanup confirmation。Empty branch、bounded child scans、mutation transaction和跨层接口保持不变。

## Phase571：Host tool audit candidate-bound owner confirmation fingerprint

Phase571把owner-bearing confirmation edge从token-only digest改为candidate generation digest。Shared module-private hash按tagged NUL-separated fields吸收version/domain、absolute candidate path、layout/owner location、root与optional nested directory full generations、selected owner full generation及canonical owner metadata；disposal再吸收derived source path与missing marker。Stable inspector只在Phase570 terminal authority完成后发布Host-local optional `ownerFingerprint`，CLI direct/list/dry-run直接投影该值而不自行从token计算。Active/quarantine/disposal cleanup与pre-commit recovery从fresh pinned candidate重算同一material，并在任何namespace mutation前比较。因而复制相同owner JSON的path replacement、其他domain/layout/path fingerprint或旧token-only value都不能授权mutation；32-hex CLI contract、transaction topology、wire和persistent schema保持。

## Phase572：Host tool audit runtime-confirmed maintenance fingerprint projection

Phase572把CLI report中的positive confirmation edge从`preflight match -> public details`移动到`runtime existing result -> exact fingerprint invariant -> public details`。六条owner/empty maintenance命令仍先执行stable inspection并用expected value控制是否进入runtime；preflight mismatch显式投影`false`，preflight match本身不再发布`true`或fingerprint。Runtime throw与authoritative selection前disappearance因此不会复用旧snapshot冒充confirmation；只有existing result携带exact expected owner/quarantine/disposal fingerprint时，module-private invariant helper才允许投影positive evidence。Mutation、rollback、residual、CLI字段集合、runtime signatures以及跨层wire/persistent schema均不变。

## Phase573：Host tool audit runtime-confirmed cleanup target absence projection

Phase573修正两条cleanup report graph中的terminal namespace node。Active lock与owner-only quarantine在runtime返回`existed: true`时都已经commit删除原selected basename，private wrapper是否收缩成功只影响residual edge；CLI现在先把对应`coordination_lock_exists`或`quarantine_exists`设置为false，再连接Phase572 positive fingerprint与OK/WARN projection。Dry-run与pre-runtime refusal仍描述inspection snapshot，entry/layout/owner字段继续保留candidate evidence；runtime signatures、mutation topology和跨层schema不变。

## Phase574：Host tool audit residual locator existence uncertainty projection

Phase574修正剩余两条`residual locator -> selected exists` report edge。Owner-only disposal与successful quarantine recovery的runtime residual只标记post-commit cleanup未被安全确认；同一field既可能对应logical path仍present，也可能对应wrong-object contraction后logical path missing，因此不能支持boolean truth。CLI在无residual时连接terminal `*_exists: false`，有residual时保留manual-inspection path和WARN但撤销optional existence node。Recovery rollback-residual的verified current state、runtime transaction、CLI字段集合和跨层schema均不改变。

## Phase575：Host tool audit runtime-missing preflight snapshot withdrawal

Phase575修正六条maintenance report graph中`preflight snapshot -> runtime missing terminal`的残留edge。Runtime candidate selection返回missing时只证明selected target absence与no mutation，不能继续支持entry/layout/scan/owner/state metadata；disposal runtime还未重新观察source quarantine，recovery runtime还未重新观察active lock。CLI通过三个module-private withdrawal helper切断这些optional nodes，再连接selected `*_exists: false`。Derived paths、IDs、operation outcome及existing/residual/rollback graph保持，runtime与跨层schema不变。

## Phase576：Host tool audit maintenance result-preserving handle finalization

Phase576把六条maintenance graph的descriptor finalization从throwing terminal edge改为secondary lifecycle evidence。五类cleanup与quarantine recovery各自保存candidate-existing `resolvedResult`引用，`finally`通过共享non-throwing all-settled finalizer规范化同步throw与async rejection，并在Promise resolve前写入cleanup/recovery closure outcome。Close uncertainty只连接`*HandlesClosed:false`和bounded warning，不再切断已知`removed`、`recovered`、fingerprint、residual或rollback result；primary operation throw仍沿原edge传播。CLI映射对应snake_case fields并以WARN表达secondary uncertainty，stable result明确closed，missing result不伪造finalization evidence；mutation topology和跨层schema保持。

## Phase577：Host tool audit maintenance rejection handle finalization evidence

Phase577为六条maintenance rejection graph增加typed lifecycle envelope。Candidate reader取得pinned directory/owner handles后，无论selection validation还是top-level operation失败，都先通过shared normalized all-settled finalizer关闭全部owned handles，再抛出保留primary message/cause的`JsonlAuditLockMaintenanceError`。Details以exact operation identifier、`handlesClosed`和optional bounded warning表达secondary outcome；existing envelope经过outer finalizer时合并而不丢失早期evidence。CLI ERROR只在typed operation匹配当前command时复用Phase576 snake_case fields，status和primary message保持。Preflight、initial missing、unhanded transient handles、mutation topology与跨层schema不变。

## Phase578：Host tool audit maintenance transient opener handle handoff

Phase578把maintenance descriptor graph扩展到open成功但helper尚未return的transient edge。Pinned directory、pinned-empty、owner metadata、mutation parent与private temporary helper都接受module-private optional handoff collector；采用collector的candidate/top-level caller在validation失败时取得唯一cleanup authority，未采用的inspection/acquisition caller保持原语义。Candidate reader只在实际存在returned或handed-off handle时创建Phase577 typed error；top-level finalizer把candidate、operation和transient handles按object identity去重并all-settled。Empty cleanup terminal identity read成功后也把短生命周期handle交给outer finalizer，因此commit outcome先稳定，close failure只形成resolved WARN。Public fields、operation identifiers、CLI mapping、mutation与跨层schema不变。

## Phase579：Host tool audit maintenance directory stream finalization evidence

Phase579把bounded child scan的`Dir` stream纳入maintenance descriptor graph，但仍在scan helper退出前立即关闭，不让enumeration resource跨namespace mutation存活。携带finalization context的pinned directory使用normalized non-throwing close并把结果累计到context；scan成功继续return，read primary rejection继续rethrow。Candidate与operation finalizer按context identity去重，合并已完成stream outcome和pending `FileHandle` closure后形成单一bounded lifecycle evidence。Resolved transaction与typed rejection继续复用Phase576/577字段和operation identifier；inspection-only与rotation staging scan保持direct close，public、mutation、fingerprint与跨层schema不变。

## Phase580：Host tool audit maintenance descriptor close settlement timeout

Phase580在shared maintenance resource-close node增加module-private 5000ms timer race。Close invocation先安装fulfilled/rejected observer，再与timeout settlement竞争；timeout形成固定safe error并进入既有all-settled aggregate，underlying late settlement只被消费，不回写operation。所有resources仍single-attempt且并发，因此一个永久pending Promise最多延迟一个deadline，不能阻止其他close invocation。Resolved result与typed error继续复用cleanup/recovery lifecycle fields；inspection和rotation family保持原settlement graph，public、mutation与跨层schema不变。

## Phase581：Host tool audit inspection descriptor close settlement timeout

Phase581新增inspection-specific 5000ms close policy，并抽取maintenance/inspection共用的owned-observer timer race。Parent enumerator与inspection-marked child scanner先捕获read primary，再完成bounded close；close timeout只在scan成功时成为operation failure。Pinned root/nested/owner/empty handles按identity去重并all-settled，任一failure使single-entry inspection进入`inspection_failed`/unknown并撤销authority。List CLI复用ERROR，targeted CLI复用uncertainty WARN；read-only、public field、mutation和跨层schema保持。

## Phase582：Host tool audit rotation recovery candidate descriptor close settlement timeout

Phase582为mutating rotation recovery candidate finalizer增加独立5000ms close policy。Generation、staging directory与parent directory handles按identity去重，通过shared owned-observer timer race并发settle；timeout只进入既有recovery handle false/warning edge，不覆盖committed mutation result、rollback primary或candidate-open stage。Candidate deadline后coordination lock仍进入原release/abandon graph；lock lifecycle、acquisition、writer、public field与跨层schema保持。

## Phase583：Host tool audit cooperative lock lifecycle descriptor close settlement timeout

Phase583为successful cooperative lock的owner、lock directory与parent handles增加独立5000ms close policy。首次`release()`或`abandon()`立即memoize identity-deduplicated、concurrent all-settled finalization Promise，timeout或后续fallback均复用同一rejection而不重复close。Release保持已提交missing namespace，abandon保持disk lock；writer primary与rotation recovery committed evidence保持，coordination timeout复用既有released false/warning，public field与跨层schema不变。

## Phase584：Host tool audit lock acquisition descriptor close settlement timeout

Phase584为ownership transfer前的failed-open parent/lock/owner handles、returned pre-transfer parent、failed-cleanup owner/lock handles与acquisition child-scan `Dir`增加独立5000ms close policy。Validation/write primary和`EEXIST` retry保持；successful scan close timeout拒绝successful transfer并进入既有lock-acquisition error path。资源按identity去重并发settle，late result只消费；successful owner/lock/parent handles仍由Phase583 lifecycle接管，public option、CLI field与跨层schema不变。

## Phase585：Host tool audit writer descriptor close settlement timeout

Phase585为常规JSONL writer持有的bootstrap/generation parent、append/current generation、rotation transaction、backup staging directory和writer staging `Dir`增加独立5000ms close policy。Same-set resources按identity去重并发settle，existing write/validation/rotation primary优先；无primary时fixed writer timeout可见。Append或rotation已经commit时close timeout不回滚filesystem state，late result只消费且writer serialization tail继续可用。Lock acquisition/lifecycle、recovery、maintenance、inspection、public sink/CLI field与跨层schema不变。

## Phase586：Host tool audit cooperative lock lifecycle directory stream close settlement timeout

Phase586把successful lock transfer后的child-scan `Dir`纳入Phase583 lifecycle 5000ms policy。Lifecycle marker只在acquisition validation全部成功后写入returned lock directory；`assertHeld()`、owner unlink前scan与owner unlink后empty scan都按read-primary-first bounded close。Pre-owner timeout保持owner lock，post-owner timeout保持exact empty residual；stream error不启动或memoize handle finalizer，fallback仍可`abandon()`回收handles。Recovery locked-revalidation、writer release和CLI residue只复用existing fields，public lock与跨层schema不变。

## Phase587：Host tool audit rotation recovery candidate directory stream close settlement timeout

Phase587把successful rotation recovery candidate的staging child-scan `Dir`纳入Phase582 recovery 5000ms policy。Recovery marker只在pinned directory open validation成功后写入；candidate-open、candidate/mutation revalidation、archive commit proof、rollback和final cleanup都按read-primary-first bounded close。Pre-commit timeout进入existing rollback并恢复initial namespace；post-commit cleanup timeout保持generation commit、保留exact empty staging residual并复用既有warning。Candidate FileHandle finalizer、public recovery/CLI fields与跨层schema不变。

## Phase588：Host MCP runtime close settlement timeout

Phase588为`SdkMcpStdioRuntime.close()`建立module-private 5000ms settlement policy。Close开始时清空tools并snapshot servers，所有server并发关闭；client reject/timeout才进入bounded transport fallback。Active close Promise memoize，使concurrent/repeated caller等待同一lifecycle且不重复消费server state。Connect/list-tools cleanup保持best-effort并在deadline后返回原typed diagnostic，late settlement只消费。Public MCP interface、Host/CLI字段与跨层schema不变。

## Phase589：Host prepared runtime lifecycle finalization

Phase589把`prepareGodCodeHost()`建模为MCP/plugin runtime ownership transaction。Ownership transfer前任意plugin、tool catalog或MCP context failure都会并发关闭全部已创建runtime，sync throw与reject进入all-settled boundary，setup primary保持原对象。成功返回后，第一次`PreparedGodCodeHost.close()`建立永久terminal Promise并并发关闭两个runtime；concurrent与post-settlement repeated caller复用该Promise，每个runtime最多close一次。Host层不截断Phase588 MCP内部deadline，public Host options、CLI字段与跨层schema不变。

## Phase590：Host headless composite finalization continuity

Phase590为`runGodCodeTurn()`和`runGodCodeRpcSmoke()`增加module-private composite finalizer。Engine stop、prepared-host close与renderer finish都先转为owned Promise，再按renderer/host/engine logical priority收集all-settled outcome；调用fan-out保证一个secondary throw/reject不能截断其余resource。Operation已有primary时cleanup outcome只消费不传播；operation成功时仍传播第一个cleanup reason。Headless run同时主动detach `god_code_event`与`exit` listeners，public options/result、CLI与跨层schema不变。

## Phase591：Host REPL composite cleanup lifecycle

Phase591按REPL resource generation memoize active start、terminal stop与cleanup outcome。Stop先capture active turn cancellation identity但不等待cancel settlement，再同步detach listeners、清除host/turn ownership并把session标为stopped；pending turn以固定local reason结束，renderer、host和engine随后独立all-settled。Normal stop后的下一次start观察并清除旧generation terminal markers，cleanup failure则保持resource uncertainty且阻止静默restart。Turn completion和engine exit都按active-turn object identity清理，submit/start/outer-run primary不被renderer或engine secondary覆盖；`runGodCodeRepl()`同时关闭readline、启动stop并等待captured pending actions。Public REPL methods、CLI和跨层schema不变。

## Phase592：Host engine process terminal stop lifecycle

Phase592按engine process generation memoizestart与terminal stop。Stop在async teardown前snapshot child、peer和memoized peer closer，并从engine state撤销RPC/turn authority；captured shutdown request最多观察5000ms，stdin close后等待2000ms graceful exit，超时发送一次SIGKILL并再等待2000ms。Forced timeout形成固定resource-uncertainty reason并阻止restart，process failure优先于peer close secondary。Exit callback只使用captured stderr/peer closer，normal restart重置exit diagnostics，old generation不能关闭replacement peer。Public engine methods、CLI和跨层schema不变。

## Phase593：Host doctor engine cleanup primary continuity

Phase593把doctor engine checks从“先push check、finally吞cleanup”改为operation diagnostic ownership。Python initialize或provider health turn先形成唯一局部diagnostic；provider waiter cleanup和engine stop再进入all-settled join。已有operation error时cleanup只消费，候选ok叠加任一cleanup failure时改为固定非敏感error projection。Provider-health cleanup自身memoize，并把timer、event listener和exit listener作为独立owned actions；event/timeout/finally竞争只执行一次，sync throw不能截断engine stop。Doctor public report、command和跨层schema不变。

## Phase594：Host doctor tool catalog cleanup primary continuity

Phase594把`checkHostTools()`从嵌套try/finally直接写共享checks，改为operation-owned local diagnostic。Prepared host setup与tool count读取先确定operation primary；只要host ownership已经转移，Phase589 terminal close就通过owned Promise单独结算。Operation error不被close secondary覆盖，候选ok叠加close throw/reject时改为固定非敏感error，最后只写入一个`tool_catalog` check。正常tool count、audit skip、doctor顺序、public report与跨层schema不变。

## Phase595：Host CLI tools catalog cleanup primary continuity

Phase595把`listHostTools()`的direct `try/finally`改为catalog operation outcome加prepared-host cleanup settlement。Catalog getter primary以原对象保持；successful read叠加close同步throw或reject时改为固定非敏感error。Host ownership转移后close一次，返回的catalog仍是原数组；`getHostTool()`、render、not-found、public CLI和跨层schema不变。

## Phase596：Host plugin diagnostic runtime cleanup primary continuity

Phase596把plugin config/list diagnostics从`.close().catch(...)`改为operation-owned local diagnostic加runtime finalization。Load/list error保持原message/details；候选ok叠加close同步throw或reject时改为固定非敏感error，并只提交一次`plugin_runtime`或`plugin_list`。Config/no-plugin/registry fast path、manifest/registry mutation、sandbox execution、public report和跨层schema不变。

## Phase597：Host MCP diagnostic runtime cleanup primary continuity

Phase597把MCP context、connection multi-check和generic operation从`.close().catch(...)`改为local check graph加shared runtime finalization。Existing error节点优先；无error且close失败时按路径替换`mcp_context`、`mcp_connect`或generic operation owner为fixed sanitized error。Optional成功节点保持，不新增cleanup check；Phase588 runtime、public report和跨层schema不变。

## Phase598：Host synchronous CLI finalizer primary continuity

Phase598把terminal approval与TUI PTY smoke的同步finalizer改为显式operation/finalization join。Approval callback只settle decision，listener detach与readline close独立single-attempt；question rejection、deny和cancel primary保持，allow遇到cleanup failure时投影existing deny shape。TUI render primary优先，successful render的stop failure通过fixed Error可见。Public options、decision/result、CLI与跨层schema不变。

## Phase599：Host TUI controller composite lifecycle

Phase599把TUI controller start/run/stop graph改为terminal composite ownership。Candidate session start failure和first render failure进入primary-preserving rollback；run-owned key/line input finalizer、pending actions与controller stop统一settle。Stop memoize并同步撤销session/screen/raw-mode authority，随后all-settled cleanup，cleanup-only failure固定脱敏。Multi-session close fan-out且失败candidate保持runtime ownership；public TUI与跨层schema不变。

## Phase600：Host transcript watcher finalization continuity

Phase600把active/archive filesystem watcher与对应root diagnostic绑定为local ownership record。Timeout/event-bound finalizer逐一隔离同步close failure并继续观察全部pending event；existing root primary保持，cleanup-only uncertainty使用固定root error。Pending event Set改用双分支observer，不再创建unhandled derivative；watch discovery、event/result、CLI与跨层schema不变。

## Phase601：Host provider log descriptor finalization continuity

Phase601把daemon start和model pull/remove/prune的日志fd改为operation-owned finalization。Operation throw或error report优先；successful report叠加close failure时复用existing first check固定降级并保留operation details。三个model waiter在terminal callback中先取得settled authority，再形成report、消费close failure并resolve，避免callback throw和pending Promise；public provider与跨层schema不变。

## Final release lifecycle audit after Phase601

[最终审计](design/FINAL_RELEASE_AUDIT_AFTER_PHASE_601.md)重新枚举Host active callback/finalizer、observer derivative、process ownership、source/dist和public schema。Phase600/601闭合Phase599留下的最后两个live gap；Python 422、TypeScript 56 files/1005 tests、build、integration和compiled smoke通过，残留清理后未发现新的runtime-reproducible缺口。

## Phase348：最新分段标签宽度百分比分段标签显隐宽度百分比分段

最新 bucket helper 委托共享算法将百分比映射为 `L/M/H`，并由 width helper 追加在百分比后。分段边界仍为 0-39、40-79、80 以上；Help、Debug 和 indicator 共用结果，不新增文字标签、状态或跨层接口。

## Phase357：最新分段标签宽度百分比分段标签显隐宽度百分比分段标签显隐宽度百分比分段标签

最新 label helper 复用共享算法将 `L/M/H` 映射为 `low/mid/high`，并由 width helper 组合为 `percentage%bucket(label)`。Help、Debug 和 indicator 共用结果；不新增状态、action、快捷键、profile 或跨层接口。

## Phase358：最新分段标签宽度百分比分段标签显隐宽度百分比分段标签显隐宽度百分比分段标签显隐

新增默认开启的 `liveSessionCommandLatestWidthBucketLabelVisible` TUI 本地状态，并由命令面板专用 `F2` action 切换。最终 width formatter 接收显隐参数，父级快捷键 `1` indicator、Help 和 Debug 共用状态；命令面板外输入和跨层接口保持不变。

## Phase359：最新分段标签宽度百分比分段标签显隐宽度百分比分段标签显隐宽度百分比分段标签显隐配置档

Phase358 布尔字段升级为 `liveSessionCommandLatestWidthBucketLabelVisibilityProfile`，默认 `shown` 并由 F2 cycle action 驱动。resolver 在 119/120 列分别得到 `hidden/shown`；父级 formatter、Help 和 Debug 共用解析结果，跨层接口保持不变。

## Phase360：最新分段标签宽度百分比分段标签显隐宽度百分比分段标签显隐宽度百分比分段标签显隐阈值提示

F2 adaptive 子级 indicator 直接从共享常量读取 120 列阈值并输出 `[120]`，119/120 列的有效 profile 仍分别为 hidden/shown。显式 profile、resolver、父级 formatter、状态归属和跨层接口保持不变。

## Phase361：最新分段标签宽度百分比分段标签显隐宽度百分比分段标签显隐宽度百分比分段标签显隐阈值距离提示

最新纯距离 helper 在 F2 profile 为 adaptive 且当前宽度低于 120 列时返回差值，到达阈值或使用显式 profile 时返回 `null`。子级 indicator、Help 和 Debug 复用结果，不新增状态、action、快捷键或跨层接口。

## Phase362：最新分段标签宽度百分比分段标签显隐宽度百分比分段标签显隐宽度百分比分段标签显隐宽度提示

最新 width helper 统一返回 `current/120`，保留超过阈值后的真实宽度。F2 adaptive indicator、Help 和 Debug 共用结果；显式 profile、resolver、距离算法、状态归属和跨层接口均不改变。

## Phase363：最新分段标签宽度百分比分段标签显隐宽度百分比分段标签显隐宽度百分比分段标签显隐宽度百分比提示

最新 percentage helper 委托共享算法生成 0-100 的整数百分比，并由 width helper 组合为 `current/120=percentage%`。80、119、120、180 列分别为 66%、99%、100%、100%；Help、Debug 和 indicator 共用结果，不新增状态或跨层接口。

## Phase349：最新分段标签宽度百分比分段标签显隐宽度百分比分段标签

最新 label helper 委托共享映射生成 low/mid/high，并由 width helper 组合为 `L(low)`、`M(mid)`、`H(high)`。Help、Debug 和 indicator 共用结果，不新增状态、action、快捷键或跨层接口。

## Phase350：最新分段标签宽度百分比分段标签显隐宽度百分比分段标签显隐

最新布尔状态归 `TuiState` 所有并默认开启。输入层仅在命令面板内将 `1` 映射为 toggle action；关闭时快捷键 `2` 的 width formatter 保留 `L/M/H` 并移除括号文字标签，Help 和 Debug 同步显示 `on@1/off@1`。面板外 activate action 和跨层接口保持不变。

## Phase351：最新分段标签宽度百分比分段标签显隐宽度百分比分段标签显隐配置档

快捷键 `1` 状态升级为默认 `shown` 的三态 profile，并按 `shown -> hidden -> adaptive -> shown` 循环。adaptive 在 119 列及以下解析为 hidden、120 列及以上解析为 shown；快捷键 `2` formatter、Help、Debug 和子级 indicator 使用同一 resolver。面板外 activate action 和跨层接口保持不变。

## Phase352：最新分段标签宽度百分比分段标签显隐宽度百分比分段标签显隐阈值提示

adaptive 子级 indicator 直接从共享常量读取 120 列阈值并输出 `[120]`，119/120 列的有效 profile 仍分别为 hidden/shown。显式 profile、resolver、快捷键 `2` formatter、状态归属和跨层接口保持不变。

## Phase353：最新分段标签宽度百分比分段标签显隐宽度百分比分段标签显隐阈值距离提示

最新纯距离 helper 在 adaptive 且当前宽度低于 120 列时返回差值，到达阈值或使用显式 profile 时返回 `null`。子级 indicator、Help 和 Debug 复用结果，分别形成 `hidden+40`、`hidden+1` 或无距离的 `shown`，不新增状态、action、快捷键或跨层接口。

## Phase354：最新分段标签宽度百分比分段标签显隐宽度百分比分段标签显隐宽度提示

最新 width helper 统一返回 `current/120`，保留超过阈值后的真实宽度。adaptive indicator、Help 和 Debug 共用结果；显式 profile、resolver、距离算法、状态归属和跨层接口均不改变。

## Phase355：最新分段标签宽度百分比分段标签显隐宽度百分比分段标签显隐宽度百分比提示

最新 percentage helper 委托共享算法生成 0-100 的整数百分比，并由 width helper 组合为 `current/120=percentage%`。80、119、120、180 列分别为 66%、99%、100%、100%；Help、Debug 和 indicator 共用结果，不新增状态或跨层接口。

## Phase356：最新分段标签宽度百分比分段标签显隐宽度百分比分段标签显隐宽度百分比分段

最新 bucket helper 委托共享算法将百分比映射为 `L/M/H`，并由 width helper 追加在百分比后。分段边界仍为 0-39、40-79、80 以上；Help、Debug 和 indicator 共用结果，不新增文字标签、状态或跨层接口。
