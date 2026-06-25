import type { DbStudioApi, IpcResponse } from '@shared/ipc'

/**
 * Safe accessor for the preload bridge. Stores call `api().connection.connect(...)`
 * etc. — never `window.dbstudio` directly, so a missing bridge fails loudly with
 * a clear message instead of a `cannot read property of undefined`.
 */
export function api(): DbStudioApi {
  const bridge = window.dbstudio
  if (!bridge) {
    throw new Error('Desktop bridge unavailable — DBStudio must run inside Electron.')
  }
  return bridge
}

/** Unwrap an IpcResponse, throwing the error message on failure. */
export function unwrap<T>(response: IpcResponse<T>): T {
  if (!response.success) {
    throw new Error(response.error)
  }
  return response.data
}
