import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { listDirectories, listFiles } from '../src/tools/list.js'
import type { MarkdownDirs } from '../src/lib/config.js'

let tmpDir: string
let dirs: MarkdownDirs

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-list-'))
  await fs.mkdir(path.join(tmpDir, 'projects'))
  await fs.mkdir(path.join(tmpDir, 'notes'))
  dirs = {
    projects: { path: path.join(tmpDir, 'projects'), writable: false },
    notes: { path: path.join(tmpDir, 'notes'), writable: true },
  }
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// listDirectories
// ---------------------------------------------------------------------------

describe('listDirectories', () => {
  it('returns all configured directories', async () => {
    const result = await listDirectories(dirs)
    expect(result).toHaveLength(2)
    const names = result.map(d => d.name)
    expect(names).toContain('projects')
    expect(names).toContain('notes')
  })

  it('marks writable directories correctly', async () => {
    const result = await listDirectories(dirs)
    const projects = result.find(d => d.name === 'projects')!
    const notes = result.find(d => d.name === 'notes')!
    expect(projects.writable).toBe(false)
    expect(notes.writable).toBe(true)
  })

  it('includes subdirectory listing', async () => {
    await fs.mkdir(path.join(tmpDir, 'projects', 'work'))
    await fs.mkdir(path.join(tmpDir, 'projects', 'personal'))
    const result = await listDirectories(dirs)
    const projects = result.find(d => d.name === 'projects')!
    expect(projects.subdirs).toContain('work')
    expect(projects.subdirs).toContain('personal')
  })

  it('returns empty subdirs for empty directory', async () => {
    const result = await listDirectories(dirs)
    const notes = result.find(d => d.name === 'notes')!
    expect(notes.subdirs).toEqual([])
  })

  it('excludes _archive directory but not similarly named dirs', async () => {
    await fs.mkdir(path.join(tmpDir, 'projects', '_archive'))
    await fs.mkdir(path.join(tmpDir, 'projects', '_archive_2024'))
    const result = await listDirectories(dirs)
    const projects = result.find(d => d.name === 'projects')!
    expect(projects.subdirs).not.toContain('_archive')
    expect(projects.subdirs).toContain('_archive_2024')
  })
})

// ---------------------------------------------------------------------------
// listFiles
// ---------------------------------------------------------------------------

describe('listFiles', () => {
  it('lists .md files in a directory', async () => {
    await fs.writeFile(path.join(tmpDir, 'projects', 'a.md'), '')
    await fs.writeFile(path.join(tmpDir, 'projects', 'b.md'), '')
    const result = await listFiles(dirs, 'projects', '')
    const names = result.map(f => path.basename(f))
    expect(names).toContain('a.md')
    expect(names).toContain('b.md')
  })

  it('lists files in a subdirectory', async () => {
    await fs.mkdir(path.join(tmpDir, 'projects', 'work'))
    await fs.writeFile(path.join(tmpDir, 'projects', 'work', 'plan.md'), '')
    const result = await listFiles(dirs, 'projects', 'work')
    expect(result.map(f => path.basename(f))).toContain('plan.md')
  })

  it('throws for unknown directory name', async () => {
    await expect(listFiles(dirs, 'unknown', '')).rejects.toThrow(/unknown/)
  })

  it('rejects path traversal in subpath', async () => {
    await expect(listFiles(dirs, 'projects', '../notes')).rejects.toThrow(/outside/)
  })

  it('returns empty array for empty directory', async () => {
    const result = await listFiles(dirs, 'projects', '')
    expect(result).toEqual([])
  })
})
