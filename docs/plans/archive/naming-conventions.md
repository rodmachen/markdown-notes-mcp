# Plan: Naming Conventions & Save Behavior for markdown-notes

## Context

The MCP server is built and working, but Claude Desktop has no guidance on *how* to save responses — it doesn't know what to name files, which subfolders to use, or when to offer saving proactively. The SPEC.md defines rich behavioral expectations (proactive offers, thematic folders, confirmation before writes) but `~/.claude/CLAUDE.md` only lists paths and tool names. This plan adds the missing behavioral guidance so Claude Desktop can autonomously propose well-organized file paths when saving responses.

No code changes to the MCP server. Two documents + a CLAUDE.md update.

---

## Step 1: Update `~/.claude/CLAUDE.md` MCP section — **Sonnet** ✅

**File:** `/Users/rodmachen/.claude/CLAUDE.md`
**Action:** Replace lines 91-99 with expanded section (~35 lines)

Replace the current minimal MCP section with behavioral rules covering:
- **Proactive save offers** — when producing substantial output, offer to save
- **Search-before-save** — call `list_directories` to see existing structure, slot into existing folders
- **Propose full path and wait for confirmation** — never write without user approval
- **Append vs. create** — use `search_files` to find existing files on recurring topics, append with date headings; create new files for distinct topics
- **Naming convention** — `descriptive-slug.md`, lowercase kebab-case, max ~5 words (no date prefix; dates go in file content)
- **Subfolder rules** — lowercase kebab-case topics, max 2 levels deep, created organically
- **Reserved paths** — `daily-briefings/` is Command Center only
- **Cleanup workflow** — audit with `list_files`, propose changes, confirm, execute with `move_file`/`delete_file`
- **Reference pointer** — "read `markdown-notes/CONVENTIONS.md` for detailed conventions"

**Verify:** Open a new Claude session, confirm the MCP section loads. Inspect `~/.claude/CLAUDE.md` to verify the new section is present and the rest of the file is untouched.

---

## Step 2: Create `CONVENTIONS.md` in markdown-notes via MCP — **Sonnet** ✅

**File:** Created via `save_file` tool → `markdown-notes/CONVENTIONS.md`
**Action:** Save a detailed reference document covering:
- File naming format with examples and anti-patterns
- Subfolder decision tree (check existing → match or create → max 2 levels)
- Illustrative folder structure example
- Append vs. new file decision criteria
- Cleanup/reorganization workflow (audit → propose → confirm → execute)
- File content conventions (start with `# Title`, brief context line)

This lives in iCloud via the MCP server, not in the git repo. Claude reads it on-demand via `read_file` when doing organizational work.

**Verify:** Call `read_file` on `CONVENTIONS.md` to confirm content. Call `list_files` on `markdown-notes` root to confirm it appears.

---

## Step 3: Verify existing markdown-notes state — **Sonnet** ✅

**Action:** Call `list_directories` and `list_files` on `markdown-notes` to audit current state. If there are stale test artifacts or duplicate folders from iCloud sync, propose cleanup to user.

**Verify:** Clean `list_directories` output showing expected structure.

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| `descriptive-slug.md` naming | Clean filenames; date metadata (Answered/Saved) goes at top of file content instead |
| Max 2 folder levels | Matches `projects/` structure; avoids mobile navigation pain |
| Organic folders (not pre-created) | User said "iterate as we go"; `save_file` auto-creates dirs on first save |
| Two docs (CLAUDE.md + CONVENTIONS.md) | Keeps per-session context lean; detailed reference is on-demand |
| Confirmation before all writes | SPEC.md requirement; prevents unwanted saves |

## Step Sequence

| Step | Description | Model | Can parallelize |
|------|-------------|-------|----------------|
| 1 | Update `~/.claude/CLAUDE.md` | **Sonnet** | Yes (with Step 2) | ✅ |
| 2 | Create `CONVENTIONS.md` via MCP | **Sonnet** | Yes (with Step 1) | ✅ |
| 3 | Audit/clean markdown-notes state | **Sonnet** | After Steps 1-2 | ✅ |
