import keytar from 'keytar'
import crypto from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { SecretsBackend } from '../../shared/ipc'

/**
 * Password storage. Prefers the OS keychain (keytar); if that's unavailable
 * (e.g. libsecret not installed on Linux), falls back to an AES-256-GCM
 * encrypted file under ~/.tractodb/. Passwords are NEVER written in plain text
 * and NEVER logged.
 */

const SERVICE = 'tractodb'
const OLD_SERVICE = 'dbstudio' // pre-rename; only read during one-time migration
const DIR = path.join(os.homedir(), '.tractodb')
const KEY_FILE = path.join(DIR, '.secret-key')
const SECRETS_FILE = path.join(DIR, 'secrets.json')

interface EncryptedRecord {
  iv: string
  tag: string
  data: string
}

let cachedBackend: SecretsBackend | null = null

async function probeKeytar(): Promise<boolean> {
  try {
    await keytar.setPassword(SERVICE, '__probe__', 'probe')
    await keytar.deletePassword(SERVICE, '__probe__')
    return true
  } catch {
    return false
  }
}

export async function getSecretsBackend(): Promise<SecretsBackend> {
  if (cachedBackend) return cachedBackend
  cachedBackend = (await probeKeytar()) ? 'keychain' : 'encrypted-file'
  return cachedBackend
}

// ─── AES-256-GCM fallback ──────────────────────────────────────────────────────

async function loadKey(): Promise<Buffer> {
  try {
    return Buffer.from(await fs.readFile(KEY_FILE, 'utf8'), 'hex')
  } catch {
    const key = crypto.randomBytes(32)
    await fs.mkdir(DIR, { recursive: true })
    await fs.writeFile(KEY_FILE, key.toString('hex'), { mode: 0o600 })
    return key
  }
}

function encrypt(key: Buffer, plain: string): EncryptedRecord {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return { iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), data: data.toString('hex') }
}

function decrypt(key: Buffer, rec: EncryptedRecord): string {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(rec.iv, 'hex'))
  decipher.setAuthTag(Buffer.from(rec.tag, 'hex'))
  return Buffer.concat([decipher.update(Buffer.from(rec.data, 'hex')), decipher.final()]).toString('utf8')
}

async function readStore(): Promise<Record<string, EncryptedRecord>> {
  try {
    return JSON.parse(await fs.readFile(SECRETS_FILE, 'utf8')) as Record<string, EncryptedRecord>
  } catch {
    return {}
  }
}

async function writeStore(store: Record<string, EncryptedRecord>): Promise<void> {
  await fs.mkdir(DIR, { recursive: true })
  await fs.writeFile(SECRETS_FILE, JSON.stringify(store, null, 2), { mode: 0o600 })
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function setSecret(id: string, password: string): Promise<void> {
  if ((await getSecretsBackend()) === 'keychain') {
    await keytar.setPassword(SERVICE, id, password)
    return
  }
  const key = await loadKey()
  const store = await readStore()
  store[id] = encrypt(key, password)
  await writeStore(store)
}

export async function getSecret(id: string): Promise<string | undefined> {
  if ((await getSecretsBackend()) === 'keychain') {
    const value = await keytar.getPassword(SERVICE, id)
    return value ?? undefined
  }
  const store = await readStore()
  const rec = store[id]
  if (!rec) return undefined
  try {
    return decrypt(await loadKey(), rec)
  } catch {
    return undefined
  }
}

export async function deleteSecret(id: string): Promise<void> {
  if ((await getSecretsBackend()) === 'keychain') {
    await keytar.deletePassword(SERVICE, id).catch(() => false)
    return
  }
  const store = await readStore()
  if (id in store) {
    delete store[id]
    await writeStore(store)
  }
}

/**
 * One-time keychain rename: move passwords stored under the old service name
 * to the new one. Only relevant for the keychain backend — the AES-file store
 * migrates with the config directory copy. Safe to call repeatedly.
 */
export async function migrateKeychainPasswords(ids: string[]): Promise<void> {
  if ((await getSecretsBackend()) !== 'keychain') return
  for (const id of ids) {
    if (await keytar.getPassword(SERVICE, id)) continue // already migrated
    const old = await keytar.getPassword(OLD_SERVICE, id)
    if (old) {
      await keytar.setPassword(SERVICE, id, old)
      await keytar.deletePassword(OLD_SERVICE, id).catch(() => false)
    }
  }
}
