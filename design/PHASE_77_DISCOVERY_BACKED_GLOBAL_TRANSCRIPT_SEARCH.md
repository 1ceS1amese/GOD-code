# Phase 77: Discovery-backed global transcript search

Phase77 implements a discovery-backed mode for Phase75 global transcript search by composing Phase76 transcript root discovery with the existing root-aware search path. Users can now search across transcript roots discovered under explicit workspace/search roots in one command, without introducing automatic home scanning, background watchers, persistent caches, or semantic search.

## Goals

- Extend `god-code sessions global-search` with bounded discovery inputs.
- Reuse Phase76's explicit, bounded, no-symlink transcript root discovery.
- Reuse Phase75's root-aware global transcript search and rendering semantics.
- Keep direct transcript roots and discovered transcript roots deterministic and deduped.
- Preserve existing `--root`, `--include-current`, `GOD_CODE_TRANSCRIPT_SEARCH_DIRS`, `--include-archive`, `--max-results`, and `--json` behavior.
- Provide discovery diagnostics in text and JSON output when discovery is requested.
- Keep the feature read-only: no transcript mutation, no archive mutation, no search-index writes, no persistent discovery cache.
- Avoid Python Engine, provider, tool execution, MCP, plugin runtime, transcript JSONL schema, or JSON-RPC method changes.

## Non-goals

- No implicit discovery when users only pass existing `--root` / `--include-current` inputs.
- No automatic home-directory, parent-workspace, drive, or arbitrary disk scan.
- No symlink traversal.
- No background watcher, daemon, persistent root registry, or long-lived discovery cache.
- No global persistent search index or cross-root index refresh.
- No semantic/vector/fuzzy search, ranking model, or LLM summarization.
- No cross-root delete, archive, restore, compress, or repair operation.
- No remote sync or marketplace-style transcript sharing.
- No JSON-RPC method changes.

## Current state

Phase75 added explicit root-aware search:

```bash
god-code sessions global-search <query> --root repo-a/.god-code/transcripts --root repo-b/.god-code/transcripts
```

Phase76 added explicit bounded discovery:

```bash
god-code sessions roots --search-root /work/projects --max-depth 3 --limit 100 --json
```

The limitation addressed by Phase77:

- Users must run `sessions roots`, copy the discovered transcript roots, then pass them back as repeated `--root` flags to `sessions global-search`.
- `sessions global-search` does not expose discovery diagnostics when users want to search multiple workspaces.
- There is no one-shot path for "search this bounded set of workspace roots".

## CLI surface

The existing command remains the single entry point:

```bash
god-code sessions global-search <query> --root .god-code/transcripts
god-code sessions global-search <query> --search-root /work/projects --discovery-max-depth 3 --json
god-code sessions global-search <query> --include-current --search-root ../other-workspaces --include-archive
god-code sessions global-search <query> --root ./manual-root --search-root ./workspace --discovery-limit 50 --max-results 100
```

Implemented new flags:

- `--search-root <dir>`: explicit workspace/search root under which transcript roots may be discovered. May be repeated.
- `--discovery-max-depth <n>`: positive bounded traversal depth for discovery. Default matches Phase76 (`3`) and cap matches Phase76 (`8`).
- `--discovery-limit <n>`: positive bounded maximum number of discovered transcript roots. Default matches Phase76 (`100`) and cap matches Phase76 (`1000`).

Existing flags remain:

- `--root <transcript_dir>`: direct transcript root to search. May be repeated.
- `--include-current`: include the current `resolveTranscriptDir(process.cwd())` transcript root directly.
- `--include-archive`: include archived transcripts for every searched root.
- `--max-results <n>`: cap session-level search matches after deterministic ordering.
- `--json`: emit structured output.

Rules:

- At least one direct root or discovery search root must be provided through `--root`, `--include-current`, `GOD_CODE_TRANSCRIPT_SEARCH_DIRS`, or `--search-root`.
- `--search-root` entries are workspace/search roots, not required to be transcript roots.
- `--root` and `GOD_CODE_TRANSCRIPT_SEARCH_DIRS` entries remain direct transcript roots.
- Discovery is opt-in only; existing direct-root global search must not start discovery.
- Discovery uses Phase76 semantics with `includeEmpty=false` by default.
- Direct roots are searched before discovered roots.
- Duplicate roots are removed after path normalization while preserving first occurrence across direct and discovered roots.
- Missing or unreadable discovery search roots produce discovery diagnostics and do not abort other roots.
- Missing or invalid transcript roots still produce per-root search diagnostics through existing Phase75 semantics.
- Invalid search-root values, invalid depth/limit values, empty query, or invalid direct-root env JSON are command errors.

## Result model

The existing `TranscriptGlobalSearchResult` gained discovery metadata when `--search-root` is used:

```ts
interface TranscriptGlobalSearchDiscoverySummary {
  searchRoots: TranscriptRootDiscoverySearchRoot[];
  discoveredRoots: TranscriptRootDiscoveryCandidate[];
  maxDepth: number;
  limit: number;
  truncated: boolean;
}

interface TranscriptGlobalSearchResult {
  type: "transcript_global_search";
  query: string;
  includeArchive: boolean;
  maxResults: number | null;
  discovery: TranscriptGlobalSearchDiscoverySummary | null;
  roots: TranscriptGlobalSearchRootResult[];
  totalMatches: number;
  truncated: boolean;
}
```

JSON output uses snake_case keys:

```json
{
  "type": "transcript_global_search",
  "query": "provider error",
  "include_archive": true,
  "max_results": 100,
  "discovery": {
    "max_depth": 3,
    "limit": 100,
    "truncated": false,
    "search_roots": [
      {
        "search_root": "../workspaces",
        "ok": true,
        "discovered_count": 2
      }
    ],
    "discovered_roots": [
      {
        "root": "../workspaces/repo-a/.god-code/transcripts",
        "root_label": "../workspaces/repo-a/.god-code/transcripts",
        "search_root": "../workspaces",
        "active_file_count": 4,
        "archive_file_count": 1,
        "has_search_index": true
      }
    ]
  },
  "roots": [],
  "total_matches": 0,
  "truncated": false
}
```

If no discovery is requested, JSON output sets `discovery` to `null` for a stable shape.

## Text output

When discovery is not requested, keep current text output unchanged.

When discovery is requested, prepend or append a compact discovery block:

```text
GOD-code global transcript search:
  query: provider error
  include archive: yes
  roots searched: 2
  total matches: 3

Discovery:
  max depth: 3
  limit: 100
  truncated: no
  search roots:
    - ../workspaces (ok, discovered: 2)

Root: ../workspaces/repo-a/.god-code/transcripts
...
```

Text output must not include transcript payload contents beyond the existing bounded search rendering behavior.

## Runtime boundary

The implemented flow stays inside the TS Host CLI:

```text
ts-host CLI sessions global-search
  -> parse direct roots and discovery search roots
  -> resolve direct transcript roots
  -> run bounded transcript root discovery only when --search-root is present
  -> merge direct roots and discovered roots with stable dedupe
  -> run existing global transcript search over merged transcript roots
  -> attach discovery diagnostics
  -> render text or JSON
```

No Phase77 state enters:

- Python Engine runtime
- `initialize`
- `create_session`
- `submit_turn`
- provider clients
- transcript JSONL schema
- search index build / refresh
- MCP payloads
- plugin runtime execution
- `HostToolRegistry.executeRequest(...)`

## Implementation touch points

Implemented code areas:

- `ts-host/src/cli/main.ts`
  - Extended `ParsedGlobalSearchCommand`.
  - Parses `--search-root`, `--discovery-max-depth`, and `--discovery-limit`.
  - Resolves and dedupes discovery search roots separately from direct transcript roots.
  - Composes `discoverTranscriptRoots()` and `searchGlobalTranscriptSessions()`.
- `ts-host/src/transcripts/history.ts`
  - Extended `TranscriptGlobalSearchResult` with nullable discovery metadata.
  - Reuses existing Phase76 discovery candidate model and Phase75 search result model.
  - Keeps `searchGlobalTranscriptSessions()` usable for direct-root-only callers.
- `ts-host/test/transcriptHistory.test.ts`
  - Covers direct-only compatibility and discovery metadata rendering.
- `tools/run-cli-smoke.sh`
  - Adds a smoke case for `sessions global-search <query> --search-root <workspace> --json`.
- Docs:
  - `README.md`
  - `PROJECT_PLAN.md`
  - `INTERNAL_DESIGN.md`
  - `ARCHITECTURE.md`
  - `EXTENSION_POINTS.md`
  - `protocol/README.md`

## Test coverage

- Direct-root-only `global-search` remains unchanged.
- `global-search --search-root <dir>` discovers nested `.god-code/transcripts` and searches them.
- Direct roots are searched before discovered roots.
- Duplicate direct/discovered roots are searched once.
- Missing discovery search roots are reported in discovery diagnostics without aborting valid roots.
- `--discovery-max-depth` bounds discovery.
- `--discovery-limit` truncates discovered roots and reports discovery truncation.
- `--include-archive` applies to discovered roots.
- `--max-results` still caps total session-level matches after merged root ordering.
- JSON output includes discovery diagnostics only when discovery is requested.
- Text output remains compact and does not expose transcript payload beyond existing search match summaries.

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

- `god-code sessions global-search <query> --search-root <dir> --json` can search transcript roots discovered under `<dir>`.
- Existing `god-code sessions global-search <query> --root <transcript_dir>` behavior and output remain compatible.
- Discovery diagnostics are present and bounded when discovery is requested.
- The implementation does not add unbounded discovery, background watchers, persistent caches, search-index mutation, Python Engine changes, or JSON-RPC changes.
