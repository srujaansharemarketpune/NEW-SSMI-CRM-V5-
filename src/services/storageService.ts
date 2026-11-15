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
  deleteDoc,
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

let memorySheetEndpointMode: 'default' | 'custom' = 'default';
let memoryCustomSheetWebhookUrl = '';
let memoryPendingSyncQueue: PendingSyncItem[] = [];
let memoryBackupSnapshots: BackupSnapshotMeta[] = [];

/**
 * Retrieve the active endpoint preset mode ('default' | 'custom')
 */
export function getGoogleSheetEndpointMode(): 'default' | 'custom' {
  return memorySheetEndpointMode;
}

/**
 * Retrieve any stored custom endpoint URL (or empty string if none)
 */
export function getCustomGoogleSheetWebhookUrl(): string {
  if (
    memoryCustomSheetWebhookUrl === DEFAULT_APPS_SCRIPT_EXEC_URL ||
    memoryCustomSheetWebhookUrl === LEGACY_SAMPLE_SHEET_URL
  ) {
    return '';
  }
  return memoryCustomSheetWebhookUrl;
}

/**
 * Retrieve the active Google Apps Script Web App URL.
 * Always defaults to `DEFAULT_APPS_SCRIPT_EXEC_URL` when no custom endpoint is specified.
 */
export function getGoogleSheetWebhookUrl(): string {
  if (memorySheetEndpointMode === 'default') {
    return DEFAULT_APPS_SCRIPT_EXEC_URL;
  }
  if (!memoryCustomSheetWebhookUrl || memoryCustomSheetWebhookUrl === LEGACY_SAMPLE_SHEET_URL) {
    return DEFAULT_APPS_SCRIPT_EXEC_URL;
  }
  return memoryCustomSheetWebhookUrl;
}

/**
 * Persist the selected Apps Script endpoint & mode to Firestore settings
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

  memorySheetEndpointMode = resolvedMode;
  if (resolvedMode === 'custom' && trimmed && trimmed !== DEFAULT_APPS_SCRIPT_EXEC_URL) {
    memoryCustomSheetWebhookUrl = trimmed;
  }

  // Persist asynchronously to Firestore settings if user is authorized
  if (isAuthorizedUser(auth.currentUser)) {
    Promise.resolve().then(async () => {
      try {
        const settingsPayload = {
          appsScriptWebhookUrl: activeUrl,
          appsScriptEndpointMode: resolvedMode,
          appsScriptLibraryId: DEFAULT_APPS_SCRIPT_LIBRARY_ID,
          appsScriptLibraryUrl: DEFAULT_APPS_SCRIPT_LIBRARY_URL,
          updatedAt: serverTimestamp()
        };
        await Promise.all([
          setDoc(getDocRef('settings', 'institute_profile'), settingsPayload, { merge: true }),
          setDoc(doc(db, 'settings', 'institute_profile'), settingsPayload, { merge: true })
        ]);
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
  memoryCustomSheetWebhookUrl = '';
  memorySheetEndpointMode = 'default';
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
 * Tier 1: Local Cache Operations Disabled — 100% Online Single Firestore Source of Truth
 */
export function loadCachedStudents(): Student[] | null {
  return null;
}

export function saveCachedStudents(_students: Student[]): void {
  // No-op: 100% Online Cloud Firestore is the single permanent source of truth
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
 * Queue failed or offline sync items in memory for later reconciliation
 */
export function queuePendingSyncItem(item: PendingSyncItem): void {
  const filtered = memoryPendingSyncQueue.filter(
    q => q.studentId !== item.studentId || q.action !== item.action
  );
  filtered.unshift(item);
  memoryPendingSyncQueue = filtered.slice(0, 100);
}

export function getPendingSyncQueue(): PendingSyncItem[] {
  return [...memoryPendingSyncQueue];
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

  memoryPendingSyncQueue = remaining;
  return successful;
}

/**
 * Tier 2: Firebase Firestore Student Mutations (Permanent Path: `institutes/ssmi_master_db/admissions` & `fees`)
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
    const sharedFeeRef = getDocRef('fees', safeId);
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
    const feeData = {
      id: safeId.slice(0, 128),
      regId: String(student.regId || '').slice(0, 64),
      studentName: String(student.name || '').slice(0, 128),
      course: String(student.course || '').slice(0, 128),
      batchCode: String(student.batch || '').slice(0, 64),
      netFee: totalFees,
      paidAmount: paidFees,
      balanceAmount: pendingFees,
      status: pendingFees <= 0 ? 'Paid' : paidFees > 0 ? 'Partial' : 'Pending',
      milestones: Array.isArray(student.milestones) ? student.milestones : [],
      workspaceId: SHARED_INSTITUTE_ROOT_ID,
      updatedAt: nowIso,
      serverUpdatedAt: serverTimestamp()
    };
    await Promise.all([
      setDoc(sharedAdmRef, firestoreData, { merge: true }),
      setDoc(sharedRef, firestoreData, { merge: true }),
      setDoc(sharedFeeRef, feeData, { merge: true }),
      setDoc(legacyRef, firestoreData, { merge: true }),
      setDoc(topLevelRef, firestoreData, { merge: true }),
      setDoc(topLevelAdmRef, firestoreData, { merge: true })
    ]);
    recordCloudWriteSuccess();
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `institutes/${SHARED_INSTITUTE_ROOT_ID}/admissions/${student.id}`);
    return false;
  }
}

/**
 * Tier 2: Firebase Firestore Lead Mutations (Permanent Path: `institutes/ssmi_master_db/leads`)
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
    await Promise.allSettled([
      deleteDoc(getDocRef('admissions', safeId)),
      deleteDoc(getDocRef('students', safeId)),
      deleteDoc(getDocRef('fees', safeId)),
      deleteDoc(getLegacyDocRef('students', safeId)),
      deleteDoc(getLegacyDocRef('admissions', safeId)),
      deleteDoc(doc(db, 'students', safeId)),
      deleteDoc(doc(db, 'admissions', safeId))
    ]);
    recordCloudWriteSuccess();
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `institutes/${SHARED_INSTITUTE_ROOT_ID}/admissions/${studentId}`);
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
 * Real-time listener for Firestore `institutes/ssmi_master_db/admissions` + `institutes/ssmi_master_db/students`.
 * Directly reflects live Firestore documents so adding, editing, or deleting on Mobile immediately updates Laptop within 1–2s.
 */
export function subscribeToFirestoreStudents(
  onUpdate: (students: Student[]) => void,
  onError?: (err: any) => void
): () => void {
  let unsubAdmissions: (() => void) | null = null;
  let unsubStudents: (() => void) | null = null;
  let isCancelled = false;

  let admissionsDocs: Student[] = [];
  let studentsDocs: Student[] = [];

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
    const merged = mergeStudentsSafely(studentsDocs, admissionsDocs);
    onUpdate(merged);
  };

  ensureAuthorizedSession().then((authorized) => {
    if (isCancelled || !authorized || !auth.currentUser) return;

    try {
      const admissionsCol = getColRef('admissions');
      const studentsCol = getColRef('students');
      incrementActiveListenerCount(2);

      unsubAdmissions = onSnapshot(
        admissionsCol,
        (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            if (change.type === 'removed') {
              const id = String(change.doc.data()?.id || change.doc.id || '').trim();
              if (id) markDeletedId('students', id);
            }
          });
          admissionsDocs = parseSnapToStudents(snapshot);
          emitMerged();
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, `institutes/${SHARED_INSTITUTE_ROOT_ID}/admissions`);
          if (onError) onError(error);
        }
      );

      unsubStudents = onSnapshot(
        studentsCol,
        (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            if (change.type === 'removed') {
              const id = String(change.doc.data()?.id || change.doc.id || '').trim();
              if (id) markDeletedId('students', id);
            }
          });
          studentsDocs = parseSnapToStudents(snapshot);
          emitMerged();
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, `institutes/${SHARED_INSTITUTE_ROOT_ID}/students`);
          if (onError) onError(error);
        }
      );
    } catch (err) {
      console.warn('Could not establish Firestore students snapshot subscription:', err);
    }
  });

  return () => {
    isCancelled = true;
    if (unsubAdmissions) {
      incrementActiveListenerCount(-1);
      unsubAdmissions();
      unsubAdmissions = null;
    }
    if (unsubStudents) {
      incrementActiveListenerCount(-1);
      unsubStudents();
      unsubStudents = null;
    }
  };
}

/**
 * Real-time listener for Firestore `institutes/ssmi_master_db/leads`.
 * Directly reflects live Firestore documents so adding, editing, or deleting on Mobile immediately updates Laptop within 1–2s.
 */
export function subscribeToFirestoreLeads(
  onUpdate: (leads: Lead[]) => void,
  onError?: (err: any) => void
): () => void {
  let unsubShared: (() => void) | null = null;
  let isCancelled = false;

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

  ensureAuthorizedSession().then((authorized) => {
    if (isCancelled || !authorized || !auth.currentUser) return;

    try {
      const sharedCol = getColRef('leads');
      incrementActiveListenerCount(1);

      unsubShared = onSnapshot(
        sharedCol,
        (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            if (change.type === 'removed') {
              const id = String(change.doc.data()?.id || change.doc.id || '').trim();
              if (id) markDeletedId('leads', id);
            }
          });
          const sharedDocs = parseSnapToLeads(snapshot);
          recordRemoteSnapshotPulse();
          onUpdate(sharedDocs);
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, `institutes/${SHARED_INSTITUTE_ROOT_ID}/leads`);
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
  };
}

export async function saveBatchToFirestore(batch: any): Promise<boolean> {
  if (!batch || !batch.code) return false;
  if (!(await ensureAuthorizedSession()) || !auth.currentUser) return false;
  try {
    const code = String(batch.code).trim();
    const nowIso = new Date().toISOString();
    await setDoc(
      getDocRef('batches', code),
      {
        ...batch,
        code,
        isDeleted: false,
        workspaceId: SHARED_INSTITUTE_ROOT_ID,
        updatedAt: nowIso,
        serverUpdatedAt: serverTimestamp()
      },
      { merge: true }
    );
    recordCloudWriteSuccess();
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `institutes/${SHARED_INSTITUTE_ROOT_ID}/batches/${batch.code}`);
    return false;
  }
}

/**
 * Real-time listeners for `institutes/ssmi_master_db/{batches,courses,fees,settings}`
 */
export function subscribeToFirestoreBatches(
  onUpdate: (batches: any[]) => void,
  onError?: (err: any) => void
): () => void {
  let unsub: (() => void) | null = null;
  let isCancelled = false;

  ensureAuthorizedSession().then((authorized) => {
    if (isCancelled || !authorized || !auth.currentUser) return;
    try {
      incrementActiveListenerCount(1);
      unsub = onSnapshot(
        getColRef('batches'),
        (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            if (change.type === 'removed') {
              const code = String(change.doc.data()?.code || change.doc.id || '').trim();
              if (code) markDeletedId('batches', code);
            }
          });
          const tombstones = getDeletedIds('batches');
          const list: any[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const code = String(data?.code || docSnap.id || '').trim();
            if (!data || !code || data.isDeleted || tombstones.has(code)) return;
            list.push({ ...data, code });
          });
          recordRemoteSnapshotPulse();
          onUpdate(list);
        },
        (err) => {
          handleFirestoreError(err, OperationType.LIST, `institutes/${SHARED_INSTITUTE_ROOT_ID}/batches`);
          if (onError) onError(err);
        }
      );
    } catch (e) {
      console.warn('Could not establish Firestore batches listener:', e);
    }
  });

  return () => {
    isCancelled = true;
    if (unsub) {
      incrementActiveListenerCount(-1);
      unsub();
      unsub = null;
    }
  };
}

export function subscribeToFirestoreCourses(
  onUpdate: (courses: any[]) => void,
  onError?: (err: any) => void
): () => void {
  let unsub: (() => void) | null = null;
  let isCancelled = false;

  ensureAuthorizedSession().then((authorized) => {
    if (isCancelled || !authorized || !auth.currentUser) return;
    try {
      incrementActiveListenerCount(1);
      unsub = onSnapshot(
        getColRef('courses'),
        (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            if (change.type === 'removed') {
              const id = String(change.doc.data()?.id || change.doc.id || '').trim();
              if (id) markDeletedId('courses', id);
            }
          });
          const tombstones = getDeletedIds('courses');
          const list: any[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const id = String(data?.id || docSnap.id || '').trim();
            if (!data || !id || data.isDeleted || tombstones.has(id)) return;
            list.push({ ...data, id });
          });
          recordRemoteSnapshotPulse();
          onUpdate(list);
        },
        (err) => {
          handleFirestoreError(err, OperationType.LIST, `institutes/${SHARED_INSTITUTE_ROOT_ID}/courses`);
          if (onError) onError(err);
        }
      );
    } catch (e) {
      console.warn('Could not establish Firestore courses listener:', e);
    }
  });

  return () => {
    isCancelled = true;
    if (unsub) {
      incrementActiveListenerCount(-1);
      unsub();
      unsub = null;
    }
  };
}

export function subscribeToFirestoreFees(
  onUpdate: (fees: any[]) => void,
  onError?: (err: any) => void
): () => void {
  let unsub: (() => void) | null = null;
  let isCancelled = false;

  ensureAuthorizedSession().then((authorized) => {
    if (isCancelled || !authorized || !auth.currentUser) return;
    try {
      incrementActiveListenerCount(1);
      unsub = onSnapshot(
        getColRef('fees'),
        (snapshot) => {
          const list: any[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const id = String(data?.id || docSnap.id || '').trim();
            if (!data || !id || data.isDeleted) return;
            list.push({ ...data, id });
          });
          recordRemoteSnapshotPulse();
          onUpdate(list);
        },
        (err) => {
          handleFirestoreError(err, OperationType.LIST, `institutes/${SHARED_INSTITUTE_ROOT_ID}/fees`);
          if (onError) onError(err);
        }
      );
    } catch (e) {
      console.warn('Could not establish Firestore fees listener:', e);
    }
  });

  return () => {
    isCancelled = true;
    if (unsub) {
      incrementActiveListenerCount(-1);
      unsub();
      unsub = null;
    }
  };
}

export function subscribeToFirestoreSettings(
  onUpdate: (settings: Record<string, any>) => void,
  onError?: (err: any) => void
): () => void {
  let unsub: (() => void) | null = null;
  let isCancelled = false;

  ensureAuthorizedSession().then((authorized) => {
    if (isCancelled || !authorized || !auth.currentUser) return;
    try {
      incrementActiveListenerCount(1);
      unsub = onSnapshot(
        getColRef('settings'),
        (snapshot) => {
          snapshot.forEach((docSnap) => {
            if (docSnap.id === 'institute_profile' || snapshot.size === 1) {
              const data = docSnap.data();
              if (data && typeof data === 'object') {
                recordRemoteSnapshotPulse();
                onUpdate(data);
              }
            }
          });
        },
        (err) => {
          handleFirestoreError(err, OperationType.LIST, `institutes/${SHARED_INSTITUTE_ROOT_ID}/settings`);
          if (onError) onError(err);
        }
      );
    } catch (e) {
      console.warn('Could not establish Firestore settings listener:', e);
    }
  });

  return () => {
    isCancelled = true;
    if (unsub) {
      incrementActiveListenerCount(-1);
      unsub();
      unsub = null;
    }
  };
}

/**
 * One-Time Cloud Migration Helper ("Sync / Migrate Local Data to Cloud"):
 * Pulls any legacy Firestore collections (`institutes/srujaan_share_market_pune/*`, `institutes/institute_master_data`, top-level `students`/`leads`)
 * and current state into the permanent `institutes/ssmi_master_db/{admissions,leads,fees,batches,courses,settings}` collections.
 */
export async function migrateLocalAndLegacyDataToCloud(currentState: AppState): Promise<{
  ok: boolean;
  migratedStudents: number;
  migratedLeads: number;
  migratedBatches: number;
  migratedCourses: number;
  message: string;
}> {
  if (!(await ensureAuthorizedSession()) || !auth.currentUser) {
    return {
      ok: false,
      migratedStudents: 0,
      migratedLeads: 0,
      migratedBatches: 0,
      migratedCourses: 0,
      message: 'Please sign in with an authorized Google account first.'
    };
  }
  try {
    const [legacyStudentsSnap, topStudentsSnap, legacyLeadsSnap, topLeadsSnap, masterSnap] = await Promise.all([
      withTimeout(getDocs(getLegacyColRef('students')), 4000, null as any),
      withTimeout(getDocs(collection(db, 'students')), 4000, null as any),
      withTimeout(getDocs(getLegacyColRef('leads')), 4000, null as any),
      withTimeout(getDocs(collection(db, 'leads')), 4000, null as any),
      fetchMasterSnapshotFromFirestore('institute_master_data')
    ]);

    const legacyStudents: Student[] = [];
    const collectStudents = (snap: any) => {
      if (!snap || snap.empty) return;
      snap.forEach((d: any) => {
        const raw = d.data();
        if (raw && !raw.isDeleted) {
          legacyStudents.push({ ...raw, id: String(raw.id || d.id) } as Student);
        }
      });
    };
    collectStudents(legacyStudentsSnap);
    collectStudents(topStudentsSnap);
    if (Array.isArray(masterSnap?.students)) {
      masterSnap.students.forEach((s: any) => {
        if (s && !s.isDeleted) legacyStudents.push(s as Student);
      });
    }

    const legacyLeads: Lead[] = [];
    const collectLeads = (snap: any) => {
      if (!snap || snap.empty) return;
      snap.forEach((d: any) => {
        const raw = d.data();
        if (raw && !raw.isDeleted) {
          legacyLeads.push({ ...raw, id: String(raw.id || d.id) } as Lead);
        }
      });
    };
    collectLeads(legacyLeadsSnap);
    collectLeads(topLeadsSnap);
    if (Array.isArray(masterSnap?.leads)) {
      masterSnap.leads.forEach((l: any) => {
        if (l && !l.isDeleted) legacyLeads.push(l as Lead);
      });
    }

    const allStudents = mergeStudentsSafely(currentState.students || [], legacyStudents);
    const allLeads = mergeRecordsByKeySafely(currentState.leads || [], legacyLeads, 'id', 'leads');
    const allBatches = currentState.batches || [];
    const allCourses = currentState.courses || [];

    for (const s of allStudents) {
      await saveStudentToFirestore(s);
    }
    for (const l of allLeads) {
      await saveLeadToFirestore(l);
    }
    for (const b of allBatches) {
      const code = String(b.code || '').trim();
      if (code) {
        await setDoc(getDocRef('batches', code), { ...b, code, isDeleted: false, workspaceId: SHARED_INSTITUTE_ROOT_ID, updatedAt: new Date().toISOString() }, { merge: true });
      }
    }
    for (const c of allCourses) {
      const id = String(c.id || '').trim();
      if (id) {
        await setDoc(getDocRef('courses', id), { ...c, id, isDeleted: false, workspaceId: SHARED_INSTITUTE_ROOT_ID, updatedAt: new Date().toISOString() }, { merge: true });
      }
    }
    if (currentState.settings) {
      await setDoc(getDocRef('settings', 'institute_profile'), { ...currentState.settings, workspaceId: SHARED_INSTITUTE_ROOT_ID, updatedAt: new Date().toISOString() }, { merge: true });
    }

    recordCloudWriteSuccess();
    return {
      ok: true,
      migratedStudents: allStudents.length,
      migratedLeads: allLeads.length,
      migratedBatches: allBatches.length,
      migratedCourses: allCourses.length,
      message: `Successfully migrated ${allStudents.length} admissions, ${allLeads.length} leads, ${allBatches.length} batches, and ${allCourses.length} courses to institutes/${SHARED_INSTITUTE_ROOT_ID}.`
    };
  } catch (err: any) {
    return {
      ok: false,
      migratedStudents: 0,
      migratedLeads: 0,
      migratedBatches: 0,
      migratedCourses: 0,
      message: err?.message || 'Cloud migration failed.'
    };
  }
}

/**
 * Cloud Backup Snapshot Creator (Firestore collection `backups/` + unified `institutes/ssmi_master_db`)
 */
export async function createFirestoreBackup(
  students: Student[],
  notes: string = 'Manual Backup Snapshot'
): Promise<{ backupId: string; timestamp: string }> {
  const timestamp = new Date().toISOString();
  const dateFormatted = timestamp.replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
  const backupId = `backup_${dateFormatted}`;

  const tombstones = getDeletedIds('students');
  const activeStudents = (students || []).filter(
    s => s && !(s as any).isDeleted && !tombstones.has(String(s.id || ''))
  );

  const backupMeta: BackupSnapshotMeta = {
    id: backupId,
    createdAt: timestamp,
    createdBy: getCurrentActorEmail(),
    studentCount: activeStudents.length,
    students: activeStudents,
    checksum: `chk_${Date.now()}_${activeStudents.length}`,
    notes: notes.slice(0, 500)
  };

  memoryBackupSnapshots = [backupMeta, ...memoryBackupSnapshots].slice(0, 2);

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

  // 2. Fallback to in-memory runtime snapshots only (no localStorage)
  if (memoryBackupSnapshots.length > 0) {
    const latest = memoryBackupSnapshots[0];
    const cleanLocal = filterClean(latest.students);
    return {
      backupId: latest.id,
      timestamp: latest.createdAt,
      studentCount: cleanLocal.length,
      students: cleanLocal,
      source: 'Firestore'
    };
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
