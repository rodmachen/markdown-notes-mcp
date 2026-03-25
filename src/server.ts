import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { parseMarkdownDirs, type MarkdownDirs } from './lib/config.js'
import { listDirectories, listFiles } from './tools/list.js'
import { readFile } from './tools/read.js'
import { searchFiles } from './tools/search.js'
import { saveFile, deleteFile, moveFile, type WriteMode } from './tools/write.js'

export function createServer(dirs: MarkdownDirs): Server {
  const server = new Server(
    { name: 'markdown-notes-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } }
  )

  // ---------------------------------------------------------------------------
  // List tools
  // ---------------------------------------------------------------------------

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'list_directories',
        description: 'Returns all configured markdown directories with their writable status and existing subfolders. Use this when you need to inspect the current folder structure, such as during a cleanup or reorganization.',
        inputSchema: {
          type: 'object' as const,
          properties: {},
          required: [],
        },
      },
      {
        name: 'list_files',
        description: 'Lists markdown files in a specific path within a configured directory. Use this to audit what files exist in a folder before reorganizing or to check for duplicates.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            directory: { type: 'string', description: 'Name of the configured directory' },
            subpath: { type: 'string', description: 'Relative subpath within the directory (optional, defaults to root)' },
          },
          required: ['directory'],
        },
      },
      {
        name: 'read_file',
        description: 'Reads a markdown file by directory name and relative path. Returns an error if the file is evicted by iCloud.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            directory: { type: 'string', description: 'Name of the configured directory' },
            filename: { type: 'string', description: 'Relative path to the file within the directory' },
          },
          required: ['directory', 'filename'],
        },
      },
      {
        name: 'search_files',
        description: 'Full-text search across all markdown files (content and filenames). Use this before saving to check whether a file on this topic already exists — if so, append to it rather than creating a duplicate. Returns matching lines with context.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            query: { type: 'string', description: 'Search query (case-insensitive substring match)' },
            directory: { type: 'string', description: 'Limit search to this directory (optional)' },
            max_results: { type: 'number', description: 'Maximum number of files to return (default: 20)' },
            max_matches_per_file: { type: 'number', description: 'Maximum matching lines per file (default: 3)' },
            include_filenames: { type: 'boolean', description: 'Also match against file paths/names (default: true)' },
          },
          required: ['query'],
        },
      },
      {
        name: 'save_file',
        description: `Use this tool to save any substantial AI response, analysis, or notes to the user's markdown notes in iCloud. When the user asks to save something, pick a path and call this tool immediately — do NOT call search_files or list_directories first, do NOT ask for confirmation. Save the FULL content of the response verbatim — do NOT summarize, condense, or edit. Include all explanatory text, examples, tables, and conversational context exactly as written. Folder structure: use 2–3 levels deep, never put files directly in a top-level folder. Use 3 levels when a topic has natural subcategories. Examples: coding/projects/command-center/2026-03-25-briefing-issues.md, coding/llms/claude-code/2026-03-24-tokens-primer.md, coding/react/learning/2026-03-24-rampup-plan.md, job-search/udemy/2026-03-24-seo-audit.md, hobbies/guitar/2026-03-24-effects-tutorial.md, hobbies/gaming/2026-03-25-civ-buying-guide.md, travel/northeast/baltimore/2026-03-24-trip-reference.md. Naming: YYYY-MM-DD-descriptive-slug.md (lowercase kebab-case, max 5 words, today's date prefix — describe the topic, never use generic words like "chat", "response", "notes", or "summary" in the slug unless explicitly requested). Folders are created automatically. Modes: "create" (default, fails if file exists), "overwrite" (replaces), "append" (adds content under a date heading).`,
        inputSchema: {
          type: 'object' as const,
          properties: {
            directory: { type: 'string', description: 'Name of the writable directory (use "markdown-notes" for saving AI responses)' },
            filename: { type: 'string', description: 'Relative path for the file within the directory, including any subfolders (e.g. "cooking/2025-03-24-pasta-tips.md")' },
            content: { type: 'string', description: 'Markdown content to write' },
            mode: { type: 'string', enum: ['create', 'overwrite', 'append'], description: 'Write mode (default: "create")' },
          },
          required: ['directory', 'filename', 'content'],
        },
      },
      {
        name: 'delete_file',
        description: 'Deletes a file in a writable directory.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            directory: { type: 'string', description: 'Name of the writable directory' },
            filename: { type: 'string', description: 'Relative path to the file' },
          },
          required: ['directory', 'filename'],
        },
      },
      {
        name: 'move_file',
        description: 'Moves or renames a file. Source can be any directory; destination must be writable. Use this during cleanup/reorganization — audit with list_files, propose changes to the user, confirm, then execute.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            source_directory: { type: 'string', description: 'Source directory name' },
            source_filename: { type: 'string', description: 'Relative path of the source file' },
            dest_directory: { type: 'string', description: 'Destination directory name (must be writable)' },
            dest_filename: { type: 'string', description: 'Relative path of the destination file' },
          },
          required: ['source_directory', 'source_filename', 'dest_directory', 'dest_filename'],
        },
      },
    ],
  }))

  // ---------------------------------------------------------------------------
  // Call tools
  // ---------------------------------------------------------------------------

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params

    try {
      switch (name) {
        case 'list_directories': {
          const result = await listDirectories(dirs)
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          }
        }

        case 'list_files': {
          const { directory, subpath = '' } = args as { directory: string; subpath?: string }
          const files = await listFiles(dirs, directory, subpath)
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(files, null, 2) }],
          }
        }

        case 'read_file': {
          const { directory, filename } = args as { directory: string; filename: string }
          const result = await readFile(dirs, directory, filename)
          return {
            content: [{ type: 'text' as const, text: result.content }],
          }
        }

        case 'search_files': {
          const rawArgs = args as Record<string, unknown>
          const query = rawArgs.query as string
          const directory = rawArgs.directory as string | undefined
          // Coerce to correct types — LLMs may send numbers as strings or booleans as strings.
          // Fall back to undefined (which uses the default) if the value is NaN (e.g. "all").
          const coerceNumber = (val: unknown): number | undefined => {
            if (val === undefined) return undefined
            const n = Number(val)
            return Number.isNaN(n) ? undefined : n
          }
          const max_results = coerceNumber(rawArgs.max_results)
          const max_matches_per_file = coerceNumber(rawArgs.max_matches_per_file)
          // Boolean("false") === true, so we must check the string value explicitly
          const include_filenames = rawArgs.include_filenames !== undefined
            ? String(rawArgs.include_filenames).toLowerCase() !== 'false'
            : undefined
          const results = await searchFiles(dirs, {
            query,
            directory,
            max_results,
            max_matches_per_file,
            include_filenames,
          })
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }],
          }
        }

        case 'save_file': {
          const { directory, filename, content, mode = 'create' } = args as {
            directory: string
            filename: string
            content: string
            mode?: WriteMode
          }
          await saveFile(dirs, directory, filename, content, mode)
          return {
            content: [{ type: 'text' as const, text: `Saved: ${filename}` }],
          }
        }

        case 'delete_file': {
          const { directory, filename } = args as { directory: string; filename: string }
          await deleteFile(dirs, directory, filename)
          return {
            content: [{ type: 'text' as const, text: `Deleted: ${filename}` }],
          }
        }

        case 'move_file': {
          const { source_directory, source_filename, dest_directory, dest_filename } = args as {
            source_directory: string
            source_filename: string
            dest_directory: string
            dest_filename: string
          }
          await moveFile(dirs, source_directory, source_filename, dest_directory, dest_filename)
          return {
            content: [
              {
                type: 'text' as const,
                text: `Moved: ${source_filename} → ${dest_filename}`,
              },
            ],
          }
        }

        default:
          throw new Error(`Unknown tool: ${name}`)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        content: [{ type: 'text' as const, text: `Error: ${message}` }],
        isError: true,
      }
    }
  })

  return server
}

export function loadDirs(): MarkdownDirs {
  const raw = process.env.MARKDOWN_DIRS
  if (!raw) {
    throw new Error('MARKDOWN_DIRS environment variable is not set')
  }
  return parseMarkdownDirs(raw)
}
