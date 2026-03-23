import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { MarkdownDirs } from '../lib/config.js'
import { validatePathWithin, listFilesInDir } from '../lib/filesystem.js'

export interface DirectoryInfo {
  name: string
  path: string
  writable: boolean
  subdirs: string[]
}

/**
 * Returns top-level structure of all configured directories.
 */
export async function listDirectories(dirs: MarkdownDirs): Promise<DirectoryInfo[]> {
  const results: DirectoryInfo[] = []

  for (const [name, config] of Object.entries(dirs)) {
    const subdirs = await getSubdirs(config.path)
    results.push({
      name,
      path: config.path,
      writable: config.writable,
      subdirs,
    })
  }

  return results
}

async function getSubdirs(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    return entries
      .filter(e => e.isDirectory() && !e.name.startsWith('_archive'))
      .map(e => e.name)
      .sort()
  } catch {
    return []
  }
}

/**
 * Lists allowed files in a specific path within a configured directory.
 */
export async function listFiles(
  dirs: MarkdownDirs,
  directoryName: string,
  subpath: string
): Promise<string[]> {
  const config = dirs[directoryName]
  if (!config) {
    throw new Error(`Unknown directory: "${directoryName}"`)
  }

  const targetPath = subpath
    ? path.join(config.path, subpath)
    : config.path

  await validatePathWithin(targetPath, config.path)

  return listFilesInDir(targetPath)
}
