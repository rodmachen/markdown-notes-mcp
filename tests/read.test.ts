import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { readFile } from '../src/tools/read.js'
import type { MarkdownDirs } from '../src/lib/config.js'

let tmpDir: string
let dirs: MarkdownDirs

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-read-'))
  await fs.mkdir(path.join(tmpDir, 'notes'))
  dirs = {
    notes: { path: path.join(tmpDir, 'notes'), writable: false },
  }
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('readFile', () => {
  it('reads a markdown file', async () => {
    await fs.writeFile(path.join(tmpDir, 'notes', 'hello.md'), '# Hello\n\nWorld')
    const result = await readFile(dirs, 'notes', 'hello.md')
    expect(result.content).toBe('# Hello\n\nWorld')
    expect(result.truncated).toBe(false)
  })

  it('reads a file in a subdirectory', async () => {
    await fs.mkdir(path.join(tmpDir, 'notes', 'sub'))
    await fs.writeFile(path.join(tmpDir, 'notes', 'sub', 'deep.md'), 'deep content')
    const result = await readFile(dirs, 'notes', 'sub/deep.md')
    expect(result.content).toBe('deep content')
  })

  it('throws for unknown directory name', async () => {
    await expect(readFile(dirs, 'unknown', 'file.md')).rejects.toThrow(/unknown/)
  })

  it('rejects path traversal', async () => {
    await expect(readFile(dirs, 'notes', '../secret.md')).rejects.toThrow(/outside/)
  })

  it('throws file-not-found for missing file', async () => {
    await expect(readFile(dirs, 'notes', 'missing.md')).rejects.toThrow(/not found|ENOENT/)
  })

  it('returns iCloud eviction error for .icloud stub', async () => {
    await fs.writeFile(path.join(tmpDir, 'notes', '.evicted.icloud'), '')
    await expect(readFile(dirs, 'notes', 'evicted.md')).rejects.toThrow(/evicted|iCloud/)
  })
})
