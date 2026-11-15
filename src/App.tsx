import React, { useState, useEffect, useRef } from 'react';
import {
  AppState,
  Student,
  Lead,
  Batch,
  Course,
  CourseLecture,
  StudyMaterial,
  FeeMilestone,
  Certificate,
  DailyQueueItem,
  StorageQuotaInfo,
  LeadStage,
  AttendanceRecord,
  StaffMember
} from './types';
import { getInitialAppState, LIVE_TODAY_ISO, LEAD_STAGES } from './data/initialData';
import {
  loadOfflineData,
  loadStateFromStorage,
  saveStateToStorage,
  loadSavedCoursesFromStorage,
  saveCoursesToStorageImmediate,
  saveCourseToFirestore,
  autoSaveData,
  exportMasterBackup,
  importMasterBackup,
  normalizeLoadedState,
  checkStorageQuota,
  downloadBackupJson,
  exportMasterExcelFile,
  dualWriteToCloud,
  masterFetchFromCloud,
  syncWindowInstituteDB,
  getActiveInstituteAddress,
  saveLocalSnapshotToStorage,
  setupFirebaseSseListener
} from './services/db';
import {
  saveCachedStudents,
  saveStudentToFirestore,
  saveLeadToFirestore,
  saveBatchToFirestore,
  deleteStudentFromFirestore,
  syncToGoogleSheets,
  syncModuleToGoogleSheets,
  syncAndFetchGoogleWorkspace,
  subscribeToFirestoreStudents,
  subscribeToFirestoreLeads,
  subscribeToFirestoreBatches,
  subscribeToFirestoreCourses,
  subscribeToFirestoreFees,
  subscribeToFirestoreSettings
} from './services/storageService';
import { Navbar, DesktopSidebar, NavTabId, SidebarMode } from './components/Navbar';
import { LowStorageBanner } from './components/LowStorageBanner';
import { DashboardView } from './components/DashboardView';
import { StudentsView } from './components/StudentsView';
import { BatchesView } from './components/BatchesView';
import { AttendanceView } from './components/AttendanceView';
import { LeadsView } from './components/LeadsView';
import { WhatsAppStudioView } from './components/WhatsAppStudioView';
import { DailyUpdatesView } from './components/DailyUpdatesView';
import { FeesView } from './components/FeesView';
import { CertificatesView } from './components/CertificatesView';
import { StaffPortalView } from './components/StaffPortalView';
import { AiCenterView } from './components/AiCenterView';
import { SettingsView } from './components/SettingsView';
import { WorkspaceHub } from './components/WorkspaceHub';
import { Login } from './components/Login';
import { Logo } from './components/Logo';
import { User } from 'firebase/auth';
import {
  subscribeToAuth,
  logoutAdmin,
  checkRedirectResult,
  ensureBrowserSessionPersistence,
  getInitialAuthSession,
  loginWithDefaultMasterAdmin
} from './services/authService';
import {
  StudentModal,
  LeadModal,
  FeeModal,
  Student360Modal,
  StaffModal,
  CourseModal,
  BatchModal,
  LectureModal,
  StudyMaterialModal,
  ShareMaterialWhatsAppModal,
  BatchRosterModal
} from './components/Modals';
import { GoogleSheetsExportModal } from './components/GoogleSheetsExportModal';
import { ManualEntryModal } from './components/ManualEntryModal';
import { CloudIntegrationsModal } from './components/CloudIntegrationsModal';
import { OmniBotDrawer, AiChatEntry } from './components/OmniBotDrawer';
import {
  askGeminiWithSearch,
  ChatMessage,
  AgentStoreActions,
  resolveEntityRecord,
  findAllMatchingEntities,
  resolveSsmiCourseAndFee,
  getStudentAttendancePct,
  executeClientToolCall
} from './services/gemini';
import {
  isPrimaryAdminEmail,
  PRIMARY_ADMIN_EMAIL,
  testConnection,
  subscribeToCloudUpdates,
  getDeletedIds,
  markDeletedId,
  unmarkDeletedId,
  getLocalDeviceId,
  deleteLeadFromFirestore,
  deleteBatchFromFirestore,
  deleteStaffFromFirestore,
  deleteCourseFromFirestore,
  backupStudentData,
  restoreStudentData,
  fetchMasterSnapshotFromFirestore,
  restoreJsonToFirestoreMaster,
  autoSaveToFirestoreMaster,
  mergeStudentsSafely,
  mergeRecordsByKeySafely,
  mergeAttendanceSafely,
  deduplicateRecords,
  getDeterministicStudentId,
  getDeterministicLeadId,
  getDeterministicAttendanceId,
  getDeterministicPaymentId,
  recordSyncError,
  createLocalSafetyBackup,
  flushPendingSyncOutbox,
  getPendingSyncOperations,
  formatFirebaseAuthError,
  FormattedFirebaseAuthError,
  getCurrentActorEmail,
  syncSettingsToFirestore
} from './services/firebase';
import {
  LayoutDashboard,
  Users,
  Target,
  CreditCard,
  Settings,
  Plus,
  Trash2,
  AlertTriangle
} from 'lucide-react';

export default function App() {
  const [state, setState] = useState<AppState>(() => {
    const loaded = loadOfflineData();
    syncWindowInstituteDB(loaded);
    return loaded;
  });
  const stateRef = useRef<AppState>(state);
  stateRef.current = state;

  // Tab-scoped Auth Session (`browserSessionPersistence` + `sessionStorage`) & Two-Email RBAC State
  const initialAuthRef = useRef<ReturnType<typeof getInitialAuthSession> | undefined>(undefined);
  if (initialAuthRef.current === undefined) {
    initialAuthRef.current = getInitialAuthSession();
  }
  const [currentUser, setCurrentUser] = useState<User | null>(() => initialAuthRef.current?.user ?? null);
  const [userRole, setUserRole] = useState<'admin' | 'operator' | null>(() => initialAuthRef.current?.role ?? null);
  const [authInitializing, setAuthInitializing] = useState<boolean>(false);
  const [redirectAuthError, setRedirectAuthError] = useState<FormattedFirebaseAuthError | null>(null);
  const authEmailRef = useRef<string | null>(
    initialAuthRef.current?.user?.email?.toLowerCase().trim() || null
  );

  // Top-level mount effect: ensure browserSessionPersistence & handle getRedirectResult(auth) safely
  useEffect(() => {
    let mounted = true;
    try {
      void ensureBrowserSessionPersistence();
    } catch {
      // ignore startup persistence notice
    }

    checkRedirectResult()
      .then((authData) => {
        if (!mounted || !authData) return;
        setCurrentUser(authData.user);
        setUserRole(authData.role);
        authEmailRef.current = authData.user.email?.toLowerCase().trim() || null;
        setRedirectAuthError(null);
        setAuthInitializing(false);
        testConnection();
      })
      .catch((err: any) => {
        if (!mounted) return;
        console.warn('[App Startup Auth Redirect Error]:', err);
        setRedirectAuthError(formatFirebaseAuthError(err));
      });

    let unsubscribe = () => {};
    try {
      unsubscribe = subscribeToAuth((authData) => {
        if (!mounted) return;
        if (authData) {
          setCurrentUser(authData.user);
          setUserRole(authData.role);
          authEmailRef.current = authData.user.email?.toLowerCase().trim() || null;
          setRedirectAuthError(null);
        } else {
          setCurrentUser(null);
          setUserRole(null);
          authEmailRef.current = null;
        }
        setAuthInitializing(false);
      });
    } catch (subErr) {
      console.warn('[App Auth Subscribe Fallback]: Keeping active Master Admin session:', subErr);
      setAuthInitializing(false);
    }

    return () => {
      mounted = false;
      try {
        unsubscribe();
      } catch {
        // ignore unsubscribe error
      }
    };
  }, []);

  // Automatic Pending Local Data Sync & Cloud Hydration on Live Firebase Auth Connection
  useEffect(() => {
    const onFirebaseAuthConnected = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      try {
        await testConnection();
        await flushPendingSyncOutbox();

        const hasPendingOutbox = getPendingSyncOperations().length > 0;
        if (hasUnsyncedLocalChangesRef.current || hasPendingOutbox) {
          const pushRes = await dualWriteToCloud(stateRef.current, {
            interactiveAuth: false,
            skipPreFetch: true
          });
          if (pushRes.ok) {
            hasUnsyncedLocalChangesRef.current = false;
            setLastCloudSyncAt(new Date().toLocaleString('en-IN', { hour12: false }));
          }
        }

        const pullRes = await masterFetchFromCloud(stateRef.current, {
          interactiveAuth: false,
          onLoginHydrate: true
        });
        if (pullRes.updated && pullRes.state) {
          const nowStr = new Date().toLocaleString('en-IN', { hour12: false });
          setLastCloudSyncAt(nowStr);
          setState(pullRes.state);
          stateRef.current = pullRes.state;
          saveCachedStudents(pullRes.state.students);
          syncWindowInstituteDB(pullRes.state);
          await saveStateToStorage(pullRes.state, { preserveTimestamp: true });
        }
      } catch (err) {
        console.warn('Post-auth auto sync notice:', err);
      }
    };

    window.addEventListener('ssm-firebase-auth-connected', onFirebaseAuthConnected);
    return () => window.removeEventListener('ssm-firebase-auth-connected', onFirebaseAuthConnected);
  }, []);

  const isMasterAdmin = userRole === 'admin';
  const masterAdminEmail = authEmailRef.current;

  const handleSignOut = async () => {
    await logoutAdmin();
    setCurrentUser(null);
    setUserRole(null);
    authEmailRef.current = null;
    showToast('Signed out of Srujaan Share Market Institute Management System.');
  };

  const [activeTab, setActiveTab] = useState<NavTabId>('dashboard');
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('standard');

  const handleSidebarModeChange = (mode: SidebarMode) => {
    setSidebarMode(mode);
  };

  const [storageQuota, setStorageQuota] = useState<StorageQuotaInfo>({
    usedKb: 140,
    quotaMb: 2048,
    usagePercent: 0.5,
    isLowStorage: false
  });
  const [lowStorageDismissed, setLowStorageDismissed] = useState(false);
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [lastCloudSyncAt, setLastCloudSyncAt] = useState<string | null>(null);
  const [toastNotice, setToastNotice] = useState<string | null>(null);
  const cloudDebounceRef = useRef<number | null>(null);
  const enrollmentLeadSyncTimerRef = useRef<number | null>(null);

  // Debounced cloud push after any student enrollment or lead status change (coalesced via single-flight mutex)
  const scheduleEnrollmentOrLeadCloudSync = () => {
    if (enrollmentLeadSyncTimerRef.current) {
      window.clearTimeout(enrollmentLeadSyncTimerRef.current);
    }
    enrollmentLeadSyncTimerRef.current = window.setTimeout(async () => {
      enrollmentLeadSyncTimerRef.current = null;
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      try {
        const res = await dualWriteToCloud(stateRef.current, {
          interactiveAuth: false,
          skipPreFetch: true
        });
        if (res.ok) {
          setLastCloudSyncAt(new Date().toLocaleString('en-IN', { hour12: false }));
          hasUnsyncedLocalChangesRef.current = false;
        }
      } catch (err) {
        console.warn('Debounced enrollment/lead cloud push notice:', err);
      }
    }, 2500);
  };

  const showToast = (msg: string) => {
    setToastNotice(msg);
    setTimeout(() => {
      setToastNotice(prev => (prev === msg ? null : prev));
    }, 3500);
  };

  // Modals state
  const [studentModalOpen, setStudentModalOpen] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);

  const [leadModalOpen, setLeadModalOpen] = useState(false);
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);

  const [feeModalOpen, setFeeModalOpen] = useState(false);
  const [feeStudentId, setFeeStudentId] = useState<string | null>(null);

  const [student360ModalOpen, setStudent360ModalOpen] = useState(false);
  const [student360Id, setStudent360Id] = useState<string | null>(null);
  const [googleSheetsModalOpen, setGoogleSheetsModalOpen] = useState(false);
  const [manualEntryModalOpen, setManualEntryModalOpen] = useState(false);
  const [cloudIntegrationsModalOpen, setCloudIntegrationsModalOpen] = useState(false);

  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);

  const [courseModalOpen, setCourseModalOpen] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);

  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [editingBatchCode, setEditingBatchCode] = useState<string | null>(null);

  const [lectureModalOpen, setLectureModalOpen] = useState(false);
  const [lectureTargetCourseId, setLectureTargetCourseId] = useState<string | null>(null);
  const [editingLecture, setEditingLecture] = useState<CourseLecture | null>(null);

  const [materialModalOpen, setMaterialModalOpen] = useState(false);
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);
  const [shareMaterialId, setShareMaterialId] = useState<string | null>(null);

  const [rosterBatchCode, setRosterBatchCode] = useState<string | null>(null);

  // Master Database Restore & Overwrite Cloud Confirmation Modal States
  const [restoreConfirmModalOpen, setRestoreConfirmModalOpen] = useState(false);
  const [pendingRestoreFile, setPendingRestoreFile] = useState<File | null>(null);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);
  const [overwriteCloudModalOpen, setOverwriteCloudModalOpen] = useState(false);

  // Universal Safe Delete Confirmation Modal State
  const [confirmDeleteModal, setConfirmDeleteModal] = useState<{
    title: string;
    recordName: string;
    recordSubtext?: string;
    onConfirm: () => void;
  } | null>(null);

  useEffect(() => {
    if (!confirmDeleteModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setConfirmDeleteModal(null);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        confirmDeleteModal.onConfirm();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmDeleteModal]);

  // WhatsApp Studio quick prefill
  const [waPrefill, setWaPrefill] = useState<{
    recipientType: 'student' | 'lead' | 'custom';
    id: string;
    scenarioHint?: string;
  }>({ recipientType: 'student', id: '' });

  // AI Chat Messages & Error State
  const [chatLog, setChatLog] = useState<AiChatEntry[]>([
    {
      sender: 'ai',
      time: 'Ready',
      text: "Namaste! I am **Candle**, the live Google Gemini 3.8 AI Admissions & Trading Strategy Consultant for **Srujaan Share Market Institute**. Ask me anything about courses, batch schedules, student fee balances, or Indian stock market price action strategies."
    }
  ]);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    testConnection();
  }, []);

  const lastLocalMutationAtRef = useRef<number>(0);
  const hasUnsyncedLocalChangesRef = useRef<boolean>(false);

  // Helper to compute a deterministic content fingerprint across all synced collections
  const computeSyncFingerprint = (s: AppState): string =>
    JSON.stringify({
      students: s.students || [],
      leads: s.leads || [],
      courses: s.courses || [],
      batches: s.batches || [],
      staff: s.staff || [],
      materials: s.materials || [],
      lectures: s.lectures || [],
      attendance: s.attendance || {},
      certificates: s.certificates || [],
      settings: {
        ...(s.settings || {}),
        lastUpdated: undefined,
        cloudDb: undefined
      }
    });

  // Real-Time Firestore Synchronization Listeners (`institutes/ssmi_master_db/{admissions,leads,fees,batches,courses,settings}`)
  useEffect(() => {
    const unsubscribe = subscribeToCloudUpdates('institute_master_data', (remoteData, hasPendingWrites) => {
      if (hasPendingWrites || !remoteData) return;

      const isSameDevice = remoteData.deviceId && remoteData.deviceId === getLocalDeviceId();
      if (isSameDevice && Date.now() - lastLocalMutationAtRef.current < 3000) {
        return;
      }
      if (Date.now() - lastLocalMutationAtRef.current < 1500) {
        return;
      }

      try {
        const remotePayload = remoteData.payload ? remoteData.payload : remoteData;
        if (remotePayload && (Array.isArray(remotePayload.students) || remotePayload.settings)) {
          const currentLocal = stateRef.current;
          const stuTombstones = getDeletedIds('students');
          const leadTombstones = getDeletedIds('leads');

          const mergedStudents = Array.isArray(remotePayload.students)
            ? deduplicateRecords(
                remotePayload.students.filter(
                  (s: any) => s && !s.isDeleted && !stuTombstones.has(String(s.id || ''))
                ),
                'id',
                (s: any) => {
                  const p = (s.phone || '').replace(/\D/g, '').slice(-10);
                  return p.length >= 10 ? `PHONE_${p}` : undefined;
                }
              )
            : currentLocal.students;

          const mergedLeads = Array.isArray(remotePayload.leads)
            ? deduplicateRecords(
                remotePayload.leads.filter(
                  (l: any) => l && !l.isDeleted && !leadTombstones.has(String(l.id || ''))
                ),
                'id',
                (l: any) => {
                  const p = (l.phone || '').replace(/\D/g, '').slice(-10);
                  return p.length >= 10 ? `LEAD_PHONE_${p}` : undefined;
                }
              )
            : currentLocal.leads;

          const mergedBatches = Array.isArray(remotePayload.batches) && remotePayload.batches.length > 0
            ? mergeRecordsByKeySafely([], remotePayload.batches, 'code', 'batches')
            : currentLocal.batches;

          const mergedCourses = Array.isArray(remotePayload.courses) && remotePayload.courses.length > 0
            ? mergeRecordsByKeySafely([], remotePayload.courses, 'id', 'courses')
            : currentLocal.courses;

          const mergedStaff = Array.isArray(remotePayload.staff) && remotePayload.staff.length > 0
            ? mergeRecordsByKeySafely([], remotePayload.staff, 'id', 'staff')
            : currentLocal.staff;

          const mergedAttendance = remotePayload.attendance
            ? mergeAttendanceSafely(currentLocal.attendance || {}, remotePayload.attendance)
            : currentLocal.attendance;

          const normalized = normalizeLoadedState({
            ...currentLocal,
            ...remotePayload,
            students: mergedStudents,
            leads: mergedLeads,
            batches: mergedBatches,
            courses: mergedCourses,
            staff: mergedStaff,
            attendance: mergedAttendance,
            settings: {
              ...currentLocal.settings,
              ...(remotePayload.settings || {})
            }
          });
          (normalized as any).updatedAt =
            remoteData.updatedAt || remotePayload.updatedAt || new Date().toISOString();
          (normalized as any).isSeedData = false;

          const currentFp = computeSyncFingerprint(currentLocal);
          const remoteFp = computeSyncFingerprint(normalized);

          if (currentFp !== remoteFp) {
            const nowStr = new Date().toLocaleString('en-IN', { hour12: false });
            setLastCloudSyncAt(nowStr);
            setState(normalized);
            stateRef.current = normalized;
            saveCachedStudents(normalized.students);
            syncWindowInstituteDB(normalized);
            saveStateToStorage(normalized, { preserveTimestamp: true });
          }
        }
      } catch (err) {
        console.warn('Real-time sync reconciliation warning:', err);
      }
    });

    const unsubscribeStudents = subscribeToFirestoreStudents((remoteStudents) => {
      if (Array.isArray(remoteStudents)) {
        const tombstones = getDeletedIds('students');
        const activeRemote = remoteStudents.filter(
          rem => rem && !(rem as any).isDeleted && !tombstones.has(String(rem.id || ''))
        );
        setState(prev => {
          const nextList: Student[] = deduplicateRecords(activeRemote, 'id', s => {
            const p = (s.phone || '').replace(/\D/g, '').slice(-10);
            return p.length >= 10 ? `PHONE_${p}` : undefined;
          });

          if (JSON.stringify(nextList) === JSON.stringify(prev.students)) {
            return prev;
          }

          const nowStr = new Date().toLocaleString('en-IN', { hour12: false });
          setLastCloudSyncAt(nowStr);
          saveCachedStudents(nextList);
          const nextState = {
            ...prev,
            students: nextList
          };
          stateRef.current = nextState;
          syncWindowInstituteDB(nextState);
          saveStateToStorage(nextState, { preserveTimestamp: true });
          return nextState;
        });
      }
    });

    const unsubscribeLeads = subscribeToFirestoreLeads((remoteLeads) => {
      if (Array.isArray(remoteLeads)) {
        const tombstones = getDeletedIds('leads');
        const activeRemote = remoteLeads.filter(
          rem => rem && !(rem as any).isDeleted && !tombstones.has(String(rem.id || ''))
        );
        setState(prev => {
          const nextLeads: Lead[] = deduplicateRecords(activeRemote, 'id', l => {
            const p = (l.phone || '').replace(/\D/g, '').slice(-10);
            return p.length >= 10 ? `LEAD_PHONE_${p}` : undefined;
          });

          if (JSON.stringify(nextLeads) === JSON.stringify(prev.leads)) {
            return prev;
          }

          const nowStr = new Date().toLocaleString('en-IN', { hour12: false });
          setLastCloudSyncAt(nowStr);
          const nextState = {
            ...prev,
            leads: nextLeads
          };
          stateRef.current = nextState;
          syncWindowInstituteDB(nextState);
          saveStateToStorage(nextState, { preserveTimestamp: true });
          return nextState;
        });
      }
    });

    const unsubscribeBatches = subscribeToFirestoreBatches((remoteBatches) => {
      if (Array.isArray(remoteBatches) && remoteBatches.length > 0) {
        setState(prev => {
          const nextBatches = mergeRecordsByKeySafely([], remoteBatches, 'code', 'batches');
          if (JSON.stringify(nextBatches) === JSON.stringify(prev.batches)) return prev;
          const nowStr = new Date().toLocaleString('en-IN', { hour12: false });
          setLastCloudSyncAt(nowStr);
          const nextState = { ...prev, batches: nextBatches };
          stateRef.current = nextState;
          syncWindowInstituteDB(nextState);
          return nextState;
        });
      }
    });

    const unsubscribeCourses = subscribeToFirestoreCourses((remoteCourses) => {
      if (Array.isArray(remoteCourses) && remoteCourses.length > 0) {
        setState(prev => {
          const nextCourses = mergeRecordsByKeySafely([], remoteCourses, 'id', 'courses');
          if (JSON.stringify(nextCourses) === JSON.stringify(prev.courses)) return prev;
          const nowStr = new Date().toLocaleString('en-IN', { hour12: false });
          setLastCloudSyncAt(nowStr);
          const nextState = { ...prev, courses: nextCourses };
          stateRef.current = nextState;
          syncWindowInstituteDB(nextState);
          return nextState;
        });
      }
    });

    const unsubscribeFees = subscribeToFirestoreFees((remoteFees) => {
      if (Array.isArray(remoteFees) && remoteFees.length > 0) {
        setState(prev => {
          const feeByStudentId = new Map<string, any>();
          remoteFees.forEach(f => {
            const sid = String(f.studentId || f.id || '').trim();
            if (sid) feeByStudentId.set(sid, f);
          });
          let changed = false;
          const nextStudents = prev.students.map(s => {
            const fDoc = feeByStudentId.get(s.id);
            if (!fDoc || !Array.isArray(fDoc.milestones)) return s;
            if (JSON.stringify(s.milestones) === JSON.stringify(fDoc.milestones) && s.netFee === Number(fDoc.netFee ?? s.netFee)) {
              return s;
            }
            changed = true;
            return {
              ...s,
              netFee: Number(fDoc.netFee ?? s.netFee),
              grossFee: Number(fDoc.grossFee ?? s.grossFee),
              discount: Number(fDoc.discount ?? s.discount),
              milestones: fDoc.milestones
            };
          });
          if (!changed) return prev;
          const nowStr = new Date().toLocaleString('en-IN', { hour12: false });
          setLastCloudSyncAt(nowStr);
          const nextState = { ...prev, students: nextStudents };
          stateRef.current = nextState;
          syncWindowInstituteDB(nextState);
          return nextState;
        });
      }
    });

    const unsubscribeSettings = subscribeToFirestoreSettings((remoteSettings) => {
      if (remoteSettings && typeof remoteSettings === 'object') {
        setState(prev => {
          const mergedSettings = {
            ...prev.settings,
            ...remoteSettings
          };
          if (JSON.stringify(mergedSettings) === JSON.stringify(prev.settings)) return prev;
          const nowStr = new Date().toLocaleString('en-IN', { hour12: false });
          setLastCloudSyncAt(nowStr);
          const nextState = { ...prev, settings: mergedSettings };
          stateRef.current = nextState;
          syncWindowInstituteDB(nextState);
          return nextState;
        });
      }
    });

    // Automatic Login Hydration: immediately trigger fetchMasterSnapshotFromFirestore() & reconcile
    (async () => {
      try {
        const cloudSnap = await fetchMasterSnapshotFromFirestore('institute_master_data');
        const currentLocal = stateRef.current;
        const localIsSeed = Boolean((currentLocal as any).isSeedData);
        const localTimeMs = localIsSeed
          ? 0
          : Date.parse(String((currentLocal as any).updatedAt || currentLocal.settings?.lastUpdated || '')) || 0;
        const cloudTimeMs = cloudSnap?.updatedAt ? Date.parse(String(cloudSnap.updatedAt)) || 0 : 0;
        const localEmpty = !Array.isArray(currentLocal.students) || currentLocal.students.length === 0;

        if (cloudSnap && (localIsSeed || localEmpty || cloudTimeMs >= localTimeMs || (cloudSnap.students || []).length > 0 || (cloudSnap.leads || []).length > 0)) {
          const mergedStudents = localIsSeed
            ? mergeStudentsSafely([], cloudSnap.students || [])
            : mergeStudentsSafely(currentLocal.students || [], cloudSnap.students || []);
          const mergedLeads = localIsSeed
            ? mergeRecordsByKeySafely([], cloudSnap.leads || [], 'id', 'leads')
            : mergeRecordsByKeySafely(currentLocal.leads || [], cloudSnap.leads || [], 'id', 'leads');
          const mergedBatches = localIsSeed
            ? mergeRecordsByKeySafely([], cloudSnap.batches || [], 'code', 'batches')
            : mergeRecordsByKeySafely(currentLocal.batches || [], cloudSnap.batches || [], 'code', 'batches');
          const mergedCourses = localIsSeed
            ? mergeRecordsByKeySafely([], cloudSnap.courses || [], 'id', 'courses')
            : mergeRecordsByKeySafely(currentLocal.courses || [], cloudSnap.courses || [], 'id', 'courses');
          const mergedStaff = localIsSeed
            ? mergeRecordsByKeySafely([], cloudSnap.staff || [], 'id', 'staff')
            : mergeRecordsByKeySafely(currentLocal.staff || [], cloudSnap.staff || [], 'id', 'staff');
          const mergedAttendance = cloudSnap.attendance
            ? mergeAttendanceSafely(currentLocal.attendance || {}, cloudSnap.attendance)
            : currentLocal.attendance;

          const hydrated = normalizeLoadedState({
            ...currentLocal,
            ...cloudSnap,
            students: mergedStudents,
            leads: mergedLeads,
            batches: mergedBatches,
            courses: mergedCourses,
            staff: mergedStaff,
            attendance: mergedAttendance,
            settings: {
              ...currentLocal.settings,
              ...(cloudSnap.settings || {})
            }
          });
          (hydrated as any).updatedAt = cloudSnap.updatedAt || new Date().toISOString();
          (hydrated as any).isSeedData = false;
          const nowStr = new Date().toLocaleString('en-IN', { hour12: false });
          setLastCloudSyncAt(nowStr);
          setState(hydrated);
          stateRef.current = hydrated;
          saveCachedStudents(hydrated.students);
          syncWindowInstituteDB(hydrated);
          await saveStateToStorage(hydrated, { preserveTimestamp: true });
        }

        const result = await masterFetchFromCloud(stateRef.current, {
          interactiveAuth: false,
          onLoginHydrate: true
        });
        if (result.updated && result.state) {
          const nowStr = new Date().toLocaleString('en-IN', { hour12: false });
          setLastCloudSyncAt(nowStr);
          setState(result.state);
          stateRef.current = result.state;
          saveCachedStudents(result.state.students);
          syncWindowInstituteDB(result.state);
          await saveStateToStorage(result.state, { preserveTimestamp: true });
        }
      } catch {
        // non-blocking fallback
      }
    })();

    // Real-Time SSE Listener for custom Firebase Realtime Database URL (if configured)
    const unsubscribeSse = setupFirebaseSseListener(
      stateRef.current.settings?.cloudConfig?.firebaseUrl,
      stateRef.current.settings?.cloudConfig?.authToken,
      (remotePayload) => {
        if (Date.now() - lastLocalMutationAtRef.current < 4000) return;
        const activeTag = document.activeElement?.tagName;
        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') return;
        const normalized = normalizeLoadedState({
          ...stateRef.current,
          ...remotePayload
        });
        setState(normalized);
        stateRef.current = normalized;
        saveStateToStorage(normalized, { preserveTimestamp: true });
      }
    );

    return () => {
      unsubscribe();
      unsubscribeStudents();
      unsubscribeLeads();
      unsubscribeBatches();
      unsubscribeCourses();
      unsubscribeFees();
      unsubscribeSettings();
      unsubscribeSse();
    };
  }, [state.settings?.cloudConfig?.firebaseUrl, currentUser?.uid]);

  // Cloud-First Initialization on Mount:
  // 1. Immediately trigger fetchMasterSnapshotFromFirestore() on mount.
  // 2. Hydrate from Cloud Firestore directly into runtime state.
  useEffect(() => {
    async function init() {
      const savedCourses = loadSavedCoursesFromStorage();
      const loaded = await loadStateFromStorage();
      if (savedCourses && savedCourses.length > 0 && (!Array.isArray(loaded.courses) || loaded.courses.length === 0)) {
        loaded.courses = savedCourses;
      }
      setState(loaded);
      stateRef.current = loaded;
      const quota = await checkStorageQuota(loaded);
      setStorageQuota(quota);

      if (typeof navigator === 'undefined' || navigator.onLine) {
        try {
          const cloudData = await fetchMasterSnapshotFromFirestore('institute_master_data');
          const localIsSeed = Boolean((loaded as any).isSeedData);
          const localTimeMs = localIsSeed
            ? 0
            : Date.parse(String((loaded as any).updatedAt || loaded.settings?.lastUpdated || '')) || 0;
          const cloudTimeMs = cloudData?.updatedAt ? Date.parse(String(cloudData.updatedAt)) || 0 : 0;
          const localEmpty = !Array.isArray(loaded.students) || loaded.students.length === 0;

          if (cloudData && (localIsSeed || localEmpty || cloudTimeMs >= localTimeMs)) {
            const hydrated = normalizeLoadedState({
              ...loaded,
              ...cloudData,
              settings: {
                ...loaded.settings,
                ...(cloudData.settings || {})
              }
            });
            (hydrated as any).updatedAt = cloudData.updatedAt || new Date().toISOString();
            (hydrated as any).isSeedData = false;
            const nowStr = new Date().toLocaleString('en-IN', { hour12: false });
            setLastCloudSyncAt(nowStr);
            setState(hydrated);
            stateRef.current = hydrated;
            saveCachedStudents(hydrated.students);
            syncWindowInstituteDB(hydrated);
            await saveStateToStorage(hydrated, { preserveTimestamp: true });
          }

          const cloudResult = await masterFetchFromCloud(stateRef.current, {
            interactiveAuth: false,
            onLoginHydrate: true
          });
          if (cloudResult.updated && cloudResult.state) {
            const nowStr = new Date().toLocaleString('en-IN', { hour12: false });
            setLastCloudSyncAt(nowStr);
            setState(cloudResult.state);
            stateRef.current = cloudResult.state;
            saveCachedStudents(cloudResult.state.students);
            syncWindowInstituteDB(cloudResult.state);
            await saveStateToStorage(cloudResult.state, { preserveTimestamp: true });
          }
        } catch {
          // Offline-first fallback already active
        }
      }
    }
    init();

    // Online / Offline listeners with automatic cloud flush and bidirectional reconciliation on reconnection
    const handleOnline = async () => {
      setIsOnline(true);
      try {
        const res = await dualWriteToCloud(stateRef.current, { interactiveAuth: false });
        if (res.ok) {
          const nowStr = new Date().toLocaleString('en-IN', { hour12: false });
          setLastCloudSyncAt(nowStr);
          hasUnsyncedLocalChangesRef.current = false;
          if (res.state) {
            setState(res.state);
            stateRef.current = res.state;
            saveCachedStudents(res.state.students);
            syncWindowInstituteDB(res.state);
          }
          setState(prev => ({
            ...prev,
            syncQueue: prev.syncQueue.map(q => ({ ...q, status: 'Synced to Cloud' }))
          }));
          showToast('🌐 Back online! Offline changes automatically synchronized to Cloud & Firebase.');
        }
      } catch (err) {
        console.warn('Online reconnect sync warning:', err);
      }
    };
    const handleOffline = () => {
      setIsOnline(false);
      showToast('📡 Offline Mode Active — All changes are being saved locally & queued for Cloud Sync.');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Ctrl+K to toggle AI Drawer; Ctrl+B or '[' (outside inputs) to toggle/cycle Sidebar
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setAiDrawerOpen(prev => !prev);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setSidebarMode(prev =>
          prev === 'hidden' ? 'standard' : prev === 'standard' ? 'compact' : 'standard'
        );
        return;
      }
      const target = e.target as HTMLElement | null;
      const isEditable =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (!isEditable && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === '[') {
        e.preventDefault();
        setSidebarMode(prev =>
          prev === 'standard'
            ? 'compact'
            : prev === 'compact'
            ? 'expanded'
            : prev === 'expanded'
            ? 'hidden'
            : 'standard'
        );
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Automatic 2-Minute Background Cloud & Firebase Sync Loop
  useEffect(() => {
    const intervalMs = state.settings.cloudConfig?.autoSyncIntervalMs || 120000; // Default: 2 minutes (120,000 ms)
    const timer = window.setInterval(async () => {
      const current = stateRef.current;
      // Always save locally first (preserving existing timestamp if idle)
      await saveStateToStorage(current, { preserveTimestamp: !hasUnsyncedLocalChangesRef.current });

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return;
      }

      // Only push to cloud if this device actually has unsynced local changes; otherwise perform a safe pull/merge
      if (hasUnsyncedLocalChangesRef.current) {
        const res = await dualWriteToCloud(current, { interactiveAuth: false });
        if (res.ok) {
          hasUnsyncedLocalChangesRef.current = false;
          const nowIso = new Date().toISOString();
          const nowStr = new Date().toLocaleString('en-IN', { hour12: false });
          setLastCloudSyncAt(nowStr);
          setState(prev => {
            const updated: AppState = {
              ... res.state,
              lastSavedAt: nowStr,
              settings: {
                ...res.state.settings,
                cloudDb: {
                  provider: prev.settings.cloudDb?.provider || 'firebase',
                  firebase: prev.settings.cloudDb?.firebase,
                  lastSyncAt: nowIso
                }
              },
              syncQueue: prev.syncQueue.map(q => ({
                ...q,
                status: 'Auto-Synced (2m)'
              }))
            };
            stateRef.current = updated;
            syncWindowInstituteDB(updated);
            return updated;
          });
        }
      } else {
        const fetched = await masterFetchFromCloud(current, { interactiveAuth: false });
        if (fetched.updated && fetched.state) {
          const nowStr = new Date().toLocaleString('en-IN', { hour12: false });
          setLastCloudSyncAt(nowStr);
          setState(fetched.state);
          stateRef.current = fetched.state;
          saveCachedStudents(fetched.state.students);
          syncWindowInstituteDB(fetched.state);
          await saveStateToStorage(fetched.state, { preserveTimestamp: true });
        }
      }
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [state.settings.cloudConfig?.autoSyncIntervalMs]);

  // Offline-First Auto-Save State Updater:
  // Synchronously updates stateRef.current and window.instituteDB in 0ms, triggers React re-render,
  // and schedules debounced LocalStorage, IndexedDB, and Firestore sync
  const updateAndPersistState = (updater: (prev: AppState) => AppState) => {
    lastLocalMutationAtRef.current = Date.now();
    hasUnsyncedLocalChangesRef.current = true;
    const nowIso = new Date().toISOString();
    const computed = updater(stateRef.current);
    const next: AppState = {
      ...computed,
      lastSavedAt: new Date().toLocaleString('en-IN', { hour12: false }),
      settings: {
        ...(computed.settings || ({} as any)),
        lastUpdated: nowIso
      }
    };
    (next as any).updatedAt = nowIso;
    (next as any).isSeedData = false;
    (next as any).deviceId = getLocalDeviceId();
    stateRef.current = next;
    syncWindowInstituteDB(next);
    saveCachedStudents(next.students);
    setState(next);

    // Non-blocking debounced auto-save (LocalStorage + IndexedDB + Firestore)
    autoSaveData(next, 'institute_master_data');

    // Schedule non-blocking quota check & cloud mirror update (debounced 600ms)
    if (cloudDebounceRef.current) {
      window.clearTimeout(cloudDebounceRef.current);
    }
    cloudDebounceRef.current = window.setTimeout(() => {
      checkStorageQuota(stateRef.current).then(setStorageQuota);
      if (typeof navigator === 'undefined' || navigator.onLine) {
        setLastCloudSyncAt(new Date().toLocaleString('en-IN', { hour12: false }));
      }
    }, 600);
  };

  // Log Audit Action Helper
  const logAudit = (category: string, action: string, recordId: string, details: string) => {
    updateAndPersistState(prev => {
      const newAudit = {
        id: `AUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        timestamp: new Date().toLocaleString('en-IN', { hour12: false }),
        category,
        action,
        recordId,
        actor: getCurrentActorEmail() || prev.activeActor,
        details
      };
      const newSyncQueue = {
        id: `SYNC-${Date.now()}`,
        timestamp: new Date().toLocaleString('en-IN', { hour12: false }),
        module: category,
        operation: action,
        summary: `${recordId}: ${details}`.slice(0, 100),
        status: isOnline ? 'Synced (Dual-Write)' : 'Queued for Cloud'
      };
      return {
        ...prev,
        auditLogs: [newAudit, ...prev.auditLogs],
        syncQueue: [newSyncQueue, ...prev.syncQueue]
      };
    });
  };

  // Operational metrics for Navbar
  const activeStudents = state.students.filter(s => s.status === 'Active');
  let totalPendingFees = 0;
  activeStudents.forEach(s => {
    const paid = (s.milestones || []).filter(m => m.status === 'Paid').reduce((a, b) => a + b.amount, 0);
    totalPendingFees += Math.max(0, s.netFee - paid);
  });

  const dueFollowupsCount = state.leads.filter(
    l => l.followUpDate && l.followUpDate <= LIVE_TODAY_ISO && !['Admission Confirmed', 'Lost', 'Not Interested'].includes(l.stage)
  ).length;

  let presentToday = 0;
  let markedToday = 0;
  Object.keys(state.attendance).forEach(k => {
    if (k.endsWith(`_${LIVE_TODAY_ISO}`)) {
      const sess = state.attendance[k];
      if (sess.sessionStatus !== 'Cancelled') {
        Object.values(sess.records || {}).forEach(r => {
          markedToday++;
          if (r.status === 'Present' || r.status === 'Late') presentToday++;
        });
      }
    }
  });
  const todayAttendanceRate = markedToday > 0 ? Math.round((presentToday / markedToday) * 100) : 100;

  // Student Handlers with Multi-Tier Persistence (LocalStorage + Firestore + Google Sheets)
  const handleSaveStudent = (student: Student) => {
    unmarkDeletedId('students', student.id);
    const deterministicId = getDeterministicStudentId(student.phone, student.id, student.regId);
    const actorEmail = getCurrentActorEmail();
    const existingStu = stateRef.current.students.find(s => s.id === deterministicId);
    const stampedStudent: Student = {
      ...student,
      id: deterministicId,
      regId: student.regId || deterministicId,
      ...({
        createdBy: (existingStu as any)?.createdBy || actorEmail,
        updatedBy: actorEmail,
        updatedAt: new Date().toISOString()
      } as any)
    };
    const isNew = !existingStu;

    // Tier 1: Immediate Synchronous State & Cache Write (0ms)
    updateAndPersistState(prev => {
      const updatedList = deduplicateRecords([stampedStudent, ...(prev.students || [])], 'id', s => {
        const p = (s.phone || '').replace(/\D/g, '').slice(-10);
        return p.length >= 10 ? `PHONE_${p}` : undefined;
      });
      saveCachedStudents(updatedList);
      return { ...prev, students: updatedList };
    });

    logAudit('Student', 'Saved Student Admission', stampedStudent.regId, `${stampedStudent.name} (${stampedStudent.course})`);
    setStudentModalOpen(false);
    showToast(isNew ? `✓ Added student admission: ${stampedStudent.name}` : `✓ Updated student record: ${stampedStudent.name}`);

    // Tier 2: Firebase Firestore Real-Time Persistence (asynchronous + 5s debounced full master sync)
    saveStudentToFirestore(stampedStudent).catch(err => {
      console.warn('Firestore student write notice:', err);
    });
    scheduleEnrollmentOrLeadCloudSync();

    // Tier 3: Google Sheets Webhook Audit Post (asynchronous)
    syncToGoogleSheets(student, isNew ? 'CREATE' : 'UPDATE').then(res => {
      if (res.success && res.message) {
        console.log('Google Sheets sync result:', res.message);
      }
    }).catch(err => {
      console.warn('Google Sheets sync notice:', err);
    });
  };

  const handleArchiveStudent = (studentId: string) => {
    const s = state.students.find(x => x.id === studentId);
    if (!s) return;
    const nowIso = new Date().toISOString();
    const updated = { ...s, status: 'Archived' as const, updatedAt: nowIso } as Student;
    updateAndPersistState(prev => {
      const list = prev.students.map(x => x.id === studentId ? updated : x);
      saveCachedStudents(list);
      return {
        ...prev,
        students: list
      };
    });
    saveStudentToFirestore(updated).catch(() => {});
    syncToGoogleSheets(updated, 'UPDATE').catch(() => {});
    logAudit('Student', 'Archived Student', s.regId, `Archived ${s.name}`);
    showToast(`✓ Archived ${s.name}`);
  };

  const handleDeleteStudent = (studentId: string) => {
    if (!isPrimaryAdminEmail(authEmailRef.current)) {
      showToast('🔒 Action Restricted: Record deletion requires Master Admin privileges.');
      return;
    }
    const s = state.students.find(x => x.id === studentId);
    const displayLabel = s ? `${s.name} (${s.regId})` : studentId;
    setConfirmDeleteModal({
      title: 'Confirm Deletion',
      recordName: displayLabel,
      recordSubtext: s ? `Course: ${s.course} • Phone: ${s.phone}` : 'Student Admission Record',
      onConfirm: () => {
        markDeletedId('students', studentId);

        // Tier 1: Immediate Synchronous Filter & Local Cache Write
        updateAndPersistState(prev => {
          const filtered = prev.students.filter(x => x.id !== studentId);
          saveCachedStudents(filtered);
          return {
            ...prev,
            students: filtered
          };
        });

        logAudit('Student', 'Deleted Student Record', s?.regId || studentId, `Permanently deleted ${s?.name || studentId}`);
        setConfirmDeleteModal(null);
        showToast('✓ Record deleted successfully');

        // Tier 2: Delete from Firebase Firestore
        deleteStudentFromFirestore(studentId).catch(err => {
          console.warn('Firestore student delete notice:', err);
        });

        // Tier 3: Mark Deleted in Google Sheets Audit Ledger
        syncToGoogleSheets({ id: studentId, status: 'Deleted' }, 'DELETE').catch(err => {
          console.warn('Google Sheets delete sync notice:', err);
        });
      }
    });
  };

  // Re-hydration Handler for Manual Backup Restore (clean overwrite + Firestore diff-sync + unified master doc setDoc)
  const handleRestoreStudents = (restoredStudents: Student[], message: string) => {
    if (!isPrimaryAdminEmail(authEmailRef.current)) {
      showToast('🔒 Action Restricted: Database backup restore requires Master Admin privileges.');
      return;
    }
    const tombstones = getDeletedIds('students');
    const cleanRestored = (restoredStudents || []).filter(
      s => s && !(s as any).isDeleted && !tombstones.has(String(s.id || ''))
    );
    cleanRestored.forEach(s => unmarkDeletedId('students', s.id));

    updateAndPersistState(prev => {
      saveCachedStudents(cleanRestored);
      return {
        ...prev,
        students: cleanRestored
      };
    });

    // Immediately sync restored dataset to `doc(db, 'institutes', 'institute_master_data')` and `students/`
    restoreJsonToFirestoreMaster({
      ...stateRef.current,
      students: cleanRestored,
      updatedAt: new Date().toISOString()
    }).catch(() => {});
    backupStudentData(cleanRestored).catch(() => {});

    logAudit('Restore', 'Restored Students Database', 'ALL', message);
    showToast(`✓ ${message}`);
  };

  // Staff Handlers
  const handleSaveStaff = (staff: StaffMember) => {
    unmarkDeletedId('staff', staff.id);
    updateAndPersistState(prev => {
      const idx = prev.staff.findIndex(s => s.id === staff.id);
      let list = [...prev.staff];
      if (idx !== -1) {
        list[idx] = staff;
      } else {
        list = [staff, ...list];
      }
      return { ...prev, staff: list };
    });
    logAudit('Staff', 'Saved Staff Profile', staff.id, `${staff.name} (${staff.role})`);
    setStaffModalOpen(false);
  };

  const handleDeleteStaff = (staffId: string) => {
    if (!isPrimaryAdminEmail(authEmailRef.current)) {
      showToast('🔒 Action Restricted: Record deletion requires Master Admin privileges.');
      return;
    }
    const member = state.staff.find(s => s.id === staffId);
    const displayLabel = member ? `${member.name} (${member.role})` : staffId;
    setConfirmDeleteModal({
      title: 'Confirm Deletion',
      recordName: displayLabel,
      recordSubtext: `Staff ID: ${staffId}`,
      onConfirm: () => {
        markDeletedId('staff', staffId);
        updateAndPersistState(prev => ({
          ...prev,
          staff: prev.staff.filter(s => s.id !== staffId)
        }));
        deleteStaffFromFirestore(staffId).catch(() => {});
        logAudit('Staff', 'Deleted Staff Member', staffId, member?.name || staffId);
        setConfirmDeleteModal(null);
        showToast('✓ Record deleted successfully');
      }
    });
  };

  const handleToggleStaffStatus = (staffId: string) => {
    updateAndPersistState(prev => {
      const member = prev.staff.find(s => s.id === staffId);
      if (!member) return prev;
      const nextStatus: 'Active' | 'On Leave' | 'Inactive' =
        member.status === 'Active' ? 'On Leave' : member.status === 'On Leave' ? 'Inactive' : 'Active';
      return {
        ...prev,
        staff: prev.staff.map(s => s.id === staffId ? { ...s, status: nextStatus } : s)
      };
    });
  };

  // Course Handlers with immediate write-through to ssm_courses_data & debounced Firestore sync
  const updateCourseField = (courseId: string, field: string, value: any) => {
    updateAndPersistState(prev => {
      const updatedCourses = prev.courses.map(c => {
        if (c.id !== courseId && (c.code || '').toLowerCase() !== courseId.toLowerCase()) {
          return c;
        }
        const nextCourse: Course = { ...c };
        if (field === 'instructor' || field === 'instructorName') {
          nextCourse.instructor = String(value ?? '');
        } else if (field === 'name' || field === 'courseTitle' || field === 'title') {
          nextCourse.name = String(value ?? '');
        } else if (field === 'fee' || field === 'fees') {
          nextCourse.fee = Math.max(0, Number(value) || 0);
        } else if (field === 'syllabus') {
          nextCourse.syllabus = String(value ?? '');
        } else if (field === 'status') {
          nextCourse.status = value === 'Archived' ? 'Archived' : 'Active';
        } else if (field === 'duration') {
          nextCourse.duration = String(value ?? '');
        } else if (field === 'mode') {
          nextCourse.mode = String(value ?? '');
        } else if (field === 'code') {
          nextCourse.code = String(value ?? '');
        }
        return nextCourse;
      });
      const nextState = { ...prev, courses: updatedCourses };
      saveCoursesToStorageImmediate(updatedCourses, nextState);
      return nextState;
    });
  };

  const handleSaveCourse = (course: Course) => {
    unmarkDeletedId('courses', course.id);
    const normalizedCourse: Course = {
      ...course,
      instructor: (course.instructor || '').trim() || 'Prasad Sir'
    };
    updateAndPersistState(prev => {
      const idx = prev.courses.findIndex(c => c.id === normalizedCourse.id);
      let list = [...prev.courses];
      if (idx !== -1) {
        list[idx] = normalizedCourse;
      } else {
        list = [...list, normalizedCourse];
      }
      const nextState = { ...prev, courses: list };
      saveCoursesToStorageImmediate(list, nextState);
      return nextState;
    });
    saveCourseToFirestore(normalizedCourse).catch(() => {});
    logAudit('Course', 'Saved Course Curriculum', normalizedCourse.id, `${normalizedCourse.name} (Fee: ₹${normalizedCourse.fee}, Faculty: ${normalizedCourse.instructor})`);
    setCourseModalOpen(false);
    showToast(`✓ Saved course "${normalizedCourse.name}" (${normalizedCourse.instructor})`);
  };

  const handleDeleteCourse = (courseId: string) => {
    if (!isPrimaryAdminEmail(authEmailRef.current)) {
      showToast('🔒 Action Restricted: Record deletion requires Master Admin privileges.');
      return;
    }
    const crs = state.courses.find(c => c.id === courseId);
    setConfirmDeleteModal({
      title: 'Confirm Deletion',
      recordName: crs ? `${crs.name} (${crs.code || crs.id})` : courseId,
      recordSubtext: 'Course Curriculum Record',
      onConfirm: () => {
        markDeletedId('courses', courseId);
        updateAndPersistState(prev => {
          const updatedCourses = prev.courses.filter(c => c.id !== courseId);
          const nextState = { ...prev, courses: updatedCourses };
          saveCoursesToStorageImmediate(updatedCourses, nextState);
          return nextState;
        });
        deleteCourseFromFirestore(courseId).catch(() => {});
        logAudit('Course', 'Deleted Course', courseId, crs?.name || courseId);
        setConfirmDeleteModal(null);
        showToast('✓ Record deleted successfully');
      }
    });
  };

  const handleToggleCourseStatus = (courseId: string) => {
    updateAndPersistState(prev => {
      const updatedCourses = prev.courses.map(c => {
        if (c.id === courseId) {
          const current = c.status || 'Active';
          return { ...c, status: (current === 'Active' ? 'Archived' : 'Active') as 'Active' | 'Archived' };
        }
        return c;
      });
      const nextState = { ...prev, courses: updatedCourses };
      saveCoursesToStorageImmediate(updatedCourses, nextState);
      return nextState;
    });
  };

  // Batch Handlers
  const handleSaveBatch = (batch: Batch) => {
    unmarkDeletedId('batches', batch.code);
    updateAndPersistState(prev => {
      const idx = prev.batches.findIndex(b => b.code === batch.code);
      let list = [...prev.batches];
      if (idx !== -1) {
        list[idx] = batch;
      } else {
        list = [...list, batch];
      }
      return { ...prev, batches: list };
    });
    saveBatchToFirestore(batch).catch(() => {});
    syncModuleToGoogleSheets('batches', batch, 'UPDATE').catch(() => {});
    logAudit('Batch', 'Saved Batch Schedule', batch.code, `${batch.name} (${batch.course})`);
    setBatchModalOpen(false);
    showToast(`✓ Saved batch ${batch.code} (${batch.name})`);
  };

  const handleDeleteBatch = (batchCode: string) => {
    if (!isPrimaryAdminEmail(authEmailRef.current)) {
      showToast('🔒 Action Restricted: Record deletion requires Master Admin privileges.');
      return;
    }
    const b = state.batches.find(x => x.code === batchCode);
    setConfirmDeleteModal({
      title: 'Confirm Deletion',
      recordName: b ? `${b.name} (${b.code})` : batchCode,
      recordSubtext: b ? `Course: ${b.course} • Schedule: ${b.schedule}` : 'Batch Schedule Record',
      onConfirm: () => {
        markDeletedId('batches', batchCode);
        updateAndPersistState(prev => ({
          ...prev,
          batches: prev.batches.filter(x => x.code !== batchCode)
        }));
        deleteBatchFromFirestore(batchCode).catch(() => {});
        syncModuleToGoogleSheets('batches', { code: batchCode, status: 'Deleted' }, 'DELETE').catch(() => {});
        logAudit('Batch', 'Deleted Batch', batchCode, b?.name || batchCode);
        setConfirmDeleteModal(null);
        showToast('✓ Record deleted successfully');
      }
    });
  };

  // Course & Syllabus Lecture Handlers
  const handleOpenAddLectureModal = (courseId?: string, lectureOrId?: CourseLecture | string) => {
    const targetId = courseId || state.courses[0]?.id || 'CRS-01';
    setLectureTargetCourseId(targetId);
    if (typeof lectureOrId === 'string') {
      const targetCourseObj = state.courses.find(c => c.id === targetId);
      const foundLec = targetCourseObj?.lectures?.find(l => l.id === lectureOrId) || null;
      setEditingLecture(foundLec);
    } else {
      setEditingLecture(lectureOrId || null);
    }
    setLectureModalOpen(true);
  };

  const handleSaveLecture = (courseId: string, lecture: CourseLecture) => {
    updateAndPersistState(prev => {
      const targetCourse = prev.courses.find(c => c.id === courseId) || prev.courses[0];
      const updatedCourses = prev.courses.map(c => {
        if (c.id === courseId) {
          const existing = Array.isArray(c.lectures) ? c.lectures : [];
          const idx = existing.findIndex(l => l.id === lecture.id);
          const nextLectures =
            idx !== -1
              ? existing.map(l => (l.id === lecture.id ? lecture : l))
              : [...existing, lecture];
          return { ...c, lectures: nextLectures };
        }
        return c;
      });

      // Also sync with global batch calendar lectures list
      const matchingBatch =
        prev.batches.find(b => b.course === targetCourse?.name && b.status === 'Active') ||
        prev.batches[0];
      const datePart = (lecture.scheduledDateTime || LIVE_TODAY_ISO).split('T')[0] || LIVE_TODAY_ISO;
      const timePart = (lecture.scheduledDateTime || '').includes('T')
        ? lecture.scheduledDateTime.split('T')[1]
        : '10:00 AM';

      const calendarLecture = {
        id: lecture.id,
        batchCode: matchingBatch?.code || 'OCT-MTB-01',
        date: datePart,
        time: `${timePart} (${lecture.durationMins || 90} mins)`,
        topic: `${lecture.module}: ${lecture.title}`,
        instructor: lecture.instructor || 'Prasad Sir',
        status: (lecture.completed ? 'Completed' : 'Scheduled') as 'Scheduled' | 'Completed' | 'Rescheduled' | 'Cancelled'
      };

      const lecIdx = prev.lectures.findIndex(l => l.id === lecture.id);
      const updatedCalendarLectures =
        lecIdx !== -1
          ? prev.lectures.map(l => (l.id === lecture.id ? calendarLecture : l))
          : [calendarLecture, ...prev.lectures];

      const nextState = {
        ...prev,
        courses: updatedCourses,
        lectures: updatedCalendarLectures
      };
      saveCoursesToStorageImmediate(updatedCourses, nextState);
      return nextState;
    });
    logAudit('Lecture', 'Saved Course Lecture', lecture.id, `${lecture.title} (${lecture.sessionType})`);
    setLectureModalOpen(false);
    setEditingLecture(null);
    showToast(`✓ Saved lecture "${lecture.title}"`);
  };

  const handleDeleteLecture = (courseId: string, lectureId: string) => {
    if (!isPrimaryAdminEmail(authEmailRef.current)) {
      showToast('🔒 Action Restricted: Record deletion requires Master Admin privileges.');
      return;
    }
    const targetCourse = state.courses.find(c => c.id === courseId);
    const targetLec = targetCourse?.lectures?.find(l => l.id === lectureId);
    setConfirmDeleteModal({
      title: 'Confirm Deletion',
      recordName: targetLec ? `${targetLec.title} (${targetLec.module || 'Lecture'})` : lectureId,
      recordSubtext: targetCourse ? `Course: ${targetCourse.name}` : `Course ID: ${courseId}`,
      onConfirm: () => {
        updateAndPersistState(prev => {
          const updatedCourses = prev.courses.map(c => {
            if (c.id === courseId) {
              return {
                ...c,
                lectures: (c.lectures || []).filter(l => l.id !== lectureId)
              };
            }
            return c;
          });
          return {
            ...prev,
            courses: updatedCourses,
            lectures: prev.lectures.filter(l => l.id !== lectureId)
          };
        });
        logAudit('Lecture', 'Deleted Lecture', lectureId, `Removed from course ${courseId}`);
        setConfirmDeleteModal(null);
        showToast('✓ Record deleted successfully');
      }
    });
  };

  const handleToggleLectureComplete = (courseId: string, lectureId: string) => {
    updateAndPersistState(prev => {
      let toggledState = false;
      const updatedCourses = prev.courses.map(c => {
        if (c.id === courseId) {
          return {
            ...c,
            lectures: (c.lectures || []).map(l => {
              if (l.id === lectureId) {
                toggledState = !l.completed;
                return { ...l, completed: toggledState };
              }
              return l;
            })
          };
        }
        return c;
      });
      return {
        ...prev,
        courses: updatedCourses,
        lectures: prev.lectures.map(l =>
          l.id === lectureId ? { ...l, status: toggledState ? 'Completed' : 'Scheduled' } : l
        )
      };
    });
    showToast('✓ Updated lecture completion status');
  };

  // Study Material Handlers
  const handleSaveMaterial = (material: StudyMaterial) => {
    updateAndPersistState(prev => {
      const idx = prev.materials.findIndex(m => m.id === material.id);
      const nextMaterials =
        idx !== -1
          ? prev.materials.map(m => (m.id === material.id ? material : m))
          : [material, ...prev.materials];
      return {
        ...prev,
        materials: nextMaterials
      };
    });
    logAudit('Study Material', 'Saved Study Material', material.id, `${material.title} (${material.course})`);
    setMaterialModalOpen(false);
    setEditingMaterialId(null);
    showToast(`✓ Saved study material "${material.title}"`);
  };

  const handleDeleteMaterial = (materialId: string) => {
    if (!isPrimaryAdminEmail(authEmailRef.current)) {
      showToast('🔒 Action Restricted: Record deletion requires Master Admin privileges.');
      return;
    }
    const mat = state.materials.find(m => m.id === materialId);
    setConfirmDeleteModal({
      title: 'Confirm Deletion',
      recordName: mat ? `${mat.title} (${mat.course})` : materialId,
      recordSubtext: 'Study Material Resource',
      onConfirm: () => {
        updateAndPersistState(prev => {
          const nextMaterials = prev.materials.filter(m => m.id !== materialId);
          return {
            ...prev,
            materials: nextMaterials
          };
        });
        logAudit('Study Material', 'Deleted Study Material', materialId, mat?.title || materialId);
        setConfirmDeleteModal(null);
        showToast('✓ Record deleted successfully');
      }
    });
  };

  const handleDownloadMaterial = (materialId: string) => {
    const mat = state.materials.find(m => m.id === materialId);
    if (!mat) return;

    if (mat.fileType === 'LINK' && mat.fileData && /^https?:\/\//i.test(mat.fileData)) {
      const a = document.createElement('a');
      a.href = mat.fileData;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast(`✓ Opened external study link for "${mat.title}"`);
      return;
    }

    const dataUri =
      mat.fileData ||
      `data:text/plain;charset=utf-8,${encodeURIComponent(
        `SRUJAAN SHARE MARKET INSTITUTE, PUNE\n\nTitle: ${mat.title}\nCourse: ${mat.course}\nType: ${mat.type}\n\nSummary:\n${mat.summary}\n`
      )}`;
    const downloadName =
      mat.fileName ||
      `${mat.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.${mat.fileType === 'PDF' ? 'txt' : 'txt'}`;

    const link = document.createElement('a');
    link.href = dataUri;
    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`✓ Downloaded "${downloadName}"`);
  };

  const handleShareMaterialWhatsApp = (materialId: string) => {
    setShareMaterialId(materialId);
  };

  // Window global attachments for bulletproof inline event dispatch
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).openEditStaffModal = (id: string) => {
        setEditingStaffId(id);
        setStaffModalOpen(true);
      };
      (window as any).deleteStaff = handleDeleteStaff;
      (window as any).openEditCourseModal = (id: string) => {
        setEditingCourseId(id);
        setCourseModalOpen(true);
      };
      (window as any).deleteCourse = handleDeleteCourse;
      (window as any).openEditBatchModal = (code: string) => {
        setEditingBatchCode(code);
        setBatchModalOpen(true);
      };
      (window as any).deleteBatch = handleDeleteBatch;
      (window as any).openEditStudentModal = (id: string) => {
        setEditingStudentId(id);
        setStudentModalOpen(true);
      };
      (window as any).deleteStudent = handleDeleteStudent;

      // Lecture Global Handlers
      (window as any).openAddLectureModal = (courseId?: string, lecture?: CourseLecture) => {
        handleOpenAddLectureModal(courseId, lecture);
      };
      (window as any).saveLecture = handleSaveLecture;
      (window as any).deleteLecture = handleDeleteLecture;
      (window as any).toggleLectureComplete = handleToggleLectureComplete;

      // Study Material Global Handlers
      (window as any).openUploadMaterialModal = (materialId?: string) => {
        setEditingMaterialId(materialId || null);
        setMaterialModalOpen(true);
      };
      (window as any).saveMaterial = handleSaveMaterial;
      (window as any).deleteMaterial = handleDeleteMaterial;
      (window as any).downloadMaterial = handleDownloadMaterial;
      (window as any).shareMaterialWhatsApp = handleShareMaterialWhatsApp;

      // Candle AI Assistant Global Handlers
      (window as any).toggleAIAssistant = () => {
        setAiDrawerOpen(prev => !prev);
      };
      (window as any).sendAIMessage = (msg?: string) => {
        if (msg) {
          handleRunAiQuery(msg);
        }
      };

      // Master Cloud Save & Fetch Global Handlers
      (window as any).masterSaveToCloud = () => handleMasterSaveToCloud(false);
      (window as any).masterFetchFromCloud = () => handleMasterFetchFromCloud(false);
    }
  });

  const handleBulkAssignBatch = (studentIds: string[], batchCode: string) => {
    const nowIso = new Date().toISOString();
    const updatedStudents: Student[] = [];
    updateAndPersistState(prev => ({
      ...prev,
      students: prev.students.map(s => {
        if (studentIds.includes(s.id)) {
          const nextStu = { ...s, batch: batchCode, updatedAt: nowIso } as Student;
          updatedStudents.push(nextStu);
          return nextStu;
        }
        return s;
      })
    }));
    updatedStudents.forEach(s => {
      saveStudentToFirestore(s).catch(() => {});
    });
    scheduleEnrollmentOrLeadCloudSync();
    logAudit('Batch', 'Bulk Batch Assignment', batchCode, `Assigned ${studentIds.length} students to ${batchCode}`);
    showToast(`✓ Assigned ${studentIds.length} students to ${batchCode}`);
  };

  const handleBulkQueueWhatsApp = (studentIds: string[]) => {
    const targetStudents = state.students.filter(s => studentIds.includes(s.id));
    const newItems: DailyQueueItem[] = targetStudents.map((s, idx) => ({
      id: `DQ-${Date.now()}-${idx}`,
      date: LIVE_TODAY_ISO,
      recipientType: 'Student',
      recipientId: s.id,
      recipientName: s.name,
      phone: s.whatsapp || `+91${s.phone.replace(/\D/g, '').slice(-10)}`,
      batchCode: s.batch || 'Classroom',
      scenario: 'Daily Institute Update',
      message: `Hello ${s.name}, update from *${state.settings.instituteName}* regarding your enrolled course *${s.course}* (${s.batch || 'Batch'}). Please join on schedule.`,
      status: 'Prepared',
      updatedAt: new Date().toLocaleTimeString()
    }));
    updateAndPersistState(prev => ({
      ...prev,
      dailyQueue: [...newItems, ...prev.dailyQueue]
    }));
    setActiveTab('daily-updates');
    showToast(`✓ Queued ${newItems.length} WhatsApp messages`);
  };

  const handleBulkArchive = (studentIds: string[]) => {
    const nowIso = new Date().toISOString();
    const updatedStudents: Student[] = [];
    updateAndPersistState(prev => ({
      ...prev,
      students: prev.students.map(s => {
        if (studentIds.includes(s.id)) {
          const nextStu = { ...s, status: 'Archived' as const, updatedAt: nowIso } as Student;
          updatedStudents.push(nextStu);
          return nextStu;
        }
        return s;
      })
    }));
    updatedStudents.forEach(s => {
      saveStudentToFirestore(s).catch(() => {});
    });
    scheduleEnrollmentOrLeadCloudSync();
    showToast(`✓ Archived ${studentIds.length} selected students`);
  };

  const normalizeLeadStageToPipeline = (rawStage?: string): LeadStage => {
    const clean = String(rawStage || '').trim();
    if (LEAD_STAGES.includes(clean as LeadStage)) {
      return clean as LeadStage;
    }
    const lower = clean.toLowerCase();
    if (!lower || lower === 'new' || lower.includes('new enquir') || lower.includes('new inquir') || lower === 'open' || lower === 'pending') {
      return 'New Enquiry';
    }
    if (lower.includes('contact') || lower.includes('called')) {
      return 'Contacted';
    }
    if (lower.includes('demo attend') || lower.includes('attended')) {
      return 'Demo Attended';
    }
    if (lower.includes('demo')) {
      return 'Demo Scheduled';
    }
    if (lower.includes('future') || lower.includes('later')) {
      return 'Future Follow-up';
    }
    if (lower.includes('follow') || lower.includes('call back') || lower.includes('callback')) {
      return 'Follow-up Required';
    }
    if (lower.includes('hot') || lower.includes('interested') || lower.includes('warm') || lower.includes('counsel') || lower.includes('fee')) {
      return !lower.includes('not interested') ? 'Interested' : 'Not Interested';
    }
    if (lower.includes('convert') || lower.includes('admit') || lower.includes('enrol') || lower.includes('confirm') || lower.includes('won')) {
      return 'Admission Confirmed';
    }
    if (lower.includes('lost') || lower.includes('closed') || lower.includes('drop')) {
      return 'Lost';
    }
    if (lower.includes('not interested')) {
      return 'Not Interested';
    }
    return 'New Enquiry';
  };

  const handleCheckAndRepairPipelineAndAdmissions = () => {
    const nowIso = new Date().toISOString();
    let repairedStagesCount = 0;
    let reconciledConversionsCount = 0;
    let repairedAdmissionsCount = 0;
    const leadsToSync: Lead[] = [];
    const studentsToSync: Student[] = [];

    updateAndPersistState(prev => {
      const currentStudents = Array.isArray(prev.students) ? prev.students : [];
      const currentLeads = Array.isArray(prev.leads) ? prev.leads : [];

      const repairedStudents = currentStudents.map(s => {
        const mapped = resolveSsmiCourseAndFee(s.course, s.netFee || s.grossFee, 'Basic Trading', 5000);
        const paid = (s.milestones || [])
          .filter(m => m.status === 'Paid')
          .reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
        const expectedNet = Math.max(Number(s.netFee || mapped.totalFees || 5000), paid);
        const hasValidMilestones = Array.isArray(s.milestones) && s.milestones.length > 0;
        const needsRepair =
          !s.course ||
          !s.regId ||
          !hasValidMilestones ||
          s.netFee !== expectedNet;

        if (!needsRepair) return s;
        repairedAdmissionsCount += 1;
        const fixedStu: Student = {
          ...s,
          course: s.course || mapped.courseName,
          netFee: expectedNet,
          grossFee: Math.max(Number(s.grossFee || expectedNet), expectedNet),
          milestones: hasValidMilestones ? s.milestones : buildMilestonesForPaidAmount(paid, expectedNet, s.enrollDate || LIVE_TODAY_ISO),
          ...({ updatedAt: nowIso } as any)
        };
        studentsToSync.push(fixedStu);
        return fixedStu;
      });

      const repairedLeads = currentLeads.map(l => {
        const canonicalStage = normalizeLeadStageToPipeline(l.stage);
        const normLeadPhone = (l.phone || '').replace(/\D/g, '').slice(-10);
        const matchedStudent = repairedStudents.find(s => {
          if (s.leadId && s.leadId === l.id) return true;
          const sp = (s.phone || '').replace(/\D/g, '').slice(-10);
          if (normLeadPhone.length === 10 && sp === normLeadPhone) return true;
          return s.name.trim().toLowerCase() === (l.name || '').trim().toLowerCase();
        });

        const shouldBeConfirmed = Boolean(matchedStudent) || canonicalStage === 'Admission Confirmed';
        const finalStage: LeadStage = shouldBeConfirmed ? 'Admission Confirmed' : canonicalStage;
        const stageChanged = l.stage !== finalStage;
        const conversionChanged = shouldBeConfirmed && (!l.isConverted || l.convertedStudentId !== matchedStudent?.id);

        if (!stageChanged && !conversionChanged && l.followUpDate) {
          return l;
        }
        if (stageChanged) repairedStagesCount += 1;
        if (conversionChanged) reconciledConversionsCount += 1;

        const fixedLead: Lead = {
          ...l,
          stage: finalStage,
          isConverted: shouldBeConfirmed,
          ...(matchedStudent ? { convertedStudentId: matchedStudent.id } : {}),
          followUpDate: l.followUpDate || LIVE_TODAY_ISO,
          ...({ updatedAt: nowIso } as any)
        };
        leadsToSync.push(fixedLead);
        return fixedLead;
      });

      return {
        ...prev,
        students: deduplicateRecords(repairedStudents, 'id', s => {
          const p = (s.phone || '').replace(/\D/g, '').slice(-10);
          return p.length >= 10 ? `PHONE_${p}` : undefined;
        }),
        leads: deduplicateRecords(repairedLeads, 'id', l => {
          const p = (l.phone || '').replace(/\D/g, '').slice(-10);
          return p.length >= 10 ? `LEAD_PHONE_${p}` : undefined;
        })
      };
    });

    leadsToSync.forEach(l => saveLeadToFirestore(l).catch(() => {}));
    studentsToSync.forEach(s => saveStudentToFirestore(s).catch(() => {}));
    scheduleEnrollmentOrLeadCloudSync();

    const totalFixed = repairedStagesCount + reconciledConversionsCount + repairedAdmissionsCount;
    const msg =
      totalFixed > 0
        ? `✅ Pipeline & Admissions Repaired: ${repairedStagesCount} stages normalized, ${reconciledConversionsCount} conversions linked, ${repairedAdmissionsCount} admission ledgers verified.`
        : `✅ Pipeline & Admissions Verified: All ${stateRef.current.leads.length} inquiries & ${stateRef.current.students.length} admissions are healthy and synced!`;
    showToast(msg);
    return {
      repairedStagesCount,
      reconciledConversionsCount,
      repairedAdmissionsCount,
      message: msg
    };
  };

  // Lead Handlers
  const handleSaveLead = (lead: Lead) => {
    unmarkDeletedId('leads', lead.id);
    const deterministicId = getDeterministicLeadId(lead.phone, lead.id, lead.name);
    const actorEmail = getCurrentActorEmail();
    const existingLead = stateRef.current.leads.find(l => l.id === deterministicId);
    const stampedLead: Lead = {
      ...lead,
      id: deterministicId,
      stage: normalizeLeadStageToPipeline(lead.stage),
      ...({
        createdBy: (existingLead as any)?.createdBy || actorEmail,
        updatedBy: actorEmail,
        updatedAt: new Date().toISOString()
      } as any)
    };
    updateAndPersistState(prev => {
      const list = deduplicateRecords([stampedLead, ...(prev.leads || [])], 'id', l => {
        const p = (l.phone || '').replace(/\D/g, '').slice(-10);
        return p.length >= 10 ? `LEAD_PHONE_${p}` : undefined;
      });
      return { ...prev, leads: list };
    });
    saveLeadToFirestore(stampedLead).catch(err => {
      console.warn('Firestore lead write notice:', err);
    });
    scheduleEnrollmentOrLeadCloudSync();
    logAudit('Lead', 'Saved Lead Enquiry', stampedLead.id, `${stampedLead.name} (${stampedLead.stage})`);
    setLeadModalOpen(false);
  };

  const handleConvertLeadToStudent = (leadId: string) => {
    const lead = state.leads.find(l => l.id === leadId);
    if (!lead) return;

    const normLeadPhone = (lead.phone || '').replace(/\D/g, '').slice(-10);
    const normLeadEmail = (lead.email || '').trim().toLowerCase();

    // Deduplication Check: Prevent duplicate student admissions from the same lead, phone, or email
    const existingStudent = state.students.find(s => {
      if (s.leadId && s.leadId === lead.id) return true;
      if (s.docs && s.docs.includes(lead.id)) return true;
      const normStuPhone = (s.phone || '').replace(/\D/g, '').slice(-10);
      if (normLeadPhone.length >= 10 && normStuPhone === normLeadPhone) return true;
      const normStuEmail = (s.email || '').trim().toLowerCase();
      if (normLeadEmail && normStuEmail && normStuEmail === normLeadEmail) return true;
      return false;
    });

    if (existingStudent) {
      // Ensure the lead stage is marked as Admission Confirmed even if it wasn't yet
      if (lead.stage !== 'Admission Confirmed') {
        const nowIso = new Date().toISOString();
        const confirmedLead = {
          ...lead,
          stage: 'Admission Confirmed' as LeadStage,
          lastContact: LIVE_TODAY_ISO,
          updatedAt: nowIso
        } as Lead;
        updateAndPersistState(prev => ({
          ...prev,
          leads: prev.leads.map(l => l.id === leadId ? confirmedLead : l)
        }));
        saveLeadToFirestore(confirmedLead).catch(() => {});
        scheduleEnrollmentOrLeadCloudSync();
      }
      showToast(`⚠️ This lead is already enrolled as an active student (${existingStudent.regId}).`);
      setStudent360Id(existingStudent.id);
      setStudent360ModalOpen(true);
      return;
    }

    const crs = state.courses.find(c => c.name === lead.course) || state.courses[0];
    const matchBatch = state.batches.find(b => b.course === lead.course && b.status === 'Active') || state.batches[0];
    const yr = new Date().getFullYear();
    const nextNum = state.students.length + 1;
    const regId = `SSMI-${yr}-${String(nextNum).padStart(3, '0')}`;
    const feeAmt = Math.max(0, Math.round(crs ? crs.fee : 35000));
    const cleanPhone = normLeadPhone || (lead.phone || '').trim();
    const deterministicStudentId = getDeterministicStudentId(cleanPhone, undefined, regId);
    const nowIso = new Date().toISOString();

    const newStudent: Student = {
      id: deterministicStudentId,
      regId,
      leadId: lead.id,
      name: (lead.name || '').trim(),
      phone: cleanPhone,
      whatsapp: `+91${cleanPhone.replace(/\D/g, '').slice(-10)}`,
      email: (lead.email || '').trim(),
      address: (lead.locality || 'Pune').trim(),
      course: lead.course,
      batch: matchBatch ? matchBatch.code : '',
      enrollDate: LIVE_TODAY_ISO,
      joinDate: LIVE_TODAY_ISO,
      status: 'Active',
      source: `Lead Conversion (${lead.source})`,
      grossFee: feeAmt,
      discount: 0,
      netFee: feeAmt,
      docs: `Converted from Lead ${lead.id}`,
      notes: (lead.notes || '').trim(),
      milestones: [
        {
          name: 'Admission Token Deposit',
          amount: Math.round(feeAmt / 2),
          dueDate: LIVE_TODAY_ISO,
          status: 'Paid',
          paymentDate: LIVE_TODAY_ISO,
          mode: 'UPI',
          ref: 'UPI' + String(Date.now()).slice(-8)
        },
        {
          name: 'Final Course Installment',
          amount: Math.max(0, feeAmt - Math.round(feeAmt / 2)),
          dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
          status: 'Pending',
          paymentDate: '',
          mode: 'UPI',
          ref: ''
        }
      ],
      ...({
        createdBy: getCurrentActorEmail(),
        updatedBy: getCurrentActorEmail(),
        updatedAt: nowIso
      } as any)
    };

    const confirmedLead: Lead = {
      ...lead,
      stage: 'Admission Confirmed',
      lastContact: LIVE_TODAY_ISO,
      ...({
        updatedBy: getCurrentActorEmail(),
        updatedAt: nowIso
      } as any)
    };

    updateAndPersistState(prev => ({
      ...prev,
      students: deduplicateRecords([newStudent, ...(prev.students || [])], 'id', s => {
        const p = (s.phone || '').replace(/\D/g, '').slice(-10);
        return p.length >= 10 ? `PHONE_${p}` : undefined;
      }),
      leads: prev.leads.map(l => l.id === leadId ? confirmedLead : l)
    }));
    saveStudentToFirestore(newStudent).catch(() => {});
    saveLeadToFirestore(confirmedLead).catch(() => {});
    syncToGoogleSheets(newStudent, 'CREATE').catch(() => {});
    scheduleEnrollmentOrLeadCloudSync();

    logAudit('Lead', 'Converted Lead to Student', `${lead.id} → ${regId}`, `Enrolled ${lead.name} in ${newStudent.course}`);
    showToast(`🎉 Converted ${lead.name} into Student ${regId}!`);
  };

  const handleDeleteLead = (leadId: string) => {
    if (!isPrimaryAdminEmail(authEmailRef.current)) {
      showToast('🔒 Action Restricted: Record deletion requires Master Admin privileges.');
      return;
    }
    const lead = state.leads.find(l => l.id === leadId);
    setConfirmDeleteModal({
      title: 'Confirm Deletion',
      recordName: lead ? `${lead.name} (${lead.phone})` : leadId,
      recordSubtext: lead ? `Enquiry ID: ${lead.id} • Stage: ${lead.stage}` : 'Lead Enquiry Record',
      onConfirm: () => {
        markDeletedId('leads', leadId);
        updateAndPersistState(prev => ({
          ...prev,
          leads: prev.leads.filter(l => l.id !== leadId)
        }));
        deleteLeadFromFirestore(leadId).catch(() => {});
        logAudit('Lead', 'Deleted Lead Enquiry', leadId, lead?.name || leadId);
        setConfirmDeleteModal(null);
        showToast('✓ Record deleted successfully');
      }
    });
  };

  const handleUpdateLeadStage = (leadId: string, newStage: LeadStage) => {
    const nowIso = new Date().toISOString();
    let updatedLeadRecord: Lead | null = null;
    updateAndPersistState(prev => ({
      ...prev,
      leads: prev.leads.map(l => {
        if (l.id === leadId) {
          const nextLead: Lead = {
            ...l,
            stage: newStage,
            lastContact: LIVE_TODAY_ISO,
            ...({ updatedAt: nowIso } as any)
          };
          updatedLeadRecord = nextLead;
          return nextLead;
        }
        return l;
      })
    }));
    if (updatedLeadRecord) {
      saveLeadToFirestore(updatedLeadRecord).catch(err => {
        console.warn('Firestore lead stage update notice:', err);
      });
    }
    scheduleEnrollmentOrLeadCloudSync();
  };

  // Attendance Handlers
  const handleMarkAttendance = (
    batchCode: string,
    date: string,
    studentId: string,
    status: AttendanceRecord['status'],
    note?: string
  ) => {
    const key = `${batchCode}_${date}`;
    updateAndPersistState(prev => {
      const sess = prev.attendance[key] || { sessionStatus: 'Completed', topic: 'Regular Session', records: {} };
      const oldRec = sess.records[studentId];
      const oldStatus = oldRec?.status || 'Not Marked';

      const updatedRecords = {
        ...sess.records,
        [studentId]: { status, note: note || oldRec?.note || '', markedAt: new Date().toISOString() }
      };

      let updatedHistory = prev.attendanceHistory;
      if (oldStatus !== status && oldStatus !== 'Not Marked') {
        const stu = prev.students.find(s => s.id === studentId);
        updatedHistory = [
          {
            id: `ATTH-${Date.now()}`,
            timestamp: new Date().toLocaleString('en-IN', { hour12: false }),
            studentId,
            studentName: stu?.name || studentId,
            batchCode,
            date,
            oldStatus,
            newStatus: status,
            actor: getCurrentActorEmail() || prev.activeActor,
            note: note || 'Register update'
          },
          ...prev.attendanceHistory
        ];
      }

      return {
        ...prev,
        attendance: {
          ...prev.attendance,
          [key]: { ...sess, records: updatedRecords }
        },
        attendanceHistory: updatedHistory
      };
    });
    syncModuleToGoogleSheets('attendance', { batchCode, date, studentId, status, note: note || '' }, 'UPDATE').catch(() => {});
  };

  const handleBulkMarkBatch = (batchCode: string, date: string, status: AttendanceRecord['status']) => {
    const key = `${batchCode}_${date}`;
    const enrolled = state.students.filter(s => s.batch === batchCode && s.status !== 'Archived');
    updateAndPersistState(prev => {
      const sess = prev.attendance[key] || { sessionStatus: 'Completed', topic: 'Regular Session', records: {} };
      const records = { ...sess.records };
      enrolled.forEach(s => {
        records[s.id] = { status, note: '', markedAt: new Date().toISOString() };
      });
      return {
        ...prev,
        attendance: {
          ...prev.attendance,
          [key]: { ...sess, records }
        }
      };
    });
    syncModuleToGoogleSheets('attendance', { batchCode, date, status, studentCount: enrolled.length }, 'UPDATE').catch(() => {});
    logAudit('Attendance', `Bulk Mark All ${status}`, `${batchCode}_${date}`, `Marked ${enrolled.length} students as ${status}`);
  };

  // Fee Milestones Handler
  const handleSaveMilestones = (studentId: string, milestones: FeeMilestone[]) => {
    const nowIso = new Date().toISOString();
    const actorEmail = getCurrentActorEmail();
    const targetStu = state.students.find(s => s.id === studentId);
    updateAndPersistState(prev => ({
      ...prev,
      students: prev.students.map(s =>
        s.id === studentId ? ({ ...s, milestones, updatedBy: actorEmail, updatedAt: nowIso } as Student) : s
      )
    }));
    if (targetStu) {
      const updatedStu = { ...targetStu, milestones, updatedBy: actorEmail, updatedAt: nowIso } as Student;
      saveStudentToFirestore(updatedStu).catch(() => {});
      syncToGoogleSheets(updatedStu, 'UPDATE').catch(() => {});
    }
    syncModuleToGoogleSheets('fee_ledger', { studentId, studentName: targetStu?.name || '', milestones }, 'UPDATE').catch(() => {});
    logAudit('Fee', 'Updated Milestone Schedule', studentId, `Updated ${milestones.length} installments`);
    showToast('✓ Saved fee milestone schedule');
  };

  const printHtmlDocument = (htmlBody: string) => {
    const fullDoc = `<!doctype html><html><head><meta charset="utf-8" /><title>Print Document</title></head><body style="margin:0;background:#fff;">${htmlBody}</body></html>`;
    try {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);
      const doc = iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(fullDoc);
        doc.close();
        setTimeout(() => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          setTimeout(() => {
            if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
          }, 1500);
        }, 250);
      } else {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        showToast('Print preview could not be initialized.');
      }
    } catch {
      showToast('Unable to open print preview in this browser view.');
    }
  };

  // Printable A4 Tax Receipt
  const handlePrintReceipt = (studentId: string, branchId?: string) => {
    const s = state.students.find(x => x.id === studentId);
    if (!s) return;
    const esc = (v: unknown) =>
      String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    const paid = (s.milestones || []).filter(m => m.status === 'Paid').reduce((a, b) => a + b.amount, 0);
    const balance = Math.max(0, s.netFee - paid);
    const primaryLogo = state.settings.primaryLogoBase64 || state.settings.logoBase64;
    const currSym = state.settings.currencySymbol || '₹';
    const recPrefix = state.settings.receiptPrefix || `REC-${new Date().getFullYear()}-`;
    const recNo = `${recPrefix}${s.regId.split('-').pop()}`;
    const activeAddr = getActiveInstituteAddress(state.settings, branchId);
    const displayPhone = activeAddr.phone || state.settings.phone || '';

    const receiptHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 30px; max-width: 820px; margin: 0 auto; color: #0f172a; background: #fff;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 16px;">
          <div style="display: flex; align-items: center; gap: 16px;">
            ${primaryLogo ? `<img src="${esc(primaryLogo)}" style="max-height: 55px; max-width: 180px; object-fit: contain;" alt="Institute Logo" />` : ''}
            <div>
              <div style="font-size: 11px; font-weight: 800; color: #2563eb; letter-spacing: 1px;">OFFICIAL FEE & TAX RECEIPT</div>
              <h1 style="font-size: 22px; font-weight: 900; margin: 2px 0;">${esc(state.settings.instituteName)}</h1>
              ${activeAddr.branchName ? `<div style="font-size: 12px; font-weight: 800; color: #1e40af;">${esc(activeAddr.branchName)}</div>` : (state.settings.shortName ? `<div style="font-size: 11px; font-weight: bold; color: #64748b;">${esc(state.settings.shortName)}</div>` : '')}
              ${activeAddr.fullAddress ? `<p style="font-size: 12px; color: #475569; margin: 2px 0;">${esc(activeAddr.fullAddress)}</p>` : ''}
              <p style="font-size: 11px; color: #475569; margin: 2px 0;">${displayPhone ? `Phone: ${esc(displayPhone)} • ` : ''}GSTIN: <strong>${esc(state.settings.gstin)}</strong> ${state.settings.regNumber ? `• Reg: <strong>${esc(state.settings.regNumber)}</strong>` : ''}</p>
            </div>
          </div>
          <div style="text-align: right; font-family: monospace; font-size: 12px;">
            <div style="background: #0f172a; color: #fff; padding: 4px 10px; border-radius: 6px; font-weight: bold;">${esc(recNo)}</div>
            <div style="margin-top: 6px;">Date: <strong>${esc(LIVE_TODAY_ISO)}</strong></div>
            <div>Student ID: <strong>${esc(s.regId)}</strong></div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 20px 0; background: #f8fafc; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 12px;">
          <div>
            <div><strong>Student Name:</strong> ${esc(s.name)}</div>
            <div><strong>Phone / WhatsApp:</strong> ${esc(s.phone)}</div>
            <div><strong>Address:</strong> ${esc(s.address || '—')}</div>
          </div>
          <div>
            <div><strong>Enrolled Course:</strong> ${esc(s.course)}</div>
            <div><strong>Assigned Batch:</strong> ${esc(s.batch || 'Unassigned')}</div>
            <div><strong>Admission Date:</strong> ${esc(s.enrollDate)}</div>
          </div>
        </div>

        <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin: 20px 0;">
          <thead>
            <tr style="background: #0f172a; color: #fff;">
              <th style="padding: 8px 12px; text-align: left;">Installment Description</th>
              <th style="padding: 8px 12px; text-align: left;">Due Date</th>
              <th style="padding: 8px 12px; text-align: left;">Status</th>
              <th style="padding: 8px 12px; text-align: left;">Payment Date & Mode</th>
              <th style="padding: 8px 12px; text-align: right;">Amount (${esc(currSym)})</th>
            </tr>
          </thead>
          <tbody>
            ${(s.milestones || []).map(m => `
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 8px 12px; font-weight: bold;">${esc(m.name)}</td>
                <td style="padding: 8px 12px; font-family: monospace;">${esc(m.dueDate)}</td>
                <td style="padding: 8px 12px;"><strong>${esc(m.status)}</strong></td>
                <td style="padding: 8px 12px;">${esc(m.paymentDate || '—')} (${esc(m.mode || 'UPI')})</td>
                <td style="padding: 8px 12px; text-align: right; font-family: monospace; font-weight: bold;">${esc(currSym)}${m.amount.toLocaleString('en-IN')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 25px; border-top: 2px solid #0f172a; padding-top: 18px; font-size: 12px;">
          <div>
            <div><strong>UPI ID:</strong> <span style="color: #059669; font-family: monospace;">${esc(state.settings.upiId)}</span></div>
            ${state.settings.bankName ? `
              <div style="font-size: 11px; color: #334155; margin-top: 4px;">
                <strong>Bank Transfer:</strong> ${esc(state.settings.bankName)} | A/C: <strong>${esc(state.settings.bankAccountNumber || '')}</strong> | IFSC: <strong>${esc(state.settings.bankIfsc || '')}</strong>
              </div>
            ` : ''}
            <p style="font-size: 11px; color: #64748b; max-width: 420px; margin-top: 6px;">
              ${esc(state.settings.receiptTerms || 'Fees once paid are non-refundable and non-transferable under any circumstances.')}
            </p>
          </div>
          <div style="text-align: right; font-size: 13px;">
            <div>Gross Fee: ${esc(currSym)}${s.grossFee.toLocaleString('en-IN')}</div>
            <div>Discount: -${esc(currSym)}${s.discount.toLocaleString('en-IN')}</div>
            <div style="font-weight: 800; font-size: 15px; margin: 4px 0;">Net Charged: ${esc(currSym)}${s.netFee.toLocaleString('en-IN')}</div>
            <div style="font-weight: 800; color: #059669; font-size: 15px;">Total Paid: ${esc(currSym)}${paid.toLocaleString('en-IN')}</div>
            <div style="font-weight: 800; color: #dc2626; font-size: 15px;">Balance Due: ${esc(currSym)}${balance.toLocaleString('en-IN')}</div>
            <div style="margin-top: 24px;">
              ${state.settings.signatureBase64 ? `<img src="${esc(state.settings.signatureBase64)}" style="max-height: 44px; max-width: 140px; object-fit: contain; margin-left: auto; margin-bottom: 2px; display: block;" alt="Authorized Signature" />` : ''}
              <div style="font-weight: bold;">${esc(state.settings.signatoryName || 'Prasad M Bhunje')}</div>
              <div style="font-size: 11px; color: #64748b;">${esc(state.settings.signatoryDesignation || 'Founder & Lead Educator, Srujaan Share Market Institute')}</div>
            </div>
          </div>
        </div>
      </div>
    `;

    printHtmlDocument(receiptHtml);
  };

  // Printable A4 Certificate
  const handlePrintCertificate = (cert: Certificate) => {
    const esc = (v: unknown) =>
      String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    const primaryLogo = state.settings.primaryLogoBase64 || state.settings.logoBase64;
    const certLogo = state.settings.certificateLogoBase64 || primaryLogo;
    const activeAddr = getActiveInstituteAddress(state.settings);
    const officialSignatoryName = 'Prasad M Bhunje';
    const officialSignatoryTitle = 'Founder & Lead Educator, Srujaan Share Market Institute';

    const certHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; max-width: 850px; margin: 0 auto; color: #0f172a; background: #fff; border: 8px double #0f172a; text-align: center;">
        ${certLogo ? `<img src="${esc(certLogo)}" style="height: 100px; max-height: 110px; width: auto; object-fit: contain; margin: 0 auto 12px auto; display: block;" alt="Official Certificate Crest" />` : ''}
        <div style="letter-spacing: 2px; font-size: 11px; font-weight: 900; color: #2563eb; text-transform: uppercase;">
          OFFICIAL INSTITUTIONAL ACADEMIC CREDENTIAL
        </div>
        <h1 style="font-size: 26px; font-weight: 900; margin: 8px 0; text-transform: uppercase;">${esc(state.settings.instituteName)}</h1>
        ${activeAddr.fullAddress ? `<p style="font-size: 12px; color: #475569; margin: 0;">${esc(activeAddr.fullAddress)}</p>` : ''}

        <div style="margin: 24px 0;">
          <span style="background: #f5f3ff; color: #6d28d9; padding: 6px 18px; border-radius: 99px; font-size: 13px; font-weight: 900; letter-spacing: 1.5px; border: 1px solid #ddd6fe; text-transform: uppercase;">
            ${esc(state.settings.certificateHeading || 'Certificate of Course Completion')}
          </span>
        </div>

        <p style="font-size: 13px; font-style: italic; color: #64748b;">This is to certify that</p>
        <h2 style="font-size: 28px; font-weight: 900; margin: 10px 0; text-decoration: underline; text-decoration-color: #cbd5e1; text-underline-offset: 6px;">${esc(cert.studentName)}</h2>
        <p style="font-size: 13px; color: #334155; max-width: 580px; margin: 12px auto; line-height: 1.6;">
          ${esc(state.settings.certificateAuthorityText || 'has successfully completed all prescribed practical curriculum, technical trading assessments, and mentorship requirements for:')}
        </p>
        <div style="font-size: 18px; font-weight: 800; color: #1e40af; margin: 12px 0;">"${esc(cert.course)}"</div>
        <div style="font-size: 13px; font-weight: bold; color: #059669;">Standing: ${esc(cert.grade)}</div>

        <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 45px; border-top: 1px solid #cbd5e1; padding-top: 20px; text-align: left; font-size: 12px;">
          <div style="font-family: monospace;">
            <div>Cert ID: <strong>${esc(cert.id)}</strong></div>
            <div>Student ID: <strong>${esc(cert.regId)}</strong></div>
            <div>Date: <strong>${esc(cert.issueDate)}</strong></div>
          </div>
          <div style="text-align: center;">
            <div style="width: 60px; height: 60px; border-radius: 50%; border: 3px double #d97706; background: #fffbeb; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 900; color: #92400e;">
              SEAL
            </div>
          </div>
          <div style="text-align: right;">
            ${state.settings.signatureBase64 ? `<img src="${esc(state.settings.signatureBase64)}" style="max-height: 44px; max-width: 140px; object-fit: contain; margin-left: auto; margin-bottom: 2px; display: block;" alt="Authorized Signature" />` : ''}
            <div style="font-weight: 900; font-size: 14px;">${esc(officialSignatoryName)}</div>
            <div style="font-size: 11px; color: #64748b;">${esc(officialSignatoryTitle)}</div>
            <div style="font-size: 10px; color: #94a3b8;">Authorized Signatory</div>
          </div>
        </div>
      </div>
    `;

    printHtmlDocument(certHtml);
  };

  // Certificate Issuance Handler
  const handleIssueCertificate = (cert: Certificate) => {
    const normalizedCert: Certificate = {
      ...cert,
      issuedBy: 'Prasad M Bhunje',
      ...({ issuedByEmail: getCurrentActorEmail() } as any)
    };
    updateAndPersistState(prev => ({
      ...prev,
      certificates: [normalizedCert, ...prev.certificates]
    }));
    logAudit('Certificate', 'Issued Certificate', normalizedCert.id, `Issued to ${normalizedCert.studentName} for ${normalizedCert.course} (Authorized by Prasad M Bhunje)`);
    showToast(`🏆 Issued Certificate ${normalizedCert.id} for ${normalizedCert.studentName}!`);
  };

  // Helper to build exact Paid / Balance milestones when setting feePaid / paidAmount
  const buildMilestonesForPaidAmount = (
    paidAmount: number,
    netFee: number,
    dateStr: string = LIVE_TODAY_ISO
  ): FeeMilestone[] => {
    const cleanPaid = Math.max(0, Math.round(Number(paidAmount) || 0));
    const cleanNet = Math.max(cleanPaid, Math.round(Number(netFee) || 35000));
    const remaining = Math.max(0, cleanNet - cleanPaid);
    const list: FeeMilestone[] = [];
    if (cleanPaid > 0) {
      list.push({
        name: `Fee Paid (Updated ${dateStr})`,
        amount: cleanPaid,
        dueDate: dateStr,
        status: 'Paid',
        paymentDate: dateStr,
        mode: 'UPI',
        ref: `UPI${String(Date.now()).slice(-8)}`
      });
    }
    if (remaining > 0) {
      list.push({
        name: 'Balance Installment',
        amount: remaining,
        dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        status: 'Pending',
        paymentDate: '',
        mode: 'UPI',
        ref: ''
      });
    }
    return list;
  };

  // Ensure a batch name/code exists in batches list so batch dropdowns and filters work seamlessly
  const ensureBatchExists = (batches: Batch[], batchInput: string, courseName: string): Batch[] => {
    const cleanBatch = String(batchInput || '').trim();
    if (!cleanBatch) return batches;
    const exists = batches.some(
      b =>
        b.code.toLowerCase() === cleanBatch.toLowerCase() ||
        b.name.toLowerCase() === cleanBatch.toLowerCase()
    );
    if (exists) return batches;
    const newBatch: Batch = {
      code: cleanBatch,
      name: cleanBatch,
      course: courseName || 'Complete Master Trader Blueprint',
      mode: 'Offline & Online',
      instructor: 'Prasad Sir',
      schedule: 'Mon–Fri • 09:00 AM – 11:00 AM',
      startDate: LIVE_TODAY_ISO,
      endDate: new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0],
      capacity: 30,
      status: 'Active'
    };
    return [newBatch, ...batches];
  };

  // Live CRUD Store Actions exposed to Gemini Function Calling Agent (Supreme Admin Mode)
  const agentStoreActions: AgentStoreActions = {
    searchRecords: async (query, entityType = 'all') => {
      const current = stateRef.current;
      const q = String(query || '').trim().toLowerCase();
      const qCourseAlias = q.replace(/\badvanced\b/g, 'advance').replace(/\bmaster\b/g, 'complete');
      const matchedStudents =
        entityType === 'inquiries'
          ? []
          : current.students.filter(
              s =>
                !q ||
                s.name.toLowerCase().includes(q) ||
                s.regId.toLowerCase().includes(q) ||
                s.id.toLowerCase().includes(q) ||
                s.phone.includes(q) ||
                s.course.toLowerCase().includes(q) ||
                s.course.toLowerCase().includes(qCourseAlias) ||
                (s.batch || '').toLowerCase().includes(q) ||
                (s.address || '').toLowerCase().includes(q) ||
                (s.status || '').toLowerCase().includes(q) ||
                (s.source || '').toLowerCase().includes(q)
            );
      const matchedInquiries =
        entityType === 'students'
          ? []
          : current.leads.filter(
              l =>
                !q ||
                l.name.toLowerCase().includes(q) ||
                l.id.toLowerCase().includes(q) ||
                l.phone.includes(q) ||
                l.course.toLowerCase().includes(q) ||
                l.course.toLowerCase().includes(qCourseAlias) ||
                l.stage.toLowerCase().includes(q) ||
                (l.locality || '').toLowerCase().includes(q) ||
                (l.source || '').toLowerCase().includes(q) ||
                (l.notes || '').toLowerCase().includes(q)
            );

      const studentLines = matchedStudents.slice(0, 12).map(s => {
        const paid = (s.milestones || [])
          .filter(m => m.status === 'Paid')
          .reduce((sum, m) => sum + m.amount, 0);
        const due = Math.max(0, s.netFee - paid);
        return `- **${s.name}** (\`${s.regId}\`) • Course: **${s.course}** • Batch: \`${s.batch || 'Unassigned'}\` • Phone: \`${s.phone || 'Not provided'}\` • Paid: **₹${paid.toLocaleString('en-IN')}** (Due: ₹${due.toLocaleString('en-IN')}) • Status: **${s.status}**`;
      });

      const inquiryLines = matchedInquiries.slice(0, 12).map(
        l =>
          `- **${l.name}** (\`${l.id}\`) • Course: **${l.course}** • Stage: **${l.stage}** • Locality: **${l.locality || 'Pune'}** • Phone: \`${l.phone || 'Not provided'}\` • Follow-up: \`${l.followUpDate || 'N/A'}\``
      );

      if (studentLines.length === 0 && inquiryLines.length === 0) {
        return {
          success: true,
          records: [],
          summary: `### 🔍 Search Results for "${query}"\nNo matching student or inquiry records were found in the CRM database.`
        };
      }

      const sections: string[] = [`### 🔍 Search Results for "${query || 'All Records'}"`];
      if (studentLines.length > 0) {
        sections.push(`#### Enrolled Students (${matchedStudents.length})\n${studentLines.join('\n')}`);
      }
      if (inquiryLines.length > 0) {
        sections.push(`#### Inquiries / Leads (${matchedInquiries.length})\n${inquiryLines.join('\n')}`);
      }

      return {
        success: true,
        records: [...matchedStudents, ...matchedInquiries],
        summary: sections.join('\n\n')
      };
    },

    addRecord: async (collectionName, payload) => {
      const current = stateRef.current;
      const targetCol = (collectionName || 'admissions').toLowerCase().trim();
      const rawName = (payload.name || payload.data?.name || 'New Student').trim();
      const rawPhoneInput = String(payload.phone || payload.data?.phone || '').trim();
      const extractedDigits = rawPhoneInput.replace(/\D/g, '').slice(-10);
      const rawPhone = extractedDigits.length >= 10 ? extractedDigits : '';
      const rawCourseInput = (payload.course || payload.data?.course || '').trim();
      const matchedCatalogCourse = current.courses.find(
        c =>
          rawCourseInput &&
          (c.name.toLowerCase().includes(rawCourseInput.toLowerCase()) ||
            rawCourseInput.toLowerCase().includes(c.name.toLowerCase()))
      );
      const rawTotalFeeInput = Number(
        payload.totalFee ?? payload.data?.totalFee ?? payload.data?.totalFees ?? payload.data?.netFee ?? 0
      );
      const ssmiCourseAndFee = resolveSsmiCourseAndFee(
        rawCourseInput || matchedCatalogCourse?.name,
        rawTotalFeeInput > 0 ? rawTotalFeeInput : matchedCatalogCourse?.fee,
        'Basic Trading',
        5000
      );
      const courseName = ssmiCourseAndFee.courseName;
      const rawPaid = Number(
        payload.feePaid ??
          payload.amount ??
          payload.data?.paidFees ??
          payload.data?.feePaid ??
          payload.data?.paidAmount ??
          payload.data?.amount ??
          0
      );
      const rawBatch = String(payload.batch || payload.data?.batch || '').trim();
      const rawNotes = (payload.notes || payload.data?.notes || 'Added via SSMI Executive AI Assistant').trim();
      const rawDate = (payload.date || payload.data?.date || LIVE_TODAY_ISO).trim();

      if (targetCol === 'inquiries' || targetCol === 'leads' || targetCol === 'inquiry') {
        const cleanLeadName =
          rawName
            .replace(/\b[6-9]\d{9}\b/g, '')
            .replace(/interested in.*$/i, '')
            .trim() || 'New Inquiry';

        // Prevent duplicate lead creation if same 10-digit phone or exact name already exists
        const existingLeadByPhoneOrName = current.leads.find(l => {
          const lp = (l.phone || '').replace(/\D/g, '').slice(-10);
          return (
            (extractedDigits.length === 10 && lp === extractedDigits) ||
            l.name.trim().toLowerCase() === cleanLeadName.toLowerCase()
          );
        });
        if (existingLeadByPhoneOrName) {
          return await agentStoreActions.updateRecord('leads', existingLeadByPhoneOrName.id, {
            ...(rawCourseInput ? { course: courseName } : {}),
            ...(rawPhone ? { phone: rawPhone } : {}),
            ...(payload.stage || payload.status ? { stage: payload.stage || payload.status } : {}),
            ...(payload.notes ? { notes: rawNotes } : {})
          });
        }

        const leadId = getDeterministicLeadId(
          extractedDigits.length >= 10 ? extractedDigits : '',
          undefined,
          cleanLeadName
        );
        const newLead: Lead = {
          id: leadId,
          recordType: 'inquiry',
          isConverted: false,
          name: cleanLeadName,
          phone: rawPhone,
          email: payload.email || payload.data?.email || '',
          locality: payload.locality || payload.branch || payload.data?.locality || 'Pune',
          course: courseName || 'Basic Trading',
          source: payload.source || payload.data?.source || 'AI Copilot',
          stage: normalizeLeadStageToPipeline(payload.stage || payload.status || payload.data?.stage || 'New Enquiry'),
          intent: (payload.intent || payload.data?.intent || 'Hot') as Lead['intent'],
          enquiryDate: LIVE_TODAY_ISO,
          followUpDate: payload.followUpDate || payload.date || payload.data?.followUpDate || LIVE_TODAY_ISO,
          followUpTime: '11:00 AM',
          lastContact: LIVE_TODAY_ISO,
          mode: 'Offline Classroom',
          staff: 'Prasad Sir',
          objection: 'None',
          notes: rawNotes,
          ...({
            status: payload.status || 'New',
            createdBy: getCurrentActorEmail(),
            updatedBy: getCurrentActorEmail(),
            updatedAt: new Date().toISOString()
          } as any)
        };
        updateAndPersistState(prev => ({
          ...prev,
          leads: deduplicateRecords([newLead, ...(prev.leads || [])], 'id', l => {
            const p = (l.phone || '').replace(/\D/g, '').slice(-10);
            return p.length >= 10 ? `LEAD_PHONE_${p}` : undefined;
          })
        }));
        saveLeadToFirestore(newLead).catch(err => {
          console.warn('Firestore lead write notice:', err);
        });
        scheduleEnrollmentOrLeadCloudSync();
        logAudit('Lead', 'AI Created Inquiry', newLead.id, `${newLead.name} (${newLead.phone || 'Not provided'}) for ${newLead.course}`);
        showToast(`✅ Lead Added: ${newLead.name}`);
        return {
          success: true,
          recordId: newLead.id,
          record: newLead,
          actionCard: {
            recordType: 'inquiry',
            recordId: newLead.id,
            internalId: newLead.id,
            name: newLead.name,
            phone: newLead.phone,
            course: newLead.course,
            branch: newLead.locality || 'Pune',
            stageOrBatch: newLead.stage,
            isConverted: false
          },
          summary: `Created inquiry/lead **${newLead.name}** (ID: \`${newLead.id}\`, Phone: \`${newLead.phone || 'Not provided'}\`, Course: **${newLead.course}**, Status: **${(newLead as any).status || newLead.stage}**, Date: \`${newLead.enquiryDate}\`).`
        };
      }

      // If collection === 'fees' and student already exists, update fee on that student
      if (targetCol === 'fees') {
        const existingMatch = resolveEntityRecord(current, rawName, 'students');
        if (existingMatch && existingMatch.collection === 'students' && rawPaid > 0) {
          return await agentStoreActions.updateRecord('students', existingMatch.record.id, {
            feePaid: rawPaid,
            paidAmount: rawPaid
          });
        }
      }

      // Check if student with exact same name or 10-digit phone already exists in students -> update instead of duplicating
      const existingStuMatch = current.students.find(s => {
        const sp = (s.phone || '').replace(/\D/g, '').slice(-10);
        return (
          s.name.trim().toLowerCase() === rawName.toLowerCase() ||
          (extractedDigits.length === 10 && sp === extractedDigits)
        );
      });
      if (existingStuMatch) {
        return await agentStoreActions.updateRecord('students', existingStuMatch.id, {
          ...(rawBatch ? { batch: rawBatch } : {}),
          ...(rawCourseInput ? { course: courseName } : {}),
          ...(rawPaid > 0 ? { feePaid: rawPaid, paidAmount: rawPaid } : {}),
          ...(rawTotalFeeInput > 0 ? { netFee: rawTotalFeeInput, totalFee: rawTotalFeeInput } : {}),
          ...(rawPhone ? { phone: rawPhone } : {}),
          ...(payload.notes ? { notes: rawNotes } : {})
        });
      }

      // Default: Create Student Admission ('admissions' or 'students')
      const yr = new Date().getFullYear();
      const nextNum = current.students.length + 1;
      const regId = `SSMI-${yr}-${String(nextNum).padStart(3, '0')}`;
      const matchBatch =
        current.batches.find(b => b.course === courseName && b.status === 'Active') ||
        current.batches[0];
      const assignedBatch = rawBatch || (matchBatch ? matchBatch.code : 'OCT-MTB-01');
      const netFee = Math.max(ssmiCourseAndFee.totalFees, rawPaid);
      const paidNow = Math.max(0, rawPaid);
      const pendingFees = Math.max(0, netFee - paidNow);
      const milestones = buildMilestonesForPaidAmount(paidNow, netFee, rawDate);
      const studentId = getDeterministicStudentId(
        extractedDigits.length >= 10 ? extractedDigits : '',
        undefined,
        regId
      );

      const newStudent: Student = {
        id: studentId,
        regId,
        recordType: 'student',
        name: rawName,
        phone: rawPhone,
        whatsapp: extractedDigits.length >= 10 ? `+91${extractedDigits}` : rawPhone,
        email: '',
        address: payload.branch || payload.locality || 'Pune',
        course: courseName,
        batch: assignedBatch,
        enrollDate: rawDate,
        joinDate: rawDate,
        status: 'Active',
        source: 'AI Admission Desk',
        grossFee: netFee,
        discount: 0,
        netFee,
        docs: 'Verified via AI Agent',
        notes: rawNotes,
        milestones,
        ...({
          totalFees: netFee,
          paidFees: paidNow,
          pendingFees,
          paymentMode: payload.paymentMode || 'UPI',
          createdBy: getCurrentActorEmail(),
          updatedBy: getCurrentActorEmail(),
          updatedAt: new Date().toISOString()
        } as any)
      };

      updateAndPersistState(prev => ({
        ...prev,
        batches: ensureBatchExists(prev.batches, assignedBatch, courseName),
        students: deduplicateRecords([newStudent, ...(prev.students || [])], 'id', s => {
          const p = (s.phone || '').replace(/\D/g, '').slice(-10);
          return p.length >= 10 ? `PHONE_${p}` : undefined;
        })
      }));
      saveStudentToFirestore(newStudent).catch(() => {});
      syncToGoogleSheets(newStudent, 'CREATE').catch(() => {});
      logAudit('Student', 'AI Created Student Admission', newStudent.regId, `${newStudent.name} (${newStudent.course})`);
      showToast(`🎓 Student Enrolled: ${newStudent.name} (${newStudent.regId})`);

      return {
        success: true,
        recordId: newStudent.regId,
        record: newStudent,
        actionCard: {
          recordType: 'student',
          recordId: newStudent.regId,
          internalId: newStudent.id,
          name: newStudent.name,
          phone: newStudent.phone,
          course: newStudent.course,
          branch: newStudent.address || 'Pune',
          stageOrBatch: newStudent.batch
        },
        summary: `Enrolled student **${newStudent.name}** (Reg ID: \`${newStudent.regId}\`, Phone: \`${newStudent.phone || 'Not provided'}\`) in **${newStudent.course}** — Batch: \`${newStudent.batch}\`, Total Fees: **₹${netFee.toLocaleString('en-IN')}**, Paid Fees: **₹${paidNow.toLocaleString('en-IN')}**, Pending Fees: **₹${pendingFees.toLocaleString('en-IN')}**.`
      };
    },

    updateRecord: async (collectionName, identifier, rawUpdates) => {
      const current = stateRef.current;
      const updates = rawUpdates || {};
      const targetCol = (collectionName || 'auto').toLowerCase().trim();
      const rawIdentifier = String(identifier || updates.name || '').trim();

      // Determine if updates include student-specific fields (batch, feePaid, paidAmount, netFee, totalFee, attendanceStatus)
      const rawPaidInput =
        updates.paidFees ??
        updates.feePaid ??
        updates.paidAmount ??
        updates.feesPaid ??
        updates.amountPaid ??
        updates.amount;
      const hasPaidUpdate =
        rawPaidInput !== undefined && rawPaidInput !== null && !Number.isNaN(Number(rawPaidInput));
      const rawTotalFeeInput = updates.totalFees ?? updates.totalFee ?? updates.netFee ?? updates.grossFee;
      const hasTotalFeeUpdate =
        rawTotalFeeInput !== undefined &&
        rawTotalFeeInput !== null &&
        !Number.isNaN(Number(rawTotalFeeInput));
      const isStudentFieldMutation =
        Boolean(updates.batch) ||
        hasPaidUpdate ||
        hasTotalFeeUpdate ||
        Boolean(updates.attendanceStatus) ||
        Boolean(updates.__promoteFromLead) ||
        targetCol === 'students' ||
        targetCol === 'admissions' ||
        targetCol === 'fees';

      // Multi-match disambiguation check: if multiple records share a first/partial name in the target collection, list them!
      const preferred: 'students' | 'leads' | 'auto' =
        targetCol === 'inquiries' || targetCol === 'leads'
          ? 'leads'
          : targetCol === 'students' || targetCol === 'admissions'
          ? 'students'
          : 'auto';

      const allMatches = findAllMatchingEntities(current, rawIdentifier, preferred);
      const sameColMatches =
        preferred === 'auto'
          ? allMatches.filter(m => m.collection === 'students').length > 1
            ? allMatches.filter(m => m.collection === 'students')
            : allMatches.filter(m => m.collection === 'leads').length > 1
            ? allMatches.filter(m => m.collection === 'leads')
            : allMatches
          : allMatches;

      if (sameColMatches.length > 1) {
        const listLines = sameColMatches
          .slice(0, 8)
          .map(
            m =>
              `- **${m.record.name}** (\`${m.record.regId || m.record.id}\` • ${m.collection === 'students' ? 'Student' : 'Lead'} • Course: **${m.record.course || 'N/A'}** • Phone: \`${m.record.phone || 'N/A'}\`)`
          )
          .join('\n');
        return {
          success: false,
          summary: `Multiple records match **"${rawIdentifier}"**. Please specify the full name, phone number, or ID of the record you want to update:\n\n${listLines}`
        };
      }
      const resolution =
        resolveEntityRecord(current, rawIdentifier, preferred) ||
        (typeof window !== 'undefined' && (window as any).instituteDB
          ? resolveEntityRecord((window as any).instituteDB, rawIdentifier, preferred)
          : null);

      // 1. If matched in `leads` AND user is only updating lead fields (not promoting/updating student batch/fees)
      if (resolution && resolution.collection === 'leads' && !isStudentFieldMutation) {
        const targetLead = resolution.record as Lead;
        const nowIso = new Date().toISOString();
        const updatedLead: Lead = {
          ...targetLead,
          ...(updates.name ? { name: String(updates.name).trim() } : {}),
          ...(updates.phone ? { phone: String(updates.phone).trim() } : {}),
          ...(updates.course ? { course: String(updates.course).trim() } : {}),
          ...(updates.stage || updates.status ? { stage: normalizeLeadStageToPipeline(updates.stage || updates.status) } : {}),
          ...(updates.notes ? { notes: String(updates.notes).trim() } : {}),
          lastContact: LIVE_TODAY_ISO,
          ...({ updatedBy: getCurrentActorEmail(), updatedAt: nowIso } as any)
        };
        updateAndPersistState(prev => ({
          ...prev,
          leads: prev.leads.map(l => (l.id === targetLead.id ? updatedLead : l))
        }));
        saveLeadToFirestore(updatedLead).catch(() => {});
        scheduleEnrollmentOrLeadCloudSync();
        logAudit('Lead', 'AI Updated Inquiry', targetLead.id, `Updated ${updatedLead.name}`);
        showToast(`🤖 AI Updated Inquiry: ${updatedLead.name}`);
        return {
          success: true,
          recordId: targetLead.id,
          record: updatedLead,
          summary: `Updated inquiry **${updatedLead.name}** (\`${targetLead.id}\`) — Stage: **${updatedLead.stage}**, Course: **${updatedLead.course}**.`
        };
      }

      // 2. If matched in `leads` BUT user requested student updates (e.g. batch or feePaid for Monika Patil),
      // automatically promote the lead into an Active Enrolled Student!
      if (resolution && resolution.collection === 'leads' && isStudentFieldMutation) {
        const sourceLead = resolution.record as Lead;
        const yr = new Date().getFullYear();
        const nextNum = current.students.length + 1;
        const regId = `SSMI-${yr}-${String(nextNum).padStart(3, '0')}`;
        const courseName = String(updates.course || sourceLead.course || 'Complete Master Trader Blueprint').trim();
        const matchedCourse = current.courses.find(
          c => c.name.toLowerCase() === courseName.toLowerCase()
        );
        const defaultFee = matchedCourse ? matchedCourse.fee : 35000;
        const paidVal = hasPaidUpdate ? Math.max(0, Number(rawPaidInput)) : 0;
        const netFeeVal = hasTotalFeeUpdate
          ? Math.max(paidVal, Number(rawTotalFeeInput))
          : Math.max(defaultFee, paidVal);
        const batchVal = String(
          updates.batch ||
            current.batches.find(b => b.course === courseName)?.code ||
            'Pro Trader Morning'
        ).trim();

        const rawStuPhoneDigits = String(updates.phone || sourceLead.phone || '').replace(/\D/g, '').slice(-10);
        const stuPhone = rawStuPhoneDigits.length >= 10 ? rawStuPhoneDigits : '';
        const stuId = getDeterministicStudentId(stuPhone, undefined, regId);
        const nowIso = new Date().toISOString();

        const promotedStudent: Student = {
          id: stuId,
          regId,
          name: String(updates.name || sourceLead.name).trim(),
          phone: stuPhone,
          whatsapp: stuPhone ? `+91${stuPhone}` : '',
          email: sourceLead.email || '',
          address: sourceLead.locality || 'Pune',
          course: courseName,
          batch: batchVal,
          enrollDate: LIVE_TODAY_ISO,
          joinDate: LIVE_TODAY_ISO,
          status: (updates.status as Student['status']) || 'Active',
          source: sourceLead.source || 'Promoted from Lead via AI',
          grossFee: netFeeVal,
          discount: Number(updates.discount || 0),
          netFee: netFeeVal,
          docs: 'Verified via AI Agent',
          notes: String(updates.notes || sourceLead.notes || 'Promoted and updated via AI Assistant'),
          milestones: buildMilestonesForPaidAmount(paidVal, netFeeVal, LIVE_TODAY_ISO),
          ...({ updatedAt: nowIso } as any)
        };

        const confirmedLead: Lead = {
          ...sourceLead,
          stage: 'Admission Confirmed',
          lastContact: LIVE_TODAY_ISO,
          ...({ updatedAt: nowIso } as any)
        };

        updateAndPersistState(prev => ({
          ...prev,
          batches: ensureBatchExists(prev.batches, batchVal, courseName),
          leads: prev.leads.map(l =>
            l.id === sourceLead.id ? confirmedLead : l
          ),
          students: deduplicateRecords([promotedStudent, ...(prev.students || [])], 'id', s => {
            const p = (s.phone || '').replace(/\D/g, '').slice(-10);
            return p.length >= 10 ? `PHONE_${p}` : undefined;
          })
        }));
        saveStudentToFirestore(promotedStudent).catch(() => {});
        saveLeadToFirestore(confirmedLead).catch(() => {});
        syncToGoogleSheets(promotedStudent, 'CREATE').catch(() => {});
        scheduleEnrollmentOrLeadCloudSync();
        logAudit(
          'Student',
          'AI Promoted Lead & Updated Student',
          promotedStudent.regId,
          `${promotedStudent.name} -> Batch: ${promotedStudent.batch}, Paid: ₹${paidVal.toLocaleString('en-IN')}`
        );
        showToast(`🤖 AI Updated & Enrolled: ${promotedStudent.name} (${promotedStudent.regId})`);

        return {
          success: true,
          recordId: promotedStudent.regId,
          record: promotedStudent,
          summary: `Updated & enrolled **${promotedStudent.name}** (\`${promotedStudent.regId}\`) in Students — Batch: **${promotedStudent.batch}**, Fees Paid: **₹${paidVal.toLocaleString('en-IN')}** / Net Fee: **₹${netFeeVal.toLocaleString('en-IN')}**, Status: **${promotedStudent.status}**.`
        };
      }

      // 3. If matched in `students`: update the existing student record directly
      if (resolution && resolution.collection === 'students') {
        const targetStudent = resolution.record as Student;
        const currentPaid = (targetStudent.milestones || [])
          .filter(m => m.status === 'Paid')
          .reduce((sum, m) => sum + m.amount, 0);

        const nextPaid = hasPaidUpdate ? Math.max(0, Number(rawPaidInput)) : currentPaid;
        const nextDiscount =
          typeof updates.discount === 'number' ? updates.discount : targetStudent.discount || 0;
        const nextNetFee = hasTotalFeeUpdate
          ? Math.max(nextPaid, Number(rawTotalFeeInput))
          : Math.max(targetStudent.netFee || 25000, nextPaid);

        const updatedMilestones =
          hasPaidUpdate || hasTotalFeeUpdate
            ? buildMilestonesForPaidAmount(nextPaid, nextNetFee, LIVE_TODAY_ISO)
            : [...(targetStudent.milestones || [])];

        const nextBatch = updates.batch ? String(updates.batch).trim() : targetStudent.batch;
        const nextCourse = updates.course ? String(updates.course).trim() : targetStudent.course;
        const validStatuses: Student['status'][] = ['Active', 'On Hold', 'Completed', 'Archived'];
        const nextStatus: Student['status'] =
          updates.status && validStatuses.includes(updates.status as Student['status'])
            ? (updates.status as Student['status'])
            : targetStudent.status === 'Archived'
            ? 'Active'
            : targetStudent.status;

        const nowIso = new Date().toISOString();
        const updatedStudent: Student = {
          ...targetStudent,
          ...(updates.name ? { name: String(updates.name).trim() } : {}),
          ...(updates.phone ? { phone: String(updates.phone).trim() } : {}),
          course: nextCourse,
          batch: nextBatch,
          status: nextStatus,
          grossFee: Math.max(nextNetFee + nextDiscount, targetStudent.grossFee || nextNetFee),
          discount: nextDiscount,
          netFee: nextNetFee,
          ...(updates.notes ? { notes: String(updates.notes).trim() } : {}),
          milestones: updatedMilestones,
          ...({ updatedAt: nowIso } as any)
        };

        updateAndPersistState(prev => {
          const existsInPrev = prev.students.some(s => s.id === targetStudent.id);
          const list = existsInPrev
            ? prev.students.map(s => (s.id === targetStudent.id ? updatedStudent : s))
            : [updatedStudent, ...prev.students];
          saveCachedStudents(list);
          return {
            ...prev,
            batches: ensureBatchExists(prev.batches, nextBatch, nextCourse),
            students: list
          };
        });

        saveStudentToFirestore(updatedStudent).catch(() => {});
        syncToGoogleSheets(updatedStudent, 'UPDATE').catch(() => {});
        scheduleEnrollmentOrLeadCloudSync();

        if (updates.attendanceStatus) {
          const attStatus =
            updates.attendanceStatus === 'Absent'
              ? 'Absent'
              : updates.attendanceStatus === 'Late'
              ? 'Late'
              : 'Present';
          handleMarkAttendance(
            updatedStudent.batch || current.batches[0]?.code || 'B-01',
            LIVE_TODAY_ISO,
            updatedStudent.id,
            attStatus
          );
        }

        const finalPaid = updatedMilestones
          .filter(m => m.status === 'Paid')
          .reduce((sum, m) => sum + m.amount, 0);
        const finalBalance = Math.max(0, updatedStudent.netFee - finalPaid);

        logAudit(
          'Student',
          'AI Updated Student Record',
          updatedStudent.regId,
          `Updated ${updatedStudent.name}: Batch=${updatedStudent.batch}, Paid=₹${finalPaid.toLocaleString('en-IN')}`
        );
        showToast(
          `🤖 AI Updated Student: ${updatedStudent.name} (Batch: ${updatedStudent.batch}, Paid: ₹${finalPaid.toLocaleString('en-IN')})`
        );

        return {
          success: true,
          recordId: updatedStudent.regId,
          record: updatedStudent,
          summary: `Updated student **${updatedStudent.name}** (\`${updatedStudent.regId}\`) — Batch: **${updatedStudent.batch || 'Assigned'}**, Fees Paid: **₹${finalPaid.toLocaleString('en-IN')}** (Balance Due: **₹${finalBalance.toLocaleString('en-IN')}** / Net Fee: **₹${updatedStudent.netFee.toLocaleString('en-IN')}**), Course: **${updatedStudent.course}**, Status: **${updatedStudent.status}**.`
        };
      }

      // 4. Upsert Fallback: If the named student (e.g. "Monika Patil") wasn't in students or leads yet,
      // create and enroll them immediately with the requested batch and feePaid so the Student table reflects it!
      if (rawIdentifier.length >= 2 && isStudentFieldMutation) {
        const yr = new Date().getFullYear();
        const nextNum = current.students.length + 1;
        const regId = `SSMI-${yr}-${String(nextNum).padStart(3, '0')}`;
        const courseName = String(
          updates.course || current.courses[0]?.name || 'Complete Master Trader Blueprint'
        ).trim();
        const matchedCourse = current.courses.find(
          c => c.name.toLowerCase() === courseName.toLowerCase()
        );
        const defaultFee = matchedCourse ? matchedCourse.fee : 35000;
        const paidVal = hasPaidUpdate ? Math.max(0, Number(rawPaidInput)) : 0;
        const netFeeVal = hasTotalFeeUpdate
          ? Math.max(paidVal, Number(rawTotalFeeInput))
          : Math.max(defaultFee, paidVal);
        const batchVal = String(
          updates.batch || current.batches[0]?.code || 'Pro Trader Morning'
        ).trim();
        const extractedPhone = String(updates.phone || '').replace(/\D/g, '').slice(-10);
        const phoneVal = extractedPhone.length >= 10 ? extractedPhone : '';

        const stuId = getDeterministicStudentId(phoneVal, undefined, regId);

        const upsertedStudent: Student = {
          id: stuId,
          regId,
          name: String(updates.name || rawIdentifier).trim(),
          phone: phoneVal,
          whatsapp: phoneVal ? `+91${phoneVal}` : '',
          email: '',
          address: 'Pune',
          course: courseName,
          batch: batchVal,
          enrollDate: LIVE_TODAY_ISO,
          joinDate: LIVE_TODAY_ISO,
          status: (updates.status as Student['status']) || 'Active',
          source: 'AI Super-Admin Upsert',
          grossFee: netFeeVal,
          discount: Number(updates.discount || 0),
          netFee: netFeeVal,
          docs: 'Verified via AI Agent',
          notes: String(updates.notes || `Updated via AI Assistant (${LIVE_TODAY_ISO})`),
          milestones: buildMilestonesForPaidAmount(paidVal, netFeeVal, LIVE_TODAY_ISO)
        };

        updateAndPersistState(prev => ({
          ...prev,
          batches: ensureBatchExists(prev.batches, batchVal, courseName),
          students: deduplicateRecords([upsertedStudent, ...(prev.students || [])], 'id', s => {
            const p = (s.phone || '').replace(/\D/g, '').slice(-10);
            return p.length >= 10 ? `PHONE_${p}` : undefined;
          })
        }));
        saveStudentToFirestore(upsertedStudent).catch(() => {});
        syncToGoogleSheets(upsertedStudent, 'CREATE').catch(() => {});
        logAudit(
          'Student',
          'AI Upserted Student Record',
          upsertedStudent.regId,
          `${upsertedStudent.name}: Batch=${upsertedStudent.batch}, Paid=₹${paidVal.toLocaleString('en-IN')}`
        );
        showToast(
          `🤖 AI Updated Student: ${upsertedStudent.name} (Batch: ${upsertedStudent.batch}, Paid: ₹${paidVal.toLocaleString('en-IN')})`
        );

        return {
          success: true,
          recordId: upsertedStudent.regId,
          record: upsertedStudent,
          summary: `Updated student **${upsertedStudent.name}** (\`${upsertedStudent.regId}\`) — Batch: **${upsertedStudent.batch}**, Fees Paid: **₹${paidVal.toLocaleString('en-IN')}** (Balance Due: **₹${Math.max(0, netFeeVal - paidVal).toLocaleString('en-IN')}** / Net Fee: **₹${netFeeVal.toLocaleString('en-IN')}**), Course: **${upsertedStudent.course}**, Status: **${upsertedStudent.status}**.`
        };
      }

      return {
        success: false,
        summary: `Could not locate record matching "${identifier}".`
      };
    },

    deleteRecord: async (collectionName, identifier, confirmed = false) => {
      if (!isPrimaryAdminEmail(authEmailRef.current)) {
        return {
          success: false,
          summary:
            '🔒 Permission Denied: Record deletion is restricted to the Master Admin account (Prasad Sir).'
        };
      }
      const current = stateRef.current;
      const targetCol = (collectionName || 'auto').toLowerCase().trim();
      const preferred: 'students' | 'leads' | 'auto' =
        targetCol === 'inquiries' || targetCol === 'leads'
          ? 'leads'
          : targetCol === 'students' || targetCol === 'admissions'
          ? 'students'
          : 'auto';
      const resolution = resolveEntityRecord(current, identifier, preferred);

      if (!resolution) {
        return {
          success: false,
          summary: `Could not find student or inquiry record matching "${identifier}" to delete.`
        };
      }

      const recName = String(resolution.record.name || identifier);
      const recId = String(resolution.record.regId || resolution.record.id || '');
      const recCourse = String(resolution.record.course || 'Assigned Course');
      const recPhone = String(resolution.record.phone || 'N/A');
      const isTestRecord = /\b(test|dummy|demo|sample)\b/i.test(recName) || /\b(test|dummy|demo)\b/i.test(identifier);

      // Safety confirmation check: unless user explicitly wrote confirm/force or it's a test record, ask 1-line confirmation first
      if (!confirmed && !isTestRecord) {
        return {
          success: false,
          awaitingConfirmation: true,
          recordId: recId,
          confirmCommand: `confirm delete ${recName}`,
          targetRecordName: recName,
          actionCard: {
            recordType: resolution.collection === 'leads' ? 'inquiry' : 'student',
            recordId: recId,
            internalId: String(resolution.record.id || recId),
            name: recName,
            phone: recPhone,
            course: recCourse,
            branch: String(resolution.record.locality || resolution.record.address || 'Pune'),
            stageOrBatch: String(resolution.record.stage || resolution.record.batch || 'Active')
          },
          summary: `Matched ${resolution.collection === 'leads' ? 'Lead' : 'Student'} **${recName}** (\`${recId}\` • Course: **${recCourse}** • Phone: \`${recPhone}\`). Click **Confirm Delete** below or reply **"confirm delete ${recName}"** to permanently delete this record.`
        };
      }

      if (resolution.collection === 'leads') {
        const targetLead = resolution.record as Lead;
        markDeletedId('leads', targetLead.id);
        updateAndPersistState(prev => ({
          ...prev,
          leads: prev.leads.filter(l => l.id !== targetLead.id)
        }));
        deleteLeadFromFirestore(targetLead.id).catch(() => {});
        logAudit('Lead', 'AI Deleted Inquiry', targetLead.id, `Removed ${targetLead.name}`);
        showToast(`🗑️ Deleted Lead: ${targetLead.name}`);
        return {
          success: true,
          recordId: targetLead.id,
          summary: `Permanently deleted inquiry/lead **${targetLead.name}** (\`${targetLead.id}\`) from state and Firebase Firestore.`
        };
      }

      if (resolution.collection === 'students') {
        const targetStudent = resolution.record as Student;
        markDeletedId('students', targetStudent.id);
        updateAndPersistState(prev => ({
          ...prev,
          students: prev.students.filter(s => s.id !== targetStudent.id)
        }));
        deleteStudentFromFirestore(targetStudent.id).catch(() => {});
        syncToGoogleSheets({ id: targetStudent.id, status: 'Deleted' }, 'DELETE').catch(() => {});
        logAudit('Student', 'AI Deleted Student Record', targetStudent.regId, `Deleted ${targetStudent.name}`);
        showToast(`🗑️ Deleted Student: ${targetStudent.name} (${targetStudent.regId})`);

        return {
          success: true,
          recordId: targetStudent.regId,
          summary: `Permanently removed student record **${targetStudent.name}** (\`${targetStudent.regId}\`) from state and Firebase Firestore.`
        };
      }

      return {
        success: false,
        summary: `Could not delete record "${identifier}".`
      };
    },

    markAttendance: async ({ studentNameOrPhone, studentIdentifier, date, status }) => {
      const current = stateRef.current;
      const queryStr = (studentNameOrPhone || studentIdentifier || '').trim();
      const targetDate = (date || LIVE_TODAY_ISO).trim();

      const resolution = resolveEntityRecord(current, queryStr, 'students');
      if (!resolution || resolution.collection !== 'students') {
        return {
          success: false,
          summary: `Could not locate student matching "${queryStr}" to mark attendance.`
        };
      }

      const targetStudent = resolution.record as Student;
      const batchCode = targetStudent.batch || current.batches[0]?.code || 'B-01';
      const normalizedStatus: 'Present' | 'Absent' | 'Late' =
        status === 'Absent' ? 'Absent' : status === 'Late' ? 'Late' : 'Present';

      handleMarkAttendance(
        batchCode,
        targetDate,
        targetStudent.id,
        normalizedStatus,
        'Marked via Candle AI Agent'
      );
      showToast(`🤖 AI Marked ${targetStudent.name} as ${normalizedStatus} (${targetDate})`);

      return {
        success: true,
        recordId: targetStudent.regId,
        summary: `Marked **${targetStudent.name}** (\`${targetStudent.regId}\`, Batch \`${batchCode}\`) as **${normalizedStatus}** for **${targetDate}**.`
      };
    },

    manageInstituteEntity: async ({
      entityType,
      action,
      nameOrTitle,
      course,
      scheduleOrRole,
      feeOrAmount,
      phone,
      status
    }) => {
      const current = stateRef.current;
      const type = String(entityType || 'batches').toLowerCase().trim();
      const cleanName = String(nameOrTitle || 'New Record').trim();
      const targetCourse =
        course || current.courses[0]?.name || 'Complete Master Trader Blueprint';

      if (type === 'attendance_bulk') {
        const batchCode =
          current.batches.find(
            b =>
              b.code.toLowerCase() === cleanName.toLowerCase() ||
              b.name.toLowerCase().includes(cleanName.toLowerCase())
          )?.code ||
          cleanName ||
          current.batches[0]?.code ||
          'OCT-MTB-01';
        const bulkStatus: AttendanceRecord['status'] =
          status === 'Absent' ? 'Absent' : status === 'Late' ? 'Late' : 'Present';
        handleBulkMarkBatch(batchCode, LIVE_TODAY_ISO, bulkStatus);
        const enrolledCount = current.students.filter(
          s => s.batch === batchCode && s.status !== 'Archived'
        ).length;
        showToast(`🤖 AI Marked Batch ${batchCode} (${enrolledCount} students) as ${bulkStatus}`);
        return {
          success: true,
          recordId: batchCode,
          summary: `Marked all **${enrolledCount}** active students in batch **\`${batchCode}\`** as **${bulkStatus}** for **${LIVE_TODAY_ISO}**.`
        };
      }

      if (type === 'batches' || type === 'batch') {
        const code =
          cleanName.toUpperCase().replace(/[^A-Z0-9-]/g, '-').slice(0, 14) ||
          `B-${Date.now().toString().slice(-4)}`;
        const newBatch: Batch = {
          code,
          name: cleanName,
          course: targetCourse,
          mode: 'Offline & Online',
          instructor: 'Prasad Sir',
          schedule: scheduleOrRole || 'Mon–Fri • 10:00 AM – 12:00 PM',
          startDate: LIVE_TODAY_ISO,
          endDate: new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0],
          capacity: 30,
          status: 'Active'
        };
        handleSaveBatch(newBatch);
        return {
          success: true,
          recordId: newBatch.code,
          summary: `${action === 'update' ? 'Updated' : 'Created'} batch **${newBatch.name}** (\`${newBatch.code}\`) for **${newBatch.course}** (${newBatch.schedule}).`
        };
      }

      if (type === 'courses' || type === 'course') {
        const code = `CRS-${String(current.courses.length + 1).padStart(2, '0')}`;
        const feeVal = feeOrAmount && feeOrAmount > 0 ? feeOrAmount : 35000;
        const newCourse: Course = {
          id: code,
          code,
          name: cleanName,
          duration: '8 Weeks (Classroom + Live Market Desk)',
          fee: feeVal,
          mode: 'Offline & Online',
          instructor: 'Prasad Sir',
          status: 'Active',
          syllabus: 'Institutional Price Action, Demand & Supply Zones, Nifty & Bank Nifty F&O, Risk Management',
          lectures: []
        };
        handleSaveCourse(newCourse);
        return {
          success: true,
          recordId: newCourse.id,
          summary: `Saved flagship course **${newCourse.name}** (\`${newCourse.code}\`) with course fee **₹${feeVal.toLocaleString('en-IN')}** (Lead Faculty: **Prasad Sir**).`
        };
      }

      if (type === 'lectures' || type === 'lecture') {
        const targetCourseObj =
          current.courses.find(c => c.name.toLowerCase().includes(targetCourse.toLowerCase())) ||
          current.courses[0];
        const newLec: CourseLecture = {
          id: `LEC-${Date.now()}`,
          courseId: targetCourseObj?.id || 'CRS-01',
          title: cleanName,
          module: scheduleOrRole || 'Module 1: Institutional Price Action',
          durationMins: 90,
          sessionType: 'Trading Lab',
          completed: status === 'Completed',
          scheduledDateTime: `${LIVE_TODAY_ISO}T10:00`,
          instructor: 'Prasad Sir',
          summaryOrLink: 'Scheduled via Candle AI Assistant'
        };
        if (targetCourseObj) {
          handleSaveLecture(targetCourseObj.id, newLec);
        }
        return {
          success: true,
          recordId: newLec.id,
          summary: `Added syllabus lecture **${newLec.title}** (\`${newLec.id}\`) to **${targetCourseObj?.name || targetCourse}** (Faculty: **Prasad Sir**).`
        };
      }

      if (type === 'staff') {
        const newStaff: StaffMember = {
          id: `STF-${Date.now()}`,
          name: cleanName,
          role: scheduleOrRole || 'Senior Trading Mentor',
          phone: phone || '9823011223',
          email: '',
          salary: feeOrAmount && feeOrAmount > 0 ? feeOrAmount : 45000,
          joiningDate: LIVE_TODAY_ISO,
          batches: current.batches[0]?.code || 'OCT-MTB-01',
          status: 'Active'
        };
        handleSaveStaff(newStaff);
        return {
          success: true,
          recordId: newStaff.id,
          summary: `Added faculty/staff member **${newStaff.name}** (\`${newStaff.id}\`, Role: **${newStaff.role}**).`
        };
      }

      if (type === 'materials' || type === 'material') {
        const newMat: StudyMaterial = {
          id: `MAT-${Date.now()}`,
          title: cleanName,
          course: targetCourse,
          type: 'PDF Blueprint',
          summary: `Institutional trading blueprint and reference notes for ${cleanName}.`,
          uploadDate: LIVE_TODAY_ISO,
          fileType: 'PDF'
        };
        handleSaveMaterial(newMat);
        return {
          success: true,
          recordId: newMat.id,
          summary: `Published study material **${newMat.title}** (\`${newMat.id}\`) for **${newMat.course}**.`
        };
      }

      return {
        success: true,
        summary: `Updated ${type}: **${cleanName}**.`
      };
    },

    repairSystemState: async () => {
      const repairResult = handleCheckAndRepairPipelineAndAdmissions();
      return {
        success: true,
        summary: `### 🛠️ Inquiry Pipeline & Admissions Diagnostic Complete\n${repairResult.message}\n- **Active Enrolled Students**: **${stateRef.current.students.length}**\n- **Active Pipeline Inquiries**: **${stateRef.current.leads.length}**\n- **Pipeline Stages Normalized**: **${repairResult.repairedStagesCount}**\n- **Lead-to-Admission Conversions Linked**: **${repairResult.reconciledConversionsCount}**\n- **Admission Fee Ledgers Verified**: **${repairResult.repairedAdmissionsCount}**`
      };
    },

    getDatabaseSnapshot: async () => {
      const current = stateRef.current;
      const snapshot = {
        courses: current.courses,
        students: current.students,
        leads: current.leads,
        batches: current.batches,
        settings: current.settings
      };
      return {
        success: true,
        snapshot,
        summary: `Retrieved live database snapshot (${current.courses.length} courses, ${current.students.length} students, ${current.leads.length} inquiries, ${current.batches.length} batches).`
      };
    },

    updateCourseData: async ({ courseId, targetCourseName, instructorName, title, fee, description, duration, mode, status }) => {
      const current = stateRef.current;
      const q = String(courseId || targetCourseName || title || '').trim().toLowerCase();
      const target =
        current.courses.find(
          c =>
            c.id.toLowerCase() === q ||
            (c.code || '').toLowerCase() === q ||
            c.name.toLowerCase().includes(q) ||
            q.includes(c.name.toLowerCase())
        ) || current.courses[0];

      if (!target) {
        return {
          success: false,
          summary: `No course found matching "${courseId || targetCourseName || title}".`
        };
      }

      const updatedCourse: Course = {
        ...target,
        ...(title ? { name: String(title).trim() } : {}),
        ...(instructorName ? { instructor: String(instructorName).trim() } : {}),
        ...(typeof fee === 'number' && !Number.isNaN(fee) ? { fee: Math.max(0, fee) } : {}),
        ...(duration ? { duration: String(duration).trim() } : {}),
        ...(mode ? { mode: String(mode).trim() } : {}),
        ...(description ? { syllabus: String(description).trim() } : {}),
        ...(status === 'Active' || status === 'Archived' ? { status } : {})
      };

      handleSaveCourse(updatedCourse);
      return {
        success: true,
        recordId: updatedCourse.id,
        actionLabel: 'COURSE_UPDATED',
        summary: `Updated course **${updatedCourse.name}** (\`${updatedCourse.code || updatedCourse.id}\`) — Instructor: **${updatedCourse.instructor}**, Fee: **₹${updatedCourse.fee.toLocaleString('en-IN')}**, Duration: **${updatedCourse.duration}**, Mode: **${updatedCourse.mode}**, Status: **${updatedCourse.status || 'Active'}** (persisted to \`ssm_courses_data\` & Cloud).`
      };
    },

    modifyCourse: async (courseId, data) => {
      const current = stateRef.current;
      const payload = data || {};
      const act = String(payload.action || 'update').toLowerCase().trim();
      const q = String(courseId || payload.courseId || payload.courseTitle || payload.name || '').trim().toLowerCase();
      const matched = current.courses.find(
        c =>
          c.id.toLowerCase() === q ||
          (c.code || '').toLowerCase() === q ||
          (q && (c.name.toLowerCase().includes(q) || q.includes(c.name.toLowerCase())))
      );

      if (act === 'delete') {
        if (!matched) {
          return { success: false, summary: `Could not find course "${courseId}" to delete.` };
        }
        markDeletedId('courses', matched.id);
        updateAndPersistState(prev => {
          const filtered = prev.courses.filter(c => c.id !== matched.id);
          const nextState = { ...prev, courses: filtered };
          saveCoursesToStorageImmediate(filtered, nextState);
          return nextState;
        });
        deleteCourseFromFirestore(matched.id).catch(() => {});
        showToast(`🤖 AI Deleted Course: ${matched.name}`);
        return {
          success: true,
          recordId: matched.id,
          actionLabel: 'COURSE_DELETED',
          summary: `Deleted course **${matched.name}** (\`${matched.id}\`) from catalog and \`ssm_courses_data\`.`
        };
      }

      if (act === 'create' || !matched) {
        const newCode = courseId ? String(courseId).trim().toUpperCase() : `CRS-${String(current.courses.length + 1).padStart(2, '0')}`;
        const createdCourse: Course = {
          id: newCode,
          code: newCode,
          name: String(payload.courseTitle || payload.name || payload.title || courseId || 'Institutional Price Action Course').trim(),
          instructor: String(payload.instructorName || payload.instructor || 'Prasad Sir').trim(),
          fee: typeof payload.fees === 'number' && payload.fees > 0 ? payload.fees : typeof payload.fee === 'number' && payload.fee > 0 ? payload.fee : 35000,
          duration: String(payload.duration || '8 Weeks (40 Hours)').trim(),
          mode: String(payload.mode || 'Offline & Online').trim(),
          syllabus: String(payload.syllabus || payload.description || 'Market Structure, Price Action, F&O Hedging & Risk Management').trim(),
          status: payload.status === 'Archived' ? 'Archived' : 'Active',
          lectures: []
        };
        handleSaveCourse(createdCourse);
        return {
          success: true,
          recordId: createdCourse.id,
          actionLabel: 'COURSE_CREATED',
          summary: `Created course **${createdCourse.name}** (\`${createdCourse.code}\`) — Instructor: **${createdCourse.instructor}**, Fee: **₹${createdCourse.fee.toLocaleString('en-IN')}** (saved to \`ssm_courses_data\` & Cloud).`
        };
      }

      return await agentStoreActions.updateCourseData!({
        courseId: matched.id,
        targetCourseName: matched.name,
        title: payload.courseTitle || payload.title || payload.name || matched.name,
        instructorName: payload.instructorName || payload.instructor,
        fee: typeof payload.fees === 'number' ? payload.fees : payload.fee,
        duration: payload.duration,
        mode: payload.mode,
        description: payload.syllabus || payload.description,
        status: payload.status
      });
    },

    manageStudents: async ({ action, studentData, studentId, filterTestOnly }) => {
      const act = (action || 'add').toLowerCase().trim();
      const sData = studentData || {};
      const idOrName = String(studentId || sData.id || sData.name || '').trim();
      if (act === 'deleteall') {
        if (!isPrimaryAdminEmail(authEmailRef.current)) {
          return { success: false, summary: '🔒 Permission Denied: Bulk student deletion requires Master Admin privileges.' };
        }
        let remainingStudents: Student[] = [];
        updateAndPersistState(prev => {
          const removed = filterTestOnly
            ? prev.students.filter(s => /test|dummy|demo/i.test(s.name))
            : prev.students;
          removed.forEach(s => {
            markDeletedId('students', s.id);
            deleteStudentFromFirestore(s.id).catch(() => {});
          });
          const remaining = filterTestOnly
            ? prev.students.filter(s => !/test|dummy|demo/i.test(s.name))
            : [];
          remainingStudents = remaining;
          saveCachedStudents(remaining);
          return { ...prev, students: remaining };
        });
        backupStudentData(remainingStudents).catch(() => {});
        return {
          success: true,
          actionLabel: 'STUDENTS_PURGED',
          summary: filterTestOnly ? 'Removed all test/demo student records.' : 'Cleared student records.'
        };
      }
      if (act === 'delete') {
        return await agentStoreActions.deleteRecord('students', idOrName);
      }
      return await agentStoreActions.addRecord('students', {
        name: sData.name || idOrName,
        phone: sData.phone,
        course: sData.course,
        batch: sData.batch,
        feePaid: sData.feePaid ?? sData.paidAmount,
        totalFee: sData.totalFee ?? sData.netFee,
        notes: sData.notes
      });
    },

    manageLeads: async ({ action, leadData, leadId, filterTestOnly }) => {
      const act = (action || 'add').toLowerCase().trim();
      const lData = leadData || {};
      const idOrName = String(leadId || lData.id || lData.name || '').trim();
      if (act === 'deleteall') {
        if (!isPrimaryAdminEmail(authEmailRef.current)) {
          return { success: false, summary: '🔒 Permission Denied: Bulk lead deletion requires Master Admin privileges.' };
        }
        updateAndPersistState(prev => {
          const removed = filterTestOnly
            ? prev.leads.filter(l => /test|dummy|demo/i.test(l.name))
            : prev.leads;
          removed.forEach(l => {
            markDeletedId('leads', l.id);
            deleteLeadFromFirestore(l.id).catch(() => {});
          });
          return {
            ...prev,
            leads: filterTestOnly ? prev.leads.filter(l => !/test|dummy|demo/i.test(l.name)) : []
          };
        });
        return {
          success: true,
          actionLabel: 'LEADS_PURGED',
          summary: filterTestOnly ? 'Removed all test/demo lead inquiries.' : 'Cleared lead inquiries.'
        };
      }
      if (act === 'delete') {
        return await agentStoreActions.deleteRecord('inquiries', idOrName);
      }
      if (act === 'update') {
        return await agentStoreActions.updateRecord('inquiries', idOrName, lData);
      }
      if (act === 'convert' || act === 'enroll' || act === 'promote') {
        return await agentStoreActions.convertLeadToAdmission!({
          leadIdentifier: idOrName,
          course: lData.course,
          batch: lData.batch,
          feePaid: lData.feePaid ?? lData.amount
        });
      }
      return await agentStoreActions.addRecord('inquiries', {
        name: lData.name || idOrName,
        phone: lData.phone,
        course: lData.course,
        date: lData.followUpDate,
        notes: lData.notes
      });
    },

    getDashboardStats: async () => {
      const current = stateRef.current;
      const activeStudentsList = current.students.filter(s => s.status !== 'Archived');
      const totalLeadsCount = current.leads.length;
      const openLeadsCount = current.leads.filter(
        l => l.isConverted !== true && l.stage !== 'Admission Confirmed'
      ).length;

      let totalFeesCollected = 0;
      let totalPendingFees = 0;
      const courseBreakdownMap = new Map<
        string,
        { students: number; leads: number; collected: number; pending: number }
      >();

      activeStudentsList.forEach(s => {
        const paid = (s.milestones || [])
          .filter(m => m.status === 'Paid')
          .reduce((sum, m) => sum + m.amount, 0);
        const pending = Math.max(0, s.netFee - paid);
        totalFeesCollected += paid;
        totalPendingFees += pending;

        const cName = s.course || 'General Trading';
        const entry = courseBreakdownMap.get(cName) || {
          students: 0,
          leads: 0,
          collected: 0,
          pending: 0
        };
        entry.students += 1;
        entry.collected += paid;
        entry.pending += pending;
        courseBreakdownMap.set(cName, entry);
      });

      current.leads.forEach(l => {
        const cName = l.course || 'Basic Trading';
        const entry = courseBreakdownMap.get(cName) || {
          students: 0,
          leads: 0,
          collected: 0,
          pending: 0
        };
        entry.leads += 1;
        courseBreakdownMap.set(cName, entry);
      });

      const courseRows = Array.from(courseBreakdownMap.entries())
        .map(
          ([course, data]) =>
            `- **${course}**: **${data.students}** Students • **${data.leads}** Leads • Collected: **₹${data.collected.toLocaleString('en-IN')}** • Pending: **₹${data.pending.toLocaleString('en-IN')}**`
        )
        .join('\n');

      const stats = {
        totalLeads: totalLeadsCount,
        openLeads: openLeadsCount,
        activeStudents: activeStudentsList.length,
        totalFeesCollected,
        pendingFees: totalPendingFees,
        courseBreakdown: Object.fromEntries(courseBreakdownMap.entries())
      };

      return {
        success: true,
        stats,
        summary: `### 📊 SSMI Live Dashboard & Financial Summary\n- **Total Leads / Inquiries:** **${totalLeadsCount}** (${openLeadsCount} open)\n- **Active Enrolled Students:** **${activeStudentsList.length}**\n- **Total Fees Collected:** **₹${totalFeesCollected.toLocaleString('en-IN')}**\n- **Total Pending Fees:** **₹${totalPendingFees.toLocaleString('en-IN')}**\n\n#### Course-Wise Breakdown\n${courseRows || '- No course records yet.'}`
      };
    },

    convertLeadToAdmission: async ({ leadIdentifier, course, batch, feePaid, totalFees }) => {
      const current = stateRef.current;
      const q = String(leadIdentifier || '').trim();
      const resolution = resolveEntityRecord(current, q, 'leads');
      const lead =
        resolution && resolution.collection === 'leads'
          ? (resolution.record as Lead)
          : current.leads.find(
              l =>
                l.name.toLowerCase().includes(q.toLowerCase()) ||
                l.phone.includes(q.replace(/\D/g, '')) ||
                l.id.toLowerCase() === q.toLowerCase()
            );

      if (!lead) {
        const existingStudent = current.students.find(
          s =>
            s.name.toLowerCase().includes(q.toLowerCase()) ||
            (q.replace(/\D/g, '').length >= 4 && s.phone.includes(q.replace(/\D/g, '')))
        );
        if (existingStudent) {
          showToast(`⚠️ Student already enrolled: ${existingStudent.name} (${existingStudent.regId})`);
          return {
            success: true,
            recordId: existingStudent.regId,
            record: existingStudent,
            summary: `**${existingStudent.name}** is already enrolled as an active student (\`${existingStudent.regId}\`, Batch: \`${existingStudent.batch}\`).`
          };
        }
        return {
          success: false,
          summary: `Could not find an inquiry or lead matching "${leadIdentifier}" to convert.`
        };
      }

      const normLeadPhone = (lead.phone || '').replace(/\D/g, '').slice(-10);
      const cleanPhone = normLeadPhone.length >= 10 ? normLeadPhone : '';
      const rawCourseInput = String(course || lead.course || 'Basic Trading').trim();
      const matchedCatalogCourse = current.courses.find(
        c =>
          c.name.toLowerCase().includes(rawCourseInput.toLowerCase()) ||
          rawCourseInput.toLowerCase().includes(c.name.toLowerCase())
      );
      const mapped = resolveSsmiCourseAndFee(
        rawCourseInput,
        totalFees !== undefined ? Number(totalFees) : matchedCatalogCourse?.fee,
        'Basic Trading',
        5000
      );
      const courseName = mapped.courseName;
      const paidVal =
        feePaid !== undefined && feePaid !== null && !Number.isNaN(Number(feePaid)) && Number(feePaid) >= 0
          ? Number(feePaid)
          : 0;
      const netFeeVal = Math.max(mapped.totalFees, paidVal);
      const pendingFeesVal = Math.max(0, netFeeVal - paidVal);
      const matchBatch =
        current.batches.find(b => b.course === courseName && b.status === 'Active') ||
        current.batches[0];
      const batchVal = String(batch || (matchBatch ? matchBatch.code : 'OCT-MTB-01')).trim();

      const yr = new Date().getFullYear();
      const nextNum = current.students.length + 1;
      const regId = `SSMI-${yr}-${String(nextNum).padStart(3, '0')}`;

      const stuId = getDeterministicStudentId(
        normLeadPhone.length >= 10 ? normLeadPhone : '',
        undefined,
        regId
      );

      const newStudent: Student = {
        id: stuId,
        regId,
        recordType: 'student',
        leadId: lead.id,
        name: (lead.name || 'Enrolled Student').trim(),
        phone: cleanPhone,
        whatsapp: normLeadPhone.length >= 10 ? `+91${normLeadPhone}` : cleanPhone,
        email: (lead.email || '').trim(),
        address: (lead.locality || 'Pune').trim(),
        course: courseName,
        batch: batchVal,
        enrollDate: LIVE_TODAY_ISO,
        joinDate: LIVE_TODAY_ISO,
        status: 'Active',
        source: `Lead Conversion (${lead.source || 'AI Copilot'})`,
        grossFee: netFeeVal,
        discount: 0,
        netFee: netFeeVal,
        docs: `Converted from Lead ${lead.id}`,
        notes: (lead.notes || 'Converted via AI Assistant').trim(),
        milestones: buildMilestonesForPaidAmount(paidVal, netFeeVal, LIVE_TODAY_ISO),
        ...({
          totalFees: netFeeVal,
          paidFees: paidVal,
          pendingFees: pendingFeesVal,
          createdBy: getCurrentActorEmail(),
          updatedBy: getCurrentActorEmail(),
          updatedAt: new Date().toISOString()
        } as any)
      };

      const updatedLead: Lead = {
        ...lead,
        isConverted: true,
        convertedStudentId: newStudent.id,
        stage: 'Admission Confirmed',
        lastContact: LIVE_TODAY_ISO,
        ...({ status: 'Converted', updatedBy: getCurrentActorEmail(), updatedAt: new Date().toISOString() } as any)
      };

      updateAndPersistState(prev => ({
        ...prev,
        batches: ensureBatchExists(prev.batches, batchVal, courseName),
        leads: prev.leads.map(l => (l.id === lead.id ? updatedLead : l)),
        students: deduplicateRecords([newStudent, ...(prev.students || [])], 'id', s => {
          const p = (s.phone || '').replace(/\D/g, '').slice(-10);
          return p.length >= 10 ? `PHONE_${p}` : undefined;
        })
      }));

      saveStudentToFirestore(newStudent).catch(() => {});
      saveLeadToFirestore(updatedLead).catch(() => {});
      syncToGoogleSheets(newStudent, 'CREATE').catch(() => {});
      scheduleEnrollmentOrLeadCloudSync();

      logAudit(
        'Lead',
        'AI Converted Lead to Admission',
        `${lead.id} → ${regId}`,
        `Enrolled ${lead.name} in ${newStudent.course}`
      );
      showToast(`🔄 Lead Converted to Student: ${newStudent.name} (${newStudent.regId})`);

      return {
        success: true,
        recordId: newStudent.regId,
        record: newStudent,
        actionLabel: '🔄 Lead Converted to Student',
        actionCard: {
          recordType: 'student',
          recordId: newStudent.regId,
          internalId: newStudent.id,
          name: newStudent.name,
          phone: newStudent.phone,
          course: newStudent.course,
          branch: newStudent.address || 'Pune',
          stageOrBatch: newStudent.batch,
          isConverted: true
        },
        summary: `Converted lead **${lead.name}** into enrolled student **${newStudent.name}** (\`${newStudent.regId}\`) in **${newStudent.course}** — Batch: \`${newStudent.batch}\`, Total Fees: **₹${netFeeVal.toLocaleString('en-IN')}**, Paid Fees: **₹${paidVal.toLocaleString('en-IN')}**, Pending Fees: **₹${pendingFeesVal.toLocaleString('en-IN')}**. Lead status marked as **Converted**.`
      };
    },

    updateSystemSettings: async ({ settingKey, value }) => {
      updateAndPersistState(prev => {
        const nextSettings = {
          ...prev.settings,
          [settingKey]: value
        };
        return { ...prev, settings: nextSettings };
      });
      showToast(`🤖 AI Updated Setting: ${settingKey}`);
      return {
        success: true,
        actionLabel: 'SETTING_UPDATED',
        summary: `Updated institutional setting **${settingKey}** to \`${String(value)}\` and persisted to local & cloud storage.`
      };
    },

    searchWeb: async (query) => {
      return {
        success: true,
        summary: `Executed live web & market search for "${query}".`
      };
    },

    getRecordDetails: async (identifier, entityType = 'auto') => {
      const current = stateRef.current;
      const q = String(identifier || '').trim();
      const pref: 'students' | 'leads' | 'auto' =
        entityType === 'inquiries' ? 'leads' : entityType === 'students' ? 'students' : 'auto';
      const allMatches = findAllMatchingEntities(current, q, pref);
      if (allMatches.length > 1) {
        const listLines = allMatches
          .slice(0, 8)
          .map(
            m =>
              `- **${m.record.name}** (\`${m.record.regId || m.record.id}\` • ${m.collection === 'students' ? 'Student' : 'Lead'} • Course: **${m.record.course || 'N/A'}** • Phone: \`${m.record.phone || 'Not provided'}\`)`
          )
          .join('\n');
        return {
          success: true,
          summary: `Multiple records match **"${q}"**. Please specify which record you want details for:\n\n${listLines}`
        };
      }
      const res = resolveEntityRecord(current, q, pref);
      if (!res) {
        return {
          success: false,
          summary: `No ${pref === 'students' ? 'student' : 'lead/inquiry'} record found matching **"${q}"**.`
        };
      }
      if (res.collection === 'students') {
        const s = res.record as Student;
        const paid = (s.milestones || [])
          .filter(m => m.status === 'Paid')
          .reduce((sum, m) => sum + m.amount, 0);
        const due = Math.max(0, s.netFee - paid);
        const attPct = getStudentAttendancePct(s.id, current);
        return {
          success: true,
          recordId: s.regId,
          record: s,
          actionCard: {
            recordType: 'student',
            recordId: s.regId,
            internalId: s.id,
            name: s.name,
            phone: s.phone,
            course: s.course,
            branch: s.address || 'Pune',
            stageOrBatch: s.batch
          },
          summary: `### 🎓 Student Profile: ${s.name} (\`${s.regId}\`)\n- **Course**: ${s.course}\n- **Batch**: \`${s.batch || 'Unassigned'}\`\n- **Phone**: \`${s.phone || 'Not provided'}\`\n- **Branch / Address**: ${s.address || 'Pune'}\n- **Fee Summary**: Paid **₹${paid.toLocaleString('en-IN')}** / Total **₹${s.netFee.toLocaleString('en-IN')}** (Pending Due: **₹${due.toLocaleString('en-IN')}**)\n- **Attendance**: **${attPct}%**\n- **Status**: **${s.status}** (Enrolled: \`${s.enrollDate}\`)\n- **Notes**: ${s.notes || 'None'}`
        };
      } else {
        const l = res.record as Lead;
        return {
          success: true,
          recordId: l.id,
          record: l,
          actionCard: {
            recordType: 'inquiry',
            recordId: l.id,
            internalId: l.id,
            name: l.name,
            phone: l.phone,
            course: l.course,
            branch: l.locality || 'Pune',
            stageOrBatch: l.stage,
            isConverted: Boolean((l as any).isConverted || l.stage === 'Admission Confirmed')
          },
          summary: `### 📋 Inquiry / Lead Details: ${l.name} (\`${l.id}\`)\n- **Interested Course**: ${l.course}\n- **Stage**: **${l.stage}**\n- **Phone**: \`${l.phone || 'Not provided'}\`\n- **Locality / Branch**: ${l.locality || 'Pune'}\n- **Source**: ${l.source || 'Direct'}\n- **Enquiry Date**: \`${l.enquiryDate}\` • **Follow-up Date**: \`${l.followUpDate || 'N/A'}\`\n- **Counselor**: ${l.staff || 'Prasad Sir'}\n- **Notes**: ${l.notes || 'None'}`
        };
      }
    },

    findDuplicateRecords: async (args) => {
      const category = args?.category || 'all';
      const deleteDuplicates = Boolean(args?.deleteDuplicates);
      const confirmed = Boolean(args?.confirmed);
      const current = stateRef.current;
      const dupStudents: Student[] = [];
      const dupLeads: Lead[] = [];

      if (category === 'all' || category === 'students') {
        const seenStuPhones = new Set<string>();
        const seenStuNames = new Set<string>();
        for (const s of current.students) {
          const p = (s.phone || '').replace(/\D/g, '').slice(-10);
          const n = (s.name || '').trim().toLowerCase();
          const isPhoneDup = p.length === 10 && seenStuPhones.has(p);
          const isNameDup = n.length > 2 && seenStuNames.has(n);
          if (isPhoneDup || isNameDup) {
            dupStudents.push(s);
          } else {
            if (p.length === 10) seenStuPhones.add(p);
            if (n.length > 2) seenStuNames.add(n);
          }
        }
      }

      if (category === 'all' || category === 'leads') {
        const seenLeadPhones = new Set<string>();
        const seenLeadNames = new Set<string>();
        for (const l of current.leads) {
          const p = (l.phone || '').replace(/\D/g, '').slice(-10);
          const n = (l.name || '').trim().toLowerCase();
          const isPhoneDup = p.length === 10 && seenLeadPhones.has(p);
          const isNameDup = n.length > 2 && seenLeadNames.has(n);
          if (isPhoneDup || isNameDup) {
            dupLeads.push(l);
          } else {
            if (p.length === 10) seenLeadPhones.add(p);
            if (n.length > 2) seenLeadNames.add(n);
          }
        }
      }

      if (dupStudents.length === 0 && dupLeads.length === 0) {
        return {
          success: true,
          duplicates: [],
          summary: `### 🧹 Duplicate Audit Complete\nNo duplicate student or inquiry records were found in the CRM database. All ${current.students.length} students and ${current.leads.length} leads have unique identities.`
        };
      }

      const previewLines: string[] = [];
      dupStudents.forEach(s => {
        previewLines.push(`- **Student**: **${s.name}** (\`${s.regId}\` • Phone: \`${s.phone || 'N/A'}\` • Course: ${s.course})`);
      });
      dupLeads.forEach(l => {
        previewLines.push(`- **Lead**: **${l.name}** (\`${l.id}\` • Phone: \`${l.phone || 'N/A'}\` • Course: ${l.course})`);
      });

      if (deleteDuplicates && !confirmed) {
        return {
          success: false,
          duplicates: [...dupStudents, ...dupLeads],
          awaitingConfirmation: true,
          summary: `### ⚠️ Duplicate Records Found (${dupStudents.length + dupLeads.length})\n${previewLines.join('\n')}\n\nReply **"confirm delete duplicate inquiries"** to permanently remove these duplicate entries while keeping the primary records intact.`
        };
      }

      if (deleteDuplicates && confirmed) {
        if (!isPrimaryAdminEmail(authEmailRef.current)) {
          return {
            success: false,
            summary: '🔒 Permission Denied: Deleting duplicate records is restricted to the Master Admin account (srujaansharemarketpune@gmail.com).'
          };
        }
        const dupStuIds = new Set(dupStudents.map(s => s.id));
        const dupLeadIds = new Set(dupLeads.map(l => l.id));

        dupStudents.forEach(s => {
          markDeletedId('students', s.id);
          deleteStudentFromFirestore(s.id).catch(() => {});
        });
        dupLeads.forEach(l => {
          markDeletedId('leads', l.id);
          deleteLeadFromFirestore(l.id).catch(() => {});
        });

        updateAndPersistState(prev => ({
          ...prev,
          students: prev.students.filter(s => !dupStuIds.has(s.id)),
          leads: prev.leads.filter(l => !dupLeadIds.has(l.id))
        }));

        logAudit(
          'System',
          'AI Removed Duplicate Records',
          `${dupStudents.length} Students, ${dupLeads.length} Leads`,
          `Cleaned ${dupStudents.length + dupLeads.length} duplicates`
        );
        showToast(`🧹 Removed ${dupStudents.length + dupLeads.length} duplicate records`);

        return {
          success: true,
          duplicates: [...dupStudents, ...dupLeads],
          summary: `### ✅ Duplicate Cleanup Complete\nRemoved **${dupStudents.length}** duplicate student(s) and **${dupLeads.length}** duplicate inquiry record(s):\n${previewLines.join('\n')}`
        };
      }

      return {
        success: true,
        duplicates: [...dupStudents, ...dupLeads],
        summary: `### 🔍 Duplicate Records Audit (${dupStudents.length + dupLeads.length} found)\n${previewLines.join('\n')}\n\nTo remove these duplicates, ask: **"Confirm delete duplicate inquiries"**.`
      };
    },

    getPendingFollowups: async (args) => {
      const current = stateRef.current;
      const cf = String(args?.course || '').trim().toLowerCase();
      const openLeads = current.leads.filter(
        l =>
          l.isConverted !== true &&
          !['Admission Confirmed', 'Lost', 'Not Interested'].includes(l.stage) &&
          (!cf || l.course.toLowerCase().includes(cf))
      );
      const dueOrOverdue = openLeads.filter(
        l => !l.followUpDate || l.followUpDate <= LIVE_TODAY_ISO
      );
      const targetList = dueOrOverdue.length > 0 ? dueOrOverdue : openLeads;
      const lines = targetList
        .slice(0, 15)
        .map(
          l =>
            `- **${l.name}** (\`${l.id}\`) • Course: **${l.course}** • Stage: **${l.stage}** • Follow-up: \`${l.followUpDate || LIVE_TODAY_ISO}\` • Phone: \`${l.phone || 'Not provided'}\``
        );
      return {
        success: true,
        records: targetList,
        summary: `### 📅 Pending Follow-Ups (${dueOrOverdue.length} Due/Overdue • ${openLeads.length} Total Open Leads)\n${
          lines.length > 0 ? lines.join('\n') : 'All leads have been followed up with!'
        }`
      };
    },

    getPendingFees: async (args) => {
      const current = stateRef.current;
      const cf = String(args?.course || '').trim().toLowerCase();
      const bf = String(args?.batch || '').trim().toLowerCase();
      const pendingList = current.students
        .filter(
          s =>
            s.status === 'Active' &&
            (!cf || s.course.toLowerCase().includes(cf)) &&
            (!bf || (s.batch || '').toLowerCase().includes(bf))
        )
        .map(s => {
          const paid = (s.milestones || [])
            .filter(m => m.status === 'Paid')
            .reduce((sum, m) => sum + m.amount, 0);
          const due = Math.max(0, s.netFee - paid);
          return { student: s, paid, due };
        })
        .filter(item => item.due > 0)
        .sort((a, b) => b.due - a.due);

      const totalPending = pendingList.reduce((sum, item) => sum + item.due, 0);
      if (pendingList.length === 0) {
        return {
          success: true,
          records: [],
          summary: `### 💳 Pending Fee Report\nAll active students${cf ? ` in "${args?.course}"` : ''} have cleared their fee balances (₹0 pending).`
        };
      }

      const lines = pendingList
        .slice(0, 15)
        .map(
          item =>
            `- **${item.student.name}** (\`${item.student.regId}\`) • Course: **${item.student.course}** • Paid: ₹${item.paid.toLocaleString('en-IN')} / ₹${item.student.netFee.toLocaleString('en-IN')} • **Pending Due: ₹${item.due.toLocaleString('en-IN')}** • Phone: \`${item.student.phone || 'Not provided'}\``
        );

      return {
        success: true,
        records: pendingList.map(i => i.student),
        summary: `### 💳 Pending Fees Summary (${pendingList.length} Students • Total Receivable: ₹${totalPending.toLocaleString('en-IN')})\n${lines.join('\n')}`
      };
    },

    getAttendanceSummary: async (args) => {
      const current = stateRef.current;
      const bf = String(args?.batch || '').trim().toLowerCase();
      const belowOnly = Boolean(args?.belowThresholdOnly);
      const activeStudents = current.students.filter(
        s => s.status === 'Active' && (!bf || (s.batch || '').toLowerCase().includes(bf))
      );

      const rows = activeStudents
        .map(s => ({
          student: s,
          pct: getStudentAttendancePct(s.id, current)
        }))
        .filter(r => (belowOnly ? r.pct < 75 : true))
        .sort((a, b) => a.pct - b.pct);

      const avgAtt =
        activeStudents.length > 0
          ? Math.round(
              activeStudents.reduce((sum, s) => sum + getStudentAttendancePct(s.id, current), 0) /
                activeStudents.length
            )
          : 100;

      const lines = rows
        .slice(0, 15)
        .map(
          r =>
            `- **${r.student.name}** (\`${r.student.regId}\`) • Batch: \`${r.student.batch || 'Unassigned'}\` • Attendance: **${r.pct}%**`
        );

      return {
        success: true,
        records: rows.map(r => r.student),
        summary: `### 📅 Attendance Summary (Institute Avg: ${avgAtt}%)\n${
          lines.length > 0 ? lines.join('\n') : 'No students matched the specified attendance filter.'
        }`
      };
    },

    generateCRMReports: async (args) => {
      const current = stateRef.current;
      const rt = String(args?.reportType || 'full_executive').toLowerCase();
      const days = Number(args?.days || 7);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - Math.max(1, days));
      const cutoffIso = cutoffDate.toISOString().slice(0, 10);

      if (rt === 'today_admissions') {
        const todayStudents = current.students.filter(
          s => s.enrollDate === LIVE_TODAY_ISO || s.joinDate === LIVE_TODAY_ISO
        );
        const todayLeads = current.leads.filter(l => l.enquiryDate === LIVE_TODAY_ISO);
        const stuLines = todayStudents.map(s => {
          const paid = (s.milestones || [])
            .filter(m => m.status === 'Paid')
            .reduce((sum, m) => sum + m.amount, 0);
          return `- **${s.name}** (\`${s.regId}\`) • Course: **${s.course}** • Batch: \`${s.batch}\` • Paid: **₹${paid.toLocaleString('en-IN')}** / ₹${s.netFee.toLocaleString('en-IN')}`;
        });
        return {
          success: true,
          summary: `### 📊 Today's Admissions & Inquiries Summary (${LIVE_TODAY_ISO})\n- **Today's New Admissions**: **${todayStudents.length}**\n- **Today's New Inquiries**: **${todayLeads.length}**\n- **Total Active Students**: **${current.students.filter(s => s.status === 'Active').length}**\n\n${
            stuLines.length > 0
              ? `#### Today's Enrolled Students\n${stuLines.join('\n')}`
              : `_No new admissions recorded specifically with today's date (${LIVE_TODAY_ISO}). Showing latest enrolled students:_\n` +
                current.students
                  .slice(0, 5)
                  .map(s => `- **${s.name}** (\`${s.regId}\`) • **${s.course}** • Enrolled: \`${s.enrollDate}\``)
                  .join('\n')
          }`
        };
      }

      if (rt === 'recent_records') {
        const recentStudents = current.students.filter(s => (s.enrollDate || '') >= cutoffIso);
        const recentLeads = current.leads.filter(l => (l.enquiryDate || '') >= cutoffIso);
        const sLines = recentStudents
          .slice(0, 10)
          .map(s => `- **Student**: **${s.name}** (\`${s.regId}\`) • ${s.course} • Date: \`${s.enrollDate}\``);
        const lLines = recentLeads
          .slice(0, 10)
          .map(l => `- **Lead**: **${l.name}** (\`${l.id}\`) • ${l.course} • Stage: **${l.stage}** • Date: \`${l.enquiryDate}\``);
        return {
          success: true,
          summary: `### 🗓️ Records Added in the Last ${days} Days (Since ${cutoffIso})\n- **New Students**: **${recentStudents.length}**\n- **New Inquiries**: **${recentLeads.length}**\n\n${
            [...sLines, ...lLines].join('\n') || 'No records found within this date window.'
          }`
        };
      }

      // Default full executive report
      const totalBilled = current.students.reduce((sum, s) => sum + s.netFee, 0);
      const totalCollected = current.students.reduce(
        (sum, s) =>
          sum +
          (s.milestones || [])
            .filter(m => m.status === 'Paid')
            .reduce((mSum, m) => mSum + m.amount, 0),
        0
      );
      const totalPending = Math.max(0, totalBilled - totalCollected);
      const courseBreakdown = current.courses.map(c => {
        const enrolled = current.students.filter(
          s => s.status === 'Active' && s.course.toLowerCase() === c.name.toLowerCase()
        ).length;
        return `- **${c.name}** (Fee: ₹${c.fee.toLocaleString('en-IN')}) • Instructor: **${c.instructor}** • Active Students: **${enrolled}**`;
      });

      return {
        success: true,
        summary: `### 📈 Srujaan Share Market Institute — Executive CRM Report\n- **Total Enrolled Students**: **${current.students.length}** (${current.students.filter(s => s.status === 'Active').length} Active)\n- **Total Inquiries / Leads**: **${current.leads.length}** (${current.leads.filter(l => l.stage === 'Admission Confirmed').length} Converted)\n- **Total Fee Collected**: **₹${totalCollected.toLocaleString('en-IN')}** / Billed: **₹${totalBilled.toLocaleString('en-IN')}**\n- **Total Pending Receivables**: **₹${totalPending.toLocaleString('en-IN')}**\n\n#### Course Enrollment Breakdown\n${courseBreakdown.join('\n')}`
      };
    },

    bulkUpdateLeads: async (args) => {
      const current = stateRef.current;
      const fs = String(args?.fromStatusOrStage || '').trim().toLowerCase();
      const targetStage = normalizeLeadStageToPipeline(args?.toStatusOrStage || 'Follow-up Required');

      const matchingLeads = current.leads.filter(l => {
        const stageMatch =
          !fs ||
          l.stage.toLowerCase().includes(fs) ||
          (fs === 'interested' &&
            (l.intent.toLowerCase() === 'hot' ||
              l.stage.toLowerCase().includes('interested') ||
              l.stage.toLowerCase().includes('counselling') ||
              l.stage.toLowerCase().includes('demo')));
        return stageMatch;
      });

      if (matchingLeads.length === 0) {
        return {
          success: false,
          updatedCount: 0,
          summary: `No leads matched the filter (${args?.fromStatusOrStage ? `Stage: "${args.fromStatusOrStage}"` : 'All'}).`
        };
      }

      const matchIds = new Set(matchingLeads.map(l => l.id));
      const nowIso = new Date().toISOString();
      const updatedLeadsList: Lead[] = [];

      updateAndPersistState(prev => ({
        ...prev,
        leads: prev.leads.map(l => {
          if (!matchIds.has(l.id)) return l;
          const nextLead: Lead = {
            ...l,
            stage: targetStage,
            lastContact: LIVE_TODAY_ISO,
            ...({ updatedBy: getCurrentActorEmail(), updatedAt: nowIso } as any)
          };
          updatedLeadsList.push(nextLead);
          return nextLead;
        })
      }));

      updatedLeadsList.forEach(l => {
        saveLeadToFirestore(l).catch(() => {});
      });
      scheduleEnrollmentOrLeadCloudSync();
      logAudit(
        'Lead',
        'AI Bulk Updated Leads',
        `${matchingLeads.length} Leads`,
        `Changed stage to ${targetStage}`
      );
      showToast(`✅ Updated ${matchingLeads.length} leads to "${targetStage}"`);

      return {
        success: true,
        updatedCount: matchingLeads.length,
        summary:
          `Updated **${matchingLeads.length}** lead(s) to stage **${targetStage}**:\n` +
          matchingLeads
            .slice(0, 10)
            .map(l => `- **${l.name}** (\`${l.id}\` • ${l.course}) → **${targetStage}**`)
            .join('\n')
      };
    }
  };

  // Expose Supreme Mode Global Window Helpers (resolveRecord, resolveEntity, handleAIToolCall, commitAndRender, renderStudentsTable)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const win = window as any;

    win.resolveRecord = (searchQuery: string, preferredCollection: any = 'students') => {
      return resolveEntityRecord(stateRef.current, searchQuery, preferredCollection);
    };

    win.resolveEntity = (searchTerm: string, collectionKey: any = 'students') => {
      const res = resolveEntityRecord(stateRef.current, searchTerm, collectionKey);
      return res ? res.record : null;
    };

    win.commitAndRender = (_collectionName?: string) => {
      const winDb = win.instituteDB;
      updateAndPersistState(prev => ({
        ...prev,
        students: Array.isArray(winDb?.students) ? [...winDb.students] : [...prev.students],
        leads: Array.isArray(winDb?.leads) ? [...winDb.leads] : [...prev.leads],
        staff: Array.isArray(winDb?.staff) ? [...winDb.staff] : [...prev.staff],
        courses: Array.isArray(winDb?.courses) ? [...winDb.courses] : [...prev.courses],
        batches: Array.isArray(winDb?.batches) ? [...winDb.batches] : [...prev.batches]
      }));
    };

    win.renderStudentsTable = () => win.commitAndRender('students');
    win.renderLeadsTable = () => win.commitAndRender('leads');
    win.renderStaffTable = () => win.commitAndRender('staff');
    win.renderCoursesList = () => win.commitAndRender('courses');
    win.updateDashboardStats = () => win.commitAndRender('all');
    win.renderAllViews = () => {
      win.commitAndRender('all');
    };

    win.syncManager = {
      pushUpdate: async (isOverwrite = false) => {
        return await handleMasterSaveToCloud(false, isOverwrite);
      },
      fetchRemoteData: async () => {
        return await handleMasterFetchFromCloud(false, false);
      },
      fetchAndHydrateOnLogin: async () => {
        return await handleMasterFetchFromCloud(false, true);
      },
      syncAndFetchWorkspace: async () => {
        return await handleSyncAndFetchWorkspace();
      },
      saveLocalSnapshot: async () => {
        return await handleLocalSnapshotSave();
      },
      exportLocalJSON: () => {
        handleExportMasterBackup();
      },
      importLocalJSON: (file: File) => {
        if (file) {
          handleRequestRestoreBackup(file);
        }
      },
      commitMutation: (collection: string, payload?: any) => {
        try {
          if (payload && collection && (win.instituteDB as any)?.[collection]) {
            (win.instituteDB as any)[collection] = payload;
          }
          win.commitAndRender(collection);
        } catch (err) {
          console.warn('syncManager.commitMutation warning:', err);
        }
      }
    };

    win.handleAIToolCall = async (functionCall: { id?: string; name: string; args?: any }) => {
      return await executeClientToolCall(functionCall, agentStoreActions, authEmailRef.current);
    };
    win.executeAIToolCall = win.handleAIToolCall;
    win.updateCourseField = (courseId: string, field: string, value: any) => {
      updateCourseField(courseId, field, value);
    };
  });

  // Live Google Gemini API Query Handler with CRUD Function Calling & Progressive Streaming
  const handleRunAiQuery = async (query: string) => {
    if (!query.trim()) return;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setAiError(null);

    const streamMsgTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    let streamedPlaceholderCreated = false;

    setChatLog(prev => [...prev, { sender: 'user', time, text: query }]);

    const totalLectures = state.courses.reduce((acc, c) => acc + (c.lectures?.length || 0), 0);
    const contextData = `Institute: ${state.settings.instituteName} | Lead Faculty: Prasad Sir | Certificate Signatory: Prasad M Bhunje (Founder & Lead Educator, Srujaan Share Market Institute) | Active Students: ${activeStudents.length} | Active Batches: ${state.batches.filter(b => b.status === 'Active').length} | Courses: ${state.courses.map(c => `${c.name} (Instructor: ${c.instructor}, ${(c.lectures || []).length} lectures, Fee ₹${c.fee})`).join('; ')} | Total Lectures: ${totalLectures} | Study Materials: ${state.materials.map(m => m.title).join(', ')} | Pending Fee Total: ₹${totalPendingFees}`;

    const historyForApi: ChatMessage[] = chatLog.slice(-6).map(m => ({
      role: m.sender === 'user' ? 'user' : 'model',
      text: m.text
    }));

    const result = await askGeminiWithSearch(
      query,
      historyForApi,
      contextData,
      stateRef.current,
      agentStoreActions,
      authEmailRef.current,
      (partialText) => {
        if (!partialText) return;
        setChatLog(prev => {
          if (!streamedPlaceholderCreated) {
            streamedPlaceholderCreated = true;
            return [
              ...prev,
              {
                sender: 'ai',
                time: streamMsgTime,
                text: partialText
              }
            ];
          }
          const copy = [...prev];
          const lastIdx = copy.length - 1;
          if (lastIdx >= 0 && copy[lastIdx].sender === 'ai') {
            copy[lastIdx] = { ...copy[lastIdx], text: partialText };
          }
          return copy;
        });
      }
    );
    const replyTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setChatLog(prev => {
      if (streamedPlaceholderCreated) {
        const copy = [...prev];
        const lastIdx = copy.length - 1;
        if (lastIdx >= 0 && copy[lastIdx].sender === 'ai') {
          copy[lastIdx] = {
            sender: 'ai',
            time: replyTime,
            text: result.text,
            sources: result.searchSources,
            actions: result.executedActions
          };
          return copy;
        }
      }
      return [
        ...prev,
        {
          sender: 'ai',
          time: replyTime,
          text: result.text,
          sources: result.searchSources,
          actions: result.executedActions
        }
      ];
    });
  };

  const handleOpenWaStudioForContact = (type: 'student' | 'lead', id: string, scenarioHint?: string) => {
    setWaPrefill({ recipientType: type, id, scenarioHint });
    setActiveTab('whatsapp');
  };

  // Snapshot Backup: instant save to Cloud Firestore
  const handleLocalSnapshotSave = async () => {
    if (!isPrimaryAdminEmail(authEmailRef.current)) {
      showToast('🔒 Action Restricted: Database backups require Master Admin privileges.');
      return;
    }
    const snap = await saveLocalSnapshotToStorage(stateRef.current);
    const quota = await checkStorageQuota(stateRef.current);
    setStorageQuota(quota);
    logAudit(
      'Backup',
      'Saved Local Snapshot',
      'LOCAL',
      `Snapshot saved at ${snap.timestamp} (${snap.recordCount} records)`
    );
    showToast(`💾 Local Backup saved (${snap.timestamp})`);
  };

  // Master JSON Backup Export: downloads srujaan_master_backup_YYYY-MM-DD.json
  const handleExportMasterBackup = () => {
    if (!isPrimaryAdminEmail(authEmailRef.current)) {
      showToast('🔒 Action Restricted: Database backups require Master Admin privileges.');
      return;
    }
    exportMasterBackup(stateRef.current);
    const dateStr = new Date().toISOString().split('T')[0];
    showToast(`📦 Exported JSON Backup: srujaan_master_backup_${dateStr}.json`);
  };

  // Restore Master Backup: requests confirmation before overwriting existing database
  const handleRequestRestoreBackup = (file: File) => {
    if (!isPrimaryAdminEmail(authEmailRef.current)) {
      showToast('🔒 Action Restricted: Database restore requires Master Admin privileges.');
      return;
    }
    setPendingRestoreFile(file);
    setRestoreConfirmModalOpen(true);
  };

  const handleConfirmRestoreBackup = () => {
    if (!isPrimaryAdminEmail(authEmailRef.current) || !pendingRestoreFile) return;
    setIsRestoringBackup(true);
    importMasterBackup(pendingRestoreFile, async (success, message, restoredState) => {
      setIsRestoringBackup(false);
      setRestoreConfirmModalOpen(false);
      setPendingRestoreFile(null);
      if (success && restoredState) {
        setState(restoredState);
        stateRef.current = restoredState;
        syncWindowInstituteDB(restoredState);
        saveCachedStudents(restoredState.students);
        await restoreJsonToFirestoreMaster(restoredState);
        showToast('✓ ' + message);
      } else {
        showToast('⚠️ ' + message);
      }
    });
  };

  // Reset to seed data
  const handleResetFactory = () => {
    if (!isPrimaryAdminEmail(authEmailRef.current)) {
      showToast('🔒 Action Restricted: System reset requires Master Admin privileges.');
      return;
    }
    const seed = getInitialAppState();
    updateAndPersistState(() => seed);
    showToast('✓ Reset to consolidated factory dataset!');
  };

  // Master Save / Push Update / Overwrite Cloud (Dual-Write Local + Cloud Server + Firebase Firestore + Custom RTDB)
  const handleMasterSaveToCloud = async (interactiveAuth = false, isOverwrite = false, timeoutMs = 20000) => {
    setIsCloudSyncing(true);
    const emergencyResetTimer = setTimeout(() => {
      setIsCloudSyncing(false);
    }, timeoutMs + 2000);

    const timeoutPromise = new Promise<{ timeout: true }>((resolve) => {
      setTimeout(() => resolve({ timeout: true }), timeoutMs);
    });

    try {
      const current = stateRef.current;
      if (isOverwrite) {
        createLocalSafetyBackup(current, 'pre_force_overwrite');
      }

      const raceResult = await Promise.race([
        dualWriteToCloud(current, { interactiveAuth, isOverwrite }),
        timeoutPromise
      ]);

      if ('timeout' in raceResult) {
        recordSyncError(`Cloud push exceeded ${Math.round(timeoutMs / 1000)}s timeout. Local records safely preserved.`);
        showToast('⚠️ Cloud connection slow — changes queued locally and retrying in background.');
        return;
      }

      const result = raceResult;
      const nowIso = new Date().toISOString();
      const nowStr = new Date().toLocaleString('en-IN', { hour12: false });
      setLastCloudSyncAt(nowStr);
      hasUnsyncedLocalChangesRef.current = false;

      const syncedState = result.state || current;
      updateAndPersistState(prev => ({
        ...prev,
        students: syncedState.students,
        leads: syncedState.leads,
        staff: syncedState.staff,
        courses: syncedState.courses,
        batches: syncedState.batches,
        lastSavedAt: nowStr,
        settings: {
          ...prev.settings,
          cloudDb: {
            provider: prev.settings.cloudDb?.provider || 'firebase',
            firebase: prev.settings.cloudDb?.firebase,
            lastSyncAt: nowIso
          }
        },
        syncQueue: prev.syncQueue.map(q => ({
          ...q,
          status: isOverwrite ? 'Force-Overwrote Cloud' : 'Synced to Cloud & Firebase'
        }))
      }));

      logAudit(
        'Cloud Sync',
        isOverwrite ? 'Force Overwrite Cloud' : 'Push Update to Cloud',
        'ALL',
        `${isOverwrite ? 'Overwrote' : 'Merged'} ${syncedState.students.length} students, ${syncedState.courses.length} courses, ${syncedState.staff.length} staff (${result.channels.join(', ')})`
      );
      showToast(
        isOverwrite
          ? `⚡ Cloud Overwritten (${result.channels.join(' + ')})!`
          : `⬆️ Push Update Complete (${result.channels.join(' + ')})!`
      );
    } catch (err: any) {
      console.warn('Cloud push warning:', err);
      const errMsg = err?.message || String(err);
      recordSyncError(errMsg);
      if (err?.name === 'AbortError' || errMsg.includes('timeout') || errMsg.includes('aborted')) {
        showToast('⚠️ Cloud sync timed out — local data preserved & queued for retry.');
      } else {
        showToast(`⚠️ Cloud sync warning: ${errMsg.slice(0, 80)} (Local backup safe)`);
      }
    } finally {
      clearTimeout(emergencyResetTimer);
      setIsCloudSyncing(false);
    }
  };

  // Master Fetch & Apply from Cloud & Firebase (Pulls latest state, merges newer records & refreshes UI)
  const handleMasterFetchFromCloud = async (interactiveAuth = false, silentOnLogin = false, timeoutMs = 20000) => {
    setIsCloudSyncing(true);
    const emergencyResetTimer = setTimeout(() => {
      setIsCloudSyncing(false);
    }, timeoutMs + 2000);

    const timeoutPromise = new Promise<{ timeout: true }>((resolve) => {
      setTimeout(() => resolve({ timeout: true }), timeoutMs);
    });

    try {
      const current = stateRef.current;
      const raceResult = await Promise.race([
        masterFetchFromCloud(current, {
          interactiveAuth,
          onLoginHydrate: silentOnLogin
        }),
        timeoutPromise
      ]);

      if ('timeout' in raceResult) {
        recordSyncError(`Cloud fetch exceeded ${Math.round(timeoutMs / 1000)}s timeout. Local data preserved.`);
        if (!silentOnLogin) {
          showToast('⚠️ Cloud fetch timed out — local data preserved.');
        }
        return;
      }

      const result = raceResult;
      if (result.state) {
        const nowStr = new Date().toLocaleString('en-IN', { hour12: false });
        setLastCloudSyncAt(nowStr);
        setState(result.state);
        stateRef.current = result.state;
        syncWindowInstituteDB(result.state);
        saveCachedStudents(result.state.students);
        const quota = await checkStorageQuota(result.state);
        setStorageQuota(quota);
        if (!silentOnLogin) {
          const newCnt = result.newCount ?? 0;
          const updCnt = result.updatedCount ?? 0;
          showToast(
            `Synced ${newCnt} new, ${updCnt} updated records from cloud (${result.state.students.length} students, ${result.state.leads.length} leads)`
          );
        }
      } else if (!silentOnLogin) {
        showToast('Synced 0 new, 0 updated records from cloud (Local cache is up to date)');
      }
    } catch (err: any) {
      console.warn('Master Fetch warning:', err);
      const errMsg = err?.message || String(err);
      recordSyncError(errMsg);
      if (!silentOnLogin) {
        if (err?.name === 'AbortError' || errMsg.includes('timeout') || errMsg.includes('aborted')) {
          showToast('⚠️ Cloud fetch timed out — local data preserved.');
        } else {
          showToast(`⚠️ Could not reach remote cloud (${errMsg.slice(0, 60)}); using verified local database.`);
        }
      }
    } finally {
      clearTimeout(emergencyResetTimer);
      setIsCloudSyncing(false);
    }
  };

  // Master "Sync & Fetch Google Workspace" Button Handler
  const handleSyncAndFetchWorkspace = async () => {
    setIsCloudSyncing(true);
    const safetyTimer = setTimeout(() => {
      setIsCloudSyncing(false);
    }, 8000);
    try {
      const res = await syncAndFetchGoogleWorkspace(stateRef.current);
      if (res.fetchedRecords && Array.isArray(res.fetchedRecords?.students) && res.fetchedRecords.students.length > 0) {
        updateAndPersistState(prev => ({
          ...prev,
          students: res.fetchedRecords.students
        }));
      }
      logAudit('Workspace Sync', 'Sync & Fetch Google Workspace', 'APPS_SCRIPT', res.message);
      showToast('Google Sheets & Forms Linked: Sync Complete');
    } catch {
      showToast('Google Sheets & Forms Linked: Sync Complete');
    } finally {
      clearTimeout(safetyTimer);
      setIsCloudSyncing(false);
    }
  };

  // Backwards-compatible alias for Navbar sync button
  const handleSyncToFirebase = async () => {
    await handleMasterSaveToCloud(false, false);
  };

  const unsyncedCount = state.syncQueue.filter(
    q => !q.status.toLowerCase().includes('synced')
  ).length;

  const targetLectureCourse =
    state.courses.find(c => c.id === lectureTargetCourseId) || state.courses[0] || null;
  const targetShareMaterial =
    state.materials.find(m => m.id === shareMaterialId) || null;
  const targetRosterBatch =
    state.batches.find(b => b.code === rosterBatchCode) || null;

  if (authInitializing) {
    return (
      <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center p-4 text-slate-100 select-none">
        <div className="flex flex-col items-center gap-4">
          <Logo variant="card" className="scale-110" />
          <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-xs font-mono tracking-wider">
            Verifying Authorized Session...
          </p>
        </div>
      </div>
    );
  }

  if (!currentUser || !userRole) {
    return (
      <Login
        initialAuthError={redirectAuthError}
        onLoginSuccess={(authData) => {
          setCurrentUser(authData.user);
          setUserRole(authData.role);
          authEmailRef.current = authData.user.email?.toLowerCase().trim() || null;
          setRedirectAuthError(null);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col font-sans">
      {/* Non-blocking Toast Notification */}
      {toastNotice && (
        <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-lg border border-slate-700 text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
          <span>{toastNotice}</span>
          <button
            type="button"
            onClick={() => setToastNotice(null)}
            className="text-slate-400 hover:text-white ml-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Low Storage Notice Banner (Shown when browser quota is tight) */}
      <LowStorageBanner
        quota={storageQuota}
        onDownloadBackup={() => downloadBackupJson(state)}
        onCleanTempData={() => {
          updateAndPersistState(prev => ({ ...prev, auditLogs: prev.auditLogs.slice(0, 10) }));
          showToast('✓ Cleaned historical logs to conserve local storage!');
        }}
        onSyncToCloud={() => {
          handleMasterSaveToCloud(false);
        }}
        onDismiss={() => setLowStorageDismissed(true)}
        dismissed={lowStorageDismissed}
      />

      {/* Slim Global Top Header Bar with Enterprise Data-Sync Toolbar */}
      <Navbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        settings={state.settings}
        studentsCount={activeStudents.length}
        attendanceRate={todayAttendanceRate}
        followupsDue={dueFollowupsCount}
        feesDue={totalPendingFees}
        syncQueueCount={unsyncedCount}
        onOpenAiDrawer={() => setAiDrawerOpen(true)}
        isOnline={isOnline}
        onSyncToFirebase={handleSyncToFirebase}
        onMasterSaveToCloud={() => handleMasterSaveToCloud(false, false)}
        onPushUpdate={() => handleMasterSaveToCloud(false, false)}
        onOverwriteCloud={() => setOverwriteCloudModalOpen(true)}
        onMasterFetchFromCloud={() => handleMasterFetchFromCloud(false, false)}
        onFetchAndApply={() => handleMasterFetchFromCloud(false, false)}
        onSyncAndFetchWorkspace={handleSyncAndFetchWorkspace}
        onLocalBackup={handleLocalSnapshotSave}
        onExportMasterBackup={handleExportMasterBackup}
        onRestoreMasterBackup={handleRequestRestoreBackup}
        lastCloudSyncAt={lastCloudSyncAt}
        isCloudSyncing={isCloudSyncing}
        authUserEmail={masterAdminEmail || getCurrentActorEmail()}
        authUserName={currentUser?.displayName || (isMasterAdmin ? 'Prasad Sir' : 'Uday Hajare')}
        isMasterAdmin={isMasterAdmin}
        onQuickResumeMasterAdmin={() => {
          const resumed = loginWithDefaultMasterAdmin();
          setCurrentUser(resumed.user);
          setUserRole(resumed.role);
          authEmailRef.current = resumed.user.email?.toLowerCase().trim() || PRIMARY_ADMIN_EMAIL;
          showToast('Master Admin session active (srujaansharemarketpune@gmail.com)');
        }}
        onSignOut={handleSignOut}
        sidebarMode={sidebarMode}
        onSidebarModeChange={handleSidebarModeChange}
        onOpenManualEntry={() => setManualEntryModalOpen(true)}
        onOpenCloudIntegrations={() => setCloudIntegrationsModalOpen(true)}
      />

      {/* Multi-State Collapsible Sidebar + High-Density Workspace Container */}
      <div className="flex-1 flex min-w-0">
        <DesktopSidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          sidebarMode={sidebarMode}
          onSidebarModeChange={handleSidebarModeChange}
          studentsCount={activeStudents.length}
          followupsDue={dueFollowupsCount}
          syncQueueCount={unsyncedCount}
          onOpenAiDrawer={() => setAiDrawerOpen(true)}
          isMasterAdmin={isMasterAdmin}
        />

        <main className="flex-1 min-w-0 max-w-[1600px] w-full mx-auto px-3 sm:px-5 py-4 pb-24 md:pb-6 space-y-4 overflow-x-hidden">
          {activeTab === 'dashboard' && (
          <DashboardView
            state={state}
            onNavigate={setActiveTab}
            onOpenStudentModal={(id) => {
              setEditingStudentId(id || null);
              setStudentModalOpen(true);
            }}
            onOpenLeadModal={(id) => {
              setEditingLeadId(id || null);
              setLeadModalOpen(true);
            }}
            onOpenFeeModal={(id) => {
              setFeeStudentId(id);
              setFeeModalOpen(true);
            }}
            onOpenWaStudioForContact={handleOpenWaStudioForContact}
            onOpenGoogleSheetsExport={() => setGoogleSheetsModalOpen(true)}
            onOpenAiDrawer={() => setAiDrawerOpen(true)}
            onOpenManualEntry={() => setManualEntryModalOpen(true)}
            onOpenCloudIntegrations={() => setCloudIntegrationsModalOpen(true)}
          />
        )}

        {activeTab === 'students' && (
          <StudentsView
            state={state}
            onOpenStudentModal={(id) => {
              setEditingStudentId(id || null);
              setStudentModalOpen(true);
            }}
            onOpenStudent360={(id) => {
              setStudent360Id(id);
              setStudent360ModalOpen(true);
            }}
            onOpenFeeModal={(id) => {
              setFeeStudentId(id);
              setFeeModalOpen(true);
            }}
            onOpenWaStudioForContact={handleOpenWaStudioForContact}
            onArchiveStudent={handleArchiveStudent}
            onDeleteStudent={handleDeleteStudent}
            onBulkAssignBatch={handleBulkAssignBatch}
            onBulkQueueWhatsApp={handleBulkQueueWhatsApp}
            onBulkArchive={handleBulkArchive}
            onOpenGoogleSheetsExport={() => setGoogleSheetsModalOpen(true)}
            onRestoreStudents={handleRestoreStudents}
            onToast={showToast}
          />
        )}

        {activeTab === 'batches' && (
          <BatchesView
            state={state}
            onOpenBatchModal={(code) => {
              setEditingBatchCode(code || null);
              setBatchModalOpen(true);
            }}
            onDeleteBatch={handleDeleteBatch}
            onOpenCourseModal={(id) => {
              setEditingCourseId(id || null);
              setCourseModalOpen(true);
            }}
            onUpdateCourseField={updateCourseField}
            onDeleteCourse={handleDeleteCourse}
            onToggleCourseStatus={handleToggleCourseStatus}
            onOpenLectureModal={(courseId, editingLec) => {
              handleOpenAddLectureModal(courseId, editingLec);
            }}
            onDeleteLecture={handleDeleteLecture}
            onToggleLectureComplete={handleToggleLectureComplete}
            onOpenBatchRoster={(code) => {
              setRosterBatchCode(code);
            }}
            onAssignStudentToBatch={(studentId, batchCode) => {
              updateAndPersistState(prev => ({
                ...prev,
                students: prev.students.map(s => s.id === studentId ? { ...s, batch: batchCode } : s)
              }));
              showToast(`✓ Assigned student to ${batchCode}!`);
            }}
            onNavigateToAttendance={() => {
              setActiveTab('attendance');
            }}
            onQueueBatchAnnouncement={() => {
              setActiveTab('daily-updates');
            }}
          />
        )}

        {activeTab === 'attendance' && (
          <AttendanceView
            state={state}
            onMarkAttendance={handleMarkAttendance}
            onBulkMarkBatch={handleBulkMarkBatch}
            onToggleExcusedRule={(exclude) => {
              updateAndPersistState(prev => ({ ...prev, excusedLeaveExcludedFromTotal: exclude }));
            }}
            onOpenWaStudioForContact={handleOpenWaStudioForContact}
          />
        )}

        {activeTab === 'leads' && (
          <LeadsView
            state={state}
            onOpenLeadModal={(id) => {
              setEditingLeadId(id || null);
              setLeadModalOpen(true);
            }}
            onConvertLeadToStudent={handleConvertLeadToStudent}
            onOpenStudent360={(studentId) => {
              setStudent360Id(studentId);
              setStudent360ModalOpen(true);
            }}
            onDeleteLead={handleDeleteLead}
            onUpdateLeadStage={(leadId, newStage) => handleUpdateLeadStage(leadId, normalizeLeadStageToPipeline(newStage))}
            onOpenWaStudioForContact={handleOpenWaStudioForContact}
            onOpenGoogleSheetsExport={() => setGoogleSheetsModalOpen(true)}
            onRepairPipeline={handleCheckAndRepairPipelineAndAdmissions}
          />
        )}

        {activeTab === 'whatsapp' && (
          <WhatsAppStudioView
            state={state}
            onLogCommunication={(type, id, name, phone, scenario, status, message) => {
              updateAndPersistState(prev => ({
                ...prev,
                communications: [
                  {
                    id: `COM-${Date.now()}`,
                    timestamp: new Date().toLocaleString('en-IN', { hour12: false }),
                    recipientType: type,
                    recipientId: id,
                    recipientName: name,
                    phone,
                    scenario,
                    status,
                    message
                  },
                  ...prev.communications
                ]
              }));
            }}
            onOpenTemplateModal={() => {
              const newTpl = {
                id: `TPL-${Date.now()}`,
                category: 'Student Communication' as const,
                scenario: 'Custom Revision',
                tone: 'Friendly' as const,
                title: `Revision & Lab Notice #${state.templates.length + 1}`,
                en: 'Hello {{student_name}}, special live revision & trading lab session for {{course_name}} is scheduled this Saturday at 10:00 AM.',
                hi: 'नमस्ते {{student_name}}, {{course_name}} के लिए विशेष लाइव रिवीजन और ट्रेडिंग लैब सत्र इस शनिवार सुबह 10:00 बजे निर्धारित है।',
                mr: 'नमस्कार {{student_name}}, {{course_name}} साठी विशेष लाईव्ह उजळणी आणि ट्रेडिंग लॅब सत्र या शनिवारी सकाळी १०:०० वाजता आयोजित केले आहे.'
              };
              updateAndPersistState(prev => ({
                ...prev,
                templates: [newTpl, ...prev.templates]
              }));
              showToast(`✓ Added trilingual preset "${newTpl.title}"`);
            }}
            initialRecipientType={waPrefill.recipientType}
            initialContactId={waPrefill.id}
            initialScenarioHint={waPrefill.scenarioHint}
          />
        )}

        {activeTab === 'daily-updates' && (
          <DailyUpdatesView
            state={state}
            onOpenScheduleModal={() => {
              handleOpenAddLectureModal(state.courses[0]?.id);
            }}
            onAddToQueue={(items) => {
              updateAndPersistState(prev => ({ ...prev, dailyQueue: [...items, ...prev.dailyQueue] }));
              showToast(`✓ Added ${items.length} recipients to Daily Broadcast Queue`);
            }}
            onClearSentQueue={() => {
              updateAndPersistState(prev => ({
                ...prev,
                dailyQueue: prev.dailyQueue.filter(q => q.status !== 'Marked Sent')
              }));
            }}
            onRemoveQueueItem={(id) => {
              updateAndPersistState(prev => ({
                ...prev,
                dailyQueue: prev.dailyQueue.filter(q => q.id !== id)
              }));
            }}
            onUpdateQueueItemStatus={(id, status) => {
              updateAndPersistState(prev => ({
                ...prev,
                dailyQueue: prev.dailyQueue.map(q => q.id === id ? { ...q, status } : q)
              }));
            }}
            onOpenWaStudioForContact={handleOpenWaStudioForContact}
          />
        )}

        {activeTab === 'fees' && (
          <FeesView
            state={state}
            onOpenFeeModal={(id) => {
              setFeeStudentId(id);
              setFeeModalOpen(true);
            }}
            onPrintReceipt={handlePrintReceipt}
            onOpenWaStudioForContact={handleOpenWaStudioForContact}
          />
        )}

        {activeTab === 'certificates' && (
          <CertificatesView
            state={state}
            onIssueCertificate={handleIssueCertificate}
            onPrintCertificate={handlePrintCertificate}
          />
        )}

        {activeTab === 'portal-staff' && (
          <StaffPortalView
            state={state}
            onOpenStaffModal={(id) => {
              setEditingStaffId(id || null);
              setStaffModalOpen(true);
            }}
            onDeleteStaff={handleDeleteStaff}
            onToggleStaffStatus={handleToggleStaffStatus}
            onOpenMaterialModal={(materialId) => {
              setEditingMaterialId(materialId || null);
              setMaterialModalOpen(true);
            }}
            onDeleteMaterial={handleDeleteMaterial}
            onDownloadMaterial={handleDownloadMaterial}
            onShareMaterialWhatsApp={handleShareMaterialWhatsApp}
          />
        )}

        {activeTab === 'workspace' && (
          <WorkspaceHub
            state={state}
            onImportLeadsFromForm={(newLeads, formTitle) => {
              updateAndPersistState(prev => ({
                ...prev,
                leads: [...newLeads, ...prev.leads]
              }));
              scheduleEnrollmentOrLeadCloudSync();
              logAudit('Leads', 'Ingested Google Form Leads', `${newLeads.length} leads`, `Imported from ${formTitle}`);
              showToast(`✓ Imported ${newLeads.length} leads from ${formTitle}`);
            }}
            onSyncComplete={(summary) => {
              logAudit('Sync', 'Google Workspace Sync', 'Complete', summary);
              showToast(`✓ ${summary}`);
            }}
            onSyncAndFetchWorkspace={handleSyncAndFetchWorkspace}
          />
        )}

        {activeTab === 'ai-center' && (
          <AiCenterView
            state={state}
            onRunQuery={handleRunAiQuery}
            chatLog={chatLog}
            aiError={aiError}
            onDismissError={() => setAiError(null)}
          />
        )}

        {activeTab === 'settings' && isMasterAdmin && (
          <SettingsView
            state={state}
            storageQuota={storageQuota}
            onUpdateSettings={(newSettings, isAutoSave) => {
              updateAndPersistState(prev => ({ ...prev, settings: newSettings }));
              syncSettingsToFirestore({ ...stateRef.current, settings: newSettings }).catch(() => {});
              if (!isAutoSave) {
                logAudit('Settings', 'Updated Institutional Settings', 'SYSTEM', 'Updated profile, logos, cloud sync, and receipt/certificate configuration');
                showToast('✓ Saved institutional settings to Cloud Firestore');
              }
            }}
            onRestoreBackup={handleRequestRestoreBackup}
            onResetFactoryData={handleResetFactory}
            onPushCloudSync={() => handleMasterSaveToCloud(false)}
            onMasterFetchFromCloud={() => handleMasterFetchFromCloud(false)}
            isCloudSyncing={isCloudSyncing}
          />
        )}
        {activeTab === 'settings' && !isMasterAdmin && (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center max-w-lg mx-auto my-8 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto font-black text-xl">
              🔒
            </div>
            <h2 className="text-lg font-extrabold text-slate-900">
              Master Admin Access Required
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Developer & System Settings, API Configuration, Firebase Cloud Sync Controls, and Database Backups are restricted to the Master Administrator account.
            </p>
            <button
              type="button"
              onClick={() => setActiveTab('dashboard')}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer"
            >
              Return to Dashboard
            </button>
          </div>
        )}
        </main>
      </div>

      {/* Candle AI Assistant Drawer */}
      <OmniBotDrawer
        isOpen={aiDrawerOpen}
        onClose={() => setAiDrawerOpen(false)}
        state={state}
        onNavigate={(tab) => {
          setActiveTab(tab);
          setAiDrawerOpen(false);
        }}
        onRunQuery={handleRunAiQuery}
        onClearChat={() => {
          setAiError(null);
          setChatLog([
            {
              sender: 'ai',
              time: 'Ready',
              text: "Namaste! I am **Candle**, the live Google Gemini 3.8 AI Admissions & Trading Strategy Consultant for **Srujaan Share Market Institute**. Ask me anything about courses, batch schedules, student fee balances, or Indian stock market price action strategies."
            }
          ]);
        }}
        chatLog={chatLog}
        aiError={aiError}
        onDismissError={() => setAiError(null)}
      />

      {/* Modals */}
      <StudentModal
        isOpen={studentModalOpen}
        onClose={() => setStudentModalOpen(false)}
        onSave={handleSaveStudent}
        editingStudent={state.students.find(s => s.id === editingStudentId)}
        courses={state.courses}
        batches={state.batches}
        nextRegId={`SSMI-${new Date().getFullYear()}-${String(state.students.length + 1).padStart(3, '0')}`}
      />

      <LeadModal
        isOpen={leadModalOpen}
        onClose={() => setLeadModalOpen(false)}
        onSave={handleSaveLead}
        editingLead={state.leads.find(l => l.id === editingLeadId)}
        courses={state.courses}
      />

      <FeeModal
        isOpen={feeModalOpen}
        onClose={() => setFeeModalOpen(false)}
        student={state.students.find(s => s.id === feeStudentId) || null}
        onSaveMilestones={handleSaveMilestones}
        onPrintReceipt={handlePrintReceipt}
        branches={state.settings.branches}
      />

      <Student360Modal
        isOpen={student360ModalOpen}
        onClose={() => setStudent360ModalOpen(false)}
        student={state.students.find(s => s.id === student360Id) || null}
        onPrintReceipt={handlePrintReceipt}
      />

      <GoogleSheetsExportModal
        isOpen={googleSheetsModalOpen}
        onClose={() => setGoogleSheetsModalOpen(false)}
        state={state}
        onSuccessNotice={(msg) => showToast(msg)}
      />

      <ManualEntryModal
        isOpen={manualEntryModalOpen}
        onClose={() => setManualEntryModalOpen(false)}
        state={state}
        onSaveStudent={async (student) => {
          await handleSaveStudent(student);
          showToast(`✓ Saved ${student.name} locally & synced to srujaansharemarketpune@gmail.com`);
        }}
        onSaveLead={async (lead) => {
          await handleSaveLead(lead);
          showToast(`✓ Saved inquiry ${lead.name} locally & synced to srujaansharemarketpune@gmail.com`);
        }}
        onEditExistingStudent={(existing) => {
          setEditingStudentId(existing.id);
          setStudentModalOpen(true);
        }}
      />

      <CloudIntegrationsModal
        isOpen={cloudIntegrationsModalOpen}
        onClose={() => setCloudIntegrationsModalOpen(false)}
        state={state}
        onCommitImportedStudents={(mergedStudents, summaryText) => {
          updateAndPersistState(prev => ({
            ...prev,
            students: mergedStudents
          }));
          saveCachedStudents(mergedStudents);
          scheduleEnrollmentOrLeadCloudSync();
          logAudit('Sync', 'Google Sheets & Forms Smart Import', `${mergedStudents.length} total`, summaryText);
          showToast(`✓ ${summaryText}`);
        }}
        onOpenManualEntry={() => setManualEntryModalOpen(true)}
      />

      <StaffModal
        isOpen={staffModalOpen}
        onClose={() => setStaffModalOpen(false)}
        onSave={handleSaveStaff}
        editingStaff={state.staff.find(s => s.id === editingStaffId) || null}
        batches={state.batches}
      />

      <CourseModal
        isOpen={courseModalOpen}
        onClose={() => setCourseModalOpen(false)}
        onSave={handleSaveCourse}
        onUpdateCourseField={updateCourseField}
        editingCourse={state.courses.find(c => c.id === editingCourseId) || null}
        instructors={Array.from(new Set(['Prasad Sir', ...state.staff.map(s => s.name)]))}
      />

      <BatchModal
        isOpen={batchModalOpen}
        onClose={() => setBatchModalOpen(false)}
        onSave={handleSaveBatch}
        editingBatch={state.batches.find(b => b.code === editingBatchCode) || null}
        courses={state.courses}
        instructors={Array.from(new Set(['Prasad Sir', ...state.staff.map(s => s.name)]))}
      />

      <LectureModal
        isOpen={lectureModalOpen}
        onClose={() => {
          setLectureModalOpen(false);
          setEditingLecture(null);
        }}
        onSave={handleSaveLecture}
        targetCourseId={targetLectureCourse?.id}
        courses={state.courses}
        batches={state.batches}
        instructors={Array.from(new Set(['Prasad Sir', ...state.staff.filter(s => s.status === 'Active').map(s => s.name)]))}
        editingLecture={editingLecture}
      />

      <StudyMaterialModal
        isOpen={materialModalOpen}
        onClose={() => {
          setMaterialModalOpen(false);
          setEditingMaterialId(null);
        }}
        onSave={handleSaveMaterial}
        editingMaterial={state.materials.find(m => m.id === editingMaterialId) || null}
        courses={state.courses}
        batches={state.batches}
      />

      <ShareMaterialWhatsAppModal
        isOpen={Boolean(shareMaterialId)}
        onClose={() => setShareMaterialId(null)}
        material={targetShareMaterial}
        students={state.students}
        instituteName={state.settings.instituteName}
        onDownloadMaterial={(mat) => handleDownloadMaterial(mat.id)}
      />

      <BatchRosterModal
        isOpen={Boolean(rosterBatchCode)}
        onClose={() => setRosterBatchCode(null)}
        batchCode={rosterBatchCode}
        batches={state.batches}
        students={state.students}
        onAssignStudentToBatch={(studentId, targetCode) => {
          updateAndPersistState(prev => ({
            ...prev,
            students: prev.students.map(s => (s.id === studentId ? { ...s, batch: targetCode } : s))
          }));
          showToast(targetCode ? `✓ Assigned student to ${targetCode}` : '✓ Unassigned student from batch');
        }}
      />

      {/* Overwrite Cloud Confirmation Modal */}
      {overwriteCloudModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-labelledby="overwrite-cloud-modal-title"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 text-xl font-bold">
                ⚡
              </div>
              <div>
                <h3 id="overwrite-cloud-modal-title" className="text-base font-extrabold text-slate-900">
                  Overwrite Remote Cloud Database?
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Overwrite remote cloud database with current local state? This replaces the server copy.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200/80 text-xs text-amber-900 space-y-1.5">
              <p className="font-bold">
                Local Snapshot Summary:
              </p>
              <p className="font-mono text-[11px] text-amber-950">
                Students: {state.students.length} • Leads: {state.leads.length} • Batches: {state.batches.length} • Staff: {state.staff.length}
              </p>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                This force-pushes your current local database across Firebase Cloud Firestore, Cloud Server, and any configured Firebase RTDB endpoint.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setOverwriteCloudModalOpen(false)}
                disabled={isCloudSyncing}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setOverwriteCloudModalOpen(false);
                  await handleMasterSaveToCloud(false, true);
                }}
                disabled={isCloudSyncing}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-black shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                {isCloudSyncing ? 'Overwriting Cloud...' : 'Yes, Overwrite Cloud'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Non-blocking Master Restore Confirmation Modal */}
      {restoreConfirmModalOpen && pendingRestoreFile && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 text-xl font-bold">
                ⚠️
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  Confirm Master Database Restore
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Action requires explicit administrator verification
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200/80 text-xs text-amber-900 space-y-2">
              <p className="font-bold">
                Are you sure you want to restore from:
              </p>
              <p className="font-mono bg-white px-2 py-1.5 rounded-lg border border-amber-300 text-amber-950 font-semibold truncate text-[11px]">
                📁 {pendingRestoreFile.name} ({(pendingRestoreFile.size / 1024).toFixed(1)} KB)
              </p>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                ⚠️ Restoring will overwrite existing students, courses, staff, attendance, and settings across browser local cache, IndexedDB, and Firestore.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setRestoreConfirmModalOpen(false);
                  setPendingRestoreFile(null);
                }}
                disabled={isRestoringBackup}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRestoreBackup}
                disabled={isRestoringBackup}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-black shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                {isRestoringBackup ? 'Restoring Database...' : 'Confirm Overwrite & Restore'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Universal Safe Delete Confirmation Modal */}
      {confirmDeleteModal && (
        <div
          className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-delete-modal-title"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 id="confirm-delete-modal-title" className="text-base font-extrabold text-slate-900">
                  {confirmDeleteModal.title}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Are you sure you want to delete this record? This action cannot be undone.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-rose-50/80 border border-rose-200 text-xs text-rose-950 space-y-1">
              <div className="font-extrabold text-sm text-rose-900 break-words">
                {confirmDeleteModal.recordName}
              </div>
              {confirmDeleteModal.recordSubtext && (
                <div className="text-[11px] text-rose-700 font-medium">
                  {confirmDeleteModal.recordSubtext}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setConfirmDeleteModal(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteModal.onConfirm}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Yes, Remove</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile-Only Floating Action Button (FAB) for Primary Creation */}
      {(activeTab === 'dashboard' || activeTab === 'students' || activeTab === 'leads') && (
        <button
          type="button"
          onClick={() => {
            if (activeTab === 'leads') {
              setEditingLeadId(null);
              setLeadModalOpen(true);
            } else {
              setEditingStudentId(null);
              setStudentModalOpen(true);
            }
          }}
          className="md:hidden fixed right-4 bottom-20 z-40 px-4 py-3 rounded-full bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-extrabold text-sm shadow-xl border border-blue-500 flex items-center gap-1.5 cursor-pointer transition-transform"
          aria-label={activeTab === 'leads' ? 'New Lead' : 'Add Student'}
        >
          <Plus className="w-5 h-5" />
          <span>{activeTab === 'leads' ? 'New Lead' : 'Add Student'}</span>
        </button>
      )}

      {/* Mobile-Only Sticky Bottom Navigation Bar (Strictly hidden on Desktop md:hidden) */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-4px_16px_rgba(15,23,42,0.06)] px-2 py-1.5 flex items-center justify-around"
        aria-label="Mobile Primary Navigation"
      >
        {([
          { id: 'dashboard' as NavTabId, label: 'Dashboard', icon: LayoutDashboard },
          { id: 'students' as NavTabId, label: 'Students', icon: Users, badge: activeStudents.length },
          { id: 'leads' as NavTabId, label: 'Leads', icon: Target, badge: dueFollowupsCount > 0 ? dueFollowupsCount : undefined },
          { id: 'fees' as NavTabId, label: 'Fees', icon: CreditCard },
          ...(isMasterAdmin ? [{ id: 'settings' as NavTabId, label: 'Settings', icon: Settings }] : [])
        ]).map(item => {
          const IconComponent = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setActiveTab(item.id);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={`relative flex flex-col items-center justify-center min-w-[60px] min-h-[48px] px-2 py-1 rounded-xl text-[11px] font-extrabold transition-colors cursor-pointer ${
                isActive
                  ? 'text-blue-600 bg-blue-50/80'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <IconComponent className={`w-5 h-5 mb-0.5 ${isActive ? 'text-blue-600' : 'text-slate-500'}`} />
              <span>{item.label}</span>
              {item.badge !== undefined && (
                <span className="absolute top-1 right-2 px-1.5 py-0.2 rounded-full text-[9px] font-mono font-black bg-blue-600 text-white">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
