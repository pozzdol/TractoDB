import { execFile } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import type { ClientDetection, DetectedClient } from '../../../shared/ipc'
import { getPreferences } from '../config'

const run = promisify(execFile)

/** Run `<binary> --version` and pull the first version-looking token out. */
async function readVersion(binary: string): Promise<string | undefined> {
  try {
    const { stdout } = await run(binary, ['--version'], { timeout: 4000 })
    const match = /(\d+\.\d+(?:\.\d+)?)/.exec(stdout)
    return match?.[1]
  } catch {
    return undefined
  }
}

async function which(name: string): Promise<string | undefined> {
  try {
    const { stdout } = await run('which', [name], { timeout: 4000 })
    const line = stdout.split('\n')[0]?.trim()
    return line || undefined
  } catch {
    return undefined
  }
}

/** Highest-versioned /usr/lib/postgresql/<ver>/bin that contains pg_dump. */
function globPostgresVersionDirs(): string[] {
  const base = '/usr/lib/postgresql'
  if (!existsSync(base)) return []
  try {
    return readdirSync(base)
      .map((v) => ({ v, num: Number.parseFloat(v) }))
      .filter((e) => Number.isFinite(e.num))
      .sort((a, b) => b.num - a.num)
      .map((e) => path.join(base, e.v, 'bin'))
  } catch {
    return []
  }
}

interface Spec {
  binary: string
  override?: string
  candidateDirs: string[]
}

async function detect(spec: Spec): Promise<DetectedClient> {
  try {
    // 1) user override
    if (spec.override) {
      const bin = path.join(spec.override, spec.binary)
      if (existsSync(bin)) {
        return { found: true, path: spec.override, version: await readVersion(bin) }
      }
    }
    // 2) which
    const onPath = await which(spec.binary)
    if (onPath) {
      return { found: true, path: path.dirname(onPath), version: await readVersion(onPath) }
    }
    // 3) common directories
    for (const dir of spec.candidateDirs) {
      const bin = path.join(dir, spec.binary)
      if (existsSync(bin)) {
        return { found: true, path: dir, version: await readVersion(bin) }
      }
    }
    return { found: false }
  } catch {
    return { found: false }
  }
}

export async function detectPostgreSQL(): Promise<DetectedClient> {
  const prefs = await getPreferences()
  return detect({
    binary: 'pg_dump',
    override: prefs.nativeClient?.postgresql,
    candidateDirs: [
      '/usr/bin',
      ...globPostgresVersionDirs(),
      '/opt/homebrew/bin',
      '/usr/local/bin',
      ...globMacPostgresApp(),
    ],
  })
}

export async function detectMySQL(): Promise<DetectedClient> {
  const prefs = await getPreferences()
  return detect({
    binary: 'mysqldump',
    override: prefs.nativeClient?.mysql,
    candidateDirs: ['/usr/bin', '/usr/local/bin', '/opt/homebrew/bin'],
  })
}

function globMacPostgresApp(): string[] {
  const base = '/Applications/Postgres.app/Contents/Versions'
  if (!existsSync(base)) return []
  try {
    return readdirSync(base)
      .sort()
      .reverse()
      .map((v) => path.join(base, v, 'bin'))
  } catch {
    return []
  }
}

export async function detectAll(): Promise<ClientDetection> {
  const [postgresql, mysql] = await Promise.all([detectPostgreSQL(), detectMySQL()])
  return { postgresql, mysql }
}
