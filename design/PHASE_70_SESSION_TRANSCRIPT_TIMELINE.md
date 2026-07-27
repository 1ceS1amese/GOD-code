# Phase 70: Session transcript timeline diagnostics

Phase70 implements a local transcript timeline view for session history. Earlier session phases added list/replay/search/resume, retention cleanup, archive management, gzip compression, and a persistent search index. This phase focuses on a compact per-session timeline that helps users understand what happened in one run without replaying full payloads or starting the Python Engine.

The first implementation is local-only, non-mutating, bounded-preview by default, and diagnostic-first.

## Goals

- Add an explicit CLI surface for inspecting one transcript session as an event timeline.
- Support both active and archived transcript sessions.
- Keep the feature entirely in the TS Host session-history layer.
- Reuse existing JSONL / `.jsonl.gz` transcript readers and summary helpers.
- Provide text output for humans and JSON output for tooling.
- Show bounded, sanitized previews by default instead of raw full payloads.
- Include useful derived metadata: entry count, turn count, first / last timestamp, duration, entry type counts, tool event counts, and error-like event counts.
- Preserve existing `sessions replay`, `sessions search`, `sessions index`, `sessions archive`, and `sessions resume` behavior.
- Avoid Python Engine, provider, tool execution, MCP, plugin, or JSON-RPC changes.

## Non-goals

- No TUI, web UI, graph renderer, or interactive timeline viewer in Phase70.
- No transcript rewrite, migration, compaction, or repair.
- No LLM-generated summary of transcript content.
- No vector search, fuzzy matching, or semantic clustering.
- No automatic use of the persistent search index.
- No cross-directory global transcript discovery.
- No live-process inspection or live session recovery.
- No raw secret scanning or redaction engine beyond bounded previews and existing JSON parsing.
- No JSON-RPC method changes.

## Current state

Existing session history commands:

```text
god-code sessions list
god-code sessions replay <session_id>
god-code sessions replay <session_id> --json
god-code sessions resume <session_id> <prompt>
god-code sessions search <query>
god-code sessions cleanup --older-than-days <n>
god-code sessions index build/refresh/search
god-code sessions archive list/replay/search/restore/compress/delete
god-code sessions delete <session_id> --yes
```

Current limitation:

- `sessions replay` is useful for reading full session content, but it is too verbose for quick structural debugging.
- `sessions search` and `sessions index search` answer "where did this text appear?", not "what happened in this session?"
- Archived sessions have replay/search/list support, but no compact timeline view.
- There is no stable JSON shape for per-entry timeline diagnostics.

## Implemented CLI surface

Add active-session timeline diagnostics:

```bash
god-code sessions timeline <session_id>
god-code sessions timeline <session_id> --json
god-code sessions timeline <session_id> --no-preview
god-code sessions timeline <session_id> --preview-chars 120
```

Add archived-session timeline diagnostics under the existing archive namespace:

```bash
god-code sessions archive timeline <session_id>
god-code sessions archive timeline <session_id> --json
god-code sessions archive timeline <session_id> --no-preview
god-code sessions archive timeline <session_id> --preview-chars 120
```

Rules:

- Active timeline reads only active `<transcriptDir>/<session_id>.jsonl`.
- Archive timeline reads only `<transcriptDir>/archive/<session_id>.jsonl` or `.jsonl.gz`.
- Missing sessions use the same not-found behavior as replay.
- `--preview-chars <n>` must be a positive bounded integer.
- `--no-preview` suppresses content previews but still shows event metadata.
- `--no-preview` and `--preview-chars` are mutually exclusive.
- The command does not refresh or read `search-index.json`.
- The command does not mutate transcripts.

## Text output shape

Example:

```text
GOD-code session timeline:
session: 867ce8ae-b99b-440e-add8-a90f723f495d
scope: active
entries: 12
turns: 1
first: 2026-06-20T10:00:00.000Z
last: 2026-06-20T10:00:04.250Z
duration_ms: 4250
types: user=1 assistant=1 tool_call=1 tool_result=1 event=8

  #0 2026-06-20T10:00:00.000Z turn=... type=user preview="list files"
  #1 2026-06-20T10:00:01.000Z turn=... type=assistant preview="I will inspect..."
  #2 2026-06-20T10:00:02.000Z turn=... type=tool_call tool=ListFiles
  #3 2026-06-20T10:00:03.000Z turn=... type=tool_result tool=ListFiles status=ok
```

Text output should be deterministic:

- Sort by transcript file order, not timestamp re-sorting.
- Use stable field labels.
- Use relative compact labels only for timeline entries.
- Do not print raw JSON payloads.

## JSON output shape

Example:

```json
{
  "session_id": "867ce8ae-b99b-440e-add8-a90f723f495d",
  "scope": "active",
  "file_path": ".god-code/transcripts/867ce8ae-b99b-440e-add8-a90f723f495d.jsonl",
  "entry_count": 12,
  "turn_count": 1,
  "first_timestamp": "2026-06-20T10:00:00.000Z",
  "last_timestamp": "2026-06-20T10:00:04.250Z",
  "duration_ms": 4250,
  "type_counts": {
    "user": 1,
    "assistant": 1,
    "tool_call": 1,
    "tool_result": 1
  },
  "tool_event_count": 2,
  "error_like_count": 0,
  "preview_chars": 120,
  "entries": [
    {
      "index": 0,
      "timestamp": "2026-06-20T10:00:00.000Z",
      "turn_id": "turn-1",
      "type": "user",
      "payload_bytes": 32,
      "preview": "list files"
    }
  ]
}
```

JSON should be stable enough for CLI tests and external tooling, but it should not expose full transcript payloads by default.

## Timeline entry derivation

For each `TranscriptJsonlEntry`, derive:

- `index`: zero-based file-order index.
- `timestamp`: original entry timestamp.
- `turn_id`: original turn id.
- `type`: original entry type.
- `payload_bytes`: UTF-8 byte length of the serialized payload.
- `role`: if payload has an obvious string role.
- `tool_name`: if payload has an obvious tool name.
- `tool_call_id`: if payload has an obvious tool call id.
- `status`: if payload has an obvious status / error marker.
- `preview`: bounded text preview unless `--no-preview`.

Preview derivation should be conservative:

- Prefer short textual fields such as `content`, `text`, `message`, `prompt`, or `error.message`.
- Fall back to a compact serialized payload only when no obvious text field exists.
- Normalize whitespace.
- Truncate to `preview_chars`.
- Never print raw payload in text output.

## Runtime boundary

Timeline diagnostics stay in TS Host:

```text
ts-host CLI sessions timeline
  -> resolve transcript dir
  -> read active or archived transcript entries
  -> derive timeline summary and per-entry metadata
  -> render text or JSON
```

No timeline state enters:

- Python Engine runtime
- `initialize`
- `create_session`
- `submit_turn`
- provider clients
- tool execution requests
- MCP/plugin payloads
- transcript writer
- search index writer

## Interaction with existing session commands

- `sessions replay` remains the full-content view.
- `sessions timeline` becomes the compact structural view.
- `sessions search` remains direct scan search.
- `sessions index search` remains persistent-index search.
- `sessions resume` still restores only model-context messages from transcript.
- `sessions archive timeline` mirrors archived replay without moving or decompressing files permanently.
- `sessions cleanup`, `archive restore`, `archive compress`, `archive delete`, and `sessions delete` remain the only mutating session-history commands.

## Error handling and sanitization

Errors should be clear and local:

- Missing session id: usage error.
- Unknown flag: usage error.
- Missing active session: `Transcript session not found: <session_id>`.
- Missing archived session: `Archived transcript session not found: <session_id>`.
- Invalid `--preview-chars`: positive bounded integer error.
- Corrupt JSONL: include file path and line number through existing parser behavior.

Diagnostics should not:

- Start Python Engine.
- Execute tools.
- Contact providers.
- Print full payload JSON.
- Print environment variables.
- Modify transcript files.

## Implementation touch points

Expected implementation files:

- `ts-host/src/transcripts/history.ts`
- `ts-host/src/cli/main.ts`
- `ts-host/test/transcriptHistory.test.ts`
- `tools/run-cli-smoke.sh`
- `README.md`
- `PROJECT_PLAN.md`
- `INTERNAL_DESIGN.md`
- `ARCHITECTURE.md`
- `EXTENSION_POINTS.md`
- `protocol/README.md`

Python files should not need changes.

## Test plan

Unit / integration tests:

- Active timeline text output for a fixture transcript.
- Active timeline JSON output with summary and entries.
- Archived timeline JSON output from `.jsonl`.
- Archived timeline JSON output from `.jsonl.gz`.
- `--no-preview` suppresses previews.
- `--preview-chars` truncates previews deterministically.
- Invalid preview size is rejected.
- `--no-preview` and `--preview-chars` are mutually exclusive.
- Text output does not include raw serialized payloads.
- Timeline does not create, modify, delete, or refresh transcript index files.

Smoke tests:

- Create a run transcript with fake provider.
- Run `sessions timeline <session_id> --json`.
- Run `sessions timeline <session_id> --no-preview`.
- Archive a session and run `sessions archive timeline <session_id> --json`.

## Documentation updates

Implementation updated:

- README session history command list.
- `PROJECT_PLAN.md` session history route.
- `INTERNAL_DESIGN.md` phase table and session-history limitations.
- `ARCHITECTURE.md` transcript history boundary.
- `EXTENSION_POINTS.md` session history extension guidance.
- `protocol/README.md` with an explicit note that Phase70 adds no JSON-RPC methods.

## Boundaries

- Timeline is a TS Host local diagnostic command.
- Timeline is not replay, resume, search, or export.
- Timeline does not change transcript schema.
- Timeline does not rely on search index.
- Timeline does not attempt semantic summarization.
- JSON-RPC wire contract remains unchanged.

## Validation target

- `npm test -- transcriptHistory.test.ts --run`
- `npm run build`
- `./tools/run-cli-smoke.sh`
- `./tools/check.sh`
