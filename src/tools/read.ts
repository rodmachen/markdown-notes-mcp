import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { MarkdownDirs } from '../lib/config.js'
import { validatePathWithin, readFileContents, rethrowEperm } from '../lib/filesystem.js'

export interface ReadResult {
  content: string
  truncated: boolean
}

/**
 * Reads a markdown file by directory name + relative path.
 * Validates path security and enforces MAX_FILE_SIZE.
 * Returns a specific error if the file is an evicted iCloud stub.
 */
export async function readFile(
  dirs: MarkdownDirs,
  directoryName: string,
  filename: string
): Promise<ReadResult> {
  const config = dirs[directoryName]
  if (!config) {
    throw new Error(`Unknown directory: "${directoryName}"`)
  }

  const filePath = path.join(config.path, filename)
  await validatePathWithin(filePath, config.path)

  // Check for iCloud eviction stub (.filename.icloud)
  const stubPath = path.join(
    config.path,
    path.dirname(filename),
    `.${path.basename(filename)}.icloud`
  )

  try {
    await fs.access(filePath)
  } catch (fileErr: unknown) {
    rethrowEperm(fileErr)
    // File doesn't exist — check for iCloud stub
    try {
      await fs.access(stubPath)
      throw new Error(
        `File is evicted by iCloud. Please open the containing folder in Finder to trigger download.`
      )
    } catch (stubErr: unknown) {
      // Re-throw iCloud eviction error as-is
      if (stubErr instanceof Error && stubErr.message.includes('iCloud')) {
        throw stubErr
      }
      // Re-throw permission errors rather than masking them as "file not found"
      rethrowEperm(stubErr)
      throw new Error(`File not found: ${filename}`)
    }
  }

  return readFileContents(filePath)
}
