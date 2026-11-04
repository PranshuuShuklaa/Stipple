import { normalizeRepoPath, repoPathParts } from '../structure-navigation'

export const FILES_HERE_LABEL = '(files here)'
export const MAX_NAMED_FOLDERS = 12
export const KEEP_NAMED_FOLDERS = 11

export interface StructureFile {
  path: string
  size: number
}

export interface StructureGroup {
  /** Stable key for React and tests. */
  key: string
  /** Display name: a folder, '(files here)', or 'N other folders'. */
  label: string
  /** Full repo path to zoom into; null for the two synthetic buckets. */
  path: string | null
  count: number
  bytes: number
  /** True only when the folder contains at least one deeper folder. */
  zoomable: boolean
  /** Folder names merged into an 'N other folders' bucket. */
  folders: string[]
  isFilesHere: boolean
  isOther: boolean
}

export interface StructureGroups {
  groups: StructureGroup[]
  /** Group slot per input file; -1 when the file is outside the focus path. */
  groupOfFile: Int32Array
}

interface FolderAccumulator {
  name: string
  count: number
  bytes: number
  nested: boolean
}

function sortFolders(folders: FolderAccumulator[]): FolderAccumulator[] {
  return folders.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/**
 * Groups the file paths by the next folder segment below `focusPath`.
 *
 * - Files directly in the focus folder become '(files here)'.
 * - More than 12 folder children keep the 11 biggest and merge the rest into
 *   'N other folders'; exactly 12 children are all kept.
 * - The result is pure: same files and focus path always give the same data.
 */
export function collectStructureGroups(
  files: readonly StructureFile[],
  focusPath: string,
): StructureGroups {
  const focus = normalizeRepoPath(focusPath)
  const focusParts = repoPathParts(focus)
  const groupOfFile = new Int32Array(files.length).fill(-1)
  const pendingFolder = new Array<string | null>(files.length).fill(null)
  const pendingFilesHere = new Uint8Array(files.length)

  const folders = new Map<string, FolderAccumulator>()
  let filesHereCount = 0
  let filesHereBytes = 0

  for (let index = 0; index < files.length; index++) {
    const fileParts = repoPathParts(files[index]?.path ?? '')
    if (fileParts.length <= focusParts.length) continue

    let insideFocus = true
    for (let part = 0; part < focusParts.length; part++) {
      if (fileParts[part] !== focusParts[part]) {
        insideFocus = false
        break
      }
    }
    if (!insideFocus) continue

    const relative = fileParts.slice(focusParts.length)
    const size = files[index]?.size ?? 0
    if (relative.length === 1) {
      filesHereCount++
      filesHereBytes += size
      pendingFilesHere[index] = 1
      continue
    }

    const name = relative[0] ?? ''
    let folder = folders.get(name)
    if (!folder) {
      folder = { name, count: 0, bytes: 0, nested: false }
      folders.set(name, folder)
    }
    folder.count++
    folder.bytes += size
    if (relative.length > 2) folder.nested = true
    pendingFolder[index] = name
  }

  const sorted = sortFolders(Array.from(folders.values()))
  const overflow =
    sorted.length > MAX_NAMED_FOLDERS ? sorted.slice(KEEP_NAMED_FOLDERS) : []
  const named = overflow.length > 0 ? sorted.slice(0, KEEP_NAMED_FOLDERS) : sorted

  const groups: StructureGroup[] = named.map((folder) => ({
    key: `folder:${folder.name}`,
    label: folder.name,
    path: focus === '' ? folder.name : `${focus}/${folder.name}`,
    count: folder.count,
    bytes: folder.bytes,
    zoomable: folder.nested,
    folders: [],
    isFilesHere: false,
    isOther: false,
  }))

  if (overflow.length > 0) {
    groups.push({
      key: 'other-folders',
      label: `${overflow.length} other folders`,
      path: null,
      count: overflow.reduce((sum, folder) => sum + folder.count, 0),
      bytes: overflow.reduce((sum, folder) => sum + folder.bytes, 0),
      zoomable: false,
      folders: overflow.map((folder) => folder.name),
      isFilesHere: false,
      isOther: true,
    })
  }

  if (filesHereCount > 0) {
    groups.push({
      key: 'files-here',
      label: FILES_HERE_LABEL,
      path: null,
      count: filesHereCount,
      bytes: filesHereBytes,
      zoomable: false,
      folders: [],
      isFilesHere: true,
      isOther: false,
    })
  }

  if (groups.length === 0) {
    return { groups, groupOfFile }
  }

  const slotByFolder = new Map<string, number>()
  for (let slot = 0; slot < named.length; slot++) {
    const folder = named[slot]
    if (folder) slotByFolder.set(folder.name, slot)
  }
  const otherSlot = overflow.length > 0 ? named.length : -1
  for (const folder of overflow) slotByFolder.set(folder.name, otherSlot)
  const filesHereSlot = filesHereCount > 0 ? groups.length - 1 : -1

  for (let index = 0; index < files.length; index++) {
    if (pendingFilesHere[index] === 1) {
      groupOfFile[index] = filesHereSlot
      continue
    }
    const folderName = pendingFolder[index]
    if (folderName === null) continue
    groupOfFile[index] = slotByFolder.get(folderName) ?? -1
  }

  return { groups, groupOfFile }
}

/** The public grouping helper: next folder segments below the focus path. */
export function groupAt(
  files: readonly StructureFile[],
  focusPath: string,
): StructureGroup[] {
  return collectStructureGroups(files, focusPath).groups
}
