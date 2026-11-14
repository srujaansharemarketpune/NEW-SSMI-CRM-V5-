import React, { useRef, useState, useEffect } from 'react';
import { InstituteSettings } from '../types';
import { subscribeToSyncStatus, getSyncStatusSnapshot, SyncStatusSnapshot } from '../services/db';
import {
  signInWithGoogleAuth,
  recordSyncError,
  testConnection,
  formatFirebaseAuthError,
  FormattedFirebaseAuthError,
  INSTITUTE_WORKSPACE_ID
} from '../services/firebase';
import {
  performChunkedInstituteBackup,
  subscribeToBackupStatus,
  getLastVerifiedBackupMeta,
  getCurrentBackupProgress,
  BACKUP_STATUS,
  BackupProgressState,
  LastVerifiedBackupMeta
} from '../services/backupEngine';
import {
  subscribeToSyncTelemetry,
  PRIMARY_INSTITUTE_EMAIL,
  flushOfflineQueueBatch
} from '../services/storageManager';
import {
  subscribeToWatchdog,
  getWatchdogSnapshot,
  WatchdogSnapshot
} from '../services/selfRepair';

const SrujaanBadgeLogo: React.FC<{ className?: string }> = ({ className = 'w-8 h-8 rounded-lg' }) => (
  <div
    className={`bg-gradient-to-br from-blue-600 via-indigo-700 to-slate-900 text-white font-black flex items-center justify-center shadow-xs border border-blue-400/30 select-none ${className}`}
  >
    <span className="text-xs tracking-tighter">SS</span>
  </div>
);
import {
  LayoutDashboard,
  Users,
  BookOpen,
  CalendarCheck,
  Target,
  MessageSquare,
  BellRing,
  CreditCard,
  Award,
  Briefcase,
  Globe,
  Sparkles,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  PanelLeft,
  Maximize2,
  Minimize2,
  EyeOff,
  Menu,
  X,
  CloudUpload,
  CloudDownload,
  Download,
  Upload,
  LogOut,
  Cloud,
  RefreshCw,
  HardDrive,
  FileJson,
  FileSpreadsheet,
  FolderOpen,
  Zap,
  AlertTriangle,
  WifiOff,
  Clock,
  Search,
  ShieldCheck,
  ChevronDown,
  UserCheck,
  LogIn,
  Copy,
  Check
} from 'lucide-react';

export type NavTabId =
  | 'dashboard'
  | 'students'
  | 'batches'
  | 'attendance'
  | 'leads'
  | 'whatsapp'
  | 'daily-updates'
  | 'fees'
  | 'certificates'
  | 'portal-staff'
  | 'workspace'
  | 'ai-center'
  | 'settings';

export type SidebarMode = 'compact' | 'standard' | 'expanded' | 'hidden';

export interface NavItemConfig {
  id: NavTabId;
  label: string;
  shortLabel: string;
  group: 'Overview' | 'Academics' | 'Growth & CRM' | 'Finance & Admin';
  icon: React.ComponentType<{ className?: string }>;
  badge?: number | string;
  badgeColor?: string;
}

export function getNavItems(
  studentsCount: number,
  followupsDue: number,
  syncQueueCount: number,
  isMasterAdmin = true
): NavItemConfig[] {
  const items: NavItemConfig[] = [
    {
      id: 'dashboard',
      label: 'Executive Dashboard',
      shortLabel: 'Dashboard',
      group: 'Overview',
      icon: LayoutDashboard
    },
    {
      id: 'ai-center',
      label: 'Candle AI Consultant',
      shortLabel: 'Candle AI',
      group: 'Overview',
      icon: Sparkles,
      badge: 'LIVE',
      badgeColor: 'bg-indigo-100 text-indigo-700'
    },
    {
      id: 'students',
      label: 'Students & Admissions',
      shortLabel: 'Students',
      group: 'Academics',
      icon: Users,
      badge: studentsCount,
      badgeColor: 'bg-blue-100 text-blue-700'
    },
    {
      id: 'batches',
      label: 'Batches & Curriculum',
      shortLabel: 'Batches',
      group: 'Academics',
      icon: BookOpen
    },
    {
      id: 'attendance',
      label: 'Attendance Ledger',
      shortLabel: 'Attendance',
      group: 'Academics',
      icon: CalendarCheck
    },
    {
      id: 'certificates',
      label: 'Certificates & Grading',
      shortLabel: 'Certificates',
      group: 'Academics',
      icon: Award
    },
    {
      id: 'leads',
      label: 'Lead Conversion CRM',
      shortLabel: 'Lead CRM',
      group: 'Growth & CRM',
      icon: Target,
      badge: followupsDue > 0 ? followupsDue : undefined,
      badgeColor: 'bg-amber-100 text-amber-800'
    },
    {
      id: 'whatsapp',
      label: 'WhatsApp Studio',
      shortLabel: 'WhatsApp',
      group: 'Growth & CRM',
      icon: MessageSquare
    },
    {
      id: 'daily-updates',
      label: 'Daily Broadcast Queue',
      shortLabel: 'Broadcasts',
      group: 'Growth & CRM',
      icon: BellRing
    },
    {
      id: 'fees',
      label: 'Fee Installments & Receipts',
      shortLabel: 'Fees & Dues',
      group: 'Finance & Admin',
      icon: CreditCard
    },
    {
      id: 'portal-staff',
      label: 'Faculty & Study Vault',
      shortLabel: 'Staff & Vault',
      group: 'Finance & Admin',
      icon: Briefcase
    },
    {
      id: 'workspace',
      label: 'Google Workspace Hub',
      shortLabel: 'Workspace',
      group: 'Finance & Admin',
      icon: Globe,
      badge: syncQueueCount > 0 ? syncQueueCount : undefined,
      badgeColor: 'bg-indigo-100 text-indigo-700'
    }
  ];

  if (isMasterAdmin) {
    items.push({
      id: 'settings',
      label: 'Institute Settings',
      shortLabel: 'Settings',
      group: 'Finance & Admin',
      icon: Settings
    });
  }

  return items;
}

interface NavbarProps {
  activeTab: NavTabId;
  onTabChange: (tab: NavTabId) => void;
  settings: InstituteSettings;
  studentsCount: number;
  attendanceRate: number;
  followupsDue: number;
  feesDue: number;
  syncQueueCount: number;
  onOpenAiDrawer: () => void;
  onLanguageChange?: (lang: 'en' | 'hi' | 'mr') => void;
  isOnline?: boolean;
  onSyncToFirebase?: () => void;
  onMasterSaveToCloud?: () => void;
  onPushUpdate?: () => void;
  onOverwriteCloud?: () => void;
  onMasterFetchFromCloud?: () => void;
  onFetchAndApply?: () => void;
  onSyncAndFetchWorkspace?: () => void;
  onLocalBackup?: () => void;
  onExportMasterBackup?: () => void;
  onRestoreMasterBackup?: (file: File) => void;
  lastCloudSyncAt?: string | null;
  isCloudSyncing?: boolean;
  authUserEmail?: string | null;
  authUserName?: string | null;
  isMasterAdmin?: boolean;
  onQuickResumeMasterAdmin?: () => void;
  onSignOut?: () => void;
  sidebarMode?: SidebarMode;
  onSidebarModeChange?: (mode: SidebarMode) => void;
  onOpenManualEntry?: () => void;
  onOpenCloudIntegrations?: () => void;
  onQuickAddAdmission?: () => void;
  onQuickAddLead?: () => void;
  onOpenEveryPatch?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onTabChange,
  settings,
  studentsCount,
  attendanceRate,
  followupsDue,
  feesDue,
  syncQueueCount,
  onOpenAiDrawer,
  isOnline = true,
  onMasterSaveToCloud,
  onPushUpdate,
  onOverwriteCloud,
  onMasterFetchFromCloud,
  onFetchAndApply,
  onSyncAndFetchWorkspace,
  onLocalBackup,
  onExportMasterBackup,
  onRestoreMasterBackup,
  lastCloudSyncAt,
  isCloudSyncing = false,
  authUserEmail,
  authUserName,
  isMasterAdmin = true,
  onQuickResumeMasterAdmin,
  onSignOut,
  sidebarMode = 'standard',
  onSidebarModeChange,
  onOpenManualEntry,
  onOpenCloudIntegrations,
  onQuickAddAdmission,
  onQuickAddLead,
  onOpenEveryPatch
}) => {
  const customLogo = settings.primaryLogoBase64 || settings.logoBase64;
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [syncSnap, setSyncSnap] = useState<SyncStatusSnapshot>(() => getSyncStatusSnapshot());
  const [watchdogSnap, setWatchdogSnap] = useState<WatchdogSnapshot>(() => getWatchdogSnapshot());
  const [showSyncDetails, setShowSyncDetails] = useState(false);
  const [backupProgress, setBackupProgress] = useState<BackupProgressState>(() => getCurrentBackupProgress());
  const [lastBackupMeta, setLastBackupMeta] = useState<LastVerifiedBackupMeta | null>(() => getLastVerifiedBackupMeta());
  const [telemetry, setTelemetry] = useState<{
    state: 'Online & Synced' | 'Syncing...' | 'Offline - Saved Locally' | 'Sync Error - Click to Retry' | 'Ready (Not Synced Yet)';
    error: string | null;
    lastTime: string;
    account: string;
  }>({
    state: typeof navigator !== 'undefined' && !navigator.onLine ? 'Offline - Saved Locally' : 'Ready (Not Synced Yet)',
    error: null,
    lastTime: '',
    account: PRIMARY_INSTITUTE_EMAIL
  });

  const [isRemotePulsing, setIsRemotePulsing] = useState(false);
  const [popoverAuthError, setPopoverAuthError] = useState<FormattedFirebaseAuthError | null>(null);
  const [popoverSigningIn, setPopoverSigningIn] = useState(false);
  const [copiedPopoverHost, setCopiedPopoverHost] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileSigningIn, setProfileSigningIn] = useState(false);
  const [profileAuthError, setProfileAuthError] = useState<FormattedFirebaseAuthError | null>(null);
  const [copiedProfileHost, setCopiedProfileHost] = useState(false);

  useEffect(() => {
    const unsub = subscribeToSyncStatus((snap) => {
      setSyncSnap(snap);
    });
    const unsubBackup = subscribeToBackupStatus((bState, bMeta) => {
      setBackupProgress(bState);
      setLastBackupMeta(bMeta);
    });
    const unsubTelemetry = subscribeToSyncTelemetry((tSnap) => {
      setTelemetry(tSnap);
    });
    const unsubWatchdog = subscribeToWatchdog((wSnap) => {
      setWatchdogSnap(wSnap);
    });
    const handleOpenDrawerEvent = () => setMobileMenuOpen(true);
    window.addEventListener('ssm-open-mobile-drawer', handleOpenDrawerEvent);
    return () => {
      unsub();
      unsubBackup();
      unsubTelemetry();
      unsubWatchdog();
      window.removeEventListener('ssm-open-mobile-drawer', handleOpenDrawerEvent);
    };
  }, []);

  useEffect(() => {
    if (!syncSnap.lastRemotePulseAt) return;
    setIsRemotePulsing(true);
    const timer = window.setTimeout(() => {
      setIsRemotePulsing(false);
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [syncSnap.lastRemotePulseAt]);

  const effectiveSyncState: SyncStatusSnapshot['status'] = !isOnline || telemetry.state === 'Offline - Saved Locally'
    ? 'Offline'
    : isCloudSyncing || syncSnap.status === 'Syncing' || telemetry.state === 'Syncing...'
    ? 'Syncing'
    : !syncSnap.isAuthTokenValid
    ? 'Pending'
    : syncSnap.status === 'Error' || telemetry.state === 'Sync Error - Click to Retry'
    ? 'Error'
    : syncSnap.pendingChangesCount > 0 || syncQueueCount > 0
    ? 'Pending'
    : syncSnap.status === 'Connected'
    ? 'Connected'
    : 'Pending';

  const statusPillLabel =
    effectiveSyncState === 'Offline'
      ? 'Offline - Saved Locally'
      : effectiveSyncState === 'Syncing'
      ? 'Syncing...'
      : !syncSnap.isAuthTokenValid
      ? 'Firebase: Not logged in'
      : effectiveSyncState === 'Error'
      ? 'Sync Error - Click to Retry'
      : syncSnap.firestoreVerified
      ? 'Firebase Connected (Synced)'
      : `Connected (${PRIMARY_INSTITUTE_EMAIL})`;

  const compactPillLabel =
    effectiveSyncState === 'Connected'
      ? syncSnap.firestoreVerified
        ? 'Synced'
        : 'Connected'
      : !syncSnap.isAuthTokenValid && isOnline
      ? 'Not logged in'
      : effectiveSyncState;

  const activeProfileName = isMasterAdmin
    ? (authUserName && !authUserName.includes('@') && !authUserName.includes('Srujaan Share Market') ? authUserName : 'Prasad Sir')
    : (authUserName || 'Uday Hajare');
  const activeProfileRole = isMasterAdmin ? 'Master Admin' : 'Staff Operator';
  const activeProfileEmail = authUserEmail || PRIMARY_INSTITUTE_EMAIL;

  const resolvedLastSyncTime = syncSnap.lastSyncTime || lastCloudSyncAt || null;

  const navItems = getNavItems(studentsCount, followupsDue, syncQueueCount, isMasterAdmin);

  const handlePushClick = () => {
    if (onPushUpdate) {
      onPushUpdate();
    } else if (onMasterSaveToCloud) {
      onMasterSaveToCloud();
    } else if (typeof window !== 'undefined' && (window as any).syncManager?.pushUpdate) {
      (window as any).syncManager.pushUpdate(false);
    }
  };

  const handleOverwriteClick = () => {
    if (onOverwriteCloud) {
      onOverwriteCloud();
    } else if (typeof window !== 'undefined' && (window as any).syncManager?.pushUpdate) {
      (window as any).syncManager.pushUpdate(true);
    }
  };

  const handleFetchClick = () => {
    if (onFetchAndApply) {
      onFetchAndApply();
    } else if (onMasterFetchFromCloud) {
      onMasterFetchFromCloud();
    } else if (typeof window !== 'undefined' && (window as any).syncManager?.fetchRemoteData) {
      (window as any).syncManager.fetchRemoteData();
    }
  };

  const handleWorkspaceSyncClick = () => {
    if (onSyncAndFetchWorkspace) {
      onSyncAndFetchWorkspace();
    } else if (typeof window !== 'undefined' && (window as any).syncManager?.syncAndFetchWorkspace) {
      (window as any).syncManager.syncAndFetchWorkspace();
    }
  };

  const handleLocalSnapshotClick = () => {
    if (onLocalBackup) {
      onLocalBackup();
    } else if (typeof window !== 'undefined' && (window as any).syncManager?.saveLocalSnapshot) {
      (window as any).syncManager.saveLocalSnapshot();
    }
  };

  const handleExportJsonClick = async () => {
    try {
      const res = await performChunkedInstituteBackup();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('ssm-verification-result', {
            detail: {
              title: 'Master JSON & Cloud Backup Verification',
              operation: 'backup',
              success: res.success,
              status: res.status,
              timestamp: res.completedAt,
              summary: `Backup ${res.backupId}: ${res.count} records exported (${res.status}).`,
              targets: [
                {
                  name: 'JSON Download File',
                  ok: res.targets.localJson,
                  detail: res.targets.localJson ? 'Downloaded SSM backup JSON' : 'Not downloaded'
                },
                {
                  name: 'Local Cache / IndexedDB',
                  ok: res.targets.indexedDb,
                  detail: `${res.count} records verified`
                },
                {
                  name: 'Firebase Firestore Audit',
                  ok: res.targets.firestore,
                  detail: res.targets.firestore
                    ? `Audit committed (${res.backupId})`
                    : res.error || 'Firestore audit not committed'
                }
              ],
              collectionCounts: res.collectionCounts,
              error: res.error
            }
          })
        );
      }
    } catch {
      if (onExportMasterBackup) {
        onExportMasterBackup();
      } else if (typeof window !== 'undefined' && (window as any).syncManager?.exportLocalJSON) {
        (window as any).syncManager.exportLocalJSON();
      }
    }
  };

  const cycleSidebarMode = () => {
    if (!onSidebarModeChange) return;
    if (sidebarMode === 'hidden') {
      onSidebarModeChange('standard');
    } else if (sidebarMode === 'standard') {
      onSidebarModeChange('compact');
    } else if (sidebarMode === 'compact') {
      onSidebarModeChange('expanded');
    } else {
      onSidebarModeChange('standard');
    }
  };

  return (
    <>
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-2xs flex flex-col">
        {/* Hidden File Input for Restore Backup JSON */}
        <input
          ref={restoreInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              if (onRestoreMasterBackup) {
                onRestoreMasterBackup(file);
              } else if (typeof window !== 'undefined' && (window as any).syncManager?.importLocalJSON) {
                (window as any).syncManager.importLocalJSON(file);
              }
            }
            e.target.value = '';
          }}
        />

        {/* Primary Header Bar */}
        <div className="w-full px-2.5 sm:px-4 h-14 lg:h-[54px] flex items-center justify-between gap-2">
          {/* Left: Sidebar Trigger + Compact Brand Identity */}
          <div className="flex items-center gap-2 min-w-0">
            {/* Mobile & Tablet Hamburger Button (< 1024px lg:hidden) */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden min-w-[44px] min-h-[44px] w-11 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-colors cursor-pointer shrink-0"
              aria-label="Open Navigation Drawer"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Desktop Multi-State Sidebar Toggle Button (>= 1024px hidden lg:flex) */}
            {onSidebarModeChange && (
              <div className="hidden lg:flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200/80 shrink-0">
                <button
                  type="button"
                  onClick={cycleSidebarMode}
                  className="h-7 px-2 rounded-md hover:bg-white text-slate-700 hover:text-slate-900 flex items-center gap-1.5 text-[11px] font-bold transition-all cursor-pointer"
                  title="Cycle Sidebar Size (Shortcut: [ or Ctrl+B)"
                >
                  {sidebarMode === 'hidden' ? (
                    <>
                      <PanelLeftOpen className="w-3.5 h-3.5 text-blue-600" />
                      <span className="text-blue-600 font-extrabold">Show Nav</span>
                    </>
                  ) : sidebarMode === 'compact' ? (
                    <PanelLeft className="w-3.5 h-3.5 text-slate-600" />
                  ) : (
                    <PanelLeftClose className="w-3.5 h-3.5 text-slate-600" />
                  )}
                </button>
                {sidebarMode !== 'hidden' && (
                  <button
                    type="button"
                    onClick={() => onSidebarModeChange('hidden')}
                    className="h-7 px-1.5 rounded-md hover:bg-white text-slate-500 hover:text-slate-900 flex items-center text-[10px] font-bold transition-all cursor-pointer"
                    title="Full-Screen Zen Mode (Hide Sidebar)"
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {/* Institute Logo & Compact Name */}
            <div
              onClick={() => onTabChange('dashboard')}
              className="flex items-center gap-2 cursor-pointer group min-w-0"
            >
              {customLogo ? (
                <div className="h-8 w-8 rounded-lg bg-white border border-slate-200 px-1 py-0.5 flex items-center justify-center shrink-0">
                  <img
                    src={customLogo}
                    alt={settings.instituteName}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              ) : (
                <SrujaanBadgeLogo className="w-8 h-8 rounded-lg shrink-0" />
              )}

              <div className="min-w-0">
                <div className="flex flex-col">
                  <span className="font-extrabold text-xs sm:text-sm tracking-tight text-slate-900 group-hover:text-blue-600 transition-colors truncate max-w-[160px] sm:max-w-[260px] 2xl:max-w-[340px] leading-tight">
                    Srujaan Share Market Institute Management System
                  </span>
                  <span className="hidden sm:block text-[9px] font-bold tracking-[0.14em] text-amber-600 uppercase truncate">
                    WHERE KNOWLEDGE MEETS PROFIT.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Center/Right: Compact KPI Strip + Enterprise Data-Sync Toolbar + Candle AI & Logout */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Compact KPI Strip (2xl+) */}
            <div className="hidden 2xl:flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200/80 text-[11px]">
              <button
                type="button"
                onClick={() => onTabChange('students')}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-white transition-colors cursor-pointer whitespace-nowrap"
              >
                <span className="text-slate-500 font-medium">Students:</span>
                <span className="font-mono font-extrabold text-slate-900">{studentsCount}</span>
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={() => onTabChange('attendance')}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-white transition-colors cursor-pointer whitespace-nowrap"
              >
                <span className="text-slate-500 font-medium">Att:</span>
                <span className="font-mono font-extrabold text-emerald-600">{attendanceRate}%</span>
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={() => onTabChange('leads')}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-white transition-colors cursor-pointer whitespace-nowrap"
              >
                <span className="text-slate-500 font-medium">Follow-ups:</span>
                <span className="font-mono font-extrabold text-amber-600">{followupsDue}</span>
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={() => onTabChange('fees')}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-white transition-colors cursor-pointer whitespace-nowrap"
              >
                <span className="text-slate-500 font-medium">Due:</span>
                <span className="font-mono font-extrabold text-rose-600">
                  {settings.currencySymbol}{(feesDue / 1000).toFixed(1)}k
                </span>
              </button>
            </div>

            {/* ENTERPRISE DATA-SYNC TOOLBAR (Desktop lg+: Status Pill for All Authorized Users, Write Actions for Master Admin) */}
            <div
              className="hidden lg:flex items-center gap-1 bg-slate-900/95 text-white p-1 rounded-xl border border-slate-800 shadow-xs min-w-0 max-w-full overflow-x-auto no-scrollbar"
              role="toolbar"
              aria-label="Enterprise Data-Sync Toolbar"
            >
              {/* 1. Persistent Sync Telemetry Pill */}
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    if (effectiveSyncState === 'Error') {
                      flushOfflineQueueBatch().catch(() => {});
                    }
                    setShowSyncDetails(prev => !prev);
                  }}
                  className={`px-2 py-1 text-[11px] font-bold rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0 border cursor-pointer transition-all ${
                    effectiveSyncState === 'Syncing'
                      ? 'bg-amber-950/90 text-amber-300 border-amber-700/70'
                      : effectiveSyncState === 'Connected'
                      ? isRemotePulsing
                        ? 'bg-emerald-900/95 text-emerald-200 border-emerald-400 ring-2 ring-emerald-400/70 shadow-md shadow-emerald-500/20'
                        : 'bg-emerald-950/90 text-emerald-300 border-emerald-700/70'
                      : effectiveSyncState === 'Error'
                      ? 'bg-rose-950/90 text-rose-300 border-rose-700/70'
                      : effectiveSyncState === 'Offline'
                      ? 'bg-blue-950/90 text-blue-300 border-blue-700/70'
                      : 'bg-amber-950/90 text-amber-300 border-amber-700/70'
                  }`}
                  title={
                    telemetry.error || syncSnap.lastError
                      ? `Sync Error: ${telemetry.error || syncSnap.lastError} — Click to retry`
                      : `Account: ${PRIMARY_INSTITUTE_EMAIL} • Path: institutes/${INSTITUTE_WORKSPACE_ID} • Status: ${statusPillLabel}`
                  }
                >
                  {effectiveSyncState === 'Syncing' ? (
                    <RefreshCw className="w-3 h-3 text-amber-400 animate-spin shrink-0" />
                  ) : effectiveSyncState === 'Error' ? (
                    <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
                  ) : effectiveSyncState === 'Offline' ? (
                    <WifiOff className="w-3 h-3 text-blue-400 shrink-0" />
                  ) : effectiveSyncState === 'Pending' ? (
                    <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                  ) : (
                    <Cloud className={`w-3 h-3 text-emerald-400 shrink-0 ${isRemotePulsing ? 'animate-bounce' : ''}`} />
                  )}
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      effectiveSyncState === 'Syncing'
                        ? 'bg-amber-400 animate-ping'
                        : effectiveSyncState === 'Connected'
                        ? isRemotePulsing
                          ? 'bg-emerald-300 animate-ping'
                          : 'bg-emerald-400'
                        : effectiveSyncState === 'Error'
                        ? 'bg-rose-500 animate-pulse'
                        : effectiveSyncState === 'Offline'
                        ? 'bg-blue-400'
                        : 'bg-amber-400 animate-pulse'
                    }`}
                  />
                  <span className="hidden 2xl:inline">{statusPillLabel}</span>
                  <span className="2xl:hidden">
                    {compactPillLabel}
                  </span>
                </button>
              </div>

              {isMasterAdmin && (
                <>
                  {/* 2. Push Update (Non-destructive merge push) */}
                  <button
                    type="button"
                    onClick={handlePushClick}
                    disabled={isCloudSyncing}
                    className="px-2 py-1 text-[11px] font-bold rounded-lg shadow-xs transition-all active:scale-95 flex items-center gap-1 whitespace-nowrap shrink-0 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white cursor-pointer"
                    title="Push Update: Non-destructively merge local modifications into Firebase Cloud"
                  >
                    <CloudUpload className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden xl:inline">Push Update</span>
                    <span className="xl:hidden">Push</span>
                  </button>

                  {/* 3. Overwrite Cloud (Force-push with confirmation modal) */}
                  <button
                    type="button"
                    onClick={handleOverwriteClick}
                    disabled={isCloudSyncing}
                    className="px-2 py-1 text-[11px] font-bold rounded-lg shadow-xs transition-all active:scale-95 flex items-center gap-1 whitespace-nowrap shrink-0 bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white cursor-pointer"
                    title="Overwrite Cloud: Force-push current local state to replace remote cloud database"
                  >
                    <Zap className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden 2xl:inline">Overwrite Cloud</span>
                    <span className="2xl:hidden">Overwrite</span>
                  </button>

                  {/* 4. Restore / Pull from Cloud */}
                  <button
                    type="button"
                    onClick={handleFetchClick}
                    disabled={isCloudSyncing}
                    className="px-2 py-1 text-[11px] font-bold rounded-lg shadow-xs transition-all active:scale-95 flex items-center gap-1 whitespace-nowrap shrink-0 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white cursor-pointer"
                    title="Restore / Pull from Cloud: Force-fetch latest Firestore snapshot, overwrite stale local cache, and refresh views"
                  >
                    <CloudDownload className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden 2xl:inline">Restore / Pull from Cloud</span>
                    <span className="2xl:hidden">Pull Cloud</span>
                  </button>

                  {/* 4B. Sync & Fetch Google Workspace */}
                  <button
                    type="button"
                    onClick={handleWorkspaceSyncClick}
                    disabled={isCloudSyncing}
                    className="px-2 py-1 text-[11px] font-bold rounded-lg shadow-xs transition-all active:scale-95 flex items-center gap-1 whitespace-nowrap shrink-0 bg-teal-600 hover:bg-teal-500 disabled:opacity-60 text-white cursor-pointer"
                    title="Sync & Fetch Google Workspace: Ping Google Apps Script deployment endpoint and sync all Google Sheets & Forms records"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden 2xl:inline">Sync & Fetch Google Workspace</span>
                    <span className="2xl:hidden">Sync Sheets</span>
                  </button>

                  {/* 5. Local Backup */}
                  <button
                    type="button"
                    onClick={handleLocalSnapshotClick}
                    className="px-2 py-1 text-[11px] font-bold rounded-lg shadow-xs transition-all active:scale-95 flex items-center gap-1 whitespace-nowrap shrink-0 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 cursor-pointer"
                    title="Local Backup: Instant snapshot save to browser localStorage & IndexedDB"
                  >
                    <HardDrive className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span className="hidden 2xl:inline">Local Backup</span>
                  </button>

                  {/* 6. JSON Backup */}
                  <button
                    type="button"
                    onClick={handleExportJsonClick}
                    className="px-2 py-1 text-[11px] font-bold rounded-lg shadow-xs transition-all active:scale-95 flex items-center gap-1 whitespace-nowrap shrink-0 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 cursor-pointer"
                    title="JSON Backup: Download srujaan_master_backup_[DATE].json"
                  >
                    <FileJson className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span className="hidden 2xl:inline">JSON Backup</span>
                  </button>

                  {/* 7. Restore JSON */}
                  <button
                    type="button"
                    onClick={() => restoreInputRef.current?.click()}
                    className="px-2 py-1 text-[11px] font-bold rounded-lg shadow-xs transition-all active:scale-95 flex items-center gap-1 whitespace-nowrap shrink-0 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 cursor-pointer"
                    title="Restore JSON: Import a master JSON backup file and refresh all views"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="hidden 2xl:inline">Restore JSON</span>
                  </button>
                </>
              )}
            </div>

            {/* Mobile/Tablet Quick Search & Compact Live Cloud Sync Dot (< 1024px) */}
            <div className="flex lg:hidden items-center gap-1">
              <button
                type="button"
                onClick={() => setShowSyncDetails(prev => !prev)}
                className={`compact-touch-ignore min-h-[38px] px-2 py-1.5 rounded-lg border text-[11px] font-bold flex items-center gap-1.5 cursor-pointer ${
                  effectiveSyncState === 'Connected'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : effectiveSyncState === 'Error'
                    ? 'bg-rose-50 border-rose-200 text-rose-700'
                    : effectiveSyncState === 'Offline'
                    ? 'bg-slate-100 border-slate-200 text-slate-700'
                    : 'bg-amber-50 border-amber-200 text-amber-800'
                }`}
                title={statusPillLabel}
                aria-label={statusPillLabel}
              >
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    effectiveSyncState === 'Syncing'
                      ? 'bg-amber-500 animate-ping'
                      : effectiveSyncState === 'Connected'
                      ? 'bg-emerald-500'
                      : effectiveSyncState === 'Error'
                      ? 'bg-rose-500 animate-pulse'
                      : effectiveSyncState === 'Offline'
                      ? 'bg-slate-400'
                      : 'bg-amber-500 animate-pulse'
                  }`}
                />
                <span className="hidden xs:inline sm:inline">
                  {compactPillLabel}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onTabChange('dashboard');
                  window.setTimeout(() => {
                    const input = document.getElementById('dashboard-global-search') as HTMLInputElement | null;
                    if (input) {
                      input.focus();
                      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                  }, 120);
                }}
                className="min-w-[44px] min-h-[44px] w-11 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                aria-label="Quick Search Students, Leads & Batches"
                title="Quick Search"
              >
                <Search className="w-4 h-4" />
              </button>
            </div>

            {/* Mobile/Tablet Quick Creation Actions (< 1024px) */}
            {(onQuickAddLead || onQuickAddAdmission) && (
              <div className="hidden sm:flex lg:hidden items-center gap-1.5">
                {onQuickAddLead && (
                  <button
                    type="button"
                    onClick={onQuickAddLead}
                    className="min-h-[40px] px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold whitespace-nowrap cursor-pointer shadow-2xs"
                  >
                    + Add Lead
                  </button>
                )}
                {onQuickAddAdmission && (
                  <button
                    type="button"
                    onClick={onQuickAddAdmission}
                    className="min-h-[40px] px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold whitespace-nowrap cursor-pointer shadow-2xs"
                  >
                    + Add Admission
                  </button>
                )}
              </div>
            )}

            {/* Hybrid Watchdog Status Pill (Authorized Admin & Operator) */}
            {onOpenEveryPatch && (
              <button
                type="button"
                onClick={onOpenEveryPatch}
                className={`compact-touch-ignore min-h-[38px] lg:min-h-0 h-9 lg:h-8 px-2.5 rounded-lg border text-[10px] font-black flex items-center gap-1.5 cursor-pointer transition-all whitespace-nowrap shrink-0 ${
                  watchdogSnap.mode === 'online_active'
                    ? 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-800'
                    : 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-900'
                }`}
                title={`${watchdogSnap.pillText} — Click to open System Health & Self-Repair (EveryPatch)`}
                aria-label={`${watchdogSnap.pillText} — Open System Health & Self-Repair`}
              >
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    watchdogSnap.mode === 'online_active'
                      ? 'bg-emerald-500 animate-pulse'
                      : 'bg-amber-500 animate-ping'
                  }`}
                />
                <ShieldCheck
                  className={`w-3.5 h-3.5 shrink-0 ${
                    watchdogSnap.mode === 'online_active' ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                />
                <span className="hidden 2xl:inline">{watchdogSnap.pillText}</span>
                <span className="hidden md:inline 2xl:hidden">
                  {watchdogSnap.mode === 'online_active' ? 'EVERY-PATCH LIVE' : 'OFFLINE SELF-HEAL'}
                </span>
              </button>
            )}

            {/* Compact Profile Badge + Operator Switch / Sign Out Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setProfileMenuOpen(prev => !prev);
                  setProfileAuthError(null);
                }}
                className={`compact-touch-ignore min-h-[38px] lg:min-h-0 h-9 lg:h-8 px-2.5 rounded-lg border text-[11px] font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-all ${
                  isMasterAdmin
                    ? 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-900'
                    : 'bg-indigo-50 hover:bg-indigo-100 border-indigo-200 text-indigo-800'
                }`}
                title={`Active Account: ${activeProfileName} (${activeProfileRole}) • ${activeProfileEmail}`}
                aria-expanded={profileMenuOpen}
                aria-haspopup="menu"
              >
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    isMasterAdmin ? 'bg-emerald-600' : 'bg-indigo-600'
                  }`}
                />
                <span className="hidden sm:inline">
                  {activeProfileName} ({activeProfileRole})
                </span>
                <span className="sm:hidden">{isMasterAdmin ? 'Prasad Sir' : 'Operator'}</span>
                <ChevronDown className="w-3.5 h-3.5 opacity-70 shrink-0" />
              </button>

              {profileMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-2 w-72 sm:w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 p-3 z-50 text-left space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-100">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <UserCheck className={`w-4 h-4 shrink-0 ${isMasterAdmin ? 'text-emerald-600' : 'text-indigo-600'}`} />
                        <span className="text-xs font-black text-slate-900 truncate">
                          {activeProfileName} ({activeProfileRole})
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 truncate mt-0.5">
                        {activeProfileEmail}
                      </div>
                      <div className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span>Pre-Connected • google.com</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setProfileMenuOpen(false)}
                      className="text-slate-400 hover:text-slate-700 text-xs font-bold p-1 cursor-pointer"
                      aria-label="Close profile menu"
                    >
                      ✕
                    </button>
                  </div>

                  {profileAuthError && (
                    <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-[11px] space-y-1.5 break-words">
                      <div className="font-bold">
                        {profileAuthError.code ? `Auth Notice (${profileAuthError.code})` : 'Sign-In Notice'}
                      </div>
                      <div>{profileAuthError.message}</div>
                      {profileAuthError.isUnauthorizedDomain && profileAuthError.hostname && (
                        <div className="flex items-center justify-between gap-1.5 bg-white p-1.5 rounded border border-rose-200">
                          <code className="text-[10px] font-mono text-slate-800 break-all">
                            {profileAuthError.hostname}
                          </code>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard?.writeText(profileAuthError.hostname).catch(() => {});
                              setCopiedProfileHost(true);
                              setTimeout(() => setCopiedProfileHost(false), 2000);
                            }}
                            className="px-2 py-0.5 rounded bg-slate-800 text-white text-[10px] font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                          >
                            {copiedProfileHost ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedProfileHost ? 'Copied' : 'Copy'}</span>
                          </button>
                        </div>
                      )}
                      {(profileAuthError.isPopupBlocked || (typeof window !== 'undefined' && window.self !== window.top)) && !profileAuthError.isAccessDenied && (
                        <a
                          href={typeof window !== 'undefined' ? window.location.href : '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block w-full py-1.5 px-2 rounded-lg bg-slate-900 text-white text-center font-bold text-[10px]"
                        >
                          Open App in New Full Browser Tab ↗
                        </a>
                      )}
                    </div>
                  )}

                  {/* Switch Operator (Google Sign-In): triggers signInWithPopup synchronously inside onClick */}
                  <button
                    type="button"
                    disabled={profileSigningIn}
                    onClick={() => {
                      if (profileSigningIn) return;
                      setProfileSigningIn(true);
                      setProfileAuthError(null);
                      signInWithGoogleAuth()
                        .then(() => {
                          recordSyncError(null);
                          void testConnection();
                          setProfileMenuOpen(false);
                        })
                        .catch((err: any) => {
                          const formatted = formatFirebaseAuthError(err);
                          setProfileAuthError(formatted);
                        })
                        .finally(() => {
                          setProfileSigningIn(false);
                        });
                    }}
                    className="w-full py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <LogIn className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span>{profileSigningIn ? 'Opening Google Sign-In...' : 'Switch Operator (Google Sign-In)'}</span>
                  </button>

                  {!isMasterAdmin && onQuickResumeMasterAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        onQuickResumeMasterAdmin();
                        setProfileMenuOpen(false);
                      }}
                      className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                      <span>Quick Resume: Master Admin</span>
                    </button>
                  )}

                  {onSignOut && (
                    <button
                      type="button"
                      onClick={() => {
                        setProfileMenuOpen(false);
                        onSignOut();
                      }}
                      className="w-full py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5 shrink-0" />
                      <span>Sign Out</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Candle AI Trigger Button */}
            <button
              type="button"
              onClick={onOpenAiDrawer}
              className="min-h-[44px] lg:min-h-0 h-11 lg:h-8 px-3 rounded-lg bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-900 hover:from-indigo-900 hover:to-slate-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer border border-indigo-700/50 whitespace-nowrap shrink-0"
              title="Open Candle AI Consultant (Ctrl+K)"
            >
              <Sparkles className="w-4 h-4 lg:w-3.5 lg:h-3.5 text-amber-400 shrink-0" />
              <span className="hidden sm:inline">Candle AI</span>
            </button>
          </div>
        </div>

        {/* Responsive Mobile/Tablet Horizontal Scroll Data-Sync Ribbon (Master Admin Only • < 1024px lg:hidden) */}
        {isMasterAdmin && (
          <div
            className="lg:hidden w-full bg-slate-900 text-white px-2.5 py-1.5 border-t border-slate-800 flex items-center gap-1.5 overflow-x-auto no-scrollbar"
            role="toolbar"
            aria-label="Mobile Data-Sync Toolbar"
          >
            <button
              type="button"
              onClick={() => setShowSyncDetails(prev => !prev)}
              className={`px-2 py-1 text-[11px] font-bold rounded-md flex items-center gap-1.5 whitespace-nowrap shrink-0 border cursor-pointer ${
                effectiveSyncState === 'Syncing'
                  ? 'bg-blue-950 text-blue-300 border-blue-700'
                  : effectiveSyncState === 'Connected'
                  ? isRemotePulsing
                    ? 'bg-emerald-900 text-emerald-200 border-emerald-400 ring-1 ring-emerald-400'
                    : 'bg-emerald-950 text-emerald-300 border-emerald-700'
                  : effectiveSyncState === 'Error'
                  ? 'bg-rose-950 text-rose-300 border-rose-700'
                  : effectiveSyncState === 'Offline'
                  ? 'bg-slate-800 text-slate-300 border-slate-600'
                  : 'bg-amber-950 text-amber-300 border-amber-700'
              }`}
              title={
                syncSnap.lastError
                  ? `Error: ${syncSnap.lastError}`
                  : resolvedLastSyncTime
                  ? `Status: ${statusPillLabel} • Last Sync: ${resolvedLastSyncTime}`
                  : `Status: ${statusPillLabel}`
              }
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  effectiveSyncState === 'Syncing'
                    ? 'bg-blue-400 animate-ping'
                    : effectiveSyncState === 'Connected'
                    ? isRemotePulsing
                      ? 'bg-emerald-300 animate-ping'
                      : 'bg-emerald-400'
                    : effectiveSyncState === 'Error'
                    ? 'bg-rose-400 animate-pulse'
                    : effectiveSyncState === 'Offline'
                    ? 'bg-slate-400'
                    : 'bg-amber-400 animate-pulse'
                }`}
              />
              <span>{statusPillLabel}</span>
            </button>

            <button
              type="button"
              onClick={handlePushClick}
              disabled={isCloudSyncing}
              className="px-2 py-1 text-[11px] font-bold rounded-md bg-emerald-600 text-white flex items-center gap-1 whitespace-nowrap shrink-0 active:scale-95 cursor-pointer"
            >
              <CloudUpload className="w-3 h-3" />
              <span>Push Update</span>
            </button>

            <button
              type="button"
              onClick={handleOverwriteClick}
              disabled={isCloudSyncing}
              className="px-2 py-1 text-[11px] font-bold rounded-md bg-amber-600 text-white flex items-center gap-1 whitespace-nowrap shrink-0 active:scale-95 cursor-pointer"
            >
              <Zap className="w-3 h-3" />
              <span>Overwrite Cloud</span>
            </button>

            <button
              type="button"
              onClick={handleFetchClick}
              disabled={isCloudSyncing}
              className="px-2 py-1 text-[11px] font-bold rounded-md bg-blue-600 text-white flex items-center gap-1 whitespace-nowrap shrink-0 active:scale-95 cursor-pointer"
            >
              <CloudDownload className="w-3 h-3" />
              <span>Restore / Pull from Cloud</span>
            </button>

            <button
              type="button"
              onClick={handleWorkspaceSyncClick}
              disabled={isCloudSyncing}
              className="px-2 py-1 text-[11px] font-bold rounded-md bg-teal-600 text-white flex items-center gap-1 whitespace-nowrap shrink-0 active:scale-95 cursor-pointer"
            >
              <FileSpreadsheet className="w-3 h-3" />
              <span>Sync & Fetch Google Workspace</span>
            </button>

            <button
              type="button"
              onClick={handleLocalSnapshotClick}
              className="px-2 py-1 text-[11px] font-bold rounded-md bg-slate-800 border border-slate-700 text-slate-100 flex items-center gap-1 whitespace-nowrap shrink-0 active:scale-95 cursor-pointer"
            >
              <HardDrive className="w-3 h-3 text-cyan-400" />
              <span>Local Backup</span>
            </button>

            <button
              type="button"
              onClick={handleExportJsonClick}
              className="px-2 py-1 text-[11px] font-bold rounded-md bg-slate-800 border border-slate-700 text-slate-100 flex items-center gap-1 whitespace-nowrap shrink-0 active:scale-95 cursor-pointer"
            >
              <FileJson className="w-3 h-3 text-indigo-400" />
              <span>JSON Backup</span>
            </button>

            <button
              type="button"
              onClick={() => restoreInputRef.current?.click()}
              className="px-2 py-1 text-[11px] font-bold rounded-md bg-slate-800 border border-slate-700 text-slate-100 flex items-center gap-1 whitespace-nowrap shrink-0 active:scale-95 cursor-pointer"
            >
              <FolderOpen className="w-3 h-3 text-amber-400" />
              <span>Restore JSON</span>
            </button>
          </div>
        )}

        {/* Responsive Clamped Sync Telemetry Popover (Visible on Desktop, Tablet & Mobile) */}
        {showSyncDetails && (
          <div className="fixed top-14 right-3 z-[60] w-[min(92vw,380px)] max-h-[80vh] overflow-y-auto bg-slate-900 text-white rounded-xl shadow-2xl border border-slate-700 p-3.5 text-xs space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="font-extrabold text-slate-100 flex items-center gap-1.5">
                <Cloud className="w-4 h-4 text-emerald-400" />
                <span>Cloud &amp; Sheets Sync Telemetry</span>
              </span>
              <button
                type="button"
                onClick={() => setShowSyncDetails(false)}
                className="text-slate-400 hover:text-white text-[11px] font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="space-y-1.5 text-[11px]">
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Institute Account:</span>
                <span className="font-mono font-bold text-emerald-400 truncate">
                  {PRIMARY_INSTITUTE_EMAIL}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Live Status:</span>
                <span
                  className={`font-bold ${
                    effectiveSyncState === 'Connected'
                      ? 'text-emerald-400'
                      : effectiveSyncState === 'Error'
                      ? 'text-rose-400'
                      : effectiveSyncState === 'Offline'
                      ? 'text-blue-300'
                      : 'text-amber-300'
                  }`}
                >
                  {statusPillLabel}
                </span>
              </div>
              {(telemetry.error || syncSnap.lastError) && (
                <div className="p-2 rounded bg-rose-950/80 border border-rose-700 text-rose-200 font-mono text-[10px]">
                  Error: {telemetry.error || syncSnap.lastError}
                </div>
              )}
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Shared Workspace:</span>
                <span className="font-mono font-bold text-blue-300">
                  institutes/{INSTITUTE_WORKSPACE_ID}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Firestore Verified:</span>
                <span
                  className={
                    syncSnap.firestoreVerified
                      ? 'text-emerald-400 font-bold'
                      : syncSnap.isAuthTokenValid
                      ? 'text-emerald-300 font-bold'
                      : 'text-rose-300 font-bold'
                  }
                >
                  {syncSnap.firestoreVerified
                    ? 'Yes (Live Multi-Device Sync)'
                    : syncSnap.isAuthTokenValid
                    ? 'Pre-Connected (IndexedDB + Sheets Ready)'
                    : 'No (Sign-in Required)'}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Last Cloud Sync:</span>
                <span className="font-mono text-slate-200">{resolvedLastSyncTime || 'Not synced yet'}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Backup Engine Status:</span>
                <span
                  className={`font-mono font-bold ${
                    backupProgress.status === BACKUP_STATUS.FAILED
                      ? 'text-rose-400'
                      : backupProgress.status === BACKUP_STATUS.COMPLETED || lastBackupMeta
                      ? 'text-emerald-400'
                      : 'text-amber-300'
                  }`}
                >
                  {backupProgress.status !== BACKUP_STATUS.IDLE
                    ? `${backupProgress.status} (${backupProgress.progress}%)`
                    : lastBackupMeta
                    ? `COMPLETED (${lastBackupMeta.totalRecords} recs)`
                    : 'No verified backup yet'}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Last Verified Backup:</span>
                <span className="font-mono text-slate-200">
                  {lastBackupMeta?.completedAt || 'No verified backup yet'}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Pending Records Count:</span>
                <span className="font-mono text-slate-200">{syncSnap.pendingChangesCount}</span>
              </div>
              {syncSnap.financialConflictsCount > 0 && (
                <div className="flex justify-between gap-2">
                  <span className="text-amber-300 font-bold">Flagged Financial Conflicts:</span>
                  <span className="font-mono font-bold text-amber-300">{syncSnap.financialConflictsCount} (Review in Settings)</span>
                </div>
              )}
            </div>
            {syncSnap.lastError && (
              <div
                className={`p-2 rounded-lg border text-[11px] break-words ${
                  syncSnap.errorCategory === 'offline' || syncSnap.errorCategory === 'network-timeout'
                    ? 'bg-amber-950/90 border-amber-700 text-amber-200'
                    : 'bg-rose-950/90 border-rose-700 text-rose-200'
                }`}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-extrabold">
                    {syncSnap.errorCategory === 'offline'
                      ? 'Offline Queue Active:'
                      : syncSnap.errorCategory === 'network-timeout'
                      ? 'Network Timeout Notice:'
                      : syncSnap.errorCategory === 'permission-denied'
                      ? 'Permission / Auth Notice:'
                      : 'Sync Diagnostic:'}
                  </span>
                  <button
                    type="button"
                    onClick={() => recordSyncError(null)}
                    className="text-[10px] underline opacity-80 hover:opacity-100 cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
                {syncSnap.lastError}
              </div>
            )}
            {popoverAuthError && (
              <div className="p-2.5 rounded-lg bg-rose-950/90 border border-rose-700 text-rose-100 text-[11px] space-y-2 break-words">
                <div className="font-bold text-rose-300">
                  {popoverAuthError.code ? `Auth Error (${popoverAuthError.code})` : 'Google Sign-In Error'}
                </div>
                <div>{popoverAuthError.message}</div>
                {popoverAuthError.isUnauthorizedDomain && popoverAuthError.hostname && (
                  <div className="flex items-center justify-between gap-2 bg-slate-950 p-1.5 rounded border border-rose-800/70">
                    <code className="text-[10px] font-mono text-emerald-300 break-all">
                      {popoverAuthError.hostname}
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(popoverAuthError.hostname).catch(() => {});
                        setCopiedPopoverHost(true);
                        setTimeout(() => setCopiedPopoverHost(false), 2000);
                      }}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-white cursor-pointer shrink-0"
                    >
                      {copiedPopoverHost ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                )}
                {(popoverAuthError.isPopupBlocked || (typeof window !== 'undefined' && window.self !== window.top)) && !popoverAuthError.isAccessDenied && (
                  <a
                    href={typeof window !== 'undefined' ? window.location.href : '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full py-1.5 px-2 rounded bg-slate-800 hover:bg-slate-700 text-blue-300 font-bold text-center"
                  >
                    Open App in New Full Browser Tab ↗
                  </a>
                )}
              </div>
            )}
            {!syncSnap.isAuthTokenValid && isOnline && (
              <button
                type="button"
                disabled={popoverSigningIn}
                onClick={async () => {
                  setPopoverSigningIn(true);
                  setPopoverAuthError(null);
                  try {
                    await signInWithGoogleAuth();
                    recordSyncError(null);
                    await testConnection();
                    handleFetchClick();
                  } catch (err: any) {
                    const formatted = formatFirebaseAuthError(err);
                    setPopoverAuthError(formatted);
                    recordSyncError(formatted.message, err);
                  } finally {
                    setPopoverSigningIn(false);
                  }
                }}
                className="w-full py-1.5 px-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-bold text-[11px] text-center cursor-pointer"
              >
                {popoverSigningIn ? 'Signing in with Google...' : 'Sign In with Google to Bind Live Firestore'}
              </button>
            )}
          </div>
        )}
      </header>

      {/* Mobile & Tablet Off-Canvas Slide-Out Navigation Drawer (Strictly lg:hidden) */}
      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Navigation Menu"
        >
          <div className="bg-white w-[86%] max-w-xs h-full shadow-2xl border-r border-slate-200 flex flex-col justify-between overflow-y-auto">
            <div>
              {/* Drawer Header */}
              <div className="p-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-2.5 min-w-0">
                  {customLogo ? (
                    <img
                      src={customLogo}
                      alt={settings.instituteName}
                      className="w-8 h-8 rounded-lg object-contain bg-white border border-slate-200 p-0.5 shrink-0"
                    />
                  ) : (
                    <SrujaanBadgeLogo className="w-8 h-8 rounded-lg shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="font-extrabold text-xs text-slate-900 leading-snug line-clamp-2">
                      Srujaan Share Market Institute Management System
                    </div>
                    <div className="text-[9px] text-amber-600 font-bold tracking-wider uppercase truncate mt-0.5">
                      WHERE KNOWLEDGE MEETS PROFIT.
                    </div>
                    <div className="text-[10px] text-slate-500 font-medium truncate">
                      {isMasterAdmin ? 'Master Admin' : 'Staff Operator'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="min-w-[44px] min-h-[44px] w-11 h-11 rounded-xl bg-slate-200/70 hover:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer"
                  aria-label="Close Menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer Quick Add Triggers */}
              {(onQuickAddLead || onQuickAddAdmission) && (
                <div className="px-3 pt-3 grid grid-cols-2 gap-2">
                  {onQuickAddLead && (
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        onQuickAddLead();
                      }}
                      className="min-h-[44px] px-2.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-extrabold cursor-pointer shadow-xs"
                    >
                      + Add Lead
                    </button>
                  )}
                  {onQuickAddAdmission && (
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        onQuickAddAdmission();
                      }}
                      className="min-h-[44px] px-2.5 py-2 rounded-xl bg-blue-600 text-white text-xs font-extrabold cursor-pointer shadow-xs"
                    >
                      + Add Admission
                    </button>
                  )}
                </div>
              )}

              {/* Navigation Links */}
              <div className="p-2.5 space-y-1">
                {navItems.map(item => {
                  const IconComp = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onTabChange(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <IconComp className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                        <span>{item.label}</span>
                      </span>
                      {item.badge !== undefined && (
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-extrabold ${
                            isActive ? 'bg-white/20 text-white' : item.badgeColor || 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Mobile Drawer Footer */}
            <div className="p-3.5 border-t border-slate-200 bg-slate-50 space-y-2.5">
              {onOpenEveryPatch && (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenEveryPatch();
                  }}
                  className={`w-full px-3 py-2 rounded-xl border text-[10px] font-black flex items-center justify-center gap-1.5 cursor-pointer ${
                    watchdogSnap.mode === 'online_active'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-amber-50 border-amber-300 text-amber-900'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{watchdogSnap.pillText}</span>
                </button>
              )}

              {isMasterAdmin && (
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      handlePushClick();
                      setMobileMenuOpen(false);
                    }}
                    className="px-2.5 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <CloudUpload className="w-3.5 h-3.5" />
                    <span>Push Update</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleOverwriteClick();
                      setMobileMenuOpen(false);
                    }}
                    className="px-2.5 py-2 rounded-lg bg-amber-600 text-white text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>Overwrite Cloud</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleFetchClick();
                      setMobileMenuOpen(false);
                    }}
                    className="px-2.5 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <CloudDownload className="w-3.5 h-3.5" />
                    <span>Fetch & Apply</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleLocalSnapshotClick();
                      setMobileMenuOpen(false);
                    }}
                    className="px-2.5 py-2 rounded-lg bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Local Backup</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleExportJsonClick();
                      setMobileMenuOpen(false);
                    }}
                    className="px-2.5 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-indigo-600" />
                    <span>JSON Backup</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      restoreInputRef.current?.click();
                      setMobileMenuOpen(false);
                    }}
                    className="px-2.5 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5 text-amber-600" />
                    <span>Restore JSON</span>
                  </button>
                </div>
              )}

              {onSignOut && (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onSignOut();
                  }}
                  className="w-full py-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex-1" onClick={() => setMobileMenuOpen(false)} />
        </div>
      )}
    </>
  );
};

interface DesktopSidebarProps {
  activeTab: NavTabId;
  onTabChange: (tab: NavTabId) => void;
  sidebarMode: SidebarMode;
  onSidebarModeChange: (mode: SidebarMode) => void;
  studentsCount: number;
  followupsDue: number;
  syncQueueCount: number;
  onOpenAiDrawer: () => void;
  isMasterAdmin?: boolean;
}

export const DesktopSidebar: React.FC<DesktopSidebarProps> = ({
  activeTab,
  onTabChange,
  sidebarMode,
  onSidebarModeChange,
  studentsCount,
  followupsDue,
  syncQueueCount,
  onOpenAiDrawer,
  isMasterAdmin = true
}) => {
  const navItems = getNavItems(studentsCount, followupsDue, syncQueueCount, isMasterAdmin);
  const groups: NavItemConfig['group'][] = [
    'Overview',
    'Academics',
    'Growth & CRM',
    'Finance & Admin'
  ];

  // Floating trigger in bottom-left when in Zen / Hidden mode
  if (sidebarMode === 'hidden') {
    return (
      <button
        type="button"
        onClick={() => onSidebarModeChange('standard')}
        className="hidden lg:flex fixed bottom-5 left-4 z-20 items-center gap-2 px-3 py-2 rounded-xl bg-slate-900/95 hover:bg-slate-800 text-white text-xs font-extrabold shadow-lg border border-slate-700 transition-all cursor-pointer group"
        title="Restore Navigation Sidebar (Shortcut: [ or Ctrl+B)"
      >
        <PanelLeftOpen className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform" />
        <span>Sidebar</span>
        <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px] border border-slate-700">
          [
        </kbd>
      </button>
    );
  }

  const isCompact = sidebarMode === 'compact';
  const isExpanded = sidebarMode === 'expanded';

  const [customWidth, setCustomWidth] = useState<number | null>(() => {
    try {
      const saved = localStorage.getItem('ssm_sidebar_custom_width');
      return saved ? Number(saved) : null;
    } catch {
      return null;
    }
  });

  const handleStartResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const initialWidth = customWidth || (isCompact ? 64 : isExpanded ? 268 : 224);

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const nextWidth = Math.max(64, Math.min(340, initialWidth + delta));
      if (nextWidth < 96) {
        onSidebarModeChange('compact');
        setCustomWidth(null);
      } else {
        if (sidebarMode === 'compact') onSidebarModeChange('standard');
        setCustomWidth(nextWidth);
        try {
          localStorage.setItem('ssm_sidebar_custom_width', String(nextWidth));
        } catch {}
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const widthClass = isCompact
    ? 'w-[64px]'
    : isExpanded
    ? 'w-[256px]'
    : 'w-[220px]';

  return (
    <aside
      aria-label="Primary Workspace Sidebar"
      style={!isCompact && customWidth ? { width: `${customWidth}px` } : undefined}
      className={`hidden lg:flex flex-col justify-between shrink-0 bg-white border-r border-slate-200/90 select-none transition-all duration-150 ease-out sticky top-[52px] h-[calc(100dvh-52px)] relative ${widthClass}`}
    >
      {/* Interactive Drag-to-Resize Handle on Right Edge */}
      <div
        onMouseDown={handleStartResize}
        title="Drag to resize sidebar width"
        className="absolute top-0 right-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-500/40 active:bg-blue-600 transition-colors z-20"
      />
      {/* Top Brand Title & Size Adjustment Controls */}
      {!isCompact && (
        <div className="px-3 pt-2.5 pb-2 border-b border-slate-100 bg-slate-900 text-white">
          <div className="text-[11px] font-extrabold leading-snug tracking-tight text-white">
            Srujaan Share Market Institute Management System
          </div>
          <div className="text-[9px] font-bold tracking-[0.12em] text-amber-400 uppercase mt-0.5">
            WHERE KNOWLEDGE MEETS PROFIT.
          </div>
        </div>
      )}
      <div className="p-2 border-b border-slate-100 flex items-center justify-between gap-1 bg-slate-50/70">
        {!isCompact && (
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 pl-1.5 truncate">
            {customWidth ? `Custom (${customWidth}px)` : isExpanded ? 'Wide Nav (256px)' : 'Navigation'}
          </span>
        )}
        <div
          className={`flex items-center gap-0.5 ${
            isCompact ? 'w-full justify-center' : 'ml-auto'
          }`}
        >
          <button
            type="button"
            onClick={() => onSidebarModeChange(isCompact ? 'standard' : 'compact')}
            className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
              isCompact
                ? 'bg-blue-50 text-blue-600 font-bold'
                : 'text-slate-500 hover:bg-slate-200/70 hover:text-slate-900'
            }`}
            title={isCompact ? 'Expand to Standard Sidebar (240px)' : 'Collapse to Icon-Only Mini Sidebar (64px)'}
          >
            {isCompact ? <PanelLeftOpen className="w-4 h-4" /> : <Minimize2 className="w-3.5 h-3.5" />}
          </button>

          {!isCompact && (
            <>
              <button
                type="button"
                onClick={() => onSidebarModeChange(isExpanded ? 'standard' : 'expanded')}
                className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                  isExpanded
                    ? 'bg-blue-50 text-blue-600 font-bold'
                    : 'text-slate-500 hover:bg-slate-200/70 hover:text-slate-900'
                }`}
                title={isExpanded ? 'Switch to Standard Width (240px)' : 'Slightly Wider Mode (280px)'}
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onSidebarModeChange('hidden')}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200/70 hover:text-slate-900 transition-colors cursor-pointer"
                title="Hide Sidebar — Full-Screen Zen Mode ([ or Ctrl+B)"
              >
                <EyeOff className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Scrollable Navigation Sections */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-2 space-y-3">
        {groups.map(groupName => {
          const groupItems = navItems.filter(i => i.group === groupName);
          return (
            <div key={groupName} className="space-y-0.5">
              {!isCompact && (
                <div className="px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  {groupName}
                </div>
              )}
              {groupItems.map(item => {
                const IconComp = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onTabChange(item.id)}
                    title={
                      isCompact
                        ? `${item.label}${item.badge !== undefined ? ` (${item.badge})` : ''}`
                        : undefined
                    }
                    className={`group relative w-full flex items-center ${
                      isCompact ? 'justify-center px-0 h-10' : 'justify-between px-2.5 h-10'
                    } rounded-xl transition-all cursor-pointer ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-2xs font-bold'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-medium'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <IconComp
                        className={`w-[18px] h-[18px] shrink-0 transition-transform ${
                          isActive
                            ? 'text-white'
                            : 'text-slate-500 group-hover:text-slate-800'
                        }`}
                      />
                      {!isCompact && (
                        <span
                          className={`truncate ${
                            isExpanded ? 'text-[15px]' : 'text-[13.5px]'
                          }`}
                        >
                          {isExpanded ? item.label : item.shortLabel}
                        </span>
                      )}
                    </span>

                    {!isCompact && item.badge !== undefined && (
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold shrink-0 ${
                          isActive
                            ? 'bg-white/20 text-white'
                            : item.badgeColor || 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}

                    {isCompact && item.badge !== undefined && (
                      <span
                        className={`absolute top-1.5 right-2 w-2 h-2 rounded-full ${
                          isActive ? 'bg-white' : 'bg-blue-600'
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Bottom Sidebar Mode Switcher & AI Quick Trigger */}
      <div className="p-2 border-t border-slate-200/80 bg-slate-50/60 space-y-1.5">
        {!isCompact ? (
          <div className="grid grid-cols-4 gap-1 bg-slate-200/70 p-0.5 rounded-lg">
            {(
              [
                { id: 'compact', label: 'Mini' },
                { id: 'standard', label: 'Std' },
                { id: 'expanded', label: 'Wide' },
                { id: 'hidden', label: 'Zen' }
              ] as { id: SidebarMode; label: string }[]
            ).map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => onSidebarModeChange(m.id)}
                className={`py-1 rounded-md text-[10px] font-extrabold transition-all cursor-pointer ${
                  sidebarMode === m.id
                    ? 'bg-white text-blue-600 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title={`Switch Sidebar to ${m.label} mode`}
              >
                {m.label}
              </button>
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={onOpenAiDrawer}
            className="w-full h-9 rounded-xl bg-indigo-950 hover:bg-indigo-900 text-amber-400 flex items-center justify-center cursor-pointer"
            title="Open Candle AI Consultant (Ctrl+K)"
          >
            <Sparkles className="w-4 h-4" />
          </button>
        )}
      </div>
    </aside>
  );
};
