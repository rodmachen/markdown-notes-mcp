import * as fs from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import * as path from 'node:path'

export const MAX_FILE_SIZE = 50 * 1024 // 50KB

const ALLOWED_EXTENSIONS = new Set(['.md', '.txt'])

/**
 * Returns true if the filename is an allowed markdown/text file
 * (not a binary, not an .icloud stub).
 */
export function isAllowedFile(filename: string): boolean {
  if (filename.endsWith('.icloud')) return false
  const ext = path.extname(filename).toLowerCase()
  return ALLOWED_EXTENSIONS.has(ext)
}

/**
 * Validates that an existing file path is within the base directory.
 * Uses fs.realpath() on both paths to resolve symlinks and detect escapes.
 * Falls back to path.resolve() (against the non-realpath base) when the file
 * doesn't exist, to catch .. traversal on non-existent paths.
 * Throws if the resolved path is outside the base dir.
 */
export async function validatePathWithin(filePath: string, baseDir: string): Promise<void> {
  const resolvedBase = await fs.realpath(baseDir)

  try {
    // For existing files: realpath resolves both .. and symlinks
    const resolvedFile = await fs.realpath(filePath)
    if (!resolvedFile.startsWith(resolvedBase + path.sep) && resolvedFile !== resolvedBase) {
      throw new Error(`Path is outside the allowed directory: ${filePath}`)
    }
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === 'ENOENT') {
      // File doesn't exist — use path.resolve() against the non-symlinked base
      // to catch .. traversal (e.g. /tmp/base/../../../etc/passwd)
      const normalizedBase = path.resolve(baseDir)
      const normalized = path.resolve(filePath)
      if (!normalized.startsWith(normalizedBase + path.sep) && normalized !== normalizedBase) {
        throw new Error(`Path is outside the allowed directory: ${filePath}`)
      }
      return
    }
    throw err
  }
}

/**
 * Validates that a new (not-yet-existing) file path is within the base directory.
 * Since the file doesn't exist, we resolve the nearest existing ancestor instead.
 * Throws if the resolved ancestor is outside the base dir.
 */
export async function validateNewFilePath(filePath: string, baseDir: string): Promise<void> {
  const resolvedBase = await fs.realpath(baseDir)

  // Walk up until we find an existing ancestor
  let check = path.resolve(filePath)
  while (true) {
    try {
      const resolved = await fs.realpath(check)
      if (!resolved.startsWith(resolvedBase + path.sep) && resolved !== resolvedBase) {
        throw new Error(`Path is outside the allowed directory: ${filePath}`)
      }
      return
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') {
        const parent = path.dirname(check)
        if (parent === check) {
          // Reached filesystem root without finding an existing ancestor
          throw new Error(`Path is outside the allowed directory: ${filePath}`)
        }
        check = parent
      } else {
        throw err
      }
    }
  }
}

/**
 * Recursively lists all allowed files (.md, .txt) under a directory.
 * Skips .icloud stubs, _archive directories, and non-allowed file types.
 */
export async function listFilesInDir(dir: string): Promise<string[]> {
  const results: string[] = []
  await walk(dir, results)
  return results
}

async function walk(dir: string, results: string[]): Promise<void> {
  let entries: Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch (err: unknown) {
    rethrowEperm(err)
    return
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      if (entry.name === '_archive') continue
      await walk(fullPath, results)
    } else if (entry.isFile()) {
      if (isAllowedFile(entry.name)) {
        results.push(fullPath)
      }
    }
  }
}

/**
 * Reads a file's contents, truncating at MAX_FILE_SIZE with a notice.
 */
export async function readFileContents(
  filePath: string
): Promise<{ content: string; truncated: boolean }> {
  const raw = await fs.readFile(filePath, 'utf-8')

  if (raw.length > MAX_FILE_SIZE) {
    const sliced = raw.slice(0, MAX_FILE_SIZE)
    return {
      content: sliced + '\n\n[truncated] File exceeds 50KB limit.',
      truncated: true,
    }
  }

  return { content: raw, truncated: false }
}

/**
 * Re-throws EPERM errors with a helpful Full Disk Access message.
 */
export function rethrowEperm(err: unknown): void {
  if (isNodeError(err) && err.code === 'EPERM') {
    throw new Error(
      'Permission denied. Grant Full Disk Access to this application in System Settings → Privacy & Security.'
    )
  }
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return typeof err === 'object' && err !== null && 'code' in err
}
