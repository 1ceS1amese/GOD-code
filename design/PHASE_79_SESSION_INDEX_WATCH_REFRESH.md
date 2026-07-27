# Phase 79: Session index watch-refresh diagnostics

Phase79 implements explicit, short-lived watch-driven transcript search index refresh diagnostics. It builds on Phase32 incremental index refresh and Phase78 transcript watch diagnostics by letting users run one bounded CLI command that watches transcript file changes and refreshes the local search index after observed changes.

## Goals

- Add an explicit `god-code sessions index watch-refresh` diagnostic command.
- Reuse Phase78 short-lived transcript watch semantics for file change observation.
- Reuse Phase32 incremental `sessions index refresh` semantics for index updates.
- Keep the command local-only, bounded, and tied to one CLI process.
- Support direct transcript roots and `--include-current`.
- Optionally reuse Phase76 bounded discovery through explicit `--search-root`.
- Support active transcripts by default and archived transcripts only with `--include-archive`.
- Refresh only after relevant transcript file changes, or once at the end when requested by explicit options.
- Provide structured diagnostics that include watch metadata, refresh attempts, counts, errors, timeout state, and final index summary.
- Avoid transcript payload reads in the watch phase; payload parsing only happens inside the existing index refresh path.
- Avoid Python Engine, provider, tool execution, MCP, plugin runtime, transcript JSONL schema, or JSON-RPC method changes.

## Non-goals

- No background daemon, persistent watcher, or cross-command subscription.
- No automatic refresh outside this explicit command.
- No implicit home-directory, parent-workspace, drive, or arbitrary disk watch.
- No symlink traversal.
- No global persistent cross-root index.
- No cross-root mutation other than writing each selected root's existing local `search-index.json`.
- No vector index, semantic search, ranking model, or LLM summarization.
- No transcript repair, compaction, migration, redaction, or rewrite.
- No live session recovery or provider context recovery.
- No JSON-RPC method changes.

## Current state

Phase32 supports one-shot local index refresh:

```bash
god-code sessions index refresh
god-code sessions index refresh --include-archive --json
god-code sessions index search <query> --refresh --include-archive --json
```

Phase78 supports one-shot short-lived watch diagnostics:

```bash
god-code sessions watch --include-current --timeout-ms 30000 --json
god-code sessions watch --root .god-code/transcripts --max-events 5 --timeout-ms 10000
```

Current limitation:

- Users can refresh the index manually.
- Users can observe file changes manually.
- There is no explicit bounded command that combines both into "watch for transcript changes, then refresh index".
- Future daemon-like behavior needs an intermediate diagnostic that proves event handling, debounce, refresh composition, and output shape without starting a persistent service.

## CLI surface

Implemented command:

```bash
god-code sessions index watch-refresh --include-current
god-code sessions index watch-refresh --root .god-code/transcripts --timeout-ms 30000 --max-events 20 --json
god-code sessions index watch-refresh --root repo-a/.god-code/transcripts --root repo-b/.god-code/transcripts --include-archive --json
god-code sessions index watch-refresh --search-root /work/projects --discovery-max-depth 3 --discovery-limit 50 --json
```

Implemented flags:

- `--root <transcript_dir>`: direct transcript root whose local index may be refreshed. May be repeated.
- `--include-current`: include the normal `resolveTranscriptDir(process.cwd())` transcript root.
- `--search-root <dir>`: explicit workspace/search root under which transcript roots may be discovered before watching/refreshing. May be repeated.
- `--discovery-max-depth <n>`: positive bounded traversal depth for discovery. Default matches Phase76 / Phase77 / Phase78 (`3`), cap matches (`8`).
- `--discovery-limit <n>`: positive bounded maximum number of discovered transcript roots. Default matches Phase76 / Phase77 / Phase78 (`100`), cap matches (`1000`).
- `--include-archive`: include archived `.jsonl` / `.jsonl.gz` in refresh and watch archive directories.
- `--max-events <n>`: positive bounded maximum number of watch events to collect before refreshing/exiting. Default matches Phase78 (`20`), cap matches (`1000`).
- `--timeout-ms <n>`: positive bounded command lifetime. Default matches Phase78 (`30000`), cap matches (`300000`).
- `--debounce-ms <n>`: positive bounded delay after the latest relevant event before running refresh. Default is `250`; cap is `10000`.
- `--refresh-on-timeout`: run one refresh at timeout even if no relevant watch event was observed. Default is false.
- `--json`: emit structured output.

Rules:

- At least one direct root, current root, or discovery search root must be provided.
- Direct roots are processed before discovered roots.
- Duplicate direct/discovered roots are removed after path normalization while preserving first occurrence.
- Missing direct roots produce per-root diagnostics and do not abort other valid roots.
- Missing discovery search roots produce discovery diagnostics and do not abort other valid discovery roots.
- Discovery uses Phase76 semantics with `includeEmpty=false`.
- Watch phase observes the same relevant files as Phase78:
  - active: `*.jsonl`
  - archive: `*.jsonl` and `*.jsonl.gz` when `--include-archive`
  - ignore `search-index.json`
- Refresh phase uses Phase32 incremental refresh for each selected transcript root.
- If one or more events arrive, the command waits for the configured debounce delay before refreshing affected roots.
- The command exits when `--max-events` is reached and the final refresh finishes, or when `--timeout-ms` expires and any configured timeout refresh finishes.
- The command closes all watchers before exiting.

## Result model

Implemented result shape:

```ts
interface TranscriptIndexWatchRefreshRootResult {
  root: string;
  rootLabel: string;
  ok: boolean;
  error?: string;
  watchedScopes: TranscriptWatchScope[];
  eventCount: number;
  refreshCount: number;
  lastRefresh?: TranscriptSearchIndexRefreshResult;
}

interface TranscriptIndexWatchRefreshDiscoverySummary {
  searchRoots: TranscriptRootDiscoverySearchRoot[];
  discoveredRoots: TranscriptRootDiscoveryCandidate[];
  maxDepth: number;
  limit: number;
  truncated: boolean;
}

interface TranscriptIndexWatchRefreshResult {
  type: "transcript_index_watch_refresh";
  includeArchive: boolean;
  maxEvents: number;
  timeoutMs: number;
  debounceMs: number;
  refreshOnTimeout: boolean;
  eventCount: number;
  refreshCount: number;
  timedOut: boolean;
  discovery: TranscriptIndexWatchRefreshDiscoverySummary | null;
  roots: TranscriptIndexWatchRefreshRootResult[];
  events: TranscriptWatchEvent[];
}
```

JSON output uses snake_case keys and reuses Phase32 refresh JSON shape under `last_refresh`.

Example:

```json
{
  "type": "transcript_index_watch_refresh",
  "include_archive": true,
  "max_events": 20,
  "timeout_ms": 30000,
  "debounce_ms": 250,
  "refresh_on_timeout": false,
  "event_count": 2,
  "refresh_count": 1,
  "timed_out": false,
  "discovery": null,
  "roots": [
    {
      "root": ".god-code/transcripts",
      "root_label": ".god-code/transcripts",
      "ok": true,
      "watched_scopes": ["active", "archive"],
      "event_count": 2,
      "refresh_count": 1,
      "last_refresh": {
        "index_path": ".god-code/transcripts/search-index.json",
        "created": false,
        "added_count": 1,
        "updated_count": 1,
        "removed_count": 0,
        "unchanged_count": 4
      }
    }
  ],
  "events": []
}
```

## Text output

Implemented text output:

```text
GOD-code transcript index watch-refresh:
roots: 1
include_archive: true
max_events: 20
timeout_ms: 30000
debounce_ms: 250
events: 2
refreshes: 1
timed_out: false

[1] .god-code/transcripts
  scopes: active, archive
  events: 2
  refreshes: 1
  last_refresh: added=1 updated=1 removed=0 unchanged=4
```

When discovery is used, include a compact discovery block equivalent to Phase77 / Phase78 discovery diagnostics.

Text output must not include transcript payload contents.

## Runtime boundary

The planned flow stays inside the TS Host CLI:

```text
ts-host CLI sessions index watch-refresh
  -> parse direct roots and optional discovery search roots
  -> run bounded transcript root discovery only when --search-root is present
  -> merge and dedupe direct/discovered roots
  -> validate root directories
  -> start short-lived filesystem watchers for active and optional archive scopes
  -> collect bounded file events until max-events, debounce boundary, or timeout
  -> run Phase32 incremental refresh for affected roots
  -> close watchers
  -> render text or JSON diagnostics
```

No Phase79 state enters:

- Python Engine runtime
- `initialize`
- `create_session`
- `submit_turn`
- provider clients
- MCP payloads
- plugin runtime execution
- transcript JSONL schema
- `HostToolRegistry.executeRequest(...)`

## Interaction with existing index commands

- `sessions index refresh` remains a one-shot command.
- `sessions index search --refresh` remains a one-shot pre-search refresh.
- `sessions watch` remains a watch-only diagnostic and does not refresh indexes.
- `sessions index watch-refresh` is the only command that composes watch + refresh.
- Existing index schema and search semantics remain unchanged.

## Implementation touch points

Implemented code areas:

- `ts-host/src/transcripts/history.ts`
  - Added watch-refresh result/root types.
  - Added a bounded helper that composes Phase78 watch event collection with Phase32 `refreshTranscriptSearchIndex()`.
  - Reuses watch event filtering and rendering helpers where possible.
- `ts-host/src/cli/main.ts`
  - Added `sessions index watch-refresh` parser and handler.
  - Reuses direct-root, discovery-root, and root merge semantics from Phase77 / Phase78.
- `ts-host/test/transcriptHistory.test.ts`
  - Covers refresh-on-timeout, event-triggered refresh, discovery metadata, invalid bounds, and output rendering.
- `tools/run-cli-smoke.sh`
  - Adds a bounded smoke case for `sessions index watch-refresh --include-current --timeout-ms <small> --refresh-on-timeout --json`.
- Docs:
  - `README.md`
  - `PROJECT_PLAN.md`
  - `INTERNAL_DESIGN.md`
  - `ARCHITECTURE.md`
  - `EXTENSION_POINTS.md`
  - `protocol/README.md`

## Test coverage

- Direct-root watch-refresh returns root diagnostics and closes cleanly on timeout.
- `--refresh-on-timeout` performs one refresh even without file events.
- A created or modified active `*.jsonl` event triggers an incremental refresh.
- `--include-archive` watches archive scope and refreshes archived `.jsonl` / `.jsonl.gz`.
- `--search-root` discovers roots with bounded depth/limit and attaches discovery diagnostics.
- Duplicate direct/discovered roots are processed once.
- Missing direct roots and missing discovery search roots are reported without aborting valid roots.
- `search-index.json` and unrelated file names are ignored by the watch trigger.
- `--max-events`, `--timeout-ms`, and `--debounce-ms` are bounded and deterministic.
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

- `god-code sessions index watch-refresh --include-current --json` returns a bounded `transcript_index_watch_refresh` diagnostic.
- `god-code sessions index watch-refresh --root <transcript_dir> --refresh-on-timeout --json` can refresh that root's local `search-index.json`.
- `god-code sessions index watch-refresh --search-root <workspace> --json` uses bounded discovery before watching and refreshing.
- Existing `sessions index refresh`, `sessions index search --refresh`, and `sessions watch` behavior remains compatible.
- The implementation does not add a background daemon, persistent watcher, automatic refresh outside this explicit command, transcript schema changes, Python Engine changes, or JSON-RPC changes.
