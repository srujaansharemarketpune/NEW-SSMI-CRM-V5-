import { AppState } from '../types';

const VAULT_DB_NAME = 'SrujaanEveryPatchVault_v1';
const VAULT_DB_VERSION = 1;
const VAULT_STORE_NAME = 'restore_points';
const VAULT_LOCAL_FALLBACK_KEY = 'ssm_everypatch_restore_vault_v1';
const MAX_RESTORE_POINTS = 12;

export interface RestorePointSummary {
  id: string;
  createdAt: string;
  displayTime: string;
  reason: string;
  triggeredBy: 'auto' | 'manual' | 'simulator';
  patchModule?: string;
  studentsCount: number;
  leadsCount: number;
  batchesCount: number;
  checksum: string;
  storageEngine: 'IndexedDB' | 'LocalStorage';
}

export interface RestorePointEntry extends RestorePointSummary {
  state: AppState;
}

let vaultDbPromise: Promise<IDBDatabase | null> | null = null;

function openVaultDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }
  if (vaultDbPromise) return vaultDbPromise;

  vaultDbPromise = new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(VAULT_DB_NAME, VAULT_DB_VERSION);
      req.onupgradeneeded = (evt) => {
        const db = (evt.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(VAULT_STORE_NAME)) {
          db.createObjectStore(VAULT_STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = (evt) => {
        const db = (evt.target as IDBOpenDBRequest).result;
        db.onversionchange = () => {
          db.close();
          vaultDbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => {
        vaultDbPromise = null;
        resolve(null);
      };
    } catch {
      vaultDbPromise = null;
      resolve(null);
    }
  });
  return vaultDbPromise;
}

function computeSimpleChecksum(state: AppState): string {
  const payload = `${state.students?.length || 0}:${state.leads?.length || 0}:${state.batches?.length || 0}:${state.courses?.length || 0}:${state.lastSavedAt || ''}`;
  let hash = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `EP-${(hash >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
}

function cloneAppStateSafely(state: AppState): AppState {
  try {
    return JSON.parse(JSON.stringify(state));
  } catch {
    return {
      ...state,
      students: [...(state.students || [])],
      leads: [...(state.leads || [])],
      batches: [...(state.batches || [])],
      courses: [...(state.courses || [])]
    };
  }
}

let memoryVaultFallback: RestorePointEntry[] = [];

function readLocalVaultFallback(): RestorePointEntry[] {
  return [...memoryVaultFallback];
}

function compactStateForVaultFallback(state: AppState): AppState {
  const s = cloneAppStateSafely(state);
  if (Array.isArray(s.materials)) {
    s.materials = s.materials.map((m) =>
      m && typeof m.fileData === 'string' && m.fileData.length > 50_000 && m.fileData.startsWith('data:')
        ? { ...m, fileData: '' }
        : m
    );
  }
  if (s.settings) {
    const cleanSettings: any = { ...s.settings };
    ['logoBase64', 'primaryLogoBase64', 'certificateLogoBase64', 'signatureBase64'].forEach((k) => {
      if (typeof cleanSettings[k] === 'string' && cleanSettings[k].length > 50_000) {
        cleanSettings[k] = '';
      }
    });
    s.settings = cleanSettings;
  }
  return s;
}

function writeLocalVaultFallback(entries: RestorePointEntry[]): void {
  memoryVaultFallback = entries.slice(0, 2).map((e) => ({
    ...e,
    state: compactStateForVaultFallback(e.state)
  }));
}

export async function savePrePatchRestorePoint(
  state: AppState,
  reason: string,
  triggeredBy: 'auto' | 'manual' | 'simulator' = 'auto',
  patchModule?: string
): Promise<RestorePointEntry> {
  const now = new Date();
  const createdAt = now.toISOString();
  const displayTime = now.toLocaleString('en-IN', { hour12: false });
  const clonedState = cloneAppStateSafely(state);
  const id = `RP_${Date.now()}_${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  const db = await openVaultDb();
  const entry: RestorePointEntry = {
    id,
    createdAt,
    displayTime,
    reason,
    triggeredBy,
    patchModule,
    studentsCount: clonedState.students?.length || 0,
    leadsCount: clonedState.leads?.length || 0,
    batchesCount: clonedState.batches?.length || 0,
    checksum: computeSimpleChecksum(clonedState),
    storageEngine: db ? 'IndexedDB' : 'LocalStorage',
    state: clonedState
  };

  let savedToIdb = false;
  if (db) {
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction([VAULT_STORE_NAME], 'readwrite');
        const store = tx.objectStore(VAULT_STORE_NAME);
        store.put(entry);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      savedToIdb = true;

      // Prune older restore points beyond MAX_RESTORE_POINTS
      const all = await listRestorePoints();
      if (all.length > MAX_RESTORE_POINTS) {
        const toRemove = all.slice(MAX_RESTORE_POINTS);
        const tx = db.transaction([VAULT_STORE_NAME], 'readwrite');
        const store = tx.objectStore(VAULT_STORE_NAME);
        toRemove.forEach((item) => store.delete(item.id));
      }
    } catch {
      entry.storageEngine = 'LocalStorage';
    }
  }

  // Only mirror to localStorage fallback when IndexedDB is unavailable or failed
  if (!savedToIdb) {
    const existingLocal = readLocalVaultFallback().filter((e) => e.id !== entry.id);
    writeLocalVaultFallback([entry, ...existingLocal]);
  }

  return entry;
}

export async function listRestorePoints(): Promise<RestorePointSummary[]> {
  const db = await openVaultDb();
  const byId = new Map<string, RestorePointSummary>();

  if (db) {
    try {
      const idbEntries = await new Promise<RestorePointEntry[]>((resolve) => {
        const tx = db.transaction([VAULT_STORE_NAME], 'readonly');
        const store = tx.objectStore(VAULT_STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
        req.onerror = () => resolve([]);
      });
      for (const item of idbEntries) {
        if (!item?.id) continue;
        const { state: _ignored, ...summary } = item;
        byId.set(item.id, { ...summary, storageEngine: 'IndexedDB' });
      }
    } catch {
      // ignore
    }
  }

  for (const item of readLocalVaultFallback()) {
    if (!item?.id || byId.has(item.id)) continue;
    const { state: _ignored, ...summary } = item;
    byId.set(item.id, summary);
  }

  return Array.from(byId.values()).sort((a, b) =>
    String(b.createdAt).localeCompare(String(a.createdAt))
  );
}

export async function getRestorePointById(id: string): Promise<RestorePointEntry | null> {
  if (!id) return null;
  const db = await openVaultDb();
  if (db) {
    try {
      const fromIdb = await new Promise<RestorePointEntry | null>((resolve) => {
        const tx = db.transaction([VAULT_STORE_NAME], 'readonly');
        const store = tx.objectStore(VAULT_STORE_NAME);
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
      if (fromIdb?.state) return fromIdb;
    } catch {
      // fall through
    }
  }

  const localHit = readLocalVaultFallback().find((e) => e.id === id);
  return localHit?.state ? localHit : null;
}

export async function deleteRestorePoint(id: string): Promise<void> {
  const db = await openVaultDb();
  if (db) {
    try {
      await new Promise<void>((resolve) => {
        const tx = db.transaction([VAULT_STORE_NAME], 'readwrite');
        tx.objectStore(VAULT_STORE_NAME).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {
      // ignore
    }
  }
  const remaining = readLocalVaultFallback().filter((e) => e.id !== id);
  writeLocalVaultFallback(remaining);
}
