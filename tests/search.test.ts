import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { searchFiles } from '../src/tools/search.js'
import type { MarkdownDirs } from '../src/lib/config.js'

let tmpDir: string
let dirs: MarkdownDirs

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-search-'))
  await fs.mkdir(path.join(tmpDir, 'notes'))
  await fs.mkdir(path.join(tmpDir, 'projects'))
  dirs = {
    notes: { path: path.join(tmpDir, 'notes'), writable: true },
    projects: { path: path.join(tmpDir, 'projects'), writable: false },
  }
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('searchFiles', () => {
  it('finds files by content', async () => {
    await fs.writeFile(path.join(tmpDir, 'notes', 'work.md'), 'meeting notes for the team')
    await fs.writeFile(path.join(tmpDir, 'notes', 'other.md'), 'nothing relevant here')
    const results = await searchFiles(dirs, { query: 'meeting' })
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].file).toContain('work.md')
  })

  it('is case-insensitive', async () => {
    await fs.writeFile(path.join(tmpDir, 'notes', 'note.md'), 'Meeting Notes')
    const results = await searchFiles(dirs, { query: 'meeting' })
    expect(results.length).toBeGreaterThan(0)
  })

  it('returns matching lines with context', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'notes', 'note.md'),
      'line one\nmeeting notes here\nline three'
    )
    const results = await searchFiles(dirs, { query: 'meeting' })
    expect(results[0].matches[0].line).toContain('meeting notes here')
  })

  it('matches filenames when include_filenames is true', async () => {
    await fs.writeFile(path.join(tmpDir, 'notes', 'interview-prep.md'), 'some content here')
    const results = await searchFiles(dirs, { query: 'interview', include_filenames: true })
    expect(results.length).toBeGreaterThan(0)
  })

  it('does not match filenames when include_filenames is false', async () => {
    await fs.writeFile(path.join(tmpDir, 'notes', 'interview-prep.md'), 'no matching content')
    const results = await searchFiles(dirs, { query: 'interview', include_filenames: false })
    expect(results.length).toBe(0)
  })

  it('scopes search to a specific directory', async () => {
    await fs.writeFile(path.join(tmpDir, 'notes', 'note.md'), 'target content')
    await fs.writeFile(path.join(tmpDir, 'projects', 'proj.md'), 'target content')
    const results = await searchFiles(dirs, { query: 'target', directory: 'notes' })
    expect(results.every(r => r.file.includes(path.join(tmpDir, 'notes')))).toBe(true)
  })

  it('throws for unknown directory when scoped', async () => {
    await expect(
      searchFiles(dirs, { query: 'anything', directory: 'nonexistent' })
    ).rejects.toThrow(/[Uu]nknown|nonexistent/)
  })

  it('respects max_results limit', async () => {
    for (let i = 0; i < 5; i++) {
      await fs.writeFile(path.join(tmpDir, 'notes', `note${i}.md`), 'common content')
    }
    const results = await searchFiles(dirs, { query: 'common', max_results: 2 })
    expect(results.length).toBeLessThanOrEqual(2)
  })

  it('respects max_matches_per_file limit', async () => {
    const content = Array.from({ length: 10 }, (_, i) => `match line ${i}`).join('\n')
    await fs.writeFile(path.join(tmpDir, 'notes', 'multi.md'), content)
    const results = await searchFiles(dirs, { query: 'match', max_matches_per_file: 2 })
    expect(results[0].matches.length).toBeLessThanOrEqual(2)
  })

  it('returns empty array when nothing matches', async () => {
    await fs.writeFile(path.join(tmpDir, 'notes', 'note.md'), 'hello world')
    const results = await searchFiles(dirs, { query: 'zzznomatch' })
    expect(results).toEqual([])
  })

  it('searches across multiple directories', async () => {
    await fs.writeFile(path.join(tmpDir, 'notes', 'note.md'), 'find me')
    await fs.writeFile(path.join(tmpDir, 'projects', 'proj.md'), 'find me too')
    const results = await searchFiles(dirs, { query: 'find me' })
    const files = results.map(r => r.file)
    expect(files.some(f => f.includes('notes'))).toBe(true)
    expect(files.some(f => f.includes('projects'))).toBe(true)
  })
})
