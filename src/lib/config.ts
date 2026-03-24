export interface DirConfig {
  path: string
  writable: boolean
}

export type MarkdownDirs = Record<string, DirConfig>

export function parseMarkdownDirs(raw: string): MarkdownDirs {
  if (!raw) {
    throw new Error('MARKDOWN_DIRS is empty')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('MARKDOWN_DIRS is not valid JSON')
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('MARKDOWN_DIRS must be a JSON object')
  }

  const result: MarkdownDirs = {}

  for (const [name, entry] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(`Directory "${name}" must be an object`)
    }

    const entryObj = entry as Record<string, unknown>

    if (!('path' in entryObj) || typeof entryObj.path !== 'string') {
      throw new Error(`Directory "${name}" is missing a valid path string`)
    }

    result[name] = {
      path: entryObj.path,
      writable: entryObj.writable === true,
    }
  }

  return result
}
