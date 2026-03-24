import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import {
  isAllowedFile,
  validatePathWithin,
  validateNewFilePath,
  listFilesInDir,
  readFileContents,
  MAX_FILE_SIZE,
} from '../src/lib/filesystem.js'

// Temp directory for filesystem tests
let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-test-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// isAllowedFile
// ---------------------------------------------------------------------------

describe('isAllowedFile', () => {
  it('allows .md files', () => {
    expect(isAllowedFile('notes.md')).toBe(true)
  })

  it('allows .txt files', () => {
    expect(isAllowedFile('readme.txt')).toBe(true)
  })

  it('rejects .js files', () => {
    expect(isAllowedFile('script.js')).toBe(false)
  })

  it('rejects .pdf files', () => {
    expect(isAllowedFile('document.pdf')).toBe(false)
  })

  it('rejects files with no extension', () => {
    expect(isAllowedFile('Makefile')).toBe(false)
  })

  it('rejects .icloud stub files', () => {
    expect(isAllowedFile('.notes.icloud')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// validatePathWithin — existing files
// ---------------------------------------------------------------------------

describe('validatePathWithin', () => {
  it('accepts a file directly in the base dir', async () => {
    const file = path.join(tmpDir, 'notes.md')
    await fs.writeFile(file, 'hello')
    await expect(validatePathWithin(file, tmpDir)).resolves.not.toThrow()
  })

  it('accepts a file in a subdirectory', async () => {
    const subDir = path.join(tmpDir, 'sub')
    await fs.mkdir(subDir)
    const file = path.join(subDir, 'notes.md')
    await fs.writeFile(file, 'hello')
    await expect(validatePathWithin(file, tmpDir)).resolves.not.toThrow()
  })

  it('rejects .. traversal', async () => {
    const traversal = path.join(tmpDir, '..', 'etc', 'passwd')
    await expect(validatePathWithin(traversal, tmpDir)).rejects.toThrow(/outside/)
  })

  it('rejects a symlink escaping the base dir', async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-outside-'))
    const outsideFile = path.join(outside, 'secret.md')
    await fs.writeFile(outsideFile, 'secret')

    const link = path.join(tmpDir, 'escape.md')
    await fs.symlink(outsideFile, link)

    try {
      await expect(validatePathWithin(link, tmpDir)).rejects.toThrow(/outside/)
    } finally {
      await fs.rm(outside, { recursive: true, force: true })
    }
  })
})

// ---------------------------------------------------------------------------
// validateNewFilePath — for files that don't exist yet
// ---------------------------------------------------------------------------

describe('validateNewFilePath', () => {
  it('accepts a new file path whose parent is within the base dir', async () => {
    const newFile = path.join(tmpDir, 'new-note.md')
    await expect(validateNewFilePath(newFile, tmpDir)).resolves.not.toThrow()
  })

  it('accepts a new file in a new subdirectory within base dir', async () => {
    const newFile = path.join(tmpDir, 'sub', 'deep', 'new-note.md')
    await expect(validateNewFilePath(newFile, tmpDir)).resolves.not.toThrow()
  })

  it('rejects .. traversal for new files', async () => {
    const traversal = path.join(tmpDir, '..', 'evil.md')
    await expect(validateNewFilePath(traversal, tmpDir)).rejects.toThrow(/outside/)
  })
})

// ---------------------------------------------------------------------------
// listFilesInDir
// ---------------------------------------------------------------------------

describe('listFilesInDir', () => {
  it('lists .md files in a directory', async () => {
    await fs.writeFile(path.join(tmpDir, 'a.md'), '')
    await fs.writeFile(path.join(tmpDir, 'b.md'), '')
    const files = await listFilesInDir(tmpDir)
    expect(files.map(f => path.basename(f)).sort()).toEqual(['a.md', 'b.md'])
  })

  it('lists .txt files', async () => {
    await fs.writeFile(path.join(tmpDir, 'note.txt'), '')
    const files = await listFilesInDir(tmpDir)
    expect(files.map(f => path.basename(f))).toContain('note.txt')
  })

  it('skips non-markdown files', async () => {
    await fs.writeFile(path.join(tmpDir, 'script.js'), '')
    await fs.writeFile(path.join(tmpDir, 'note.md'), '')
    const files = await listFilesInDir(tmpDir)
    expect(files.map(f => path.basename(f))).toEqual(['note.md'])
  })

  it('skips .icloud stub files', async () => {
    await fs.writeFile(path.join(tmpDir, '.note.icloud'), '')
    await fs.writeFile(path.join(tmpDir, 'real.md'), '')
    const files = await listFilesInDir(tmpDir)
    expect(files.map(f => path.basename(f))).toEqual(['real.md'])
  })

  it('recursively lists files in subdirectories', async () => {
    const sub = path.join(tmpDir, 'sub')
    await fs.mkdir(sub)
    await fs.writeFile(path.join(tmpDir, 'root.md'), '')
    await fs.writeFile(path.join(sub, 'deep.md'), '')
    const files = await listFilesInDir(tmpDir)
    expect(files).toHaveLength(2)
  })

  it('skips _archive directories', async () => {
    const archive = path.join(tmpDir, '_archive')
    await fs.mkdir(archive)
    await fs.writeFile(path.join(archive, 'old.md'), '')
    await fs.writeFile(path.join(tmpDir, 'current.md'), '')
    const files = await listFilesInDir(tmpDir)
    expect(files.map(f => path.basename(f))).toEqual(['current.md'])
  })

  it('returns empty array for empty directory', async () => {
    const files = await listFilesInDir(tmpDir)
    expect(files).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// readFileContents
// ---------------------------------------------------------------------------

describe('readFileContents', () => {
  it('reads a file normally', async () => {
    const file = path.join(tmpDir, 'note.md')
    await fs.writeFile(file, '# Hello\n\nWorld')
    const { content, truncated } = await readFileContents(file)
    expect(content).toBe('# Hello\n\nWorld')
    expect(truncated).toBe(false)
  })

  it('truncates files exceeding MAX_FILE_SIZE', async () => {
    const file = path.join(tmpDir, 'big.md')
    const bigContent = 'x'.repeat(MAX_FILE_SIZE + 100)
    await fs.writeFile(file, bigContent)
    const { content, truncated } = await readFileContents(file)
    expect(truncated).toBe(true)
    expect(content.length).toBeLessThanOrEqual(MAX_FILE_SIZE + 200) // notice appended
    expect(content).toContain('[truncated]')
  })

  it('does not truncate files at exactly MAX_FILE_SIZE bytes', async () => {
    const file = path.join(tmpDir, 'exact.md')
    const exactContent = 'x'.repeat(MAX_FILE_SIZE)
    await fs.writeFile(file, exactContent)
    const { content, truncated } = await readFileContents(file)
    expect(truncated).toBe(false)
    expect(content).toBe(exactContent)
  })

  it('throws ENOENT for missing files', async () => {
    const file = path.join(tmpDir, 'missing.md')
    await expect(readFileContents(file)).rejects.toThrow()
  })
})
