import { useCallback, useEffect, useRef, useState } from 'react'
import type { BackupConfig, BackupProgress, RestoreConfig } from '@shared/ipc'
import { api } from '@/store/ipcClient'

interface UseBackupResult {
  lines: BackupProgress[]
  isRunning: boolean
  exitCode: number | null
  /** Output file size (bytes) reported on a successful finish; null otherwise. */
  bytes: number | null
  startBackup: (config: BackupConfig) => Promise<void>
  startRestore: (config: RestoreConfig) => Promise<void>
  cancel: () => Promise<void>
  reset: () => void
}

/**
 * Drives a backup/restore run: subscribes to the `backup:progress` push channel
 * and exposes start/cancel plus the streamed output. (One run at a time.)
 */
export function useBackup(): UseBackupResult {
  const [lines, setLines] = useState<BackupProgress[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [exitCode, setExitCode] = useState<number | null>(null)
  const [bytes, setBytes] = useState<number | null>(null)
  const runningRef = useRef(false)

  useEffect(() => {
    const unsubscribe = api().backup.onProgress((progress) => {
      setLines((prev) => (progress.line ? [...prev, progress] : prev))
      if (progress.isDone) {
        runningRef.current = false
        setIsRunning(false)
        setExitCode(progress.exitCode ?? null)
        setBytes(progress.bytes ?? null)
      }
    })
    return unsubscribe
  }, [])

  const begin = useCallback(() => {
    setLines([])
    setExitCode(null)
    setBytes(null)
    runningRef.current = true
    setIsRunning(true)
  }, [])

  const fail = useCallback((message: string) => {
    runningRef.current = false
    setIsRunning(false)
    setExitCode(-1)
    setLines((prev) => [...prev, { line: message, isError: true, isDone: true, exitCode: -1 }])
  }, [])

  const startBackup = useCallback(
    async (config: BackupConfig) => {
      begin()
      const res = await api().backup.startBackup(config)
      if (!res.success) fail(res.error)
    },
    [begin, fail],
  )

  const startRestore = useCallback(
    async (config: RestoreConfig) => {
      begin()
      const res = await api().backup.startRestore(config)
      if (!res.success) fail(res.error)
    },
    [begin, fail],
  )

  const cancel = useCallback(async () => {
    await api().backup.cancel()
  }, [])

  const reset = useCallback(() => {
    setLines([])
    setExitCode(null)
    setBytes(null)
    setIsRunning(false)
    runningRef.current = false
  }, [])

  return { lines, isRunning, exitCode, bytes, startBackup, startRestore, cancel, reset }
}
