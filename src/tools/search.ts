import * as path from 'node:path'
import type { MarkdownDirs } from '../lib/config.js'
import { listFilesInDir, readFileContents } from '../lib/filesystem.js'

export interface SearchParams {
  query: string
  directory?: string
  max_results?: number
  max_matches_per_file?: number
  include_filenames?: boolean
}

export interface LineMatch {
  lineNumber: number
  line: string
}

export interface FileMatch {
  file: string
  directoryName: string
  matches: LineMatch[]
  filenameMatch: boolean
}

const SEARCH_CONCURRENCY = 8

/**
 * Full-text search across all .md files (content + filenames).
 * Processes files concurrently in batches to reduce wall-clock time on large vaults.
 */
export async function searchFiles(
  dirs: MarkdownDirs,
  params: SearchParams
): Promise<FileMatch[]> {
  const {
    query,
    directory,
    max_results = 20,
    max_matches_per_file = 3,
    include_filenames = true,
  } = params

  const lowerQuery = query.toLowerCase()

  // Determine which directories to search
  let searchDirs: Array<{ name: string; path: string }>
  if (directory) {
    const config = dirs[directory]
    if (!config) {
      throw new Error(`Unknown directory: "${directory}"`)
    }
    searchDirs = [{ name: directory, path: config.path }]
  } else {
    searchDirs = Object.entries(dirs).map(([name, config]) => ({ name, path: config.path }))
  }

  // Collect all candidate file paths (preserves discovery order for deterministic results)
  const allFiles: Array<{ filePath: string; dirName: string; dirPath: string }> = []
  for (const dir of searchDirs) {
    const files = await listFilesInDir(dir.path)
    for (const filePath of files) {
      allFiles.push({ filePath, dirName: dir.name, dirPath: dir.path })
    }
  }

  // Process in concurrent batches; stop early once max_results is reached
  const results: FileMatch[] = []

  for (let i = 0; i < allFiles.length && results.length < max_results; i += SEARCH_CONCURRENCY) {
    const batch = allFiles.slice(i, i + SEARCH_CONCURRENCY)

    const batchMatches = await Promise.all(
      batch.map(async ({ filePath, dirName, dirPath }): Promise<FileMatch | null> => {
        const relativePath = path.relative(dirPath, filePath)
        const filenameMatch =
          include_filenames && relativePath.toLowerCase().includes(lowerQuery)

        let contentMatches: LineMatch[] = []
        try {
          const { content } = await readFileContents(filePath)
          const lines = content.split('\n')
          for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            if (contentMatches.length >= max_matches_per_file) break
            if (lines[lineIdx].toLowerCase().includes(lowerQuery)) {
              contentMatches.push({ lineNumber: lineIdx + 1, line: lines[lineIdx] })
            }
          }
        } catch {
          return null
        }

        if (filenameMatch || contentMatches.length > 0) {
          return { file: relativePath, directoryName: dirName, matches: contentMatches, filenameMatch }
        }
        return null
      })
    )

    for (const match of batchMatches) {
      if (match && results.length < max_results) {
        results.push(match)
      }
    }
  }

  return results
}
