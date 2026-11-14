import React, { useState, useEffect, useCallback } from 'react';
import { AppState } from '../types';
import {
  IntegrationHealthItem,
  IntegrationKey,
  PatchModuleId,
  DiagnosticLogEntry,
  HealthBadgeStatus,
  DeepSchemaScanResult,
  DeepAuditResult,
  WatchdogSnapshot,
  checkAllIntegrationsHealth,
  scanLocalCacheAnomalies,
  subscribeToWatchdog,
  getWatchdogSnapshot,
  probeEveryPatchWatchdog,
  repairFirebaseIntegration,
  repairLocalCacheIntegrity,
  repairGoogleSheetsEndpoint,
  repairGeminiAiConnection,
  repairUiAndStuckOverlays,
  executePatchModules,
  runFullSelfRepair,
  runDeepAiSystemAudit,
  simulateOfflineDisconnectAndAddLead,
  simulateCorruptStudentFeeRecord,
  simulateFirestoreListenerStall,
  exportFullDiagnosticBundle,
  rollbackToVaultRestorePoint
} from '../services/selfRepair';
import {
  savePrePatchRestorePoint,
  listRestorePoints,
  deleteRestorePoint,
  RestorePointSummary
} from '../services/everyPatchVault';
import {
  ShieldCheck,
  Wrench,
  RefreshCw,
  Database,
  HardDrive,
  FileSpreadsheet,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  WifiOff,
  Terminal,
  Layout,
  Cpu,
  History,
  FlaskConical,
  Download,
  RotateCcw,
  Trash2,
  Play,
  Activity,
  PlusCircle
} from 'lucide-react';

export interface SystemHealthPanelProps {
  state: AppState;
  onApplyRepairedState?: (nextState: AppState, reason?: string) => void;
  onDiagnosticsApplied?: () => void;
  onToast?: (msg: string) => void;
  compact?: boolean;
}

type EveryPatchTab = 'modules' | 'ai-outcomes' | 'vault' | 'simulator';

const INTEGRATION_ICONS: Record<IntegrationKey, React.FC<{ className?: string }>> = {
  firebase: Database,
  'local-cache': HardDrive,
  'google-sheets': FileSpreadsheet,
  'gemini-ai': Sparkles,
  'ui-guard': Layout
};

const MODULE_LABELS: Record<PatchModuleId, string> = {
  A_FIREBASE_SYNC: 'Module A • Firebase Sync',
  B_SCHEMA_STATE: 'Module B • Schema & State',
  C_SHEETS_CORS: 'Module C • Sheets CORS',
  D_AI_CRUD: 'Module D • AI & CRUD',
  E_UI_GUARD: 'Module E • UI Guard'
};

function getStatusBadgeClasses(status: HealthBadgeStatus): string {
  if (status === 'Connected') {
    return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  }
  if (status === 'Warning') {
    return 'bg-amber-50 text-amber-800 border-amber-300';
  }
  return 'bg-rose-50 text-rose-800 border-rose-200';
}

function getStatusDotClasses(status: HealthBadgeStatus): string {
  if (status === 'Connected') return 'bg-emerald-500';
  if (status === 'Warning') return 'bg-amber-500';
  return 'bg-rose-500';
}

function getScenarioStyles(scenarioId: string): {
  border: string;
  badge: string;
  bg: string;
} {
  if (scenarioId === 'best_case') {
    return {
      border: 'border-emerald-200',
      badge: 'bg-emerald-100 text-emerald-800',
      bg: 'bg-emerald-50/50'
    };
  }
  if (scenarioId === 'expected_nominal') {
    return {
      border: 'border-blue-200',
      badge: 'bg-blue-100 text-blue-800',
      bg: 'bg-blue-50/50'
    };
  }
  if (scenarioId === 'degraded_offline') {
    return {
      border: 'border-amber-200',
      badge: 'bg-amber-100 text-amber-800',
      bg: 'bg-amber-50/50'
    };
  }
  return {
    border: 'border-rose-200',
    badge: 'bg-rose-100 text-rose-800',
    bg: 'bg-rose-50/50'
  };
}

export const SystemHealthPanel: React.FC<SystemHealthPanelProps> = ({
  state,
  onApplyRepairedState,
  onDiagnosticsApplied,
  onToast,
  compact = false
}) => {
  const [activeTab, setActiveTab] = useState<EveryPatchTab>('modules');
  const [items, setItems] = useState<IntegrationHealthItem[]>([]);
  const [logs, setLogs] = useState<DiagnosticLogEntry[]>([]);
  const [watchdog, setWatchdog] = useState<WatchdogSnapshot>(() => getWatchdogSnapshot());
  const [schemaScan, setSchemaScan] = useState<DeepSchemaScanResult>(() => scanLocalCacheAnomalies(state));

  const [isChecking, setIsChecking] = useState(false);
  const [isRepairingAll, setIsRepairingAll] = useState(false);
  const [repairingKey, setRepairingKey] = useState<IntegrationKey | null>(null);

  // Gemini AI & 4-Outcome Matrix State
  const [symptomInput, setSymptomInput] = useState('');
  const [isRunningAudit, setIsRunningAudit] = useState(false);
  const [isExecutingScript, setIsExecutingScript] = useState(false);
  const [auditResult, setAuditResult] = useState<DeepAuditResult | null>(null);

  // IndexedDB Restore Vault State
  const [restorePoints, setRestorePoints] = useState<RestorePointSummary[]>([]);
  const [isLoadingVault, setIsLoadingVault] = useState(false);
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);

  // Simulator State
  const [busySim, setBusySim] = useState<string | null>(null);

  const appendLogs = useCallback((newEntries: DiagnosticLogEntry[]) => {
    setLogs((prev) => [...newEntries, ...prev].slice(0, 100));
  }, []);

  const refreshVault = useCallback(async () => {
    setIsLoadingVault(true);
    try {
      const list = await listRestorePoints();
      setRestorePoints(list);
    } finally {
      setIsLoadingVault(false);
    }
  }, []);

  const refreshHealth = useCallback(
    async (liveNetworkProbe = false) => {
      setIsChecking(true);
      try {
        const res = await checkAllIntegrationsHealth(state, { liveNetworkProbe });
        setItems(res.items);
        setSchemaScan(scanLocalCacheAnomalies(state));
        if (liveNetworkProbe) {
          await probeEveryPatchWatchdog({
            probeFirestore: true,
            probeSheets: true,
            probeGemini: true
          }).catch(() => {});
          appendLogs(res.logs);
        }
      } finally {
        setIsChecking(false);
      }
    },
    [state, appendLogs]
  );

  useEffect(() => {
    const unsub = subscribeToWatchdog((snap) => setWatchdog(snap));
    return () => unsub();
  }, []);

  useEffect(() => {
    refreshHealth(false);
    refreshVault();
  }, [state.students.length, state.leads.length, state.lastSavedAt]);

  const applyNewState = (nextState: AppState, reason: string) => {
    if (onApplyRepairedState) {
      onApplyRepairedState(nextState, reason);
    } else if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('ssm-force-state-reload', {
          detail: { state: nextState }
        })
      );
    }
  };

  const handleFullSelfRepair = async () => {
    if (isRepairingAll || repairingKey) return;
    setIsRepairingAll(true);
    try {
      const res = await runFullSelfRepair(state);
      setItems(res.items);
      appendLogs(res.logs);
      applyNewState(res.repairedState, 'EveryPatch Full Self-Repair (Modules A–E)');
      setSchemaScan(scanLocalCacheAnomalies(res.repairedState));
      await refreshVault();
      onDiagnosticsApplied?.();
      onToast?.('✓ EveryPatch Full Auto-Heal completed cleanly.');
    } finally {
      setIsRepairingAll(false);
    }
  };

  const handleRepairSingle = async (key: IntegrationKey) => {
    if (isRepairingAll || repairingKey) return;
    setRepairingKey(key);
    try {
      let actionLogs: DiagnosticLogEntry[] = [];
      let repairedState = state;

      if (key === 'firebase') {
        const res = await repairFirebaseIntegration(state);
        actionLogs = res.logs;
        if (res.reconciledState) {
          repairedState = res.reconciledState;
          applyNewState(repairedState, 'EveryPatch Module A (Firebase Sync Repair)');
        }
      } else if (key === 'local-cache') {
        const res = await repairLocalCacheIntegrity(state);
        repairedState = res.repairedState;
        actionLogs = res.logs;
        applyNewState(repairedState, 'EveryPatch Module B (Schema & Duplicate Repair)');
      } else if (key === 'google-sheets') {
        const res = await repairGoogleSheetsEndpoint(state);
        actionLogs = res.logs;
      } else if (key === 'gemini-ai') {
        const res = await repairGeminiAiConnection();
        actionLogs = res.logs;
      } else if (key === 'ui-guard') {
        const res = repairUiAndStuckOverlays();
        actionLogs = res.logs;
      }

      const healthRes = await checkAllIntegrationsHealth(repairedState, { liveNetworkProbe: true });
      setItems(healthRes.items);
      setSchemaScan(scanLocalCacheAnomalies(repairedState));
      appendLogs(actionLogs);
      await refreshVault();
      onDiagnosticsApplied?.();
      onToast?.(`✓ Executed repair for ${key}.`);
    } finally {
      setRepairingKey(null);
    }
  };

  const handleRunDeepAudit = async () => {
    if (isRunningAudit) return;
    setIsRunningAudit(true);
    try {
      const res = await runDeepAiSystemAudit(state, symptomInput);
      setAuditResult(res);
      appendLogs([
        {
          id: `audit_${Date.now()}`,
          timestamp: new Date().toLocaleTimeString('en-IN', { hour12: false }),
          area: 'system',
          level: res.severity === 'healthy' ? 'fixed' : 'warn',
          message: `[${res.source === 'gemini' ? 'Gemini Deep Audit' : 'Offline Heuristic'}] ${res.diagnosis}`
        }
      ]);
      onToast?.(
        res.source === 'gemini'
          ? '✓ Gemini AI Deep System Audit & 4-Outcome Matrix ready.'
          : '✓ Offline Heuristic 4-Outcome Matrix computed.'
      );
    } finally {
      setIsRunningAudit(false);
    }
  };

  const handleExecuteAuditScript = async () => {
    if (!auditResult || isExecutingScript) return;
    setIsExecutingScript(true);
    try {
      const res = await executePatchModules(state, auditResult.patchScript.targetModules);
      setItems(res.items);
      appendLogs(res.logs);
      applyNewState(res.repairedState, `Executed ${auditResult.patchScript.title}`);
      setSchemaScan(scanLocalCacheAnomalies(res.repairedState));
      await refreshVault();
      onDiagnosticsApplied?.();
      onToast?.('✓ Executed recommended EveryPatch remediation script.');
    } finally {
      setIsExecutingScript(false);
    }
  };

  const handleCreateManualSnapshot = async () => {
    const rp = await savePrePatchRestorePoint(
      state,
      `Manual Vault Checkpoint (${state.students.length} Students, ${state.leads.length} Leads)`,
      'manual'
    );
    await refreshVault();
    appendLogs([
      {
        id: `rp_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('en-IN', { hour12: false }),
        area: 'system',
        level: 'fixed',
        message: `Saved manual IndexedDB Restore Point (${rp.id}) with ${rp.studentsCount} students & ${rp.leadsCount} leads.`
      }
    ]);
    onToast?.('✓ IndexedDB Restore Point saved cleanly.');
  };

  const handleRollback = async (rpId: string) => {
    if (rollingBackId) return;
    setRollingBackId(rpId);
    try {
      const res = await rollbackToVaultRestorePoint(rpId, (restored) => {
        applyNewState(restored, `1-Click Rollback to Vault ${rpId}`);
        setSchemaScan(scanLocalCacheAnomalies(restored));
      });
      appendLogs([
        {
          id: `rb_${Date.now()}`,
          timestamp: new Date().toLocaleTimeString('en-IN', { hour12: false }),
          area: 'system',
          level: res.ok ? 'fixed' : 'error',
          message: res.message
        }
      ]);
      onToast?.(res.ok ? `✓ ${res.message}` : `⚠️ ${res.message}`);
      await refreshHealth(false);
      onDiagnosticsApplied?.();
    } finally {
      setRollingBackId(null);
    }
  };

  const handleDeleteRestorePoint = async (rpId: string) => {
    await deleteRestorePoint(rpId);
    await refreshVault();
    onToast?.('Deleted restore point from IndexedDB Vault.');
  };

  // Fault Simulator Handlers
  const handleSimOfflineLead = async () => {
    if (busySim) return;
    setBusySim('offline-lead');
    try {
      const res = await simulateOfflineDisconnectAndAddLead(state);
      applyNewState(res.nextState, 'Fault Simulator: Offline Lead Queued & Tested');
      appendLogs(res.logs);
      await refreshVault();
      await refreshHealth(false);
      onToast?.(
        res.flushedOnReconnect
          ? `✓ Queued lead ${res.testLeadId} & flushed cleanly on reconnect.`
          : `✓ Queued lead ${res.testLeadId} safely in IndexedDB queue (${res.queuedCount}).`
      );
    } finally {
      setBusySim(null);
    }
  };

  const handleSimCorruptFee = async () => {
    if (busySim) return;
    setBusySim('corrupt-fee');
    try {
      const res = await simulateCorruptStudentFeeRecord(state);
      applyNewState(res.corruptedState, 'Fault Simulator: Injected Corrupt Student Fee Record');
      setSchemaScan(res.scan);
      setAuditResult(res.audit);
      appendLogs(res.logs);
      await refreshVault();
      await refreshHealth(false);
      onToast?.(
        `⚠️ Injected corrupt test fee record (${res.scan.totalSchemaIssues} issues detected). Run Module B or Rollback!`
      );
    } finally {
      setBusySim(null);
    }
  };

  const handleSimListenerStall = async () => {
    if (busySim) return;
    setBusySim('listener-stall');
    try {
      const res = await simulateFirestoreListenerStall();
      appendLogs(res.logs);
      await refreshHealth(true);
      onToast?.('✓ Simulated Firestore Listener Stall & auto-rebound live onSnapshot listeners.');
    } finally {
      setBusySim(null);
    }
  };

  const handleExportBundle = async () => {
    if (busySim) return;
    setBusySim('export-bundle');
    try {
      const res = await exportFullDiagnosticBundle(state, logs, auditResult);
      appendLogs([
        {
          id: `exp_${Date.now()}`,
          timestamp: new Date().toLocaleTimeString('en-IN', { hour12: false }),
          area: 'simulator',
          level: 'fixed',
          message: `Exported Full Diagnostic & Backup Bundle: ${res.filename} (${res.recordCount} records).`
        }
      ]);
      onToast?.(`✓ Exported ${res.filename}`);
    } finally {
      setBusySim(null);
    }
  };

  const connectedCount = items.filter((i) => i.status === 'Connected').length;
  const isOnlineActive = watchdog.mode === 'online_active';

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl shadow-sm overflow-hidden">
      {/* Executive Navy & Gold Header */}
      <div
        className={`bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 ${
          compact ? 'px-4 py-4' : 'px-6 py-5'
        } text-white border-b border-amber-400/25`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-400/15 text-amber-300 border border-amber-400/40">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                <span>EveryPatch Hybrid Self-Repair Engine</span>
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black border ${
                  isOnlineActive
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/40'
                    : 'bg-amber-500/15 text-amber-300 border-amber-400/40'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isOnlineActive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-ping'
                  }`}
                />
                <span>{watchdog.pillText}</span>
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white/10 text-slate-200 border border-white/15">
                {connectedCount}/{items.length || 5} Healthy
              </span>
            </div>

            <h2 className="text-base sm:text-lg font-black tracking-tight text-white">
              System Health, Automated Self-Repair &amp; 4-Outcome Simulator
            </h2>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Continuously probes Firebase Firestore, IndexedDB/LocalStorage integrity, Google Sheets CORS transport, AI Assistant CRUD, and UI overlays—with automatic IndexedDB Restore Vault checkpoints before every repair.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={isChecking || isRepairingAll}
              onClick={() => refreshHealth(true)}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-100 border border-slate-700 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-all active:scale-[0.98]"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-amber-300 ${isChecking ? 'animate-spin' : ''}`} />
              <span>{isChecking ? 'Probing...' : 'Live Health Probe'}</span>
            </button>

            <button
              type="button"
              disabled={isRepairingAll || repairingKey !== null}
              onClick={handleFullSelfRepair}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 disabled:opacity-60 text-slate-950 text-xs font-black shadow-md flex items-center gap-1.5 cursor-pointer transition-all active:scale-[0.98]"
            >
              {isRepairingAll ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Wrench className="w-4 h-4" />
              )}
              <span>
                {isRepairingAll ? 'Running Auto-Heal...' : 'Run Full Auto-Heal (A–E)'}
              </span>
            </button>
          </div>
        </div>

        {/* Live Watchdog Strip */}
        <div className="mt-4 pt-3 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
          <div className="bg-white/5 border border-white/10 rounded-xl px-3 py-2">
            <div className="text-slate-400 text-[10px] font-bold uppercase">Firestore Outbox</div>
            <div className="font-mono font-black text-white mt-0.5">
              {watchdog.pendingOutboxCount} pending • {watchdog.activeListenersCount} listeners
            </div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl px-3 py-2">
            <div className="text-slate-400 text-[10px] font-bold uppercase">Sheets IDB Queue</div>
            <div className="font-mono font-black text-white mt-0.5">
              {watchdog.pendingSheetsQueueCount} queued rows ({watchdog.sheetsStatus})
            </div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl px-3 py-2">
            <div className="text-slate-400 text-[10px] font-bold uppercase">Schema Anomalies</div>
            <div
              className={`font-mono font-black mt-0.5 ${
                schemaScan.totalSchemaIssues > 0 ? 'text-amber-300' : 'text-emerald-300'
              }`}
            >
              {schemaScan.totalSchemaIssues} detected
            </div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl px-3 py-2">
            <div className="text-slate-400 text-[10px] font-bold uppercase">UI Overlay Guard</div>
            <div
              className={`font-mono font-black mt-0.5 ${
                schemaScan.uiOverlayIssues > 0 ? 'text-rose-300' : 'text-emerald-300'
              }`}
            >
              {schemaScan.uiOverlayIssues > 0 ? `${schemaScan.uiOverlayIssues} lock(s)` : 'Clear & Responsive'}
            </div>
          </div>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="px-4 sm:px-6 pt-3 bg-slate-50 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {(
          [
            { id: 'modules' as EveryPatchTab, label: 'Patch Modules (A–E)', icon: Wrench, badge: connectedCount < items.length ? items.length - connectedCount : undefined },
            { id: 'ai-outcomes' as EveryPatchTab, label: 'Gemini AI & 4-Outcome Matrix', icon: Cpu },
            { id: 'vault' as EveryPatchTab, label: 'Restore Vault (IndexedDB)', icon: History, badge: restorePoints.length || undefined },
            { id: 'simulator' as EveryPatchTab, label: 'Fault Simulator & Bundles', icon: FlaskConical }
          ]
        ).map((tab) => {
          const TabIcon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-2.5 rounded-t-xl text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shrink-0 border-t border-x transition-colors cursor-pointer ${
                isActive
                  ? 'bg-white text-slate-900 border-slate-200 -mb-px'
                  : 'bg-transparent text-slate-600 border-transparent hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              <TabIcon className={`w-3.5 h-3.5 ${isActive ? 'text-indigo-600' : 'text-slate-500'}`} />
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-black ${
                    tab.id === 'modules'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-indigo-100 text-indigo-800'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Body */}
      <div className={compact ? 'p-4 space-y-4' : 'p-6 space-y-5'}>
        {/* TAB 1: MODULES A–E */}
        {activeTab === 'modules' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {items.map((item) => {
                const Icon = INTEGRATION_ICONS[item.key] || Activity;
                const isBusy = isRepairingAll || repairingKey === item.key;

                return (
                  <div
                    key={item.key}
                    className="p-4 rounded-xl bg-slate-50/70 border border-slate-200/90 hover:border-slate-300 transition-all flex flex-col justify-between gap-3"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-slate-900 text-amber-300 flex items-center justify-center shrink-0 border border-slate-800 shadow-2xs">
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-xs font-black text-slate-900 truncate">
                              {item.title}
                            </h3>
                            <div className="text-[10px] font-mono text-slate-500">
                              Checked: {item.lastCheckedAt}
                            </div>
                          </div>
                        </div>

                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold border shrink-0 ${getStatusBadgeClasses(
                            item.status
                          )}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${getStatusDotClasses(item.status)}`} />
                          <span>{item.status}</span>
                        </span>
                      </div>

                      <p className="text-xs font-semibold text-slate-700 leading-relaxed">
                        {item.summary}
                      </p>
                      <p className="text-[11px] font-mono text-slate-500 break-all">
                        {item.detail}
                      </p>
                    </div>

                    <div className="pt-2.5 border-t border-slate-200/80 flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                        {item.status === 'Connected' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        ) : item.status === 'Warning' ? (
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                        ) : (
                          <WifiOff className="w-3.5 h-3.5 text-rose-500" />
                        )}
                        <span>{item.status === 'Connected' ? 'Nominal' : 'Patch Ready'}</span>
                      </span>

                      <button
                        type="button"
                        disabled={isRepairingAll || repairingKey !== null}
                        onClick={() => handleRepairSingle(item.key)}
                        className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-indigo-950 disabled:opacity-50 text-white text-[11px] font-black flex items-center gap-1.5 cursor-pointer transition-all active:scale-[0.98]"
                      >
                        <Wrench className={`w-3 h-3 text-amber-300 ${isBusy ? 'animate-spin' : ''}`} />
                        <span>{isBusy ? 'Patching...' : 'Run Patch'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {schemaScan.totalSchemaIssues > 0 && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-xs text-amber-950 space-y-0.5">
                  <div className="font-black flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Schema &amp; Duplicate Anomalies Detected ({schemaScan.totalSchemaIssues})</span>
                  </div>
                  <p className="text-[11px] text-amber-800">{schemaScan.details.join(' • ')}</p>
                </div>
                <button
                  type="button"
                  disabled={isRepairingAll || repairingKey !== null}
                  onClick={() => handleRepairSingle('local-cache')}
                  className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black shrink-0 cursor-pointer"
                >
                  Patch Module B Now
                </button>
              </div>
            )}
          </>
        )}

        {/* TAB 2: GEMINI AI & 4-OUTCOME MATRIX */}
        {activeTab === 'ai-outcomes' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <span>Gemini Deep Audit &amp; &ldquo;All Possible Outcomes&rdquo; Decision Matrix</span>
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Analyzes anonymized CRM telemetry &amp; optional symptom notes via server-side Gemini (with automatic offline heuristic fallback) to generate an executable patch plan and 4 probable outcomes.
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={symptomInput}
                  onChange={(e) => setSymptomInput(e.target.value)}
                  placeholder="Optional symptom or error log (e.g. NaN fees, Firestore listener stalled, Sheets CORS timeout)..."
                  className="flex-1 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  disabled={isRunningAudit}
                  onClick={handleRunDeepAudit}
                  className="px-4 py-2 rounded-xl bg-indigo-950 hover:bg-indigo-900 disabled:opacity-50 text-white text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer shrink-0 shadow-xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${isRunningAudit ? 'animate-spin' : ''}`} />
                  <span>{isRunningAudit ? 'Analyzing...' : 'Run Deep AI System Audit'}</span>
                </button>
              </div>
            </div>

            {!auditResult ? (
              <div className="p-6 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 text-center space-y-2">
                <Cpu className="w-7 h-7 text-indigo-500 mx-auto" />
                <div className="text-xs font-black text-slate-800">
                  No 4-Outcome Audit Generated Yet
                </div>
                <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                  Click &ldquo;Run Deep AI System Audit&rdquo; above (or inject a fault in the Simulator tab) to inspect Best-Case, Expected/Nominal, Degraded/Offline Fallback, and Worst-Case Conflict scenarios before applying a patch.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Diagnosis + Executable Patch Script */}
                <div className="p-4 rounded-xl bg-slate-900 text-white border border-slate-800 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                          auditResult.severity === 'healthy'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                            : auditResult.severity === 'warning'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-400/40'
                        }`}
                      >
                        {auditResult.severity}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-indigo-500/20 text-indigo-200 border border-indigo-400/30">
                        Source: {auditResult.source === 'gemini' ? `Gemini (${auditResult.modelUsed || 'Live'})` : 'Offline Heuristic'}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        Generated: {auditResult.generatedAt}
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={isExecutingScript}
                      onClick={handleExecuteAuditScript}
                      className="px-3.5 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-950 text-xs font-black flex items-center gap-1.5 cursor-pointer"
                    >
                      <Play className={`w-3.5 h-3.5 ${isExecutingScript ? 'animate-spin' : ''}`} />
                      <span>{isExecutingScript ? 'Executing...' : 'Execute Recommended Patch'}</span>
                    </button>
                  </div>

                  <p className="text-xs text-slate-100 leading-relaxed">{auditResult.diagnosis}</p>

                  <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-[11px] font-black text-amber-300">
                        {auditResult.patchScript.title} (~{auditResult.patchScript.estimatedRecoverySec}s)
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {auditResult.patchScript.targetModules.map((mod) => (
                          <span
                            key={mod}
                            className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 font-mono text-[10px]"
                          >
                            {MODULE_LABELS[mod] || mod}
                          </span>
                        ))}
                      </div>
                    </div>
                    <ul className="text-[11px] text-slate-300 space-y-1 list-disc list-inside">
                      {auditResult.patchScript.actions.map((act, idx) => (
                        <li key={idx}>{act}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* 4-Scenario Outcomes Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {auditResult.allPossibleOutcomes.map((sc) => {
                    const styles = getScenarioStyles(sc.scenarioId);
                    return (
                      <div
                        key={sc.scenarioId}
                        className={`p-4 rounded-xl border ${styles.border} ${styles.bg} space-y-2`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-xs font-black text-slate-900">{sc.title}</h4>
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-mono font-black ${styles.badge}`}>
                            {sc.probabilityPct}%
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-700">
                          <span className="font-bold text-slate-900">Impact: </span>
                          {sc.systemImpact}
                        </div>
                        <div className="text-[11px] text-slate-700">
                          <span className="font-bold text-slate-900">Expected Result: </span>
                          {sc.expectedResult}
                        </div>
                        <div className="text-[11px] text-slate-600 pt-1 border-t border-slate-200/70">
                          <span className="font-bold text-slate-800">Mitigation / Rollback: </span>
                          {sc.mitigationOrRollback}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: INDEXEDDB RESTORE POINT VAULT */}
        {activeTab === 'vault' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div>
                <h3 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                  <History className="w-4 h-4 text-indigo-600" />
                  <span>IndexedDB Restore Point Vault (SrujaanEveryPatchVault_v1)</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Automatic JSON state snapshots saved locally before every patch or fault simulation. Supports instant 1-Click Rollback.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={refreshVault}
                  disabled={isLoadingVault}
                  className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700 cursor-pointer flex items-center gap-1"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingVault ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
                <button
                  type="button"
                  onClick={handleCreateManualSnapshot}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-indigo-950 text-white text-xs font-black cursor-pointer flex items-center gap-1.5"
                >
                  <PlusCircle className="w-3.5 h-3.5 text-amber-400" />
                  <span>Create Restore Point</span>
                </button>
              </div>
            </div>

            {restorePoints.length === 0 ? (
              <div className="p-6 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 text-center text-xs text-slate-500">
                No restore points recorded yet. A checkpoint is saved automatically before any EveryPatch repair or simulation runs.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden bg-white">
                {restorePoints.map((rp) => (
                  <div
                    key={rp.id}
                    className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                            rp.triggeredBy === 'auto'
                              ? 'bg-indigo-100 text-indigo-800'
                              : rp.triggeredBy === 'simulator'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {rp.triggeredBy}
                        </span>
                        <span className="text-xs font-black text-slate-900 truncate">
                          {rp.reason}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                        <span>{rp.displayTime}</span>
                        <span>Students: {rp.studentsCount}</span>
                        <span>Leads: {rp.leadsCount}</span>
                        <span>Batches: {rp.batchesCount}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={rollingBackId !== null}
                        onClick={() => handleRollback(rp.id)}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer"
                      >
                        <RotateCcw className={`w-3.5 h-3.5 ${rollingBackId === rp.id ? 'animate-spin' : ''}`} />
                        <span>{rollingBackId === rp.id ? 'Restoring...' : '1-Click Rollback'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRestorePoint(rp.id)}
                        className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200 cursor-pointer"
                        title="Delete restore point"
                        aria-label="Delete restore point"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: LIVE STRESS TEST & FAULT SIMULATOR */}
        {activeTab === 'simulator' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 space-y-1">
              <div className="font-black flex items-center gap-1.5">
                <FlaskConical className="w-4 h-4 text-amber-700" />
                <span>Live Fault Simulator (Real IndexedDB, Outbox &amp; State Engine)</span>
              </div>
              <p className="text-[11px] text-amber-900 leading-relaxed">
                Every test automatically saves a Pre-Simulation Restore Point in IndexedDB Vault before running against live CRM state so you can verify detection, auto-patch recovery, or 1-Click Rollback safely.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <button
                type="button"
                disabled={busySim !== null}
                onClick={handleSimOfflineLead}
                className="p-4 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-left space-y-1.5 cursor-pointer transition-all disabled:opacity-50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black text-slate-900">
                    1. Simulate Offline Disconnect + Add Test Lead
                  </span>
                  <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-bold">
                    {busySim === 'offline-lead' ? 'Running...' : 'Run Test'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Enqueues a real test lead into IndexedDB offline queue (`SSMI_PENDING_SYNC_QUEUE_IDB_V3`), updates state, and verifies reconnect auto-flush.
                </p>
              </button>

              <button
                type="button"
                disabled={busySim !== null}
                onClick={handleSimCorruptFee}
                className="p-4 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-left space-y-1.5 cursor-pointer transition-all disabled:opacity-50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black text-slate-900">
                    2. Simulate Corrupt Student Fee Record
                  </span>
                  <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                    {busySim === 'corrupt-fee' ? 'Injecting...' : 'Inject & Scan'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Injects a test student with NaN fees, negative discount, and invalid date format; populates Module B anomaly alerts &amp; 4-Outcome Matrix.
                </p>
              </button>

              <button
                type="button"
                disabled={busySim !== null}
                onClick={handleSimListenerStall}
                className="p-4 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-left space-y-1.5 cursor-pointer transition-all disabled:opacity-50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black text-slate-900">
                    3. Simulate Firestore Listener Stall
                  </span>
                  <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[10px] font-bold">
                    {busySim === 'listener-stall' ? 'Recovering...' : 'Simulate & Heal'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Simulates dropped onSnapshot listeners, triggers Watchdog alert, and runs Module A silent re-bind &amp; token refresh.
                </p>
              </button>

              <button
                type="button"
                disabled={busySim !== null}
                onClick={handleExportBundle}
                className="p-4 rounded-xl bg-slate-900 hover:bg-indigo-950 text-white text-left space-y-1.5 cursor-pointer transition-all disabled:opacity-50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black flex items-center gap-1.5">
                    <Download className="w-4 h-4 text-amber-400" />
                    <span>4. Export Full Diagnostic &amp; Backup Bundle (.json)</span>
                  </span>
                  <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 text-[10px] font-black">
                    {busySim === 'export-bundle' ? 'Exporting...' : 'Download JSON'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Downloads a single JSON bundle containing Watchdog telemetry, Schema Scan, Vault index, 4-Outcome Audit, execution logs, and full AppState backup.
                </p>
              </button>
            </div>
          </div>
        )}

        {/* Shared Timestamped Diagnostic Execution Log */}
        <div className="rounded-xl border border-slate-200/90 bg-slate-950 text-slate-100 overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-extrabold text-amber-300">
              <Terminal className="w-3.5 h-3.5" />
              <span>EveryPatch Execution &amp; Self-Repair Log</span>
            </div>
            {logs.length > 0 && (
              <button
                type="button"
                onClick={() => setLogs([])}
                className="text-[10px] font-bold text-slate-400 hover:text-white cursor-pointer"
              >
                Clear Log
              </button>
            )}
          </div>

          <div className="p-3.5 max-h-52 overflow-y-auto space-y-1.5 font-mono text-[11px]">
            {logs.length === 0 ? (
              <div className="text-slate-400">
                Watchdog active ({watchdog.pillText}). Run any Patch Module, Gemini AI Audit, or Fault Simulator test above to trace actions here.
              </div>
            ) : (
              logs.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-2 leading-relaxed border-b border-slate-900/80 pb-1 last:border-b-0"
                >
                  <span className="text-slate-500 shrink-0">[{entry.timestamp}]</span>
                  <span
                    className={`uppercase font-bold shrink-0 px-1.5 py-0.2 rounded text-[10px] ${
                      entry.level === 'fixed'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : entry.level === 'warn'
                        ? 'bg-amber-500/20 text-amber-300'
                        : entry.level === 'error'
                        ? 'bg-rose-500/20 text-rose-300'
                        : 'bg-indigo-500/20 text-indigo-300'
                    }`}
                  >
                    {entry.area}
                  </span>
                  <span
                    className={
                      entry.level === 'error'
                        ? 'text-rose-200'
                        : entry.level === 'warn'
                        ? 'text-amber-200'
                        : entry.level === 'fixed'
                        ? 'text-emerald-200'
                        : 'text-slate-200'
                    }
                  >
                    {entry.message}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
