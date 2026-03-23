import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer } from '../src/server.js'
import type { MarkdownDirs } from '../src/lib/config.js'

let tmpDir: string
let dirs: MarkdownDirs
let client: Client

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-integration-'))
  await fs.mkdir(path.join(tmpDir, 'notes'))
  await fs.mkdir(path.join(tmpDir, 'readonly'))

  dirs = {
    notes: { path: path.join(tmpDir, 'notes'), writable: true },
    readonly: { path: path.join(tmpDir, 'readonly'), writable: false },
  }

  const server = createServer(dirs)
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

  client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} })
  await server.connect(serverTransport)
  await client.connect(clientTransport)
})

afterEach(async () => {
  await client.close()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// list_directories
// ---------------------------------------------------------------------------

describe('list_directories', () => {
  it('returns all configured directories', async () => {
    const result = await client.callTool({ name: 'list_directories', arguments: {} })
    expect(result.isError).toBeFalsy()
    const data = JSON.parse((result.content as Array<{ text: string }>)[0].text)
    const names = data.map((d: { name: string }) => d.name)
    expect(names).toContain('notes')
    expect(names).toContain('readonly')
  })

  it('marks writable flag correctly', async () => {
    const result = await client.callTool({ name: 'list_directories', arguments: {} })
    const data = JSON.parse((result.content as Array<{ text: string }>)[0].text)
    const notes = data.find((d: { name: string }) => d.name === 'notes')
    const readonly = data.find((d: { name: string }) => d.name === 'readonly')
    expect(notes.writable).toBe(true)
    expect(readonly.writable).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// list_files
// ---------------------------------------------------------------------------

describe('list_files', () => {
  it('lists files in a directory', async () => {
    await fs.writeFile(path.join(tmpDir, 'notes', 'a.md'), '')
    await fs.writeFile(path.join(tmpDir, 'notes', 'b.md'), '')
    const result = await client.callTool({ name: 'list_files', arguments: { directory: 'notes' } })
    expect(result.isError).toBeFalsy()
    const files = JSON.parse((result.content as Array<{ text: string }>)[0].text)
    expect(files.some((f: string) => f.endsWith('a.md'))).toBe(true)
  })

  it('returns error for unknown directory', async () => {
    const result = await client.callTool({ name: 'list_files', arguments: { directory: 'nope' } })
    expect(result.isError).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// read_file
// ---------------------------------------------------------------------------

describe('read_file', () => {
  it('reads a file', async () => {
    await fs.writeFile(path.join(tmpDir, 'notes', 'hello.md'), '# Hello')
    const result = await client.callTool({
      name: 'read_file',
      arguments: { directory: 'notes', filename: 'hello.md' },
    })
    expect(result.isError).toBeFalsy()
    expect((result.content as Array<{ text: string }>)[0].text).toBe('# Hello')
  })

  it('returns error for missing file', async () => {
    const result = await client.callTool({
      name: 'read_file',
      arguments: { directory: 'notes', filename: 'missing.md' },
    })
    expect(result.isError).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// search_files
// ---------------------------------------------------------------------------

describe('search_files', () => {
  it('finds files by content', async () => {
    await fs.writeFile(path.join(tmpDir, 'notes', 'note.md'), 'integration test content')
    const result = await client.callTool({
      name: 'search_files',
      arguments: { query: 'integration test' },
    })
    expect(result.isError).toBeFalsy()
    const data = JSON.parse((result.content as Array<{ text: string }>)[0].text)
    expect(data.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// save_file
// ---------------------------------------------------------------------------

describe('save_file', () => {
  it('saves a new file', async () => {
    const result = await client.callTool({
      name: 'save_file',
      arguments: { directory: 'notes', filename: 'new.md', content: '# New' },
    })
    expect(result.isError).toBeFalsy()
    const content = await fs.readFile(path.join(tmpDir, 'notes', 'new.md'), 'utf-8')
    expect(content).toBe('# New')
  })

  it('returns error for read-only directory', async () => {
    const result = await client.callTool({
      name: 'save_file',
      arguments: { directory: 'readonly', filename: 'file.md', content: 'x' },
    })
    expect(result.isError).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// delete_file
// ---------------------------------------------------------------------------

describe('delete_file', () => {
  it('deletes a file', async () => {
    await fs.writeFile(path.join(tmpDir, 'notes', 'bye.md'), 'bye')
    const result = await client.callTool({
      name: 'delete_file',
      arguments: { directory: 'notes', filename: 'bye.md' },
    })
    expect(result.isError).toBeFalsy()
    await expect(fs.access(path.join(tmpDir, 'notes', 'bye.md'))).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// move_file
// ---------------------------------------------------------------------------

describe('move_file', () => {
  it('moves a file', async () => {
    await fs.writeFile(path.join(tmpDir, 'notes', 'src.md'), 'data')
    const result = await client.callTool({
      name: 'move_file',
      arguments: {
        source_directory: 'notes',
        source_filename: 'src.md',
        dest_directory: 'notes',
        dest_filename: 'dst.md',
      },
    })
    expect(result.isError).toBeFalsy()
    const content = await fs.readFile(path.join(tmpDir, 'notes', 'dst.md'), 'utf-8')
    expect(content).toBe('data')
  })
})
