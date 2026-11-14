import React, { useState } from 'react';
import { AppState } from '../types';
import {
  Search,
  Download,
  Printer,
  Bell,
  MessageSquare,
  Copy,
  Check,
  Building2
} from 'lucide-react';
import { exportCsvFile, getActiveInstituteAddress } from '../services/db';
import { DraggableWindow } from './DraggableWindow';

interface FeesViewProps {
  state: AppState;
  onOpenFeeModal: (studentId: string) => void;
  onPrintReceipt: (studentId: string, branchId?: string) => void;
  onOpenWaStudioForContact: (type: 'student' | 'lead', id: string, scenarioHint?: string) => void;
}

export const FeesView: React.FC<FeesViewProps> = ({
  state,
  onOpenFeeModal,
  onPrintReceipt,
  onOpenWaStudioForContact
}) => {
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'OVERDUE' | 'PENDING' | 'CLEARED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReceiptBranchId, setSelectedReceiptBranchId] = useState<string>('');
  const [reminderModalOpen, setReminderModalOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [allCopied, setAllCopied] = useState(false);

  const customBranches = state.settings.branches || [];
  const activeAddr = getActiveInstituteAddress(state.settings, selectedReceiptBranchId || undefined);

  const activeStudents = state.students.filter(s => s.status !== 'Archived');

  let totalGross = 0;
  let totalDiscounts = 0;
  let totalNet = 0;
  let totalReceived = 0;
  let totalOverdue = 0;

  const today = new Date().toISOString().split('T')[0];

  activeStudents.forEach(s => {
    totalGross += s.grossFee;
    totalDiscounts += s.discount;
    totalNet += s.netFee;
    let paid = 0;
    (s.milestones || []).forEach(m => {
      if (m.status === 'Paid') {
        paid += m.amount;
      } else if (m.dueDate && m.dueDate <= today) {
        totalOverdue += m.amount;
      }
    });
    totalReceived += paid;
  });

  const totalOutstanding = Math.max(0, totalNet - totalReceived);

  // Automated 3-Day Fee Reminders calculation
  const remindersDue = activeStudents.flatMap(stu => {
    const milestones = stu.milestones || [];
    const paid = milestones.filter(m => m.status === 'Paid').reduce((a, b) => a + b.amount, 0);
    const balance = Math.max(0, stu.netFee - paid);

    return milestones
      .filter(m => {
        if (m.status === 'Paid' || !m.dueDate) return false;
        const dueD = new Date(m.dueDate + 'T00:00:00');
        const todayD = new Date(today + 'T00:00:00');
        const diffDays = Math.ceil((dueD.getTime() - todayD.getTime()) / (1000 * 60 * 60 * 24));
        return diffDays <= 3;
      })
      .map((m, idx) => {
        const dueD = new Date(m.dueDate + 'T00:00:00');
        const todayD = new Date(today + 'T00:00:00');
        const diffDays = Math.ceil((dueD.getTime() - todayD.getTime()) / (1000 * 60 * 60 * 24));
        let statusLabel = '';
        if (diffDays < 0) statusLabel = `🚨 Overdue by ${Math.abs(diffDays)}d (${m.dueDate})`;
        else if (diffDays === 0) statusLabel = `⚡ Due Today (${m.dueDate})`;
        else statusLabel = `⏳ Due in ${diffDays}d (${m.dueDate})`;

        const instName = state.settings.instituteName || 'Srujaan Share Market Institute';
        const upiId = state.settings.upiId || 'srujaansharemarket@upi';
        const signOffLine = activeAddr.branchName
          ? `*${instName} (${activeAddr.branchName})*`
          : `*${instName}*`;

        const draftMsg =
          `*Fee Installment Reminder — ${instName}* 🎓\n\n` +
          `Dear *${stu.name}* (Reg ID: ${stu.regId}),\n\n` +
          `This is a friendly reminder that your installment for *${stu.course || 'Share Market Trading Course'}* is *${statusLabel}*.\n\n` +
          `📌 *Milestone:* ${m.name || 'Installment #' + (idx + 1)}\n` +
          `💰 *Amount Due:* ₹${m.amount.toLocaleString('en-IN')}\n` +
          `🗓️ *Due Date:* ${m.dueDate}\n` +
          `📊 *Total Outstanding Fee Balance:* ₹${balance.toLocaleString('en-IN')}\n\n` +
          `💳 *Payment Mode:* UPI / Cash / Bank Transfer\n` +
          `UPI ID: \`${upiId}\` (${instName})\n\n` +
          `If you have already paid, please ignore this message or send the payment receipt screenshot here.\n\n` +
          `Thank you!\n` +
          `${signOffLine} 🚀`;

        return {
          id: `${stu.id}-${m.name}-${m.dueDate}`,
          student: stu,
          milestone: m,
          diffDays,
          statusLabel,
          balance,
          draftMsg
        };
      });
  });

  // Filter students
  const filteredStudents = activeStudents.filter(s => {
    const paid = (s.milestones || []).filter(m => m.status === 'Paid').reduce((a, b) => a + b.amount, 0);
    const balance = Math.max(0, s.netFee - paid);
    const hasOverdue = (s.milestones || []).some(m => m.status !== 'Paid' && m.dueDate && m.dueDate <= today);

    if (filterStatus === 'OVERDUE' && !hasOverdue) return false;
    if (filterStatus === 'PENDING' && balance === 0) return false;
    if (filterStatus === 'CLEARED' && balance > 0) return false;

    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      const hay = `${s.name} ${s.regId} ${s.batch} ${s.course}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Title Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-black text-slate-900 tracking-tight">
              Fee Ledger, Installments & Printable A4 Tax Receipts
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
              Accounts Desk
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            {activeAddr.isConfigured
              ? `Active Receipt Letterhead: ${activeAddr.branchName ? `${activeAddr.branchName} — ` : ''}${activeAddr.fullAddress}`
              : 'No address entered. Please add your institute/branch address in Master Settings.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {customBranches.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50/70 border border-blue-200">
              <Building2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span className="text-[11px] font-bold text-blue-900">Receipt Branch:</span>
              <select
                value={selectedReceiptBranchId}
                onChange={(e) => setSelectedReceiptBranchId(e.target.value)}
                className="bg-white border border-blue-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-500"
              >
                <option value="">Default Active Branch / Address</option>
                {customBranches.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.branchName || b.name} {(b.isDefault || b.isPrimary) ? '(Primary)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            onClick={() => setReminderModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow-xs"
          >
            <Bell className="w-3.5 h-3.5 text-amber-600" />
            <span>3-Day Fee Reminders</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-200 text-amber-900 font-extrabold ml-0.5">
              {remindersDue.length}
            </span>
          </button>
          <button
            onClick={() => exportCsvFile(state, 'fees')}
            className="px-3.5 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all"
          >
            <Download className="w-3.5 h-3.5 text-blue-600" />
            <span>Export Fee CSV</span>
          </button>
        </div>
      </div>

      {/* 4 KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-1.5">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">NET FEES BILLED</div>
          <div className="text-2xl font-black font-mono-code text-slate-900">
            ₹{totalNet.toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] text-slate-500 font-medium">
            Gross: ₹{totalGross.toLocaleString('en-IN')} • Disc: ₹{totalDiscounts.toLocaleString('en-IN')}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-1.5">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">COLLECTED REVENUE</div>
          <div className="text-2xl font-black font-mono-code text-emerald-600">
            ₹{totalReceived.toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] text-emerald-700 font-semibold">
            ✓ Verified Paid Bank/UPI/Cash Receipts
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-1.5">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">TOTAL OUTSTANDING</div>
          <div className="text-2xl font-black font-mono-code text-rose-600">
            ₹{totalOutstanding.toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] text-slate-500 font-medium">Pending across active batches</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-1.5">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">OVERDUE INSTALLMENTS</div>
          <div className="text-2xl font-black font-mono-code text-amber-600">
            ₹{totalOverdue.toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] text-amber-700 font-semibold">
            🚨 Due on or before today
          </div>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 font-medium focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">All Students ({activeStudents.length})</option>
              <option value="OVERDUE">🚨 Has Overdue Installment</option>
              <option value="PENDING">⏳ Has Pending Balance</option>
              <option value="CLEARED">✅ 100% Fee Cleared</option>
            </select>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search student or receipt..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white font-medium"
            />
          </div>
        </div>

        {/* Mobile-Only Horizontal Filter Chips */}
        <div className="flex md:hidden items-center gap-2 overflow-x-auto whitespace-nowrap pb-1 -mx-1 px-1">
          {([
            { id: 'ALL', label: `All (${activeStudents.length})` },
            { id: 'OVERDUE', label: '🚨 Overdue' },
            { id: 'PENDING', label: '⏳ Pending Balance' },
            { id: 'CLEARED', label: '✅ 100% Cleared' }
          ] as const).map(chip => (
            <button
              key={chip.id}
              type="button"
              onClick={() => setFilterStatus(chip.id)}
              className={`px-3.5 py-2 rounded-full text-xs font-extrabold shrink-0 cursor-pointer transition-all ${
                filterStatus === chip.id
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 border border-slate-200'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Desktop Fee Ledger Table (Strictly isolated to Desktop: hidden md:block) */}
      <div className="hidden md:block bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto max-h-[70vh]">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-50 shadow-[0_1px_0_0_#e2e8f0]">
              <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider">
              <th className="p-3.5">Student & Batch</th>
              <th className="p-3.5">Gross & Discount</th>
              <th className="p-3.5">Net Fee</th>
              <th className="p-3.5">Received Amount</th>
              <th className="p-3.5">Outstanding Balance</th>
              <th className="p-3.5">Milestone Progress</th>
              <th className="p-3.5 text-right">Receipt & Payment</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredStudents.map((s) => {
              const paid = Math.max(0, Math.round((s.milestones || []).filter(m => m.status === 'Paid').reduce((a, b) => a + b.amount, 0)));
              const balance = Math.max(0, Math.round(s.netFee - paid));

              return (
                <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-3.5">
                    <strong className="text-slate-900 text-xs font-bold">{s.name}</strong>
                    <div className="font-mono-code text-[11px] text-blue-600">
                      {s.regId} • {s.batch || 'Unassigned'}
                    </div>
                  </td>
                  <td className="p-3.5 font-mono-code text-slate-600">
                    <div>₹{s.grossFee.toLocaleString('en-IN')}</div>
                    {s.discount > 0 && (
                      <div className="text-[10px] text-emerald-700 font-bold">Disc: -₹{s.discount.toLocaleString('en-IN')}</div>
                    )}
                  </td>
                  <td className="p-3.5 font-mono-code font-bold text-slate-900">
                    ₹{s.netFee.toLocaleString('en-IN')}
                  </td>
                  <td className="p-3.5 font-mono-code font-bold text-emerald-700">
                    ₹{paid.toLocaleString('en-IN')}
                  </td>
                  <td className="p-3.5">
                    {balance > 0 ? (
                      <span className="font-mono-code font-extrabold text-rose-600">
                        ₹{balance.toLocaleString('en-IN')}
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        ✓ Cleared
                      </span>
                    )}
                  </td>
                  <td className="p-3.5">
                    <div className="flex flex-wrap gap-1 max-w-xs">
                      {(s.milestones || []).map((m, i) => (
                        <span
                          key={i}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-mono-code ${
                            m.status === 'Paid'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : m.status === 'Overdue'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200 font-bold'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {m.name}: ₹{m.amount.toLocaleString('en-IN')}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="p-3.5 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        onClick={() => onOpenFeeModal(s.id)}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-2xs cursor-pointer"
                      >
                        Record / Pay
                      </button>
                      <button
                        onClick={() => onPrintReceipt(s.id, selectedReceiptBranchId || undefined)}
                        className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 cursor-pointer"
                        title="Print A4 Receipt"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
              </tbody>
            </table>
          </div>
        </div>

      {/* Mobile-Only Fee Ledger Cards (Strictly hidden on Desktop: grid md:hidden) */}
      <div className="grid grid-cols-1 gap-3 md:hidden">
        {filteredStudents.map((s) => {
          const paid = Math.max(0, Math.round((s.milestones || []).filter(m => m.status === 'Paid').reduce((a, b) => a + b.amount, 0)));
          const balance = Math.max(0, Math.round(s.netFee - paid));
          const cleanDigits = (s.phone || '').replace(/\D/g, '').slice(-10);

          return (
            <div key={s.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-mono-code text-xs font-extrabold text-blue-600">
                    {s.regId} • {s.batch || 'Unassigned'}
                  </span>
                  <h3 className="text-base font-black text-slate-900 mt-0.5 break-words">{s.name}</h3>
                  <div className="text-xs font-bold text-slate-500">{s.course}</div>
                  {s.phone && (
                    <a
                      href={cleanDigits ? `tel:+91${cleanDigits}` : '#'}
                      className="inline-block text-xs font-mono-code font-bold text-blue-700 mt-0.5"
                    >
                      📞 {s.phone}
                    </a>
                  )}
                </div>
                {balance > 0 ? (
                  <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-rose-50 text-rose-700 border border-rose-200 shrink-0">
                    Due ₹{balance.toLocaleString('en-IN')}
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                    ✓ Cleared
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
                <div>
                  <div className="text-[11px] font-bold text-slate-400 uppercase">Net Fee</div>
                  <div className="font-mono-code font-black text-slate-900 mt-0.5">₹{s.netFee.toLocaleString('en-IN')}</div>
                </div>
                <div>
                  <div className="text-[11px] font-bold text-slate-400 uppercase">Paid Amount</div>
                  <div className="font-mono-code font-black text-emerald-700 mt-0.5">₹{paid.toLocaleString('en-IN')}</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {(s.milestones || []).map((m, i) => (
                  <span
                    key={i}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-mono-code font-bold ${
                      m.status === 'Paid'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : m.status === 'Overdue'
                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}
                  >
                    {m.name}: ₹{m.amount.toLocaleString('en-IN')} ({m.status})
                  </span>
                ))}
              </div>

              <div className="pt-2 border-t border-slate-100 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => onOpenFeeModal(s.id)}
                  className="min-h-[44px] py-2 px-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs cursor-pointer"
                >
                  Record / Pay
                </button>
                <button
                  type="button"
                  onClick={() => onPrintReceipt(s.id, selectedReceiptBranchId || undefined)}
                  className="min-h-[44px] py-2 px-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 font-extrabold text-xs flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Receipt</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenWaStudioForContact('student', s.id, 'Fee Installment Reminder')}
                  className="min-h-[44px] py-2 px-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-extrabold text-xs cursor-pointer"
                >
                  WA Reminder
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {/* 3-Day Fee Reminders Modal */}
      <DraggableWindow
        isOpen={reminderModalOpen}
        onClose={() => setReminderModalOpen(false)}
        title="3-Day Fee Installment Reminders"
        subtitle="Personalized WhatsApp draft messages for installments due within 3 days or overdue"
        icon={
          <div className="p-2 rounded-xl bg-amber-50 text-amber-600 border border-amber-200">
            <Bell className="w-5 h-5" />
          </div>
        }
        maxWidthClass="max-w-3xl"
        bodyClassName="flex flex-col"
        footer={
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => setReminderModalOpen(false)}
              className="min-h-[44px] sm:min-h-0 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-100 cursor-pointer"
            >
              Close
            </button>
          </div>
        }
      >
        <div className="flex flex-col flex-1">

            {/* Modal Actions & Summary */}
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-bold text-slate-700">
                {remindersDue.length === 0
                  ? '✓ All installments are currently up to date!'
                  : `Found ${remindersDue.length} student installment(s) requiring attention:`}
              </span>
              {remindersDue.length > 0 && (
                <button
                  onClick={() => {
                    const fullText = remindersDue
                      .map(
                        (r, i) =>
                          `=== REMINDER #${i + 1}: ${r.student.name} (${r.student.phone}) ===\n${r.draftMsg}`
                      )
                      .join('\n\n----------------------------------------\n\n');
                    navigator.clipboard.writeText(fullText);
                    setAllCopied(true);
                    setTimeout(() => setAllCopied(false), 2000);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  {allCopied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-slate-500" />
                  )}
                  <span>{allCopied ? 'Copied All to Clipboard!' : 'Copy All Drafts'}</span>
                </button>
              )}
            </div>

            {/* Reminders List */}
            <div className="p-5 overflow-y-auto space-y-3 flex-1">
              {remindersDue.length === 0 ? (
                <div className="p-10 text-center text-slate-400 space-y-2">
                  <div className="text-3xl">🎉</div>
                  <div className="font-bold text-slate-700">No Installments Due Within 3 Days</div>
                  <div className="text-xs text-slate-500">
                    All enrolled students have cleared balances or installments scheduled beyond 3 days.
                  </div>
                </div>
              ) : (
                remindersDue.map((rem, i) => {
                  const cleanPhone = rem.student.phone.replace(/\D/g, '');
                  const waUrl = `https://wa.me/91${cleanPhone.slice(-10)}?text=${encodeURIComponent(
                    rem.draftMsg
                  )}`;
                  return (
                    <div
                      key={rem.id}
                      className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-all space-y-2.5 shadow-2xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="font-extrabold text-sm text-slate-900">
                            {i + 1}. {rem.student.name}
                          </span>
                          <span className="text-xs text-slate-500 font-mono-code ml-2">
                            ({rem.student.regId} • {rem.student.phone})
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              rem.diffDays <= 0
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}
                          >
                            {rem.statusLabel}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono-code font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Due: ₹{rem.milestone.amount.toLocaleString('en-IN')}
                          </span>
                        </div>
                      </div>

                      {/* Draft Box */}
                      <pre className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono-code text-slate-700 whitespace-pre-wrap select-all max-h-32 overflow-y-auto">
                        {rem.draftMsg}
                      </pre>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
                        <span className="text-[11px] text-slate-500">
                          Course: <strong className="text-slate-700">{rem.student.course}</strong> • Net Outstanding:{' '}
                          <strong className="text-rose-600">
                            ₹{rem.balance.toLocaleString('en-IN')}
                          </strong>
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(rem.draftMsg);
                              setCopiedId(rem.id);
                              setTimeout(() => setCopiedId(null), 2000);
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            {copiedId === rem.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5 text-slate-500" />
                            )}
                            <span>{copiedId === rem.id ? 'Copied' : 'Copy'}</span>
                          </button>
                          <a
                            href={waUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>Send via WhatsApp</span>
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
        </div>
      </DraggableWindow>
    </div>
  );
};
