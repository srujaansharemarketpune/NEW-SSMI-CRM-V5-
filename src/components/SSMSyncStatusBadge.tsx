import React, { useState, useEffect } from 'react';
import { Cloud, CloudOff, RefreshCw, Download, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import {
  performChunkedInstituteBackup,
  BACKUP_STATUS,
  BackupProgressState,
  getLastVerifiedBackupMeta,
  LastVerifiedBackupMeta,
  subscribeToBackupStatus
} from '../services/backupEngine';
import {
  INSTITUTE_WORKSPACE_ID,
  subscribeToSyncStatus,
  getSyncStatusSnapshot
} from '../services/firebaseSync';
import { runLiveReadWriteHealthCheck } from '../services/firebase';
import type { SyncStatusSnapshot } from '../services/db';

interface SSMSyncStatusBadgeProps {
  syncMeta?: { hasPendingWrites: boolean; fromCache: boolean };
  compact?: boolean;
}

export const SSMSyncStatusBadge: React.FC<SSMSyncStatusBadgeProps> = ({
  syncMeta = { hasPendingWrites: false, fromCache: false },
  compact = false
}) => {
  const [isOnline, setIsOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [syncSnap, setSyncSnap] = useState<SyncStatusSnapshot>(() => getSyncStatusSnapshot());
  const [backupState, setBackupState] = useState<BackupProgressState>({
    status: BACKUP_STATUS.IDLE,
    progress: 0,
    message: ''
  });
  const [lastBackupMeta, setLastBackupMeta] = useState<LastVerifiedBackupMeta | null>(() =>
    getLastVerifiedBackupMeta()
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const unsubSync = subscribeToSyncStatus((snap) => {
      setSyncSnap(snap);
    });

    const unsubBackup = subscribeToBackupStatus((state, meta) => {
      setBackupState(state);
      setLastBackupMeta(meta);
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubSync();
      unsubBackup();
    };
  }, []);

  const triggerBackup = async () => {
    try {
      const res = await performChunkedInstituteBackup((progressData) => {
        setBackupState(progressData);
      });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('ssm-verification-result', {
            detail: {
              title: 'Full Institute Backup Verification',
              operation: 'backup',
              success: res.success,
              status: res.status,
              timestamp: res.completedAt,
              summary: `Backup ${res.backupId}: ${res.count} records processed (${res.status}).`,
              targets: [
                {
                  name: 'JSON Download Snapshot',
                  ok: res.targets.localJson,
                  detail: res.targets.localJson ? 'Downloaded JSON archive' : 'Download skipped'
                },
                {
                  name: 'Local Cache / IndexedDB',
                  ok: res.targets.indexedDb,
                  detail: `${res.count} records verified locally`
                },
                {
                  name: 'Firebase Firestore Audit',
                  ok: res.targets.firestore,
                  detail: res.targets.firestore
                    ? `Committed to institutes/${INSTITUTE_WORKSPACE_ID}/backups/${res.backupId}`
                    : res.error || 'Firestore audit not committed'
                }
              ],
              collectionCounts: res.collectionCounts,
              error: res.error
            }
          })
        );
      }
      setTimeout(() => {
        setBackupState({ status: BACKUP_STATUS.IDLE, progress: 0, message: '' });
      }, 4500);
    } catch (err: any) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('ssm-verification-result', {
            detail: {
              title: 'Full Institute Backup Failed',
              operation: 'backup',
              success: false,
              status: 'FAILED',
              timestamp: new Date().toLocaleString('en-IN', { hour12: false }),
              summary: 'Backup process failed before completion.',
              targets: [
                {
                  name: 'Backup Engine',
                  ok: false,
                  detail: err?.message || 'Unexpected error'
                }
              ],
              error: err?.message || 'Backup failed.'
            }
          })
        );
      }
      setTimeout(() => {
        setBackupState({ status: BACKUP_STATUS.IDLE, progress: 0, message: '' });
      }, 6000);
    }
  };

  const isRunningBackup =
    backupState.status === BACKUP_STATUS.QUEUED ||
    backupState.status === BACKUP_STATUS.FETCHING ||
    backupState.status === BACKUP_STATUS.UPLOADING ||
    backupState.status === BACKUP_STATUS.VERIFYING;

  const isNotLoggedIn = isOnline && !syncSnap.isAuthTokenValid;
  const isConnected = isOnline && syncSnap.isAuthTokenValid && syncSnap.firestoreVerified && syncSnap.status === 'Connected';
  const isError = isOnline && syncSnap.status === 'Error';
  const isSyncing = isOnline && syncSnap.isAuthTokenValid && (syncMeta.hasPendingWrites || syncSnap.status === 'Syncing');

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs font-sans">
      {/* 1. Cloud Connectivity Indicator */}
      {!compact && (
        <button
          type="button"
          onClick={() => {
            runLiveReadWriteHealthCheck().catch(() => {});
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-colors cursor-pointer ${
            !isOnline
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
              : isNotLoggedIn
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              : isError
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
              : isSyncing
              ? 'bg-sky-500/10 border-sky-500/30 text-sky-400'
              : isConnected
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
          }`}
          title={
            syncSnap.lastError
              ? `${syncSnap.lastError} — Click to re-run Firestore Health Check`
              : 'Click to verify live Firestore read/write connection'
          }
        >
          {!isOnline ? (
            <>
              <CloudOff className="w-3.5 h-3.5" />
              <span>Offline (Local Cache Active)</span>
            </>
          ) : isNotLoggedIn ? (
            <>
              <Clock className="w-3.5 h-3.5" />
              <span>Firebase: Not logged in</span>
            </>
          ) : isError ? (
            <>
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Sync Error</span>
            </>
          ) : isSyncing ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Syncing to Cloud...</span>
            </>
          ) : isConnected ? (
            <>
              <Cloud className="w-3.5 h-3.5" />
              <span>Firebase Connected (Synced)</span>
            </>
          ) : (
            <>
              <Clock className="w-3.5 h-3.5" />
              <span>Firebase: Syncing Pending</span>
            </>
          )}
        </button>
      )}

      {/* 2. Actionable Backup Trigger with Clear State Display (Never Stuck on PENDING) */}
      <button
        type="button"
        onClick={triggerBackup}
        disabled={isRunningBackup}
        title={
          lastBackupMeta
            ? `Last Verified Backup: ${lastBackupMeta.completedAt} (${lastBackupMeta.totalRecords} records)`
            : 'Execute Chunked & Verified Cloud Backup'
        }
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-bold transition-all cursor-pointer ${
          backupState.status === BACKUP_STATUS.COMPLETED
            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
            : backupState.status === BACKUP_STATUS.FAILED
            ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
            : isRunningBackup
            ? 'bg-purple-500/20 border-purple-500/40 text-purple-300 cursor-wait'
            : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
        }`}
      >
        {isRunningBackup ? (
          <>
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-400" />
            <span>
              {backupState.status}: {backupState.message} ({backupState.progress}%)
            </span>
          </>
        ) : backupState.status === BACKUP_STATUS.COMPLETED ? (
          <>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>COMPLETED • {backupState.message}</span>
          </>
        ) : backupState.status === BACKUP_STATUS.FAILED ? (
          <>
            <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
            <span>FAILED (Tap to Retry)</span>
          </>
        ) : (
          <>
            <Download className="w-3.5 h-3.5 text-amber-400" />
            <span>Full Cloud Backup</span>
          </>
        )}
      </button>
    </div>
  );
};

export default SSMSyncStatusBadge;

