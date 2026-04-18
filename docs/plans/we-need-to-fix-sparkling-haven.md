# Fix `save_file` overwrite mode to actually overwrite

## Context

The `save_file` MCP tool's `overwrite` mode does not overwrite. Commit 7b304cb ("Add overwrite safety, return filename, fix plan file") redefined `overwrite` to *never* replace an existing file — instead it probes for the next free numeric suffix (`foo.md` → `foo-2.md` → `foo-3.md`…) and writes there. See `src/tools/write.ts:85-112`.

This conflicts with the tool description the model sees in `src/server.ts:74` — *`"overwrite" (replaces)"`* — and with every caller's intent (the `/work-log` skill, in particular, calls `save_file` with `mode: "overwrite"` expecting `_current.md` and `repos/<repo>.md` to be updated in place). The result is duplicate files like `work-log/_current-2.md` and `work-log/repos/comics-n-stuff-gql-2.md` piling up instead of state files being updated.

Intended outcome: `mode: "overwrite"` replaces the existing file atomically. The suffix-bumping "safety" behavior is removed entirely — `mode: "create"` already guards against accidental clobbering for callers that want that.

## Execution meta

- **Step 1 (code + tests):** Sonnet / medium. Single small edit + straightforward test rewrite in code paths already explored. Tests-alongside (the behavior is simple enough that rewriting tests after the implementation is fine, and they verify the code). Context-clear: no.
- **Step 2 (duplicate cleanup):** Sonnet / medium. Needs a `find` scan + case-by-case user confirmation before deletes. Context-clear: no.

## Changes

### 1. Make `overwrite` actually overwrite — `src/tools/write.ts` ✅

Replace the `else if (mode === 'overwrite')` block (lines 85-112) with a straight atomic write. The existing `atomicWrite` helper (temp file + rename, lines 151-161) already provides crash safety; no suffix probing needed.

New body:

```ts
} else if (mode === 'overwrite') {
  await atomicWrite(filePath, content)
  return filename
}
```

Also update the JSDoc on lines 35-40: drop the "creates new file with suffix if exists" description and the "may differ from requested filename" note. The function still returns `string` (the filename written) — no signature change — but it will always equal the input `filename`.

### 2. Rewrite the overwrite tests — `tests/write.test.ts` ✅

The current `saveFile — overwrite` suite (lines 91-119) asserts the buggy behavior: it explicitly expects the original file to be preserved and a `-2.md` sibling to be created. Rewrite as:

- **replaces existing file content** — write `original`, call `saveFile(..., 'overwrite')` with `updated`, assert the file now contains `updated` and no `-2.md` exists.
- **creates file if it does not exist** — keep the existing case at lines 113-118 as-is (it already asserts the correct behavior).

Drop the "increments suffix" test (lines 104-111) entirely — the behavior no longer exists.

### 3. Tighten the user-facing tool description — `src/server.ts:74`

Current text already says `"overwrite" (replaces)`, which is now truthful. No change required unless we want to explicitly warn against using it on state files without care. Leaving as-is for now.

### 4. Clean up existing `-N` duplicates in iCloud notes

The duplicates mentioned (`work-log/_current-2.md`, `work-log/repos/comics-n-stuff-gql-2.md`) did not turn up in a scan of `~/Library/Mobile Documents/com~apple~CloudDocs/markdown-notes/` — likely already removed, or the work-log tree doesn't exist yet. Before implementation, run:

```bash
find "/Users/rodmachen/Library/Mobile Documents/com~apple~CloudDocs/markdown-notes" -regex '.*-[0-9]+\.md$'
```

Review results with the user and delete with the MCP `delete_file` tool (respects the writable-directory guard). Do **not** bulk-delete — some `-2.md` names may be legitimate (e.g. a user-authored `part-2.md`).

## Critical files

- `src/tools/write.ts` — the fix (lines 85-112, plus JSDoc 35-40)
- `tests/write.test.ts` — update overwrite suite (lines 91-119)
- `src/server.ts:74` — tool description (no change, verify accuracy)

## Verification

1. `npm test` — the rewritten overwrite tests pass; create/append suites unchanged and still green.
2. `npm run typecheck` (or `tsc --noEmit`) — clean.
3. Manual end-to-end: rebuild the MCP server, restart Claude Code so it picks up the new binary, then from a fresh chat call `save_file` with `mode: "overwrite"` against an existing note and confirm via `read_file` that the content was replaced and no `-2.md` sibling was created.
4. Run `/work-log refresh` on any repo and confirm `_current.md` and `repos/<repo>.md` are updated in place (no new `-2` files appear).
