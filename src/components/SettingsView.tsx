import React, { useState, useRef, useEffect } from 'react';
import { AppState, StorageQuotaInfo, InstituteSettings, CampusBranch, PrimaryAddressConfig } from '../types';
import {
  Building2,
  Image as ImageIcon,
  MapPin,
  Receipt,
  Award,
  Cloud,
  HardDrive,
  Save,
  CheckCircle2,
  Upload,
  Trash2,
  Download,
  FileSpreadsheet,
  ExternalLink,
  RefreshCw,
  QrCode,
  UploadCloud,
  DownloadCloud,
  Database,
  Clock,
  Plus,
  Edit3,
  AlertCircle,
  AlertTriangle,
  Check,
  ShieldCheck,
  LogIn,
  Copy
} from 'lucide-react';
import {
  downloadBackupJson,
  exportMasterBackup,
  exportMasterExcelFile,
  getActiveInstituteAddress,
  getSyncDiagnosticsReport,
  clearAllDeletedTombstones,
  runLiveFirebaseVerificationSuite,
  getFinancialConflictReport,
  clearFinancialConflictReport,
  SyncDiagnosticsReport,
  VerificationTestResult,
  FinancialConflictItem
} from '../services/db';
import { useDebouncedSync } from '../hooks/useDebouncedSync';
import { UniversalStorageHub } from './UniversalStorageHub';
import { SSMSyncStatusBadge } from './SSMSyncStatusBadge';
import { SystemHealthPanel } from './SystemHealthPanel';
import {
  PRIMARY_INSTITUTE_EMAIL,
  sendCorsSafeAppsScriptRequest,
  syncAllStoragesUnified,
  ZERO_TOUCH_APPS_SCRIPT_CODE
} from '../services/storageManager';
import {
  auth,
  testConnection,
  signInWithGoogleAuth,
  pushAllStudentsStrictToFirestore,
  formatFirebaseAuthError,
  FormattedFirebaseAuthError,
  StrictStudentSyncResult,
  ACTIVE_FIREBASE_PROJECT_ID
} from '../services/firebase';

interface SettingsViewProps {
  state: AppState;
  storageQuota: StorageQuotaInfo;
  onUpdateSettings: (newSettings: InstituteSettings, isAutoSave?: boolean) => void;
  onRestoreBackup: (file: File) => void;
  onResetFactoryData: () => void;
  onPushCloudSync: () => Promise<void> | void;
  onMasterFetchFromCloud?: () => Promise<void> | void;
  onForcePullFromCloud?: () => Promise<void> | void;
  onForcePushLocalToCloud?: () => Promise<void> | void;
  isCloudSyncing?: boolean;
  onApplyRepairedState?: (nextState: AppState, reason?: string) => void;
  onToast?: (msg: string) => void;
}

type SettingsSection =
  | 'identity-logos'
  | 'location-contact'
  | 'financial-invoicing'
  | 'academic-certificate'
  | 'cloud-backup'
  | 'system-health';

export const SettingsView: React.FC<SettingsViewProps> = ({
  state,
  storageQuota,
  onUpdateSettings,
  onRestoreBackup,
  onResetFactoryData,
  onPushCloudSync,
  onMasterFetchFromCloud,
  onForcePullFromCloud,
  onForcePushLocalToCloud,
  isCloudSyncing = false,
  onApplyRepairedState,
  onToast
}) => {
  const [activeSection, setActiveSection] = useState<SettingsSection>('identity-logos');
  const [diagReport, setDiagReport] = useState<SyncDiagnosticsReport>(() => getSyncDiagnosticsReport());
  const [reconcileStatusMsg, setReconcileStatusMsg] = useState<string | null>(null);
  const [isReconcilingDevices, setIsReconcilingDevices] = useState(false);
  const [isRunningSuite, setIsRunningSuite] = useState(false);
  const [suiteResults, setSuiteResults] = useState<VerificationTestResult[] | null>(null);
  const [financialConflicts, setFinancialConflicts] = useState<FinancialConflictItem[]>(() => getFinancialConflictReport());
  const [settingsAuthError, setSettingsAuthError] = useState<FormattedFirebaseAuthError | null>(null);
  const [isSigningInSettings, setIsSigningInSettings] = useState(false);
  const [copiedSettingsHost, setCopiedSettingsHost] = useState(false);
  const [isSyncingStudentsNow, setIsSyncingStudentsNow] = useState(false);
  const [syncNowResult, setSyncNowResult] = useState<StrictStudentSyncResult | null>(null);

  useEffect(() => {
    const refreshDiag = () => {
      setDiagReport(getSyncDiagnosticsReport());
      setFinancialConflicts(getFinancialConflictReport());
    };
    refreshDiag();
    let unsubAuth = () => {};
    try {
      unsubAuth = auth.onAuthStateChanged(
        (user) => {
          if (user) {
            setSettingsAuthError(null);
          }
          refreshDiag();
        },
        (err) => {
          console.warn('[SettingsView Auth Notice]:', err);
        }
      );
    } catch {
      unsubAuth = () => {};
    }
    const onAuthConnectedEvent = () => {
      setSettingsAuthError(null);
      refreshDiag();
    };
    window.addEventListener('ssm-firebase-auth-connected', onAuthConnectedEvent);
    if (activeSection !== 'cloud-backup') {
      return () => {
        try {
          unsubAuth();
        } catch {
          // ignore
        }
        window.removeEventListener('ssm-firebase-auth-connected', onAuthConnectedEvent);
      };
    }
    const interval = window.setInterval(refreshDiag, 3000);
    return () => {
      window.clearInterval(interval);
      try {
        unsubAuth();
      } catch {
        // ignore
      }
      window.removeEventListener('ssm-firebase-auth-connected', onAuthConnectedEvent);
    };
  }, [activeSection, state.students.length, state.lastSavedAt]);

  const buildInitialPrimaryAddress = (s: InstituteSettings): PrimaryAddressConfig => ({
    branchName: s.primaryAddress?.branchName || '',
    streetAddress: s.primaryAddress?.streetAddress ?? s.campusAddress ?? '',
    landmark: s.primaryAddress?.landmark ?? s.landmark ?? '',
    city: s.primaryAddress?.city ?? s.city ?? '',
    district: s.primaryAddress?.district ?? s.district ?? '',
    state: s.primaryAddress?.state ?? s.state ?? '',
    pincode: s.primaryAddress?.pincode ?? s.pincode ?? '',
    phone: s.primaryAddress?.phone ?? s.phone ?? '',
    whatsapp: s.primaryAddress?.whatsapp ?? s.whatsappSupport ?? s.phone ?? '',
    googleMapsUrl: s.primaryAddress?.googleMapsUrl ?? s.googleMapsUrl ?? '',
    fullFormattedAddress: s.primaryAddress?.fullFormattedAddress ?? s.campusAddress ?? ''
  });

  // Form State initialized from centralized state.settings (with zero hardcoded address presets)
  const [formData, setFormData] = useState<InstituteSettings>({
    ...state.settings,
    primaryLogoBase64: state.settings.primaryLogoBase64 || state.settings.logoBase64 || '',
    certificateLogoBase64: state.settings.certificateLogoBase64 || '',
    signatureBase64: state.settings.signatureBase64 || '',
    upiQrBase64: state.settings.upiQrBase64 || '',
    shortName: state.settings.shortName || 'SSMI',
    tagline: state.settings.tagline || 'Leading Technical Analysis & Institutional Trading Academy',
    regNumber: state.settings.regNumber || 'MH-PUN-MSME-2024-88910',
    campusAddress: state.settings.campusAddress || '',
    primaryAddress: buildInitialPrimaryAddress(state.settings),
    branches: Array.isArray(state.settings.branches) ? state.settings.branches : [],
    landmark: state.settings.landmark || '',
    city: state.settings.city || '',
    state: state.settings.state || '',
    district: state.settings.district || '',
    pincode: state.settings.pincode || '',
    whatsappSupport: state.settings.whatsappSupport || state.settings.phone || '',
    currencySymbol: state.settings.currencySymbol || '₹',
    receiptPrefix: state.settings.receiptPrefix || 'SSMI-REC-2026-',
    receiptStartingNumber: state.settings.receiptStartingNumber || 1001,
    receiptTerms: state.settings.receiptTerms || '1. Fees paid are non-refundable & non-transferable under any circumstances.\n2. Admission is valid strictly for the registered batch and lifetime mentorship.\n3. Trading in securities involves market risk; curriculum is strictly educational.\n4. Access to private Discord trading desk requires 80%+ attendance.',
    bankName: state.settings.bankName || 'HDFC Bank Ltd',
    bankAccountName: state.settings.bankAccountName || 'Srujaan Share Market Institute LLP',
    bankAccountNumber: state.settings.bankAccountNumber || '50200088992211',
    bankIfsc: state.settings.bankIfsc || 'HDFC0001234',
    certificateHeading: state.settings.certificateHeading || 'Certificate of Course Completion',
    certificateAuthorityText: state.settings.certificateAuthorityText || 'has successfully completed all prescribed practical curriculum, technical trading assessments, and mentorship requirements for:',
    cloudConfig: {
      provider: state.settings.cloudConfig?.provider || 'firebase',
      firebaseUrl: state.settings.cloudConfig?.firebaseUrl || '',
      authToken: state.settings.cloudConfig?.authToken || '',
      autoSyncIntervalMs: state.settings.cloudConfig?.autoSyncIntervalMs || 120000,
      autoSaveSettings: state.settings.cloudConfig?.autoSaveSettings !== false
    }
  });

  // Editable Multi-Branch Form State (Option B)
  const [branchEditorOpen, setBranchEditorOpen] = useState(false);
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [branchForm, setBranchForm] = useState<{
    branchName: string;
    fullAddress: string;
    landmark: string;
    city: string;
    pincode: string;
    phone: string;
    whatsapp: string;
    googleMapsUrl: string;
    isDefault: boolean;
  }>({
    branchName: '',
    fullAddress: '',
    landmark: '',
    city: '',
    pincode: '',
    phone: '',
    whatsapp: '',
    googleMapsUrl: '',
    isDefault: false
  });
  const [deletingBranchId, setDeletingBranchId] = useState<string | null>(null);
  const [addressSavedBanner, setAddressSavedBanner] = useState<string | null>(null);

  // UI Save state feedback: 'idle' | 'saving' | 'saved' | 'autosaved'
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'autosaved'>('idle');
  const [syncStatus, setSyncStatus] = useState<'synced' | 'pending' | 'saving' | 'offline'>('synced');
  const [uploadFeedback, setUploadFeedback] = useState<string | null>(null);
  const isTypingRef = useRef<boolean>(false);

  // 600ms Debounced background synchronization hook
  const { debouncedTrigger, cancel: cancelDebouncedSync } = useDebouncedSync((nextSettings: InstituteSettings) => {
    if (nextSettings.cloudConfig?.autoSaveSettings === false) {
      isTypingRef.current = false;
      setSyncStatus('synced');
      return;
    }
    setSyncStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'saving');
    const consolidatedSettings: InstituteSettings = {
      ...nextSettings,
      logoBase64: nextSettings.primaryLogoBase64 || nextSettings.logoBase64
    };
    onUpdateSettings(consolidatedSettings, true);
    if (typeof window !== 'undefined' && (window as any).syncManager?.commitMutation) {
      (window as any).syncManager.commitMutation('settings', {
        address: consolidatedSettings.campusAddress,
        primaryAddress: consolidatedSettings.primaryAddress,
        branches: consolidatedSettings.branches
      });
    }
    isTypingRef.current = false;
    setSaveStatus('autosaved');
    setSyncStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'synced');
    window.setTimeout(() => {
      setSaveStatus(prev => (prev === 'autosaved' ? 'idle' : prev));
    }, 2500);
  }, 600);

  // Sync external state.settings changes (only when user is not actively typing)
  useEffect(() => {
    if (isTypingRef.current) return;
    setFormData(prev => ({
      ...prev,
      ...state.settings,
      primaryLogoBase64: state.settings.primaryLogoBase64 || state.settings.logoBase64 || prev.primaryLogoBase64 || '',
      primaryAddress: buildInitialPrimaryAddress(state.settings),
      branches: Array.isArray(state.settings.branches) ? state.settings.branches : [],
      cloudConfig: {
        provider: state.settings.cloudConfig?.provider || prev.cloudConfig?.provider || 'firebase',
        firebaseUrl: state.settings.cloudConfig?.firebaseUrl ?? prev.cloudConfig?.firebaseUrl ?? '',
        authToken: state.settings.cloudConfig?.authToken ?? prev.cloudConfig?.authToken ?? '',
        autoSyncIntervalMs: state.settings.cloudConfig?.autoSyncIntervalMs || prev.cloudConfig?.autoSyncIntervalMs || 120000,
        autoSaveSettings: state.settings.cloudConfig?.autoSaveSettings !== false
      }
    }));
  }, [state.settings.cloudDb?.lastSyncAt]);

  // Hidden file inputs
  const primaryLogoInputRef = useRef<HTMLInputElement>(null);
  const certLogoInputRef = useRef<HTMLInputElement>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);
  const upiQrInputRef = useRef<HTMLInputElement>(null);
  const backupFileInputRef = useRef<HTMLInputElement>(null);

  const formatComposedAddress = (pa: PrimaryAddressConfig): string => {
    const parts = [
      pa.branchName?.trim() ? `${pa.branchName.trim()}: ${pa.streetAddress?.trim() || ''}`.replace(/:\s*$/, '') : pa.streetAddress?.trim() || '',
      pa.landmark?.trim() ? `Landmark: ${pa.landmark.trim()}` : '',
      [
        pa.city?.trim() || '',
        pa.district?.trim() && pa.district?.trim() !== pa.city?.trim() ? pa.district.trim() : '',
        pa.state?.trim() || ''
      ]
        .filter(Boolean)
        .join(', '),
      pa.pincode?.trim() || ''
    ].filter(Boolean);
    return parts.join(', ').replace(/, (\d{6})$/, ' - $1');
  };

  const commitSettingsImmediately = (nextSettings: InstituteSettings, noticeMsg?: string) => {
    cancelDebouncedSync();
    isTypingRef.current = false;
    setSyncStatus('saving');
    const consolidatedSettings: InstituteSettings = {
      ...nextSettings,
      logoBase64: nextSettings.primaryLogoBase64 || nextSettings.logoBase64
    };
    setFormData(consolidatedSettings);
    onUpdateSettings(consolidatedSettings, false);
    if (typeof window !== 'undefined' && (window as any).syncManager?.commitMutation) {
      (window as any).syncManager.commitMutation('settings', {
        address: consolidatedSettings.campusAddress,
        primaryAddress: consolidatedSettings.primaryAddress,
        branches: consolidatedSettings.branches
      });
    }
    setSyncStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'synced');
    if (noticeMsg) {
      setAddressSavedBanner(noticeMsg);
      window.setTimeout(() => setAddressSavedBanner(null), 3500);
    }
  };

  const scheduleAutoSave = (nextSettings: InstituteSettings) => {
    isTypingRef.current = true;
    setSyncStatus('pending');
    debouncedTrigger(nextSettings);
  };

  // Generic field updater with automatic local + online settings persistence
  const updateField = <K extends keyof InstituteSettings>(key: K, value: InstituteSettings[K]) => {
    setFormData(prev => {
      const next = {
        ...prev,
        [key]: value
      };
      scheduleAutoSave(next);
      return next;
    });
  };

  // Primary Manual Address Field Updater (Option A)
  const updatePrimaryAddressField = <K extends keyof PrimaryAddressConfig>(
    key: K,
    value: PrimaryAddressConfig[K]
  ) => {
    setFormData(prev => {
      const currentPa = prev.primaryAddress || buildInitialPrimaryAddress(prev);
      const nextPa: PrimaryAddressConfig = {
        ...currentPa,
        [key]: value
      };
      const formatted = formatComposedAddress(nextPa);
      nextPa.fullFormattedAddress = formatted;

      const next: InstituteSettings = {
        ...prev,
        primaryAddress: nextPa,
        campusAddress: formatted,
        landmark: nextPa.landmark,
        city: nextPa.city,
        district: nextPa.district,
        state: nextPa.state,
        pincode: nextPa.pincode,
        phone: nextPa.phone || prev.phone,
        whatsappSupport: nextPa.whatsapp || prev.whatsappSupport,
        googleMapsUrl: nextPa.googleMapsUrl
      };
      scheduleAutoSave(next);
      return next;
    });
  };

  // Option A: Save Manual Address Button Handler
  const handleSaveManualAddress = () => {
    const currentPa = formData.primaryAddress || buildInitialPrimaryAddress(formData);
    const formatted = formatComposedAddress(currentPa);
    const updatedPa: PrimaryAddressConfig = {
      ...currentPa,
      fullFormattedAddress: formatted
    };
    const nextSettings: InstituteSettings = {
      ...formData,
      primaryAddress: updatedPa,
      campusAddress: formatted,
      landmark: updatedPa.landmark,
      city: updatedPa.city,
      district: updatedPa.district,
      state: updatedPa.state,
      pincode: updatedPa.pincode,
      phone: updatedPa.phone || formData.phone,
      whatsappSupport: updatedPa.whatsapp || formData.whatsappSupport,
      googleMapsUrl: updatedPa.googleMapsUrl
    };
    commitSettingsImmediately(
      nextSettings,
      '✓ Primary institute address saved & propagated across Header, Receipts & Certificates!'
    );
  };

  // Option B: Multi-Branch CRUD Handlers
  const handleOpenAddBranch = () => {
    setEditingBranchId(null);
    setBranchForm({
      branchName: '',
      fullAddress: '',
      landmark: '',
      city: formData.city || '',
      pincode: formData.pincode || '',
      phone: formData.phone || '',
      whatsapp: formData.whatsappSupport || formData.phone || '',
      googleMapsUrl: '',
      isDefault: (formData.branches || []).length === 0
    });
    setBranchEditorOpen(true);
  };

  const handleOpenEditBranch = (b: CampusBranch) => {
    setEditingBranchId(b.id);
    setBranchForm({
      branchName: b.branchName || b.name || '',
      fullAddress: b.fullAddress || b.address || '',
      landmark: b.landmark || '',
      city: b.city || '',
      pincode: b.pincode || '',
      phone: b.phone || '',
      whatsapp: b.whatsapp || b.phone || '',
      googleMapsUrl: b.googleMapsUrl || '',
      isDefault: Boolean(b.isDefault ?? b.isPrimary)
    });
    setBranchEditorOpen(true);
  };

  const handleSaveBranchForm = () => {
    const cleanName = branchForm.branchName.trim();
    const cleanAddr = branchForm.fullAddress.trim();
    if (!cleanName || !cleanAddr) {
      setAddressSavedBanner('⚠️ Please enter both Branch Name and Street/Full Address.');
      window.setTimeout(() => setAddressSavedBanner(null), 3500);
      return;
    }

    const composedBranchAddr = [
      cleanAddr,
      branchForm.landmark.trim() ? `Landmark: ${branchForm.landmark.trim()}` : '',
      branchForm.city.trim(),
      branchForm.pincode.trim()
    ]
      .filter(Boolean)
      .join(', ')
      .replace(/, (\d{6})$/, ' - $1');

    const currentBranches = [...(formData.branches || [])];
    const shouldBeDefault = branchForm.isDefault || currentBranches.length === 0;

    let nextBranches: CampusBranch[];
    if (editingBranchId) {
      nextBranches = currentBranches.map(b => {
        if (b.id === editingBranchId) {
          return {
            ...b,
            name: cleanName,
            branchName: cleanName,
            address: composedBranchAddr,
            fullAddress: cleanAddr,
            landmark: branchForm.landmark.trim(),
            city: branchForm.city.trim(),
            pincode: branchForm.pincode.trim(),
            phone: branchForm.phone.trim(),
            whatsapp: branchForm.whatsapp.trim(),
            googleMapsUrl: branchForm.googleMapsUrl.trim(),
            isPrimary: shouldBeDefault,
            isDefault: shouldBeDefault
          };
        }
        return shouldBeDefault ? { ...b, isPrimary: false, isDefault: false } : b;
      });
    } else {
      const newBranch: CampusBranch = {
        id: `BR-CUST-${Date.now()}`,
        name: cleanName,
        branchName: cleanName,
        address: composedBranchAddr,
        fullAddress: cleanAddr,
        landmark: branchForm.landmark.trim(),
        city: branchForm.city.trim(),
        pincode: branchForm.pincode.trim(),
        phone: branchForm.phone.trim(),
        whatsapp: branchForm.whatsapp.trim(),
        googleMapsUrl: branchForm.googleMapsUrl.trim(),
        isPrimary: shouldBeDefault,
        isDefault: shouldBeDefault
      };
      nextBranches = shouldBeDefault
        ? [...currentBranches.map(b => ({ ...b, isPrimary: false, isDefault: false })), newBranch]
        : [...currentBranches, newBranch];
    }

    const defaultBr = nextBranches.find(b => b.isDefault || b.isPrimary);
    const nextSettings: InstituteSettings = {
      ...formData,
      branches: nextBranches,
      campusAddress: defaultBr ? defaultBr.address : formData.campusAddress,
      phone: defaultBr?.phone || formData.phone
    };

    commitSettingsImmediately(
      nextSettings,
      editingBranchId
        ? `✓ Updated branch "${cleanName}" and synced across the application!`
        : `✓ Added branch "${cleanName}" to Multi-Branch Manager!`
    );
    setBranchEditorOpen(false);
    setEditingBranchId(null);
  };

  const handleSetDefaultBranch = (branchId: string) => {
    const nextBranches = (formData.branches || []).map(b => ({
      ...b,
      isPrimary: b.id === branchId,
      isDefault: b.id === branchId
    }));
    const selected = nextBranches.find(b => b.id === branchId);
    const nextSettings: InstituteSettings = {
      ...formData,
      branches: nextBranches,
      selectedBranchId: branchId,
      campusAddress: selected ? selected.address : formData.campusAddress,
      phone: selected?.phone || formData.phone
    };
    commitSettingsImmediately(
      nextSettings,
      `✓ Set "${selected?.branchName || selected?.name}" as Primary / Default Branch!`
    );
  };

  const handleConfirmDeleteBranch = (branchId: string) => {
    const target = (formData.branches || []).find(b => b.id === branchId);
    const remaining = (formData.branches || []).filter(b => b.id !== branchId);
    if (remaining.length > 0 && !remaining.some(b => b.isDefault || b.isPrimary)) {
      remaining[0] = { ...remaining[0], isPrimary: true, isDefault: true };
    }
    const newDefault = remaining.find(b => b.isDefault || b.isPrimary);
    const nextSettings: InstituteSettings = {
      ...formData,
      branches: remaining,
      campusAddress: newDefault
        ? newDefault.address
        : formData.primaryAddress?.fullFormattedAddress || ''
    };
    setDeletingBranchId(null);
    commitSettingsImmediately(
      nextSettings,
      `✓ Deleted branch "${target?.branchName || target?.name || branchId}".`
    );
  };

  // Convert uploaded image to compressed Base64
  const processImageUpload = (file: File, callback: (base64: string) => void) => {
    if (!file.type.startsWith('image/')) {
      setUploadFeedback('⚠️ Please upload a valid image file (PNG, JPG, SVG, or WEBP).');
      setTimeout(() => setUploadFeedback(null), 3500);
      return;
    }

    const fileSizeMb = file.size / (1024 * 1024);
    if (fileSizeMb > 3) {
      setUploadFeedback('⚠️ Image file size exceeds 3MB. Please select an optimized image under 2MB.');
      setTimeout(() => setUploadFeedback(null), 3500);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      callback(result);
      setUploadFeedback(`✓ Image uploaded & auto-saved (${Math.round(file.size / 1024)} KB)`);
      setTimeout(() => setUploadFeedback(null), 3000);
    };
    reader.readAsDataURL(file);
  };

  // Save All Settings with animated transitions and instantaneous global sync
  const handleSaveAll = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    cancelDebouncedSync();
    isTypingRef.current = false;
    setSaveStatus('saving');

    setTimeout(() => {
      // Sync legacy logoBase64 field to maintain backward compatibility
      const consolidatedSettings: InstituteSettings = {
        ...formData,
        logoBase64: formData.primaryLogoBase64 || formData.logoBase64
      };

      // Broadcast update to parent App component
      onUpdateSettings(consolidatedSettings, false);

      setSaveStatus('saved');
      setTimeout(() => {
        setSaveStatus('idle');
      }, 3500);
    }, 300);
  };

  const totalLecturesCount = state.courses.reduce((sum, c) => sum + (c.lectures?.length || 0), 0);
  const totalFeeEntriesCount = state.students.reduce((sum, s) => sum + (s.milestones?.length || 0), 0);

  return (
    <div className="space-y-6 pb-12">
      {/* Executive Control Header */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span>Settings & Institution Profile</span>
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase tracking-wide">
              Unified DB v3.0.0
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-black border flex items-center gap-1.5 transition-colors duration-300">
              {syncStatus === 'synced' && (
                <span className="inline-flex items-center gap-1.5 text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded-full">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  All changes saved
                </span>
              )}
              {syncStatus === 'pending' && (
                <span className="inline-flex items-center gap-1.5 text-amber-700 bg-amber-50 px-1 py-0.5 rounded-full">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  Typing...
                </span>
              )}
              {syncStatus === 'saving' && (
                <span className="inline-flex items-center gap-1.5 text-blue-700 bg-blue-50 px-1 py-0.5 rounded-full">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
                  Saving silently...
                </span>
              )}
              {syncStatus === 'offline' && (
                <span className="inline-flex items-center gap-1.5 text-slate-700 bg-slate-100 px-1 py-0.5 rounded-full">
                  <span className="w-2 h-2 rounded-full bg-slate-500" />
                  Saved offline
                </span>
              )}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1.5 max-w-2xl">
            Every change made in Settings or across Students, Courses, Lectures, and Fees is automatically saved locally (`localStorage` + `IndexedDB`) and mirrored online to Cloud Server & Firebase every 2 minutes.
          </p>
        </div>

        {/* Global Save Button & Quick Backup Actions */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => downloadBackupJson(state)}
            className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-black flex items-center gap-2 cursor-pointer transition-colors border border-slate-300"
            title="Download full database snapshot"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export JSON</span>
          </button>

          <button
            type="button"
            onClick={() => exportMasterExcelFile(state)}
            className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-black flex items-center gap-2 cursor-pointer transition-colors border border-slate-300"
            title="Export master students and fees Excel sheet"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Master Excel</span>
          </button>

          <button
            type="button"
            onClick={() => handleSaveAll()}
            disabled={saveStatus === 'saving'}
            className={`px-6 py-3 rounded-xl font-black text-xs flex items-center gap-2 cursor-pointer shadow-md transition-all duration-200 active:scale-95 ${
              saveStatus === 'saved'
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/30 ring-2 ring-emerald-400'
                : saveStatus === 'saving'
                ? 'bg-indigo-600 text-white opacity-90 cursor-wait'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-700/20 hover:shadow-lg'
            }`}
          >
            {saveStatus === 'saving' && (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Applying Changes...</span>
              </>
            )}
            {saveStatus === 'saved' && (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Settings Saved & Applied Successfully!</span>
              </>
            )}
            {saveStatus === 'autosaved' && (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>⚡ Auto-Saved Locally & Online!</span>
              </>
            )}
            {saveStatus === 'idle' && (
              <>
                <Save className="w-4 h-4" />
                <span>Save All Settings</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Upload Feedback Toast */}
      {uploadFeedback && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition-all">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{uploadFeedback}</span>
        </div>
      )}

      {/* Main Configuration Grid with Navigation Tabs */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Navigation Sidebar */}
        <div className="lg:col-span-3 space-y-2">
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs p-3 space-y-1.5">
            <div className="px-3 py-2 text-[11px] font-black uppercase tracking-wider text-slate-400">
              Configuration Suite
            </div>

            <button
              type="button"
              onClick={() => setActiveSection('identity-logos')}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-black text-left cursor-pointer transition-all ${
                activeSection === 'identity-logos'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Building2 className="w-4 h-4 shrink-0" />
              <div className="leading-tight">
                <div>Identity & Dual Logos</div>
                <div className={`text-[10px] font-medium ${activeSection === 'identity-logos' ? 'text-indigo-200' : 'text-slate-400'}`}>
                  Primary logo & certificate seal
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveSection('location-contact')}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-black text-left cursor-pointer transition-all ${
                activeSection === 'location-contact'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <MapPin className="w-4 h-4 shrink-0" />
              <div className="leading-tight">
                <div>Location & Branches</div>
                <div className={`text-[10px] font-medium ${activeSection === 'location-contact' ? 'text-indigo-200' : 'text-slate-400'}`}>
                  Campus address & Google Maps
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveSection('financial-invoicing')}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-black text-left cursor-pointer transition-all ${
                activeSection === 'financial-invoicing'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Receipt className="w-4 h-4 shrink-0" />
              <div className="leading-tight">
                <div>Invoicing & Banking</div>
                <div className={`text-[10px] font-medium ${activeSection === 'financial-invoicing' ? 'text-indigo-200' : 'text-slate-400'}`}>
                  Receipt prefix, policy & UPI QR
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveSection('academic-certificate')}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-black text-left cursor-pointer transition-all ${
                activeSection === 'academic-certificate'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Award className="w-4 h-4 shrink-0" />
              <div className="leading-tight">
                <div>Certificates & Signatures</div>
                <div className={`text-[10px] font-medium ${activeSection === 'academic-certificate' ? 'text-indigo-200' : 'text-slate-400'}`}>
                  A4 crest, authority text & stamp
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveSection('cloud-backup')}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-black text-left cursor-pointer transition-all ${
                activeSection === 'cloud-backup'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Cloud className="w-4 h-4 shrink-0" />
              <div className="leading-tight">
                <div>Cloud Sync & Storage</div>
                <div className={`text-[10px] font-medium ${activeSection === 'cloud-backup' ? 'text-indigo-200' : 'text-slate-400'}`}>
                  Firebase credentials & restore
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveSection('system-health')}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-black text-left cursor-pointer transition-all ${
                activeSection === 'system-health'
                  ? 'bg-slate-900 text-amber-300 border border-amber-400/40 shadow-sm'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <div className="leading-tight">
                <div>System Health &amp; Self-Repair</div>
                <div className={`text-[10px] font-medium ${activeSection === 'system-health' ? 'text-amber-200/80' : 'text-slate-400'}`}>
                  Auto-heal &amp; live integration audit
                </div>
              </div>
            </button>
          </div>

          {/* Quick Storage Monitor Card */}
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase text-slate-500 flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-indigo-600" />
                <span>Offline Storage</span>
              </span>
              <span className="font-mono text-xs font-black text-slate-800">
                {storageQuota.usedKb} KB
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                style={{ width: `${Math.max(2, storageQuota.usagePercent)}%` }}
                className={`h-full rounded-full transition-all ${
                  storageQuota.isLowStorage ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
              />
            </div>
            <p className="text-[10px] text-slate-500 leading-tight">
              Local IndexedDB & localStorage mirror active. Fast offline response on all tablets.
            </p>
          </div>
        </div>

        {/* Configuration Panel Content */}
        <div className="lg:col-span-9 space-y-6">
          {/* ========================================================================= */}
          {/* SECTION 1: IDENTITY & DUAL LOGO MANAGEMENT */}
          {/* ========================================================================= */}
          {activeSection === 'identity-logos' && (
            <div className="space-y-6">
              {/* Dual Logo Engine Panel */}
              <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs p-6 space-y-6">
                <div>
                  <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-indigo-600" />
                    <span>Dual-Logo Asset Routing Engine</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Manage two distinct institutional logos with automatic sizing standards: a compact logo for app navigation/invoices, and a large official crest for student certificates.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* LOGO A: Primary System Logo */}
                  <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-black text-slate-900 uppercase tracking-wide block">
                          A. Primary System Logo
                        </span>
                        <span className="text-[11px] text-slate-500">
                          App Header, Dashboard, & Invoices/Receipts
                        </span>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-800">
                        Header: 38-42px
                      </span>
                    </div>

                    {/* Live Preview Box with Placement Contexts */}
                    <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col items-center justify-center min-h-[140px] space-y-3">
                      {formData.primaryLogoBase64 ? (
                        <div className="flex flex-col items-center gap-2">
                          <img
                            src={formData.primaryLogoBase64}
                            alt="Primary System Logo"
                            className="max-h-[50px] max-w-[200px] object-contain"
                          />
                          <span className="text-[10px] font-mono text-slate-400">
                            Rendered at standard aspect ratio
                          </span>
                        </div>
                      ) : (
                        <div className="text-center py-4">
                          <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                          <span className="text-xs font-bold text-slate-400 block">
                            No primary logo uploaded
                          </span>
                          <span className="text-[10px] text-slate-400">
                            Default stylized monogram badge is currently used
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Sizing Specifications Notice */}
                    <div className="text-[11px] text-slate-600 space-y-1 bg-white/70 p-3 rounded-xl border border-slate-200/60">
                      <div className="font-bold text-slate-800">Standard Market Placements:</div>
                      <ul className="list-disc list-inside text-[10px] text-slate-500 space-y-0.5">
                        <li><strong>Top Navigation:</strong> Boxed at height 38px–42px (auto width)</li>
                        <li><strong>Fee Receipts:</strong> Letterhead corner (max 55px height)</li>
                        <li><strong>Profile Card:</strong> 48px × 48px rounded thumbnail</li>
                      </ul>
                    </div>

                    {/* Upload / Remove Actions */}
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="file"
                        ref={primaryLogoInputRef}
                        accept="image/png,image/jpeg,image/svg+xml,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            processImageUpload(file, (b64) => updateField('primaryLogoBase64', b64));
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => primaryLogoInputRef.current?.click()}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-xs"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload Primary Logo</span>
                      </button>

                      {formData.primaryLogoBase64 && (
                        <button
                          type="button"
                          onClick={() => updateField('primaryLogoBase64', '')}
                          className="px-3.5 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-black flex items-center gap-1.5 cursor-pointer transition-colors border border-rose-200"
                          title="Remove Primary Logo"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* LOGO B: Dedicated Certificate Crest / Official Seal */}
                  <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-black text-slate-900 uppercase tracking-wide block">
                          B. Certificate Crest & Official Seal
                        </span>
                        <span className="text-[11px] text-slate-500">
                          A4 PDF Certificates & Formal Accreditations
                        </span>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900">
                        Print: 95-110px
                      </span>
                    </div>

                    {/* Live Preview Box */}
                    <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col items-center justify-center min-h-[140px] space-y-3">
                      {formData.certificateLogoBase64 ? (
                        <div className="flex flex-col items-center gap-2">
                          <img
                            src={formData.certificateLogoBase64}
                            alt="Certificate Crest"
                            className="max-h-[90px] max-w-[200px] object-contain"
                          />
                          <span className="text-[10px] font-mono text-emerald-700 font-bold">
                            ✓ Dedicated Official Seal Active
                          </span>
                        </div>
                      ) : formData.primaryLogoBase64 ? (
                        <div className="flex flex-col items-center gap-2 opacity-75">
                          <img
                            src={formData.primaryLogoBase64}
                            alt="Primary Fallback"
                            className="max-h-[75px] max-w-[180px] object-contain"
                          />
                          <span className="text-[10px] text-amber-700 font-bold">
                            Falling back to Primary System Logo (scaled)
                          </span>
                        </div>
                      ) : (
                        <div className="text-center py-4">
                          <Award className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                          <span className="text-xs font-bold text-slate-400 block">
                            No certificate crest uploaded
                          </span>
                          <span className="text-[10px] text-slate-400">
                            Upload a dedicated high-res emblem or crest
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Sizing Specifications Notice */}
                    <div className="text-[11px] text-slate-600 space-y-1 bg-white/70 p-3 rounded-xl border border-slate-200/60">
                      <div className="font-bold text-slate-800">Certificate Print Standard:</div>
                      <ul className="list-disc list-inside text-[10px] text-slate-500 space-y-0.5">
                        <li><strong>A4 Print Crest:</strong> Rendered large at 95px–110px height</li>
                        <li><strong>Fallback:</strong> Automatically uses Primary Logo if no crest uploaded</li>
                        <li><strong>Recommended:</strong> High-resolution PNG or SVG with transparent background</li>
                      </ul>
                    </div>

                    {/* Upload / Remove Actions */}
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="file"
                        ref={certLogoInputRef}
                        accept="image/png,image/jpeg,image/svg+xml,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            processImageUpload(file, (b64) => updateField('certificateLogoBase64', b64));
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => certLogoInputRef.current?.click()}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-xs"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload Certificate Crest</span>
                      </button>

                      {formData.certificateLogoBase64 && (
                        <button
                          type="button"
                          onClick={() => updateField('certificateLogoBase64', '')}
                          className="px-3.5 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-black flex items-center gap-1.5 cursor-pointer transition-colors border border-rose-200"
                          title="Remove Certificate Crest"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Section A: Institutional Identity & Legal Profile */}
              <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs p-6 space-y-5">
                <div className="border-b border-slate-100 pb-4">
                  <h2 className="text-base font-black text-slate-900">
                    Section A: Institutional Identity & Legal Registration
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Official trading academy naming, registration identifiers, and institutional sign-off.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Full Legal Name */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-black text-slate-800 uppercase tracking-wide">
                      Institute Full Legal Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.instituteName}
                      onChange={(e) => updateField('instituteName', e.target.value)}
                      placeholder="e.g. Srujaan Share Market Institute"
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    />
                    <span className="text-[10px] text-slate-500 block">
                      Appears on official letterheads, fee receipts, and certificate headers.
                    </span>
                  </div>

                  {/* Short Name / Acronym */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-black text-slate-800 uppercase tracking-wide">
                      Short Name / Acronym <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.shortName || ''}
                      onChange={(e) => updateField('shortName', e.target.value)}
                      placeholder="e.g. SSMI Pune"
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    />
                    <span className="text-[10px] text-slate-500 block">
                      Used in mobile top bar, SMS/WhatsApp prefixes, and compact badge tags.
                    </span>
                  </div>

                  {/* Govt Reg / MSME / ISO / GSTIN */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-black text-slate-800 uppercase tracking-wide">
                      Govt Reg / MSME / ISO Registration Number
                    </label>
                    <input
                      type="text"
                      value={formData.regNumber || ''}
                      onChange={(e) => updateField('regNumber', e.target.value)}
                      placeholder="e.g. MH-PUN-MSME-2024-88910"
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    />
                    <span className="text-[10px] text-slate-500 block">
                      Official registration reference stamped onto A4 completion certificates.
                    </span>
                  </div>

                  {/* GSTIN */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-black text-slate-800 uppercase tracking-wide">
                      GSTIN / Tax Identification
                    </label>
                    <input
                      type="text"
                      value={formData.gstin}
                      onChange={(e) => updateField('gstin', e.target.value)}
                      placeholder="e.g. 27AAACS1234F1Z5"
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    />
                    <span className="text-[10px] text-slate-500 block">
                      Printed on student fee receipts and tax statements.
                    </span>
                  </div>

                  {/* Institutional Tagline */}
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="block text-xs font-black text-slate-800 uppercase tracking-wide">
                      Institute Mission Tagline
                    </label>
                    <input
                      type="text"
                      value={formData.tagline || ''}
                      onChange={(e) => updateField('tagline', e.target.value)}
                      placeholder="e.g. Leading Technical Analysis & Institutional Trading Academy"
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    />
                    <span className="text-[10px] text-slate-500 block">
                      Secondary slogan rendered beneath the academy title on documents.
                    </span>
                  </div>
                </div>

                {/* Save Quick Action */}
                <div className="pt-4 border-t border-slate-100 flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleSaveAll()}
                    className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-2 cursor-pointer shadow-sm transition-colors"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Identity & Logos</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SECTION 2: CAMPUS & BRANCH ADDRESS CONFIGURATION (OPTION A + OPTION B)    */}
          {/* ========================================================================= */}
          {activeSection === 'location-contact' && (() => {
            const activeResolved = getActiveInstituteAddress(formData);
            const pa = formData.primaryAddress || buildInitialPrimaryAddress(formData);
            const customBranches = formData.branches || [];

            return (
              <div className="space-y-6">
                {/* Status Banner / Empty State Alert */}
                {addressSavedBanner && (
                  <div className="bg-emerald-50 border border-emerald-300 text-emerald-950 px-4 py-3 rounded-xl text-xs font-extrabold flex items-center gap-2 shadow-2xs animate-in fade-in">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{addressSavedBanner}</span>
                  </div>
                )}

                {!activeResolved.isConfigured ? (
                  <div className="bg-amber-50 border-2 border-dashed border-amber-300 rounded-2xl p-5 flex items-start gap-3.5 text-amber-950">
                    <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-black uppercase tracking-wide text-amber-900">
                        No address entered. Please add your institute/branch address below.
                      </div>
                      <p className="text-[11px] text-amber-800 mt-1 leading-relaxed">
                        All hardcoded demo presets have been removed. Enter your primary campus address in <strong>Option A</strong> below or add multiple locations in <strong>Option B (Multi-Branch Manager)</strong>. Your custom address will immediately appear on the Header, Fee Receipts, and Certificates.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-xl bg-emerald-600 text-white shrink-0">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                            Active System-Wide Address
                          </span>
                          {activeResolved.branchName && (
                            <span className="text-xs font-black text-slate-900">
                              {activeResolved.branchName}
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-bold text-slate-800 mt-1">
                          {activeResolved.fullAddress}
                        </p>
                        {activeResolved.phone && (
                          <p className="text-[11px] font-mono text-slate-600 mt-0.5">
                            📞 Contact: {activeResolved.phone}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* OPTION A: PRIMARY / SINGLE MANUAL ADDRESS INPUT (DEFAULT MODE) */}
                <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs p-6 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-indigo-100 text-indigo-800">
                          Option A • Default Mode
                        </span>
                        <h2 className="text-base font-black text-slate-900 flex items-center gap-1.5">
                          <MapPin className="w-4 h-4 text-indigo-600" />
                          <span>Primary / Single Manual Address Input</span>
                        </h2>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Manually enter your main campus or branch address. Saved directly into <code className="font-mono text-[11px] bg-slate-100 px-1.5 py-0.5 rounded">instituteDB.settings.primaryAddress</code> and <code className="font-mono text-[11px] bg-slate-100 px-1.5 py-0.5 rounded">localStorage</code>.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleSaveManualAddress}
                      className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black flex items-center gap-2 cursor-pointer shadow-xs transition-all active:scale-95"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Save Address</span>
                    </button>
                  </div>

                  {/* Branch / Center Name & Landmark */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-black text-slate-800 uppercase tracking-wide">
                        Branch / Center Name
                      </label>
                      <input
                        type="text"
                        value={pa.branchName}
                        onChange={(e) => updatePrimaryAddressField('branchName', e.target.value)}
                        placeholder="e.g., Main Campus or Sane Chowk Branch"
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                      />
                      <span className="text-[10px] text-slate-500 block">
                        Optional title for your main campus or head office.
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-black text-slate-800 uppercase tracking-wide">
                        Landmark / Area
                      </label>
                      <input
                        type="text"
                        value={pa.landmark}
                        onChange={(e) => updatePrimaryAddressField('landmark', e.target.value)}
                        placeholder="e.g., Near Sane Chowk / Opposite City Bank"
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                      />
                      <span className="text-[10px] text-slate-500 block">
                        Helps students locate the classroom easily.
                      </span>
                    </div>
                  </div>

                  {/* Street Address / Building Details (Multiline Textarea) */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-black text-slate-800 uppercase tracking-wide">
                      Street Address / Building Details <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      rows={2}
                      value={pa.streetAddress}
                      onChange={(e) => updatePrimaryAddressField('streetAddress', e.target.value)}
                      placeholder="Enter your building name, floor/office number, and street address..."
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white resize-y"
                    />
                    <span className="text-[10px] text-slate-500 block">
                      Printed on the letterhead of A4 fee receipts, admission forms, and certificate footers.
                    </span>
                  </div>

                  {/* City, District, State, PIN Code Structured Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-black text-slate-800 uppercase tracking-wide">
                        City
                      </label>
                      <input
                        type="text"
                        value={pa.city}
                        onChange={(e) => updatePrimaryAddressField('city', e.target.value)}
                        placeholder="Enter City"
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-black text-slate-800 uppercase tracking-wide">
                        District
                      </label>
                      <input
                        type="text"
                        value={pa.district}
                        onChange={(e) => updatePrimaryAddressField('district', e.target.value)}
                        placeholder="Enter District"
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-black text-slate-800 uppercase tracking-wide">
                        State
                      </label>
                      <input
                        type="text"
                        value={pa.state}
                        onChange={(e) => updatePrimaryAddressField('state', e.target.value)}
                        placeholder="Enter State"
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-black text-slate-800 uppercase tracking-wide">
                        PIN Code
                      </label>
                      <input
                        type="text"
                        value={pa.pincode}
                        onChange={(e) => updatePrimaryAddressField('pincode', e.target.value)}
                        placeholder="6-digit PIN"
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                      />
                    </div>
                  </div>

                  {/* Branch Contact / WhatsApp Hotline, Email & Website */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-black text-slate-800 uppercase tracking-wide">
                        Branch Contact / Inquiry Phone <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={pa.phone || formData.phone}
                        onChange={(e) => {
                          updatePrimaryAddressField('phone', e.target.value);
                          updateField('phone', e.target.value);
                        }}
                        placeholder="Enter contact number"
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-black text-slate-800 uppercase tracking-wide">
                        WhatsApp Hotline Number
                      </label>
                      <input
                        type="text"
                        value={pa.whatsapp || formData.whatsappSupport || ''}
                        onChange={(e) => {
                          updatePrimaryAddressField('whatsapp', e.target.value);
                          updateField('whatsappSupport', e.target.value);
                        }}
                        placeholder="Enter WhatsApp number"
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-mono font-bold text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-black text-slate-800 uppercase tracking-wide">
                        Official Email Address
                      </label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => updateField('email', e.target.value)}
                        placeholder="e.g. admissions@yourdomain.com"
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-black text-slate-800 uppercase tracking-wide">
                        Official Website URL
                      </label>
                      <input
                        type="url"
                        value={formData.website || ''}
                        onChange={(e) => updateField('website', e.target.value)}
                        placeholder="https://"
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                      />
                    </div>
                  </div>

                  {/* Google Maps / Location URL */}
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2">
                    <label className="block text-xs font-black text-slate-800 uppercase tracking-wide">
                      Google Maps / Location URL
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="url"
                        value={pa.googleMapsUrl || formData.googleMapsUrl || ''}
                        onChange={(e) => {
                          updatePrimaryAddressField('googleMapsUrl', e.target.value);
                          updateField('googleMapsUrl', e.target.value);
                        }}
                        placeholder="Paste Google Maps share link for your campus..."
                        className="flex-1 px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      {(pa.googleMapsUrl || formData.googleMapsUrl) && (
                        <a
                          href={pa.googleMapsUrl || formData.googleMapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-4 py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-black flex items-center gap-1.5 border border-indigo-200 transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Test Map Link</span>
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between flex-wrap gap-3">
                    <span className="text-[11px] text-slate-500">
                      Composed Preview: <strong className="text-slate-800">{formatComposedAddress(pa) || 'No manual address entered yet'}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={handleSaveManualAddress}
                      className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-2 cursor-pointer shadow-sm transition-colors"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Save Address</span>
                    </button>
                  </div>
                </div>

                {/* OPTION B: EDITABLE MULTI-BRANCH MANAGER */}
                <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs p-6 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800">
                          Option B • Multi-Branch Manager
                        </span>
                        <h2 className="text-base font-black text-slate-900">
                          Editable Multi-Branch Directory ({customBranches.length})
                        </h2>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Manage multiple custom institute branches. Select any branch as <strong>Primary / Default</strong> or switch branches dynamically when printing Fee Receipts.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleOpenAddBranch}
                      className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-xs transition-all active:scale-95"
                    >
                      <Plus className="w-4 h-4" />
                      <span>➕ Add New Branch</span>
                    </button>
                  </div>

                  {/* Inline Add / Edit Branch Form */}
                  {branchEditorOpen && (
                    <div className="p-5 rounded-2xl bg-indigo-50/60 border-2 border-indigo-200 space-y-4 animate-in fade-in">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-black uppercase tracking-wider text-indigo-950">
                          {editingBranchId ? '✏️ Edit Branch Details' : '➕ Add New Custom Branch'}
                        </h3>
                        <button
                          type="button"
                          onClick={() => {
                            setBranchEditorOpen(false);
                            setEditingBranchId(null);
                          }}
                          className="text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
                        >
                          Cancel ✕
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="block text-[11px] font-black text-slate-800 uppercase">
                            Branch / Center Name <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={branchForm.branchName}
                            onChange={(e) => setBranchForm(prev => ({ ...prev, branchName: e.target.value }))}
                            placeholder="e.g., Sane Chowk Branch / Main Campus"
                            className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="block text-[11px] font-black text-slate-800 uppercase">
                            Branch Contact / Phone Number <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={branchForm.phone}
                            onChange={(e) => setBranchForm(prev => ({ ...prev, phone: e.target.value }))}
                            placeholder="e.g., +91 98230 55667"
                            className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>

                        <div className="space-y-1 md:col-span-2">
                          <label className="block text-[11px] font-black text-slate-800 uppercase">
                            Full Street & Building Address <span className="text-rose-500">*</span>
                          </label>
                          <textarea
                            rows={2}
                            value={branchForm.fullAddress}
                            onChange={(e) => setBranchForm(prev => ({ ...prev, fullAddress: e.target.value }))}
                            placeholder="Enter complete building, floor, street, area, city, and PIN code..."
                            className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="block text-[11px] font-black text-slate-800 uppercase">
                            Landmark / Area (Optional)
                          </label>
                          <input
                            type="text"
                            value={branchForm.landmark}
                            onChange={(e) => setBranchForm(prev => ({ ...prev, landmark: e.target.value }))}
                            placeholder="e.g., Near Metro Station"
                            className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-900"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="block text-[11px] font-black text-slate-800 uppercase">
                              City
                            </label>
                            <input
                              type="text"
                              value={branchForm.city}
                              onChange={(e) => setBranchForm(prev => ({ ...prev, city: e.target.value }))}
                              placeholder="City"
                              className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-900"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="block text-[11px] font-black text-slate-800 uppercase">
                              PIN Code
                            </label>
                            <input
                              type="text"
                              value={branchForm.pincode}
                              onChange={(e) => setBranchForm(prev => ({ ...prev, pincode: e.target.value }))}
                              placeholder="PIN"
                              className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-xs font-mono font-bold text-slate-900"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-indigo-200/70">
                        <label className="inline-flex items-center gap-2 text-xs font-black text-indigo-950 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={branchForm.isDefault}
                            onChange={(e) => setBranchForm(prev => ({ ...prev, isDefault: e.target.checked }))}
                            className="w-4 h-4 rounded text-indigo-600"
                          />
                          <span>Set as Primary / Default Branch across the system</span>
                        </label>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setBranchEditorOpen(false);
                              setEditingBranchId(null);
                            }}
                            className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 text-xs font-bold cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleSaveBranchForm}
                            className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-xs"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>{editingBranchId ? 'Update Branch' : 'Save New Branch'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Branch Cards List */}
                  {customBranches.length === 0 ? (
                    <div className="p-8 rounded-2xl bg-slate-50 border border-dashed border-slate-300 text-center space-y-2">
                      <Building2 className="w-8 h-8 text-slate-400 mx-auto" />
                      <div className="text-xs font-black text-slate-700">
                        No custom branches configured yet
                      </div>
                      <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                        If your institute operates multiple branches or classrooms, click <strong>"➕ Add New Branch"</strong> above to add them. Otherwise, your <strong>Option A Primary Address</strong> is used everywhere.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {customBranches.map((b) => {
                        const isDef = Boolean(b.isDefault ?? b.isPrimary);
                        const isConfirmingDelete = deletingBranchId === b.id;

                        return (
                          <div
                            key={b.id}
                            className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
                              isDef
                                ? 'bg-emerald-50/50 border-emerald-400 shadow-xs'
                                : 'bg-slate-50 border-slate-200/90 hover:border-slate-300'
                            }`}
                          >
                            <div className="space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <strong className="text-xs font-black text-slate-900 block">
                                    {b.branchName || b.name}
                                  </strong>
                                  <span className="text-[10px] font-mono text-slate-500">
                                    📞 {b.phone || 'No phone specified'}
                                  </span>
                                </div>
                                {isDef && (
                                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-600 text-white uppercase tracking-wider shrink-0">
                                    ★ Primary / Default
                                  </span>
                                )}
                              </div>

                              <p className="text-xs text-slate-700 font-medium leading-relaxed">
                                {b.address || b.fullAddress}
                              </p>
                            </div>

                            <div className="pt-3 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
                              {/* Radio Toggle: Set as Primary / Default */}
                              <label className="inline-flex items-center gap-2 text-[11px] font-extrabold text-slate-800 cursor-pointer">
                                <input
                                  type="radio"
                                  name="defaultBranchRadio"
                                  checked={isDef}
                                  onChange={() => handleSetDefaultBranch(b.id)}
                                  className="w-3.5 h-3.5 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                />
                                <span>{isDef ? 'Default Active' : 'Set as Primary / Default'}</span>
                              </label>

                              {/* Edit & Delete Controls */}
                              {isConfirmingDelete ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-black text-rose-700">Delete?</span>
                                  <button
                                    type="button"
                                    onClick={() => handleConfirmDeleteBranch(b.id)}
                                    className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-black cursor-pointer"
                                  >
                                    Yes, Delete
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeletingBranchId(null)}
                                    className="px-2 py-1 rounded-lg bg-slate-200 text-slate-700 text-[10px] font-bold cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditBranch(b)}
                                    className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-indigo-50 text-indigo-700 border border-slate-200 hover:border-indigo-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                    <span>Edit Branch</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeletingBranchId(b.id)}
                                    className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-rose-50 text-rose-600 border border-slate-200 hover:border-rose-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    <span>Delete</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* ========================================================================= */}
          {/* SECTION 3: FINANCIAL, INVOICING & FEE COLLECTION DEFAULTS */}
          {/* ========================================================================= */}
          {activeSection === 'financial-invoicing' && (
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs p-6 space-y-6">
              <div className="border-b border-slate-100 pb-4">
                <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-indigo-600" />
                  <span>Section C: Financial, Invoicing & Fee Collection Defaults</span>
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Configure receipt numbering sequence, fee collection policies, bank NEFT/RTGS accounts, and instant UPI QR codes.
                </p>
              </div>

              {/* Receipt Prefix & Numbering */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-black text-slate-800 uppercase tracking-wide">
                    Default Currency Symbol <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.currencySymbol || '₹'}
                    onChange={(e) => updateField('currencySymbol', e.target.value)}
                    placeholder="₹"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                  <span className="text-[10px] text-slate-500 block">
                    e.g. ₹ (INR), $, etc.
                  </span>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-black text-slate-800 uppercase tracking-wide">
                    Receipt Number Prefix <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.receiptPrefix || ''}
                    onChange={(e) => updateField('receiptPrefix', e.target.value)}
                    placeholder="e.g. SSMI-REC-2026-"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                  <span className="text-[10px] text-slate-500 block">
                    Leading series for receipts.
                  </span>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-black text-slate-800 uppercase tracking-wide">
                    Auto-Increment Start Number
                  </label>
                  <input
                    type="number"
                    value={formData.receiptStartingNumber || 1001}
                    onChange={(e) => updateField('receiptStartingNumber', Number(e.target.value) || 1001)}
                    placeholder="1001"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                  <span className="text-[10px] text-slate-500 block">
                    Starting numeric sequence.
                  </span>
                </div>
              </div>

              {/* Invoice Terms & Conditions Multi-line */}
              <div className="space-y-1.5">
                <label className="block text-xs font-black text-slate-800 uppercase tracking-wide">
                  Fee Receipt Payment Policy & Terms (Printed on Bottom of Receipt)
                </label>
                <textarea
                  rows={4}
                  value={formData.receiptTerms || ''}
                  onChange={(e) => updateField('receiptTerms', e.target.value)}
                  placeholder="Enter institutional refund policy, batch validity rules, and disclaimer..."
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white resize-y font-mono"
                />
                <span className="text-[10px] text-slate-500 block">
                  Legal terms and non-refundable declarations printed on formal printed receipts.
                </span>
              </div>

              {/* Bank Details & UPI Configuration */}
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-5">
                <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
                  <div>
                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-wide">
                      Bank Transfer & UPI Collection Setup
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      These payment details are rendered directly on student fee invoices and payment slips.
                    </p>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800">
                    Live On Receipts
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-black text-slate-800 uppercase tracking-wide">
                      Bank Name
                    </label>
                    <input
                      type="text"
                      value={formData.bankName || ''}
                      onChange={(e) => updateField('bankName', e.target.value)}
                      placeholder="e.g. HDFC Bank Ltd"
                      className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-black text-slate-800 uppercase tracking-wide">
                      Account Beneficiary Name
                    </label>
                    <input
                      type="text"
                      value={formData.bankAccountName || ''}
                      onChange={(e) => updateField('bankAccountName', e.target.value)}
                      placeholder="e.g. Srujaan Share Market Institute"
                      className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-black text-slate-800 uppercase tracking-wide">
                      Account Number
                    </label>
                    <input
                      type="text"
                      value={formData.bankAccountNumber || ''}
                      onChange={(e) => updateField('bankAccountNumber', e.target.value)}
                      placeholder="e.g. 50200088992211"
                      className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-black text-slate-800 uppercase tracking-wide">
                      Bank IFSC Code
                    </label>
                    <input
                      type="text"
                      value={formData.bankIfsc || ''}
                      onChange={(e) => updateField('bankIfsc', e.target.value)}
                      placeholder="e.g. HDFC0001234"
                      className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* UPI ID & UPI QR Code Uploader */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2 border-t border-slate-200/80 items-start">
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-black text-slate-800 uppercase tracking-wide">
                        Official Institute UPI ID (VPA) <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.upiId}
                        onChange={(e) => updateField('upiId', e.target.value)}
                        placeholder="e.g. srujaan@hdfcbank"
                        className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-xs font-mono font-bold text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <span className="text-[10px] text-slate-500 block">
                        Used for direct student payments and QR code generation.
                      </span>
                    </div>

                    <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-1 text-[11px] text-slate-600">
                      <strong className="text-slate-900 block font-bold">UPI Payment Flow:</strong>
                      <p className="text-[10px] text-slate-500 leading-relaxed">
                        When a custom QR Code is uploaded, it is printed directly on fee receipts so students can scan and pay from Google Pay, PhonePe, or Paytm with zero friction.
                      </p>
                    </div>
                  </div>

                  {/* UPI QR Code Image Uploader */}
                  <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                        <QrCode className="w-4 h-4 text-emerald-600" />
                        <span>UPI Payment QR Code</span>
                      </span>
                      {formData.upiQrBase64 && (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          Active
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="w-24 h-24 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
                        {formData.upiQrBase64 ? (
                          <img
                            src={formData.upiQrBase64}
                            alt="UPI QR Code"
                            className="w-full h-full object-contain p-1"
                          />
                        ) : (
                          <QrCode className="w-8 h-8 text-slate-300" />
                        )}
                      </div>

                      <div className="space-y-2 flex-1">
                        <input
                          type="file"
                          ref={upiQrInputRef}
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              processImageUpload(file, (b64) => updateField('upiQrBase64', b64));
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => upiQrInputRef.current?.click()}
                          className="w-full px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-xs"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>Upload QR Code</span>
                        </button>

                        {formData.upiQrBase64 && (
                          <button
                            type="button"
                            onClick={() => updateField('upiQrBase64', '')}
                            className="w-full px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors border border-rose-200"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Remove QR Code</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Save Quick Action */}
              <div className="pt-4 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => handleSaveAll()}
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-2 cursor-pointer shadow-sm transition-colors"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Invoicing & Banking</span>
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SECTION 4: ACADEMIC & CERTIFICATE CONFIGURATION */}
          {/* ========================================================================= */}
          {activeSection === 'academic-certificate' && (
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs p-6 space-y-6">
              <div className="border-b border-slate-100 pb-4">
                <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <Award className="w-5 h-5 text-indigo-600" />
                  <span>Section D: Academic & Certificate Configuration</span>
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Customize the title, sign-off verbiage, signatory credentials, and digital stamp rendered on student completion certificates.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Certificate Heading */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-black text-slate-800 uppercase tracking-wide">
                    Default Course Certificate Heading <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.certificateHeading || ''}
                    onChange={(e) => updateField('certificateHeading', e.target.value)}
                    placeholder="e.g. Certificate of Course Completion"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                  <span className="text-[10px] text-slate-500 block">
                    Rendered in prominent ribbon at the top of printed certificates.
                  </span>
                </div>

                {/* Authorized Signatory Designation */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-black text-slate-800 uppercase tracking-wide">
                    Authorized Signatory Designation <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.signatoryDesignation}
                    onChange={(e) => updateField('signatoryDesignation', e.target.value)}
                    placeholder="e.g. Founder & Lead Educator, Srujaan Share Market Institute"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                  <span className="text-[10px] text-slate-500 block">
                    Title stamped beneath signature on all credentials.
                  </span>
                </div>

                {/* Director / Signatory Name */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-black text-slate-800 uppercase tracking-wide">
                    Director / Authorized Signatory Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.signatoryName}
                    onChange={(e) => updateField('signatoryName', e.target.value)}
                    placeholder="e.g. Prasad M Bhunje"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                  <span className="text-[10px] text-slate-500 block">
                    Person signing certificates and official admissions receipts.
                  </span>
                </div>

                {/* Digital Signature Uploader */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-black text-slate-800 uppercase tracking-wide flex items-center justify-between">
                    <span>Digital Signature Stamp</span>
                    {formData.signatureBase64 && (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        Signature Active
                      </span>
                    )}
                  </label>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-300 flex items-center justify-between gap-3">
                    <div className="h-10 max-w-[140px] flex items-center justify-center bg-white px-2 rounded-lg border border-slate-200 overflow-hidden">
                      {formData.signatureBase64 ? (
                        <img
                          src={formData.signatureBase64}
                          alt="Digital Signature"
                          className="max-h-8 max-w-full object-contain"
                        />
                      ) : (
                        <span className="text-[10px] text-slate-400 font-italic">No signature uploaded</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <input
                        type="file"
                        ref={signatureInputRef}
                        accept="image/png,image/jpeg,image/svg+xml,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            processImageUpload(file, (b64) => updateField('signatureBase64', b64));
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => signatureInputRef.current?.click()}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer transition-colors"
                      >
                        Upload Signature
                      </button>
                      {formData.signatureBase64 && (
                        <button
                          type="button"
                          onClick={() => updateField('signatureBase64', '')}
                          className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 cursor-pointer border border-rose-200"
                          title="Remove signature"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-500 block">
                    Auto-stamped onto receipts and completion certificates.
                  </span>
                </div>

                {/* Verification Authority Sign-off Text Multi-line */}
                <div className="space-y-1.5 md:col-span-2">
                  <label className="block text-xs font-black text-slate-800 uppercase tracking-wide">
                    Verification Authority Sign-Off Text <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={2}
                    value={formData.certificateAuthorityText || ''}
                    onChange={(e) => updateField('certificateAuthorityText', e.target.value)}
                    placeholder="e.g. has successfully completed all prescribed practical curriculum, technical trading assessments, and mentorship requirements for:"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white resize-y"
                  />
                  <span className="text-[10px] text-slate-500 block">
                    Introductory verification sentence printed directly above the course name on student credentials.
                  </span>
                </div>
              </div>

              {/* Save Quick Action */}
              <div className="pt-4 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => handleSaveAll()}
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-2 cursor-pointer shadow-sm transition-colors"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Academic & Certificate Settings</span>
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SECTION 5: CLOUD SYNC, STORAGE & BACKUPS */}
          {/* ========================================================================= */}
          {activeSection === 'cloud-backup' && (
            <div className="space-y-6">
              {/* Quick Banner to Executive System Health & Self-Repair */}
              <div className="bg-white border border-amber-300/70 rounded-2xl p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-slate-900 text-amber-300 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-black text-slate-900">
                      System Health &amp; Self-Repair Center
                    </div>
                    <div className="text-[11px] text-slate-600">
                      Inspect live status for Firebase Auth/Firestore, Local Cache, Google Sheets, and Gemini AI or run 1-click Auto-Heal.
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveSection('system-health')}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-indigo-950 text-amber-300 text-xs font-black cursor-pointer transition-all shrink-0"
                >
                  Open Self-Repair Panel →
                </button>
              </div>

              {/* Connected Account & One-Click Health Check + Unified Storage Diagnostics Bar */}
              <div className="bg-slate-900 text-white rounded-2xl p-5 border border-emerald-500/30 shadow-md space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-mono font-black border flex items-center gap-1.5 ${
                          diagReport.isRealFirebaseAuthActive
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : typeof navigator !== 'undefined' && !navigator.onLine
                            ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                            : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${
                            diagReport.isRealFirebaseAuthActive
                              ? 'bg-emerald-400 animate-pulse'
                              : typeof navigator !== 'undefined' && !navigator.onLine
                              ? 'bg-blue-400'
                              : 'bg-amber-400'
                          }`}
                        />
                        <span>
                          {typeof navigator !== 'undefined' && !navigator.onLine
                            ? 'Offline (Local Cache Active)'
                            : diagReport.isRealFirebaseAuthActive
                            ? `Firebase Connected (Synced) • ${diagReport.activeAuthEmail}`
                            : 'Pre-Connected Local Cache (Master Admin)'}
                        </span>
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        Project: {ACTIVE_FIREBASE_PROJECT_ID}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300">
                      Unified Storage Health &amp; Auto-Repair Engine: Keeps LocalStorage, IndexedDB, Firebase Firestore ({ACTIVE_FIREBASE_PROJECT_ID}), and Google Sheets ({PRIMARY_INSTITUTE_EMAIL}) synchronized when signed in online.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    {!diagReport.isRealFirebaseAuthActive && (typeof navigator === 'undefined' || navigator.onLine) && (
                      <button
                        type="button"
                        disabled={isSigningInSettings}
                        onClick={async () => {
                          setIsSigningInSettings(true);
                          setSettingsAuthError(null);
                          setSyncNowResult(null);
                          try {
                            const signedInUser = await signInWithGoogleAuth();
                            await testConnection();
                            setDiagReport(getSyncDiagnosticsReport());
                            setReconcileStatusMsg(
                              `✓ Signed in to Firebase as ${signedInUser.email}. Syncing student records...`
                            );
                            const strictRes = await pushAllStudentsStrictToFirestore(state.students, state);
                            setSyncNowResult(strictRes);
                            setDiagReport(getSyncDiagnosticsReport());
                            if (strictRes.ok) {
                              onToast?.(`Firebase Connected (Synced) — ${strictRes.syncedCount} students synced.`);
                            }
                          } catch (err: any) {
                            const formatted = formatFirebaseAuthError(err);
                            setSettingsAuthError(formatted);
                            setDiagReport(getSyncDiagnosticsReport());
                          } finally {
                            setIsSigningInSettings(false);
                          }
                        }}
                        className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-md transition-all"
                      >
                        <LogIn className="w-3.5 h-3.5" />
                        <span>{isSigningInSettings ? 'Signing in...' : 'Sign in with Google'}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={isSyncingStudentsNow}
                      onClick={async () => {
                        setIsSyncingStudentsNow(true);
                        setSyncNowResult(null);
                        setSettingsAuthError(null);
                        try {
                          const res = await pushAllStudentsStrictToFirestore(state.students, state);
                          setSyncNowResult(res);
                          setDiagReport(getSyncDiagnosticsReport());
                          if (res.ok) {
                            setReconcileStatusMsg(
                              `✓ Sync Now Complete: Pushed ${res.syncedCount} student records & master backup to Firestore (${res.timestamp}).`
                            );
                            onToast?.(`Synced ${res.syncedCount} student records to Firestore.`);
                          }
                        } finally {
                          setIsSyncingStudentsNow(false);
                        }
                      }}
                      className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-md transition-all"
                    >
                      <UploadCloud className={`w-3.5 h-3.5 ${isSyncingStudentsNow ? 'animate-pulse' : ''}`} />
                      <span>{isSyncingStudentsNow ? 'Syncing Students...' : 'Sync Now'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        setReconcileStatusMsg('Checking Firebase Firestore & Google Sheets Apps Script...');
                        const [fbOk, sheetsRes] = await Promise.all([
                          testConnection(),
                          sendCorsSafeAppsScriptRequest({
                            action: 'ping',
                            module: 'settings_health_check'
                          })
                        ]);
                        setDiagReport(getSyncDiagnosticsReport());
                        if (fbOk && sheetsRes.ok) {
                          setReconcileStatusMsg(`✓ Health Check Passed — Firebase Firestore: LIVE • Google Sheets: OK (HTTP ${sheetsRes.status})`);
                        } else {
                          setReconcileStatusMsg(
                            `⚠️ Health Check: Firebase Firestore=${fbOk ? 'LIVE' : 'NOT LOGGED IN / BLOCKED'} • Google Sheets=${sheetsRes.ok ? 'OK' : (sheetsRes.errorReason || 'UNREACHABLE')}`
                          );
                        }
                        setTimeout(() => setReconcileStatusMsg(null), 7000);
                      }}
                      className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30 text-xs font-black flex items-center gap-1.5 cursor-pointer transition-all"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Test Connection &amp; Health Check</span>
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        const res = await syncAllStoragesUnified(state);
                        setDiagReport(getSyncDiagnosticsReport());
                        setReconcileStatusMsg(res.ok ? `✓ ${res.message}` : `⚠️ ${res.message}`);
                        setTimeout(() => setReconcileStatusMsg(null), 6000);
                      }}
                      className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-md transition-all"
                    >
                      <Cloud className="w-3.5 h-3.5" />
                      <span>Sync All Storages Now</span>
                    </button>
                  </div>
                </div>

                {settingsAuthError && (
                  <div className="p-3.5 rounded-xl bg-rose-950/90 border border-rose-500/50 text-rose-100 text-xs space-y-2.5">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="font-black text-rose-200">
                          {settingsAuthError.code ? `Google Sign-In Failed (${settingsAuthError.code})` : 'Google Sign-In Failed'}
                        </div>
                        <div className="text-rose-100 break-words">{settingsAuthError.message}</div>
                      </div>
                    </div>
                    {settingsAuthError.isUnauthorizedDomain && settingsAuthError.hostname && (
                      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-950/90 border border-rose-700/60 rounded-lg p-2.5">
                        <div className="min-w-0">
                          <div className="text-[10px] font-bold uppercase text-rose-300">
                            Copy Hostname for Firebase Authorized Domains:
                          </div>
                          <code className="text-xs font-mono text-emerald-300 break-all">
                            {settingsAuthError.hostname}
                          </code>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(settingsAuthError.hostname).catch(() => {});
                            setCopiedSettingsHost(true);
                            setTimeout(() => setCopiedSettingsHost(false), 2000);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer shrink-0"
                        >
                          {copiedSettingsHost ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedSettingsHost ? 'Copied!' : 'Copy Hostname'}</span>
                        </button>
                      </div>
                    )}
                    {(settingsAuthError.isPopupBlocked || (typeof window !== 'undefined' && window.self !== window.top)) && !settingsAuthError.isAccessDenied && (
                      <a
                        href={typeof window !== 'undefined' ? window.location.href : '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 font-bold text-xs border border-sky-500/30"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Open App in New Full Browser Tab</span>
                      </a>
                    )}
                  </div>
                )}

                {syncNowResult && !syncNowResult.ok && (
                  <div className="p-3.5 rounded-xl bg-rose-950/90 border border-rose-500/60 text-rose-100 text-xs flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2 min-w-0">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <div className="space-y-1 min-w-0">
                        <div className="font-black text-rose-200">
                          Firestore Manual Sync Error {syncNowResult.errorCode ? `(${syncNowResult.errorCode})` : ''}
                        </div>
                        <div className="font-mono text-[11px] text-rose-100 break-words">
                          {syncNowResult.errorMessage}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSyncNowResult(null)}
                      className="text-[11px] font-bold text-rose-300 hover:text-white cursor-pointer shrink-0"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                {syncNowResult && syncNowResult.ok && (
                  <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 text-xs font-bold flex items-center justify-between gap-2">
                    <span>
                      ✓ Firestore Sync Now Succeeded: {syncNowResult.syncedCount} active student records pushed at {syncNowResult.timestamp}.
                    </span>
                    <button
                      type="button"
                      onClick={() => setSyncNowResult(null)}
                      className="text-[11px] text-emerald-300 hover:text-white cursor-pointer shrink-0"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                {reconcileStatusMsg && (
                  <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 text-xs font-bold">
                    {reconcileStatusMsg}
                  </div>
                )}

                {/* 4-Layer Storage Diagnostics Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-800 text-xs">
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-[10px] font-bold uppercase text-slate-400">(a) LocalStorage</div>
                    <div className="text-sm font-black text-white mt-0.5">{state.students.length} Students • {state.leads.length} Leads</div>
                    <div className="text-[10px] font-mono text-emerald-400 mt-0.5">Last Saved: {state.lastSavedAt || 'Not saved yet'}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-[10px] font-bold uppercase text-slate-400">(b) IndexedDB</div>
                    <div className="text-sm font-black text-white mt-0.5">{state.students.length} Records Cached</div>
                    <div className="text-[10px] font-mono text-emerald-400 mt-0.5">SrujaanIMS_IndexedDB_v5 Active</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-[10px] font-bold uppercase text-slate-400">(c) Google Sheets</div>
                    <div className="text-sm font-black text-emerald-300 mt-0.5 truncate">{PRIMARY_INSTITUTE_EMAIL}</div>
                    <div className="text-[10px] font-mono text-slate-400 mt-0.5">Last Sync: {state.lastCloudSyncAt || 'Not synced yet'}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-[10px] font-bold uppercase text-slate-400">(d) JSON Offline Backup</div>
                    <div className="text-sm font-black text-white mt-0.5">Portable Snapshot</div>
                    <div className="text-[10px] font-mono text-indigo-300 mt-0.5">{state.lastManualBackupAt || 'No backup downloaded yet'}</div>
                  </div>
                </div>
              </div>

              {/* Master Save & Master Fetch Command Bar */}
              <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl shadow-md p-6 space-y-5 border border-indigo-500/30">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                        Dual-Write Cloud Engine v3.0.0
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-200 border border-indigo-400/30 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>Auto-Sync Every {Math.round((formData.cloudConfig?.autoSyncIntervalMs || 120000) / 60000)} Min</span>
                      </span>
                    </div>
                    <h2 className="text-lg font-black mt-2 flex items-center gap-2">
                      <Cloud className="w-5 h-5 text-emerald-400" />
                      <span>Master Cloud & Firebase Command Center</span>
                    </h2>
                    <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                      Every student, staff member, course, lecture, study material, attendance mark, fee receipt, and setting is automatically saved to browser memory (`localStorage` + `IndexedDB` + `window.instituteDB`) and mirrored online. Use the master controls below to force an immediate cloud push or pull at any time.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => onPushCloudSync()}
                      disabled={isCloudSyncing}
                      className="px-5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-slate-950 font-black text-xs flex items-center gap-2 cursor-pointer shadow-lg transition-all active:scale-95"
                    >
                      {isCloudSyncing ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <UploadCloud className="w-4 h-4" />
                      )}
                      <span>☁️ Master Save to Cloud / Firebase</span>
                    </button>

                    {onMasterFetchFromCloud && (
                      <button
                        type="button"
                        onClick={() => onMasterFetchFromCloud()}
                        disabled={isCloudSyncing}
                        className="px-5 py-3 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-60 text-white border border-white/25 font-black text-xs flex items-center gap-2 cursor-pointer shadow-md transition-all active:scale-95"
                      >
                        <DownloadCloud className="w-4 h-4 text-sky-300" />
                        <span>📥 Master Fetch from Cloud / Firebase</span>
                      </button>
                    )}

                    {onForcePullFromCloud && (
                      <button
                        type="button"
                        onClick={() => onForcePullFromCloud()}
                        disabled={isCloudSyncing}
                        className="px-4 py-3 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 disabled:opacity-60 text-sky-100 border border-sky-400/40 font-black text-xs flex items-center gap-2 cursor-pointer shadow-md transition-all active:scale-95"
                      >
                        <DownloadCloud className="w-4 h-4 text-sky-300" />
                        <span>Force Pull from Cloud</span>
                      </button>
                    )}

                    {onForcePushLocalToCloud && (
                      <button
                        type="button"
                        onClick={() => onForcePushLocalToCloud()}
                        disabled={isCloudSyncing}
                        className="px-4 py-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 disabled:opacity-60 text-amber-100 border border-amber-400/40 font-black text-xs flex items-center gap-2 cursor-pointer shadow-md transition-all active:scale-95"
                      >
                        <UploadCloud className="w-4 h-4 text-amber-300" />
                        <span>Force Push Local Backup to Cloud</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Live Unified window.instituteDB v3.0.0 Telemetry Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2 border-t border-white/10">
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Students</div>
                    <div className="text-base font-black text-white font-mono mt-0.5">{state.students.length}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Staff Members</div>
                    <div className="text-base font-black text-white font-mono mt-0.5">{state.staff.length}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Courses & Batches</div>
                    <div className="text-base font-black text-white font-mono mt-0.5">
                      {state.courses.length} / {state.batches.length}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Syllabus Lectures</div>
                    <div className="text-base font-black text-emerald-400 font-mono mt-0.5">{totalLecturesCount}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Study Materials</div>
                    <div className="text-base font-black text-amber-300 font-mono mt-0.5">{state.materials.length}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Fee Ledger Entries</div>
                    <div className="text-base font-black text-sky-300 font-mono mt-0.5">{totalFeeEntriesCount}</div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-300 pt-1">
                  <div className="flex items-center gap-2">
                    <Database className="w-3.5 h-3.5 text-emerald-400" />
                    <span>
                      Local Snapshot: <strong className="text-white font-mono">{state.lastSavedAt}</strong>
                    </span>
                  </div>
                  <div>
                    Last Cloud / Firebase Sync:{' '}
                    <strong className="text-emerald-300 font-mono">
                      {state.settings.cloudDb?.lastSyncAt
                        ? new Date(state.settings.cloudDb.lastSyncAt).toLocaleString('en-IN', { hour12: false })
                        : 'Not synced in this session'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Forensic Cloud Sync Diagnostic & Multi-Device Reconcile Option */}
              <div className="bg-white border border-indigo-200 rounded-2xl shadow-xs p-6 space-y-5">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800 border border-indigo-200">
                        Multi-Device Forensic Audit & Sync Option
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                          diagReport.isRealFirebaseAuthActive
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}
                      >
                        {typeof navigator !== 'undefined' && !navigator.onLine
                          ? 'Offline (Local Cache)'
                          : diagReport.isRealFirebaseAuthActive
                          ? 'Firebase Connected (Synced)'
                          : 'Pre-Connected Local Cache (Master Admin)'}
                      </span>
                    </div>
                    <h2 className="text-base font-black text-slate-900 mt-1.5 flex items-center gap-2">
                      <Database className="w-5 h-5 text-indigo-600" />
                      <span>Forensic Firebase Diagnostics & Cross-Device Union Reconciler</span>
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Live non-sensitive telemetry verifying Laptop &amp; Android connection to identical Firestore tenant, plus 1-click non-destructive record union recovery.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setDiagReport(getSyncDiagnosticsReport());
                        setReconcileStatusMsg('✓ Refreshed live Firebase & Firestore diagnostic telemetry.');
                      }}
                      className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Refresh Telemetry</span>
                    </button>

                    <button
                      type="button"
                      disabled={isReconcilingDevices || isCloudSyncing}
                      onClick={async () => {
                        setIsReconcilingDevices(true);
                        setReconcileStatusMsg('Reconciling Laptop & Android records (clearing stuck tombstones + union-merging cloud & local)...');
                        try {
                          clearAllDeletedTombstones();
                          if (onMasterFetchFromCloud) {
                            await onMasterFetchFromCloud();
                          }
                          await onPushCloudSync();
                          setDiagReport(getSyncDiagnosticsReport());
                          setReconcileStatusMsg(
                            '✓ Multi-Device Reconcile Complete! All student & financial records from Laptop + Android have been safely union-merged without deletions.'
                          );
                        } catch (err: any) {
                          setReconcileStatusMsg(`⚠️ Reconcile notice: ${err?.message || 'Check connection and retry.'}`);
                        } finally {
                          setIsReconcilingDevices(false);
                        }
                      }}
                      className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-black text-xs shadow-sm flex items-center gap-2 transition-all cursor-pointer"
                    >
                      <RefreshCw className={`w-4 h-4 ${isReconcilingDevices ? 'animate-spin' : ''}`} />
                      <span>
                        {isReconcilingDevices
                          ? 'Reconciling All Devices...'
                          : 'Reconcile & Merge All Devices Now'}
                      </span>
                    </button>
                  </div>
                </div>

                {reconcileStatusMsg && (
                  <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-xs font-bold text-indigo-950 flex items-center justify-between gap-2">
                    <span>{reconcileStatusMsg}</span>
                    <button
                      type="button"
                      onClick={() => setReconcileStatusMsg(null)}
                      className="text-[11px] font-black text-indigo-600 hover:text-indigo-800 px-2 py-0.5 rounded cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                    <div className="text-[10px] font-black uppercase text-slate-400">1. Firebase Project ID</div>
                    <div className="font-mono font-bold text-slate-900 mt-0.5 break-all">{diagReport.projectId}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                    <div className="text-[10px] font-black uppercase text-slate-400">2. Firebase App ID</div>
                    <div className="font-mono font-bold text-slate-900 mt-0.5 break-all">{diagReport.appId}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                    <div className="text-[10px] font-black uppercase text-slate-400">3. Firestore Database ID</div>
                    <div className="font-mono font-bold text-indigo-700 mt-0.5 break-all">{diagReport.firestoreDatabaseId}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                    <div className="text-[10px] font-black uppercase text-slate-400">4. Active Authentication UID</div>
                    <div className="font-mono font-bold text-slate-900 mt-0.5 break-all">{diagReport.activeAuthUid}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                    <div className="text-[10px] font-black uppercase text-slate-400">5. Cloud Connection Status</div>
                    <div
                      className={`font-bold mt-0.5 ${
                        diagReport.isRealFirebaseAuthActive
                          ? 'text-emerald-700'
                          : typeof navigator !== 'undefined' && !navigator.onLine
                          ? 'text-blue-700'
                          : 'text-amber-700'
                      }`}
                    >
                      {typeof navigator !== 'undefined' && !navigator.onLine
                        ? 'Offline (Local Cache Active)'
                        : diagReport.isRealFirebaseAuthActive
                        ? 'Firebase Connected (Synced)'
                        : 'Pre-Connected Local Cache (Master Admin)'}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                    <div className="text-[10px] font-black uppercase text-slate-400">6. Real-Time Listeners Active</div>
                    <div className="font-mono font-bold text-slate-900 mt-0.5">
                      {diagReport.realtimeListenersActive
                        ? `YES (${diagReport.activeRealtimeListenersCount} active onSnapshot streams)`
                        : 'NO (Waiting for Auth / Reconnecting)'}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                    <div className="text-[10px] font-black uppercase text-slate-400">7. Last Successful Cloud Read</div>
                    <div className="font-mono font-bold text-slate-800 mt-0.5">
                      {diagReport.lastSuccessfulCloudRead || 'Pending initial read'}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                    <div className="text-[10px] font-black uppercase text-slate-400">8. Last Successful Cloud Write</div>
                    <div className="font-mono font-bold text-slate-800 mt-0.5">
                      {diagReport.lastSuccessfulCloudWrite || 'No write in current tab yet'}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                    <div className="text-[10px] font-black uppercase text-slate-400">9. Pending Offline Writes &amp; Tombstones</div>
                    <div className="font-mono font-bold text-slate-800 mt-0.5">
                      Pending Writes: {diagReport.pendingOfflineWrites} • Deleted Tombstones: {diagReport.localDeletedTombstoneCount}
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-black uppercase text-slate-400 mr-2">10. Verified Collection Paths:</span>
                    <span className="font-mono font-semibold text-slate-700">
                      {diagReport.collectionPaths.join('  •  ')}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-slate-500">
                    Device ID: {diagReport.deviceId}
                  </span>
                </div>

                {/* Live 10-Test Multi-Device Verification Suite Runner & Financial Conflict Review */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <div className="text-xs font-extrabold text-slate-900">
                        Live Multi-Device Cloud &amp; Workspace (`ssm_pune_main`) Verification Suite (Tests 1–10)
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Executes non-destructive verification tests for Laptop/Phone sync, atomic fee transactions, attendance merge, shared workspace path, chunked backup state machine, and anti-duplication.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <SSMSyncStatusBadge
                        syncMeta={{
                          hasPendingWrites: diagReport.pendingOfflineWrites > 0,
                          fromCache: false
                        }}
                      />
                      <button
                        type="button"
                        disabled={isRunningSuite}
                        onClick={async () => {
                          setIsRunningSuite(true);
                          try {
                            const res = await runLiveFirebaseVerificationSuite();
                            setSuiteResults(res.results);
                            setDiagReport(getSyncDiagnosticsReport());
                          } finally {
                            setIsRunningSuite(false);
                          }
                        }}
                        className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-black cursor-pointer flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{isRunningSuite ? 'Running 10 Tests...' : 'Run 10-Test Verification Suite'}</span>
                      </button>
                    </div>
                  </div>

                  {suiteResults && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2">
                      {suiteResults.map((t) => (
                        <div
                          key={t.testId}
                          className={`p-2.5 rounded-lg border text-xs ${
                            t.passed
                              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                              : 'bg-rose-50 border-rose-200 text-rose-950'
                          }`}
                        >
                          <div className="flex items-center justify-between font-black">
                            <span>{t.testId}: {t.title}</span>
                            <span className="font-mono text-[10px]">{t.passed ? 'PASS' : 'CHECK'} ({t.durationMs}ms)</span>
                          </div>
                          <div className="text-[11px] opacity-85 mt-0.5">{t.detail}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {financialConflicts.length > 0 && (
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-black text-amber-900">
                          ⚠️ Flagged Financial Discrepancies ({financialConflicts.length}) — Preserved Safely for Admin Review
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            clearFinancialConflictReport();
                            setFinancialConflicts([]);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold cursor-pointer"
                        >
                          Mark Reviewed
                        </button>
                      </div>
                      {financialConflicts.slice(0, 5).map((fc) => (
                        <div key={fc.id} className="text-[11px] text-amber-950 font-mono bg-white/80 p-2 rounded border border-amber-200/70">
                          {fc.milestoneName} (Due: {fc.dueDate}) • Local: ₹{fc.localAmount} ({fc.localRef}) vs Cloud: ₹{fc.remoteAmount} ({fc.remoteRef}) — {fc.resolutionNote}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Auto-Sync Loop & Custom Cloud / Firebase Endpoint Configuration */}
              <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs p-6 space-y-6">
                <div className="border-b border-slate-100 pb-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                      <Cloud className="w-5 h-5 text-indigo-600" />
                      <span>2-Minute Auto-Sync & Cloud Endpoint Configuration</span>
                    </h2>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Cloud Run Server + Firebase Firestore + RTDB Ready
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Configure automatic sync frequency, settings auto-save behavior, and optional custom Firebase Realtime Database REST URL or Cloud Project credentials.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Auto-Sync Interval */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-black text-slate-800 uppercase tracking-wide">
                      Automatic Cloud Sync Interval
                    </label>
                    <select
                      value={formData.cloudConfig?.autoSyncIntervalMs || 120000}
                      onChange={(e) => {
                        const ms = Number(e.target.value) || 120000;
                        updateField('cloudConfig', {
                          ...(formData.cloudConfig || {
                            provider: 'firebase',
                            firebaseUrl: '',
                            authToken: '',
                            autoSaveSettings: true
                          }),
                          autoSyncIntervalMs: ms
                        });
                      }}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    >
                      <option value={120000}>Every 2 Minutes (120,000 ms — Recommended Default)</option>
                      <option value={60000}>Every 1 Minute (60,000 ms — High Frequency)</option>
                      <option value={30000}>Every 30 Seconds (30,000 ms — Rapid Mirror)</option>
                      <option value={300000}>Every 5 Minutes (300,000 ms)</option>
                    </select>
                    <span className="text-[10px] text-slate-500 block">
                      Automatically pushes `window.instituteDB` to Cloud Server & Firebase in the background.
                    </span>
                  </div>

                  {/* Settings Auto-Save Toggle */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-black text-slate-800 uppercase tracking-wide">
                      Real-Time Settings Auto-Save
                    </label>
                    <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.cloudConfig?.autoSaveSettings !== false}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          updateField('cloudConfig', {
                            ...(formData.cloudConfig || {
                              provider: 'firebase',
                              firebaseUrl: '',
                              authToken: '',
                              autoSyncIntervalMs: 120000
                            }),
                            autoSaveSettings: checked
                          });
                        }}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <span className="text-xs font-black text-slate-900 block">
                          Auto-Save Settings Edits Immediately (Local + Online)
                        </span>
                        <span className="text-[10px] text-slate-500">
                          Automatically persists any change made in Settings without requiring a manual button click.
                        </span>
                      </div>
                    </label>
                  </div>

                  {/* Custom Firebase RTDB / Cloud REST URL */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-black text-slate-800 uppercase tracking-wide">
                      Optional Firebase Realtime DB / Custom Cloud REST URL
                    </label>
                    <input
                      type="url"
                      value={formData.cloudConfig?.firebaseUrl || ''}
                      onChange={(e) => {
                        const url = e.target.value;
                        updateField('cloudConfig', {
                          ...(formData.cloudConfig || {
                            provider: 'firebase',
                            authToken: '',
                            autoSyncIntervalMs: 120000,
                            autoSaveSettings: true
                          }),
                          firebaseUrl: url
                        });
                      }}
                      placeholder="https://your-project-default-rtdb.asia-southeast1.firebasedatabase.app"
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    />
                    <span className="text-[10px] text-slate-500 block">
                      Optional: If provided, `window.instituteDB` is also mirrored via `PUT /instituteDB.json` to this endpoint.
                    </span>
                  </div>

                  {/* Optional Auth Secret / Token */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-black text-slate-800 uppercase tracking-wide">
                      Optional Endpoint Auth Token / Secret
                    </label>
                    <input
                      type="password"
                      value={formData.cloudConfig?.authToken || ''}
                      onChange={(e) => {
                        const token = e.target.value;
                        updateField('cloudConfig', {
                          ...(formData.cloudConfig || {
                            provider: 'firebase',
                            firebaseUrl: '',
                            autoSyncIntervalMs: 120000,
                            autoSaveSettings: true
                          }),
                          authToken: token
                        });
                      }}
                      placeholder="Optional database secret or bearer token"
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    />
                    <span className="text-[10px] text-slate-500 block">
                      Leave blank when using built-in Cloud Run Server &amp; provisioned Firebase Firestore (`{ACTIVE_FIREBASE_PROJECT_ID}`).
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-black text-slate-800 uppercase tracking-wide">
                      Provisioned Firebase Project ID
                    </label>
                    <input
                      type="text"
                      value={formData.cloudDb?.firebase?.projectId || ACTIVE_FIREBASE_PROJECT_ID}
                      onChange={(e) => {
                        const pid = e.target.value;
                        updateField('cloudDb', {
                          provider: 'firebase',
                          firebase: {
                            projectId: pid,
                            apiKey: formData.cloudDb?.firebase?.apiKey || '',
                            appId: formData.cloudDb?.firebase?.appId || ''
                          },
                          lastSyncAt: formData.cloudDb?.lastSyncAt
                        });
                      }}
                      placeholder={`e.g. ${ACTIVE_FIREBASE_PROJECT_ID}`}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    />
                    <span className="text-[10px] text-slate-500 block">
                      Target Google Cloud Project ID for Firestore database collections.
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-black text-slate-800 uppercase tracking-wide">
                      Cloud Sync Architecture Mode
                    </label>
                    <div className="px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-900 flex items-center justify-between">
                      <span>Local IndexedDB + Cloud Server + Firebase Firestore</span>
                      <span className="px-2 py-0.5 rounded-md bg-emerald-200/70 text-emerald-950 font-mono text-[10px] font-black">
                        ACTIVE
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 block">
                      Triple-redundant persistence ensures zero data loss online or offline.
                    </span>
                  </div>
                </div>

                {/* Gemini AI Admin Agent Model & Grounding Configuration */}
                <div className="pt-4 border-t border-slate-100 space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h3 className="text-xs font-black text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
                        <span>🤖 Gemini AI Admin Agent — Model &amp; Fallback Configuration</span>
                      </h3>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Configure the primary Google Gemini model, automatic free-tier fallback chain, and live Google Search grounding for the CRM Admin Agent.
                      </p>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-black">
                      Admin: srujaansharemarketpune@gmail.com
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wide">
                        Preferred Primary Gemini Model
                      </label>
                      <select
                        value={formData.aiConfig?.preferredModel || 'gemini-2.5-flash'}
                        onChange={(e) => {
                          const preferredModel = e.target.value as NonNullable<typeof formData.aiConfig>['preferredModel'];
                          updateField('aiConfig', {
                            preferredModel,
                            enableGoogleSearch: formData.aiConfig?.enableGoogleSearch ?? true,
                            enableAutoFallback: formData.aiConfig?.enableAutoFallback ?? true
                          });
                        }}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="gemini-2.5-flash">Gemini 2.5 Flash (Recommended • Fast + Tools)</option>
                        <option value="gemini-3.8-flash">Gemini 3.8 Flash (Advanced Multi-Step Reasoning)</option>
                        <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash-Lite (High-Throughput Free Tier)</option>
                        <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash-Lite (Ultra-Low Latency)</option>
                      </select>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
                      <div>
                        <span className="text-xs font-black text-slate-900 block">
                          Live Google Search Grounding
                        </span>
                        <span className="text-[10px] text-slate-500">
                          Grounds Nifty/Sensex/SEBI &amp; world queries in live Google Search.
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={formData.aiConfig?.enableGoogleSearch ?? true}
                        onChange={(e) => {
                          updateField('aiConfig', {
                            preferredModel: formData.aiConfig?.preferredModel || 'gemini-2.5-flash',
                            enableGoogleSearch: e.target.checked,
                            enableAutoFallback: formData.aiConfig?.enableAutoFallback ?? true
                          });
                        }}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                      />
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
                      <div>
                        <span className="text-xs font-black text-slate-900 block">
                          Auto-Fallback Model Chain
                        </span>
                        <span className="text-[10px] text-slate-500">
                          Automatically cascades across Flash &amp; Flash-Lite on rate limits.
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={formData.aiConfig?.enableAutoFallback ?? true}
                        onChange={(e) => {
                          updateField('aiConfig', {
                            preferredModel: formData.aiConfig?.preferredModel || 'gemini-2.5-flash',
                            enableGoogleSearch: formData.aiConfig?.enableGoogleSearch ?? true,
                            enableAutoFallback: e.target.checked
                          });
                        }}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Master Backup & Restore Engine */}
              <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs p-6 space-y-5">
                <div className="border-b border-slate-100 pb-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                      <HardDrive className="w-5 h-5 text-indigo-600" />
                      <span>Master Backup (JSON) & Database Restore System</span>
                    </h2>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-blue-50 text-blue-700 border border-blue-200">
                      Zero Manual Upload On Reload Required
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Application automatically persists all state offline in 0ms and syncs with Cloud Firestore. You can also export portable Master Backup JSON snapshots or restore complete institute databases.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Export Box */}
                  <div className="p-5 rounded-2xl bg-indigo-50/50 border border-indigo-200/80 space-y-3">
                    <div className="flex items-center gap-2 text-indigo-800 font-black text-xs uppercase tracking-wide">
                      <Download className="w-4 h-4" />
                      <span>Master Backup (JSON) Export</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Generates a single formatted <strong className="font-mono text-slate-800">srujaan_crm_backup_YYYY-MM-DD.json</strong> containing all student rosters, batches, lectures, materials, fee installments, custom branch addresses, and settings.
                    </p>
                    <button
                      type="button"
                      onClick={() => exportMasterBackup(state)}
                      className="w-full px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-xs"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>📥 Download Master Backup (JSON)</span>
                    </button>
                  </div>

                  {/* Import Box */}
                  <div className="p-5 rounded-2xl bg-emerald-50/50 border border-emerald-200/80 space-y-3">
                    <div className="flex items-center gap-2 text-emerald-800 font-black text-xs uppercase tracking-wide">
                      <Upload className="w-4 h-4" />
                      <span>Restore Master Backup</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Select a valid JSON backup file to overwrite current in-memory data, browser local cache, and Cloud Firestore with an administrator confirmation check.
                    </p>
                    <input
                      type="file"
                      ref={backupFileInputRef}
                      accept=".json"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          onRestoreBackup(file);
                          e.target.value = '';
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => backupFileInputRef.current?.click()}
                      className="w-full px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-xs"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>📤 Restore Master Backup</span>
                    </button>
                  </div>
                </div>

                {/* Factory Reset */}
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 flex flex-wrap items-center justify-between gap-4 mt-2">
                  <div>
                    <strong className="text-xs font-black text-rose-900 block">
                      Factory Dataset Reset
                    </strong>
                    <span className="text-[11px] text-rose-700">
                      Restores initial Pune campus seed data with default courses and students. Use with caution.
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={onResetFactoryData}
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black cursor-pointer shadow-xs transition-colors"
                  >
                    Reset to Factory Seed Data
                  </button>
                </div>
              </div>

              {/* Universal 9-Engine Storage & Database Integration Hub */}
              <UniversalStorageHub state={state} />
            </div>
          )}

          {/* ========================================================================= */}
          {/* SECTION 6: SYSTEM HEALTH & SELF-REPAIR                                  */}
          {/* ========================================================================= */}
          {activeSection === 'system-health' && (
            <div className="space-y-6">
              <SystemHealthPanel
                state={state}
                onApplyRepairedState={onApplyRepairedState}
                onToast={onToast}
                onDiagnosticsApplied={() => {
                  setDiagReport(getSyncDiagnosticsReport());
                  setFinancialConflicts(getFinancialConflictReport());
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
