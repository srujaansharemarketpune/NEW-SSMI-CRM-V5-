import React from 'react';
import { StorageQuotaInfo } from '../types';
import { HardDrive, Download, Trash2, Cloud, X } from 'lucide-react';

interface LowStorageBannerProps {
  quota: StorageQuotaInfo;
  onDownloadBackup: () => void;
  onCleanTempData: () => void;
  onSyncToCloud: () => void;
  onDismiss: () => void;
  dismissed: boolean;
}

export const LowStorageBanner: React.FC<LowStorageBannerProps> = ({
  quota,
  onDownloadBackup,
  onCleanTempData,
  onSyncToCloud,
  onDismiss,
  dismissed
}) => {
  if (dismissed || !quota.isLowStorage) return null;

  return (
    <aside aria-label="Low Storage Notice" className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-xs text-amber-900 shadow-xs">
      <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-amber-600 shrink-0 animate-pulse" />
          <span>
            <strong className="text-amber-950 font-extrabold">⚠️ Storage Advisory:</strong> Browser storage is currently at{' '}
            <span className="font-mono-code font-bold text-amber-900">{quota.usagePercent}%</span> ({quota.usedKb} KB used). Keep your institute records backed up:
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onDownloadBackup}
            className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-[11px] flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
          >
            <Download className="w-3 h-3" />
            <span>Download Backup JSON</span>
          </button>
          <button
            onClick={onSyncToCloud}
            className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[11px] flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
          >
            <Cloud className="w-3 h-3" />
            <span>Push to Cloud</span>
          </button>
          <button
            onClick={onCleanTempData}
            className="px-2.5 py-1 rounded-lg bg-white hover:bg-amber-100 text-amber-900 font-semibold text-[11px] flex items-center gap-1 cursor-pointer transition-colors border border-amber-300"
          >
            <Trash2 className="w-3 h-3" />
            <span>Clean Old Logs</span>
          </button>
          <button
            onClick={onDismiss}
            className="p-1 text-amber-700 hover:text-amber-950 cursor-pointer ml-1"
            title="Dismiss notice"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
};
