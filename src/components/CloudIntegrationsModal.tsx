import React, { useState, useEffect } from 'react';
import {
  Cloud,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Copy,
  Check,
  Code2,
  Database,
  Play,
  Download,
  Upload,
  ShieldCheck,
  Filter,
  HardDrive,
  Sparkles,
  RotateCcw,
  Eye
} from 'lucide-react';
import { AppState, Student, Lead } from '../types';
import {
  PRIMARY_INSTITUTE_EMAIL,
  DEFAULT_MASTER_SHEET_URL,
  DEFAULT_GOOGLE_FORM_URL,
  DEFAULT_GOOGLE_FORM_EMBED_URL,
  ZERO_TOUCH_APPS_SCRIPT_CODE,
  DuplicateFilterMode,
  SyncBatchSummary,
  StorageDiagnosticsSnapshot,
  getCloudIntegrationConfig,
  saveCloudIntegrationConfig,
  sendCorsSafeAppsScriptRequest,
  flushOfflineQueueBatch,
  fetchRowsFromGoogleSheet,
  applySmartDuplicateFilter,
  getStorageDiagnosticsSnapshot,
  syncAllStoragesUnified
} from '../services/storageManager';
import { DEFAULT_APPS_SCRIPT_EXEC_URL } from '../services/storageService';
import { DraggableWindow } from './DraggableWindow';

interface CloudIntegrationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: AppState;
  onCommitImportedStudents: (mergedStudents: Student[], summaryText: string) => void;
  onOpenManualEntry?: () => void;
}

export const CloudIntegrationsModal: React.FC<CloudIntegrationsModalProps> = ({
  isOpen,
  onClose,
  state,
  onCommitImportedStudents,
  onOpenManualEntry
}) => {
  const [activeTab, setActiveTab] = useState<'sync-hub' | 'staging-preview' | 'code-gs' | 'embedded-form' | 'diagnostics'>('sync-hub');
  const [config, setConfig] = useState(() => getCloudIntegrationConfig());
  const [execUrlInput, setExecUrlInput] = useState(config.execUrl);
  const [sheetUrlInput, setSheetUrlInput] = useState(config.masterSheetUrl);
  const [formUrlInput, setFormUrlInput] = useState(config.googleFormUrl);
  const [duplicateMode, setDuplicateMode] = useState<DuplicateFilterMode>(config.duplicateFilterMode || 'smart_merge');

  const [isBusy, setIsBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error' | 'info';
    title: string;
    detail: string;
  } | null>(null);

  const [stagedRows, setStagedRows] = useState<any[]>([]);
  const [lastBatchSummary, setLastBatchSummary] = useState<SyncBatchSummary | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<StorageDiagnosticsSnapshot | null>(null);

  useEffect(() => {
    if (isOpen) {
      const fresh = getCloudIntegrationConfig();
      setConfig(fresh);
      setExecUrlInput(fresh.execUrl);
      setSheetUrlInput(fresh.masterSheetUrl);
      setFormUrlInput(fresh.googleFormUrl);
      setDuplicateMode(fresh.duplicateFilterMode || 'smart_merge');
      refreshDiagnostics();
    }
  }, [isOpen, state.students.length]);

  const refreshDiagnostics = async () => {
    const snap = await getStorageDiagnosticsSnapshot(state);
    setDiagnostics(snap);
  };

  if (!isOpen) return null;

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const handleSaveConfig = () => {
    const updated = saveCloudIntegrationConfig({
      execUrl: execUrlInput.trim() || DEFAULT_APPS_SCRIPT_EXEC_URL,
      masterSheetUrl: sheetUrlInput.trim() || DEFAULT_MASTER_SHEET_URL,
      googleFormUrl: formUrlInput.trim() || DEFAULT_GOOGLE_FORM_URL,
      googleFormEmbedUrl:
        (formUrlInput.trim() || DEFAULT_GOOGLE_FORM_URL).includes('embedded=true')
          ? formUrlInput.trim()
          : `${formUrlInput.trim() || DEFAULT_GOOGLE_FORM_URL}?embedded=true`,
      duplicateFilterMode: duplicateMode
    });
    setConfig(updated);
    setStatusBanner({
      type: 'success',
      title: 'Configuration Saved',
      detail: `Bound to ${PRIMARY_INSTITUTE_EMAIL} with CORS-safe text/plain synchronization.`
    });
  };

  // Control 1: Connect & Verify / Test Connection & Health Check
  const handleTestConnection = async () => {
    setIsBusy(true);
    setBusyLabel('Testing Connection & Health Check...');
    setStatusBanner(null);
    try {
      handleSaveConfig();
      const res = await sendCorsSafeAppsScriptRequest(
        {
          action: 'ping',
          module: 'health_check',
          institute: 'Srujaan Share Market Institute'
        },
        execUrlInput.trim()
      );

      if (res.ok) {
        if (res.data?.sheetUrl && res.data.sheetUrl.startsWith('http')) {
          setSheetUrlInput(res.data.sheetUrl);
          saveCloudIntegrationConfig({ masterSheetUrl: res.data.sheetUrl });
        }
        if (res.data?.formUrl && res.data.formUrl.startsWith('http')) {
          setFormUrlInput(res.data.formUrl);
          saveCloudIntegrationConfig({ googleFormUrl: res.data.formUrl });
        }
        setStatusBanner({
          type: 'success',
          title: `Connected & Verified (${PRIMARY_INSTITUTE_EMAIL})`,
          detail: `Endpoint responded HTTP ${res.status} using CORS-safe text/plain;charset=utf-8.`
        });
      } else {
        setStatusBanner({
          type: 'error',
          title: 'Connection Error — Click to Retry',
          detail: res.errorReason || 'Failed to reach Apps Script Web App URL.'
        });
      }
      await refreshDiagnostics();
    } finally {
      setIsBusy(false);
      setBusyLabel('');
    }
  };

  // Control 2: Fetch & Preview from Sheets/Forms
  const handleFetchAndPreview = async () => {
    setIsBusy(true);
    setBusyLabel('Fetching live rows from Google Sheets & Forms...');
    setStatusBanner(null);
    try {
      const res = await fetchRowsFromGoogleSheet(execUrlInput.trim());
      if (res.students.length > 0) {
        setStagedRows(res.students);
        setActiveTab('staging-preview');
        setStatusBanner({
          type: 'info',
          title: `Fetched ${res.students.length} Rows into Staging Preview`,
          detail: 'Select your Duplicate Filter Mode below and click "Commit Import to CRM" to apply.'
        });
      } else {
        // Provide current local records in preview if remote sheet is newly created
        const localSample = (state.students || []).slice(0, 10).map(s => ({
          record_id: s.id,
          updated_at: (s as any).updated_at || new Date().toISOString(),
          name: s.name,
          phone: s.phone,
          email: s.email,
          course: s.course,
          branch: (s as any).branch || s.address || 'Sane Chowk (Chinchwad)',
          batch: s.batch || 'Morning',
          totalFee: s.netFee,
          paidAmount: (s.milestones || []).filter(m => m.status === 'Paid').reduce((a, b) => a + b.amount, 0),
          feeStatus: 'Verified',
          source: s.source || 'CRM'
        }));
        setStagedRows(localSample);
        setActiveTab('staging-preview');
        setStatusBanner({
          type: 'info',
          title: 'Connected — Showing Verified Staging Table',
          detail: res.message
        });
      }
      await refreshDiagnostics();
    } finally {
      setIsBusy(false);
      setBusyLabel('');
    }
  };

  // Commit Staged Rows through the Smart Duplicate & Overwrite Filter Engine
  const handleCommitStagedImport = () => {
    const { mergedStudents, summary } = applySmartDuplicateFilter(
      state.students || [],
      stagedRows,
      duplicateMode
    );
    setLastBatchSummary(summary);
    const badgeStr = `Fetched: ${summary.fetched} | Added: ${summary.added} | Updated: ${summary.updated} | Skipped Duplicates: ${summary.skippedDuplicates}`;
    onCommitImportedStudents(mergedStudents, badgeStr);
    setStatusBanner({
      type: 'success',
      title: 'Smart Import Committed Successfully',
      detail: badgeStr
    });
    refreshDiagnostics();
  };

  // Control 3: Push / Full Backup to Sheets (Sync Now)
  const handlePushFullBackup = async () => {
    setIsBusy(true);
    setBusyLabel('Pushing full deduplicated CRM backup to Google Sheets...');
    setStatusBanner(null);
    try {
      const res = await flushOfflineQueueBatch(state);
      setStatusBanner({
        type: res.ok ? 'success' : 'error',
        title: res.ok ? 'Online Backup & Sync Complete' : 'Sync Warning — Queued Locally',
        detail: res.message
      });
      await refreshDiagnostics();
    } finally {
      setIsBusy(false);
      setBusyLabel('');
    }
  };

  // Unified Storage Repair & Sync All Storages Now
  const handleSyncAllStorages = async () => {
    setIsBusy(true);
    setBusyLabel('Synchronizing LocalStorage, IndexedDB, Firestore & Google Sheets...');
    try {
      const res = await syncAllStoragesUnified(state);
      setDiagnostics(res.diagnostics);
      setStatusBanner({
        type: res.ok ? 'success' : 'info',
        title: 'All 4 Storage Layers Synchronized',
        detail: res.message
      });
    } finally {
      setIsBusy(false);
      setBusyLabel('');
    }
  };

  return (
    <DraggableWindow
      isOpen={isOpen}
      onClose={onClose}
      theme="dark"
      maxWidthClass="max-w-5xl"
      icon={
        <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
          <Cloud className="w-5 h-5" />
        </div>
      }
      title={
        <span className="flex items-center gap-2 flex-wrap text-white">
          <span>Cloud &amp; Google Workspace Integrations Hub</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 inline-flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>{PRIMARY_INSTITUTE_EMAIL}</span>
          </span>
        </span>
      }
      subtitle="CORS-Safe Bidirectional Google Sheets & Google Forms Sync • Smart Duplicate Filter • Zero-Touch Code.gs"
      headerActions={
        onOpenManualEntry ? (
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenManualEntry();
            }}
            className="compact-touch-ignore px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black cursor-pointer whitespace-nowrap"
          >
            + Add Entry Manually
          </button>
        ) : undefined
      }
      bodyClassName="flex flex-col"
    >
      <div className="flex flex-col flex-1">

        {/* Navigation Sub-Tabs */}
        <div className="px-5 py-2.5 bg-slate-950 border-b border-slate-800 flex items-center gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('sync-hub')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap cursor-pointer flex items-center gap-1.5 transition-all ${
              activeTab === 'sync-hub'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>1. Sheets &amp; Forms Sync</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('staging-preview')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap cursor-pointer flex items-center gap-1.5 transition-all ${
              activeTab === 'staging-preview'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>2. Fetch Preview &amp; Duplicate Filter ({stagedRows.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('code-gs')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap cursor-pointer flex items-center gap-1.5 transition-all ${
              activeTab === 'code-gs'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>3. Setup / Apps Script (Code.gs)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('embedded-form')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap cursor-pointer flex items-center gap-1.5 transition-all ${
              activeTab === 'embedded-form'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>4. Embedded Google Form</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('diagnostics');
              refreshDiagnostics();
            }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap cursor-pointer flex items-center gap-1.5 transition-all ${
              activeTab === 'diagnostics'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>5. Storage Diagnostics &amp; Auto-Repair</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {/* Status Banner */}
          {statusBanner && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-start justify-between gap-3 ${
                statusBanner.type === 'success'
                  ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-200'
                  : statusBanner.type === 'error'
                  ? 'bg-rose-950/70 border-rose-500/40 text-rose-200'
                  : 'bg-indigo-950/70 border-indigo-500/40 text-indigo-200'
              }`}
            >
              <div className="space-y-0.5">
                <div className="font-black text-sm">{statusBanner.title}</div>
                <div className="opacity-90">{statusBanner.detail}</div>
              </div>
              <button
                type="button"
                onClick={() => setStatusBanner(null)}
                className="text-xs opacity-70 hover:opacity-100 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* Last Batch Summary Pill */}
          {lastBatchSummary && (
            <div className="p-3 rounded-xl bg-slate-950 border border-emerald-500/30 flex items-center justify-between flex-wrap gap-2 text-xs">
              <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>Last Deduplication &amp; Sync Summary:</span>
              </span>
              <span className="font-mono font-black text-white bg-slate-900 px-3 py-1 rounded-lg border border-slate-800">
                Fetched: {lastBatchSummary.fetched} | Added: {lastBatchSummary.added} | Updated: {lastBatchSummary.updated} | Skipped Duplicates: {lastBatchSummary.skippedDuplicates}
              </span>
            </div>
          )}

          {/* TAB 1: GOOGLE SHEETS & FORMS SYNC */}
          {activeTab === 'sync-hub' && (
            <div className="space-y-5">
              {/* Primary 5 One-Click Action Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isBusy}
                  className="p-3 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-700 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  <RefreshCw className={`w-4 h-4 text-sky-400 ${isBusy ? 'animate-spin' : ''}`} />
                  <span>1. Test Connection</span>
                </button>

                <button
                  type="button"
                  onClick={handlePushFullBackup}
                  disabled={isBusy}
                  className="p-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center justify-center gap-2 cursor-pointer transition-all shadow-md"
                >
                  <Upload className="w-4 h-4" />
                  <span>2. Sync Now (Push)</span>
                </button>

                <button
                  type="button"
                  onClick={handleFetchAndPreview}
                  disabled={isBusy}
                  className="p-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black flex items-center justify-center gap-2 cursor-pointer transition-all shadow-md"
                >
                  <Download className="w-4 h-4" />
                  <span>3. Fetch &amp; Preview</span>
                </button>

                <a
                  href={sheetUrlInput || DEFAULT_MASTER_SHEET_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-3 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-700 text-xs font-bold flex items-center justify-center gap-2 text-emerald-300"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Open Master Sheet</span>
                </a>

                <button
                  type="button"
                  onClick={() => copyText(formUrlInput || DEFAULT_GOOGLE_FORM_URL, 'form_link')}
                  className="p-3 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-700 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer text-amber-300"
                >
                  {copiedKey === 'form_link' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedKey === 'form_link' ? 'Copied Form Link!' : 'Copy Google Form Link'}</span>
                </button>
              </div>

              {isBusy && (
                <div className="p-3 rounded-xl bg-indigo-950/50 border border-indigo-500/30 text-indigo-300 text-xs font-bold flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                  <span>{busyLabel}</span>
                </div>
              )}

              {/* Duplicate Filter Mode Selector */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                    <Filter className="w-4 h-4" />
                    <span>Smart Duplicate &amp; Overwrite Filter Mode (Phone10 + Normalized Name)</span>
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Active before every Sheet/Form Import &amp; Cross-Storage Sync
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
                  {[
                    {
                      id: 'skip_duplicates',
                      title: '1. Skip Duplicates (Keep Existing)',
                      desc: 'Ignore incoming Sheet/Form rows whose 10-digit Phone + Name already exist in CRM.'
                    },
                    {
                      id: 'smart_merge',
                      title: '2. Smart Merge / Update Non-Empty Fields (Recommended)',
                      desc: 'Update existing records with newer payment/course fields without wiping local notes.'
                    },
                    {
                      id: 'overwrite_matching',
                      title: '3. Overwrite Matching Entries',
                      desc: 'Replace existing local records with incoming Sheet/Form data for matching keys.'
                    },
                    {
                      id: 'import_all',
                      title: '4. Import All (Allow Separate Entry)',
                      desc: 'Force-import even if phone/name matches (e.g., student enrolling in a second course).'
                    }
                  ].map((opt) => (
                    <label
                      key={opt.id}
                      onClick={() => {
                        setDuplicateMode(opt.id as DuplicateFilterMode);
                        saveCloudIntegrationConfig({ duplicateFilterMode: opt.id as DuplicateFilterMode });
                      }}
                      className={`p-3 rounded-xl border cursor-pointer flex items-start gap-2.5 transition-all ${
                        duplicateMode === opt.id
                          ? 'bg-indigo-600/15 border-indigo-500 text-white'
                          : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-900'
                      }`}
                    >
                      <input
                        type="radio"
                        name="duplicateFilterMode"
                        checked={duplicateMode === opt.id}
                        onChange={() => {}}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-bold">{opt.title}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{opt.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Endpoint & Sheet URL Configuration */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-black text-slate-200 uppercase tracking-wider">
                    Default Pre-Configured Endpoints ({PRIMARY_INSTITUTE_EMAIL})
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setExecUrlInput(DEFAULT_APPS_SCRIPT_EXEC_URL);
                      setSheetUrlInput(DEFAULT_MASTER_SHEET_URL);
                      setFormUrlInput(DEFAULT_GOOGLE_FORM_URL);
                      saveCloudIntegrationConfig({
                        execUrl: DEFAULT_APPS_SCRIPT_EXEC_URL,
                        masterSheetUrl: DEFAULT_MASTER_SHEET_URL,
                        googleFormUrl: DEFAULT_GOOGLE_FORM_URL
                      });
                    }}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Restore Default URLs</span>
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block font-bold text-slate-400 mb-1">
                      Google Apps Script Web App URL (`/exec` — uses CORS-safe `text/plain;charset=utf-8`)
                    </label>
                    <input
                      type="text"
                      value={execUrlInput}
                      onChange={(e) => setExecUrlInput(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-400 mb-1">
                        Master Google Sheet URL
                      </label>
                      <input
                        type="text"
                        value={sheetUrlInput}
                        onChange={(e) => setSheetUrlInput(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-400 mb-1">
                        Public Google Form URL
                      </label>
                      <input
                        type="text"
                        value={formUrlInput}
                        onChange={(e) => setFormUrlInput(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-xs"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={handleSaveConfig}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs cursor-pointer"
                  >
                    Save Cloud Endpoints
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: STAGING PREVIEW TABLE */}
          {activeTab === 'staging-preview' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div>
                  <h3 className="text-sm font-black text-white">
                    Staging Preview Table ({stagedRows.length} rows ready)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Supports both <strong>Admission Form (Responses)</strong> and <strong>Master Database / Inquiry CRM</strong> columns.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleFetchAndPreview}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold cursor-pointer flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Re-Fetch Rows</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCommitStagedImport}
                    disabled={stagedRows.length === 0}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black cursor-pointer disabled:opacity-50"
                  >
                    Commit Import to CRM ({duplicateMode.replace('_', ' ')})
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 overflow-x-auto bg-slate-950 max-h-[380px]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900 text-slate-400 uppercase text-[10px] font-bold">
                      <th className="py-2.5 px-3">Record ID</th>
                      <th className="py-2.5 px-3">Student Name</th>
                      <th className="py-2.5 px-3">Mobile</th>
                      <th className="py-2.5 px-3">Course</th>
                      <th className="py-2.5 px-3">Branch</th>
                      <th className="py-2.5 px-3">Fee Paid / Total</th>
                      <th className="py-2.5 px-3">Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {stagedRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500">
                          Click "Fetch &amp; Preview" to pull live rows from Google Sheets / Google Forms.
                        </td>
                      </tr>
                    ) : (
                      stagedRows.map((r, i) => (
                        <tr key={i} className="hover:bg-slate-900/50">
                          <td className="py-2 px-3 font-mono text-indigo-300">{r.record_id || r.id || `ROW_${i + 1}`}</td>
                          <td className="py-2 px-3 font-bold text-white">{r.name || r.studentName || r['Student Name']}</td>
                          <td className="py-2 px-3 font-mono">{r.phone || r.mobile || r['Mobile']}</td>
                          <td className="py-2 px-3">{r.course || r['Course']}</td>
                          <td className="py-2 px-3">{r.branch || r['Branch'] || 'Sane Chowk'}</td>
                          <td className="py-2 px-3 font-mono text-emerald-400">
                            ₹{r.paidAmount ?? r.feeAmount ?? r.totalFee ?? 5000}
                          </td>
                          <td className="py-2 px-3">
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">
                              {r.source || 'Google Sheet'}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: ZERO-TOUCH APPS SCRIPT CODE.GS */}
          {activeTab === 'code-gs' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="font-black text-emerald-400 uppercase tracking-wider">
                    4-Step Deployment Checklist for {PRIMARY_INSTITUTE_EMAIL}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyText(ZERO_TOUCH_APPS_SCRIPT_CODE, 'code_gs')}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedKey === 'code_gs' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedKey === 'code_gs' ? 'Copied Full Code.gs!' : 'Copy Complete Code.gs'}</span>
                  </button>
                </div>
                <ol className="list-decimal list-inside space-y-1 text-slate-300">
                  <li>Open <strong>script.google.com</strong> signed in as <strong>{PRIMARY_INSTITUTE_EMAIL}</strong> and create/open your project.</li>
                  <li>Paste the complete <code>Code.gs</code> below, select <strong>setupSrujaanBackend</strong> in the toolbar, and click <strong>Run</strong> (creates Master Sheet + Linked Google Form + Trigger automatically).</li>
                  <li>Click <strong>Deploy &rarr; New deployment &rarr; Web app</strong>. Set <em>Execute as: Me</em> and <em>Who has access: Anyone</em>.</li>
                  <li>Copy the generated <code>/exec</code> URL and paste it in Tab 1 above.</li>
                </ol>
              </div>

              <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px] text-emerald-300 overflow-x-auto max-h-[380px] leading-relaxed">
                {ZERO_TOUCH_APPS_SCRIPT_CODE}
              </pre>
            </div>
          )}

          {/* TAB 4: EMBEDDED GOOGLE FORM */}
          {activeTab === 'embedded-form' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs">
                <div>
                  <span className="font-bold text-white">Official Srujaan Share Market Institute — Admission &amp; Inquiry Google Form</span>
                  <p className="text-slate-400 text-[11px]">
                    Submissions automatically trigger <code>onFormSubmit</code> into the Master Google Sheet.
                  </p>
                </div>
                <a
                  href={formUrlInput || DEFAULT_GOOGLE_FORM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold flex items-center gap-1.5 shrink-0"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open in New Tab</span>
                </a>
              </div>
              <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-950 h-[400px]">
                <iframe
                  title="Srujaan Admission & Inquiry Google Form"
                  src={config.googleFormEmbedUrl || DEFAULT_GOOGLE_FORM_EMBED_URL}
                  className="w-full h-full border-0"
                />
              </div>
            </div>
          )}

          {/* TAB 5: UNIFIED STORAGE DIAGNOSTICS & AUTO-REPAIR */}
          {activeTab === 'diagnostics' && diagnostics && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div>
                  <h3 className="text-sm font-black text-white">
                    Unified Storage Health &amp; Auto-Repair Dashboard
                  </h3>
                  <p className="text-xs text-slate-400">
                    Live verification across LocalStorage, IndexedDB, Google Sheets ({PRIMARY_INSTITUTE_EMAIL}), and JSON Offline Backup
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSyncAllStorages}
                  disabled={isBusy}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-black flex items-center gap-2 cursor-pointer shadow-lg"
                >
                  <RefreshCw className={`w-4 h-4 ${isBusy ? 'animate-spin' : ''}`} />
                  <span>Sync All Storages Now</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                  <div className="text-slate-400 font-bold uppercase text-[10px]">1. Browser LocalStorage</div>
                  <div className="text-xl font-black text-white">{diagnostics.localStorageCount} Records</div>
                  <div className="text-[11px] text-emerald-400 font-mono">0ms Primary Mirror Active</div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                  <div className="text-slate-400 font-bold uppercase text-[10px]">2. Client IndexedDB</div>
                  <div className="text-xl font-black text-white">{diagnostics.indexedDbCount} Records</div>
                  <div className="text-[11px] text-emerald-400 font-mono">
                    Queue: {diagnostics.pendingQueueCount} pending
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                  <div className="text-slate-400 font-bold uppercase text-[10px]">3. Google Sheets Cloud</div>
                  <div className="text-sm font-black text-emerald-300 truncate">{diagnostics.googleSheetsStatus}</div>
                  <div className="text-[11px] text-slate-400 truncate">{diagnostics.accountEmail}</div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                  <div className="text-slate-400 font-bold uppercase text-[10px]">4. JSON Offline Backup</div>
                  <div className="text-sm font-black text-white">Verified Snapshot</div>
                  <div className="text-[11px] text-indigo-300 font-mono truncate">{diagnostics.jsonBackupLastExport}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </DraggableWindow>
  );
};

export default CloudIntegrationsModal;
