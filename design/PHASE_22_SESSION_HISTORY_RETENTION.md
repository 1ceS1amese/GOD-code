# Phase 22: Session History Retention / Cleanup

Phase22 为 session history 增加本地 transcript cleanup 能力。

它不启动 Python Engine，不新增 JSON-RPC 方法，不恢复或重放历史 turn。所有动作都由 TS Host 直接管理 active transcript 目录下的 `*.jsonl`。

## CLI 行为

```bash
god-code sessions cleanup --older-than-days <n>
god-code sessions cleanup --older-than-days <n> --json
god-code sessions cleanup --older-than-days <n> --archive --yes
god-code sessions cleanup --older-than-days <n> --archive --yes --json
god-code sessions cleanup --older-than-days <n> --delete --yes
god-code sessions cleanup --older-than-days <n> --delete --yes --json
```

默认不传 `--archive` 或 `--delete` 时是 dry-run，只报告匹配项，不修改文件。

## 契约边界

- 匹配条件使用 session summary 的 `lastTimestamp`。
- `lastTimestamp < now - olderThanDays` 时视为过期。
- `--archive` 把匹配的 active transcript 移到 `<transcriptDir>/archive/`。
- `--delete` 永久删除匹配的 active transcript。
- `--archive` 和 `--delete` 互斥。
- `--archive` / `--delete` 必须显式带 `--yes`。
- archive 目标路径已存在时整批失败，不移动源文件。
- `archive/` 下的文件不参与 `sessions list/search/replay/resume/cleanup`。

## JSON 输出

```json
{
  "action": "dry-run",
  "cutoff_timestamp": "2026-04-07T00:00:00.000Z",
  "matched_count": 1,
  "affected_count": 0,
  "sessions": [
    {
      "session_id": "session-1",
      "entry_count": 4,
      "turn_count": 1,
      "last_timestamp": "2026-03-01T00:00:00.000Z",
      "source_path": ".god-code/transcripts/session-1.jsonl"
    }
  ]
}
```

归档时每个 session 额外包含 `archive_path`。

## 实现

- `ts-host/src/transcripts/history.ts` 提供 cleanup helper 和 text / JSON renderer。
- `ts-host/src/cli/main.ts` 在 `sessions` 分支解析 cleanup flags。
- 复用现有 `listTranscriptSessions(...)`，保持 transcript 读取、summary 和排序逻辑一致。

## 不做

- Phase22 本身不做 gzip 压缩；archived gzip 已在 Phase30 补齐。
- 不做 archive restore。
- 不递归处理 `archive/`。
- 不做跨目录全局历史搜索。
- 不改变 Python Engine session / turn loop。

## 校验

- TS unit 覆盖 dry-run、archive、delete、archive 冲突和 active list 变化。
- Integration 覆盖 cleanup JSON、缺 `--yes`、archive 和 delete。
- CLI smoke 覆盖 cleanup dry-run、archive、delete 和确认保护。
