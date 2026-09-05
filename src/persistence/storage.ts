import { MAX_SAVE_BYTES, SAVE_BACKUP_KEY, SAVE_KEY, serializeSave, validateSave, type SaveV1 } from './save';

export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type StoredSaveStatus = 'empty' | 'valid' | 'protected' | 'unknown';

export interface StoredSaveEntry {
  raw: string | null;
  save: SaveV1 | null;
  error: string | null;
  status: StoredSaveStatus;
}

export interface SaveInspection {
  primary: StoredSaveEntry;
  backup: StoredSaveEntry;
  /**
   * Retained for diagnostics and callers written against the first checkpoint
   * API. A read error on either key no longer discards the other key's result.
   */
  readError: string | null;
}

export interface SaveWriteResult {
  ok: boolean;
  raw: string | null;
  error: string | null;
  backupError: string | null;
}

export function browserSaveStorage(): SaveStorage {
  if (typeof window === 'undefined' || !window.localStorage) throw new Error('Browser storage is unavailable.');
  return window.localStorage;
}

function parseStored(raw: string | null): StoredSaveEntry {
  if (raw === null) return { raw: null, save: null, error: null, status: 'empty' };
  if (new TextEncoder().encode(raw).byteLength > MAX_SAVE_BYTES) {
    return { raw, save: null, error: 'Save exceeds the 1 MB limit.', status: 'protected' };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return { raw, save: validateSave(parsed), error: null, status: 'valid' };
  } catch (error) {
    return {
      raw,
      save: null,
      error: error instanceof Error ? error.message : 'Save could not be read.',
      status: 'protected',
    };
  }
}

function unreadableEntry(error: unknown): StoredSaveEntry {
  return {
    raw: null,
    save: null,
    error: error instanceof Error ? error.message : 'Browser storage could not be read.',
    status: 'unknown',
  };
}

function isValidStoredRaw(raw: string): boolean {
  if (new TextEncoder().encode(raw).byteLength > MAX_SAVE_BYTES) return false;
  try {
    validateSave(JSON.parse(raw));
    return true;
  } catch {
    return false;
  }
}

export function inspectStorage(storage: SaveStorage): SaveInspection {
  // Read the keys independently. A denied backup read must not turn a valid
  // primary into an empty session, and a denied primary read must never be
  // interpreted as permission to overwrite it.
  let primary: StoredSaveEntry;
  let backup: StoredSaveEntry;
  try {
    primary = parseStored(storage.getItem(SAVE_KEY));
  } catch (error) {
    primary = unreadableEntry(error);
  }
  try {
    backup = parseStored(storage.getItem(SAVE_BACKUP_KEY));
  } catch (error) {
    backup = unreadableEntry(error);
  }
  const errors = [primary, backup]
    .map((entry, index) => entry.status === 'unknown' ? `${index === 0 ? 'Primary' : 'Backup'}: ${entry.error ?? 'read failed'}` : null)
    .filter((message): message is string => message !== null);
  return { primary, backup, readError: errors.length > 0 ? errors.join(' ') : null };
}

export function writeSave(storage: SaveStorage, save: SaveV1): SaveWriteResult {
  let raw: string;
  try {
    raw = serializeSave(save);
  } catch (error) {
    return { ok: false, raw: null, error: error instanceof Error ? error.message : 'Save could not be serialized.', backupError: null };
  }

  let previous: string | null = null;
  let backupError: string | null = null;
  try {
    previous = storage.getItem(SAVE_KEY);
  } catch (error) {
    return {
      ok: false,
      raw: null,
      error: error instanceof Error ? error.message : 'Existing save could not be read safely.',
      backupError: null,
    };
  }

  // Never replace a usable backup with malformed, oversized or future data
  // from a corrupted primary. This matters during backup recovery: the valid
  // backup is the user's last recoverable copy. An unreadable backup is also
  // left alone; inability to inspect it is not evidence that it is empty.
  let existingBackup: string | null = null;
  let backupReadable = true;
  try {
    existingBackup = storage.getItem(SAVE_BACKUP_KEY);
  } catch (error) {
    backupReadable = false;
    backupError = error instanceof Error ? error.message : 'Existing backup could not be read.';
  }
  if (backupReadable && previous !== null && isValidStoredRaw(previous) &&
      (existingBackup === null || isValidStoredRaw(existingBackup))) {
    try {
      storage.setItem(SAVE_BACKUP_KEY, previous);
    } catch (error) {
      backupError = error instanceof Error ? error.message : 'Save backup could not be written.';
    }
  }

  try {
    storage.setItem(SAVE_KEY, raw);
    return { ok: true, raw, error: null, backupError };
  } catch (error) {
    return {
      ok: false,
      raw: null,
      error: error instanceof Error ? error.message : 'Save could not be written.',
      backupError,
    };
  }
}
