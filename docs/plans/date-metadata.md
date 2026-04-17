# Plan: Remove Date from Filenames, Add Date Metadata to File Content

## Context

Currently, saved markdown notes use a `YYYY-MM-DD-descriptive-slug.md` filename convention. The user wants to remove the date from filenames (just `descriptive-slug.md`) and instead have two date lines at the top of file content:

```
Generated: March 24, 2026
Saved: March 25, 2026
```

The "Answered" date is when the AI response was generated; the "Saved" date is when the file was written. Both dates are provided by Claude in the content (no server-side code changes needed). Append mode's `## YYYY-MM-DD` section headings remain unchanged.

## Steps

### Step 1: Update `save_file` tool description in `src/server.ts` — ✅
**Model: Sonnet** | **Approach: Tests-alongside**

**File:** `src/server.ts` (lines 73–84)

Changes:
- Remove `YYYY-MM-DD-` prefix from the naming rule: change `YYYY-MM-DD-descriptive-slug.md` → `descriptive-slug.md`
- Remove date prefixes from all 7 example filenames (e.g., `2026-03-25-briefing-issues.md` → `briefing-issues.md`)
- Add instruction for Claude to prepend two plain-text date lines at the top of content:
  ```
  Generated: {date response was generated}
  Saved: {today's date}
  ```
  Format: `Month DD, YYYY` (e.g., `March 25, 2026`)
- Update the `filename` property description (line 79) to remove the date example

**Verify:** `npm run build` compiles without errors. Manually inspect the tool description reads clearly.

### Step 2: Update global CLAUDE.md naming conventions — ✅
**Model: Sonnet**

**File:** `~/.claude/CLAUDE.md` (lines 105–110)

Changes:
- Change `YYYY-MM-DD-descriptive-slug.md` → `descriptive-slug.md`
- Add note that date metadata goes at the top of file content (Answered/Saved lines)

**Verify:** Read back the file to confirm the section is correct.

### Step 3: Update `CONVENTIONS.md` in markdown-notes via MCP — ✅
**Model: Sonnet** | **Approach: Tests-alongside**

**File:** `markdown-notes/CONVENTIONS.md` (via `save_file` with mode `overwrite`)

Changes:
- Change `YYYY-MM-DD-descriptive-slug.md` → `descriptive-slug.md` in the File Naming section
- Update all example filenames to remove date prefixes
- Update the "Avoid" examples accordingly
- Add note about date metadata lines at the top of file content (Answered/Saved)
- In Cleanup section, remove "Rename files missing date prefixes" line
- In File Content Conventions, add the Answered/Saved date format

**Verify:** `read_file` on `CONVENTIONS.md` to confirm updated content.

### Step 4: Update `docs/plans/naming-conventions.md` — ✅
**Model: Sonnet**

**File:** `docs/plans/naming-conventions.md`

Changes:
- Update the naming convention specification to reflect the new approach
- Remove rationale about chronological sorting by filename

**Verify:** Read back to confirm consistency with Steps 1–3.

### Step 5: End-to-end verification — ✅
**Model: Sonnet**

- Run `npm test` to confirm no tests break
- Run `npm run build` to confirm compilation
- Review the full save_file tool description one more time

### Step 6: Migrate existing files in markdown-notes
**Model: Sonnet**

Migrate 13 existing files (skip `daily-briefings/` and `CONVENTIONS.md`):

For each file:
1. `read_file` to get current content
2. Extract date from filename (e.g., `2026-03-24` from `2026-03-24-claude-tokens-primer.md`)
3. `save_file` with mode `overwrite` — prepend `Saved: {Month DD, YYYY}` (only Saved, since we don't know the original Answered date) followed by a blank line, then the existing content
4. `move_file` to rename without date prefix (e.g., `claude-tokens-primer.md`)

**Files to migrate:**
| Current filename | New filename |
|---|---|
| `coding/ai-dev/claude-code/2026-03-24-claude-tokens-primer.md` | `coding/ai-dev/claude-code/claude-tokens-primer.md` |
| `coding/ai-dev/tools/2026-03-25-agent-orchestration-summary.md` | `coding/ai-dev/tools/agent-orchestration-summary.md` |
| `coding/ai-dev/tools/2026-03-25-agent-orchestration-tools.md` | `coding/ai-dev/tools/agent-orchestration-tools.md` |
| `coding/ai-dev/tools/2026-03-25-cmux.md` | `coding/ai-dev/tools/cmux.md` |
| `coding/projects/command-center/2026-03-25-briefing-review-issues.md` | `coding/projects/command-center/briefing-review-issues.md` |
| `coding/react/2026-03-24-react-rampup-plan.md` | `coding/react/react-rampup-plan.md` |
| `hobbies/gaming/2026-03-25-civ-buying-guide.md` | `hobbies/gaming/civ-buying-guide.md` |
| `hobbies/guitar/2026-03-24-ipad-guitar-effects-tutorial-summary.md` | `hobbies/guitar/ipad-guitar-effects-tutorial-summary.md` |
| `hobbies/guitar/2026-03-24-ipad-guitar-effects-tutorial.md` | `hobbies/guitar/ipad-guitar-effects-tutorial.md` |
| `job-search/paypal/2026-03-25-recruiter-screen-prep.md` | `job-search/paypal/recruiter-screen-prep.md` |
| `job-search/udemy/2026-03-24-udemy-homepage-seo-audit.md` | `job-search/udemy/udemy-homepage-seo-audit.md` |
| `job-search/udemy/2026-03-24-udemy-seo-interview-qa.md` | `job-search/udemy/udemy-seo-interview-qa.md` |
| `travel/northeast/2026-03-24-baltimore-trip-reference.md` | `travel/northeast/baltimore-trip-reference.md` |

**Verify:** `list_files` on `markdown-notes` — no files should have `YYYY-MM-DD-` prefixes (except `daily-briefings/` which is excluded).

## Files Modified
- `/Users/rodmachen/code/markdown-notes-mcp/src/server.ts`
- `/Users/rodmachen/.claude/CLAUDE.md`
- `markdown-notes/CONVENTIONS.md` (via MCP)
- `/Users/rodmachen/code/markdown-notes-mcp/docs/plans/naming-conventions.md`

## No Code Changes Needed
- `src/tools/write.ts` — no changes. The date lines are part of the content Claude passes in, not server logic. Append mode stays as-is.
