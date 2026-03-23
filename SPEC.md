# Markdown Notes MCP Server

## Context

You create markdown files stored on iCloud Drive. Command Center reads these for daily briefings, but only in a narrow scope (one CLI tool). Meanwhile, AI assistants generate valuable output — analysis, summaries, recommendations — that disappears into chat history unless you manually copy-paste it somewhere.

**Two problems, one solution:**
1. **Your notes are invisible to AI assistants** outside of Command Center. No search, no persistent access across sessions.
2. **Useful AI outputs vanish** into chat. There's no easy way to persist them as markdown files you can search later or feed back into future conversations.

A custom MCP server solves both: it gives any MCP-compatible AI client (Claude Code, Claude Desktop, Gemini CLI, etc.) read access to your existing notes AND write access to save outputs as markdown files in iCloud — all searchable, all accessible from any markdown editor.

---

## Approach: Custom MCP Server (`markdown-notes-mcp`)

New repo (public): `~/code/markdown-notes-mcp`

Separate from Command Center (different lifecycle — MCP server is a background process launched by AI clients, vs. Command Center's one-shot CLI). The ~150 lines of file scanning code from `command-center/src/integrations/project-documents.ts` will be adapted for the new server.

**How it runs:** Locally on your Mac. The AI client (Claude Code, Claude Desktop, Gemini CLI, etc.) launches the process automatically when a session starts (configured in that client's settings). It stays alive for the session, then shuts down. No cloud, no always-on daemon.

### Tools

| Tool | Type | Description |
|------|------|-------------|
| `list_directories` | Read | Returns top-level structure of all configured dirs |
| `list_files` | Read | Lists files in a specific path within a configured dir |
| `read_file` | Read | Reads a markdown file by directory name + relative path |
| `search_files` | Read | Full-text search across all `.md` files (content + filenames), returns matching lines with context |
| `save_file` | Write | Saves/appends markdown content to a writable directory |
| `delete_file` | Write | Deletes a file in a writable directory |
| `move_file` | Write | Moves/renames a file within writable directories |

### Configuration

`MARKDOWN_DIRS` env var — a JSON map of named directories with an optional `writable` flag:
```json
{
  "projects": { "path": "/Users/rodmachen/Library/Mobile Documents/com~apple~CloudDocs/projects" },
  "markdown-notes": { "path": "/Users/rodmachen/Library/Mobile Documents/com~apple~CloudDocs/markdown-notes", "writable": true }
}
```
- Directories without `writable: true` are read-only. Write tools (`save_file`, `delete_file`, `move_file`) reject operations on read-only directories.
- Add more folders later by editing this env var — no code changes needed.

### Write Behavior

- **Dedicated output folder:** AI saves to a `markdown-notes` directory in iCloud Drive (you'll create this folder), marked `writable: true` in config.
- **Thematic organization:** Saved files are organized into nested subfolders by topic (e.g., `markdown-notes/command-center/architecture-analysis.md`, `markdown-notes/job-search/interview-prep/udemy/product-questions.md`). Before saving, the AI checks the existing folder structure via `list_directories` and slots files into existing themes or creates new subfolders when needed. You don't need to think about organization — the AI proposes a path, you confirm.
- **Periodic cleanup:** You can ask the AI to reorganize the output folder anytime: "Clean up my markdown-notes folder — merge similar topics, rename things that don't make sense." Uses `move_file` and `delete_file` to restructure without leaving orphaned files.
- **AI offers proactively:** When a substantial response is produced (analysis, summary, plan, reference material), it offers: "Want me to save this to your notes?" You always confirm before anything is written.
- **You can also ask explicitly:** "Save this to my notes" or "Save that analysis as a file."
- **Safety:** Never overwrites without explicit confirmation. Creates new files by default.

### Known Limitations

- **iCloud sync conflicts:** If two clients write to the same file simultaneously (e.g., append mode from two sessions), iCloud may create a conflict copy. At personal single-user scale this is extremely unlikely, but if it happens, iCloud preserves both versions. No server-side mitigation — this is an inherent iCloud limitation.

---

## Key Technical Decisions

1. **Separate repo** — Different lifecycle from Command Center. MCP server is a background process managed by AI clients.

2. **Configurable directory list with writable flag** — `MARKDOWN_DIRS` JSON map with `{ path, writable }` per directory. Write tools enforce this — only `writable: true` directories accept writes. Keeps read-only directories protected by design.

3. **Simple substring search with filename matching** — Content search plus filename/path matching. Fast enough for hundreds of personal files. No embeddings or vector DB needed at this scale.

4. **iCloud eviction handling** — Skip `.icloud` stub files (same as Command Center). Report evicted files so you know to trigger download by opening them locally.

5. **File size guard** — `MAX_FILE_SIZE` constant (50KB). Files exceeding this are truncated on read with a notice. Matches Command Center's existing behavior.

6. **Compiled JS for runtime** — `tsc` builds to `dist/`. Client config runs `node dist/index.js` instead of `npx tsx src/index.ts` — faster startup, no dev dependency needed at runtime.

7. **Client-agnostic** — Uses the open MCP protocol. Works with any MCP-compatible client (Claude Code, Claude Desktop, Gemini CLI, and future tools).

8. **Markdown/text only** — All file operations filter for `.md` and `.txt` files. Binary files and other formats are never listed, searched, or read. Keeps AI context clean.

9. **Atomic writes** — All write operations use temp file + rename to prevent corruption from interrupted processes.

---

## Future Considerations (Out of Scope)

- **Search scaling:** If file count grows to thousands, consider adding a local index (flexsearch or lunr) built on startup. Current substring search is fine for hundreds of files.
- **Command Center consolidation:** Once this MCP server exists, Command Center's `project-documents.ts` integration could be replaced by an MCP client call, consolidating file-scanning logic into one place.

---

## Verification (End-to-End)

After implementation is complete:

**Read flow:**
> **You:** "What have I written about [topic]?"
> **AI:** *calls `search_files`* → finds matching notes (content + filenames) → *calls `read_file`* → synthesizes answer from your notes

**Write flow:**
> **You:** "Analyze the architecture of my Command Center project"
> **AI:** *reads relevant project files* → produces analysis
> **AI:** "This seems like useful reference material. Want me to save it to your notes?"
> **You:** "Yes"
> **AI:** *calls `save_file` with directory "markdown-notes", filename `command-center/architecture-analysis.md`*
> File appears in iCloud Drive, syncs to all devices. Searchable in all future sessions.

**Append flow:**
> **You** (a week later): "Here's another round of interview prep for Udemy — product questions"
> **AI:** *calls `search_files "udemy product"`* → finds existing `job-search/interview-prep/udemy/product-questions.md`
> **AI:** *calls `save_file` with mode "append"* → adds new content under a `## 2026-03-30` heading
> One file, growing over time, all in one place.

**Reorganize flow:**
> **You:** "Clean up my markdown-notes folder"
> **AI:** *calls `list_directories`* → sees current structure
> **AI:** *calls `move_file`* to consolidate related files, *calls `delete_file`* to remove empty/duplicate files
> Proposes each change, you confirm.

**Mobile capture → Desktop save flow:**
> **On your phone:** Have a conversation with Claude. Get a useful analysis or recommendation.
> **Later, on your Mac:** Open the same conversation in Claude Desktop (shared via your Anthropic account).
> **You:** "Save that analysis you gave me to my notes"
> **AI:** *calls `save_file`* → writes it to your `markdown-notes` folder in iCloud
> File syncs to all devices. Searchable in all future sessions.

**Round-trip flow:**
> **You** (next week): "What did we figure out about Command Center's architecture?"
> **AI:** *calls `search_files "command center architecture"`* → finds the saved file → reads it → answers with full context from the prior session's output

**Adding more folders:** Edit `MARKDOWN_DIRS` in client settings. No code changes. Server picks them up on next session.

---

## Client Compatibility

| Surface | Read tools | Write tools | Notes |
|---------|-----------|-------------|-------|
| Claude Code (terminal) | Yes | Yes | Full MCP support |
| Claude Desktop (Mac) | Yes | Yes | Full MCP support |
| Gemini CLI | Yes | Yes | MCP support available |
| Claude mobile app | No | No | No local MCP — but conversations sync to Desktop where you can save |
| claude.ai (browser) | No | No | No local MCP support |

The phone becomes the "capture" device and the Mac becomes the "persist" device. Conversations started anywhere can be saved to files once you're at your Mac.
