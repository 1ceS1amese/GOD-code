# Phase 30: Session History Gzip Compression

Phase30 为 archived transcript 增加 gzip 压缩能力，降低长期保留的本地 transcript 占用。

本阶段仍然是 TS Host 本地能力：不启动 Python Engine，不新增 JSON-RPC 方法，不改变 active transcript 写入格式。

## CLI

```bash
god-code sessions archive compress <session_id> --yes
god-code sessions archive compress <session_id> --yes --json
```

## 行为

- `archive compress` 只压缩 `<transcriptDir>/archive/<session_id>.jsonl`。
- 压缩后输出 `<transcriptDir>/archive/<session_id>.jsonl.gz`，并删除原 `.jsonl`。
- `archive compress` 必须显式带 `--yes`。
- `archive list / replay / search / delete / restore` 支持 `.jsonl.gz`。
- `archive restore` 从 `.jsonl.gz` 恢复时会解压成 active `<session_id>.jsonl`，并删除 gzip 源文件。
- active `sessions list/search/replay/resume/cleanup/delete` 仍只处理 active `.jsonl`，不扫描 gzip。

## JSON 输出

```json
{
  "session_id": "session-1",
  "compressed": true,
  "source_path": ".god-code/transcripts/archive/session-1.jsonl",
  "compressed_path": ".god-code/transcripts/archive/session-1.jsonl.gz",
  "original_bytes": 1000,
  "compressed_bytes": 300
}
```

## 不做

- 不压缩 active transcript。
- 不给 `sessions cleanup --archive` 增加自动 gzip 选项。
- 不做批量压缩。
- 不做跨目录 archive 压缩。

## 验收

- TS unit 覆盖 archive compress、compressed list/replay/search/delete/restore。
- Integration 覆盖 CLI compress、缺 `--yes`、compressed replay/search/restore。
- CLI smoke 覆盖 gzip archive 端到端。
- `./tools/check.sh` 全量通过。
