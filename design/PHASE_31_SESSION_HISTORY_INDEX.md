# Phase 31: Session History Search Index

Phase31 为 transcript history 增加本地持久搜索索引，避免每次 indexed search 都重新扫描 JSONL / gzip 文件。

本阶段仍然是 TS Host 本地能力：不启动 Python Engine，不新增 JSON-RPC 方法，不改变 transcript 写入格式。

## CLI

```bash
god-code sessions index build
god-code sessions index build --include-archive
god-code sessions index build --include-archive --json
god-code sessions index search <query>
god-code sessions index search <query> --json
```

## 行为

- index 文件写入 `<transcriptDir>/search-index.json`。
- 默认只索引 active `<transcriptDir>/*.jsonl`。
- `--include-archive` 额外索引 `<transcriptDir>/archive/*.jsonl` 和 `.jsonl.gz`。
- indexed search 只读取现有 index；缺 index 时提示先运行 `sessions index build`。
- 普通 `sessions search` 和 `sessions archive search` 继续保持直接扫描行为。
- index 记录 session summary、scope、source 文件大小/mtime、entry 类型和可搜索文本。

## JSON 输出

build:

```json
{
  "index_path": ".god-code/transcripts/search-index.json",
  "schema_version": 1,
  "generated_at": "2026-06-19T00:00:00.000Z",
  "transcript_dir": ".god-code/transcripts",
  "include_archive": true,
  "session_count": 2,
  "sessions": []
}
```

search:

```json
{
  "index_path": ".god-code/transcripts/search-index.json",
  "index_generated_at": "2026-06-19T00:00:00.000Z",
  "results": [
    {
      "scope": "archive",
      "summary": {},
      "matched_entry_count": 1,
      "matched_types": ["user"]
    }
  ]
}
```

## 不做

- Phase31 本身不做自动增量更新；该能力已在 Phase32 补齐。
- 不让普通 `sessions search` 隐式使用 index。
- 不做跨目录全局索引。
- 不做内容摘要、向量索引或模糊匹配。

## 验收

- TS unit 覆盖 index build、active / archive indexed search、缺 index 错误。
- Integration 覆盖 CLI build/search 和 archived gzip metadata。
- CLI smoke 覆盖 index build/search 端到端。
- `./tools/check.sh` 全量通过。
