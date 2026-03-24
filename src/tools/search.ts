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

/**
 * Full-text search across all .md files (content + filenames).
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

  const results: FileMatch[] = []

  for (const dir of searchDirs) {
    if (results.length >= max_results) break

    const files = await listFilesInDir(dir.path)

    for (const filePath of files) {
      if (results.length >= max_results) break

      const relativePath = path.relative(dir.path, filePath)
      const filenameMatch =
        include_filenames && relativePath.toLowerCase().includes(lowerQuery)

      // Search content
      let contentMatches: LineMatch[] = []
      try {
        const { content } = await readFileContents(filePath)
        const lines = content.split('\n')
        for (let i = 0; i < lines.length; i++) {
          if (contentMatches.length >= max_matches_per_file) break
          if (lines[i].toLowerCase().includes(lowerQuery)) {
            contentMatches.push({ lineNumber: i + 1, line: lines[i] })
          }
        }
      } catch {
        continue
      }

      if (filenameMatch || contentMatches.length > 0) {
        results.push({
          file: relativePath,
          directoryName: dir.name,
          matches: contentMatches,
          filenameMatch,
        })
      }
    }
  }

  return results
}
