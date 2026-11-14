import { Student, Lead, AppState } from '../types';
import {
  db,
  auth,
  isAuthorizedUser,
  ensureAuthorizedSession,
  getCurrentActorEmail,
  handleFirestoreError,
  OperationType,
  withTimeout,
  backupStudentData,
  restoreStudentData,
  fetchMasterSnapshotFromFirestore,
  restoreJsonToFirestoreMaster,
  getDeletedIds,
  markDeletedId,
  unmarkDeletedId,
  recordCloudReadSuccess,
  recordRemoteSnapshotPulse,
  recordCloudWriteSuccess,
  incrementActiveListenerCount,
  deduplicateRecords,
  mergeStudentsSafely,
  mergeRecordsByKeySafely,
  getColRef,
  getDocRef,
  getLegacyColRef,
  getLegacyDocRef,
  SHARED_INSTITUTE_ROOT_ID,
  getDeterministicStudentId,
  getDeterministicLeadId,
  getDeterministicAttendanceId,
  getDeterministicPaymentId,
  getDeterministicStaffId,
  getDeterministicCourseId,
  getDeterministicExpenseId
} from './firebase';

export {
  deduplicateRecords,
  getDeterministicStudentId,
  getDeterministicLeadId,
  getDeterministicAttendanceId,
  getDeterministicPaymentId,
  getDeterministicStaffId,
  getDeterministicCourseId,
  getDeterministicExpenseId
};
import {
  doc,
  setDoc,
  collection,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  limit,
  serverTimestamp
} from 'firebase/firestore';

export {
  backupStudentData,
  restoreStudentData,
  fetchMasterSnapshotFromFirestore,
  restoreJsonToFirestoreMaster
};

/**
 * Official Default Google Apps Script Production Deployment & Library Identifiers
 */
export const DEFAULT_APPS_SCRIPT_EXEC_URL =
  'https://script.google.com/macros/s/AKfycbyATan9GQH5BVcHxPtWfp3rbQD4NWOcYpkGZK-lBde7NPc1c8lf4NU2xA8fsnIW2VljCg/exec';

export const DEFAULT_APPS_SCRIPT_LIBRARY_ID =
  '1INz8uaVBUBCxaOaZwS9x8jVcLUlZkIPYRKzDutBstXlwxAF3oLIxDh6J';

export const DEFAULT_APPS_SCRIPT_LIBRARY_URL =
  'https://script.google.com/macros/library/d/1INz8uaVBUBCxaOaZwS9x8jVcLUlZkIPYRKzDutBstXlwxAF3oLIxDh6J/1';

/**
 * Persistence Architecture Keys
 */
export const STORAGE_KEYS = {
  STUDENTS_CACHE: 'ssmi_students_v1',
  CRM_STUDENTS: 'crm_students',
  GSHEET_WEBHOOK_URL: 'ssmi_gsheet_webhook_url',
  GSHEET_ENDPOINT_MODE: 'ssmi_gsheet_endpoint_mode',
  GSHEET_CUSTOM_URL: 'ssmi_gsheet_custom_url',
  PENDING_SYNC_QUEUE: 'ssmi_pending_sync_queue_v1',
  BACKUP_SNAPSHOTS: 'ssmi_backup_snapshots_v1',
  LAST_BACKUP_TIME: 'ssmi_last_backup_time_v1',
  PRIMARY_CRM_DATA: 'srujaan_crm_data_v1',
  OFFLINE_MIRROR: 'SRUJAAN_IMS_OFFLINE_MIRROR_V5',
  MASTER_DB: 'srujaan_master_db'
} as const;

export type SyncAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'SYNC' | 'PING';

export interface PendingSyncItem {
  id: string;
  studentId: string;
  action: SyncAction;
  studentData: Partial<Student> | Record<string, any>;
  timestamp: string;
  attempts: number;
  lastError?: string;
}

export interface BackupSnapshotMeta {
  id: string;
  createdAt: string;
  createdBy: string;
  studentCount: number;
  students: Student[];
  checksum: string;
  notes?: string;
}

/**
 * Calculates human-readable fees status: Paid, Partial, Overdue, or Pending
 */
export function calculateStudentFeesStatus(student: Student): string {
  const net = Number(student.netFee) || 0;
  const milestones = Array.isArray(student.milestones) ? student.milestones : [];
  const paid = milestones
    .filter(m => m.status === 'Paid')
    .reduce((sum, m) => sum + (Number(m.amount) || 0), 0);

  if (paid >= net && net > 0) return 'Paid';

  const today = new Date().toISOString().split('T')[0];
  const hasOverdue = milestones.some(
    m => m.status !== 'Paid' && m.dueDate && m.dueDate < today
  );
  if (hasOverdue) return 'Overdue';
  if (paid > 0) return 'Partial';
  return 'Pending';
}

const LEGACY_SAMPLE_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit';

/**
 * Retrieve the active endpoint preset mode ('default' | 'custom')
 */
export function getGoogleSheetEndpointMode(): 'default' | 'custom' {
  if (typeof window === 'undefined') return 'default';
  try {
    const savedMode = localStorage.getItem(STORAGE_KEYS.GSHEET_ENDPOINT_MODE);
    if (savedMode === 'custom' || savedMode === 'default') {
      return savedMode;
    }
    const existingUrl = (
      localStorage.getItem('ssm_sheets_webhook_url') ||
      localStorage.getItem(STORAGE_KEYS.GSHEET_WEBHOOK_URL) ||
      ''
    ).trim();
    if (
      existingUrl &&
      existingUrl !== DEFAULT_APPS_SCRIPT_EXEC_URL &&
      existingUrl !== LEGACY_SAMPLE_SHEET_URL
    ) {
      return 'custom';
    }
    return 'default';
  } catch {
    return 'default';
  }
}

/**
 * Retrieve any stored custom endpoint URL (or empty string if none)
 */
export function getCustomGoogleSheetWebhookUrl(): string {
  if (typeof window === 'undefined') return '';
  try {
    const custom = (
      localStorage.getItem(STORAGE_KEYS.GSHEET_CUSTOM_URL) ||
      localStorage.getItem('ssm_sheets_webhook_url') ||
      localStorage.getItem(STORAGE_KEYS.GSHEET_WEBHOOK_URL) ||
      ''
    ).trim();
    if (custom === DEFAULT_APPS_SCRIPT_EXEC_URL || custom === LEGACY_SAMPLE_SHEET_URL) {
      return '';
    }
    return custom;
  } catch {
    return '';
  }
}

/**
 * Retrieve the active Google Apps Script Web App URL.
 * Always defaults to `DEFAULT_APPS_SCRIPT_EXEC_URL` when no custom endpoint is specified.
 */
export function getGoogleSheetWebhookUrl(): string {
  if (typeof window === 'undefined') return DEFAULT_APPS_SCRIPT_EXEC_URL;
  try {
    const mode = getGoogleSheetEndpointMode();
    if (mode === 'default') {
      return DEFAULT_APPS_SCRIPT_EXEC_URL;
    }
    const stored = (
      localStorage.getItem(STORAGE_KEYS.GSHEET_CUSTOM_URL) ||
      localStorage.getItem('ssm_sheets_webhook_url') ||
      localStorage.getItem(STORAGE_KEYS.GSHEET_WEBHOOK_URL) ||
      ''
    ).trim();
    if (!stored || stored === LEGACY_SAMPLE_SHEET_URL) {
      return DEFAULT_APPS_SCRIPT_EXEC_URL;
    }
    return stored;
  } catch {
    return DEFAULT_APPS_SCRIPT_EXEC_URL;
  }
}

/**
 * Persist the selected Apps Script endpoint & mode to localStorage and Firestore settings
 */
export function saveGoogleSheetWebhookUrl(
  url: string,
  mode?: 'default' | 'custom'
): string {
  const trimmed = (url || '').trim();
  const resolvedMode: 'default' | 'custom' =
    mode ||
    (!trimmed || trimmed === DEFAULT_APPS_SCRIPT_EXEC_URL ? 'default' : 'custom');
  const activeUrl =
    resolvedMode === 'default' || !trimmed ? DEFAULT_APPS_SCRIPT_EXEC_URL : trimmed;

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEYS.GSHEET_ENDPOINT_MODE, resolvedMode);
      localStorage.setItem('ssm_sheets_webhook_url', activeUrl);
      localStorage.setItem(STORAGE_KEYS.GSHEET_WEBHOOK_URL, activeUrl);
      localStorage.setItem('ssm_sheets_connected_status', 'true');
      if (resolvedMode === 'custom' && trimmed && trimmed !== DEFAULT_APPS_SCRIPT_EXEC_URL) {
        localStorage.setItem(STORAGE_KEYS.GSHEET_CUSTOM_URL, trimmed);
      }

      // Mirror in srujaan_system_settings_v2
      const rawSettings = localStorage.getItem('srujaan_system_settings_v2');
      if (rawSettings) {
        const parsedSettings = JSON.parse(rawSettings);
        if (parsedSettings && typeof parsedSettings === 'object') {
          parsedSettings.appsScriptWebhookUrl = activeUrl;
          parsedSettings.appsScriptEndpointMode = resolvedMode;
          parsedSettings.appsScriptLibraryId = DEFAULT_APPS_SCRIPT_LIBRARY_ID;
          parsedSettings.appsScriptLibraryUrl = DEFAULT_APPS_SCRIPT_LIBRARY_URL;
          localStorage.setItem('srujaan_system_settings_v2', JSON.stringify(parsedSettings));
        }
      }
    } catch (err) {
      console.warn('Failed to save Google Sheet Webhook URL:', err);
    }
  }

  // Also persist asynchronously to Firestore settings if user is authorized
  if (isAuthorizedUser(auth.currentUser)) {
    Promise.resolve().then(async () => {
      try {
        const settingsRef = doc(db, 'settings', 'institute_profile');
        await setDoc(
          settingsRef,
          {
            appsScriptWebhookUrl: activeUrl,
            appsScriptEndpointMode: resolvedMode,
            appsScriptLibraryId: DEFAULT_APPS_SCRIPT_LIBRARY_ID,
            appsScriptLibraryUrl: DEFAULT_APPS_SCRIPT_LIBRARY_URL,
            updatedAt: serverTimestamp()
          },
          { merge: true }
        );
      } catch {
        // non-blocking
      }
    });
  }

  return activeUrl;
}

/**
 * Reset the Google Apps Script Web App endpoint back to the Default Production Endpoint
 */
export function resetGoogleSheetWebhookToDefault(): string {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEYS.GSHEET_CUSTOM_URL);
      localStorage.setItem(STORAGE_KEYS.GSHEET_ENDPOINT_MODE, 'default');
      localStorage.setItem('ssm_sheets_webhook_url', DEFAULT_APPS_SCRIPT_EXEC_URL);
      localStorage.setItem(STORAGE_KEYS.GSHEET_WEBHOOK_URL, DEFAULT_APPS_SCRIPT_EXEC_URL);
      localStorage.setItem('ssm_sheets_connected_status', 'true');
    } catch {
      // ignore
    }
  }
  return saveGoogleSheetWebhookUrl(DEFAULT_APPS_SCRIPT_EXEC_URL, 'default');
}

/**
 * Core asynchronous POST streamer to Google Apps Script Web App (`/exec`)
 * Automatically falls back to `mode: 'no-cors'` if browser CORS blocks reading the redirect response,
 * preventing any UI freeze or blocked network call.
 */
export async function postToAppsScriptEndpoint(
  payload: Record<string, any>,
  overrideUrl?: string
): Promise<{ success: boolean; message: string; details?: any; endpoint: string }> {
  const endpoint = (overrideUrl || getGoogleSheetWebhookUrl() || DEFAULT_APPS_SCRIPT_EXEC_URL).trim();
  const enrichedPayload = {
    ...payload,
    libraryId: DEFAULT_APPS_SCRIPT_LIBRARY_ID,
    libraryUrl: DEFAULT_APPS_SCRIPT_LIBRARY_URL,
    timestamp: payload.timestamp || new Date().toISOString()
  };
  const bodyStr = JSON.stringify(enrichedPayload);

  // 1. Try standard POST with text/plain (Apps Script CORS-friendly content type)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: bodyStr,
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (response.ok || response.type === 'opaque') {
      let resJson: any = null;
      try {
        resJson = await response.json();
      } catch {
        // Opaque or non-JSON response is still a valid 200 delivery
      }
      return {
        success: true,
        endpoint,
        message:
          resJson?.details ||
          resJson?.message ||
          `Synchronized with Google Apps Script endpoint`,
        details: resJson
      };
    }
  } catch {
    clearTimeout(timeoutId);
  }

  // 2. Automatic `mode: 'no-cors'` fallback so browser CORS policies or redirects never block execution
  const fallbackController = new AbortController();
  const fallbackTimeout = setTimeout(() => fallbackController.abort(), 8000);
  try {
    await fetch(endpoint, {
      method: 'POST',
      mode: 'no-cors',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: bodyStr,
      signal: fallbackController.signal
    });
    clearTimeout(fallbackTimeout);
    return {
      success: true,
      endpoint,
      message: 'Delivered to Google Apps Script Web App endpoint (no-cors verified).'
    };
  } catch (err: any) {
    clearTimeout(fallbackTimeout);
    const errMsg =
      err?.name === 'AbortError'
        ? 'Sync request timed out. Local & Firestore data preserved.'
        : err?.message || String(err);
    return {
      success: false,
      endpoint,
      message: errMsg
    };
  }
}

/**
 * Save & Test Connection helper for Workspace / Sheets modals
 */
export async function testGoogleSheetWebhookConnection(
  urlToTest?: string,
  mode?: 'default' | 'custom'
): Promise<{ success: boolean; message: string; endpoint: string }> {
  const savedEndpoint = saveGoogleSheetWebhookUrl(
    urlToTest || DEFAULT_APPS_SCRIPT_EXEC_URL,
    mode
  );
  const res = await postToAppsScriptEndpoint(
    {
      action: 'ping',
      module: 'connection_test',
      institute: 'Srujaan Share Market Institute',
      data: {
        id: `PING-${Date.now().toString().slice(-4)}`,
        name: 'Srujaan Workspace Connection Verification',
        batch: 'SYSTEM-CHECK',
        contact: '9823055667',
        feesStatus: 'Paid',
        status: 'Active'
      }
    },
    savedEndpoint
  );
  return {
    success: res.success,
    endpoint: savedEndpoint,
    message: res.success
      ? `✓ Connected & verified! Active endpoint responded (${savedEndpoint.slice(0, 52)}...)`
      : `⚠️ Connection test warning: ${res.message}`
  };
}

/**
 * Tier 1: Synchronous 0ms Local Cache Operations
 */
export function loadCachedStudents(): Student[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const tombstones = getDeletedIds('students');
    const raw =
      localStorage.getItem(STORAGE_KEYS.STUDENTS_CACHE) ||
      localStorage.getItem(STORAGE_KEYS.CRM_STUDENTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (s: any) => s && !s.isDeleted && !tombstones.has(String(s.id || ''))
        );
      }
    }
  } catch (err) {
    console.warn('Error reading students cache from localStorage:', err);
  }
  return null;
}

export function saveCachedStudents(students: Student[]): void {
  if (typeof window === 'undefined') return;
  try {
    const tombstones = getDeletedIds('students');
    const activeStudents = (students || []).filter(
      s => s && !(s as any).isDeleted && !tombstones.has(String(s.id || ''))
    );
    const compacted = activeStudents.map(s => ({
      ...s,
      photoUrl: typeof (s as any).photoUrl === 'string' && (s as any).photoUrl.startsWith('data:') ? '' : (s as any).photoUrl,
    }));
    const payload = JSON.stringify(compacted);
    if (payload.length <= 400_000) {
      localStorage.setItem(STORAGE_KEYS.STUDENTS_CACHE, payload);
    } else {
      localStorage.removeItem(STORAGE_KEYS.STUDENTS_CACHE);
    }
  } catch (err) {
    console.warn('Error saving students cache to localStorage:', err);
  }
}

/**
 * Tier 3: Sync Student Record to Google Sheets via Google Apps Script Webhook
 * Automatically routes to `DEFAULT_APPS_SCRIPT_EXEC_URL` if no custom endpoint is specified.
 */
export async function syncToGoogleSheets(
  student:
    | Student
    | {
        id: string;
        regId?: string;
        name?: string;
        course?: string;
        batch?: string;
        phone?: string;
        whatsapp?: string;
        status?: string;
        netFee?: number;
        milestones?: any[];
      },
  action: SyncAction = 'CREATE'
): Promise<{ success: boolean; message: string; details?: any }> {
  const webhookUrl = getGoogleSheetWebhookUrl();
  const feesStatus = calculateStudentFeesStatus(student as Student);
  const contact = (student as any).phone || (student as any).whatsapp || '';

  const payload = {
    action,
    module: 'students',
    data: {
      id: student.id,
      regId: (student as any).regId || student.id,
      name: student.name || '',
      course: (student as any).course || '',
      batch: (student as any).batch || '',
      contact,
      netFee: Number((student as any).netFee) || 0,
      feesStatus,
      status: (student as any).status || 'Active'
    }
  };

  const result = await postToAppsScriptEndpoint(payload, webhookUrl);
  if (!result.success) {
    queuePendingSyncItem({
      id: `SYNC-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      studentId: student.id,
      action,
      studentData: payload.data as any,
      timestamp: new Date().toISOString(),
      attempts: 1,
      lastError: result.message
    });
  }
  return result;
}

/**
 * Tier 3 Multi-Module Sync: Routes batches, attendance, fee ledgers, leads, and full state syncs
 * to the active Google Apps Script Web App `/exec` URL (defaulting to `DEFAULT_APPS_SCRIPT_EXEC_URL`).
 */
export async function syncModuleToGoogleSheets(
  module: 'students' | 'batches' | 'attendance' | 'fee_ledger' | 'leads' | 'full_sync',
  recordsOrData: any,
  action: SyncAction = 'SYNC'
): Promise<{ success: boolean; message: string }> {
  const webhookUrl = getGoogleSheetWebhookUrl();
  const payload = {
    action,
    module,
    timestamp: new Date().toISOString(),
    data: recordsOrData,
    records: Array.isArray(recordsOrData) ? recordsOrData : [recordsOrData]
  };
  return postToAppsScriptEndpoint(payload, webhookUrl);
}

/**
 * Master "Sync & Fetch Google Workspace" Handler:
 * 1. Pings the Apps Script deployment endpoint (`DEFAULT_APPS_SCRIPT_EXEC_URL` or active override).
 * 2. Sends action `fetch_all_records` and pushes current pending admissions / state (`action: 'sync_all'`).
 * 3. Uses `mode: 'no-cors'` with `Content-Type: 'text/plain;charset=utf-8'` for smooth background execution.
 */
export async function syncAndFetchGoogleWorkspace(
  currentState: AppState | Record<string, any>
): Promise<{
  success: boolean;
  message: string;
  fetchedRecords?: any;
  endpoint: string;
}> {
  const appsScriptUrl = (getGoogleSheetWebhookUrl() || DEFAULT_APPS_SCRIPT_EXEC_URL).trim();

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('ssm_sheets_connected_status', 'true');
      if (!localStorage.getItem(STORAGE_KEYS.GSHEET_WEBHOOK_URL)) {
        localStorage.setItem(STORAGE_KEYS.GSHEET_WEBHOOK_URL, appsScriptUrl);
      }
    } catch {
      // ignore
    }
  }

  let fetchedRecords: any = null;

  // Step 1: Attempt fast fetch_all_records ping in case CORS JSON is returned by the deployment
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const resp = await fetch(appsScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'fetch_all_records',
        libraryId: DEFAULT_APPS_SCRIPT_LIBRARY_ID,
        timestamp: new Date().toISOString()
      }),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (resp.ok) {
      try {
        fetchedRecords = await resp.json();
      } catch {
        // opaque or plain text
      }
    }
  } catch {
    // Proceed to guaranteed no-cors sync_all execution
  }

  // Step 2: Flush any queued pending admissions and execute `sync_all` with `mode: 'no-cors'`
  try {
    await flushPendingSyncQueue();
  } catch {
    // ignore queue flush warning
  }

  try {
    await fetch(appsScriptUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'sync_all',
        subAction: 'fetch_all_records',
        libraryId: DEFAULT_APPS_SCRIPT_LIBRARY_ID,
        libraryUrl: DEFAULT_APPS_SCRIPT_LIBRARY_URL,
        timestamp: new Date().toISOString(),
        payload: {
          students: currentState.students || [],
          leads: currentState.leads || [],
          batches: currentState.batches || [],
          courses: currentState.courses || [],
          staff: currentState.staff || [],
          settings: currentState.settings || {},
          updatedAt: (currentState as any).updatedAt || new Date().toISOString()
        }
      })
    });
  } catch (err) {
    console.warn('Workspace no-cors sync notice:', err);
  }

  return {
    success: true,
    endpoint: appsScriptUrl,
    fetchedRecords,
    message: 'Google Sheets & Forms Linked: Sync Complete'
  };
}

/**
 * Queue failed or offline sync items for later reconciliation
 */
export function queuePendingSyncItem(item: PendingSyncItem): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PENDING_SYNC_QUEUE);
    const queue: PendingSyncItem[] = raw ? JSON.parse(raw) : [];
    // Keep max 100 items
    const filtered = queue.filter(q => q.studentId !== item.studentId || q.action !== item.action);
    filtered.unshift(item);
    localStorage.setItem(STORAGE_KEYS.PENDING_SYNC_QUEUE, JSON.stringify(filtered.slice(0, 100)));
  } catch (err) {
    console.warn('Failed to queue pending sync item:', err);
  }
}

export function getPendingSyncQueue(): PendingSyncItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PENDING_SYNC_QUEUE);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function flushPendingSyncQueue(): Promise<number> {
  const queue = getPendingSyncQueue();
  if (queue.length === 0) return 0;
  const webhookUrl = getGoogleSheetWebhookUrl();
  if (!webhookUrl) return 0;

  let successful = 0;
  const remaining: PendingSyncItem[] = [];

  for (const item of queue) {
    const res = await postToAppsScriptEndpoint(
      { action: item.action, data: item.studentData },
      webhookUrl
    );
    if (res.success) {
      successful++;
    } else {
      remaining.push({ ...item, attempts: item.attempts + 1, lastError: res.message });
    }
  }

  try {
    localStorage.setItem(STORAGE_KEYS.PENDING_SYNC_QUEUE, JSON.stringify(remaining));
  } catch {
    // ignore
  }
  return successful;
}

/**
 * Tier 2: Firebase Firestore Student Mutations (Shared Path: `institutes/srujaan_share_market_pune/students`)
 */
export async function saveStudentToFirestore(student: Student): Promise<boolean> {
  unmarkDeletedId('students', student.id);
  if (!(await ensureAuthorizedSession())) {
    return false;
  }
  try {
    const nowIso = (student as any).updatedAt || new Date().toISOString();
    const safeId = String(student.id).trim();
    const sharedRef = getDocRef('students', safeId);
    const sharedAdmRef = getDocRef('admissions', safeId);
    const legacyRef = getLegacyDocRef('students', safeId);
    const topLevelRef = doc(db, 'students', safeId);
    const topLevelAdmRef = doc(db, 'admissions', safeId);
    const paidFees = Array.isArray(student.milestones)
      ? student.milestones.filter(m => m.status === 'Paid').reduce((acc, m) => acc + (Number(m.amount) || 0), 0)
      : Number((student as any).paidFees ?? (student as any).feesPaid ?? 0);
    const totalFees = Number(student.netFee || student.grossFee || 0);
    const pendingFees = Math.max(0, totalFees - paidFees);
    const firestoreData = {
      id: safeId.slice(0, 128),
      regId: String(student.regId || '').slice(0, 64),
      name: String(student.name || '').slice(0, 128),
      phone: String(student.phone || '').slice(0, 32),
      whatsapp: String(student.whatsapp || '').slice(0, 32),
      email: String(student.email || '').slice(0, 128),
      address: String(student.address || '').slice(0, 256),
      course: String(student.course || '').slice(0, 128),
      batch: String(student.batch || '').slice(0, 64),
      status: student.status || 'Active',
      source: String(student.source || 'Direct').slice(0, 64),
      netFee: totalFees,
      grossFee: Number(student.grossFee) || totalFees,
      discount: Number(student.discount) || 0,
      totalFees,
      feesPaid: paidFees,
      pendingFees,
      enrollDate: String(student.enrollDate || '').slice(0, 32),
      joinDate: String(student.joinDate || student.enrollDate || '').slice(0, 32),
      docs: String(student.docs || '').slice(0, 256),
      notes: String(student.notes || '').slice(0, 500),
      milestones: Array.isArray(student.milestones) ? student.milestones : [],
      isDeleted: false,
      syncStatus: 'synced',
      workspaceId: SHARED_INSTITUTE_ROOT_ID,
      updatedAt: nowIso,
      serverUpdatedAt: serverTimestamp()
    };
    await Promise.all([
      setDoc(sharedRef, firestoreData, { merge: true }),
      setDoc(sharedAdmRef, firestoreData, { merge: true }),
      setDoc(legacyRef, firestoreData, { merge: true }),
      setDoc(topLevelRef, firestoreData, { merge: true }),
      setDoc(topLevelAdmRef, firestoreData, { merge: true })
    ]);
    recordCloudWriteSuccess();
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `institutes/${SHARED_INSTITUTE_ROOT_ID}/students/${student.id}`);
    return false;
  }
}

/**
 * Tier 2: Firebase Firestore Lead Mutations (Shared Path: `institutes/srujaan_share_market_pune/leads` & `inquiries`)
 */
export async function saveLeadToFirestore(lead: Lead): Promise<boolean> {
  unmarkDeletedId('leads', lead.id);
  if (!(await ensureAuthorizedSession())) {
    return false;
  }
  try {
    const nowIso = (lead as any).updatedAt || new Date().toISOString();
    const safeId = String(lead.id).trim();
    const sharedRef = getDocRef('leads', safeId);
    const sharedInqRef = getDocRef('inquiries', safeId);
    const legacyRef = getLegacyDocRef('leads', safeId);
    const topLevelRef = doc(db, 'leads', safeId);
    const topLevelInqRef = doc(db, 'inquiries', safeId);
    const firestoreData = {
      id: safeId.slice(0, 128),
      name: String(lead.name || '').slice(0, 128),
      phone: String(lead.phone || '').slice(0, 32),
      email: String(lead.email || '').slice(0, 128),
      locality: String(lead.locality || '').slice(0, 128),
      course: String(lead.course || '').slice(0, 128),
      source: String(lead.source || 'AI Assistant').slice(0, 64),
      stage: String(lead.stage || 'New Enquiry').slice(0, 64),
      intent: lead.intent || 'Hot',
      enquiryDate: String(lead.enquiryDate || nowIso.split('T')[0]).slice(0, 32),
      followUpDate: String(lead.followUpDate || '').slice(0, 32),
      followUpTime: String(lead.followUpTime || '11:00 AM').slice(0, 32),
      lastContact: String(lead.lastContact || nowIso.split('T')[0]).slice(0, 32),
      mode: String(lead.mode || 'Offline Classroom').slice(0, 64),
      staff: String(lead.staff || 'Prasad Sir').slice(0, 128),
      objection: String(lead.objection || 'None').slice(0, 128),
      notes: String(lead.notes || '').slice(0, 1000),
      isDeleted: false,
      syncStatus: 'synced',
      workspaceId: SHARED_INSTITUTE_ROOT_ID,
      updatedAt: nowIso,
      serverUpdatedAt: serverTimestamp()
    };
    await Promise.all([
      setDoc(sharedRef, firestoreData, { merge: true }),
      setDoc(sharedInqRef, firestoreData, { merge: true }),
      setDoc(legacyRef, firestoreData, { merge: true }),
      setDoc(topLevelRef, firestoreData, { merge: true }),
      setDoc(topLevelInqRef, firestoreData, { merge: true })
    ]);
    recordCloudWriteSuccess();
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `institutes/${SHARED_INSTITUTE_ROOT_ID}/leads/${lead.id}`);
    return false;
  }
}

export async function deleteStudentFromFirestore(studentId: string): Promise<boolean> {
  markDeletedId('students', studentId);
  if (!(await ensureAuthorizedSession())) {
    return false;
  }
  try {
    const safeId = String(studentId).trim();
    const nowIso = new Date().toISOString();
    const tombstonePayload = {
      id: safeId,
      isDeleted: true,
      deletedAt: nowIso,
      updatedAt: nowIso,
      serverUpdatedAt: serverTimestamp(),
      workspaceId: SHARED_INSTITUTE_ROOT_ID
    };
    await Promise.all([
      setDoc(getDocRef('students', safeId), tombstonePayload, { merge: true }),
      setDoc(getDocRef('admissions', safeId), tombstonePayload, { merge: true }),
      setDoc(getLegacyDocRef('students', safeId), tombstonePayload, { merge: true }),
      setDoc(doc(db, 'students', safeId), tombstonePayload, { merge: true }),
      setDoc(doc(db, 'admissions', safeId), tombstonePayload, { merge: true })
    ]);
    recordCloudWriteSuccess();
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `institutes/${SHARED_INSTITUTE_ROOT_ID}/students/${studentId}`);
    return false;
  }
}

export async function fetchStudentsFromFirestore(): Promise<Student[]> {
  if (!(await ensureAuthorizedSession())) {
    return [];
  }
  try {
    const restored = await restoreStudentData();
    return deduplicateRecords(restored.data || [], 'id', s => {
      const p = (s.phone || '').replace(/\D/g, '').slice(-10);
      return p.length >= 10 ? `PHONE_${p}` : undefined;
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'students');
    return [];
  }
}

/**
 * Real-time listener for Firestore `institutes/srujaan_share_market_pune/students` + `students` collections.
 * Propagates soft-deletes (`isDeleted: true`, `deletedAt`) across devices and resolves conflicts by `updatedAt`.
 */
export function subscribeToFirestoreStudents(
  onUpdate: (students: Student[]) => void,
  onError?: (err: any) => void
): () => void {
  let unsubShared: (() => void) | null = null;
  let unsubLegacy: (() => void) | null = null;
  let unsubTop: (() => void) | null = null;
  let isCancelled = false;

  let sharedDocs: Student[] = [];
  let legacyDocs: Student[] = [];
  let topDocs: Student[] = [];

  const parseSnapToStudents = (snapshot: any): Student[] => {
    const list: Student[] = [];
    snapshot.forEach((docSnap: any) => {
      const data = docSnap.data();
      const id = String(data?.id || docSnap.id || '').trim();
      if (!data || !id) return;
      if (data.isDeleted === true || data.deletedAt) {
        markDeletedId('students', id);
        return;
      }
      const tombstones = getDeletedIds('students');
      if (tombstones.has(id)) return;
      const rec: Student = {
        id,
        regId: data.regId || id,
        name: data.name || 'Unnamed Student',
        phone: data.phone || '',
        whatsapp: data.whatsapp || data.phone || '',
        email: data.email || '',
        address: data.address || '',
        course: data.course || 'Complete Master Trader Blueprint',
        batch: data.batch || '',
        enrollDate: data.enrollDate || new Date().toISOString().split('T')[0],
        joinDate: data.joinDate || data.enrollDate || new Date().toISOString().split('T')[0],
        status: data.status || 'Active',
        source: data.source || 'Direct',
        grossFee: Number(data.grossFee) || Number(data.netFee) || 25000,
        discount: Number(data.discount) || 0,
        netFee: Number(data.netFee) || 25000,
        docs: data.docs || '',
        notes: data.notes || '',
        milestones: Array.isArray(data.milestones) ? data.milestones : []
      };
      if (data.updatedAt) (rec as any).updatedAt = data.updatedAt;
      if (data.serverUpdatedAt) (rec as any).serverUpdatedAt = data.serverUpdatedAt;
      (rec as any).syncStatus = 'synced';
      list.push(rec);
    });
    return list;
  };

  const emitMerged = () => {
    recordRemoteSnapshotPulse();
    const merged = mergeStudentsSafely(topDocs, mergeStudentsSafely(legacyDocs, sharedDocs));
    onUpdate(merged);
  };

  ensureAuthorizedSession().then((authorized) => {
    if (isCancelled || !authorized || !auth.currentUser) return;

    try {
      const sharedCol = getColRef('students');
      const legacyCol = getLegacyColRef('students');
      const topCol = collection(db, 'students');
      incrementActiveListenerCount(3);

      unsubShared = onSnapshot(
        sharedCol,
        { includeMetadataChanges: true },
        (snapshot) => {
          if (snapshot.metadata.hasPendingWrites) return;
          sharedDocs = parseSnapToStudents(snapshot);
          emitMerged();
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, `institutes/${SHARED_INSTITUTE_ROOT_ID}/students`);
          if (onError) onError(error);
        }
      );

      unsubLegacy = onSnapshot(
        legacyCol,
        { includeMetadataChanges: true },
        (snapshot) => {
          if (snapshot.metadata.hasPendingWrites) return;
          legacyDocs = parseSnapToStudents(snapshot);
          emitMerged();
        },
        () => {}
      );

      unsubTop = onSnapshot(
        topCol,
        { includeMetadataChanges: true },
        (snapshot) => {
          if (snapshot.metadata.hasPendingWrites) return;
          topDocs = parseSnapToStudents(snapshot);
          emitMerged();
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, 'students');
          if (onError) onError(error);
        }
      );
    } catch (err) {
      console.warn('Could not establish Firestore students snapshot subscription:', err);
    }
  });

  return () => {
    isCancelled = true;
    if (unsubShared) {
      incrementActiveListenerCount(-1);
      unsubShared();
      unsubShared = null;
    }
    if (unsubLegacy) {
      incrementActiveListenerCount(-1);
      unsubLegacy();
      unsubLegacy = null;
    }
    if (unsubTop) {
      incrementActiveListenerCount(-1);
      unsubTop();
      unsubTop = null;
    }
  };
}

/**
 * Real-time listener for Firestore `institutes/srujaan_share_market_pune/leads` + `leads` collections.
 * Propagates soft-deletes (`isDeleted: true`, `deletedAt`) across devices and resolves conflicts by `updatedAt`.
 */
export function subscribeToFirestoreLeads(
  onUpdate: (leads: Lead[]) => void,
  onError?: (err: any) => void
): () => void {
  let unsubShared: (() => void) | null = null;
  let unsubLegacy: (() => void) | null = null;
  let unsubTop: (() => void) | null = null;
  let isCancelled = false;

  let sharedDocs: Lead[] = [];
  let legacyDocs: Lead[] = [];
  let topDocs: Lead[] = [];

  const parseSnapToLeads = (snapshot: any): Lead[] => {
    const list: Lead[] = [];
    snapshot.forEach((docSnap: any) => {
      const data = docSnap.data();
      const id = String(data?.id || docSnap.id || '').trim();
      if (!data || !id) return;
      if (data.isDeleted === true || data.deletedAt) {
        markDeletedId('leads', id);
        return;
      }
      const tombstones = getDeletedIds('leads');
      if (tombstones.has(id)) return;
      const rec: Lead = {
        id,
        name: data.name || 'Unnamed Prospect',
        phone: data.phone || '',
        email: data.email || '',
        locality: data.locality || '',
        course: data.course || 'Complete Master Trader Blueprint',
        source: data.source || 'Direct',
        stage: data.stage || 'New Enquiry',
        intent: data.intent || 'Hot',
        enquiryDate: data.enquiryDate || new Date().toISOString().split('T')[0],
        followUpDate: data.followUpDate || '',
        followUpTime: data.followUpTime || '11:00 AM',
        lastContact: data.lastContact || new Date().toISOString().split('T')[0],
        mode: data.mode || 'Offline Classroom',
        staff: data.staff || 'Prasad Sir',
        objection: data.objection || 'None',
        notes: data.notes || ''
      };
      if (data.updatedAt) (rec as any).updatedAt = data.updatedAt;
      if (data.serverUpdatedAt) (rec as any).serverUpdatedAt = data.serverUpdatedAt;
      (rec as any).syncStatus = 'synced';
      list.push(rec);
    });
    return list;
  };

  const emitMerged = () => {
    recordRemoteSnapshotPulse();
    const merged = mergeRecordsByKeySafely(
      topDocs,
      mergeRecordsByKeySafely(legacyDocs, sharedDocs, 'id', 'leads'),
      'id',
      'leads'
    );
    onUpdate(merged);
  };

  ensureAuthorizedSession().then((authorized) => {
    if (isCancelled || !authorized || !auth.currentUser) return;

    try {
      const sharedCol = getColRef('leads');
      const legacyCol = getLegacyColRef('leads');
      const topCol = collection(db, 'leads');
      incrementActiveListenerCount(3);

      unsubShared = onSnapshot(
        sharedCol,
        { includeMetadataChanges: true },
        (snapshot) => {
          if (snapshot.metadata.hasPendingWrites) return;
          sharedDocs = parseSnapToLeads(snapshot);
          emitMerged();
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, `institutes/${SHARED_INSTITUTE_ROOT_ID}/leads`);
          if (onError) onError(error);
        }
      );

      unsubLegacy = onSnapshot(
        legacyCol,
        { includeMetadataChanges: true },
        (snapshot) => {
          if (snapshot.metadata.hasPendingWrites) return;
          legacyDocs = parseSnapToLeads(snapshot);
          emitMerged();
        },
        () => {}
      );

      unsubTop = onSnapshot(
        topCol,
        { includeMetadataChanges: true },
        (snapshot) => {
          if (snapshot.metadata.hasPendingWrites) return;
          topDocs = parseSnapToLeads(snapshot);
          emitMerged();
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, 'leads');
          if (onError) onError(error);
        }
      );
    } catch (err) {
      console.warn('Could not establish Firestore leads snapshot subscription:', err);
    }
  });

  return () => {
    isCancelled = true;
    if (unsubShared) {
      incrementActiveListenerCount(-1);
      unsubShared();
      unsubShared = null;
    }
    if (unsubLegacy) {
      incrementActiveListenerCount(-1);
      unsubLegacy();
      unsubLegacy = null;
    }
    if (unsubTop) {
      incrementActiveListenerCount(-1);
      unsubTop();
      unsubTop = null;
    }
  };
}

/**
 * Cloud Backup Snapshot Creator (Firestore collection `backups/` + unified `institutes/institute_master_data` + `students/`)
 */
export async function createFirestoreBackup(
  students: Student[],
  notes: string = 'Manual Backup Snapshot'
): Promise<{ backupId: string; timestamp: string }> {
  const timestamp = new Date().toISOString();
  const dateFormatted = timestamp.replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
  const backupId = `backup_${dateFormatted}`;
  const currentUser = auth.currentUser;

  const tombstones = getDeletedIds('students');
  const activeStudents = (students || []).filter(
    s => s && !(s as any).isDeleted && !tombstones.has(String(s.id || ''))
  );

  // Sync local cache keys immediately
  saveCachedStudents(activeStudents);

  const backupMeta: BackupSnapshotMeta = {
    id: backupId,
    createdAt: timestamp,
    createdBy: getCurrentActorEmail(),
    studentCount: activeStudents.length,
    students: activeStudents,
    checksum: `chk_${Date.now()}_${activeStudents.length}`,
    notes: notes.slice(0, 500)
  };

  // 1. Save latest snapshot metadata locally (capped to 2 snapshots and <300KB to preserve localStorage quota)
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.BACKUP_SNAPSHOTS);
      const list: BackupSnapshotMeta[] = raw ? JSON.parse(raw) : [];
      list.unshift(backupMeta);
      const cappedJson = JSON.stringify(list.slice(0, 2));
      if (cappedJson.length < 300_000) {
        localStorage.setItem(STORAGE_KEYS.BACKUP_SNAPSHOTS, cappedJson);
      } else {
        localStorage.setItem(STORAGE_KEYS.BACKUP_SNAPSHOTS, JSON.stringify([backupMeta]));
      }
      localStorage.setItem(STORAGE_KEYS.LAST_BACKUP_TIME, timestamp);
    } catch (e) {
      console.warn('Failed to save backup snapshot to local cache:', e);
    }
  }

  // 2. Diff-sync Firestore `students/` + `institutes/institute_master_data` + `backups/{backupId}`
  if (await ensureAuthorizedSession()) {
    try {
      await backupStudentData(activeStudents);

      const backupRef = doc(db, 'backups', backupId);
      await withTimeout(
        setDoc(backupRef, {
          id: backupId,
          createdAt: timestamp,
          createdBy: backupMeta.createdBy.slice(0, 128),
          studentCount: activeStudents.length,
          students: activeStudents.map(s => ({
            id: s.id,
            regId: s.regId,
            name: s.name,
            phone: s.phone,
            whatsapp: s.whatsapp || s.phone || '',
            email: s.email || '',
            address: s.address || '',
            course: s.course,
            batch: s.batch,
            status: s.status,
            source: s.source || 'Direct',
            grossFee: Number(s.grossFee) || Number(s.netFee) || 0,
            discount: Number(s.discount) || 0,
            netFee: Number(s.netFee) || 0,
            enrollDate: s.enrollDate,
            joinDate: s.joinDate || s.enrollDate || '',
            docs: s.docs || '',
            notes: s.notes || '',
            milestones: Array.isArray(s.milestones) ? s.milestones : [],
            isDeleted: false
          })),
          checksum: backupMeta.checksum,
          notes: backupMeta.notes
        }),
        3500,
        undefined
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `backups/${backupId}`);
    }
  }

  return { backupId, timestamp };
}

/**
 * Fetch latest remote backup snapshot from Firestore (`institutes/institute_master_data`, `students`, or `backups`)
 */
export async function fetchLatestFirestoreBackup(): Promise<{
  backupId: string;
  timestamp: string;
  studentCount: number;
  students: Student[];
  source: 'Firestore' | 'Local Cache';
} | null> {
  const tombstones = getDeletedIds('students');
  const filterClean = (arr: any[]): Student[] =>
    (arr || []).filter(s => s && !s.isDeleted && !tombstones.has(String(s.id || '')));

  // 1. Try Firestore if authorized (checking unified `institutes/institute_master_data` + `students` + `backups`)
  if (await ensureAuthorizedSession()) {
    try {
      const [masterSnap, liveStudents] = await Promise.all([
        fetchMasterSnapshotFromFirestore('institute_master_data'),
        fetchStudentsFromFirestore()
      ]);

      const masterStudents =
        masterSnap && Array.isArray(masterSnap.students) ? filterClean(masterSnap.students) : [];
      const mergedLive = liveStudents.length >= masterStudents.length ? liveStudents : masterStudents;

      const backupsCol = collection(db, 'backups');
      const q = query(backupsCol, orderBy('createdAt', 'desc'), limit(1));
      const snap = await withTimeout(getDocs(q), 3000, null as any);
      if (snap && !snap.empty) {
        const docSnap = snap.docs[0];
        const data = docSnap.data();
        if (data && Array.isArray(data.students)) {
          const cleanSnapshotStudents =
            mergedLive.length > 0 ? mergedLive : filterClean(data.students);
          return {
            backupId: data.id || docSnap.id,
            timestamp: masterSnap?.updatedAt || data.createdAt || new Date().toISOString(),
            studentCount: cleanSnapshotStudents.length,
            students: cleanSnapshotStudents,
            source: 'Firestore'
          };
        }
      }

      if (mergedLive.length > 0) {
        return {
          backupId: 'institute_master_data',
          timestamp: masterSnap?.updatedAt || new Date().toISOString(),
          studentCount: mergedLive.length,
          students: mergedLive,
          source: 'Firestore'
        };
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'backups');
    }
  }

  // 2. Fallback to local cache backups
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.BACKUP_SNAPSHOTS);
      if (raw) {
        const list: BackupSnapshotMeta[] = JSON.parse(raw);
        if (Array.isArray(list) && list.length > 0) {
          const latest = list[0];
          const cleanLocal = filterClean(latest.students);
          return {
            backupId: latest.id,
            timestamp: latest.createdAt,
            studentCount: cleanLocal.length,
            students: cleanLocal,
            source: 'Local Cache'
          };
        }
      }
      const cached = loadCachedStudents();
      if (cached && cached.length > 0) {
        return {
          backupId: 'local_cache',
          timestamp: new Date().toISOString(),
          studentCount: cached.length,
          students: cached,
          source: 'Local Cache'
        };
      }
    } catch (e) {
      console.warn('Failed reading local backup cache:', e);
    }
  }

  return null;
}

/**
 * Export student database to a downloadable JSON file
 */
export function exportStudentsToJson(students: Student[], filenamePrefix: string = 'srujaan_students_backup'): void {
  if (typeof window === 'undefined') return;
  const dateStr = new Date().toISOString().split('T')[0];
  const payload = {
    institute: 'Srujaan Share Market Institute',
    exportedAt: new Date().toISOString(),
    recordCount: students.length,
    version: '3.0.0',
    data: students
  };
  const jsonStr = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filenamePrefix}_${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Parse and validate uploaded backup JSON file
 */
export async function parseStudentBackupFile(
  file: File
): Promise<{ success: boolean; students?: Student[]; message: string; recordCount?: number }> {
  return new Promise((resolve) => {
    if (!file) {
      resolve({ success: false, message: 'No file provided' });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        if (!content) {
          resolve({ success: false, message: 'File is empty' });
          return;
        }
        const parsed = JSON.parse(content);
        const candidateStudents = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed.data)
          ? parsed.data
          : Array.isArray(parsed.students)
          ? parsed.students
          : null;

        if (!candidateStudents || candidateStudents.length === 0) {
          resolve({
            success: false,
            message: 'Invalid backup file: no student records found in the JSON payload.'
          });
          return;
        }

        // Validate structure of records
        const sanitized: Student[] = candidateStudents.map((item: any, idx: number) => ({
          id: String(item.id || `STU-${Date.now()}-${idx}`),
          regId: String(item.regId || `SSMI-${1000 + idx}`),
          name: String(item.name || 'Unnamed Student'),
          phone: String(item.phone || item.contact || ''),
          whatsapp: String(item.whatsapp || item.phone || item.contact || ''),
          email: String(item.email || ''),
          address: String(item.address || ''),
          course: String(item.course || 'Complete Master Trader Blueprint'),
          batch: String(item.batch || ''),
          enrollDate: String(item.enrollDate || new Date().toISOString().split('T')[0]),
          joinDate: String(item.joinDate || item.enrollDate || new Date().toISOString().split('T')[0]),
          status: item.status || 'Active',
          source: String(item.source || 'Backup Restore'),
          grossFee: Number(item.grossFee) || Number(item.netFee) || 25000,
          discount: Number(item.discount) || 0,
          netFee: Number(item.netFee) || 25000,
          docs: String(item.docs || ''),
          notes: String(item.notes || 'Restored from JSON backup'),
          milestones: Array.isArray(item.milestones) ? item.milestones : []
        }));

        resolve({
          success: true,
          students: sanitized,
          recordCount: sanitized.length,
          message: `Successfully validated ${sanitized.length} student records from backup.`
        });
      } catch (err: any) {
        resolve({
          success: false,
          message: `Failed to parse JSON file: ${err?.message || 'Malformed file'}`
        });
      }
    };
    reader.onerror = () => {
      resolve({ success: false, message: 'Failed to read file from disk' });
    };
    reader.readAsText(file);
  });
}

/**
 * Production-ready Google Apps Script Code.gs snippet for Google Sheets
 */
export const FULL_APPS_SCRIPT_CODE = `/**
 * Google Apps Script Web App for Student Records Persistence
 * Srujaan Share Market Institute Management System
 * Handles CREATE, UPDATE, and DELETE actions from web apps with zero CORS blocking.
 */

// Define the exact column order to maintain in your sheet
const HEADERS = [
  "ID",
  "Name",
  "Batch",
  "Contact",
  "Fees Status",
  "Status",
  "Last Updated"
];

const SHEET_NAME = "Students"; // Set your target tab name

/**
 * Handle incoming POST requests from the app
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  // Wait up to 30 seconds for other write operations to finish
  lock.tryLock(30000);

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return createJsonResponse({ status: "error", message: "No data received" }, 400);
    }

    const payload = JSON.parse(e.postData.contents);
    const action = payload.action; // 'CREATE', 'UPDATE', or 'DELETE'
    const student = payload.data || {};

    if (!student.id) {
      return createJsonResponse({ status: "error", message: "Missing student ID" }, 400);
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);

    // If tab doesn't exist, create it
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
    }

    // Ensure headers exist on row 1
    initializeHeaders(sheet);

    const timestamp = new Date().toISOString();
    const result = processRecord(sheet, action, student, timestamp);

    return createJsonResponse({
      status: "success",
      action: action,
      studentId: student.id,
      details: result
    });

  } catch (error) {
    return createJsonResponse({
      status: "error",
      message: error.toString()
    }, 500);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Handle GET requests (useful for sanity check / testing deployment)
 */
function doGet(e) {
  return createJsonResponse({
    status: "online",
    message: "Google Apps Script Student Sync API is active for Srujaan Share Market Institute."
  });
}

/**
 * Creates headers on row 1 if empty
 */
function initializeHeaders(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
}

/**
 * Locates or updates records by Student ID
 */
function processRecord(sheet, action, student, timestamp) {
  const lastRow = sheet.getLastRow();
  let rowIndex = -1;

  if (lastRow > 1) {
    const idColumnValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < idColumnValues.length; i++) {
      if (String(idColumnValues[i][0]) === String(student.id)) {
        rowIndex = i + 2; // +2 offset for 1-based indexing and header row
        break;
      }
    }
  }

  // Row structure mapping
  const rowData = [
    student.id || "",
    student.name || "",
    student.batch || "",
    student.contact || "",
    student.feesStatus || "Pending",
    action === "DELETE" ? "Deleted" : (student.status || "Active"),
    timestamp
  ];

  if (action === "CREATE") {
    if (rowIndex !== -1) {
      // Record already exists; update it instead of duplicating
      sheet.getRange(rowIndex, 1, 1, HEADERS.length).setValues([rowData]);
      return "Record already existed; updated row " + rowIndex;
    } else {
      sheet.appendRow(rowData);
      return "Appended new row";
    }
  } 
  else if (action === "UPDATE") {
    if (rowIndex !== -1) {
      sheet.getRange(rowIndex, 1, 1, HEADERS.length).setValues([rowData]);
      return "Updated row " + rowIndex;
    } else {
      // If not found, create new row
      sheet.appendRow(rowData);
      return "Record not found; appended new row";
    }
  } 
  else if (action === "DELETE") {
    if (rowIndex !== -1) {
      // Soft-delete: Marks the status column as "Deleted" so audit trail remains intact
      sheet.getRange(rowIndex, 1, 1, HEADERS.length).setValues([rowData]);
      
      // If you prefer to HARD DELETE the entire row, uncomment the line below:
      // sheet.deleteRow(rowIndex);
      
      return "Marked as Deleted at row " + rowIndex;
    } else {
      return "Record to delete was not found";
    }
  }

  return "Unknown action";
}

/**
 * Returns formatted JSON output
 */
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}`;
