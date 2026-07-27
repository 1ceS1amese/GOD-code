# Phase 24: Archived Session Search / Delete

Phase24 为 Phase23 的 archived transcript 管理补齐归档内搜索和显式删除能力。

本阶段仍然是 TS Host 本地能力：不启动 Python Engine，不新增 JSON-RPC 方法，不恢复 live session。所有命令只读取或删除 `<transcriptDir>/archive/*.jsonl`。

## CLI

```bash
god-code sessions archive search <query>
god-code sessions archive search <query> --json
god-code sessions archive delete <session_id> --yes
god-code sessions archive delete <session_id> --yes --json
```

## 行为边界

- `archive search` 只扫描 archive root 下直属 `*.jsonl`，不递归子目录。
- `archive search` 复用 active `sessions search` 的匹配和 JSON contract。
- `archive delete` 只删除 `<transcriptDir>/archive/<session_id>.jsonl`。
- `archive delete` 必须显式带 `--yes`。
- active `sessions search/delete/list/replay/resume/cleanup` 仍不读取或修改 archive 文件。
- 本阶段不做批量 restore、批量 delete 或跨目录全局搜索；gzip 压缩已在 Phase30 补齐，索引化搜索已在 Phase31 补齐。

## JSON 输出

`archive search --json` 输出与 active `sessions search --json` 相同：

```json
[
  {
    "summary": {
      "sessionId": "session-1",
      "entryCount": 1,
      "turnCount": 1,
      "firstTimestamp": "2026-01-01T00:00:00.000Z",
      "lastTimestamp": "2026-01-01T00:00:00.000Z",
      "firstPrompt": "hello",
      "filePath": ".god-code/transcripts/archive/session-1.jsonl"
    },
    "matched_entry_count": 1,
    "matched_types": ["user"]
  }
]
```

`archive delete --json` 输出与 active `sessions delete --json` 相同：

```json
{
  "session_id": "session-1",
  "deleted": true,
  "file_path": ".god-code/transcripts/archive/session-1.jsonl"
}
```

## 实现点

- `ts-host/src/transcripts/history.ts` 提供 archived search / delete helper。
- `ts-host/src/cli/main.ts` 扩展 `sessions archive` 子命令组。
- 不改 Python Engine / protocol wire payload。

## 验收

- TS unit 覆盖 archived search / delete 与 active history 隔离。
- Integration 覆盖 archive search JSON、active search 隔离、delete 确认保护和 JSON 输出。
- CLI smoke 覆盖 archive search / delete happy path 和缺 `--yes`。
- `./tools/check.sh` 全量通过。
