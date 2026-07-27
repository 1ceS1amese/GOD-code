# Phase 75: Session global transcript search

Phase75 implements explicit cross-directory transcript search for session history. Earlier session phases added local list / replay / search, active and archived management, gzip archive support, a per-directory search index, incremental index refresh, resume from transcript, and compact per-session timeline diagnostics. Phase75 closes the search gap for finding text across multiple explicitly configured transcript roots without manually switching `GOD_CODE_TRANSCRIPT_DIR`.

This phase is a TS Host CLI implementation. It is local-only, read-only, and does not start the Python Engine.

## Goals

- Add a CLI surface for searching multiple transcript roots in one command.
- Keep the feature TS Host local-only and offline.
- Require explicit roots from CLI flags or a dedicated environment variable; do not scan home directories, workspace parents, or arbitrary disks.
- Reuse existing transcript JSONL / `.jsonl.gz` readers and search result rendering semantics where possible.
- Support active transcripts by default and archived transcripts only with an explicit flag.
- Return root-aware results so users can identify which transcript directory matched.
- Preserve deterministic ordering across roots, sessions, and entries.
- Provide human text output and stable JSON output for tooling.
- Keep search read-only; do not mutate transcripts, archives, search indexes, or runtime state.
- Avoid Python Engine, provider, tool execution, MCP, plugin, transcript schema, or JSON-RPC method changes.

## Non-goals

- No automatic transcript root discovery in Phase75.
- No recursive filesystem crawl, home directory scan, or workspace-wide discovery.
- No background watcher, daemon, live process inspection, or live session recovery.
- No cross-root persistent index format in Phase75.
- No vector search, fuzzy search, semantic search, ranking model, or LLM summary.
- No transcript rewrite, repair, redaction engine, migration, or compaction.
- No deletion, archive, restore, or compression across multiple roots.
- No remote sync, cloud account integration, or marketplace-style sharing.
- No JSON-RPC method changes.

## Current state

Existing session search commands are scoped to one resolved transcript directory:

```text
god-code sessions search <query>
god-code sessions archive search <query>
god-code sessions index build
god-code sessions index refresh
god-code sessions index search <query>
```

Current limitation:

- `GOD_CODE_TRANSCRIPT_DIR` can point to one transcript root at a time.
- `sessions search` scans only active transcripts for that root.
- `sessions archive search` scans only archived transcripts for that root.
- `sessions index` writes one `<transcriptDir>/search-index.json`.
- Users with multiple workspaces or multiple transcript dirs must run separate commands and manually combine results.

## CLI surface

The new command lives under the existing `sessions` namespace:

```bash
god-code sessions global-search <query> --root .god-code/transcripts
god-code sessions global-search <query> --root repo-a/.god-code/transcripts --root repo-b/.god-code/transcripts
god-code sessions global-search <query> --include-current --root ../other/.god-code/transcripts --json
god-code sessions global-search <query> --root .god-code/transcripts --include-archive --max-results 50
```

Implemented flags:

- `--root <transcript_dir>`: explicit transcript root to search. May be repeated.
- `--include-current`: include the normal `resolveTranscriptDir(process.cwd())` root in addition to explicit roots.
- `--include-archive`: search each root's `archive/` directory in addition to active transcripts.
- `--max-results <n>`: optional positive integer cap applied after deterministic root/session ordering.
- `--json`: emit structured output.

Implemented environment variable:

```text
GOD_CODE_TRANSCRIPT_SEARCH_DIRS=["/path/to/root-a","/path/to/root-b"]
```

Rules:

- At least one search root must come from `--root`, `--include-current`, or `GOD_CODE_TRANSCRIPT_SEARCH_DIRS`.
- `--root` and `GOD_CODE_TRANSCRIPT_SEARCH_DIRS` entries are transcript roots, not workspace roots.
- Roots are resolved relative to the current working directory for CLI flags and environment entries that are relative paths.
- Duplicate roots are removed after path normalization while preserving first occurrence.
- Missing roots do not abort the entire command; they produce per-root diagnostics and zero matches for that root.
- Invalid root values, invalid JSON in `GOD_CODE_TRANSCRIPT_SEARCH_DIRS`, empty query, or invalid `--max-results` are command errors.
- The command reads active transcripts by default.
- Archive search is opt-in with `--include-archive`.
- The command does not read or update `search-index.json`.

## Result model

The global search result wraps existing per-session search matches with root metadata:

```ts
interface TranscriptGlobalSearchRootResult {
  root: string;
  rootLabel: string;
  ok: boolean;
  error?: string;
  activeMatches: TranscriptSearchResult[];
  archiveMatches: TranscriptSearchResult[];
}

interface TranscriptGlobalSearchResult {
  type: "transcript_global_search";
  query: string;
  includeArchive: boolean;
  maxResults: number | null;
  roots: TranscriptGlobalSearchRootResult[];
  totalMatches: number;
  truncated: boolean;
}
```

Notes:

- `root` is formatted for output relative to cwd when possible.
- `root_label` is a stable short label for text output, derived from the formatted root path.
- `active_matches` use existing active transcript search semantics.
- `archive_matches` use existing archived transcript search semantics and are empty unless `--include-archive` is set.
- `total_matches` counts session-level search result entries after truncation.
- `truncated=true` means `--max-results` cut off one or more otherwise matching session results.

## Text output

Text output is grouped by root:

```text
GOD-code global transcript search:
query: build failed
roots: 2
include_archive: true
max_results: 50
total_matches: 3
truncated: false

[1] .god-code/transcripts
  active:
    session-a  matches=2  types=assistant,tool_result  entries=12  turns=1  last=2026-06-20T10:00:00.000Z  prompt="build failed"
  archive:
    no matches

[2] ../other/.god-code/transcripts
  active:
    no matches
  archive:
    session-b  matches=1  types=tool_result  entries=8  turns=1  last=2026-06-18T09:00:00.000Z  prompt="debug provider"
```

Text output rules:

- Keep root order stable from resolved input order.
- Within each root, reuse existing session search ordering.
- Show active and archive sections separately when `--include-archive` is set.
- Hide raw JSON payloads; keep bounded prompt previews from existing search rendering.
- Show per-root errors without stack traces.

## JSON output

JSON output is stable:

```json
{
  "type": "transcript_global_search",
  "query": "build failed",
  "include_archive": true,
  "max_results": 50,
  "roots": [
    {
      "root": ".god-code/transcripts",
      "root_label": ".god-code/transcripts",
      "ok": true,
      "active_matches": [],
      "archive_matches": []
    }
  ],
  "total_matches": 0,
  "truncated": false
}
```

The output should not include:

- raw transcript JSON
- full environment contents
- stack traces
- provider keys or MCP / plugin environment values
- unrelated filesystem metadata outside the explicitly configured roots

## Runtime boundary

The implemented flow stays inside the TS Host CLI:

```text
ts-host CLI sessions global-search
  -> parse explicit roots / GOD_CODE_TRANSCRIPT_SEARCH_DIRS
  -> normalize and dedupe transcript roots
  -> search active transcript JSONL files per root
  -> optionally search archived JSONL / JSONL.GZ files per root
  -> render grouped text or JSON
```

No Phase75 state enters:

- Python Engine runtime
- `initialize`
- `create_session`
- `submit_turn`
- provider clients
- MCP payloads
- plugin runtime execution
- `HostToolRegistry.executeRequest(...)`

## Interaction with existing commands

Expected user flow after implementation:

```bash
god-code sessions global-search "tool_result" \
  --root /path/to/work/a/.god-code/transcripts \
  --root /path/to/work/b/.god-code/transcripts

GOD_CODE_TRANSCRIPT_SEARCH_DIRS='["/path/to/work/a/.god-code/transcripts","/path/to/work/b/.god-code/transcripts"]' \
  god-code sessions global-search "provider error" --include-archive --json
```

Existing commands remain unchanged:

- `sessions search <query>` still searches only the active sessions in the current resolved transcript dir.
- `sessions archive search <query>` still searches only archived sessions for the current resolved transcript dir.
- `sessions index build/refresh/search` still operates on one transcript dir and its optional archive scope.
- `sessions list/replay/timeline/resume/cleanup/delete` remain single-root commands.

## Error handling and sanitization

Implemented local errors:

- Missing query.
- No roots provided by `--root`, `--include-current`, or `GOD_CODE_TRANSCRIPT_SEARCH_DIRS`.
- Invalid `GOD_CODE_TRANSCRIPT_SEARCH_DIRS` JSON.
- Non-string or empty root entries.
- Invalid `--max-results`.
- Search read errors for individual roots are reported per root instead of aborting other roots where possible.

Diagnostics should include sanitized root path, query, and scope metadata where useful, but should not dump full transcript contents or environment values.

## Implementation touch points

Implemented code areas:

- `ts-host/src/transcripts/history.ts`
- `ts-host/src/cli/main.ts`
- `ts-host/test/transcriptHistory.test.ts`
- `tools/run-cli-smoke.sh`

Docs kept in sync:

- `README.md`
- `PROJECT_PLAN.md`
- `INTERNAL_DESIGN.md`
- `ARCHITECTURE.md`
- `EXTENSION_POINTS.md`
- `protocol/README.md`

## Test coverage

- `sessions global-search <query> --root <dir>` searches one explicit active root.
- Repeated `--root` searches multiple roots in stable order.
- `--include-current` includes the resolved current transcript dir.
- `GOD_CODE_TRANSCRIPT_SEARCH_DIRS` supplies roots when `--root` is omitted.
- Duplicate roots are deduped after normalization.
- `--include-archive` searches archived JSONL and `.jsonl.gz`.
- `--max-results` truncates deterministically and reports `truncated=true`.
- Missing root reports a per-root diagnostic without preventing other roots from returning matches.
- Missing query fails.
- No roots fail.
- Invalid environment JSON fails with sanitized error.
- Invalid `--max-results` fails.
- JSON output includes root metadata, active matches, archive matches, totals, and truncation state.
- Text output groups results by root and scope.
- The command does not start Python Engine or execute tools.

## Verification

- `npm run build` passes in `ts-host/`.
- Session history tests cover explicit roots, archive inclusion, missing roots, max results, JSON output, and sanitized errors.
- `./tools/run-cli-smoke.sh` includes explicit-root and env-root global transcript search flows.
- `./tools/check.sh` passes as the full project gate.
- README and route docs describe that global search is explicit-root local transcript search, not recursive discovery, daemon watching, semantic search, or cross-root mutation.
