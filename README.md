# markdown-notes-mcp

An MCP server for reading and writing markdown notes stored on iCloud Drive. Gives any MCP-compatible AI client (Claude Code, Claude Desktop, Gemini CLI) read access to your existing notes and write access to save AI outputs as markdown files.

See [SPEC.md](./SPEC.md) for full design details.

## Tools

| Tool | Type | Description |
|------|------|-------------|
| `list_directories` | Read | Returns top-level structure of all configured dirs |
| `list_files` | Read | Lists files in a specific path within a configured dir |
| `read_file` | Read | Reads a markdown file by directory name + relative path |
| `search_files` | Read | Full-text search across all `.md` files |
| `save_file` | Write | Saves/appends markdown content to a writable directory |
| `delete_file` | Write | Deletes a file in a writable directory |
| `move_file` | Write | Moves/renames a file within writable directories |

## Setup

### 1. Install and build

```bash
npm install
npm run build
```

### 2. Configure directories

Set the `MARKDOWN_DIRS` environment variable as a JSON map of named directories:

```json
{
  "projects": { "path": "/path/to/your/Projects" },
  "markdown-notes": { "path": "/path/to/your/markdown-notes", "writable": true }
}
```

Directories without `"writable": true` are read-only.

### 3. Add to Claude Code

In `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "markdown-notes": {
      "command": "node",
      "args": ["/path/to/markdown-notes-mcp/dist/index.js"],
      "env": {
        "MARKDOWN_DIRS": "{\"projects\": {\"path\": \"/path/to/Projects\"}, \"markdown-notes\": {\"path\": \"/path/to/markdown-notes\", \"writable\": true}}"
      }
    }
  }
}
```

### 4. Add to Claude Desktop

In `~/Library/Application Support/Claude/claude_desktop_config.json`, add the same `mcpServers` block.

## Development

```bash
npm test          # run tests
npm run test:watch  # watch mode
npm run lint      # type check
npm run build     # compile to dist/
```

## Requirements

- Node.js 22+
- macOS (iCloud Drive)
