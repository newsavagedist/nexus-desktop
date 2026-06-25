import fs from 'node:fs/promises'
import { checkOrRequestPermission } from '../ipc/permissions.js'

export interface FileToolResult {
  success: boolean
  data?: string
  error?: string
}

export async function readFile(path: string): Promise<FileToolResult> {
  const allowed = await checkOrRequestPermission('read_file', path)
  if (!allowed) return { success: false, error: 'Permission denied' }
  try {
    const data = await fs.readFile(path, 'utf-8')
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function writeFile(path: string, content: string): Promise<FileToolResult> {
  const allowed = await checkOrRequestPermission('write_file', path)
  if (!allowed) return { success: false, error: 'Permission denied' }
  try {
    await fs.writeFile(path, content, 'utf-8')
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function listDir(dirPath: string): Promise<FileToolResult> {
  const allowed = await checkOrRequestPermission('list_dir', dirPath)
  if (!allowed) return { success: false, error: 'Permission denied' }
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    const data = entries.map(e => {
      const isDir = e.isDirectory() ? '/' : ''
      const isSymlink = e.isSymbolicLink() ? '@' : ''
      return `${e.name}${isDir}${isSymlink}`
    }).join('\n')
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function fileInfo(filePath: string): Promise<FileToolResult> {
  const allowed = await checkOrRequestPermission('file_info', filePath)
  if (!allowed) return { success: false, error: 'Permission denied' }
  try {
    const stat = await fs.stat(filePath)
    const data = JSON.stringify({
      size: stat.size,
      isDirectory: stat.isDirectory(),
      isFile: stat.isFile(),
      isSymlink: stat.isSymbolicLink(),
      modified: stat.mtime.toISOString(),
      created: stat.birthtime.toISOString(),
      mode: stat.mode.toString(8),
    }, null, 2)
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function deleteFile(path: string): Promise<FileToolResult> {
  const allowed = await checkOrRequestPermission('delete_file', path)
  if (!allowed) return { success: false, error: 'Permission denied' }
  try {
    await fs.unlink(path)
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function createDir(dirPath: string): Promise<FileToolResult> {
  const allowed = await checkOrRequestPermission('create_dir', dirPath)
  if (!allowed) return { success: false, error: 'Permission denied' }
  try {
    await fs.mkdir(dirPath, { recursive: true })
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}
