import { execa } from 'execa'
import { checkOrRequestPermission } from '../ipc/permissions.js'

export interface BashResult {
  success: boolean
  stdout?: string
  stderr?: string
  exitCode?: number
  error?: string
}

export async function runBash(command: string, timeoutMs = 30000): Promise<BashResult> {
  const allowed = await checkOrRequestPermission('bash', command)
  if (!allowed) return { success: false, error: 'Permission denied' }

  try {
    const result = await execa(command, [], {
      shell: true,
      timeout: timeoutMs,
      reject: false,
    })
    return {
      success: result.exitCode === 0,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}
