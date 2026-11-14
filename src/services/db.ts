import { AppState, Course, StorageQuotaInfo, UnifiedInstituteDB } from '../types';
import { getInitialAppState, LIVE_TODAY_ISO } from '../data/initialData';
import {
  auth,
  signInWithGoogle,
  syncFullStateToFirestore,
  syncCoursesToFirestore,
  saveCourseToFirestore,
  fetchCoursesFromFirestore,
  fetchStudentsFromFirestore,
  fetchLeadsFromFirestore,
  fetchBatchesFromFirestore,
  fetchStaffFromFirestore,
  fetchSettingsFromFirestore,
  fetchMasterInstituteFromFirestore,
  fetchMasterSnapshotFromFirestore,
  restoreJsonToFirestoreMaster,
  autoSaveToFirestoreMaster,
  filterActiveRecords,
  getDeletedIds,
  markDeletedId,
  unmarkDeletedId,
  mergeRemoteDeletedRegistry,
  getLocalDeviceId,
  getCurrentActorEmail,
  deleteLeadFromFirestore,
  deleteBatchFromFirestore,
  deleteStaffFromFirestore,
  deleteCourseFromFirestore,
  backupStudentData,
  restoreStudentData,
  mergeStudentsSafely,
  mergeRecordsByKeySafely,
  mergeAttendanceSafely,
  deduplicateRecords,
  getDeterministicStudentId,
  getDeterministicLeadId,
  getDeterministicAttendanceId,
  getDeterministicPaymentId,
  getDeterministicStaffId,
  getDeterministicCourseId,
  getDeterministicExpenseId,
  clearAllDeletedTombstones,
  getSyncDiagnosticsReport,
  SyncDiagnosticsReport,
  subscribeToSyncStatus,
  getSyncStatusSnapshot,
  setSyncEngineWorking,
  recordSyncError,
  recordCloudReadSuccess,
  recordCloudWriteSuccess,
  setPendingOfflineWritesCount,
  createLocalSafetyBackup,
  getFinancialConflictReport,
  clearFinancialConflictReport,
  runLiveFirebaseVerificationSuite,
  SyncStatusSnapshot,
  SyncStatusState,
  VerificationTestResult,
  FinancialConflictItem
} from './firebase';

export {
  filterActiveRecords,
  getDeletedIds,
  markDeletedId,
  unmarkDeletedId,
  mergeRemoteDeletedRegistry,
  getLocalDeviceId,
  fetchMasterInstituteFromFirestore,
  fetchMasterSnapshotFromFirestore,
  restoreJsonToFirestoreMaster,
  deleteLeadFromFirestore,
  deleteBatchFromFirestore,
  deleteStaffFromFirestore,
  deleteCourseFromFirestore,
  backupStudentData,
  restoreStudentData,
  mergeStudentsSafely,
  mergeRecordsByKeySafely,
  mergeAttendanceSafely,
  deduplicateRecords,
  getDeterministicStudentId,
  getDeterministicLeadId,
  getDeterministicAttendanceId,
  getDeterministicPaymentId,
  getDeterministicStaffId,
  getDeterministicCourseId,
  getDeterministicExpenseId,
  clearAllDeletedTombstones,
  getSyncDiagnosticsReport,
  subscribeToSyncStatus,
  getSyncStatusSnapshot,
  setSyncEngineWorking,
  recordSyncError,
  recordCloudReadSuccess,
  recordCloudWriteSuccess,
  setPendingOfflineWritesCount,
  createLocalSafetyBackup,
  getFinancialConflictReport,
  clearFinancialConflictReport,
  runLiveFirebaseVerificationSuite
};
export type { SyncDiagnosticsReport, SyncStatusSnapshot, SyncStatusState, VerificationTestResult, FinancialConflictItem };

export const CRM_DATA_KEY = 'srujaan_crm_data_v1';
export const SSM_COURSES_DATA_KEY = 'ssm_courses_data';
const LEGACY_COURSES_KEY = 'srujaan_courses_v2';
const DB_NAME = 'SrujaanIMS_IndexedDB_v5';
const DB_VERSION = 5;
const STORAGE_KEY = 'SRUJAAN_IMS_OFFLINE_MIRROR_V5';
const UNIFIED_DB_KEY = 'srujaan_institute_db_v3';
const MASTER_DB_KEY = 'srujaan_master_db';

const LEGACY_INSTRUCTOR_NAMES = new Set([
  'vikramaditya srujaan',
  'srujaan s. patil',
  'srujaan patil',
  'vikramaditya',
  'prasad bhunje',
  'anand kulkarni',
  'sagar shinde'
]);

const LEGACY_SIGNATORY_NAMES = new Set([
  'vikramaditya srujaan',
  'srujaan s. patil',
  'srujaan patil',
  'sagar shinde',
  'prasad sir',
  'prasad bhunje'
]);

const LEGACY_SIGNATORY_DESIGNATIONS = new Set([
  'founder & principal academic director',
  'founder & chief technical analyst',
  'chief mentor & admin',
  'director'
]);

function normalizeInstructorName(raw?: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed || LEGACY_INSTRUCTOR_NAMES.has(trimmed.toLowerCase())) {
    return 'Prasad Sir';
  }
  return trimmed;
}

/**
 * Reads persisted courses from `ssm_courses_data` first (falling back to `srujaan_courses_v2`).
 * Prevents course edits (instructor, title, fees, syllabus, status) from ever reverting to mock presets on refresh,
 * while automatically migrating legacy placeholder instructor names to "Prasad Sir".
 */
export function loadSavedCoursesFromStorage(): Course[] | null {
  if (typeof window === 'undefined') return null;
  const normalizeCoursesList = (list: Course[]): Course[] =>
    list.map(c => ({
      ...c,
      instructor: normalizeInstructorName(c.instructor),
      lectures: Array.isArray(c.lectures)
        ? c.lectures.map(l => ({
            ...l,
            instructor: normalizeInstructorName(l.instructor)
          }))
        : []
    }));

  try {
    const rawPrimary = localStorage.getItem(SSM_COURSES_DATA_KEY);
    if (rawPrimary) {
      const parsed = JSON.parse(rawPrimary);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const normalized = normalizeCoursesList(parsed);
        localStorage.setItem(SSM_COURSES_DATA_KEY, JSON.stringify(normalized));
        return normalized;
      }
    }
    const rawFallback = localStorage.getItem(LEGACY_COURSES_KEY);
    if (rawFallback) {
      const parsed = JSON.parse(rawFallback);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const normalized = normalizeCoursesList(parsed);
        localStorage.setItem(SSM_COURSES_DATA_KEY, JSON.stringify(normalized));
        return normalized;
      }
    }
  } catch (err) {
    console.warn('loadSavedCoursesFromStorage warning:', err);
  }
  return null;
}

let courseCloudSyncTimer: ReturnType<typeof setTimeout> | null = null;

function safeLocalStorageSet(key: string, value: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(key, value);
  } catch (err) {
    // On QuotaExceededError, purge any legacy/redundant keys and retry once
    const redundantKeys = [
      'SRUJAAN_IMS_OFFLINE_MIRROR_V5',
      'srujaan_institute_db_v3',
      'srujaan_master_db',
      'srujaan_master_db_snapshot',
      'srujaan_study_materials_v2',
      'srujaan_courses_v2',
      'crm_students',
      'ssm_pre_sync_safety_backup_v1',
      'ssmi_backup_snapshots_v1'
    ];
    redundantKeys.forEach((rk) => {
      try {
        window.localStorage.removeItem(rk);
      } catch {
        // ignore
      }
    });
    try {
      window.localStorage.setItem(key, value);
    } catch (retryErr) {
      console.warn(`localStorage write skipped for ${key} (relying on IndexedDB):`, retryErr || err);
    }
  }
}

function compactStateForLocalStorage(state: AppState): AppState {
  const compactMaterials = Array.isArray(state.materials)
    ? state.materials.map((m) => {
        if (m && typeof m.fileData === 'string' && m.fileData.length > 16384 && m.fileData.startsWith('data:')) {
          return { ...m, fileData: '' };
        }
        return m;
      })
    : state.materials;

  const compactSettings = state.settings ? { ...state.settings } : state.settings;
  if (compactSettings && typeof compactSettings === 'object') {
    const largeSettingKeys: (keyof typeof compactSettings)[] = [
      'primaryLogoBase64',
      'logoBase64',
      'certificateLogoBase64',
      'signatureBase64',
      'upiQrBase64'
    ];
    for (const k of largeSettingKeys) {
      const val = compactSettings[k];
      if (typeof val === 'string' && val.length > 100000) {
        delete compactSettings[k];
      }
    }
  }

  return {
    ...state,
    materials: compactMaterials,
    settings: compactSettings,
    attendanceHistory: Array.isArray(state.attendanceHistory)
      ? state.attendanceHistory.slice(0, 100)
      : state.attendanceHistory
  };
}

/**
 * Synchronously writes the `courses` array to `ssm_courses_data` in localStorage,
 * updates the canonical CRM key if provided, and triggers a 400ms debounced Firestore + Cloud sync.
 */
export function saveCoursesToStorageImmediate(courses: Course[], fullState?: AppState): void {
  if (typeof window === 'undefined' || !Array.isArray(courses)) return;
  let updatedStateForSync: AppState | null = null;
  try {
    const serializedCourses = JSON.stringify(courses);
    safeLocalStorageSet(SSM_COURSES_DATA_KEY, serializedCourses);

    if (fullState) {
      updatedStateForSync = {
        ...fullState,
        courses,
        lastSavedAt: new Date().toISOString()
      };
      safeLocalStorageSet(CRM_DATA_KEY, JSON.stringify(compactStateForLocalStorage(updatedStateForSync)));
      syncWindowInstituteDB(updatedStateForSync);
    } else if ((window as any).instituteDB) {
      (window as any).instituteDB.courses = courses;
      (window as any).instituteDB.lastModified = new Date().toISOString();
    }
  } catch (err) {
    console.warn('saveCoursesToStorageImmediate warning:', err);
  }

  // Trigger 400ms debounced Firestore & Cloud Server sync to prevent network congestion
  if (courseCloudSyncTimer) {
    clearTimeout(courseCloudSyncTimer);
  }
  courseCloudSyncTimer = setTimeout(() => {
    courseCloudSyncTimer = null;
    syncCoursesToFirestore(courses).catch(() => {});
    if (updatedStateForSync) {
      dualWriteToCloud(updatedStateForSync, { interactiveAuth: false }).catch(() => {});
    }
  }, 400);
}

export { saveCourseToFirestore };

let idbDatabase: IDBDatabase | null = null;

const LEGACY_PRESET_BRANCH_IDS = new Set(['BR-01', 'BR-02', 'BR-03']);
const LEGACY_PRESET_BRANCH_NAMES = new Set([
  'Shivajinagar Flagship Campus',
  'Kothrud Learning Centre',
  'PCMC Executive Desk'
]);
const LEGACY_PRESET_ADDRESSES = new Set([
  'Shivajinagar Campus, FC Road, Pune, Maharashtra - 411004',
  'Near Karve Statue, Kothrud, Pune, Maharashtra - 411038',
  'Wakad Bridge, PCMC, Pune, Maharashtra - 411057'
]);

/**
 * Resolves the active user-entered address and contact details from either:
 * 1. A specific custom branch ID (e.g. selected on a Fee Receipt or Certificate), OR
 * 2. The user's Default / Primary custom branch in `settings.branches`, OR
 * 3. The manual `settings.primaryAddress` / `settings.campusAddress`.
 * Never returns hardcoded presets.
 */
export function getActiveInstituteAddress(
  settings?: AppState['settings'],
  branchId?: string
): {
  branchId: string;
  branchName: string;
  fullAddress: string;
  phone: string;
  whatsapp: string;
  googleMapsUrl: string;
  isConfigured: boolean;
} {
  if (!settings) {
    return {
      branchId: '',
      branchName: '',
      fullAddress: '',
      phone: '',
      whatsapp: '',
      googleMapsUrl: '',
      isConfigured: false
    };
  }

  const customBranches = (settings.branches || []).filter(
    b =>
      !LEGACY_PRESET_BRANCH_IDS.has(b.id) &&
      !LEGACY_PRESET_BRANCH_NAMES.has(b.branchName || b.name) &&
      (b.fullAddress || b.address || '').trim().length > 0
  );

  // 1. Specific branch requested (e.g. Receipt / Invoice Branch Selector)
  if (branchId && branchId !== 'PRIMARY_MANUAL') {
    const found = customBranches.find(b => b.id === branchId);
    if (found) {
      const addr = (found.fullAddress || found.address || '').trim();
      return {
        branchId: found.id,
        branchName: (found.branchName || found.name || '').trim(),
        fullAddress: addr,
        phone: (found.phone || settings.phone || '').trim(),
        whatsapp: (found.whatsapp || settings.whatsappSupport || found.phone || settings.phone || '').trim(),
        googleMapsUrl: (found.googleMapsUrl || settings.googleMapsUrl || '').trim(),
        isConfigured: addr.length > 0
      };
    }
  }

  // 2. If not explicitly asking for PRIMARY_MANUAL, check if user marked a custom branch as Default/Primary
  if (branchId !== 'PRIMARY_MANUAL' && customBranches.length > 0) {
    const defaultBranch =
      customBranches.find(b => b.isDefault || b.isPrimary) || customBranches[0];
    if (defaultBranch && (defaultBranch.isDefault || defaultBranch.isPrimary || !(settings.campusAddress || '').trim())) {
      const addr = (defaultBranch.fullAddress || defaultBranch.address || '').trim();
      if (addr.length > 0) {
        return {
          branchId: defaultBranch.id,
          branchName: (defaultBranch.branchName || defaultBranch.name || '').trim(),
          fullAddress: addr,
          phone: (defaultBranch.phone || settings.phone || '').trim(),
          whatsapp: (defaultBranch.whatsapp || settings.whatsappSupport || defaultBranch.phone || settings.phone || '').trim(),
          googleMapsUrl: (defaultBranch.googleMapsUrl || settings.googleMapsUrl || '').trim(),
          isConfigured: true
        };
      }
    }
  }

  // 3. Check Primary Manual Address Input (`settings.primaryAddress` & `settings.campusAddress`)
  const pa = settings.primaryAddress;
  const rawCampus =LEGACY_PRESET_ADDRESSES.has((settings.campusAddress || '').trim())
    ? ''
    : (settings.campusAddress || '').trim();

  const manualParts = [
    pa?.streetAddress?.trim() || rawCampus,
    pa?.landmark?.trim() ? `Near ${pa.landmark.trim()}` : settings.landmark?.trim() ? `Near ${settings.landmark.trim()}` : '',
    [
      pa?.city?.trim() || settings.city?.trim() || '',
      pa?.district?.trim() && pa?.district?.trim() !== (pa?.city?.trim() || settings.city?.trim())
        ? pa.district.trim()
        : '',
      pa?.state?.trim() || settings.state?.trim() || ''
    ]
      .filter(Boolean)
      .join(', '),
    pa?.pincode?.trim() || settings.pincode?.trim() || ''
  ].filter(Boolean);

  const formattedManual =
    pa?.fullFormattedAddress?.trim() ||
    rawCampus ||
    (manualParts.length > 0 ? manualParts.join(', ').replace(/, (\d{6})$/, ' - $1') : '');

  return {
    branchId: 'PRIMARY_MANUAL',
    branchName: (pa?.branchName || '').trim(),
    fullAddress: formattedManual,
    phone: (pa?.phone || settings.phone || '').trim(),
    whatsapp: (pa?.whatsapp || settings.whatsappSupport || pa?.phone || settings.phone || '').trim(),
    googleMapsUrl: (pa?.googleMapsUrl || settings.googleMapsUrl || '').trim(),
    isConfigured: formattedManual.length > 0
  };
}

export function buildUnifiedInstituteDB(state: AppState): UnifiedInstituteDB {
  const feeLedger: any[] = [];
  (state.students || []).forEach(s => {
    (s.milestones || []).forEach(m => {
      feeLedger.push({
        studentId: s.id,
        regId: s.regId,
        studentName: s.name,
        batch: s.batch || '',
        milestoneName: m.name,
        amount: m.amount,
        dueDate: m.dueDate,
        status: m.status,
        paymentDate: m.paymentDate || '',
        mode: m.mode || 'UPI',
        ref: m.ref || ''
      });
    });
  });

  const cloudCfg = state.settings?.cloudConfig || {
    provider: 'firebase',
    firebaseUrl: '',
    authToken: '',
    autoSyncIntervalMs: 120000,
    autoSaveSettings: true
  };

  const activeAddr = getActiveInstituteAddress(state.settings);

  return {
    version: '3.0.0',
    lastModified: state.lastSavedAt || new Date().toISOString(),
    settings: {
      instituteName: state.settings?.instituteName || 'Srujaan Share Market Institute',
      tagline: state.settings?.tagline || '',
      address: activeAddr.fullAddress,
      primaryAddress: state.settings?.primaryAddress,
      branches: state.settings?.branches || [],
      phone: activeAddr.phone || state.settings?.phone || '',
      email: state.settings?.email || '',
      website: state.settings?.website || '',
      primaryLogoBase64: state.settings?.primaryLogoBase64 || state.settings?.logoBase64 || '',
      certificateLogoBase64: state.settings?.certificateLogoBase64 || '',
      currencySymbol: state.settings?.currencySymbol || '₹',
      receiptPrefix: state.settings?.receiptPrefix || 'SSMI-REC-',
      terms: state.settings?.receiptTerms || '',
      cloudConfig: {
        provider: cloudCfg.provider || 'firebase',
        firebaseUrl: cloudCfg.firebaseUrl || '',
        authToken: cloudCfg.authToken || '',
        autoSyncIntervalMs: Number(cloudCfg.autoSyncIntervalMs) || 120000,
        autoSaveSettings: cloudCfg.autoSaveSettings !== false
      },
      fullSettings: state.settings
    },
    students: state.students || [],
    staff: state.staff || [],
    courses: state.courses || [],
    lectures: state.lectures || [],
    studyMaterials: state.materials || [],
    attendance: state.attendance || {},
    feeLedger,
    batches: state.batches || [],
    leads: state.leads || [],
    certificates: state.certificates || []
  };
}

export function syncWindowInstituteDB(state: AppState): UnifiedInstituteDB {
  const unified = buildUnifiedInstituteDB(state);
  if (typeof window !== 'undefined') {
    (window as any).instituteDB = unified;
    if (!(window as any).syncManager) {
      (window as any).syncManager = {
        commitMutation: (module: string, payload?: any) => {
          try {
            const current = (window as any).instituteDB || unified;
            current.lastModified = new Date().toISOString();
            if (module === 'settings' && payload) {
              current.settings = { ...current.settings, ...payload };
            }
          } catch (e) {
            console.warn('syncManager.commitMutation warning:', e);
          }
        }
      };
    }
  }
  return unified;
}

export async function initIndexedDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return null;
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (evt: IDBVersionChangeEvent) => {
        const db = (evt.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('app_state_store')) {
          db.createObjectStore('app_state_store', { keyPath: 'key' });
        }
      };
      req.onsuccess = (evt) => {
        idbDatabase = (evt.target as IDBOpenDBRequest).result;
        resolve(idbDatabase);
      };
      req.onerror = () => {
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
}

/**
 * Synchronous 0ms offline-first loader:
 * Reads immediately from browser localStorage on launch/reload before rendering,
 * ensuring reloading never flashes default state or resets modified data.
 */
export function loadOfflineData(): AppState {
  if (typeof window === 'undefined') {
    return getInitialAppState();
  }

  // 0. Check dedicated students cache (ssmi_students_v1) and courses cache (ssm_courses_data)
  let cachedStudentsList: any[] | null = null;
  try {
    const rawStu = localStorage.getItem('ssmi_students_v1');
    if (rawStu) {
      const parsedStu = JSON.parse(rawStu);
      if (Array.isArray(parsedStu)) {
        cachedStudentsList = parsedStu;
      }
    }
  } catch (err) {
    console.warn('loadOfflineData ssmi_students_v1 read error:', err);
  }

  const cachedCoursesList = loadSavedCoursesFromStorage();

  // 1. Check primary CRM persistence key
  try {
    const rawCrm = localStorage.getItem(CRM_DATA_KEY);
    if (rawCrm) {
      const parsed = JSON.parse(rawCrm);
      const data = parsed.payload ? parsed.payload : parsed;
      if (data && (Array.isArray(data.students) || data.settings || data.institute)) {
        if (cachedStudentsList && cachedStudentsList.length > 0) {
          data.students = mergeStudentsSafely(
            Array.isArray(data.students) ? data.students : [],
            cachedStudentsList
          );
        }
        if (cachedCoursesList && cachedCoursesList.length > 0) {
          data.courses = cachedCoursesList;
        }
        const normalized = normalizeLoadedState(data);
        syncWindowInstituteDB(normalized);
        return normalized;
      }
    }
  } catch (err) {
    console.warn('loadOfflineData CRM_DATA_KEY read error:', err);
  }

  // 2. Check offline mirror key
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const data = parsed.payload ? parsed.payload : parsed;
      if (data && Array.isArray(data.students)) {
        if (cachedCoursesList && cachedCoursesList.length > 0) {
          data.courses = cachedCoursesList;
        }
        const normalized = normalizeLoadedState(data);
        syncWindowInstituteDB(normalized);
        return normalized;
      }
    }
  } catch (err) {
    console.warn('loadOfflineData STORAGE_KEY read error:', err);
  }

  // 3. Check unified master db key
  try {
    const rawMaster = localStorage.getItem(MASTER_DB_KEY);
    if (rawMaster) {
      const parsed = JSON.parse(rawMaster);
      const data = parsed.payload ? parsed.payload : parsed;
      if (data && (Array.isArray(data.students) || data.settings)) {
        if (cachedCoursesList && cachedCoursesList.length > 0) {
          data.courses = cachedCoursesList;
        }
        const normalized = normalizeLoadedState(data);
        syncWindowInstituteDB(normalized);
        return normalized;
      }
    }
  } catch (err) {
    console.warn('loadOfflineData MASTER_DB_KEY read error:', err);
  }

  const initial = getInitialAppState();
  (initial as any).updatedAt = '1970-01-01T00:00:00.000Z';
  initial.lastSavedAt = '1970-01-01T00:00:00.000Z';
  (initial as any).isSeedData = true;
  if (cachedCoursesList && cachedCoursesList.length > 0) {
    initial.courses = cachedCoursesList;
  }
  syncWindowInstituteDB(initial);
  return initial;
}

export async function loadStateFromStorage(): Promise<AppState> {
  const cachedCoursesList = loadSavedCoursesFromStorage();
  let localState: AppState | null = null;
  // 1. Try local storage immediate mirror first
  try {
    const rawCrm = localStorage.getItem(CRM_DATA_KEY) || localStorage.getItem(STORAGE_KEY);
    if (rawCrm) {
      const parsed = JSON.parse(rawCrm);
      const data = parsed.payload ? parsed.payload : parsed;
      if (data && Array.isArray(data.students)) {
        if (cachedCoursesList && cachedCoursesList.length > 0 && (!Array.isArray(data.courses) || data.courses.length === 0)) {
          data.courses = cachedCoursesList;
        }
        localState = normalizeLoadedState(data);
      }
    }
  } catch (err) {
    console.warn('loadStateFromStorage localStorage read error:', err);
  }

  // 2. Try IndexedDB (which holds the full uncompacted state including base64 logos & material files)
  if (!idbDatabase) {
    await initIndexedDb();
  }
  if (idbDatabase) {
    try {
      const stateFromIdb = await new Promise<AppState | null>((resolve) => {
        const tx = idbDatabase!.transaction(['app_state_store'], 'readonly');
        const store = tx.objectStore('app_state_store');
        const req = store.get('PRIMARY_STATE');
        req.onsuccess = () => resolve(req.result ? req.result.value : null);
        req.onerror = () => resolve(null);
      });
      if (stateFromIdb && Array.isArray(stateFromIdb.students)) {
        const normalizedIdb = normalizeLoadedState(stateFromIdb);
        if (!localState) {
          syncWindowInstituteDB(normalizedIdb);
          return normalizedIdb;
        }
        // Hydrate full material fileData & large settings images from IndexedDB if compacted in localStorage
        const idbMatMap = new Map((normalizedIdb.materials || []).map((m) => [m.id, m]));
        localState.materials = (localState.materials || []).map((m) => {
          const full = idbMatMap.get(m.id);
          return !m.fileData && full?.fileData ? { ...m, fileData: full.fileData } : m;
        });
        if (normalizedIdb.settings) {
          localState.settings = {
            ...normalizedIdb.settings,
            ...localState.settings,
            primaryLogoBase64: localState.settings?.primaryLogoBase64 || normalizedIdb.settings.primaryLogoBase64,
            logoBase64: localState.settings?.logoBase64 || normalizedIdb.settings.logoBase64,
            certificateLogoBase64: localState.settings?.certificateLogoBase64 || normalizedIdb.settings.certificateLogoBase64,
            signatureBase64: localState.settings?.signatureBase64 || normalizedIdb.settings.signatureBase64,
            upiQrBase64: localState.settings?.upiQrBase64 || normalizedIdb.settings.upiQrBase64
          };
        }
        syncWindowInstituteDB(localState);
        return localState;
      }
    } catch (e) {
      console.warn('Error reading from IndexedDB:', e);
    }
  }

  if (localState) {
    syncWindowInstituteDB(localState);
    return localState;
  }

  // 3. Try online server mirror before falling back to initial seed state
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const resp = await fetch('/api/cloud/state');
      const contentType = (resp.headers.get('content-type') || '').toLowerCase();
      if (resp.ok && contentType.includes('application/json')) {
        const data = await resp.json();
        if (data?.state && Array.isArray(data.state.students)) {
          const normalized = normalizeLoadedState(data.state);
          await saveStateToStorage(normalized, { preserveTimestamp: true });
          return normalized;
        }
      }
    } catch {
      // ignore if server has no snapshot yet
    }
  }

  // 4. Fallback to initial seed state with epoch timestamp so cloud state always wins on fresh browsers/laptops
  const initial = getInitialAppState();
  (initial as any).updatedAt = '1970-01-01T00:00:00.000Z';
  initial.lastSavedAt = '1970-01-01T00:00:00.000Z';
  (initial as any).isSeedData = true;
  syncWindowInstituteDB(initial);
  return initial;
}

export function normalizeLoadedState(state: AppState): AppState {
  const today = LIVE_TODAY_ISO;
  const initial = getInitialAppState();

  // Ensure arrays exist if missing or corrupt
  if (!Array.isArray(state.staff)) {
    state.staff = initial.staff;
  }
  if (!Array.isArray(state.courses) || state.courses.length === 0) {
    const savedCourses = loadSavedCoursesFromStorage();
    state.courses = savedCourses && savedCourses.length > 0 ? savedCourses : initial.courses;
  }
  if (!Array.isArray(state.batches)) {
    state.batches = initial.batches;
  }
  if (!Array.isArray(state.students)) {
    state.students = initial.students;
  }
  if (!Array.isArray(state.leads)) {
    state.leads = initial.leads;
  }
  if (!Array.isArray(state.materials)) {
    state.materials = initial.materials;
  }
  if (!Array.isArray(state.lectures)) {
    state.lectures = initial.lectures;
  }

  // Strip any soft-deleted (isDeleted: true) or tombstoned records, then strictly deduplicate
  state.students = deduplicateRecords(filterActiveRecords(state.students, 'students', 'id'), 'id', s => {
    const p = (s.phone || '').replace(/\D/g, '').slice(-10);
    return p.length >= 10 ? `PHONE_${p}` : (s.regId ? `REG_${String(s.regId).trim().toUpperCase()}` : undefined);
  });
  state.leads = deduplicateRecords(filterActiveRecords(state.leads, 'leads', 'id'), 'id', l => {
    const p = (l.phone || '').replace(/\D/g, '').slice(-10);
    return p.length >= 10 ? `LEAD_PHONE_${p}` : undefined;
  });
  state.batches = deduplicateRecords(filterActiveRecords(state.batches, 'batches', 'code'), 'code');
  state.staff = deduplicateRecords(filterActiveRecords(state.staff, 'staff', 'id'), 'id', s => {
    const p = (s.phone || '').replace(/\D/g, '').slice(-10);
    return p.length >= 10 ? `STAFF_PHONE_${p}` : s.email ? `STAFF_EMAIL_${s.email.toLowerCase().trim()}` : undefined;
  });
  state.courses = deduplicateRecords(filterActiveRecords(state.courses, 'courses', 'id'), 'id', c => {
    return c.name ? `COURSE_${c.name.toLowerCase().trim()}` : undefined;
  });

  // Ensure every course & nested syllabus lecture uses "Prasad Sir" instead of legacy placeholder instructors
  state.courses = state.courses.map(c => {
    const seedCourse = initial.courses.find(sc => sc.id === c.id || sc.name === c.name);
    const rawLectures = Array.isArray(c.lectures) ? c.lectures : (seedCourse?.lectures || []);
    return {
      ...c,
      code: c.code || c.id,
      status: c.status || 'Active',
      instructor: normalizeInstructorName(c.instructor || seedCourse?.instructor),
      syllabus: typeof c.syllabus === 'string' ? c.syllabus : (seedCourse?.syllabus || ''),
      lectures: rawLectures.map(l => ({
        ...l,
        instructor: normalizeInstructorName(l.instructor)
      }))
    };
  });

  // Persist normalized courses into canonical ssm_courses_data
  if (typeof window !== 'undefined' && Array.isArray(state.courses) && state.courses.length > 0) {
    safeLocalStorageSet(SSM_COURSES_DATA_KEY, JSON.stringify(state.courses));
  }

  // Normalize batch schedules and timetable lectures to "Prasad Sir"
  state.batches = state.batches.map(b => ({
    ...b,
    instructor: normalizeInstructorName(b.instructor)
  }));

  state.lectures = state.lectures.map(l => ({
    ...l,
    instructor: normalizeInstructorName(l.instructor)
  }));

  // Normalize staff directory: replace legacy faculty entries with a single "Prasad Sir" faculty record
  const seenPrasadStaff = new Set<string>();
  state.staff = state.staff
    .map(st => {
      const lowerName = (st.name || '').toLowerCase().trim();
      if (LEGACY_INSTRUCTOR_NAMES.has(lowerName) || lowerName === 'prasad sir') {
        return {
          ...st,
          name: 'Prasad Sir',
          role: st.id === 'STF-01' ? 'Founder & Lead Educator' : st.role || 'Founder & Lead Educator',
          email: st.email === 'vikram@srujaantrading.edu.in' || st.email === 'patil@srujaantrading.edu.in'
            ? 'prasad@srujaantrading.edu.in'
            : st.email
        };
      }
      return st;
    })
    .filter(st => {
      if (st.name === 'Prasad Sir') {
        if (seenPrasadStaff.has('prasad_sir')) return false;
        seenPrasadStaff.add('prasad_sir');
      }
      return true;
    });

  // Normalize lead counselor/faculty assignments
  state.leads = state.leads.map(l => ({
    ...l,
    staff: LEGACY_INSTRUCTOR_NAMES.has((l.staff || '').toLowerCase().trim()) ? 'Prasad Sir' : l.staff
  }));

  // Normalize activeActor
  if (!state.activeActor || state.activeActor.toLowerCase().includes('vikramaditya') || state.activeActor.toLowerCase().includes('patil')) {
    state.activeActor = 'Prasad Sir (Founder & Lead Educator)';
  }

  // Normalize study materials so legacy items have downloadable fileData & metadata
  state.materials = state.materials.map((m, idx) => {
    const seedMat = initial.materials[idx] || initial.materials[0];
    const matchCourse = state.courses.find(c => c.name === m.course || c.id === m.courseId);
    return {
      ...m,
      courseId: m.courseId || matchCourse?.id || 'CRS-01',
      fileType: m.fileType || 'PDF',
      fileSize: m.fileSize || '1.5 MB',
      fileName: m.fileName || `${m.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.txt`,
      fileData:
        m.fileData ||
        seedMat?.fileData ||
        'data:text/plain;charset=utf-8,' +
          encodeURIComponent(
            `SRUJAAN SHARE MARKET INSTITUTE\nTitle: ${m.title}\nCourse: ${m.course}\nFaculty: Prasad Sir\nSummary: ${m.summary}`
          ),
      uploadDate: m.uploadDate || today,
      batchAccess: m.batchAccess || 'All Batches'
    };
  });

  // Auto-normalize overdue status for unpaid milestones past their due date
  state.students.forEach(s => {
    (s.milestones || []).forEach(m => {
      if (m.status !== 'Paid' && m.dueDate && m.dueDate < today) {
        m.status = 'Overdue';
      }
    });
  });

  // Ensure state.settings exists, falling back to saved v2 settings or initial defaults if missing
  if (!state.settings || typeof state.settings !== 'object') {
    try {
      const rawSettings = typeof window !== 'undefined' ? localStorage.getItem('srujaan_system_settings_v2') : null;
      if (rawSettings) {
        const parsed = JSON.parse(rawSettings);
        if (parsed && typeof parsed === 'object') {
          state.settings = { ...initial.settings, ...parsed };
        }
      }
    } catch (e) {
      console.warn('Could not read srujaan_system_settings_v2:', e);
    }
    if (!state.settings || typeof state.settings !== 'object') {
      state.settings = { ...initial.settings };
    }
  } else {
    state.settings = { ...initial.settings, ...state.settings };
  }

  // Permanently enforce official certificate signatory & designation ("Prasad M Bhunje" / "Founder & Lead Educator, Srujaan Share Market Institute")
  const currentSigName = (state.settings.signatoryName || '').trim();
  if (!currentSigName || LEGACY_SIGNATORY_NAMES.has(currentSigName.toLowerCase())) {
    state.settings.signatoryName = 'Prasad M Bhunje';
  }
  const currentSigDesig = (state.settings.signatoryDesignation || '').trim();
  if (!currentSigDesig || LEGACY_SIGNATORY_DESIGNATIONS.has(currentSigDesig.toLowerCase())) {
    state.settings.signatoryDesignation = 'Founder & Lead Educator, Srujaan Share Market Institute';
  }
  if (typeof window !== 'undefined') {
    safeLocalStorageSet('srujaan_system_settings_v2', JSON.stringify(compactStateForLocalStorage(state).settings));
  }

  // Normalize issued certificates to "Prasad M Bhunje"
  if (Array.isArray(state.certificates)) {
    state.certificates = state.certificates.map(cert => ({
      ...cert,
      issuedBy:
        !cert.issuedBy || LEGACY_SIGNATORY_NAMES.has(cert.issuedBy.toLowerCase().trim())
          ? 'Prasad M Bhunje'
          : cert.issuedBy
    }));
  }

  // Purge any legacy hardcoded address/branch presets ("Shivajinagar Flagship Campus", "BR-01", etc.)
  if (Array.isArray(state.settings.branches)) {
    state.settings.branches = state.settings.branches
      .filter(
        b =>
          b &&
          !LEGACY_PRESET_BRANCH_IDS.has(b.id) &&
          !LEGACY_PRESET_BRANCH_NAMES.has(b.branchName || b.name) &&
          !LEGACY_PRESET_ADDRESSES.has((b.fullAddress || b.address || '').trim())
      )
      .map(b => ({
        ...b,
        name: b.branchName || b.name || 'Campus Branch',
        branchName: b.branchName || b.name || 'Campus Branch',
        address: b.fullAddress || b.address || '',
        fullAddress: b.fullAddress || b.address || '',
        isPrimary: Boolean(b.isDefault ?? b.isPrimary),
        isDefault: Boolean(b.isDefault ?? b.isPrimary)
      }));
  } else {
    state.settings.branches = [];
  }

  if (LEGACY_PRESET_ADDRESSES.has((state.settings.campusAddress || '').trim())) {
    state.settings.campusAddress = '';
    if (!state.settings.primaryAddress?.streetAddress) {
      state.settings.city = '';
      state.settings.district = '';
      state.settings.state = '';
      state.settings.pincode = '';
    }
  }

  if (!state.settings.primaryAddress) {
    state.settings.primaryAddress = {
      branchName: '',
      streetAddress: state.settings.campusAddress || '',
      landmark: state.settings.landmark || '',
      city: state.settings.city || '',
      district: state.settings.district || '',
      state: state.settings.state || '',
      pincode: state.settings.pincode || '',
      phone: state.settings.phone || '',
      whatsapp: state.settings.whatsappSupport || state.settings.phone || '',
      googleMapsUrl: state.settings.googleMapsUrl || '',
      fullFormattedAddress: state.settings.campusAddress || ''
    };
  }

  if (!state.settings.cloudConfig) {
    state.settings.cloudConfig = {
      provider: 'firebase',
      firebaseUrl: '',
      authToken: '',
      autoSyncIntervalMs: 120000,
      autoSaveSettings: true
    };
  }

  return state;
}

export async function saveStateToStorage(
  state: AppState,
  options?: { preserveTimestamp?: boolean }
): Promise<void> {
  const nowIso = new Date().toISOString();
  const resolvedIso =
    options?.preserveTimestamp && ((state as any).updatedAt || state.settings?.lastUpdated)
      ? String((state as any).updatedAt || state.settings?.lastUpdated)
      : nowIso;
  (state as any).updatedAt = resolvedIso;
  if (!options?.preserveTimestamp || !state.lastSavedAt) {
    state.lastSavedAt = resolvedIso;
  }
  normalizeLoadedState(state);
  const unifiedDB = syncWindowInstituteDB(state);

  // Compact single-copy localStorage mirror (full uncompacted state lives in IndexedDB)
  const compact = compactStateForLocalStorage(state);
  safeLocalStorageSet(CRM_DATA_KEY, JSON.stringify(compact));
  if (Array.isArray(state.students)) {
    safeLocalStorageSet('ssmi_students_v1', JSON.stringify(state.students));
  }
  if (compact.settings) {
    safeLocalStorageSet('srujaan_system_settings_v2', JSON.stringify(compact.settings));
  }
  if (Array.isArray(state.courses)) {
    safeLocalStorageSet(SSM_COURSES_DATA_KEY, JSON.stringify(state.courses));
  }

  // Asynchronous IndexedDB primary store
  if (!idbDatabase) {
    await initIndexedDb();
  }
  if (idbDatabase) {
    try {
      const tx = idbDatabase.transaction(['app_state_store'], 'readwrite');
      const store = tx.objectStore('app_state_store');
      store.put({ key: 'PRIMARY_STATE', value: state, updatedAt: resolvedIso });
      store.put({ key: 'UNIFIED_INSTITUTE_DB_V3', value: unifiedDB, updatedAt: resolvedIso });
    } catch (e) {
      console.warn('IndexedDB write error:', e);
    }
  }
}

let localWriteTimer: ReturnType<typeof setTimeout> | null = null;
let cloudSyncTimer: ReturnType<typeof setTimeout> | null = null;
let latestPendingState: AppState | null = null;

function flushLocalStorageWrite(stateToSave: AppState, timestamp: string) {
  (stateToSave as any).updatedAt = timestamp;
  (stateToSave as any).isSeedData = false;
  syncWindowInstituteDB(stateToSave);
  const compact = compactStateForLocalStorage(stateToSave);
  safeLocalStorageSet(CRM_DATA_KEY, JSON.stringify(compact));
  if (Array.isArray(stateToSave.students)) {
    safeLocalStorageSet('ssmi_students_v1', JSON.stringify(stateToSave.students));
  }
  if (Array.isArray(stateToSave.courses)) {
    safeLocalStorageSet(SSM_COURSES_DATA_KEY, JSON.stringify(stateToSave.courses));
  }
  if (compact.settings) {
    safeLocalStorageSet('srujaan_system_settings_v2', JSON.stringify(compact.settings));
  }

  // Asynchronous IndexedDB primary store
  Promise.resolve().then(async () => {
    try {
      if (!idbDatabase) await initIndexedDb();
      if (idbDatabase) {
        const tx = idbDatabase.transaction(['app_state_store'], 'readwrite');
        const store = tx.objectStore('app_state_store');
        store.put({ key: 'PRIMARY_STATE', value: stateToSave, updatedAt: timestamp });
        store.put({
          key: 'UNIFIED_INSTITUTE_DB_V3',
          value: syncWindowInstituteDB(stateToSave),
          updatedAt: timestamp
        });
      }
    } catch (err) {
      console.warn('IndexedDB write warning:', err);
    }
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (latestPendingState) {
      flushLocalStorageWrite(latestPendingState, new Date().toISOString());
      latestPendingState = null;
    }
  });
}

/**
 * Unified Non-Blocking Auto-Save Data Handler:
 * 1. Updates optimistic in-memory cache in 0ms (zero main-thread lockup).
 * 2. Batches localStorage & IndexedDB serialization off the keystroke path.
 * 3. Debounces Firebase Firestore & Cloud Server sync (600ms) silently in the background.
 */
export async function autoSaveData(
  updatedData: AppState,
  userId = 'institute_master_data'
): Promise<AppState> {
  const timestamp = new Date().toISOString();
  const nextState: AppState = {
    ...updatedData,
    lastSavedAt: timestamp,
    settings: {
      ...(updatedData.settings || ({} as any)),
      lastUpdated: timestamp
    }
  };
  (nextState as any).updatedAt = timestamp;
  (nextState as any).isSeedData = false;
  (nextState as any).deviceId = getLocalDeviceId();

  latestPendingState = nextState;
  setPendingOfflineWritesCount(1);

  // Schedule non-blocking Tier 1 LocalStorage + IndexedDB write (50ms micro-batch)
  if (localWriteTimer) {
    clearTimeout(localWriteTimer);
  }
  localWriteTimer = setTimeout(() => {
    localWriteTimer = null;
    const target = latestPendingState || nextState;
    flushLocalStorageWrite(target, timestamp);
  }, 50);

  // Schedule non-blocking Tier 2 Cloud & Firestore Sync (900ms coalesced debounce, single unified pass)
  if (cloudSyncTimer) {
    clearTimeout(cloudSyncTimer);
  }
  cloudSyncTimer = setTimeout(async () => {
    cloudSyncTimer = null;
    const target = latestPendingState || nextState;
    latestPendingState = null;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setPendingOfflineWritesCount(1);
      return;
    }
    try {
      await dualWriteToCloud(target, { interactiveAuth: false, skipPreFetch: false });
    } catch (err) {
      console.warn('Coalesced auto-save cloud sync warning:', err);
    }
  }, 900);

  return nextState;
}

/**
 * Helper to merge two arrays of records by a key ('id' or 'code'),
 * preferring the incoming record while preserving existing nested fields like milestones if missing.
 */
function mergeRecordArrays<T extends Record<string, any>>(
  localArr: T[],
  remoteArr: T[],
  keyField: string = 'id',
  preferLocal: boolean = false
): T[] {
  const map = new Map<string, T>();
  const baseArr = preferLocal ? remoteArr : localArr;
  const incomingArr = preferLocal ? localArr : remoteArr;

  (baseArr || []).forEach(item => {
    if (item && item[keyField]) {
      map.set(String(item[keyField]), item);
    }
  });

  (incomingArr || []).forEach(item => {
    if (item && item[keyField]) {
      const k = String(item[keyField]);
      const existing = map.get(k);
      if (!existing) {
        map.set(k, item);
      } else {
        const merged: any = { ...existing, ...item };
        if (
          Array.isArray(existing.milestones) &&
          existing.milestones.length > 0 &&
          (!Array.isArray(item.milestones) || item.milestones.length === 0)
        ) {
          merged.milestones = existing.milestones;
        }
        map.set(k, merged);
      }
    }
  });

  return Array.from(map.values());
}

/**
 * Instant Local Snapshot Save (`localStorage` + `IndexedDB` + `srujaan_master_db`)
 */
export async function saveLocalSnapshotToStorage(
  state: AppState
): Promise<{ timestamp: string; recordCount: number }> {
  const nowIso = new Date().toISOString();
  const formattedTime = new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  state.lastSavedAt = nowIso;
  state.lastManualBackupAt = new Date().toLocaleString('en-IN', { hour12: false });
  await saveStateToStorage(state);
  syncWindowInstituteDB(state);
  return {
    timestamp: formattedTime,
    recordCount:
      (state.students?.length || 0) +
      (state.leads?.length || 0) +
      (state.courses?.length || 0) +
      (state.staff?.length || 0)
  };
}

/**
 * Safe fetch wrapper with an enforced AbortController timeout (default 10s).
 * Prevents network calls from hanging indefinitely and freezing backup/sync UI spinners.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs: number = 10000
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(id);
  }
}

/**
 * Dual-Write Cloud Engine:
 * Simultaneously persists state to:
 * 1. Local Storage & IndexedDB (`window.instituteDB` v3.0.0 & `srujaan_master_db`)
 * 2. Online Cloud Run Server (`/api/cloud/state`)
 * 3. Custom Firebase Realtime DB / REST Endpoint (`settings.cloudConfig.firebaseUrl` -> `srujaan_main_store.json`)
 * 4. Firebase Cloud Firestore (`ai-studio-srujaansharemark-...`)
 *
 * When `options.isOverwrite` is false (default Push Update), performs a non-destructive merge
 * with remote data before pushing so other devices' additions are never lost.
 * When `options.isOverwrite` is true (Overwrite Cloud), force-pushes current local state directly.
 */
let activeDualWritePromise: Promise<{
  ok: boolean;
  channels: string[];
  timestamp: string;
  message: string;
  state: AppState;
}> | null = null;

export async function dualWriteToCloud(
  state: AppState,
  options?: { interactiveAuth?: boolean; isOverwrite?: boolean; skipPreFetch?: boolean }
): Promise<{ ok: boolean; channels: string[]; timestamp: string; message: string; state: AppState }> {
  // Single-flight mutex: if a cloud write is already in progress, wait for it to finish before running
  if (activeDualWritePromise) {
    try {
      await activeDualWritePromise;
    } catch {
      // ignore previous failure
    }
  }

  const runSync = async (): Promise<{
    ok: boolean;
    channels: string[];
    timestamp: string;
    message: string;
    state: AppState;
  }> => {
    const isOverwrite = Boolean(options?.isOverwrite);
    const skipPreFetch = Boolean(options?.skipPreFetch);
    const timestamp = new Date().toISOString();
    let baseState: AppState = state;

    if (isOverwrite) {
      createLocalSafetyBackup(state, 'pre_overwrite_cloud');
    }

    // When not explicitly overwriting and not an incremental autoSave, pre-merge with remote Firestore so records added/edited on another device are never lost
    if (!isOverwrite && !skipPreFetch && (typeof navigator === 'undefined' || navigator.onLine)) {
      try {
        const [remoteMaster, remoteSubStudents, remoteSubLeads] = await Promise.all([
          fetchMasterSnapshotFromFirestore('institute_master_data'),
          fetchStudentsFromFirestore(),
          fetchLeadsFromFirestore()
        ]);
        const canonicalSnapshot = Number((remoteMaster as any)?.syncSchemaVersion || 0) >= 2;
        const cloudMasterStudents = Array.isArray(remoteMaster?.students) ? remoteMaster!.students : [];
        const allRemoteStudents = canonicalSnapshot
          ? cloudMasterStudents
          : mergeStudentsSafely(cloudMasterStudents, remoteSubStudents as any[]);
        // Use canonical cloud state as the source of truth; record timestamps resolve genuine concurrent edits.
        const mergedStudents = mergeStudentsSafely(state.students || [], allRemoteStudents);

        const cloudMasterLeads = Array.isArray(remoteMaster?.leads) ? remoteMaster!.leads : [];
        const allRemoteLeads = canonicalSnapshot
          ? cloudMasterLeads
          : mergeRecordsByKeySafely(cloudMasterLeads, remoteSubLeads as any[], 'id', 'leads');
        const mergedLeads = mergeRecordsByKeySafely(state.leads || [], allRemoteLeads, 'id', 'leads');

        const mergedBatches = Array.isArray(remoteMaster?.batches)
          ? mergeRecordsByKeySafely(state.batches || [], remoteMaster!.batches, 'code', 'batches')
          : state.batches;
        const mergedCourses = Array.isArray(remoteMaster?.courses)
          ? mergeRecordsByKeySafely(state.courses || [], remoteMaster!.courses, 'id', 'courses')
          : state.courses;
        const mergedStaff = Array.isArray(remoteMaster?.staff)
          ? mergeRecordsByKeySafely(state.staff || [], remoteMaster!.staff, 'id', 'staff')
          : state.staff;
        const mergedAttendance = remoteMaster?.attendance
          ? mergeAttendanceSafely(state.attendance || {}, remoteMaster.attendance)
          : state.attendance;

        baseState = {
          ...state,
          students: mergedStudents,
          leads: mergedLeads,
          batches: mergedBatches,
          courses: mergedCourses,
          staff: mergedStaff,
          attendance: mergedAttendance
        };
      } catch (preMergeErr) {
        console.warn('Pre-push cloud merge check warning:', preMergeErr);
      }
    }

    const stateToPush: AppState = normalizeLoadedState({
      ...baseState,
      lastSavedAt: timestamp,
      settings: {
        ...(baseState.settings || ({} as any)),
        lastUpdated: timestamp
      }
    });
    (stateToPush as any).updatedAt = timestamp;
    (stateToPush as any).isSeedData = false;
    (stateToPush as any).deviceId = getLocalDeviceId();
    stateToPush.lastSavedAt = timestamp;

    await saveStateToStorage(stateToPush, { preserveTimestamp: true });
    const unifiedDB = syncWindowInstituteDB(stateToPush);
    const channels: string[] = ['Local Cache'];

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setPendingOfflineWritesCount(1);
      return {
        ok: true,
        channels,
        timestamp,
        state: stateToPush,
        message: 'Saved locally (Offline Mode — queued for automatic online sync).'
      };
    }

    setSyncEngineWorking(true);
    try {
      // Run Cloud Server mirror, optional RTDB mirror, and Firebase Firestore sync in parallel so total duration is fast (< 2s)
      const serverPromise = (async () => {
        try {
          const resp = await fetchWithTimeout(
            '/api/cloud/state',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ state: stateToPush, instituteDB: unifiedDB, isOverwrite: true })
            },
            8000
          );
          const contentType = (resp.headers.get('content-type') || '').toLowerCase();
          if (resp.ok && contentType.includes('application/json')) {
            channels.push('Cloud Server');
            recordCloudWriteSuccess();
          }
        } catch (err) {
          console.warn('Online server mirror warning:', err);
        }
      })();

      const rtdbPromise = (async () => {
        const customUrl = stateToPush.settings?.cloudConfig?.firebaseUrl?.trim();
        if (customUrl && /^https?:\/\//i.test(customUrl)) {
          try {
            const base = customUrl.replace(/\/+$/, '').replace(/\/(srujaan_main_store|instituteDB)\.json$/i, '');
            const tokenParam = stateToPush.settings?.cloudConfig?.authToken
              ? `?auth=${encodeURIComponent(stateToPush.settings.cloudConfig.authToken)}`
              : '';
            const payloadToPut = {
              ...unifiedDB,
              updatedAt: timestamp,
              lastModified: timestamp,
              payload: stateToPush
            };
            const [mainResp] = await Promise.all([
              fetchWithTimeout(
                `${base}/srujaan_main_store.json${tokenParam}`,
                {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payloadToPut)
                },
                8000
              ),
              fetchWithTimeout(
                `${base}/instituteDB.json${tokenParam}`,
                {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payloadToPut)
                },
                8000
              ).catch(() => null)
            ]);
            if (mainResp && mainResp.ok) {
              channels.push('Firebase RTDB');
            }
          } catch (err) {
            console.warn('Custom Firebase REST sync warning:', err);
          }
        }
      })();

      const firestorePromise = (async () => {
        try {
          if (options?.interactiveAuth && !auth.currentUser) {
            await signInWithGoogle();
          }
          const synced = await syncFullStateToFirestore(stateToPush, isOverwrite);
          if (synced) {
            channels.push('Firebase Firestore');
          }
        } catch (err) {
          console.warn('Firebase Firestore sync notice:', err);
        }
      })();

      await Promise.all([serverPromise, rtdbPromise, firestorePromise]);
    } finally {
      setSyncEngineWorking(false);
    }

    return {
      ok: true,
      channels,
      timestamp,
      state: stateToPush,
      message: `${isOverwrite ? 'Force-overwrote' : 'Pushed synchronized state to'}: ${channels.join(' + ')}`
    };
  };

  activeDualWritePromise = runSync();
  try {
    return await activeDualWritePromise;
  } finally {
    activeDualWritePromise = null;
  }
}

/**
 * Master Fetch from Cloud:
 * Pulls the latest active state from Firestore `institutes/srujaan_share_market_pune` (and `institute_master_data`),
 * Firestore sub-collections (`students` and `leads`), Custom Firebase RTDB URL, and Online Server,
 * performing Last-Write-Wins conflict resolution by `updatedAt` so newer cloud records overwrite stale local cache.
 */
export async function masterFetchFromCloud(
  currentState: AppState,
  options?: { interactiveAuth?: boolean; onLoginHydrate?: boolean }
): Promise<{
  state: AppState;
  source: string;
  timestamp: string;
  updated: boolean;
  newCount: number;
  updatedCount: number;
}> {
  const timestamp = new Date().toISOString();
  const isLocalSeed = Boolean((currentState as any).isSeedData);

  const prevStudentsMap = new Map<string, any>();
  (currentState.students || []).forEach((s) => {
    if (s && s.id) prevStudentsMap.set(String(s.id), s);
  });
  const prevLeadsMap = new Map<string, any>();
  (currentState.leads || []).forEach((l) => {
    if (l && l.id) prevLeadsMap.set(String(l.id), l);
  });

  let mergedState: AppState = normalizeLoadedState({ ...currentState });
  const sourcesUsed: string[] = [];
  let updated = false;
  let authoritativeCloudApplied = false;
  let newCount = 0;
  let updatedCount = 0;

  setSyncEngineWorking(true);
  // 1. Check Authoritative Firebase Cloud Firestore FIRST (`institutes/srujaan_share_market_pune` + collections)
  try {
    if (options?.interactiveAuth && !auth.currentUser) {
      try {
        await signInWithGoogle();
      } catch {
        // Proceed with non-interactive fetch if popup closed
      }
    }

    // Always fetch master doc + students collection + leads collection + settings in parallel
    const [masterDoc, remoteStudents, remoteLeads, remoteSettings] = await Promise.all([
      fetchMasterInstituteFromFirestore('institute_master_data'),
      fetchStudentsFromFirestore(),
      fetchLeadsFromFirestore(),
      fetchSettingsFromFirestore()
    ]);

    const needAuxCollections = !masterDoc || !Array.isArray(masterDoc.batches);
    const [remoteBatches, remoteStaff, remoteCourses] = needAuxCollections
      ? await Promise.all([
          fetchBatchesFromFirestore(),
          fetchStaffFromFirestore(),
          fetchCoursesFromFirestore()
        ])
      : [[], [], []];

    const canonicalSnapshot = Boolean(masterDoc && Number((masterDoc as any).syncSchemaVersion || 0) >= 2);
    // Once the canonical full-state snapshot exists, it is authoritative. Older per-collection
    // mirrors are retained for backwards compatibility but must not resurrect stale records.
    const cleanSubStudents = canonicalSnapshot ? [] : filterActiveRecords(remoteStudents as any[], 'students', 'id');
    const cleanSubLeads = canonicalSnapshot ? [] : filterActiveRecords(remoteLeads as any[], 'leads', 'id');
    const cleanSubBatches = canonicalSnapshot ? [] : filterActiveRecords(remoteBatches as any[], 'batches', 'code');
    const cleanSubStaff = canonicalSnapshot ? [] : filterActiveRecords(remoteStaff as any[], 'staff', 'id');
    const cleanSubCourses = canonicalSnapshot ? [] : filterActiveRecords(remoteCourses as any[], 'courses', 'id');

    if (masterDoc) {
      const remotePayload = masterDoc.payload ? masterDoc.payload : masterDoc;
      const remoteTimeStr = String(
        masterDoc.updatedAt ||
          remotePayload.updatedAt ||
          masterDoc.lastSavedAt ||
          remotePayload.settings?.lastUpdated ||
          ''
      );

      const masterStudents = Array.isArray(remotePayload.students)
        ? filterActiveRecords<AppState['students'][number]>(remotePayload.students, 'students', 'id')
        : [];
      const masterLeads = Array.isArray(remotePayload.leads)
        ? filterActiveRecords<AppState['leads'][number]>(remotePayload.leads, 'leads', 'id')
        : [];
      const masterBatches = Array.isArray(remotePayload.batches)
        ? filterActiveRecords<AppState['batches'][number]>(remotePayload.batches, 'batches', 'code')
        : [];
      const masterStaff = Array.isArray(remotePayload.staff)
        ? filterActiveRecords<AppState['staff'][number]>(remotePayload.staff, 'staff', 'id')
        : [];
      const masterCourses = Array.isArray(remotePayload.courses)
        ? filterActiveRecords<Course>(remotePayload.courses, 'courses', 'id')
        : [];

      // Combine masterDoc + sub-collections using Last-Write-Wins by updatedAt (sub-collections passed second so latest per-doc writes win)
      const cloudMergedStudents = mergeStudentsSafely(masterStudents, cleanSubStudents);
      const combinedCloudStudents = canonicalSnapshot || isLocalSeed
        ? cloudMergedStudents
        : mergeStudentsSafely(mergedState.students || [], cloudMergedStudents);

      const cloudMergedLeads = mergeRecordsByKeySafely(masterLeads, cleanSubLeads, 'id', 'leads');
      const combinedCloudLeads = canonicalSnapshot || isLocalSeed
        ? cloudMergedLeads
        : mergeRecordsByKeySafely(mergedState.leads || [], cloudMergedLeads, 'id', 'leads');

      const cloudMergedBatches = mergeRecordsByKeySafely(masterBatches, cleanSubBatches, 'code', 'batches');
      const combinedCloudBatches = canonicalSnapshot || isLocalSeed
        ? cloudMergedBatches
        : mergeRecordsByKeySafely(mergedState.batches || [], cloudMergedBatches, 'code', 'batches');

      const cloudMergedStaff = mergeRecordsByKeySafely(masterStaff, cleanSubStaff, 'id', 'staff');
      const combinedCloudStaff = canonicalSnapshot || isLocalSeed
        ? cloudMergedStaff
        : mergeRecordsByKeySafely(mergedState.staff || [], cloudMergedStaff, 'id', 'staff');

      const cloudMergedCourses = mergeRecordsByKeySafely(masterCourses, cleanSubCourses, 'id', 'courses');
      const combinedCloudCourses = canonicalSnapshot || isLocalSeed
        ? cloudMergedCourses
        : mergeRecordsByKeySafely(mergedState.courses || [], cloudMergedCourses, 'id', 'courses');

      const combinedAttendance = canonicalSnapshot
        ? (remotePayload.attendance || {})
        : mergeAttendanceSafely(mergedState.attendance || {}, remotePayload.attendance || {});

      mergedState = normalizeLoadedState({
        ...mergedState,
        ...remotePayload,
        students: combinedCloudStudents,
        leads: combinedCloudLeads,
        batches: combinedCloudBatches,
        staff: canonicalSnapshot ? combinedCloudStaff : combinedCloudStaff.length > 0 ? combinedCloudStaff : mergedState.staff,
        courses: canonicalSnapshot ? combinedCloudCourses : combinedCloudCourses.length > 0 ? combinedCloudCourses : mergedState.courses,
        materials: Array.isArray(remotePayload.materials || remotePayload.studyMaterials)
          ? canonicalSnapshot
            ? (remotePayload.materials || remotePayload.studyMaterials)
            : mergeRecordsByKeySafely(mergedState.materials || [], remotePayload.materials || remotePayload.studyMaterials, 'id')
          : mergedState.materials,
        lectures: Array.isArray(remotePayload.lectures)
          ? canonicalSnapshot ? remotePayload.lectures : mergeRecordsByKeySafely(mergedState.lectures || [], remotePayload.lectures, 'id')
          : mergedState.lectures,
        attendance: combinedAttendance,
        attendanceHistory: Array.isArray(remotePayload.attendanceHistory)
          ? canonicalSnapshot ? remotePayload.attendanceHistory : mergeRecordsByKeySafely(mergedState.attendanceHistory || [], remotePayload.attendanceHistory, 'id')
          : mergedState.attendanceHistory,
        certificates: Array.isArray(remotePayload.certificates)
          ? canonicalSnapshot ? remotePayload.certificates : mergeRecordsByKeySafely(mergedState.certificates || [], remotePayload.certificates, 'id')
          : mergedState.certificates,
        dailyQueue: Array.isArray(remotePayload.dailyQueue)
          ? remotePayload.dailyQueue
          : mergedState.dailyQueue,
        settings: canonicalSnapshot
          ? { ...(remotePayload.settings || {}) }
          : { ...mergedState.settings, ...(remoteSettings || {}), ...(remotePayload.settings || {}) }
      });
      (mergedState as any).updatedAt = remoteTimeStr || timestamp;
      (mergedState as any).isSeedData = false;
      authoritativeCloudApplied = true;
      updated = true;
      sourcesUsed.push('Firebase Firestore');
    } else if (
      cleanSubStudents.length > 0 ||
      cleanSubLeads.length > 0 ||
      cleanSubBatches.length > 0 ||
      cleanSubCourses.length > 0 ||
      remoteSettings
    ) {
      mergedState = normalizeLoadedState({
        ...mergedState,
        students:
          cleanSubStudents.length > 0
            ? isLocalSeed
              ? cleanSubStudents
              : mergeStudentsSafely(mergedState.students || [], cleanSubStudents)
            : mergedState.students,
        leads:
          cleanSubLeads.length > 0
            ? isLocalSeed
              ? cleanSubLeads
              : mergeRecordsByKeySafely(mergedState.leads || [], cleanSubLeads, 'id', 'leads')
            : mergedState.leads,
        batches:
          cleanSubBatches.length > 0
            ? mergeRecordsByKeySafely(mergedState.batches || [], cleanSubBatches, 'code', 'batches')
            : mergedState.batches,
        staff:
          cleanSubStaff.length > 0
            ? mergeRecordsByKeySafely(mergedState.staff || [], cleanSubStaff, 'id', 'staff')
            : mergedState.staff,
        courses:
          cleanSubCourses.length > 0
            ? mergeRecordsByKeySafely(mergedState.courses || [], cleanSubCourses, 'id', 'courses')
            : mergedState.courses,
        settings: remoteSettings
          ? { ...mergedState.settings, ...remoteSettings }
          : mergedState.settings
      });
      (mergedState as any).updatedAt = timestamp;
      (mergedState as any).isSeedData = false;
      authoritativeCloudApplied = true;
      updated = true;
      sourcesUsed.push('Firebase Firestore');
    }
  } catch (err) {
    console.warn('Firestore fetch warning:', err);
  }

  // Firestore canonical workspace is the sole source of truth.
  // A separately configured RTDB mirror is write-only and must never override Firestore data.

  // 3. Check Online Cloud Run Server (/api/cloud/state) as fallback if Firestore was unreachable
  if (!authoritativeCloudApplied) {
    try {
      const resp = await fetchWithTimeout('/api/cloud/state', {}, 10000);
      const contentType = (resp.headers.get('content-type') || '').toLowerCase();
      if (resp.ok && contentType.includes('application/json')) {
        const data = await resp.json();
        if (data?.state && Array.isArray(data.state.students)) {
          const remoteState = data.state as AppState;
          const cleanStudents = filterActiveRecords(remoteState.students, 'students', 'id');
          const cleanLeads = filterActiveRecords(remoteState.leads || [], 'leads', 'id');
          const cleanStaff = filterActiveRecords(remoteState.staff || [], 'staff', 'id');
          const cleanCourses = filterActiveRecords(remoteState.courses || [], 'courses', 'id');
          const cleanBatches = filterActiveRecords(remoteState.batches || [], 'batches', 'code');

          mergedState = normalizeLoadedState({
            ...mergedState,
            ...remoteState,
            students: isLocalSeed ? cleanStudents : mergeStudentsSafely(mergedState.students || [], cleanStudents),
            leads: isLocalSeed ? cleanLeads : mergeRecordsByKeySafely(mergedState.leads || [], cleanLeads, 'id', 'leads'),
            staff: cleanStaff.length > 0 ? cleanStaff : mergedState.staff,
            courses: cleanCourses.length > 0 ? cleanCourses : mergedState.courses,
            batches: cleanBatches,
            settings: {
              ...mergedState.settings,
              ...(remoteState.settings || {})
            }
          });
          (mergedState as any).isSeedData = false;
          sourcesUsed.push('Cloud Server');
          updated = true;
          recordCloudReadSuccess();
        }
      }
    } catch (err) {
      console.warn('Error fetching from online server mirror:', err);
    }
  }

  mergedState = normalizeLoadedState(mergedState);
  mergedState.lastCloudSyncAt = new Date().toLocaleString('en-IN', { hour12: false });
  mergedState.syncQueue = (mergedState.syncQueue || []).map(q => ({
    ...q,
    status: 'Synced with Cloud'
  }));

  // Calculate exact count of new and updated records across students and leads
  const stripMeta = (obj: any) => {
    if (!obj) return '';
    const c = { ...obj };
    delete c.serverUpdatedAt;
    delete c.syncStatus;
    return JSON.stringify(c);
  };

  (mergedState.students || []).forEach((s) => {
    const prev = prevStudentsMap.get(String(s.id));
    if (!prev) {
      newCount++;
    } else if (stripMeta(prev) !== stripMeta(s)) {
      updatedCount++;
    }
  });

  (mergedState.leads || []).forEach((l) => {
    const prev = prevLeadsMap.get(String(l.id));
    if (!prev) {
      newCount++;
    } else if (stripMeta(prev) !== stripMeta(l)) {
      updatedCount++;
    }
  });

  if (updated || newCount > 0 || updatedCount > 0) {
    updated = true;
    await saveStateToStorage(mergedState, { preserveTimestamp: true });
    if (typeof window !== 'undefined') {
      safeLocalStorageSet('ssmi_students_v1', JSON.stringify(mergedState.students));
    }
    console.log(
      `[Sync Engine] Cloud fetch applied: ${mergedState.students.length} students, ${mergedState.leads.length} leads (${newCount} new, ${updatedCount} updated)`
    );
  }

  setSyncEngineWorking(false);
  return {
    state: mergedState,
    source: sourcesUsed.length > 0 ? sourcesUsed.join(' + ') : 'Local Mirror Verified',
    timestamp,
    updated,
    newCount,
    updatedCount
  };
}

/**
 * Sets up a safe Server-Sent Events (SSE) real-time listener on Firebase Realtime Database
 * (`${firebaseUrl}/srujaan_main_store.json`) if configured by the user.
 * Silently closes on error so zero console errors occur when not configured.
 */
export function setupFirebaseSseListener(
  firebaseUrl: string | undefined,
  authToken: string | undefined,
  onRemoteState: (remotePayload: any) => void
): () => void {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
    return () => {};
  }
  const clean = (firebaseUrl || '').trim();
  if (!clean || !/^https?:\/\//i.test(clean)) {
    return () => {};
  }

  try {
    const base = clean.replace(/\/+$/, '').replace(/\/(srujaan_main_store|instituteDB)\.json$/i, '');
    const tokenParam = authToken ? `?auth=${encodeURIComponent(authToken)}` : '';
    const sse = new EventSource(`${base}/srujaan_main_store.json${tokenParam}`);

    const handlePut = (event: MessageEvent) => {
      try {
        const packet = JSON.parse(event.data);
        const remoteData = packet?.data;
        if (remoteData && (remoteData.payload || Array.isArray(remoteData.students))) {
          onRemoteState(remoteData.payload || remoteData);
        }
      } catch {
        // Ignore malformed SSE packets
      }
    };

    sse.addEventListener('put', handlePut as EventListener);
    sse.onerror = () => {
      sse.close();
    };

    return () => {
      sse.removeEventListener('put', handlePut as EventListener);
      sse.close();
    };
  } catch {
    return () => {};
  }
}

export async function checkStorageQuota(state: AppState): Promise<StorageQuotaInfo> {
  let usedKb = 120;
  let quotaMb = 2048; // default 2GB browser storage allowance
  let usagePercent = 0.5;
  let isLowStorage = false;

  try {
    const jsonStr = JSON.stringify(state);
    const bytes = new Blob([jsonStr]).size;
    usedKb = Math.round(bytes / 1024);

    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      if (estimate.quota) {
        quotaMb = Math.round(estimate.quota / (1024 * 1024));
      }
      if (estimate.usage && estimate.quota) {
        const usageBytes = estimate.usage;
        const quotaBytes = estimate.quota;
        usagePercent = Number(((usageBytes / quotaBytes) * 100).toFixed(1));
        const freeMb = (quotaBytes - usageBytes) / (1024 * 1024);
        if (usagePercent > 80 || freeMb < 50) {
          isLowStorage = true;
        }
      }
    }
  } catch (e) {
    console.warn('Storage quota estimate error:', e);
  }

  return { usedKb, quotaMb, usagePercent, isLowStorage };
}

// 1. Generate & download complete Master Backup JSON file (`srujaan_master_backup_[DATE].json`)
export function exportMasterBackup(state?: AppState) {
  const allData = state || loadOfflineData();
  allData.lastManualBackupAt = new Date().toLocaleString('en-IN', { hour12: false });
  saveStateToStorage(allData);

  const totalLectures = (allData.courses || []).reduce((acc, c) => acc + (c.lectures?.length || 0), 0);
  const totalFeeRecords = (allData.students || []).reduce((acc, s) => acc + (s.milestones?.length || 0), 0);
  const activeAddr = getActiveInstituteAddress(allData.settings);

  const backupPayload = {
    metadata: {
      appName: 'Srujaan Share Market Institute Management System CRM',
      version: '3.0.0',
      exportDate: new Date().toISOString(),
      exportedBy: getCurrentActorEmail(),
      institute: {
        name: allData.settings?.instituteName || 'Srujaan Share Market Institute',
        address: activeAddr.fullAddress,
        phone: activeAddr.phone || allData.settings?.phone || '',
        email: allData.settings?.email || '',
        gstin: allData.settings?.gstin || ''
      },
      recordCounts: {
        students: allData.students?.length || 0,
        batches: allData.batches?.length || 0,
        courses: allData.courses?.length || 0,
        lectures: totalLectures,
        studyMaterials: allData.materials?.length || 0,
        leads: allData.leads?.length || 0,
        staff: allData.staff?.length || 0,
        certificates: allData.certificates?.length || 0,
        feeRecords: totalFeeRecords
      }
    },
    lastModified: new Date().toISOString(),
    payload: allData
  };

  const blob = new Blob([JSON.stringify(backupPayload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const downloadAnchor = document.createElement('a');
  const dateStr = new Date().toISOString().split('T')[0];
  downloadAnchor.href = url;
  downloadAnchor.download = `srujaan_master_backup_${dateStr}.json`;
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  document.body.removeChild(downloadAnchor);
  URL.revokeObjectURL(url);
}

// Full JSON Backup Export (backward compatibility)
export function downloadBackupJson(state: AppState) {
  exportMasterBackup(state);
}

// 2. Restore entire database from a chosen backup file (Tier 4 Master Restore: updates Local + Cloud Firestore immediately)
export function importMasterBackup(
  file: File,
  onComplete: (success: boolean, message: string, restoredState?: AppState) => void
) {
  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const parsed = JSON.parse(event.target?.result as string);
      const dataToRestore = parsed.payload ? parsed.payload : parsed;

      // Validate essential schema
      if (!dataToRestore || (!dataToRestore.institute && !dataToRestore.students && !dataToRestore.settings)) {
        throw new Error('Invalid backup structure. The file must contain students, institute details, or settings.');
      }

      // Clear tombstones for any records included in the restored backup
      if (Array.isArray(dataToRestore.students)) {
        dataToRestore.students.forEach((s: any) => s?.id && unmarkDeletedId('students', String(s.id)));
      }
      if (Array.isArray(dataToRestore.leads)) {
        dataToRestore.leads.forEach((l: any) => l?.id && unmarkDeletedId('leads', String(l.id)));
      }
      if (Array.isArray(dataToRestore.batches)) {
        dataToRestore.batches.forEach((b: any) => b?.code && unmarkDeletedId('batches', String(b.code)));
      }
      if (Array.isArray(dataToRestore.staff)) {
        dataToRestore.staff.forEach((st: any) => st?.id && unmarkDeletedId('staff', String(st.id)));
      }
      if (Array.isArray(dataToRestore.courses)) {
        dataToRestore.courses.forEach((c: any) => c?.id && unmarkDeletedId('courses', String(c.id)));
      }

      const nowIso = new Date().toISOString();
      const normalized = normalizeLoadedState({
        ...dataToRestore,
        lastSavedAt: nowIso,
        settings: {
          ...(dataToRestore.settings || {}),
          lastUpdated: nowIso
        }
      });
      (normalized as any).updatedAt = nowIso;
      (normalized as any).isSeedData = false;
      (normalized as any).deviceId = getLocalDeviceId();

      // 1. Write immediately to LocalStorage + IndexedDB
      await saveStateToStorage(normalized, { preserveTimestamp: true });

      // 2. Immediately execute setDoc(doc(db, 'institutes', 'institute_master_data'), parsedData, { merge: true })
      await restoreJsonToFirestoreMaster(normalized);
      await autoSaveToFirestoreMaster(normalized, 'institute_master_data');
      await dualWriteToCloud(normalized, { interactiveAuth: false, isOverwrite: true });

      if (onComplete) {
        onComplete(
          true,
          'Database restored successfully and synchronized to Cloud Firestore across all devices!',
          normalized
        );
      }
    } catch (err: any) {
      console.error('Backup restoration failed:', err);
      if (onComplete) onComplete(false, err?.message || 'Backup restoration failed.');
    }
  };
  reader.readAsText(file);
}

// 5-Tab Master Excel (.xlsx) Export
export function exportMasterExcelFile(state: AppState) {
  // @ts-ignore
  if (typeof window !== 'undefined' && window.XLSX) {
    // @ts-ignore
    const XLSX = window.XLSX;
    const wb = XLSX.utils.book_new();

    // 1. Students Sheet
    const studentsRows = state.students.map(s => {
      const paid = (s.milestones || []).filter(m => m.status === 'Paid').reduce((a, b) => a + b.amount, 0);
      return {
        Student_ID: s.regId,
        Full_Name: s.name,
        Phone: s.phone,
        WhatsApp: s.whatsapp,
        Email: s.email,
        Course: s.course,
        Batch: s.batch || 'Unassigned',
        Status: s.status,
        Enrollment_Date: s.enrollDate,
        Gross_Fee: s.grossFee,
        Discount: s.discount,
        Net_Fee: s.netFee,
        Paid_Amount: paid,
        Pending_Balance: Math.max(0, s.netFee - paid),
        Notes: s.notes
      };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(studentsRows), 'Students');

    // 2. Leads Sheet
    const leadsRows = state.leads.map(l => ({
      Lead_ID: l.id,
      Name: l.name,
      Phone: l.phone,
      Email: l.email,
      Locality: l.locality,
      Course_Interest: l.course,
      Stage: l.stage,
      Intent: l.intent,
      FollowUp_Date: l.followUpDate,
      Source: l.source,
      Mode: l.mode,
      Staff: l.staff,
      Objection: l.objection,
      Notes: l.notes
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(leadsRows), 'Leads CRM');

    // 3. Batches Sheet
    const batchesRows = state.batches.map(b => ({
      Batch_Code: b.code,
      Batch_Name: b.name,
      Course: b.course,
      Mode: b.mode,
      Instructor: b.instructor,
      Schedule: b.schedule,
      Capacity: b.capacity,
      Status: b.status
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(batchesRows), 'Batches');

    // 4. Fee Milestones Sheet
    const feeRows: any[] = [];
    state.students.forEach(s => {
      (s.milestones || []).forEach(m => {
        feeRows.push({
          Student_ID: s.regId,
          Student_Name: s.name,
          Batch: s.batch || 'Unassigned',
          Milestone: m.name,
          Amount: m.amount,
          Due_Date: m.dueDate,
          Status: m.status,
          Payment_Date: m.paymentDate || '',
          Mode: m.mode || '',
          Ref_UTR: m.ref || ''
        });
      });
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(feeRows), 'Fees & Milestones');

    // 5. Audit Trail Sheet
    const auditRows = state.auditLogs.map(a => ({
      Timestamp: a.timestamp,
      Category: a.category,
      Action: a.action,
      Record_ID: a.recordId,
      Actor: a.actor,
      Details: a.details
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(auditRows), 'Audit Log');

    XLSX.writeFile(wb, `Srujaan_Institute_Master_${LIVE_TODAY_ISO}.xlsx`);
  } else {
    // Fallback: CSV export
    exportCsvFile(state, 'students');
  }
}

// Single Module CSV Export
export function exportCsvFile(state: AppState, moduleName: 'students' | 'leads' | 'attendance' | 'fees') {
  let rows: any[] = [];
  if (moduleName === 'students') {
    rows = state.students.map(s => {
      const paid = (s.milestones || []).filter(m => m.status === 'Paid').reduce((a, b) => a + b.amount, 0);
      return {
        Student_ID: s.regId,
        Name: s.name,
        Phone: s.phone,
        WhatsApp: s.whatsapp,
        Course: s.course,
        Batch: s.batch || 'Unassigned',
        Status: s.status,
        Enroll_Date: s.enrollDate,
        Net_Fee: s.netFee,
        Paid: paid,
        Balance: Math.max(0, s.netFee - paid)
      };
    });
  } else if (moduleName === 'leads') {
    rows = state.leads.map(l => ({
      Lead_ID: l.id,
      Name: l.name,
      Phone: l.phone,
      Course: l.course,
      Stage: l.stage,
      Intent: l.intent,
      FollowUp: l.followUpDate,
      Source: l.source
    }));
  } else if (moduleName === 'fees') {
    state.students.forEach(s => {
      (s.milestones || []).forEach(m => {
        rows.push({
          Student: s.name,
          ID: s.regId,
          Milestone: m.name,
          Amount: m.amount,
          Due: m.dueDate,
          Status: m.status,
          Paid_Date: m.paymentDate || ''
        });
      });
    });
  }

  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  rows.forEach(r => {
    lines.push(headers.map(h => `"${String(r[h] || '').replace(/"/g, '""')}"`).join(','));
  });
  const csvContent = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Srujaan_${moduleName}_${LIVE_TODAY_ISO}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
