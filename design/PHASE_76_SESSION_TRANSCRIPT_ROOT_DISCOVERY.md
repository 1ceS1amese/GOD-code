# Phase 76: Session transcript root discovery diagnostics

Phase76 implements explicit transcript root discovery diagnostics for session history. Phase75 added `sessions global-search` across explicitly supplied transcript roots, but users still need a safe way to discover likely transcript roots across a small set of known workspaces. Phase76 fills that gap without introducing unbounded filesystem crawling.

This phase is a TS Host CLI implementation. It is local-only, bounded, read-only, and does not start the Python Engine.

## Goals

- Add a CLI diagnostic that finds transcript roots under explicitly provided search roots.
- Keep discovery local-only, bounded, deterministic, and read-only.
- Make discovered roots directly usable with `sessions global-search`.
- Avoid scanning home directories, workspace parents, or arbitrary disks unless explicitly named.
- Bound traversal depth and candidate count.
- Count active and archived transcript files without reading transcript payload contents.
- Provide human text output and stable JSON output.
- Report per-search-root diagnostics for missing or unreadable paths.
- Avoid Python Engine, provider, tool execution, MCP, plugin, transcript schema, search index, or JSON-RPC method changes.

## Non-goals

- No default scan of `$HOME`, `/`, workspace parents, cloud drives, or user profile directories.
- No background watcher, daemon, filesystem subscription, or persistent discovery cache.
- No automatic injection of discovered roots into `sessions global-search`.
- No transcript content search, replay, timeline rendering, or transcript parsing.
- No semantic search, vector index, LLM summary, or ranking model.
- No cleanup, delete, archive, restore, compress, or mutation across discovered roots.
- No remote sync or cloud account integration.
- No cross-platform shell rc modification.
- No JSON-RPC method changes.

## Current state

Existing session root behavior:

```text
GOD_CODE_TRANSCRIPT_DIR=<one-root>
god-code sessions search <query>
god-code sessions global-search <query> --root <transcript_dir>
GOD_CODE_TRANSCRIPT_SEARCH_DIRS=["/path/to/root-a","/path/to/root-b"]
```

Current limitation:

- `resolveTranscriptDir(process.cwd())` resolves one current root.
- Phase75 `sessions global-search` can search multiple roots, but only after users provide those roots.
- The project has no command that safely lists likely `.god-code/transcripts` roots under explicit workspace search roots.
- Users must manually remember or script transcript root paths.

## CLI surface

The new command lives under the existing `sessions` namespace:

```bash
god-code sessions roots --search-root .
god-code sessions roots --search-root ../repo-a --search-root ../repo-b --json
god-code sessions roots --search-root /work/projects --max-depth 3 --limit 50
god-code sessions roots --include-current --json
```

Implemented flags:

- `--search-root <dir>`: explicit filesystem root under which discovery may look for transcript roots. May be repeated.
- `--include-current`: include `process.cwd()` as a search root.
- `--max-depth <n>`: positive bounded integer traversal depth. Default is `3`; the CLI caps it at `8`.
- `--limit <n>`: positive bounded integer maximum number of discovered transcript roots. Default is `100`; the CLI caps it at `1000`.
- `--include-empty`: include candidate transcript roots with no active or archived transcript files.
- `--json`: emit structured output.

Implemented environment variable:

```text
GOD_CODE_TRANSCRIPT_ROOT_SEARCH_DIRS=["/path/to/workspace-a","/path/to/workspace-b"]
```

Rules:

- At least one search root must come from `--search-root`, `--include-current`, or `GOD_CODE_TRANSCRIPT_ROOT_SEARCH_DIRS`.
- Search roots are directories to inspect; a direct transcript root search path is also accepted.
- Relative search roots are resolved relative to current working directory.
- Duplicate search roots are removed after normalization while preserving first occurrence.
- Discovery identifies directories named `.god-code/transcripts` and transcript roots passed directly as search roots.
- Traversal must not follow symlinks by default.
- Traversal skips common dependency / build directories such as `node_modules`, `.git`, `dist`, `build`, `.venv`, and `__pycache__`.
- Missing or unreadable search roots produce per-root diagnostics and do not abort other roots.
- Invalid env JSON, non-string env entries, missing roots, invalid depth, or invalid limit are command errors.
- The command must not read transcript payload contents; it may count matching file names only.

## Result model

```ts
interface TranscriptRootDiscoveryCandidate {
  root: string;
  rootLabel: string;
  searchRoot: string;
  activeFileCount: number;
  archiveFileCount: number;
  hasSearchIndex: boolean;
}

interface TranscriptRootDiscoverySearchRoot {
  searchRoot: string;
  ok: boolean;
  error?: string;
  discoveredCount: number;
}

interface TranscriptRootDiscoveryResult {
  type: "transcript_root_discovery";
  maxDepth: number;
  limit: number;
  includeEmpty: boolean;
  searchRoots: TranscriptRootDiscoverySearchRoot[];
  roots: TranscriptRootDiscoveryCandidate[];
  truncated: boolean;
}
```

Notes:

- `root` is formatted relative to cwd when possible.
- `search_root` is the formatted root that produced the candidate.
- `active_file_count` counts `*.jsonl` files directly under the transcript root.
- `archive_file_count` counts `.jsonl` and `.jsonl.gz` files under `<root>/archive`.
- `has_search_index` is true when `<root>/search-index.json` exists.
- `truncated=true` means the `--limit` cut off additional candidates.

## Text output

```text
GOD-code transcript roots:
search_roots: 2
max_depth: 3
limit: 50
include_empty: false
discovered: 2
truncated: false

[1] .god-code/transcripts
  search_root: .
  active_files: 4
  archive_files: 2
  search_index: true

[2] ../other/.god-code/transcripts
  search_root: ../other
  active_files: 1
  archive_files: 0
  search_index: false
```

Text output rules:

- Keep search root order stable.
- Keep discovered candidate order deterministic by path within each search root.
- Render per-search-root errors after the summary.
- Do not print transcript contents or raw JSON payloads.

## JSON output

```json
{
  "type": "transcript_root_discovery",
  "max_depth": 3,
  "limit": 50,
  "include_empty": false,
  "search_roots": [
    {
      "search_root": ".",
      "ok": true,
      "discovered_count": 1
    }
  ],
  "roots": [
    {
      "root": ".god-code/transcripts",
      "root_label": ".god-code/transcripts",
      "search_root": ".",
      "active_file_count": 4,
      "archive_file_count": 2,
      "has_search_index": true
    }
  ],
  "truncated": false
}
```

The output does not include:

- transcript payload contents
- environment variable values other than sanitized configured path strings
- stack traces
- unrelated filesystem metadata
- provider keys or MCP / plugin environment values

## Runtime boundary

The implemented flow stays inside the TS Host CLI:

```text
ts-host CLI sessions roots
  -> parse explicit search roots / GOD_CODE_TRANSCRIPT_ROOT_SEARCH_DIRS
  -> normalize and dedupe search roots
  -> bounded directory traversal without following symlinks
  -> identify candidate transcript roots
  -> count transcript file names and search-index presence
  -> render text or JSON diagnostics
```

No Phase76 state enters:

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

## Interaction with existing commands

User flow:

```bash
god-code sessions roots --search-root /work/projects --json

god-code sessions global-search "provider error" \
  --root /work/projects/repo-a/.god-code/transcripts \
  --root /work/projects/repo-b/.god-code/transcripts
```

Existing commands remain unchanged:

- `sessions search <query>` still searches one active transcript root.
- `sessions archive search <query>` still searches one archive root.
- `sessions global-search <query>` still requires explicit transcript roots or `GOD_CODE_TRANSCRIPT_SEARCH_DIRS`.
- `sessions index build/refresh/search` still operates on one transcript dir.

## Error handling and sanitization

Implemented local errors:

- Missing search root.
- Invalid `GOD_CODE_TRANSCRIPT_ROOT_SEARCH_DIRS` JSON.
- Non-string or empty search root entries.
- Invalid `--max-depth`.
- Invalid `--limit`.
- Search root path exists but is not a directory.

Per-root diagnostics:

- Missing search root.
- Unreadable search root.
- Traversal skipped due to permission or symlink boundary.

Diagnostics include sanitized search root paths and candidate counts, but do not dump file contents or stack traces.

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

- `sessions roots --search-root <dir>` discovers nested `.god-code/transcripts`.
- A transcript root passed directly as `--search-root` is discovered.
- Repeated `--search-root` preserves order and dedupes normalized duplicates.
- `--include-current` uses cwd as a search root.
- `GOD_CODE_TRANSCRIPT_ROOT_SEARCH_DIRS` supplies search roots.
- `--max-depth` bounds traversal.
- `--limit` truncates deterministically and reports `truncated=true`.
- `--include-empty` controls whether empty transcript roots are returned.
- Active and archived transcript file counts are reported without reading payload contents.
- Existing `search-index.json` is reported with `has_search_index=true`.
- Missing or unreadable roots produce per-root diagnostics.
- Invalid env JSON fails with sanitized error.
- Invalid depth / limit fails.
- CLI smoke covers at least one discovered root and JSON output.

## Verification

- `npm run build` passes in `ts-host/`.
- Session history tests cover explicit search roots, direct transcript roots, max-depth, limit, include-empty, missing roots, file counts, search-index detection, JSON output, and sanitized errors.
- `./tools/run-cli-smoke.sh` includes direct-root and env-root transcript roots discovery flows.
- `./tools/check.sh` passes as the full project gate.
- README and route docs describe discovery as bounded explicit-root diagnostics, not unbounded scanning, background watching, semantic search, or mutation.
