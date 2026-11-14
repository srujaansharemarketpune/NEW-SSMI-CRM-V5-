import React, { useState, useEffect } from 'react';
import { AppState } from '../types';
import {
  FileSpreadsheet,
  ExternalLink,
  Copy,
  Check,
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileDown,
  LogIn,
  Info,
  RotateCcw,
  RefreshCw
} from 'lucide-react';
import { auth, signInWithGoogle, getAccessToken, formatFirebaseAuthError } from '../services/firebase';
import { syncAllToGoogleSheets, createGoogleSpreadsheet } from '../services/googleWorkspace';
import { exportMasterExcelFile } from '../services/db';
import {
  DEFAULT_APPS_SCRIPT_EXEC_URL,
  DEFAULT_APPS_SCRIPT_LIBRARY_ID,
  DEFAULT_APPS_SCRIPT_LIBRARY_URL,
  getGoogleSheetWebhookUrl,
  getGoogleSheetEndpointMode,
  getCustomGoogleSheetWebhookUrl,
  saveGoogleSheetWebhookUrl,
  resetGoogleSheetWebhookToDefault,
  testGoogleSheetWebhookConnection,
  postToAppsScriptEndpoint
} from '../services/storageService';
import { DraggableWindow } from './DraggableWindow';

interface GoogleSheetsExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: AppState;
  onSuccessNotice?: (msg: string) => void;
}

export const GoogleSheetsExportModal: React.FC<GoogleSheetsExportModalProps> = ({
  isOpen,
  onClose,
  state,
  onSuccessNotice
}) => {
  const [currentUser, setCurrentUser] = useState<any>(auth.currentUser);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [exportMode, setExportMode] = useState<'new' | 'existing'>('new');
  const [spreadsheetTitle, setSpreadsheetTitle] = useState(
    `Srujaan Institute — Students & Leads Export (${new Date().toLocaleDateString('en-IN')})`
  );
  const [existingSheetId, setExistingSheetId] = useState(state.settings.googleSheetId || '');
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgressText, setExportProgressText] = useState('');
  const [exportedResult, setExportedResult] = useState<{
    spreadsheetId: string;
    spreadsheetUrl: string;
    studentsCount: number;
    leadsCount: number;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Apps Script Web App Endpoint Preset State
  const [endpointMode, setEndpointMode] = useState<'default' | 'custom'>(() =>
    getGoogleSheetEndpointMode()
  );
  const [customWebhookUrl, setCustomWebhookUrl] = useState<string>(() =>
    getCustomGoogleSheetWebhookUrl()
  );
  const [isTestingEndpoint, setIsTestingEndpoint] = useState(false);
  const [endpointStatusNotice, setEndpointStatusNotice] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [showLibraryInfo, setShowLibraryInfo] = useState(false);
  const [copiedLibraryId, setCopiedLibraryId] = useState(false);

  useEffect(() => {
    let unsub = () => {};
    try {
      unsub = auth.onAuthStateChanged(
        async (u) => {
          setCurrentUser(u);
          const token = await getAccessToken();
          setAccessToken(token);
        },
        (err) => {
          console.warn('[GoogleSheetsExportModal Auth Notice]:', err);
        }
      );
    } catch {
      unsub = () => {};
    }
    return () => {
      try {
        unsub();
      } catch {
        // ignore
      }
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      setEndpointMode(getGoogleSheetEndpointMode());
      setCustomWebhookUrl(getCustomGoogleSheetWebhookUrl());
      setEndpointStatusNotice(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectEndpointPreset = (mode: 'default' | 'custom') => {
    setEndpointMode(mode);
    setEndpointStatusNotice(null);
    if (mode === 'default') {
      saveGoogleSheetWebhookUrl(DEFAULT_APPS_SCRIPT_EXEC_URL, 'default');
      setEndpointStatusNotice({
        ok: true,
        text: '✓ Active endpoint set to Default Production Apps Script URL.'
      });
    } else if (customWebhookUrl.trim()) {
      saveGoogleSheetWebhookUrl(customWebhookUrl.trim(), 'custom');
    }
  };

  const handleResetToDefault = () => {
    resetGoogleSheetWebhookToDefault();
    setEndpointMode('default');
    setCustomWebhookUrl('');
    setEndpointStatusNotice({
      ok: true,
      text: '✓ Cleared custom overrides & restored Default Production Endpoint!'
    });
    if (onSuccessNotice) {
      onSuccessNotice('Reset Google Sheets synchronization endpoint to default');
    }
  };

  const handleSaveAndTestEndpoint = async () => {
    const urlToUse =
      endpointMode === 'default'
        ? DEFAULT_APPS_SCRIPT_EXEC_URL
        : customWebhookUrl.trim();

    if (endpointMode === 'custom' && !urlToUse) {
      setEndpointStatusNotice({
        ok: false,
        text: 'Please enter a valid Custom Apps Script Web App URL or select Default Production Endpoint.'
      });
      return;
    }

    setIsTestingEndpoint(true);
    setEndpointStatusNotice(null);
    try {
      const res = await testGoogleSheetWebhookConnection(urlToUse, endpointMode);
      setEndpointStatusNotice({
        ok: res.success,
        text: res.message
      });
      if (res.success && onSuccessNotice) {
        onSuccessNotice('Saved & verified Google Apps Script Web App connection!');
      }
    } catch (err: any) {
      setEndpointStatusNotice({
        ok: false,
        text: err?.message || 'Connection test warning.'
      });
    } finally {
      setIsTestingEndpoint(false);
    }
  };

  const handleSignIn = async () => {
    setIsSigningIn(true);
    setErrorMsg(null);
    try {
      const res = await signInWithGoogle();
      setCurrentUser(res.user);
      setAccessToken(res.accessToken);
    } catch (err: any) {
      setErrorMsg(formatFirebaseAuthError(err).message);
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleExecuteExport = async () => {
    setErrorMsg(null);
    setExportedResult(null);
    setIsExporting(true);

    try {
      // 1. Always stream live synchronization payload to active Apps Script Web App endpoint (/exec)
      const activeExecUrl =
        endpointMode === 'default'
          ? DEFAULT_APPS_SCRIPT_EXEC_URL
          : customWebhookUrl.trim() || getGoogleSheetWebhookUrl();

      setExportProgressText('Streaming students, batches, attendance & fee ledger to Apps Script endpoint...');
      const feeLedger = state.students.flatMap(s =>
        (s.milestones || []).map(m => ({
          studentId: s.regId || s.id,
          studentName: s.name,
          batch: s.batch || '',
          milestone: m.name,
          amount: m.amount,
          dueDate: m.dueDate,
          status: m.status,
          paymentDate: m.paymentDate || ''
        }))
      );

      const scriptStreamRes = await postToAppsScriptEndpoint(
        {
          action: 'bulk_sync',
          module: 'full_sync',
          institute: state.settings.instituteName,
          students: state.students,
          leads: state.leads,
          batches: state.batches,
          attendance: state.attendance,
          feeLedger,
          records: state.students.map(s => {
            const paid = (s.milestones || [])
              .filter(m => m.status === 'Paid')
              .reduce((sum, m) => sum + m.amount, 0);
            return {
              type: 'Student',
              id: s.regId || s.id,
              name: s.name,
              phone: s.phone || s.whatsapp || '',
              course: s.course,
              batch: s.batch || '',
              netFee: s.netFee,
              paid,
              feeStatus: paid >= s.netFee ? 'Paid' : paid > 0 ? 'Partial' : 'Pending',
              status: s.status
            };
          })
        },
        activeExecUrl
      );

      // 2. If OAuth accessToken is present, also sync to Drive Spreadsheet via REST API
      let token = accessToken;
      if (token) {
        let targetId = '';
        if (exportMode === 'existing' && existingSheetId.trim()) {
          targetId = existingSheetId.trim();
        } else {
          setExportProgressText('Creating dedicated Google Spreadsheet in your Drive...');
          targetId = await createGoogleSpreadsheet(spreadsheetTitle, token);
        }
        setExportProgressText(`Formatting & exporting ${state.students.length} Students & ${state.leads.length} Leads...`);
        const result = await syncAllToGoogleSheets(targetId, state, token);
        setExportedResult(result);
      } else if (scriptStreamRes.success) {
        setExportedResult({
          spreadsheetId: DEFAULT_APPS_SCRIPT_LIBRARY_ID,
          spreadsheetUrl: activeExecUrl,
          studentsCount: state.students.length,
          leadsCount: state.leads.length
        });
      }

      if (onSuccessNotice) {
        onSuccessNotice(
          `Synchronized ${state.students.length} students, ${state.batches.length} batches & ${state.leads.length} leads with Google Sheets!`
        );
      }
    } catch (err: any) {
      console.error('Google Sheets export error:', err);
      setErrorMsg(err.message || 'Export to Google Sheets failed.');
    } finally {
      setIsExporting(false);
      setExportProgressText('');
    }
  };

  const handleCopyLink = () => {
    if (!exportedResult) return;
    navigator.clipboard.writeText(exportedResult.spreadsheetUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  return (
    <DraggableWindow
      isOpen={isOpen}
      onClose={onClose}
      maxWidthClass="max-w-xl"
      icon={
        <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shadow-xs shrink-0">
          <FileSpreadsheet className="w-5 h-5" />
        </div>
      }
      title="Export & Sync to Google Sheets"
      subtitle="Live Apps Script Web App synchronization & Google Drive Sheet export"
      bodyClassName="p-4 sm:p-6 space-y-4"
      footer={
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              exportMasterExcelFile(state);
              if (onSuccessNotice) onSuccessNotice('Downloaded offline Master Excel (.xlsx) file!');
            }}
            className="min-h-[44px] sm:min-h-0 px-3 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            title="Download offline Excel backup"
          >
            <FileDown className="w-3.5 h-3.5 text-slate-500" />
            <span>Download Excel Backup</span>
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] sm:min-h-0 px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleExecuteExport}
              disabled={isExporting}
              className="flex-1 sm:flex-none min-h-[44px] sm:min-h-0 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-extrabold flex items-center justify-center gap-2 shadow-sm shadow-emerald-600/20 transition-all cursor-pointer"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{exportProgressText || 'Exporting...'}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Export to Google Sheet</span>
                </>
              )}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
          {/* Apps Script Web App Synchronization Endpoint Section */}
          <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                <span>Apps Script Web App Endpoint</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Auto-Sync Active
                </span>
              </div>

              <div className="relative flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-slate-500">Library ID:</span>
                <code className="font-mono text-[10px] font-bold text-indigo-700 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                  {DEFAULT_APPS_SCRIPT_LIBRARY_ID.slice(0, 12)}...
                </code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(DEFAULT_APPS_SCRIPT_LIBRARY_ID);
                    setCopiedLibraryId(true);
                    setTimeout(() => setCopiedLibraryId(false), 2000);
                  }}
                  className="p-1 rounded hover:bg-white text-slate-600 cursor-pointer"
                  title="Copy Library ID"
                >
                  {copiedLibraryId ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                </button>
                <button
                  type="button"
                  onClick={() => setShowLibraryInfo(prev => !prev)}
                  className="p-1 rounded hover:bg-white text-indigo-600 cursor-pointer"
                  title="Apps Script Library Info"
                >
                  <Info className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {showLibraryInfo && (
              <div className="p-3 rounded-lg bg-slate-900 text-slate-100 text-[11px] space-y-1.5 border border-slate-700">
                <div className="font-bold text-emerald-400">Default Apps Script Library Reference</div>
                <div>
                  <span className="text-slate-400">Library ID: </span>
                  <code className="font-mono text-white select-all break-all">{DEFAULT_APPS_SCRIPT_LIBRARY_ID}</code>
                </div>
                <div>
                  <span className="text-slate-400">Library URL: </span>
                  <a
                    href={DEFAULT_APPS_SCRIPT_LIBRARY_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-blue-300 hover:underline break-all"
                  >
                    {DEFAULT_APPS_SCRIPT_LIBRARY_URL}
                  </a>
                </div>
              </div>
            )}

            {/* Preset Selection: Default Production Endpoint vs Custom Endpoint */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleSelectEndpointPreset('default')}
                className={`p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                  endpointMode === 'default'
                    ? 'border-emerald-600 bg-white text-emerald-950 shadow-2xs ring-1 ring-emerald-500'
                    : 'border-slate-200 bg-white/70 text-slate-600 hover:border-slate-300'
                }`}
              >
                <div className="font-extrabold flex items-center justify-between">
                  <span>1. Default Production Endpoint</span>
                  {endpointMode === 'default' && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                </div>
                <div className="text-[10px] text-slate-500 font-mono truncate mt-0.5">
                  {DEFAULT_APPS_SCRIPT_EXEC_URL}
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectEndpointPreset('custom')}
                className={`p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                  endpointMode === 'custom'
                    ? 'border-blue-600 bg-white text-blue-950 shadow-2xs ring-1 ring-blue-500'
                    : 'border-slate-200 bg-white/70 text-slate-600 hover:border-slate-300'
                }`}
              >
                <div className="font-extrabold flex items-center justify-between">
                  <span>2. Custom Endpoint</span>
                  {endpointMode === 'custom' && <Check className="w-3.5 h-3.5 text-blue-600" />}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Paste custom Apps Script Web App URL
                </div>
              </button>
            </div>

            {/* Active / Custom Endpoint Input Box */}
            <div className="space-y-2">
              <input
                type="url"
                readOnly={endpointMode === 'default'}
                value={endpointMode === 'default' ? DEFAULT_APPS_SCRIPT_EXEC_URL : customWebhookUrl}
                onChange={(e) => setCustomWebhookUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className={`w-full px-3 py-2 rounded-lg border text-xs font-mono focus:outline-none ${
                  endpointMode === 'default'
                    ? 'bg-slate-100 border-slate-200 text-slate-600 cursor-default'
                    : 'bg-white border-blue-400 text-slate-900 focus:ring-2 focus:ring-blue-500/20'
                }`}
              />

              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handleResetToDefault}
                  className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                  <span>Reset to Default</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveAndTestEndpoint}
                  disabled={isTestingEndpoint}
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                >
                  {isTestingEndpoint ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Testing...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Save & Test Connection</span>
                    </>
                  )}
                </button>
              </div>

              {endpointStatusNotice && (
                <div
                  className={`p-2.5 rounded-lg text-[11px] font-bold border ${
                    endpointStatusNotice.ok
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}
                >
                  {endpointStatusNotice.text}
                </div>
              )}
            </div>
          </div>

          {/* Google Workspace Connection Pill */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div
                className={`w-2.5 h-2.5 rounded-full ${
                  currentUser ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                }`}
              />
              <div className="text-xs">
                {currentUser ? (
                  <div>
                    <span className="font-bold text-slate-800">
                      Connected: {currentUser.displayName || currentUser.email}
                    </span>
                    <span className="block text-[11px] text-emerald-600 font-semibold">
                      Google Workspace Authorized
                    </span>
                  </div>
                ) : (
                  <div>
                    <span className="font-semibold text-slate-700">Direct Apps Script Sync Ready</span>
                    <span className="block text-[11px] text-slate-500">
                      Optional: Sign in with Google to also create a new Sheet in Drive
                    </span>
                  </div>
                )}
              </div>
            </div>

            {!currentUser ? (
              <button
                onClick={handleSignIn}
                disabled={isSigningIn}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:border-slate-400 text-xs font-bold text-slate-700 flex items-center gap-1.5 shadow-2xs hover:bg-slate-50 transition-all cursor-pointer"
              >
                {isSigningIn ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogIn className="w-3.5 h-3.5 text-blue-600" />}
                <span>Sign In</span>
              </button>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                Ready
              </span>
            )}
          </div>

          {/* Export Mode Toggle */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Export Destination
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setExportMode('new')}
                className={`p-3 rounded-xl border text-left text-xs font-semibold transition-all cursor-pointer ${
                  exportMode === 'new'
                    ? 'border-emerald-500 bg-emerald-50/60 text-emerald-900 shadow-2xs'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                <div className="font-extrabold flex items-center justify-between">
                  <span>Create New Sheet</span>
                  {exportMode === 'new' && <Check className="w-4 h-4 text-emerald-600" />}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Syncs via Apps Script & generates Drive spreadsheet
                </div>
              </button>

              <button
                type="button"
                onClick={() => setExportMode('existing')}
                className={`p-3 rounded-xl border text-left text-xs font-semibold transition-all cursor-pointer ${
                  exportMode === 'existing'
                    ? 'border-emerald-500 bg-emerald-50/60 text-emerald-900 shadow-2xs'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                <div className="font-extrabold flex items-center justify-between">
                  <span>Update Existing Sheet</span>
                  {exportMode === 'existing' && <Check className="w-4 h-4 text-emerald-600" />}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Paste existing Spreadsheet ID or URL
                </div>
              </button>
            </div>
          </div>

          {/* Form inputs based on mode */}
          {exportMode === 'new' ? (
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                Spreadsheet Title
              </label>
              <input
                type="text"
                value={spreadsheetTitle}
                onChange={(e) => setSpreadsheetTitle(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 text-xs font-medium focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                placeholder="Spreadsheet name..."
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                Google Spreadsheet ID or URL
              </label>
              <input
                type="text"
                value={existingSheetId}
                onChange={(e) => setExistingSheetId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 text-xs font-mono-code focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                placeholder="e.g. 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms or https://docs.google.com/..."
              />
            </div>
          )}

          {/* Data Summary Chips */}
          <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-600 space-y-1.5">
            <div className="font-bold text-slate-800 text-[11px] uppercase tracking-wider">
              Data Payload Summary
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="px-2.5 py-1 rounded-md bg-white border border-slate-200 font-medium text-slate-700">
                🧑‍🎓 <strong className="text-slate-900">{state.students.length}</strong> Students (16 columns)
              </span>
              <span className="px-2.5 py-1 rounded-md bg-white border border-slate-200 font-medium text-slate-700">
                🎯 <strong className="text-slate-900">{state.leads.length}</strong> Leads (13 columns)
              </span>
              <span className="px-2.5 py-1 rounded-md bg-white border border-slate-200 font-medium text-slate-700">
                💰 Financial & Balance Records Included
              </span>
            </div>
          </div>

          {/* Error Notice */}
          {errorMsg && (
            <div className="p-3.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Export Notice</p>
                <p className="text-[11px] text-rose-700 mt-0.5">{errorMsg}</p>
              </div>
            </div>
          )}

          {/* Success Card with Live Link */}
          {exportedResult && (
            <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/80 text-emerald-900 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <h4 className="text-sm font-extrabold text-emerald-950">
                    Export Succeeded!
                  </h4>
                  <p className="text-xs text-emerald-800">
                    Synced {exportedResult.studentsCount} Students and {exportedResult.leadsCount} Leads to Google Sheets.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <a
                  href={exportedResult.spreadsheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-2 shadow-sm transition-all"
                >
                  <span>Open in Google Sheets</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>

                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="px-3 py-2 rounded-xl bg-white border border-emerald-300 hover:bg-emerald-50 text-emerald-800 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedLink ? 'Link Copied!' : 'Copy Link'}</span>
                </button>
              </div>
            </div>
          )}
      </div>
    </DraggableWindow>
  );
};
