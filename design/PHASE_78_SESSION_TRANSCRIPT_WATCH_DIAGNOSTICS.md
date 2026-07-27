# Phase 78: Session transcript watch diagnostics

Phase78 implements short-lived transcript filesystem watch diagnostics. It builds on Phase75 global transcript search, Phase76 transcript root discovery, and Phase77 discovery-backed global search by adding a safe way to observe transcript file changes under explicitly selected transcript roots.

## Goals

- Add an explicit `god-code sessions watch` diagnostic command for transcript root file changes.
- Support direct transcript roots and current-root inclusion.
- Optionally reuse Phase76 bounded discovery for explicit workspace/search roots.
- Observe active transcript files by default and archived transcript files only with an explicit flag.
- Emit bounded text and JSON diagnostics for create / modify / delete / rename-like file events.
- Avoid transcript payload parsing; file names and minimal metadata are enough.
- Keep the watcher short-lived and tied to one CLI process.
- Provide deterministic limits through `--max-events` and `--timeout-ms`.
- Keep the feature TS Host local-only and offline.
- Avoid Python Engine, provider, tool execution, MCP, plugin runtime, transcript JSONL schema, search-index writes, or JSON-RPC method changes.

## Non-goals

- No background daemon, persistent watcher, or cross-command subscription.
- No automatic home-directory, parent-workspace, drive, or arbitrary disk watch.
- No symlink traversal.
- No implicit root discovery unless `--search-root` is explicitly provided.
- No automatic search-index refresh, global index refresh, transcript repair, compaction, migration, or mutation.
- No transcript payload parsing, semantic search, summarization, or LLM involvement.
- No live session recovery or provider context recovery.
- No cross-root delete / archive / restore / compress operation.
- No JSON-RPC method changes.

## Current state

Existing session history commands can read, search, index, discover, and diagnose transcript roots:

```bash
god-code sessions list
god-code sessions search <query>
god-code sessions timeline <session_id>
god-code sessions index refresh
god-code sessions global-search <query> --root <transcript_dir>
god-code sessions roots --search-root <workspace>
god-code sessions global-search <query> --search-root <workspace>
```

Current limitation:

- Users can inspect existing transcript state, but cannot run a bounded diagnostic that observes newly written transcript files.
- Phase32 explicitly avoided filesystem watchers for index refresh.
- Phase75 / Phase77 search commands are one-shot reads, not change observers.
- There is no safe intermediate step toward future background watcher work.

## CLI surface

Implemented command:

```bash
god-code sessions watch --include-current
god-code sessions watch --root .god-code/transcripts --max-events 5 --timeout-ms 10000
god-code sessions watch --root repo-a/.god-code/transcripts --root repo-b/.god-code/transcripts --include-archive --json
god-code sessions watch --search-root /work/projects --discovery-max-depth 3 --discovery-limit 50 --json
```

Implemented flags:

- `--root <transcript_dir>`: direct transcript root to watch. May be repeated.
- `--include-current`: include the normal `resolveTranscriptDir(process.cwd())` transcript root.
- `--search-root <dir>`: explicit workspace/search root under which transcript roots may be discovered before watching. May be repeated.
- `--discovery-max-depth <n>`: positive bounded traversal depth for discovery. Default matches Phase76 / Phase77 (`3`), cap matches (`8`).
- `--discovery-limit <n>`: positive bounded maximum number of discovered transcript roots. Default matches Phase76 / Phase77 (`100`), cap matches (`1000`).
- `--include-archive`: watch each root's `archive/` directory in addition to active transcript files.
- `--max-events <n>`: positive bounded maximum number of events to collect. Default is `20`; cap is `1000`.
- `--timeout-ms <n>`: positive bounded command lifetime. Default is `30000`; cap is `300000`.
- `--json`: emit structured output.

Rules:

- At least one direct root, current root, or discovery search root must be provided.
- Direct roots are watched before discovered roots.
- Duplicate direct/discovered roots are removed after path normalization while preserving first occurrence.
- Missing direct transcript roots produce per-root diagnostics and do not abort other valid roots.
- Missing discovery search roots produce discovery diagnostics and do not abort other valid discovery roots.
- Discovery uses Phase76 semantics with `includeEmpty=false`.
- Watchers only observe files directly under the transcript root and, when requested, directly under `<root>/archive`.
- Event collection stops when `--max-events` is reached or `--timeout-ms` expires.
- Timeout without events is a successful diagnostic with `timed_out=true`, not a crash.
- The command must close all watchers before exiting.

## Event model

The watch diagnostic normalizes filesystem notifications into stable event records:

```ts
type TranscriptWatchScope = "active" | "archive";
type TranscriptWatchEventKind = "created" | "modified" | "deleted" | "renamed" | "unknown";

interface TranscriptWatchEvent {
  root: string;
  rootLabel: string;
  scope: TranscriptWatchScope;
  kind: TranscriptWatchEventKind;
  file: string;
  path: string;
  timestamp: string;
  sizeBytes?: number;
  mtimeMs?: number;
}
```

Rules:

- Only `*.jsonl` files are relevant in active roots.
- `*.jsonl` and `*.jsonl.gz` files are relevant in archive roots.
- `search-index.json` changes are ignored in Phase78.
- File payload contents are not read.
- If the platform only reports `rename`, the implementation may stat the file to classify create/delete when possible.
- If classification is ambiguous, emit `kind: "unknown"` instead of guessing.

## Result model

Implemented result shape:

```ts
interface TranscriptWatchRootResult {
  root: string;
  rootLabel: string;
  ok: boolean;
  error?: string;
  watchedScopes: TranscriptWatchScope[];
}

interface TranscriptWatchDiscoverySummary {
  searchRoots: TranscriptRootDiscoverySearchRoot[];
  discoveredRoots: TranscriptRootDiscoveryCandidate[];
  maxDepth: number;
  limit: number;
  truncated: boolean;
}

interface TranscriptWatchResult {
  type: "transcript_watch";
  includeArchive: boolean;
  maxEvents: number;
  timeoutMs: number;
  eventCount: number;
  timedOut: boolean;
  discovery: TranscriptWatchDiscoverySummary | null;
  roots: TranscriptWatchRootResult[];
  events: TranscriptWatchEvent[];
}
```

JSON output uses snake_case keys.

Example:

```json
{
  "type": "transcript_watch",
  "include_archive": true,
  "max_events": 5,
  "timeout_ms": 10000,
  "event_count": 1,
  "timed_out": false,
  "discovery": null,
  "roots": [
    {
      "root": ".god-code/transcripts",
      "root_label": ".god-code/transcripts",
      "ok": true,
      "watched_scopes": ["active", "archive"]
    }
  ],
  "events": [
    {
      "root": ".god-code/transcripts",
      "root_label": ".god-code/transcripts",
      "scope": "active",
      "kind": "created",
      "file": "session-1.jsonl",
      "path": ".god-code/transcripts/session-1.jsonl",
      "timestamp": "2026-06-21T00:00:00.000Z",
      "size_bytes": 128,
      "mtime_ms": 1782000000000
    }
  ]
}
```

## Text output

Implemented text output:

```text
GOD-code transcript watch:
roots: 1
include_archive: true
max_events: 5
timeout_ms: 10000
events: 1
timed_out: false

[1] .god-code/transcripts
  scopes: active, archive

Events:
  - active created .god-code/transcripts/session-1.jsonl
```

When discovery is used, include a compact discovery block equivalent to Phase77's discovery diagnostics.

Text output must not include transcript payload contents.

## Runtime boundary

The implemented flow stays inside the TS Host CLI:

```text
ts-host CLI sessions watch
  -> parse direct roots and optional discovery search roots
  -> run bounded transcript root discovery only when --search-root is present
  -> merge and dedupe direct/discovered roots
  -> validate root directories
  -> start short-lived filesystem watchers for active and optional archive scopes
  -> collect bounded file events until max-events or timeout
  -> close watchers
  -> render text or JSON diagnostics
```

No Phase78 state enters:

- Python Engine runtime
- `initialize`
- `create_session`
- `submit_turn`
- provider clients
- transcript JSONL payload parsing
- search index build / refresh
- MCP payloads
- plugin runtime execution
- `HostToolRegistry.executeRequest(...)`

## Implementation touch points

Implemented code areas:

- `ts-host/src/transcripts/history.ts`
  - Added watch result/event types.
  - Added a short-lived watch helper that accepts resolved roots, includeArchive, maxEvents, timeoutMs, and optional discovery metadata.
  - Keeps watch logic independent from search index build/refresh.
- `ts-host/src/cli/main.ts`
  - Added `sessions watch` parser and handler.
  - Reuses direct-root, discovery-root, and root merge semantics from Phase77 where possible.
- `ts-host/test/transcriptHistory.test.ts`
  - Covers timeout behavior, event normalization, archive inclusion, invalid max events, and discovery metadata.
- `tools/run-cli-smoke.sh`
  - Adds a bounded smoke case that verifies `sessions watch --include-current --timeout-ms <small> --json` returns a stable timed-out diagnostic.
- Docs:
  - `README.md`
  - `PROJECT_PLAN.md`
  - `INTERNAL_DESIGN.md`
  - `ARCHITECTURE.md`
  - `EXTENSION_POINTS.md`
  - `protocol/README.md`

## Test coverage

- Direct-root watch returns root diagnostics and closes cleanly on timeout.
- `--include-current` watches the current transcript root.
- `--include-archive` watches archive scope and filters to `.jsonl` / `.jsonl.gz`.
- `--search-root` discovers roots with bounded depth/limit and attaches discovery diagnostics.
- Duplicate direct/discovered roots are watched once.
- Missing direct roots and missing discovery search roots are reported without aborting valid roots.
- Created/modified/deleted transcript files produce normalized event records where platform behavior allows.
- `search-index.json` and unrelated file names are ignored.
- `--max-events` stops collection deterministically.
- `--timeout-ms` stops collection deterministically with `timed_out=true`.
- JSON and text output do not include transcript payload contents.

## Verification

Implementation checks:

```bash
cd ts-host
npm run build
npm test -- transcriptHistory.test.ts --run
cd ..
./tools/run-cli-smoke.sh
./tools/check.sh
```

## Acceptance criteria

- `god-code sessions watch --include-current --json` returns a bounded `transcript_watch` diagnostic.
- `god-code sessions watch --root <transcript_dir> --max-events <n> --timeout-ms <n>` observes transcript file changes and exits after the configured bound.
- `god-code sessions watch --search-root <workspace> --json` uses bounded discovery before watching.
- The implementation does not add a background daemon, persistent watcher, automatic index refresh, transcript payload parsing, Python Engine changes, or JSON-RPC changes.

## Phase600 lifecycle integration

Phase600 preserves the Phase78 command, result, discovery, event, and JSON contracts while strengthening the short-lived watcher shutdown path:

- Every successful active/archive watcher is tracked with its owning root diagnostic.
- Timeout and event-bound shutdown attempts every watcher close even when one close throws synchronously.
- Existing root setup/validation errors remain primary; cleanup-only uncertainty uses the fixed root error `transcript watcher cleanup failed`.
- Pending filesystem event promises use a two-branch observer instead of a bare `finally`, so unexpected rejection cannot create an unhandled derivative promise.
- Watcher cleanup cannot prevent the outer bounded watch promise from resolving.
