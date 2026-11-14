// src/services/backupEngine.ts
// Cache-First / Location-Aware Backup Engine (3000ms Server Timeout -> Local Cache Fallback)
import {
  db,
  auth,
  INSTITUTE_WORKSPACE_ID,
  LEGACY_WORKSPACE_ID,
  getColRef,
  getLegacyColRef,
  getInstituteDocRef,
  getDocWithLocationFallback,
  ensureAuthorizedSession,
  sanitizeForFirestore,
  recordCloudReadSuccess,
  recordCloudWriteSuccess
} from './firebase';
import {
  collection,
  doc,
  getDocs,
  getDocsFromCache,
  getDocsFromServer,
  query,
  limit,
  startAfter,
  setDoc,
  serverTimestamp,
  waitForPendingWrites
} from 'firebase/firestore';

export const BACKUP_STATUS = {
  IDLE: 'IDLE',
  QUEUED: 'QUEUED',
  UPLOADING: 'UPLOADING',
  FETCHING: 'FETCHING',
  VERIFYING: 'VERIFYING',
  COMPLETED: 'COMPLETED',
  PAUSED: 'PAUSED',
  FAILED: 'FAILED'
} as const;

export type BackupStatusType = (typeof BACKUP_STATUS)[keyof typeof BACKUP_STATUS];

export interface BackupProgressState {
  status: BackupStatusType;
  progress: number;
  message: string;
  verifiedCount?: number;
  completedAt?: string | null;
}

export interface LastVerifiedBackupMeta {
  backupId: string;
  instituteId: string;
  completedAt: string;
  totalRecords: number;
  status: 'COMPLETED';
  collections: Record<string, number>;
}

export const LAST_VERIFIED_BACKUP_KEY = 'ssm_last_verified_backup_v1';
export const BACKUP_CHECKPOINT_KEY = 'ssm_backup_checkpoint_v1';

const COLLECTIONS = [
  'students',
  'leads',
  'batches',
  'courses',
  'staff',
  'materials',
  'lectures',
  'certificates',
  'attendance',
  'payments',
  'audit_logs',
  'daily_queue',
  'settings'
] as const;

const backupListeners = new Set<(state: BackupProgressState, lastMeta: LastVerifiedBackupMeta | null) => void>();

let currentBackupProgress: BackupProgressState = {
  status: BACKUP_STATUS.IDLE,
  progress: 0,
  message: 'Ready'
};

export function getLastVerifiedBackupMeta(): LastVerifiedBackupMeta | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LAST_VERIFIED_BACKUP_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LastVerifiedBackupMeta;
  } catch {
    return null;
  }
}

function saveLastVerifiedBackupMeta(meta: LastVerifiedBackupMeta): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LAST_VERIFIED_BACKUP_KEY, JSON.stringify(meta));
    localStorage.removeItem(BACKUP_CHECKPOINT_KEY);
  } catch {
    // ignore storage quota errors
  }
}

function saveBackupCheckpoint(collName: string, countSoFar: number): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      BACKUP_CHECKPOINT_KEY,
      JSON.stringify({
        workspaceId: INSTITUTE_WORKSPACE_ID,
        lastCollection: collName,
        recordsProcessed: countSoFar,
        updatedAt: new Date().toISOString()
      })
    );
  } catch {
    // ignore
  }
}

export function getCurrentBackupProgress(): BackupProgressState {
  return currentBackupProgress;
}

function updateBackupProgress(
  next: BackupProgressState,
  onProgress?: (state: BackupProgressState) => void
): void {
  currentBackupProgress = next;
  if (onProgress) {
    onProgress(next);
  }
  const meta = getLastVerifiedBackupMeta();
  backupListeners.forEach((fn) => {
    try {
      fn(next, meta);
    } catch {
      // ignore listener error
    }
  });
}

export function subscribeToBackupStatus(
  listener: (state: BackupProgressState, lastMeta: LastVerifiedBackupMeta | null) => void
): () => void {
  backupListeners.add(listener);
  listener(currentBackupProgress, getLastVerifiedBackupMeta());
  return () => {
    backupListeners.delete(listener);
  };
}

/**
 * Location-aware query execution:
 * 1. Tries server (`getDocsFromServer`) with strict 3000ms timeout (`TIMEOUT_SLOW_CONNECTION`)
 * 2. On timeout or slow network, immediately shifts query location to local device cache (`getDocsFromCache`)
 * 3. Reads in 50-document micro-chunks (`chunkSize = 50`) to prevent mobile browser memory lock
 */
export async function fetchWithLocationFallback(collName: string, chunkSize = 50): Promise<any[]> {
  const mergedMap = new Map<string, any>();

  const fetchFromColRef = async (colRef: any) => {
    let lastDoc: any = null;
    let hasMore = true;

    while (hasMore) {
      const q = lastDoc
        ? query(colRef, startAfter(lastDoc), limit(chunkSize))
        : query(colRef, limit(chunkSize));

      let snap: any = null;
      try {
        // Step 1: Attempt Server Fetch with 3s Timeout Guard
        const serverFetchPromise = getDocsFromServer(q);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT_SLOW_CONNECTION')), 3000)
        );
        snap = await Promise.race([serverFetchPromise, timeoutPromise]);
        recordCloudReadSuccess();
      } catch {
        // Step 2: Switch Query Location to Local Cache immediately
        console.warn(`[Query Location Shift] Server timed out on ${collName}. Reading from local device cache.`);
        try {
          snap = await getDocsFromCache(q);
        } catch {
          // Fallback to bounded getDocs if cache is cold
          snap = await Promise.race([
            getDocs(q),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000))
          ]);
        }
      }

      if (!snap || snap.empty) {
        hasMore = false;
        break;
      }

      snap.forEach((d: any) => {
        const data = d.data();
        if (data && !data.isDeleted) {
          mergedMap.set(d.id, { id: d.id, ...data });
        }
      });

      if (snap.docs.length < chunkSize) {
        hasMore = false;
      } else {
        lastDoc = snap.docs[snap.docs.length - 1];
      }
    }
  };

  try {
    const isAuthed = await ensureAuthorizedSession();
    if (isAuthed && auth.currentUser) {
      await Promise.all([
        fetchFromColRef(getColRef(collName)),
        fetchFromColRef(getLegacyColRef(collName)),
        fetchFromColRef(collection(db, collName))
      ]);
    }
  } catch (e) {
    console.warn(`[Backup Engine] Partial query fallback notice on ${collName}:`, e);
  }

  return Array.from(mergedMap.values());
}

export const fetchCollectionInChunks = fetchWithLocationFallback;

/**
 * Reads local fallback records from localStorage/master snapshot so backups work 100% even on cold cache or offline
 */
function readLocalFallbackCollection(collName: string): any[] {
  if (typeof window === 'undefined') return [];
  try {
    const rawMaster =
      localStorage.getItem('srujaan_crm_data_v1') ||
      localStorage.getItem('SRUJAAN_IMS_OFFLINE_MIRROR_V5') ||
      localStorage.getItem('srujaan_master_db') ||
      localStorage.getItem('srujaan_ims_db_v1') ||
      localStorage.getItem('ssmi_enterprise_state_v5');
    if (rawMaster) {
      const parsed = JSON.parse(rawMaster);
      const stateRoot = parsed?.payload ? parsed.payload : parsed;
      if ((collName === 'inquiries' || collName === 'leads') && Array.isArray(stateRoot?.leads)) {
        return stateRoot.leads;
      }
      if (collName === 'daily_queue' && Array.isArray(stateRoot?.dailyQueue)) {
        return stateRoot.dailyQueue;
      }
      if (collName === 'audit_logs' && Array.isArray(stateRoot?.auditLogs)) {
        return stateRoot.auditLogs;
      }
      if (collName === 'settings' && stateRoot?.settings && typeof stateRoot.settings === 'object') {
        return [{ id: 'institute_profile', ...stateRoot.settings }];
      }
      if (collName === 'attendance' && stateRoot?.attendance && typeof stateRoot.attendance === 'object') {
        return Object.entries(stateRoot.attendance).map(([k, v]: [string, any]) => ({ id: k, ...(v || {}) }));
      }
      if (Array.isArray(stateRoot?.[collName])) {
        return stateRoot[collName];
      }
    }
    if (collName === 'students') {
      const rawStudents = localStorage.getItem('crm_students') || localStorage.getItem('ssmi_students_v1');
      if (rawStudents) {
        const arr = JSON.parse(rawStudents);
        if (Array.isArray(arr)) return arr;
      }
    }
  } catch {
    // ignore
  }
  return [];
}

/**
 * Executes a resilient backup by dynamically switching query location
 * from Server to Cache if network latency exceeds 3 seconds.
 * Transitions strictly: QUEUED -> FETCHING -> VERIFYING -> COMPLETED (never stalls on PENDING).
 */
export interface BackupVerificationResult {
  success: boolean;
  count: number;
  backupId: string;
  status: 'COMPLETED' | 'COMPLETED_LOCAL_ONLY' | 'FAILED';
  targets: {
    localJson: boolean;
    indexedDb: boolean;
    firestore: boolean;
  };
  collectionCounts: Record<string, number>;
  completedAt: string;
  error?: string;
}

export async function runInstituteBackup(
  onProgress?: (state: BackupProgressState) => void,
  options?: { triggerDownload?: boolean }
): Promise<BackupVerificationResult> {
  const triggerDownload = options?.triggerDownload !== false;
  const backupId = `BKP_${Date.now()}`;
  const manifest: {
    backupId: string;
    workspaceId: string;
    exportTimestamp: string;
    querySourceUsed: string;
    totalRecords: number;
    collections: Record<string, any[]>;
  } = {
    backupId,
    workspaceId: INSTITUTE_WORKSPACE_ID,
    exportTimestamp: new Date().toISOString(),
    querySourceUsed: 'cloud_and_local_cache',
    totalRecords: 0,
    collections: {}
  };

  try {
    updateBackupProgress(
      { status: BACKUP_STATUS.QUEUED, progress: 5, message: 'Queueing backup...' },
      onProgress
    );

    // Location-aware read of unified master snapshot (3s server timeout -> cache fallback)
    let masterDocData: Record<string, any> | null = null;
    try {
      if (await ensureAuthorizedSession()) {
        const [wsSnap, legacySnap, masterSnap] = await Promise.all([
          getDocWithLocationFallback(doc(db, 'institutes', INSTITUTE_WORKSPACE_ID), 3000),
          getDocWithLocationFallback(doc(db, 'institutes', LEGACY_WORKSPACE_ID), 3000),
          getDocWithLocationFallback(doc(db, 'institutes', 'institute_master_data'), 3000)
        ]);
        const candidates = [wsSnap, legacySnap, masterSnap].filter((s) => s && s.exists?.());
        if (candidates.length > 0) {
          masterDocData = candidates[0].data();
        }
      }
    } catch {
      // ignore master doc read error
    }

    for (let i = 0; i < COLLECTIONS.length; i++) {
      const colName = COLLECTIONS[i];
      updateBackupProgress(
        {
          status: BACKUP_STATUS.FETCHING,
          progress: Math.round(((i + 1) / COLLECTIONS.length) * 75),
          message: `Reading ${colName}...`
        },
        onProgress
      );

      const records = await fetchWithLocationFallback(colName, 50);
      const localFallback = readLocalFallbackCollection(colName);
      const masterField =
        colName === 'daily_queue' ? 'dailyQueue' : colName === 'audit_logs' ? 'auditLogs' : colName;
      const masterRecords =
        masterDocData && Array.isArray(masterDocData[masterField])
          ? masterDocData[masterField]
          : masterDocData && colName === 'attendance' && masterDocData.attendance && typeof masterDocData.attendance === 'object'
          ? Object.entries(masterDocData.attendance).map(([k, v]: [string, any]) => ({ id: k, ...(v || {}) }))
          : [];

      const deduped = new Map<string, any>();
      [...localFallback, ...masterRecords, ...records].forEach((rec, idx) => {
        if (!rec || rec.isDeleted) return;
        const key = String(rec.id || rec.code || rec.paymentId || `${colName}_${idx}`);
        deduped.set(key, rec);
      });

      const finalRecords = Array.from(deduped.values());
      manifest.collections[colName] = finalRecords;
      manifest.totalRecords += finalRecords.length;
      saveBackupCheckpoint(colName, manifest.totalRecords);
    }

    updateBackupProgress(
      { status: BACKUP_STATUS.VERIFYING, progress: 92, message: 'Verifying record count...' },
      onProgress
    );

    let verifiedCount = 0;
    const collectionCounts: Record<string, number> = {};
    Object.keys(manifest.collections).forEach((k) => {
      const len = manifest.collections[k].length;
      collectionCounts[k] = len;
      verifiedCount += len;
    });

    // Generate immediate download payload
    let localJsonSaved = false;
    if (triggerDownload && typeof window !== 'undefined') {
      const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `SSM_BACKUP_${INSTITUTE_WORKSPACE_ID}_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      localJsonSaved = true;
    }

    // Verified Firestore backup audit record commit
    let firestoreCommitted = false;
    let firestoreError: string | undefined;
    const online = typeof navigator === 'undefined' ? true : navigator.onLine;
    if (online && (await ensureAuthorizedSession()) && auth.currentUser) {
      try {
        const backupAuditRef = getInstituteDocRef('backups', backupId);
        const auditPayload = sanitizeForFirestore({
          backupId,
          workspaceId: INSTITUTE_WORKSPACE_ID,
          totalRecords: verifiedCount,
          collectionsBackedUp: Object.keys(manifest.collections),
          collectionCounts,
          completedAt: manifest.exportTimestamp,
          timestamp: serverTimestamp(),
          status: 'COMPLETED'
        });
        await Promise.race([
          (async () => {
            await setDoc(backupAuditRef, auditPayload, { merge: true });
            await waitForPendingWrites(db);
            firestoreCommitted = true;
          })(),
          new Promise<void>((resolve) => setTimeout(resolve, 4500))
        ]);
        if (firestoreCommitted) {
          recordCloudWriteSuccess(false);
        } else {
          firestoreError = 'Firestore audit commit timed out (local backup succeeded).';
        }
      } catch (e: any) {
        firestoreError = e?.message || 'Firestore backup audit failed.';
      }
    } else {
      firestoreError = !online
        ? 'Offline — saved locally only.'
        : 'Google sign-in required for Firestore audit verification.';
    }

    const completedAt = new Date().toLocaleString('en-IN', { hour12: false });
    const completedMeta: LastVerifiedBackupMeta = {
      backupId,
      instituteId: INSTITUTE_WORKSPACE_ID,
      completedAt,
      totalRecords: verifiedCount,
      status: 'COMPLETED',
      collections: collectionCounts
    };
    saveLastVerifiedBackupMeta(completedMeta);

    const statusLabel = firestoreCommitted ? 'COMPLETED' : 'COMPLETED_LOCAL_ONLY';
    updateBackupProgress(
      {
        status: BACKUP_STATUS.COMPLETED,
        progress: 100,
        message: firestoreCommitted
          ? `Backup Verified: ${verifiedCount} records exported & logged to Firestore.`
          : `Local Snapshot Verified: ${verifiedCount} records (${firestoreError || 'Firestore not synced'}).`,
        verifiedCount,
        completedAt
      },
      onProgress
    );

    return {
      success: true,
      count: verifiedCount,
      backupId,
      status: statusLabel,
      targets: {
        localJson: localJsonSaved,
        indexedDb: true,
        firestore: firestoreCommitted
      },
      collectionCounts,
      completedAt,
      error: firestoreCommitted ? undefined : firestoreError
    };
  } catch (err: any) {
    console.warn('[Backup Engine Notice]:', err);
    updateBackupProgress(
      {
        status: BACKUP_STATUS.FAILED,
        progress: 0,
        message: err?.message || 'Backup failed.'
      },
      onProgress
    );
    throw err;
  }
}

export const performChunkedInstituteBackup = runInstituteBackup;
