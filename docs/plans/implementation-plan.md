# Implementation Plan

See [SPEC.md](../../SPEC.md) for the full project specification.

---

## Step 0: Project scaffolding + CI
- Model: **Sonnet**
- Tests-alongside
- `npm init`, TypeScript, `@modelcontextprotocol/sdk`, `vitest`, `tsx` (dev dependency)
- GitHub Actions CI (lint + test)
- `.gitignore` (node_modules, dist, .env), README with setup instructions
- Build step: `tsc` compiles to `dist/` — client config runs `node dist/index.js` (faster startup, no dev dependency at runtime)
- Files: `package.json`, `tsconfig.json`, `src/index.ts`, `.github/workflows/ci.yml`, `vitest.config.ts`, `.gitignore`, `README.md`
- Verify: `npm test` passes, `npm run build` produces `dist/`, CI green

## Step 1: Core filesystem library + config
- Model: **Sonnet**
- TDD
- `MARKDOWN_DIRS` parsing and validation — supports `{ path, writable }` config shape (`src/lib/config.ts`)
- Directory traversal, `.icloud` stub skipping (`src/lib/filesystem.ts`)
- **Path security validation:** resolve with `path.resolve()`, reject `..` patterns after resolution, use `fs.realpath()` to detect symlinks escaping configured dirs. For new files (write operations where the file doesn't exist yet), validate the parent directory with `realpath()` instead — `fs.realpath()` throws ENOENT on nonexistent paths. Tests must cover symlink escape, `..` traversal, encoded path attacks, and new-file parent validation.
- **File type filtering:** core filter for `.md` and `.txt` files only — applied in all list/search/read operations. No binary files ever reach the AI context.
- `MAX_FILE_SIZE` constant (50KB) — truncate with notice on read, same as Command Center
- `rethrowEperm()` helper for Full Disk Access errors (ported from Command Center)
- Port logic from `command-center/src/integrations/project-documents.ts`:
  - `discoverICloudProjects()` (lines 106-150): directory traversal, `_archive` skipping
  - `scanSectionDocuments()` (lines 32-66): `.icloud` stub skipping, `.md` filtering
  - `readDocument()` (lines 68-98): 50KB cap
  - `getProjectsDir()` (lines 8-12): env var resolution with `path.resolve()`
  - `rethrowEperm()` (lines 14-21): Full Disk Access error handling
- Files: `src/lib/config.ts`, `src/lib/filesystem.ts`, `tests/config.test.ts`, `tests/filesystem.test.ts`
- Verify: `vitest run` passes with mock filesystem tests including symlink escape and path traversal attacks

## Step 2: Read tools — list, read, search
- Model: **Sonnet**
- TDD
- `list_directories`: returns structure of all configured dirs (indicates which are writable)
- `list_files`: files in a specific path (project/section level)
- `read_file`: read by directory name + relative path; validate path stays within allowed dirs; enforce `MAX_FILE_SIZE`. If the file doesn't exist but a matching `.icloud` stub does, return a specific error: "File is evicted by iCloud. Please open the containing folder in Finder to trigger download." This gives the AI context to tell the user what to do, rather than silently reporting "file not found."
- `search_files`: walk all `.md` files, case-insensitive substring match, return matching lines with context. Params: `query`, `directory` (optional scope), `max_results` (default 20 files), `max_matches_per_file` (default 3 — caps snippets per file to prevent context blowup), `include_filenames` (boolean, default true — also matches against file paths/names, not just content)
- Files: `src/tools/list.ts`, `src/tools/read.ts`, `src/tools/search.ts`, `tests/list.test.ts`, `tests/read.test.ts`, `tests/search.test.ts`
- Verify: `vitest run` passes including path traversal rejection, filename matching, and multi-file search scenarios

## Step 3: Write tools — save, delete, move
- Model: **Sonnet**
- TDD
- `save_file`: writes markdown content to a writable directory
  - Params: `directory` (must be writable), `filename` (relative path, supports nested folders), `content` (markdown string), `mode` ("create" | "append" | "overwrite", default "create")
  - **Append mode:** Appends new content with a date heading (e.g., `## 2026-03-23`).
  - **Atomic writes:** Write to a `.tmp` file in the same directory, then `fs.rename()` to the final path. Prevents file corruption if the process is killed mid-write. (Rename is atomic on the same filesystem.)
  - **Write serialization:** In-memory lock (Map of file path → Promise) ensures concurrent writes to the same file are queued sequentially. Prevents append race conditions where two concurrent appends could overwrite each other.
  - Rejects writes to non-writable directories; rejects overwrite unless explicitly requested
  - Auto-creates subdirectories as needed
- `delete_file`: deletes a file in a writable directory
  - Params: `directory` (must be writable), `filename` (relative path)
  - Rejects deletion in non-writable directories
- `move_file`: moves/renames a file within writable directories
  - Params: `source_directory`, `source_filename`, `dest_directory` (must be writable), `dest_filename`
  - Source can be any directory (read or writable); destination must be writable
  - Auto-creates destination subdirectories as needed
- Files: `src/tools/write.ts`, `tests/write.test.ts`
- Verify: `vitest run` passes including overwrite protection, writable-only enforcement, path traversal rejection, and move across directories

## Step 4: MCP protocol wiring
- Model: **Sonnet**
- Tests-alongside
- Wire all tools into `@modelcontextprotocol/sdk` Server class with stdio transport
- Entry point: `src/index.ts` with shebang
- This is the first end-to-end verification through MCP protocol — integration test exercises the full stack (config → filesystem → tools → MCP protocol → response)
- Files: `src/index.ts`, `src/server.ts`, `tests/integration.test.ts`
- Verify: Integration test starts server, sends tool calls via MCP protocol, gets valid responses for all tools

## Step 5: Client integration + CLAUDE.md
- Model: **Sonnet**
- Tests-alongside
- Add iCloud directory paths and structure to global `~/.claude/CLAUDE.md`
- Add MCP server config to Claude Code (`~/.claude/settings.json`):
  ```json
  {
    "mcpServers": {
      "markdown-notes": {
        "command": "node",
        "args": ["/Users/rodmachen/code/markdown-notes-mcp/dist/index.js"],
        "env": {
          "MARKDOWN_DIRS": "{\"projects\": {\"path\": \"...\"}, \"markdown-notes\": {\"path\": \"...\", \"writable\": true}}"
        }
      }
    }
  }
  ```
- Add equivalent to Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`)
- Create `markdown-notes` folder in iCloud Drive
- Files: `~/.claude/CLAUDE.md`, client settings files
- Verify: New Claude Code session shows MCP tools; test full round-trip: search existing notes, read a file, save a new file, verify it appears in iCloud Drive
