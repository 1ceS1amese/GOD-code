# Phase 83: Session advanced recovery

Phase83 implements a bounded session recovery layer on top of the existing transcript history, replay, resume, archive, compaction, and search/index features. The goal is to make recovery from broken or stale sessions more explicit and safer without restoring live processes, replaying historical tools, or changing the Python Engine protocol.

This is a TS Host implementation. It does not restore live processes, replay historical tools, or add Python Engine JSON-RPC methods.

## Goals

- Add a clear recovery workflow for transcript-backed sessions that may be incomplete, oversized, archived, compressed, or partially corrupt.
- Reuse existing session history primitives instead of introducing a new storage backend.
- Provide a dry-run recovery plan before creating a recovered session.
- Let users recover a usable context from a transcript while preserving append-only original history.
- Integrate existing compaction strategies when restored context would exceed practical prompt size.
- Keep recovery deterministic and inspectable in JSON output.
- Keep normal `sessions resume` behavior unchanged.
- Avoid executing historical tool calls during recovery.

## Non-goals

- No live process restore.
- No replaying or re-executing historical tools.
- No automatic background daemon.
- No transcript mutation or destructive repair.
- No provider-backed summarization in this phase.
- No vector retrieval, embeddings, or semantic recovery.
- No Python Engine replay RPC.
- No JSON-RPC method changes.
- No provider API changes.
- No archive format changes.
- No automatic unbounded transcript root discovery.

## Existing boundaries

Current related behavior:

- Phase21 `sessions resume` rebuilds model context from transcript messages and starts a new Engine session.
- Phase23 / Phase24 / Phase30 provide archive replay, restore, search, delete, and gzip handling.
- Phase56 / Phase62 provide prompt-time compaction strategies inside Python `PromptBuilder`.
- Phase75 to Phase79 provide global search, root discovery diagnostics, watch diagnostics, and index watch-refresh.

Phase83 stays on the TS Host transcript/history side:

```text
sibling transcript files / archives
  -> ts-host/transcripts/history.ts
  -> recovery planner
  -> optional context normalization / compaction hint
  -> existing runGodCodeResumedSession(...)
  -> existing create_session.initial_messages
```

The Python Engine should continue to see ordinary `initial_messages`.

## Implemented CLI surface

Adds a new `sessions recover` command:

```bash
god-code sessions recover <session_id> --dry-run
god-code sessions recover <session_id> --json --dry-run
god-code sessions recover <session_id> --json <prompt>
god-code sessions recover <session_id> --json --raw-events <prompt>
```

Optional flags:

```text
--archive
--include-archived
--max-restored-messages <n>
--strategy <strict|best-effort|compact>
--no-tool-results
--preview-chars <n>
--approval-mode <never|prompt>
```

Initial defaults:

- `--strategy strict`
- `--preview-chars 160`
- source is the active transcript directory unless `--archive` or `--include-archived` is used.
- `--dry-run` does not start Python Engine.

## Recovery strategies

### strict

`strict` should fail if transcript entries are malformed in ways that would make model context ambiguous.

Expected failures:

- missing session file.
- no replayable messages.
- orphan `tool_result` without a known `tool_call_id`.
- malformed `tool_call` payload.
- malformed `tool_result` payload.
- conflicting session ids inside one source file.

### best-effort

`best-effort` should skip invalid entries and report what was skipped.

Rules:

- Keep valid `user` / `assistant` messages.
- Keep valid `tool_call` + matching `tool_result` pairs.
- Drop orphan tool results unless `--no-tool-results` already removes them.
- Do not synthesize fake tool outputs.
- Include skipped-entry diagnostics in JSON.

### compact

`compact` should build a deterministic recovery context when a transcript is too large for practical resume.

Rules:

- Reuse TS transcript-to-message reconstruction first.
- Preserve the latest coherent tool-call/result flow.
- Add one generated recovery summary message for older context.
- The summary must be deterministic and bounded.
- Do not write the generated summary into the original transcript.
- The recovered Engine session may write its own new transcript as usual.

This phase should not call Python `PromptBuilder` to pre-compact. It should produce an initial-message set that is safe to pass into the existing resumed session path. Python prompt-time compaction can still run later if configured.

## Implemented JSON output

Dry-run JSON:

```json
{
  "session_id": "source-session",
  "source": {
    "kind": "active",
    "path": "/path/to/session.jsonl",
    "compressed": false
  },
  "strategy": "strict",
  "recoverable": true,
  "entry_count": 42,
  "restored_message_count": 18,
  "skipped_entry_count": 0,
  "warnings": [],
  "preview": [
    {
      "kind": "user",
      "content_preview": "..."
    }
  ]
}
```

Run JSON extends the existing resume JSON:

```json
{
  "status": "success",
  "recovered_from_session_id": "source-session",
  "recovery_strategy": "best-effort",
  "restored_message_count": 18,
  "skipped_entry_count": 2,
  "assistant_message": {
    "role": "assistant",
    "content": "..."
  }
}
```

With `--raw-events`, keep the same raw event shape used by `run` and `sessions resume`.

## Implemented touch points

- `ts-host/src/transcripts/history.ts`
  - Adds a recovery planner that returns a typed recovery plan.
  - Adds strict and best-effort validation details.
  - Adds compact strategy helper for deterministic recovery summary.
- `ts-host/src/headless/godCodeRunSession.ts`
  - Adds `runGodCodeRecoveredSession(...)` with explicit recovery metadata.
- `ts-host/src/cli/main.ts`
  - Adds `sessions recover` parser and renderer.
  - Reuses `--approval-mode`, `--json`, and `--raw-events` conventions from `run` / `resume`.
- `ts-host/test/transcriptHistory.test.ts`
  - Adds planner tests for strict, best-effort, compact, archive, malformed, and preview output.
- `integration/cli_integration.py`
  - Adds one dry-run JSON case and one recovered run JSON/raw-events case.
- `tools/run-cli-smoke.sh`
  - Adds smoke coverage for dry-run, recovered run, cleanup, and usage errors.
- Docs:
  - `README.md`
  - `PROJECT_PLAN.md`
  - `INTERNAL_DESIGN.md`
  - `ARCHITECTURE.md`
  - `EXTENSION_POINTS.md`
  - `protocol/README.md`

## Safety and determinism rules

- Recovery never edits the source transcript.
- Recovery never deletes archives.
- Recovery never executes historical tools.
- Recovery never reads transcript payloads outside the explicitly selected source unless the user passes an explicit root / archive flag already supported by transcript history commands.
- Generated summaries must be clearly labeled as recovery summaries.
- JSON diagnostics must include counts, warnings, and skipped-entry reasons, but should not dump entire large transcript payloads by default.

## Implemented protocol boundary

Phase83 does not add JSON-RPC methods. Recovered sessions still use:

```text
create_session.initial_messages
submit_turn.prompt
```

The Engine should not learn whether messages came from `resume` or `recover` except through ordinary message content.

## Tests

- `sessions recover <id> --json --dry-run` reports a recoverable plan for a valid transcript.
- Missing session id and missing prompt are usage errors.
- `--raw-events` without `--json` is a usage error.
- Strict strategy rejects malformed tool flow.
- Best-effort strategy skips malformed entries and reports skipped counts.
- Compact strategy produces a bounded recovery summary plus recent messages.
- Archive source can be selected explicitly.
- Source transcript remains byte-identical after dry-run and recovered run.
- Recovered run creates a new session id.
- Raw events still include `session_started`, `tool_call_requested`, and `turn_finished`.

## Verification

Relevant commands:

```bash
./tools/run-ts-tests.sh transcriptHistory.test.ts --run
cd ts-host && npm run build
cd ..
./tools/run-integration-tests.sh
./tools/run-cli-smoke.sh
./tools/check.sh
```

## Acceptance criteria

- Phase83 has a documented `sessions recover` workflow.
- Dry-run can inspect recovery without starting Python Engine.
- Strict / best-effort / compact strategies have deterministic semantics.
- Recovery reuses existing transcript and resume infrastructure.
- Original transcripts and archives are not mutated.
- Historical tools are not re-executed.
- No Python Engine JSON-RPC method, provider API, transcript schema, or archive format change is required.
