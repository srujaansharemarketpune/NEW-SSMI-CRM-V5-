import React from 'react';
import { AppState } from '../types';
import { DraggableWindow } from './DraggableWindow';
import { SystemHealthPanel } from './SystemHealthPanel';
import { ShieldCheck } from 'lucide-react';

interface EveryPatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: AppState;
  onApplyRepairedState?: (nextState: AppState, reason?: string) => void;
  onDiagnosticsApplied?: () => void;
  onToast?: (msg: string) => void;
}

export const EveryPatchModal: React.FC<EveryPatchModalProps> = ({
  isOpen,
  onClose,
  state,
  onApplyRepairedState,
  onDiagnosticsApplied,
  onToast
}) => {
  return (
    <DraggableWindow
      isOpen={isOpen}
      onClose={onClose}
      theme="light"
      maxWidthClass="sm:max-w-[min(96vw,1000px)]"
      closeOnBackdropClick={true}
      ariaLabelledBy="everypatch-modal-title"
      title="System Health & Self-Repair (EveryPatch)"
      subtitle="Hybrid Online/Offline Watchdog, Modules A–E Auto-Heal, IndexedDB Vault & 4-Outcome Simulator"
      icon={
        <div className="w-9 h-9 rounded-xl bg-slate-900 text-amber-400 flex items-center justify-center shrink-0 border border-amber-400/30 shadow-2xs">
          <ShieldCheck className="w-5 h-5" />
        </div>
      }
      bodyClassName="p-3 sm:p-5 bg-slate-100/70"
      footer={
        <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
          <span className="truncate">
            Authorized Admin/Operator Diagnostic Console • IndexedDB Vault Protected
          </span>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] sm:min-h-0 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold cursor-pointer shrink-0"
          >
            Close
          </button>
        </div>
      }
    >
      <SystemHealthPanel
        state={state}
        onApplyRepairedState={onApplyRepairedState}
        onDiagnosticsApplied={onDiagnosticsApplied}
        onToast={onToast}
        compact={true}
      />
    </DraggableWindow>
  );
};
