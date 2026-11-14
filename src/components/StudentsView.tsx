import React, { useState, useEffect } from 'react';
import { AppState, Student } from '../types';
import {
  Search,
  Plus,
  FileSpreadsheet,
  Download,
  Eye,
  Edit2,
  CreditCard,
  Archive,
  Trash2,
  MessageCircle,
  PhoneCall,
  CheckSquare,
  Square,
  Database,
  Cloud,
  ShieldCheck
} from 'lucide-react';
import { exportMasterExcelFile, exportCsvFile } from '../services/db';
import { StudentBackupRestoreModal } from './StudentBackupRestoreModal';
import { getGoogleSheetWebhookUrl } from '../services/storageService';

interface StudentsViewProps {
  state: AppState;
  onOpenStudentModal: (studentId?: string) => void;
  onOpenStudent360: (studentId: string) => void;
  onOpenFeeModal: (studentId: string) => void;
  onOpenWaStudioForContact: (type: 'student' | 'lead', id: string, scenarioHint?: string) => void;
  onArchiveStudent: (studentId: string) => void;
  onDeleteStudent: (studentId: string) => void;
  onBulkAssignBatch: (studentIds: string[], batchCode: string) => void;
  onBulkQueueWhatsApp: (studentIds: string[]) => void;
  onBulkArchive: (studentIds: string[]) => void;
  onOpenGoogleSheetsExport?: () => void;
  onRestoreStudents?: (restored: Student[], message: string) => void;
  onToast?: (msg: string) => void;
}

export const StudentsView: React.FC<StudentsViewProps> = ({
  state,
  onOpenStudentModal,
  onOpenStudent360,
  onOpenFeeModal,
  onOpenWaStudioForContact,
  onArchiveStudent,
  onDeleteStudent,
  onBulkAssignBatch,
  onBulkQueueWhatsApp,
  onBulkArchive,
  onOpenGoogleSheetsExport,
  onRestoreStudents,
  onToast
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [batchFilter, setBatchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('ACTIVE_DEFAULT');
  const [sortBy, setSortBy] = useState('regId_asc');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkBatchSelect, setBulkBatchSelect] = useState('');
  const [backupRestoreModalOpen, setBackupRestoreModalOpen] = useState(false);
  const hasGSheetWebhook = Boolean(getGoogleSheetWebhookUrl());

  // Global window bindings
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).openEditStudentModal = (id: string) => onOpenStudentModal(id);
      (window as any).deleteStudent = (id: string) => onDeleteStudent(id);
    }
  }, [onOpenStudentModal, onDeleteStudent]);

  // Filter students
  const filteredStudents = state.students.filter(s => {
    if (statusFilter === 'ACTIVE_DEFAULT' && s.status === 'Archived') return false;
    if (statusFilter !== 'ACTIVE_DEFAULT' && statusFilter !== 'ALL' && s.status !== statusFilter) return false;
    if (batchFilter === '__UNASSIGNED__' && s.batch) return false;
    if (batchFilter && batchFilter !== '__UNASSIGNED__' && s.batch !== batchFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      const hay = `${s.name} ${s.regId} ${s.phone} ${s.whatsapp} ${s.email} ${s.course} ${s.batch} ${s.address}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // Sort students
  filteredStudents.sort((a, b) => {
    if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
    if (sortBy === 'enrollDate_desc') return b.enrollDate.localeCompare(a.enrollDate);
    if (sortBy === 'balance_desc') {
      const balA = Math.max(0, a.netFee - (a.milestones || []).filter(m => m.status === 'Paid').reduce((x, y) => x + y.amount, 0));
      const balB = Math.max(0, b.netFee - (b.milestones || []).filter(m => m.status === 'Paid').reduce((x, y) => x + y.amount, 0));
      return balB - balA;
    }
    return a.regId.localeCompare(b.regId);
  });

  const allSelected = filteredStudents.length > 0 && filteredStudents.every(s => selectedIds.includes(s.id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredStudents.map(s => s.id));
    }
  };

  const toggleSelectStudent = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(x => x !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  return (
    <div className="space-y-4">
      {/* Module Title Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-black text-slate-900 tracking-tight">
              Enrolled Student Database
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 font-mono-code">
              {filteredStudents.length} Records
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Student profiles, course enrollments, batch assignments, attendance tracking, fee balances & instant communication
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2 pt-1 border-t border-slate-100 text-[11px]">
            <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md font-semibold border border-emerald-200">
              <ShieldCheck className="w-3 h-3 text-emerald-600" />
              <span>Tier 1: LocalCache (Active 0ms)</span>
            </span>
            <span className="inline-flex items-center gap-1 text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md font-semibold border border-blue-200">
              <Cloud className="w-3 h-3 text-blue-600" />
              <span>Tier 2: Firestore Cloud (Auto-Sync)</span>
            </span>
            <button
              type="button"
              onClick={() => setBackupRestoreModalOpen(true)}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold border cursor-pointer hover:opacity-80 transition-opacity ${
                hasGSheetWebhook
                  ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                  : 'text-amber-700 bg-amber-50 border-amber-200'
              }`}
            >
              <FileSpreadsheet className="w-3 h-3" />
              <span>Tier 3: Google Sheets {hasGSheetWebhook ? '(Live Hook)' : '(Configure URL)'}</span>
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Manual Backup & Restore Data */}
          <button
            onClick={() => setBackupRestoreModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-xs font-extrabold flex items-center gap-1.5 shadow-2xs cursor-pointer transition-all"
            title="Open Backup & Restore Center (JSON Export/Import, Cloud Snapshots & Google Sheets Webhook)"
          >
            <Database className="w-4 h-4 text-indigo-600" />
            <span>Backup & Restore</span>
          </button>

          {/* Export to Google Sheet */}
          {onOpenGoogleSheetsExport && (
            <button
              onClick={onOpenGoogleSheetsExport}
              className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-extrabold flex items-center gap-1.5 shadow-2xs cursor-pointer transition-all"
              title="Export Students & Leads directly to Google Sheets"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Export to Google Sheet</span>
            </button>
          )}

          <button
            onClick={() => onOpenStudentModal()}
            className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs cursor-pointer transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>New Student Admission</span>
          </button>
          <button
            onClick={() => exportCsvFile(state, 'students')}
            className="px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all"
            title="Download CSV"
          >
            <Download className="w-3.5 h-3.5 text-blue-600" />
            <span>CSV</span>
          </button>
          <button
            onClick={() => exportMasterExcelFile(state)}
            className="px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all"
            title="Export 5-Tab Excel Workbook"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Master Excel (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* Filter, Search & Bulk Actions Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search Input */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Search Name / ID / Phone
            </label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="e.g. Omkar, SSMI-2026-001..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white transition-all font-medium"
              />
            </div>
          </div>

          {/* Filter by Batch */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Filter by Batch
            </label>
            <select
              value={batchFilter}
              onChange={(e) => setBatchFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white font-medium"
            >
              <option value="">All Batches</option>
              <option value="__UNASSIGNED__">⚠️ Unassigned to Batch Only</option>
              {state.batches.map(b => (
                <option key={b.code} value={b.code}>
                  {b.code} — {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Filter by Status */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Enrollment Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white font-medium"
            >
              <option value="ACTIVE_DEFAULT">Active & On-Hold (Hide Archived)</option>
              <option value="Active">Active Only</option>
              <option value="On Hold">On Hold</option>
              <option value="Completed">Completed</option>
              <option value="Archived">Archived</option>
              <option value="ALL">All Records</option>
            </select>
          </div>

          {/* Sort By */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Sort By
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white font-medium"
            >
              <option value="regId_asc">Student ID (Ascending)</option>
              <option value="name_asc">Name (A → Z)</option>
              <option value="enrollDate_desc">Enrollment Date (Newest)</option>
              <option value="balance_desc">Pending Fee Balance (Highest)</option>
            </select>
          </div>
        </div>

        {/* Mobile-Only Horizontal Filter Chips (Strictly hidden on Desktop md:hidden) */}
        <div className="flex md:hidden items-center gap-2 overflow-x-auto whitespace-nowrap pb-1 -mx-1 px-1">
          {[
            { id: 'ACTIVE_DEFAULT', label: 'Active & Hold' },
            { id: 'Active', label: 'Active Only' },
            { id: 'On Hold', label: 'On Hold' },
            { id: 'Completed', label: 'Completed' },
            { id: 'Archived', label: 'Archived' },
            { id: 'ALL', label: 'All Records' }
          ].map(chip => (
            <button
              key={chip.id}
              type="button"
              onClick={() => setStatusFilter(chip.id)}
              className={`px-3.5 py-2 rounded-full text-xs font-extrabold shrink-0 cursor-pointer transition-all ${
                statusFilter === chip.id
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 border border-slate-200'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Bulk Action Strip */}
        {selectedIds.length > 0 && (
          <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="font-extrabold text-blue-900">
              ⚡ {selectedIds.length} student(s) selected:
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={bulkBatchSelect}
                onChange={(e) => setBulkBatchSelect(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-900 font-medium"
              >
                <option value="">Assign Batch...</option>
                {state.batches.map(b => (
                  <option key={b.code} value={b.code}>{b.code}</option>
                ))}
              </select>
              <button
                onClick={() => {
                  if (bulkBatchSelect) {
                    onBulkAssignBatch(selectedIds, bulkBatchSelect);
                    setSelectedIds([]);
                  }
                }}
                disabled={!bulkBatchSelect}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold cursor-pointer transition-colors shadow-2xs"
              >
                Assign Batch
              </button>
              <button
                onClick={() => {
                  onBulkQueueWhatsApp(selectedIds);
                  setSelectedIds([]);
                }}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer transition-colors shadow-2xs"
              >
                💬 Add to WA Queue
              </button>
              <button
                onClick={() => {
                  onBulkArchive(selectedIds);
                  setSelectedIds([]);
                }}
                className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 font-semibold border border-slate-200 cursor-pointer"
              >
                📦 Archive
              </button>
              <button
                onClick={() => setSelectedIds([])}
                className="px-2.5 py-1.5 text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Desktop High-Contrast Light Responsive Table (Strictly isolated to Desktop: hidden md:block) */}
      <div className="hidden md:block bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto max-h-[70vh]">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-50 shadow-[0_1px_0_0_#e2e8f0]">
              <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider">
                <th className="p-3.5 w-10 text-center">
                  <button onClick={toggleSelectAll} className="cursor-pointer text-slate-400 hover:text-slate-800">
                    {allSelected ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4" />}
                  </button>
                </th>
                <th className="p-3.5">Student ID & Name</th>
                <th className="p-3.5">Contact & WhatsApp</th>
                <th className="p-3.5">Course & Batch</th>
                <th className="p-3.5">Enrollment & Status</th>
                <th className="p-3.5">Fee Status</th>
                <th className="p-3.5 text-right">Quick Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-xs text-slate-400">
                    No student records match your current search and filters.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((s) => {
                  const paid = Math.max(0, Math.round((s.milestones || []).filter(m => m.status === 'Paid').reduce((a, b) => a + b.amount, 0)));
                  const balance = Math.max(0, Math.round(s.netFee - paid));
                  const isChecked = selectedIds.includes(s.id);

                  return (
                    <tr
                      key={s.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="p-3.5 text-center">
                        <button onClick={() => toggleSelectStudent(s.id)} className="cursor-pointer text-slate-400 hover:text-slate-800">
                          {isChecked ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="p-3.5">
                        <div className="font-mono-code text-[11px] font-bold text-blue-600">
                          {s.regId}
                        </div>
                        <div
                          onClick={() => onOpenStudent360(s.id)}
                          className="font-extrabold text-sm text-slate-900 hover:text-blue-600 cursor-pointer transition-colors"
                        >
                          {s.name}
                        </div>
                        <div className="text-[11px] text-slate-400 font-medium">{s.address || 'Pune'}</div>
                      </td>
                      <td className="p-3.5">
                        <div className="font-mono-code text-xs font-semibold text-slate-800">📱 {s.phone}</div>
                        <div className="text-[11px] text-slate-400">{s.email || '—'}</div>
                      </td>
                      <td className="p-3.5">
                        <div className="font-bold text-slate-800">{s.course}</div>
                        <div className="mt-1">
                          {s.batch ? (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono-code font-bold bg-blue-50 text-blue-700 border border-blue-200">
                              {s.batch}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              ⚠️ Unassigned
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3.5">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            s.status === 'Active'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : s.status === 'Archived'
                              ? 'bg-slate-100 text-slate-600 border border-slate-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {s.status}
                        </span>
                        <div className="text-[11px] text-slate-400 font-mono-code mt-1">
                          Joined: {s.enrollDate}
                        </div>
                      </td>
                      <td className="p-3.5">
                        <div className="text-slate-600 text-xs">
                          Paid: <strong className="font-mono-code text-emerald-700 font-bold">₹{paid.toLocaleString('en-IN')}</strong> / ₹{s.netFee.toLocaleString('en-IN')}
                        </div>
                        <div className="text-xs font-extrabold mt-0.5">
                          {balance > 0 ? (
                            <span className="text-rose-600">Due: ₹{balance.toLocaleString('en-IN')}</span>
                          ) : (
                            <span className="text-emerald-700">✓ Fully Cleared</span>
                          )}
                        </div>
                      </td>
                      <td className="p-3.5 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => onOpenWaStudioForContact('student', s.id, 'Upcoming Lecture Reminder')}
                            className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 cursor-pointer transition-colors"
                            title="Open WhatsApp Click-to-Chat"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onOpenStudent360(s.id)}
                            className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 cursor-pointer transition-colors"
                            title="View 360° Profile Dossier"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onOpenStudentModal(s.id)}
                            className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 cursor-pointer transition-colors"
                            title="Edit Student Admission"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onOpenFeeModal(s.id)}
                            className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 cursor-pointer transition-colors"
                            title="Record Payment / Manage Milestones"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onDeleteStudent(s.id)}
                            className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 cursor-pointer transition-colors"
                            title="Delete Student Record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile-Only Card View (Strictly hidden on Desktop: block md:hidden) */}
      <div className="grid grid-cols-1 gap-3 md:hidden">
        {filteredStudents.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-400">
            No student records match your current search and filters.
          </div>
        ) : (
          filteredStudents.map((s) => {
            const paid = Math.max(0, Math.round((s.milestones || []).filter(m => m.status === 'Paid').reduce((a, b) => a + b.amount, 0)));
            const balance = Math.max(0, Math.round(s.netFee - paid));
            const cleanDigits = (s.phone || '').replace(/\D/g, '').slice(-10);

            return (
              <div
                key={s.id}
                className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3"
              >
                {/* Card Header: Name, RegID, Batch & Status Badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono-code text-xs font-extrabold text-blue-600">
                        {s.regId}
                      </span>
                      {s.batch ? (
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-mono-code font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          {s.batch}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          Unassigned
                        </span>
                      )}
                    </div>
                    <h3
                      onClick={() => onOpenStudent360(s.id)}
                      className="text-base font-black text-slate-900 mt-1 cursor-pointer hover:text-blue-600 break-words"
                    >
                      {s.name}
                    </h3>
                    <div className="text-xs font-bold text-slate-600 mt-0.5">{s.course}</div>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-extrabold shrink-0 ${
                      s.status === 'Active'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : s.status === 'Archived'
                        ? 'bg-slate-100 text-slate-600 border border-slate-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}
                  >
                    {s.status}
                  </span>
                </div>

                {/* Key Metrics Body: 2-Column Grid */}
                <div className="grid grid-cols-2 gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
                  <div>
                    <div className="text-[11px] font-bold text-slate-400 uppercase">Mobile</div>
                    <a
                      href={cleanDigits ? `tel:+91${cleanDigits}` : '#'}
                      className="inline-block font-mono-code font-bold text-blue-700 mt-0.5"
                    >
                      📱 {s.phone || '—'}
                    </a>
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-slate-400 uppercase">Locality</div>
                    <div className="font-bold text-slate-800 mt-0.5 truncate">{s.address || 'Pune'}</div>
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-slate-400 uppercase">Paid Fee</div>
                    <div className="font-mono-code font-black text-emerald-700 mt-0.5">
                      ₹{paid.toLocaleString('en-IN')} <span className="text-slate-400 font-normal">/ ₹{s.netFee.toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-slate-400 uppercase">Balance Due</div>
                    <div className={`font-mono-code font-black mt-0.5 ${balance > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                      {balance > 0 ? `₹${balance.toLocaleString('en-IN')}` : '✓ Cleared'}
                    </div>
                  </div>
                </div>

                {/* Direct Thumb Actions Footer (>=44px touch targets) */}
                <div className="pt-2 border-t border-slate-100 grid grid-cols-3 gap-2">
                  <a
                    href={cleanDigits ? `https://wa.me/91${cleanDigits}` : '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      if (!cleanDigits) {
                        e.preventDefault();
                        onOpenWaStudioForContact('student', s.id, 'Upcoming Lecture Reminder');
                      }
                    }}
                    className="min-h-[44px] flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-extrabold"
                    title="WhatsApp"
                  >
                    <MessageCircle className="w-4 h-4 shrink-0" />
                    <span>WhatsApp</span>
                  </a>
                  <a
                    href={cleanDigits ? `tel:+91${cleanDigits}` : '#'}
                    className="min-h-[44px] flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 text-xs font-extrabold"
                    title="Call Student"
                  >
                    <PhoneCall className="w-4 h-4 shrink-0" />
                    <span>Call</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => onOpenFeeModal(s.id)}
                    className="min-h-[44px] flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-extrabold cursor-pointer"
                  >
                    <CreditCard className="w-4 h-4 shrink-0" />
                    <span>Fees</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenStudent360(s.id)}
                    className="min-h-[44px] flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-slate-50 text-slate-700 border border-slate-200 text-xs font-extrabold cursor-pointer"
                  >
                    <Eye className="w-4 h-4 shrink-0" />
                    <span>360°</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenStudentModal(s.id)}
                    className="min-h-[44px] flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 text-xs font-extrabold cursor-pointer"
                  >
                    <Edit2 className="w-4 h-4 shrink-0" />
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteStudent(s.id)}
                    className="min-h-[44px] flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-xs font-extrabold cursor-pointer"
                    title="Delete Student"
                  >
                    <Trash2 className="w-4 h-4 shrink-0" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Manual Backup & Restore Modal */}
      <StudentBackupRestoreModal
        isOpen={backupRestoreModalOpen}
        onClose={() => setBackupRestoreModalOpen(false)}
        students={state.students}
        onRestoreStudents={(restored, msg) => {
          if (onRestoreStudents) {
            onRestoreStudents(restored, msg);
          }
        }}
        onToast={(msg) => {
          if (onToast) {
            onToast(msg);
          }
        }}
      />
    </div>
  );
};
