import { MAX_SAVE_BYTES, SAVE_BACKUP_KEY, SAVE_KEY, serializeSave, validateSave, type SaveV1 } from './save';

export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface StoredSaveEntry {
  raw: string | null;
  save: SaveV1 | null;
  error: string | null;
}

export interface SaveInspection {
  primary: StoredSaveEntry;
  backup: StoredSaveEntry;
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
  if (raw === null) return { raw: null, save: null, error: null };
  if (new TextEncoder().encode(raw).byteLength > MAX_SAVE_BYTES) {
    return { raw, save: null, error: 'Save exceeds the 1 MB limit.' };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return { raw, save: validateSave(parsed), error: null };
  } catch (error) {
    return { raw, save: null, error: error instanceof Error ? error.message : 'Save could not be read.' };
  }
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
  try {
    return {
      primary: parseStored(storage.getItem(SAVE_KEY)),
      backup: parseStored(storage.getItem(SAVE_BACKUP_KEY)),
      readError: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Browser storage could not be read.';
    return {
      primary: { raw: null, save: null, error: message },
      backup: { raw: null, save: null, error: message },
      readError: message,
    };
  }
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
    backupError = error instanceof Error ? error.message : 'Existing save could not be read for backup.';
  }
  // Never replace a usable backup with malformed, oversized or future data
  // from a corrupted primary. This matters during backup recovery: the valid
  // backup is the user's last recoverable copy.
  if (previous !== null && isValidStoredRaw(previous)) {
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
