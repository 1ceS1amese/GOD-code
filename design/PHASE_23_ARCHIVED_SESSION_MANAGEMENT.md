# Phase 23: Archived Session Management

Phase23 为 Phase22 产生的 archived transcript 增加本地查看、回放和恢复能力。

它不启动 Python Engine，不新增 JSON-RPC 方法，不恢复 live session。所有动作都由 TS Host 直接读取或移动 `<transcriptDir>/archive/*.jsonl`。

## CLI 行为

```bash
god-code sessions archive list
god-code sessions archive list --json
god-code sessions archive replay <session_id>
god-code sessions archive replay <session_id> --json
god-code sessions archive restore <session_id> --yes
god-code sessions archive restore <session_id> --yes --json
```

## 契约边界

- archive root 固定为 `<transcriptDir>/archive/`。
- archive list 只读取直属 `*.jsonl`，不递归。
- archive replay 复用现有 transcript replay renderer。
- archive restore 会把 `<transcriptDir>/archive/<session_id>.jsonl` 移回 `<transcriptDir>/<session_id>.jsonl`。
- restore 必须显式传 `--yes`。
- active 目标文件已存在时 restore 失败，不覆盖、不合并。
- active `sessions list/search/replay/resume/cleanup` 仍不读取 archive 文件。

## JSON 输出

`archive list --json` 输出 archived session summary 数组，字段与 active `listTranscriptSessions(...)` summary 保持一致。

`archive replay --json` 复用现有 replay JSON：

```json
{
  "session_id": "session-1",
  "entry_count": 1,
  "entries": []
}
```

`archive restore --json` 输出：

```json
{
  "session_id": "session-1",
  "restored": true,
  "source_path": ".god-code/transcripts/archive/session-1.jsonl",
  "restored_path": ".god-code/transcripts/session-1.jsonl"
}
```

## 实现

- `ts-host/src/transcripts/history.ts` 提供 archived list / read / restore helper。
- `ts-host/src/cli/main.ts` 增加 `sessions archive` 子命令组。
- 复用现有 JSONL parser、session summary、safe session id 和 replay renderer。

## 不做

- Phase23 本身不做 gzip 压缩；该能力已在 Phase30 补齐。
- Phase23 本身不做 archived search；该能力已在 Phase24 补齐。
- 不做批量 restore。
- Phase23 本身不做 archive delete；该能力已在 Phase24 补齐。
- 不做跨目录全局历史搜索。

## 校验

- TS unit 覆盖 archived list / replay / restore、archive 目录不存在、active 目标冲突。
- Integration 覆盖 cleanup 生成 archive 后的 list / replay / restore。
- CLI smoke 覆盖 archive list / replay / restore 和 restore 缺 `--yes`。
