# Phase 11: Session History / Replay UX

Phase 11 把已经存在的 JSONL transcript store 做成可直接使用的 CLI 会话历史。

目标不是恢复运行中的 session，也不是重新执行历史 turn，而是让用户可以列出历史 session，并把某个 session 的 transcript 以人可读形式 replay 出来。

## 当前状态

基础实现已经落地：

- `god-code sessions list`
- `god-code sessions replay <session_id>`
- `ts-host/src/transcripts/history.ts`
- `ts-host/test/transcriptHistory.test.ts`

`god-code run` 和 `god-code repl` 默认写入 transcript。`rpc-smoke` 不主动注入默认 transcript 目录，避免 smoke 产生本地产物。

## Transcript 目录规则

默认规则：

```text
GOD_CODE_TRANSCRIPT_DIR
  -> 如果设置，使用该目录
  -> 如果未设置，使用 <cwd>/.god-code/transcripts
```

`.god-code/` 是本地产物，已加入 `.gitignore`。

## CLI 行为

```bash
god-code sessions list
```

输出当前 transcript 目录下的 JSONL session 摘要：

- session id
- entry 数
- turn 数
- first / last timestamp
- 第一条 user prompt 摘要

```bash
god-code sessions replay <session_id>
```

按 transcript 写入顺序展示：

- user message
- assistant message
- tool call
- tool result
- provider context 摘要

## 架构边界

Phase 11 不改变 JSON-RPC 协议：

```text
run / repl
  -> Python Engine
  -> JsonlTranscriptStore
  -> .god-code/transcripts/<session_id>.jsonl

sessions list / replay
  -> TS Host 直接读取 JSONL
  -> 人可读输出
```

Replay 是离线查看，不会启动 Python Engine，不会执行工具，也不会恢复 provider 连接。

## 保持不变

- `TurnEngine`
- `ModelAdapter`
- `HostToolRegistry.executeRequest(...)`
- JSON-RPC methods
- Python JSONL transcript wire format
- 单 session / 单 running turn 的 Phase10 REPL 限制

## 不做

Phase 11 第一版不做（其中 search / delete / replay JSON 已在 Phase16 补齐）：

- transcript 删除 / 清理命令
- transcript 搜索
- JSON 导出参数
- 恢复可继续运行的 session
- 多 session 并发
- transcript 压缩

## 测试

当前覆盖：

- transcript dir 解析
- session list summary
- replay rendering
- malformed JSONL 错误
- `run` 写入 transcript
- `repl` 多 turn 写入同一个 session transcript

验收命令：

```bash
cd GOD-code/ts-host
npx tsc -p tsconfig.json --noEmit
npm test -- --run
```

smoke：

```bash
cd GOD-code
node ts-host/dist/cli/main.js run "read README.md"
node ts-host/dist/cli/main.js sessions list
node ts-host/dist/cli/main.js sessions replay <session_id>
```
