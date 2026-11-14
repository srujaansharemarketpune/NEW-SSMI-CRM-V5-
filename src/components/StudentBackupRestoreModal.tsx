import React, { useState, useEffect } from 'react';
import { Student } from '../types';
import {
  exportStudentsToJson,
  createFirestoreBackup,
  fetchLatestFirestoreBackup,
  restoreStudentData,
  parseStudentBackupFile,
  getGoogleSheetWebhookUrl,
  getGoogleSheetEndpointMode,
  getCustomGoogleSheetWebhookUrl,
  saveGoogleSheetWebhookUrl,
  resetGoogleSheetWebhookToDefault,
  testGoogleSheetWebhookConnection,
  DEFAULT_APPS_SCRIPT_EXEC_URL,
  DEFAULT_APPS_SCRIPT_LIBRARY_ID,
  DEFAULT_APPS_SCRIPT_LIBRARY_URL,
  syncToGoogleSheets,
  FULL_APPS_SCRIPT_CODE,
  STORAGE_KEYS
} from '../services/storageService';
import {
  Download,
  Upload,
  Cloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Database,
  ArrowRight,
  Info,
  RotateCcw
} from 'lucide-react';
import { DraggableWindow } from './DraggableWindow';

interface StudentBackupRestoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  onRestoreStudents: (restored: Student[], message: string) => void;
  onToast: (msg: string) => void;
}

export const StudentBackupRestoreModal: React.FC<StudentBackupRestoreModalProps> = ({
  isOpen,
  onClose,
  students,
  onRestoreStudents,
  onToast
}) => {
  const [activeTab, setActiveTab] = useState<'backup' | 'restore' | 'sheets'>('backup');
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [lastBackupTime, setLastBackupTime] = useState<string | null>(null);

  // Webhook State
  const [endpointMode, setEndpointMode] = useState<'default' | 'custom'>(() =>
    getGoogleSheetEndpointMode()
  );
  const [customWebhookUrl, setCustomWebhookUrl] = useState<string>(() =>
    getCustomGoogleSheetWebhookUrl()
  );
  const [webhookUrl, setWebhookUrl] = useState(() => getGoogleSheetWebhookUrl());
  const [isTestingWebhook, setIsTestingWebhook] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLibId, setCopiedLibId] = useState(false);
  const [showLibInfo, setShowLibInfo] = useState(false);

  // File Upload State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileAnalysis, setFileAnalysis] = useState<{
    valid: boolean;
    count?: number;
    students?: Student[];
    message?: string;
  } | null>(null);

  // Cloud Snapshot Preview
  const [latestCloudSnapshot, setLatestCloudSnapshot] = useState<{
    backupId: string;
    timestamp: string;
    studentCount: number;
    students: Student[];
    source: 'Firestore' | 'Local Cache';
  } | null>(null);
  const [loadingCloudSnapshot, setLoadingCloudSnapshot] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setEndpointMode(getGoogleSheetEndpointMode());
      setCustomWebhookUrl(getCustomGoogleSheetWebhookUrl());
      setWebhookUrl(getGoogleSheetWebhookUrl());
      try {
        const savedTime = localStorage.getItem(STORAGE_KEYS.LAST_BACKUP_TIME);
        if (savedTime) setLastBackupTime(savedTime);
      } catch {
        // ignore
      }
      loadCloudSnapshot();
    }
  }, [isOpen]);

  const loadCloudSnapshot = async () => {
    setLoadingCloudSnapshot(true);
    const safetyTimer = setTimeout(() => {
      setLoadingCloudSnapshot(false);
    }, 4000);
    try {
      const snap = await fetchLatestFirestoreBackup();
      setLatestCloudSnapshot(snap);
    } catch {
      // ignore
    } finally {
      clearTimeout(safetyTimer);
      setLoadingCloudSnapshot(false);
    }
  };

  if (!isOpen) return null;

  // 1. Manual Backup Action: JSON Download + Cloud Snapshot + Google Sheets Mirror
  const handleExecuteBackup = async () => {
    setIsBackingUp(true);
    const safetyTimer = setTimeout(() => {
      setIsBackingUp(false);
    }, 6000);
    try {
      // 1. Download timestamped JSON locally
      exportStudentsToJson(students);

      // 2. Create timestamped snapshot in Firestore under backups/ and diff-sync students/
      const { timestamp } = await createFirestoreBackup(
        students,
        `Manual Backup (${students.length} students)`
      );
      setLastBackupTime(timestamp);

      // 3. Trigger Google Sheets ping/mirror if configured
      const url = getGoogleSheetWebhookUrl();
      let sheetNotice = '';
      if (url && students.length > 0) {
        try {
          const sample = students[0];
          await syncToGoogleSheets(sample, 'UPDATE');
          sheetNotice = ' & Google Sheets notified';
        } catch {
          // non-blocking
        }
      }

      const formattedDate = new Date(timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      onToast(`✓ Backup created successfully at ${formattedDate} (${students.length} students saved${sheetNotice})`);
      loadCloudSnapshot();
    } catch (err: any) {
      onToast(`⚠️ Backup warning: ${err?.message || 'Saved locally'}`);
    } finally {
      clearTimeout(safetyTimer);
      setIsBackingUp(false);
    }
  };

  // 2. Handle File Selection for JSON Restore
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    const result = await parseStudentBackupFile(file);
    if (result.success && result.students) {
      setFileAnalysis({
        valid: true,
        count: result.recordCount,
        students: result.students,
        message: result.message
      });
    } else {
      setFileAnalysis({
        valid: false,
        message: result.message
      });
    }
  };

  // 3. Confirm File Restore
  const handleConfirmFileRestore = () => {
    if (!fileAnalysis || !fileAnalysis.valid || !fileAnalysis.students) return;
    setIsRestoring(true);
    try {
      onRestoreStudents(
        fileAnalysis.students,
        `Restored ${fileAnalysis.students.length} student records from ${selectedFile?.name || 'backup'}`
      );
      onToast(`✓ Restored ${fileAnalysis.students.length} students from local backup!`);
      onClose();
    } finally {
      setIsRestoring(false);
    }
  };

  // 4. Confirm Cloud Restore (fetches active non-deleted records from Firestore and overwrites local state)
  const handleConfirmCloudRestore = async () => {
    if (!latestCloudSnapshot) return;
    setIsRestoring(true);
    const safetyTimer = setTimeout(() => {
      setIsRestoring(false);
    }, 5000);
    try {
      const liveRestored = await restoreStudentData();
      const restoredArray = Array.isArray(liveRestored) ? liveRestored : liveRestored?.data;
      const targetStudents: Student[] =
        restoredArray && restoredArray.length > 0
          ? restoredArray
          : (latestCloudSnapshot.students || []).filter(s => !(s as any).isDeleted);
      onRestoreStudents(
        targetStudents,
        `Restored ${targetStudents.length} active student records from ${latestCloudSnapshot.source}`
      );
      onToast(`✓ Restored ${targetStudents.length} active students from ${latestCloudSnapshot.source}!`);
      onClose();
    } finally {
      clearTimeout(safetyTimer);
      setIsRestoring(false);
    }
  };

  // 5. Save, Reset & Test Webhook URL
  const handleSelectMode = (mode: 'default' | 'custom') => {
    setEndpointMode(mode);
    setTestResult(null);
    if (mode === 'default') {
      setWebhookUrl(DEFAULT_APPS_SCRIPT_EXEC_URL);
      saveGoogleSheetWebhookUrl(DEFAULT_APPS_SCRIPT_EXEC_URL, 'default');
      onToast('✓ Active endpoint set to Default Production Apps Script URL');
    } else {
      setWebhookUrl(customWebhookUrl.trim());
    }
  };

  const handleResetWebhookToDefault = () => {
    const defUrl = resetGoogleSheetWebhookToDefault();
    setEndpointMode('default');
    setCustomWebhookUrl('');
    setWebhookUrl(defUrl);
    setTestResult({
      success: true,
      message: '✓ Reset to Default Production Endpoint & cleared custom overrides!'
    });
    onToast('✓ Reset Google Sheets endpoint to Default Production URL');
  };

  const handleTestWebhook = async () => {
    const targetUrl =
      endpointMode === 'default'
        ? DEFAULT_APPS_SCRIPT_EXEC_URL
        : customWebhookUrl.trim() || webhookUrl.trim();

    if (endpointMode === 'custom' && !targetUrl) {
      setTestResult({
        success: false,
        message: 'Please enter a valid Custom Apps Script Web App URL or select Default Production Endpoint.'
      });
      return;
    }
    setIsTestingWebhook(true);
    setTestResult(null);

    try {
      const res = await testGoogleSheetWebhookConnection(targetUrl, endpointMode);
      setWebhookUrl(res.endpoint);
      setTestResult({
        success: res.success,
        message: res.message
      });
      if (res.success) {
        onToast('✓ Saved & verified Google Sheets Apps Script connection!');
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: `Error connecting to webhook: ${err?.message || 'Network error'}`
      });
    } finally {
      setIsTestingWebhook(false);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(FULL_APPS_SCRIPT_CODE);
    setCopiedCode(true);
    onToast('✓ Google Apps Script (Code.gs) copied to clipboard!');
    setTimeout(() => setCopiedCode(false), 3000);
  };

  return (
    <DraggableWindow
      isOpen={isOpen}
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      icon={
        <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
          <Database className="w-5 h-5" />
        </div>
      }
      title="Persistence & Backup Center"
      subtitle="Multi-tier persistent sync: LocalStorage + Firestore Cloud + Google Sheets"
      bodyClassName="flex flex-col"
      footer={
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] text-slate-400">
            Srujaan Share Market Institute • Persistence Engine v3.0
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] sm:min-h-0 px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-extrabold cursor-pointer transition-colors"
          >
            Close
          </button>
        </div>
      }
    >
      <div className="flex flex-col flex-1">

        {/* Tab Navigation */}
        <div className="px-6 pt-3 border-b border-slate-100 flex items-center gap-2 bg-white">
          <button
            onClick={() => setActiveTab('backup')}
            className={`pb-3 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'backup'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Download className="w-4 h-4" />
            <span>Backup Data</span>
          </button>
          <button
            onClick={() => setActiveTab('restore')}
            className={`pb-3 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'restore'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>Restore Data</span>
          </button>
          <button
            onClick={() => setActiveTab('sheets')}
            className={`pb-3 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'sheets'
                ? 'border-emerald-600 text-emerald-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Google Sheets Sync</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-slate-800">
          {/* TAB 1: BACKUP */}
          {activeTab === 'backup' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-100 flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div className="text-xs text-slate-700 leading-relaxed">
                  <span className="font-bold text-slate-900 block mb-0.5">
                    Multi-Tier Snapshot Automation
                  </span>
                  Clicking <strong>Backup Data</strong> immediately generates a downloadable timestamped <code className="bg-blue-100/70 text-blue-800 px-1 py-0.5 rounded font-mono">.json</code> file, creates an immutable remote snapshot in Firebase Firestore under <code className="bg-blue-100/70 text-blue-800 px-1 py-0.5 rounded font-mono">backups/</code>, and triggers the Google Sheets sync hook.
                </div>
              </div>

              {/* Status summary */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Total Records
                  </div>
                  <div className="text-lg font-black text-slate-900 mt-0.5">
                    {students.length} Students
                  </div>
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Tier 1 Local Cache
                  </div>
                  <div className="text-xs font-bold text-emerald-700 flex items-center gap-1 mt-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>0ms Synchronous</span>
                  </div>
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 col-span-2 sm:col-span-1">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Last Backup
                  </div>
                  <div className="text-xs font-bold text-slate-800 mt-1.5 truncate">
                    {lastBackupTime ? new Date(lastBackupTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Not yet created'}
                  </div>
                </div>
              </div>

              {/* Backup Trigger Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleExecuteBackup}
                  disabled={isBackingUp}
                  className="w-full py-3.5 px-4 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-md cursor-pointer transition-all disabled:opacity-60"
                >
                  {isBackingUp ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Creating Multi-Tier Backup Snapshot...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>Backup Data (Download JSON + Save to Cloud)</span>
                    </>
                  )}
                </button>
              </div>

              {/* Latest Cloud Snapshot details if present */}
              {latestCloudSnapshot && (
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs">
                  <div className="font-bold text-slate-800 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Cloud className="w-4 h-4 text-blue-600" />
                      <span>Latest Cloud Snapshot ({latestCloudSnapshot.source})</span>
                    </span>
                    <span className="text-[11px] font-mono text-slate-500">
                      {latestCloudSnapshot.backupId}
                    </span>
                  </div>
                  <div className="text-slate-500 mt-1 flex items-center gap-2">
                    <span>{new Date(latestCloudSnapshot.timestamp).toLocaleString('en-IN')}</span>
                    <span>•</span>
                    <span>{latestCloudSnapshot.studentCount} students recorded</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: RESTORE */}
          {activeTab === 'restore' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-900 leading-relaxed">
                  <span className="font-bold block mb-0.5">Safe Re-hydration</span>
                  Restoring data merges and re-hydrates state, updates <code className="bg-amber-100 text-amber-900 px-1 py-0.5 rounded font-mono">localStorage</code> immediately, and updates the student list reactively without requiring a manual browser refresh.
                </div>
              </div>

              {/* Option A: Upload JSON file */}
              <div className="p-4 rounded-2xl border-2 border-dashed border-slate-200 hover:border-blue-400 bg-slate-50/50 transition-colors">
                <div className="text-xs font-black text-slate-800 mb-1 flex items-center gap-1.5">
                  <Upload className="w-4 h-4 text-blue-600" />
                  <span>Option A: Restore from Downloaded JSON Backup File</span>
                </div>
                <p className="text-[11px] text-slate-500 mb-3">
                  Upload a previously saved <code className="font-mono">srujaan_students_backup_*.json</code> file.
                </p>

                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileChange}
                  className="block w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 file:cursor-pointer cursor-pointer"
                />

                {fileAnalysis && (
                  <div className={`mt-3 p-3 rounded-xl text-xs font-medium flex items-center justify-between ${
                    fileAnalysis.valid ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
                  }`}>
                    <span>{fileAnalysis.message}</span>
                    {fileAnalysis.valid && (
                      <button
                        type="button"
                        onClick={handleConfirmFileRestore}
                        disabled={isRestoring}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold cursor-pointer transition-all shrink-0 ml-2 shadow-2xs"
                      >
                        {isRestoring ? 'Restoring...' : 'Apply JSON Restore'}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Option B: Restore from Cloud / Firestore */}
              <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-2xs">
                <div className="text-xs font-black text-slate-800 mb-1 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Cloud className="w-4 h-4 text-blue-600" />
                    <span>Option B: Restore from Latest Firestore Cloud Snapshot</span>
                  </div>
                  <button
                    type="button"
                    onClick={loadCloudSnapshot}
                    disabled={loadingCloudSnapshot}
                    className="text-[11px] font-bold text-blue-600 hover:text-blue-800 cursor-pointer flex items-center gap-1"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingCloudSnapshot ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>

                {latestCloudSnapshot ? (
                  <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs flex items-center justify-between">
                    <div>
                      <div className="font-bold text-slate-900">
                        {latestCloudSnapshot.studentCount} Students in Snapshot
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Captured: {new Date(latestCloudSnapshot.timestamp).toLocaleString('en-IN')} ({latestCloudSnapshot.source})
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleConfirmCloudRestore}
                      disabled={isRestoring}
                      className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-extrabold cursor-pointer transition-all shadow-2xs flex items-center gap-1"
                    >
                      <span>Restore from Cloud</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 text-xs text-slate-400 italic">
                    {loadingCloudSnapshot ? 'Checking Firestore backups...' : 'No cloud snapshot found yet. Click Backup Data to create one.'}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: GOOGLE SHEETS SYNC PIPELINE */}
          {activeTab === 'sheets' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-100 flex items-start gap-3">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs text-emerald-950 leading-relaxed">
                  <span className="font-bold text-emerald-900 block mb-0.5">
                    Tier 3 Google Sheets Audit Ledger
                  </span>
                  Your web app automatically sends real-time audit posts to your Google Sheet whenever a student is added, edited, or deleted. Columns: <code className="font-mono bg-emerald-100 text-emerald-900 px-1 py-0.5 rounded">ID</code>, <code className="font-mono bg-emerald-100 text-emerald-900 px-1 py-0.5 rounded">Name</code>, <code className="font-mono bg-emerald-100 text-emerald-900 px-1 py-0.5 rounded">Batch</code>, <code className="font-mono bg-emerald-100 text-emerald-900 px-1 py-0.5 rounded">Contact</code>, <code className="font-mono bg-emerald-100 text-emerald-900 px-1 py-0.5 rounded">Fees Status</code>, <code className="font-mono bg-emerald-100 text-emerald-900 px-1 py-0.5 rounded">Status</code>, <code className="font-mono bg-emerald-100 text-emerald-900 px-1 py-0.5 rounded">Last Updated</code>.
                </div>
              </div>

              {/* Webhook Preset & Configuration Controls */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-black text-slate-800">
                    Apps Script Endpoint Selection
                  </span>

                  <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-500">Library ID:</span>
                    <code className="font-mono text-[10px] font-bold text-indigo-700">
                      {DEFAULT_APPS_SCRIPT_LIBRARY_ID.slice(0, 14)}...
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(DEFAULT_APPS_SCRIPT_LIBRARY_ID);
                        setCopiedLibId(true);
                        setTimeout(() => setCopiedLibId(false), 2000);
                      }}
                      className="p-0.5 text-slate-500 hover:text-slate-800 cursor-pointer"
                      title="Copy Library ID"
                    >
                      {copiedLibId ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowLibInfo(prev => !prev)}
                      className="p-0.5 text-indigo-600 hover:text-indigo-800 cursor-pointer"
                      title="View Library Details"
                    >
                      <Info className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {showLibInfo && (
                  <div className="p-3 rounded-xl bg-slate-900 text-slate-100 text-[11px] space-y-1">
                    <div className="font-bold text-emerald-400">Apps Script Library Identifier</div>
                    <div className="font-mono text-[10px] break-all select-all">{DEFAULT_APPS_SCRIPT_LIBRARY_ID}</div>
                    <a
                      href={DEFAULT_APPS_SCRIPT_LIBRARY_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[10px] text-blue-300 hover:underline break-all block"
                    >
                      {DEFAULT_APPS_SCRIPT_LIBRARY_URL}
                    </a>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleSelectMode('default')}
                    className={`p-2.5 rounded-xl border text-left text-xs cursor-pointer transition-all ${
                      endpointMode === 'default'
                        ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950 font-bold'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between font-black">
                      <span>1. Default Production Endpoint</span>
                      {endpointMode === 'default' && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                    </div>
                    <div className="text-[10px] font-mono text-slate-500 truncate mt-0.5">
                      {DEFAULT_APPS_SCRIPT_EXEC_URL}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectMode('custom')}
                    className={`p-2.5 rounded-xl border text-left text-xs cursor-pointer transition-all ${
                      endpointMode === 'custom'
                        ? 'border-blue-600 bg-blue-50/70 text-blue-950 font-bold'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between font-black">
                      <span>2. Custom Endpoint</span>
                      {endpointMode === 'custom' && <Check className="w-3.5 h-3.5 text-blue-600" />}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      Unlock custom Apps Script / webhook URL
                    </div>
                  </button>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-700 block">
                    Google Apps Script Web App URL (<code className="font-mono text-blue-600">.../exec</code>):
                  </label>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <input
                      type="url"
                      readOnly={endpointMode === 'default'}
                      value={endpointMode === 'default' ? DEFAULT_APPS_SCRIPT_EXEC_URL : customWebhookUrl}
                      onChange={(e) => {
                        setCustomWebhookUrl(e.target.value);
                        setWebhookUrl(e.target.value);
                      }}
                      placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                      className={`flex-1 px-3.5 py-2.5 rounded-xl border text-xs font-mono focus:outline-none ${
                        endpointMode === 'default'
                          ? 'bg-slate-100 border-slate-300 text-slate-600 cursor-default'
                          : 'bg-white border-blue-400 text-slate-900 focus:ring-2 focus:ring-blue-500'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={handleResetWebhookToDefault}
                      className="px-3 py-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold cursor-pointer transition-all shrink-0 flex items-center justify-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                      <span>Reset to Default</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleTestWebhook}
                      disabled={isTestingWebhook}
                      className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-all shrink-0 flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      {isTestingWebhook ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      )}
                      <span>Save & Test Connection</span>
                    </button>
                  </div>

                  {testResult && (
                    <div className={`p-3 rounded-xl text-xs font-medium ${
                      testResult.success
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-red-50 text-red-800 border border-red-200'
                    }`}>
                      {testResult.message}
                    </div>
                  )}
                </div>
              </div>

              {/* Setup Guide & Code.gs copy */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-800">
                    Step-by-Step Setup Guide
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-[11px] font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all"
                  >
                    {copiedCode ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-slate-500" />}
                    <span>{copiedCode ? 'Copied Code.gs!' : 'Copy Code.gs Script'}</span>
                  </button>
                </div>

                <ol className="text-xs text-slate-600 space-y-2 list-decimal list-inside leading-relaxed">
                  <li>Open your target Google Sheet for Srujaan Share Market Institute.</li>
                  <li>Click <strong>Extensions &gt; Apps Script</strong>.</li>
                  <li>Paste the copied script into <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">Code.gs</code>.</li>
                  <li>Click <strong>Deploy &gt; New deployment &gt; Select type: Web app</strong>.</li>
                  <li>Set <strong>Execute as: Me</strong> and <strong>Who has access: Anyone</strong> (crucial to allow web app posts without OAuth popups).</li>
                  <li>Click <strong>Deploy</strong>, grant permissions, and copy the Web App URL into the box above.</li>
                </ol>
              </div>
            </div>
          )}
        </div>
      </div>
    </DraggableWindow>
  );
};
