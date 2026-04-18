import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { randomBytes } from 'node:crypto'
import type { MarkdownDirs } from '../lib/config.js'
import { validatePathWithin, validateNewFilePath, MAX_FILE_SIZE } from '../lib/filesystem.js'

export type WriteMode = 'create' | 'append' | 'overwrite'

const ALLOWED_WRITE_EXTENSIONS = new Set(['.md', '.txt'])

function validateWriteExtension(filename: string): void {
  const ext = path.extname(filename).toLowerCase()
  if (!ALLOWED_WRITE_EXTENSIONS.has(ext)) {
    throw new Error(
      `File must have a .md or .txt extension, got: "${filename}"`
    )
  }
}

// In-memory write lock: file path → serialized promise chain
const writeLocks = new Map<string, Promise<void>>()

function withLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  const key = path.resolve(filePath)
  const prev = writeLocks.get(key) ?? Promise.resolve()
  let resolve!: () => void
  const next = new Promise<void>(r => { resolve = r })
  writeLocks.set(key, next)
  return prev.then(() => fn()).finally(() => {
    resolve()
    if (writeLocks.get(key) === next) writeLocks.delete(key)
  })
}

/**
 * Writes markdown content to a writable directory.
 * Modes: "create" (default, fails if exists), "overwrite" (replaces existing file), "append" (with date heading).
 * Uses atomic write (temp file + rename) to prevent corruption.
 * Serializes concurrent writes to the same file.
 * Returns the filename written.
 */
export async function saveFile(
  dirs: MarkdownDirs,
  directoryName: string,
  filename: string,
  content: string,
  mode: WriteMode = 'create'
): Promise<string> {
  const config = dirs[directoryName]
  if (!config) {
    throw new Error(`Unknown directory: "${directoryName}"`)
  }
  if (!config.writable) {
    throw new Error(`Directory "${directoryName}" is read-only. Only writable directories can be written to.`)
  }

  validateWriteExtension(filename)

  if (content.length > MAX_FILE_SIZE) {
    throw new Error(
      `Content exceeds the 50KB size limit (${content.length} bytes). Split it into smaller files.`
    )
  }

  const filePath = path.join(config.path, filename)
  await validateNewFilePath(filePath, config.path)

  return withLock(filePath, async () => {
    // Auto-create parent directories
    await fs.mkdir(path.dirname(filePath), { recursive: true })

    if (mode === 'create') {
      // Fail if file already exists
      try {
        await fs.access(filePath)
        throw new Error(
          `File already exists: "${filename}". Use mode "overwrite" to replace it.`
        )
      } catch (err: unknown) {
        if (err instanceof Error && err.message.includes('already exists')) throw err
        // ENOENT — file doesn't exist, proceed
      }
      await atomicWrite(filePath, content)
      return filename
    } else if (mode === 'overwrite') {
      await atomicWrite(filePath, content)
      return filename
    } else if (mode === 'append') {
      let existing = ''
      try {
        existing = await fs.readFile(filePath, 'utf-8')
      } catch {
        // File doesn't exist yet — start fresh
      }
      const today = new Date().toISOString().slice(0, 10)
      const appended = existing
        ? `${existing}\n\n## ${today}\n\n${content}`
        : `## ${today}\n\n${content}`
      await atomicWrite(filePath, appended)
      return filename
    }
    // Unreachable, but TypeScript needs this
    return filename
  })
}

/**
 * Copies a file atomically: copies to a .tmp file then renames.
 * Works across filesystems (unlike fs.rename alone).
 */
function tmpPath(filePath: string): string {
  return `${filePath}.${randomBytes(4).toString('hex')}.tmp`
}

async function atomicCopy(srcPath: string, dstPath: string): Promise<void> {
  const tmpPath_ = tmpPath(dstPath)
  try {
    await fs.copyFile(srcPath, tmpPath_)
    await fs.rename(tmpPath_, dstPath)
  } catch (err) {
    try { await fs.unlink(tmpPath_) } catch { /* ignore */ }
    throw err
  }
}

async function atomicWrite(filePath: string, content: string): Promise<void> {
  const tmpPath_ = tmpPath(filePath)
  try {
    await fs.writeFile(tmpPath_, content, 'utf-8')
    await fs.rename(tmpPath_, filePath)
  } catch (err) {
    // Clean up temp file on failure
    try { await fs.unlink(tmpPath_) } catch { /* ignore */ }
    throw err
  }
}

/**
 * Deletes a file in a writable directory.
 */
export async function deleteFile(
  dirs: MarkdownDirs,
  directoryName: string,
  filename: string
): Promise<void> {
  const config = dirs[directoryName]
  if (!config) {
    throw new Error(`Unknown directory: "${directoryName}"`)
  }
  if (!config.writable) {
    throw new Error(`Directory "${directoryName}" is read-only. Only writable directories can be modified.`)
  }

  validateWriteExtension(filename)

  const filePath = path.join(config.path, filename)
  await validatePathWithin(filePath, config.path)
  return withLock(filePath, async () => {
    await fs.unlink(filePath)
  })
}

/**
 * Moves/renames a file. Source can be any directory; destination must be writable.
 */
export async function moveFile(
  dirs: MarkdownDirs,
  sourceDirectory: string,
  sourceFilename: string,
  destDirectory: string,
  destFilename: string
): Promise<void> {
  const srcConfig = dirs[sourceDirectory]
  if (!srcConfig) {
    throw new Error(`Unknown directory: "${sourceDirectory}"`)
  }
  const dstConfig = dirs[destDirectory]
  if (!dstConfig) {
    throw new Error(`Unknown directory: "${destDirectory}"`)
  }
  if (!dstConfig.writable) {
    throw new Error(`Directory "${destDirectory}" is read-only. Destination must be writable.`)
  }

  const srcPath = path.join(srcConfig.path, sourceFilename)
  const dstPath = path.join(dstConfig.path, destFilename)

  await validatePathWithin(srcPath, srcConfig.path)
  await validateNewFilePath(dstPath, dstConfig.path)

  validateWriteExtension(destFilename)

  const resolvedSrc = path.resolve(srcPath)
  const resolvedDst = path.resolve(dstPath)
  if (resolvedSrc === resolvedDst) return // moving a file to itself is a no-op

  // Acquire locks in sorted order to prevent deadlock when two concurrent
  // moves involve the same pair of paths in opposite directions
  const [firstLock, secondLock] = resolvedSrc < resolvedDst
    ? [srcPath, dstPath]
    : [dstPath, srcPath]

  return withLock(firstLock, () => withLock(secondLock, async () => {
    // Auto-create destination parent directories
    await fs.mkdir(path.dirname(dstPath), { recursive: true })

    // Atomic copy then delete (works across different filesystems/iCloud dirs)
    await atomicCopy(srcPath, dstPath)
    try {
      await fs.unlink(srcPath)
    } catch (err: unknown) {
      // Destination was written successfully but source deletion failed.
      // Both copies now exist — report the issue rather than silently leaving a duplicate.
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(
        `File copied to "${destFilename}" but source deletion failed: ${msg}. ` +
        `Both copies exist — delete the source manually.`
      )
    }
  }))
}
