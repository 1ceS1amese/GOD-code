# Phase 32: Session History Incremental Index Refresh

Phase32 在 Phase31 的持久 search index 基础上增加增量刷新能力，让 index 可以按文件 mtime / size 复用未变化 session，只重建新增或变化的 transcript。

本阶段仍然是 TS Host 本地能力：不启动 Python Engine，不新增 JSON-RPC 方法，不改变 transcript 写入格式。

## CLI

```bash
god-code sessions index refresh
god-code sessions index refresh --include-archive
god-code sessions index refresh --include-archive --json
god-code sessions index search <query> --refresh
god-code sessions index search <query> --refresh --include-archive --json
```

## 行为

- `index refresh` 读取 `<transcriptDir>/search-index.json`；缺失时创建新 index。
- refresh 会扫描当前 active transcript；`--include-archive` 额外扫描 archived `.jsonl` / `.jsonl.gz`。
- source 文件路径、scope、mtime 和 size 未变化时复用旧 index session。
- 新增 source 计入 `added_count`，变化 source 计入 `updated_count`，已删除 source 计入 `removed_count`，复用 source 计入 `unchanged_count`。
- `index search --refresh` 会在搜索前执行一次 refresh，再读取 index 搜索。
- 普通 `sessions search` 和不带 `--refresh` 的 `sessions index search` 不会隐式刷新。

## JSON 输出

```json
{
  "index_path": ".god-code/transcripts/search-index.json",
  "schema_version": 1,
  "generated_at": "2026-06-19T00:00:00.000Z",
  "transcript_dir": ".god-code/transcripts",
  "include_archive": true,
  "session_count": 3,
  "created": false,
  "added_count": 1,
  "updated_count": 1,
  "removed_count": 1,
  "unchanged_count": 1
}
```

## 不做

- 不做文件系统 watcher。
- 不做后台自动刷新。
- 不让普通 `sessions search` 隐式使用或刷新 index。
- 不做跨目录全局索引。
- 不做内容 hash、向量索引或模糊匹配。

## 验收

- TS unit 覆盖缺 index refresh 创建、增量 added / updated / removed / unchanged。
- Integration 覆盖 CLI refresh 和 `index search --refresh`。
- CLI smoke 覆盖 stale index、refresh 后命中、search 前 refresh。
- `./tools/check.sh` 全量通过。
