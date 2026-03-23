#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer, loadDirs } from './server.js'

async function main(): Promise<void> {
  const dirs = loadDirs()
  const server = createServer(dirs)
  const transport = new StdioServerTransport()
  await server.connect(transport)
  process.stderr.write('markdown-notes-mcp server running\n')
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
