import { describe, it, expect } from 'vitest'
import { parseMarkdownDirs, type DirConfig } from '../src/lib/config.js'

describe('parseMarkdownDirs', () => {
  it('parses a valid config with one read-only directory', () => {
    const input = JSON.stringify({
      projects: { path: '/home/user/Projects' },
    })
    const result = parseMarkdownDirs(input)
    expect(result).toEqual({
      projects: { path: '/home/user/Projects', writable: false },
    })
  })

  it('parses a valid config with a writable directory', () => {
    const input = JSON.stringify({
      notes: { path: '/home/user/notes', writable: true },
    })
    const result = parseMarkdownDirs(input)
    expect(result).toEqual({
      notes: { path: '/home/user/notes', writable: true },
    })
  })

  it('parses multiple directories', () => {
    const input = JSON.stringify({
      projects: { path: '/home/user/Projects' },
      notes: { path: '/home/user/notes', writable: true },
    })
    const result = parseMarkdownDirs(input)
    expect(result.projects.writable).toBe(false)
    expect(result.notes.writable).toBe(true)
  })

  it('throws on invalid JSON', () => {
    expect(() => parseMarkdownDirs('not json')).toThrow()
  })

  it('throws when MARKDOWN_DIRS is empty string', () => {
    expect(() => parseMarkdownDirs('')).toThrow()
  })

  it('throws when a directory entry is missing path', () => {
    const input = JSON.stringify({ projects: { writable: false } })
    expect(() => parseMarkdownDirs(input)).toThrow(/path/)
  })

  it('throws when path is not a string', () => {
    const input = JSON.stringify({ projects: { path: 42 } })
    expect(() => parseMarkdownDirs(input)).toThrow(/path/)
  })

  it('throws when top level is not an object', () => {
    expect(() => parseMarkdownDirs(JSON.stringify([]))).toThrow()
  })

  it('defaults writable to false when omitted', () => {
    const input = JSON.stringify({ projects: { path: '/some/path' } })
    const result = parseMarkdownDirs(input)
    expect(result.projects.writable).toBe(false)
  })
})
