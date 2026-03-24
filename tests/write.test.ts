import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { saveFile, deleteFile, moveFile } from '../src/tools/write.js'
import type { MarkdownDirs } from '../src/lib/config.js'

let tmpDir: string
let dirs: MarkdownDirs

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-write-'))
  await fs.mkdir(path.join(tmpDir, 'notes'))
  await fs.mkdir(path.join(tmpDir, 'readonly'))
  dirs = {
    notes: { path: path.join(tmpDir, 'notes'), writable: true },
    readonly: { path: path.join(tmpDir, 'readonly'), writable: false },
  }
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// saveFile — create mode
// ---------------------------------------------------------------------------

describe('saveFile — create', () => {
  it('creates a new file', async () => {
    await saveFile(dirs, 'notes', 'hello.md', '# Hello', 'create')
    const content = await fs.readFile(path.join(tmpDir, 'notes', 'hello.md'), 'utf-8')
    expect(content).toBe('# Hello')
  })

  it('auto-creates subdirectories', async () => {
    await saveFile(dirs, 'notes', 'sub/deep/note.md', 'content', 'create')
    const content = await fs.readFile(path.join(tmpDir, 'notes', 'sub', 'deep', 'note.md'), 'utf-8')
    expect(content).toBe('content')
  })

  it('rejects overwrite of existing file in create mode', async () => {
    await fs.writeFile(path.join(tmpDir, 'notes', 'exists.md'), 'original')
    await expect(saveFile(dirs, 'notes', 'exists.md', 'new', 'create')).rejects.toThrow(
      /exists|overwrite/i
    )
  })

  it('rejects writes to non-writable directories', async () => {
    await expect(saveFile(dirs, 'readonly', 'file.md', 'content', 'create')).rejects.toThrow(
      /writable|read.?only/i
    )
  })

  it('throws for unknown directory', async () => {
    await expect(saveFile(dirs, 'unknown', 'file.md', 'content', 'create')).rejects.toThrow(
      /[Uu]nknown/
    )
  })

  it('rejects path traversal', async () => {
    await expect(saveFile(dirs, 'notes', '../escape.md', 'content', 'create')).rejects.toThrow(
      /outside/
    )
  })

  it('rejects filenames without allowed extension', async () => {
    await expect(saveFile(dirs, 'notes', 'script.sh', 'content', 'create')).rejects.toThrow(
      /\.md|\.txt/
    )
  })

  it('rejects filenames with no extension', async () => {
    await expect(saveFile(dirs, 'notes', 'Makefile', 'content', 'create')).rejects.toThrow(
      /\.md|\.txt/
    )
  })

  it('rejects content exceeding MAX_FILE_SIZE', async () => {
    const bigContent = 'x'.repeat(50 * 1024 + 1)
    await expect(saveFile(dirs, 'notes', 'big.md', bigContent, 'create')).rejects.toThrow(
      /50KB|size limit/i
    )
  })
})

// ---------------------------------------------------------------------------
// saveFile — overwrite mode
// ---------------------------------------------------------------------------

describe('saveFile — overwrite', () => {
  it('overwrites an existing file', async () => {
    await fs.writeFile(path.join(tmpDir, 'notes', 'file.md'), 'original')
    await saveFile(dirs, 'notes', 'file.md', 'updated', 'overwrite')
    const content = await fs.readFile(path.join(tmpDir, 'notes', 'file.md'), 'utf-8')
    expect(content).toBe('updated')
  })

  it('creates file if it does not exist in overwrite mode', async () => {
    await saveFile(dirs, 'notes', 'new.md', 'new content', 'overwrite')
    const content = await fs.readFile(path.join(tmpDir, 'notes', 'new.md'), 'utf-8')
    expect(content).toBe('new content')
  })
})

// ---------------------------------------------------------------------------
// saveFile — append mode
// ---------------------------------------------------------------------------

describe('saveFile — append', () => {
  it('appends to an existing file with a date heading', async () => {
    await fs.writeFile(path.join(tmpDir, 'notes', 'log.md'), '# Log\n\nOld content')
    await saveFile(dirs, 'notes', 'log.md', 'New entry', 'append')
    const content = await fs.readFile(path.join(tmpDir, 'notes', 'log.md'), 'utf-8')
    expect(content).toContain('Old content')
    expect(content).toContain('New entry')
    expect(content).toMatch(/## \d{4}-\d{2}-\d{2}/)
  })

  it('creates file if it does not exist in append mode', async () => {
    await saveFile(dirs, 'notes', 'new-log.md', 'First entry', 'append')
    const content = await fs.readFile(path.join(tmpDir, 'notes', 'new-log.md'), 'utf-8')
    expect(content).toContain('First entry')
  })

  it('each same-day append adds its own date heading', async () => {
    await saveFile(dirs, 'notes', 'daily.md', 'entry one', 'append')
    await saveFile(dirs, 'notes', 'daily.md', 'entry two', 'append')
    const content = await fs.readFile(path.join(tmpDir, 'notes', 'daily.md'), 'utf-8')
    expect(content).toContain('entry one')
    expect(content).toContain('entry two')
    const dateHeadings = content.match(/## \d{4}-\d{2}-\d{2}/g) ?? []
    expect(dateHeadings).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// deleteFile
// ---------------------------------------------------------------------------

describe('deleteFile', () => {
  it('deletes an existing file', async () => {
    await fs.writeFile(path.join(tmpDir, 'notes', 'to-delete.md'), 'bye')
    await deleteFile(dirs, 'notes', 'to-delete.md')
    await expect(fs.access(path.join(tmpDir, 'notes', 'to-delete.md'))).rejects.toThrow()
  })

  it('rejects deletion in non-writable directories', async () => {
    await fs.writeFile(path.join(tmpDir, 'readonly', 'file.md'), 'content')
    await expect(deleteFile(dirs, 'readonly', 'file.md')).rejects.toThrow(/writable|read.?only/i)
  })

  it('throws for unknown directory', async () => {
    await expect(deleteFile(dirs, 'unknown', 'file.md')).rejects.toThrow(/[Uu]nknown/)
  })

  it('rejects path traversal', async () => {
    await expect(deleteFile(dirs, 'notes', '../readonly/file.md')).rejects.toThrow(/outside/)
  })

  it('throws if file does not exist', async () => {
    await expect(deleteFile(dirs, 'notes', 'missing.md')).rejects.toThrow()
  })

  it('rejects filenames without allowed extension', async () => {
    await expect(deleteFile(dirs, 'notes', 'script.sh')).rejects.toThrow(/\.md|\.txt/)
  })
})

// ---------------------------------------------------------------------------
// moveFile
// ---------------------------------------------------------------------------

describe('moveFile', () => {
  it('moves a file within the same directory', async () => {
    await fs.writeFile(path.join(tmpDir, 'notes', 'old.md'), 'content')
    await moveFile(dirs, 'notes', 'old.md', 'notes', 'new.md')
    await expect(fs.access(path.join(tmpDir, 'notes', 'old.md'))).rejects.toThrow()
    const content = await fs.readFile(path.join(tmpDir, 'notes', 'new.md'), 'utf-8')
    expect(content).toBe('content')
  })

  it('moves a file from readonly source to writable destination', async () => {
    await fs.writeFile(path.join(tmpDir, 'readonly', 'source.md'), 'data')
    await moveFile(dirs, 'readonly', 'source.md', 'notes', 'dest.md')
    const content = await fs.readFile(path.join(tmpDir, 'notes', 'dest.md'), 'utf-8')
    expect(content).toBe('data')
  })

  it('rejects move to non-writable destination', async () => {
    await fs.writeFile(path.join(tmpDir, 'notes', 'file.md'), 'content')
    await expect(moveFile(dirs, 'notes', 'file.md', 'readonly', 'dest.md')).rejects.toThrow(
      /writable|read.?only/i
    )
  })

  it('auto-creates destination subdirectories', async () => {
    await fs.writeFile(path.join(tmpDir, 'notes', 'file.md'), 'content')
    await moveFile(dirs, 'notes', 'file.md', 'notes', 'sub/nested/moved.md')
    const content = await fs.readFile(path.join(tmpDir, 'notes', 'sub', 'nested', 'moved.md'), 'utf-8')
    expect(content).toBe('content')
  })

  it('throws for unknown source directory', async () => {
    await expect(moveFile(dirs, 'unknown', 'file.md', 'notes', 'dest.md')).rejects.toThrow(
      /[Uu]nknown/
    )
  })

  it('throws for unknown destination directory', async () => {
    await fs.writeFile(path.join(tmpDir, 'notes', 'file.md'), 'content')
    await expect(moveFile(dirs, 'notes', 'file.md', 'unknown', 'dest.md')).rejects.toThrow(
      /[Uu]nknown/
    )
  })

  it('rejects path traversal in source', async () => {
    await expect(moveFile(dirs, 'notes', '../escape.md', 'notes', 'dest.md')).rejects.toThrow(
      /outside/
    )
  })

  it('rejects path traversal in destination', async () => {
    await fs.writeFile(path.join(tmpDir, 'notes', 'file.md'), 'content')
    await expect(moveFile(dirs, 'notes', 'file.md', 'notes', '../escape.md')).rejects.toThrow(
      /outside/
    )
  })

  it('rejects destination filename without allowed extension', async () => {
    await fs.writeFile(path.join(tmpDir, 'notes', 'file.md'), 'content')
    await expect(moveFile(dirs, 'notes', 'file.md', 'notes', 'bad.sh')).rejects.toThrow(
      /\.md|\.txt/
    )
  })
})

// ---------------------------------------------------------------------------
// withLock — concurrency
// ---------------------------------------------------------------------------

describe('saveFile — concurrency', () => {
  it('serializes concurrent overwrites to the same file without corruption', async () => {
    // Fire two concurrent overwrites; the lock ensures one completes fully before the other
    await Promise.all([
      saveFile(dirs, 'notes', 'concurrent.md', 'write-A', 'overwrite'),
      saveFile(dirs, 'notes', 'concurrent.md', 'write-B', 'overwrite'),
    ])
    const content = await fs.readFile(path.join(tmpDir, 'notes', 'concurrent.md'), 'utf-8')
    // Either write can win — what matters is content is not interleaved/corrupted
    expect(['write-A', 'write-B']).toContain(content)
  })

  it('serializes concurrent appends preserving both entries', async () => {
    await Promise.all([
      saveFile(dirs, 'notes', 'log.md', 'entry-A', 'append'),
      saveFile(dirs, 'notes', 'log.md', 'entry-B', 'append'),
    ])
    const content = await fs.readFile(path.join(tmpDir, 'notes', 'log.md'), 'utf-8')
    expect(content).toContain('entry-A')
    expect(content).toContain('entry-B')
  })
})
