# Phase 16: Session History Management

Phase 16 在 Phase11 的 `sessions list/replay` 基础上补齐本地 transcript 的查询、JSON replay 和显式删除能力。

它不恢复历史 session，不重新执行历史 turn，不新增 JSON-RPC 方法，也不让 Python Engine 参与本地历史管理。所有管理动作仍由 TS Host 直接读取或删除本地 JSONL transcript 文件。

## 当前状态

基础实现已经落地：

- `god-code sessions search <query>`
- `god-code sessions search <query> --json`
- `god-code sessions replay <session_id> --json`
- `god-code sessions delete <session_id> --yes`
- `god-code sessions delete <session_id> --json --yes`
- `ts-host/src/transcripts/history.ts`
- `ts-host/test/transcriptHistory.test.ts`
- `integration/cli_integration.py`
- `tools/run-cli-smoke.sh`

## CLI 行为

```bash
god-code sessions search <query>
```

按当前 transcript 目录搜索 session：

- 匹配 session id、turn id、entry type、timestamp。
- 匹配 transcript payload 的 JSON 文本。
- 匹配 session summary 的首条 user prompt 和时间字段。
- 输出按 `lastTimestamp` 倒序排列。

```bash
god-code sessions search <query> --json
```

输出数组，每项包含：

- `summary`
- `matched_entry_count`
- `matched_types`

```bash
god-code sessions replay <session_id> --json
```

输出离线 replay JSON：

- `session_id`
- `entry_count`
- `entries`

```bash
god-code sessions delete <session_id> --yes
god-code sessions delete <session_id> --json --yes
```

删除对应 transcript JSONL 文件。删除必须显式传 `--yes`；缺少确认时返回 CLI usage error，退出码为 `2`。

## 架构边界

保持 Phase11 的离线历史管理边界：

```text
god-code run / repl
  -> Python Engine
  -> JsonlTranscriptStore
  -> .god-code/transcripts/<session_id>.jsonl

god-code sessions list / replay / search / delete
  -> TS Host 直接读取或删除 JSONL
  -> 不启动 Python Engine
  -> 不执行工具
  -> 不恢复 provider 连接
```

## 保持不变

- JSON-RPC wire contract
- Python Engine session / turn loop
- `TurnEngine`
- `ModelAdapter`
- `HostToolRegistry.executeRequest(...)`
- transcript JSONL entry wire format
- 默认 transcript 目录规则

## 不做

Phase 16 当前不做：

- 从历史 session 继续对话。
- transcript 压缩或归档。
- 批量删除。
- fuzzy search / 正则搜索 / 索引文件。
- TUI 或交互式确认 UI。
- 跨目录全局历史搜索。

## 测试

当前覆盖：

- transcript search helper 和 text / JSON renderer。
- replay JSON renderer。
- delete helper 和 delete JSON renderer。
- CLI transcript contract：`list`、`replay`、`search --json`、`replay --json`、`delete --yes`。
- CLI smoke 覆盖 search / replay JSON / delete 确认。

验收命令：

```bash
cd GOD-code/ts-host
npx tsc -p tsconfig.json --noEmit
npm test -- --run
```

完整验收：

```bash
cd GOD-code
./tools/check.sh
```
