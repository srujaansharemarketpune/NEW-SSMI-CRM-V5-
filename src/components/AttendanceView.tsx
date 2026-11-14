import React, { useState } from 'react';
import { AppState, AttendanceRecord } from '../types';
import {
  CheckCircle2,
  XCircle,
  AlertOctagon,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  Download,
  Phone
} from 'lucide-react';
import { exportCsvFile } from '../services/db';

interface AttendanceViewProps {
  state: AppState;
  onMarkAttendance: (batchCode: string, date: string, studentId: string, status: AttendanceRecord['status'], note?: string) => void;
  onBulkMarkBatch: (batchCode: string, date: string, status: AttendanceRecord['status']) => void;
  onToggleExcusedRule: (exclude: boolean) => void;
  onOpenWaStudioForContact: (type: 'student' | 'lead', id: string, scenarioHint?: string) => void;
}

export const AttendanceView: React.FC<AttendanceViewProps> = ({
  state,
  onMarkAttendance,
  onBulkMarkBatch,
  onToggleExcusedRule,
  onOpenWaStudioForContact
}) => {
  const [subView, setSubView] = useState<'register' | 'reports' | 'alerts' | 'history'>('register');
  const [selectedBatch, setSelectedBatch] = useState<string>(state.batches[0]?.code || 'OCT-MTB-01');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const enrolledStudents = state.students.filter(s => s.batch === selectedBatch && s.status !== 'Archived');
  const sessionKey = `${selectedBatch}_${selectedDate}`;
  const currentSession = state.attendance[sessionKey] || { sessionStatus: 'Completed', topic: '', records: {} };

  // Date nav helper
  const changeDateByDays = (delta: number) => {
    if (delta === 0) {
      setSelectedDate(new Date().toISOString().split('T')[0]);
      return;
    }
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + delta);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  // Student Attendance Stats Helper
  const getStudentStats = (studentId: string, batchCode: string) => {
    let conducted = 0;
    let present = 0;
    let late = 0;
    let absent = 0;
    let excused = 0;
    let consecutive = 0;

    Object.keys(state.attendance)
      .filter(k => k.startsWith(batchCode + '_'))
      .sort()
      .forEach(k => {
        const sess = state.attendance[k];
        if (sess.sessionStatus === 'Cancelled') return;
        const rec = sess.records?.[studentId];
        if (!rec) return;

        if (rec.status === 'Present') {
          conducted++;
          present++;
          consecutive = 0;
        } else if (rec.status === 'Late') {
          conducted++;
          late++;
          consecutive = 0;
        } else if (rec.status === 'Absent') {
          conducted++;
          absent++;
          consecutive++;
        } else if (rec.status === 'Excused Leave') {
          excused++;
          if (!state.excusedLeaveExcludedFromTotal) conducted++;
          consecutive = 0;
        }
      });

    const attended = present + late;
    const percentage = conducted > 0 ? Math.round((attended / conducted) * 100) : 100;
    return { conducted, present, late, absent, excused, percentage, consecutive };
  };

  return (
    <div className="space-y-4">
      {/* Title Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-lg font-black text-slate-900 tracking-tight">
              Attendance Register & Compliance
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
              Session Ledger
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            One-tap status marking, consecutive absence monitoring, medical leave exclusions & correction audit trail
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          {/* Subview Pills */}
          <div className="p-1 rounded-xl bg-slate-100 border border-slate-200 flex items-center gap-1 overflow-x-auto max-w-full no-scrollbar whitespace-nowrap">
            <button
              onClick={() => setSubView('register')}
              className={`px-3 py-1.5 min-h-[40px] sm:min-h-0 rounded-lg text-xs font-bold cursor-pointer transition-all shrink-0 ${
                subView === 'register' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Mark Register
            </button>
            <button
              onClick={() => setSubView('reports')}
              className={`px-3 py-1.5 min-h-[40px] sm:min-h-0 rounded-lg text-xs font-bold cursor-pointer transition-all shrink-0 ${
                subView === 'reports' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Batch Reports
            </button>
            <button
              onClick={() => setSubView('alerts')}
              className={`px-3 py-1.5 min-h-[40px] sm:min-h-0 rounded-lg text-xs font-bold cursor-pointer transition-all shrink-0 ${
                subView === 'alerts' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Low Att. Alerts
            </button>
            <button
              onClick={() => setSubView('history')}
              className={`px-3 py-1.5 min-h-[40px] sm:min-h-0 rounded-lg text-xs font-bold cursor-pointer transition-all shrink-0 ${
                subView === 'history' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Correction History
            </button>
          </div>

          <button
            onClick={() => exportCsvFile(state, 'attendance')}
            className="px-3.5 py-2 min-h-[44px] sm:min-h-0 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all"
          >
            <Download className="w-3.5 h-3.5 text-blue-600" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* SUBVIEW 1: MARK REGISTER */}
      {subView === 'register' && (
        <div className="space-y-4">
          {/* Register Selector Panel */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Batch Selector */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  1. Select Batch
                </label>
                <select
                  value={selectedBatch}
                  onChange={(e) => setSelectedBatch(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-blue-500 font-medium"
                >
                  {state.batches.map(b => (
                    <option key={b.code} value={b.code}>
                      {b.code} — {b.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Selector with Quick Step Buttons */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    2. Session Date
                  </label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => changeDateByDays(-1)}
                      className="compact-touch-ignore px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-[10px] text-slate-600 cursor-pointer"
                      title="Previous Day"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => changeDateByDays(0)}
                      className="compact-touch-ignore px-2.5 py-1 rounded-md bg-blue-50 text-[10px] text-blue-700 font-bold border border-blue-200 cursor-pointer"
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => changeDateByDays(1)}
                      className="compact-touch-ignore px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-[10px] text-slate-600 cursor-pointer"
                      title="Next Day"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-blue-500 font-mono-code font-medium"
                />
              </div>

              {/* Lecture Topic */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  3. Lecture Topic
                </label>
                <input
                  type="text"
                  defaultValue={currentSession.topic || ''}
                  placeholder="e.g. Price Action BOS & Liquidity"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-blue-500 font-medium"
                />
              </div>

              {/* Session Status */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  4. Session Status
                </label>
                <select
                  defaultValue={currentSession.sessionStatus || 'Completed'}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-blue-500 font-medium"
                >
                  <option value="Completed">✅ Conducted</option>
                  <option value="Scheduled">📅 Scheduled</option>
                  <option value="Cancelled">🚫 Cancelled (Excluded from %)</option>
                </select>
              </div>
            </div>

            {/* Quick Batch Actions & Calculation Rules */}
            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onBulkMarkBatch(selectedBatch, selectedDate, 'Present')}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Mark All Present</span>
                </button>
                <button
                  type="button"
                  onClick={() => onBulkMarkBatch(selectedBatch, selectedDate, 'Absent')}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Mark All Absent</span>
                </button>
                <button
                  type="button"
                  onClick={() => onBulkMarkBatch(selectedBatch, selectedDate, 'Not Marked')}
                  className="px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200 flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Register</span>
                </button>

                <label className="inline-flex items-center gap-2 text-xs text-slate-600 sm:ml-2 cursor-pointer font-medium min-h-[44px] sm:min-h-0">
                  <input
                    type="checkbox"
                    checked={state.excusedLeaveExcludedFromTotal}
                    onChange={(e) => onToggleExcusedRule(e.target.checked)}
                    className="rounded bg-white border-slate-300 text-blue-600 focus:ring-0 cursor-pointer"
                  />
                  <span>Exclude 'Excused Leave' from required classes when computing %</span>
                </label>
              </div>

              <span className="text-xs font-mono-code text-emerald-700 font-bold">
                ✓ Auto-saved to local IndexedDB
              </span>
            </div>
          </div>

          {/* Attendance Register Desktop Table */}
          <div className="hidden md:block bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto max-h-[70vh]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-50 shadow-[0_1px_0_0_#e2e8f0]">
                  <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider">
                    <th className="p-3.5">Student ID & Name</th>
                    <th className="p-3.5">One-Tap Attendance Status</th>
                    <th className="p-3.5">Remark / Note</th>
                    <th className="p-3.5">Batch Attendance %</th>
                    <th className="p-3.5">Consecutive Absences</th>
                    <th className="p-3.5 text-right">WhatsApp Care</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {enrolledStudents.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-10 text-center text-xs text-slate-400">
                        No active students currently enrolled in batch {selectedBatch}.
                      </td>
                    </tr>
                  ) : (
                    enrolledStudents.map((s) => {
                      const rec = currentSession.records?.[s.id];
                      const currentStatus = rec?.status || 'Not Marked';
                      const currentNote = rec?.note || '';
                      const stats = getStudentStats(s.id, selectedBatch);

                      return (
                        <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3.5">
                            <strong className="text-slate-900 text-xs font-bold">{s.name}</strong>
                            <div className="font-mono-code text-[11px] text-blue-600">{s.regId}</div>
                          </td>
                          <td className="p-3.5">
                            <div className="flex flex-wrap gap-1.5">
                              {[
                                { label: 'Present', val: 'Present' as const, bg: 'bg-emerald-600 text-white shadow-2xs' },
                                { label: 'Absent', val: 'Absent' as const, bg: 'bg-rose-600 text-white shadow-2xs' },
                                { label: 'Late', val: 'Late' as const, bg: 'bg-amber-600 text-white shadow-2xs' },
                                { label: 'Excused', val: 'Excused Leave' as const, bg: 'bg-purple-600 text-white shadow-2xs' },
                                { label: 'Reset', val: 'Not Marked' as const, bg: 'bg-slate-100 text-slate-600' }
                              ].map((btn) => {
                                const isSelected = currentStatus === btn.val;
                                return (
                                  <button
                                    key={btn.val}
                                    type="button"
                                    onClick={() => onMarkAttendance(selectedBatch, selectedDate, s.id, btn.val, currentNote)}
                                    className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                                      isSelected
                                        ? btn.bg
                                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
                                    }`}
                                  >
                                    {btn.label}
                                  </button>
                                );
                              })}
                            </div>
                          </td>
                          <td className="p-3.5">
                            <input
                              type="text"
                              defaultValue={currentNote}
                              onBlur={(e) => onMarkAttendance(selectedBatch, selectedDate, s.id, currentStatus, e.target.value)}
                              placeholder="Add reason or remark..."
                              className="w-48 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white"
                            />
                          </td>
                          <td className="p-3.5 font-mono-code font-bold">
                            <span
                              className={stats.percentage < 75 ? 'text-rose-600 font-extrabold' : 'text-emerald-700 font-extrabold'}
                            >
                              {stats.percentage}%
                            </span>{' '}
                            <span className="text-[11px] text-slate-400 font-normal">
                              ({stats.present + stats.late}/{stats.conducted})
                            </span>
                          </td>
                          <td className="p-3.5">
                            {stats.consecutive >= 2 ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
                                ⚠️ {stats.consecutive} Absences in row
                              </span>
                            ) : (
                              <span className="font-mono-code text-xs text-slate-500">{stats.consecutive}</span>
                            )}
                          </td>
                          <td className="p-3.5 text-right">
                            <button
                              onClick={() => onOpenWaStudioForContact('student', s.id, currentStatus === 'Absent' ? 'Consecutive Absences' : 'Upcoming Lecture Reminder')}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1 ml-auto cursor-pointer shadow-2xs transition-colors"
                            >
                              <MessageCircle className="w-3 h-3" />
                              <span>WA</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Attendance Register Mobile Cards */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {enrolledStudents.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-xs text-slate-400">
                No active students currently enrolled in batch {selectedBatch}.
              </div>
            ) : (
              enrolledStudents.map((s) => {
                const rec = currentSession.records?.[s.id];
                const currentStatus = rec?.status || 'Not Marked';
                const currentNote = rec?.note || '';
                const stats = getStudentStats(s.id, selectedBatch);
                const cleanTel = (s.phone || s.whatsapp || '').replace(/[^\d+]/g, '');

                return (
                  <div key={s.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-sm font-black text-slate-900 truncate">{s.name}</h3>
                        <div className="font-mono-code text-xs text-blue-600 font-bold mt-0.5">{s.regId}</div>
                        {s.phone && (
                          <a
                            href={`tel:${cleanTel}`}
                            className="inline-flex items-center gap-1 text-xs font-mono-code font-bold text-slate-600 hover:text-blue-600 mt-1"
                          >
                            <Phone className="w-3 h-3 text-blue-500" />
                            <span>{s.phone}</span>
                          </a>
                        )}
                      </div>
                      <div className="text-right shrink-0 space-y-1">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-full text-xs font-mono-code font-black border ${
                            stats.percentage < 75
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}
                        >
                          {stats.percentage}% ({stats.present + stats.late}/{stats.conducted})
                        </span>
                        {stats.consecutive >= 2 && (
                          <div className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
                            ⚠️ {stats.consecutive} Absences
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'Present', val: 'Present' as const, bg: 'bg-emerald-600 text-white border-emerald-600' },
                        { label: 'Absent', val: 'Absent' as const, bg: 'bg-rose-600 text-white border-rose-600' },
                        { label: 'Late', val: 'Late' as const, bg: 'bg-amber-600 text-white border-amber-600' },
                        { label: 'Excused', val: 'Excused Leave' as const, bg: 'bg-purple-600 text-white border-purple-600' },
                        { label: 'Reset', val: 'Not Marked' as const, bg: 'bg-slate-200 text-slate-800 border-slate-300' }
                      ].map((btn) => {
                        const isSelected = currentStatus === btn.val;
                        return (
                          <button
                            key={btn.val}
                            type="button"
                            onClick={() => onMarkAttendance(selectedBatch, selectedDate, s.id, btn.val, currentNote)}
                            className={`min-h-[44px] px-2 py-2 rounded-xl text-xs font-extrabold cursor-pointer transition-all border flex items-center justify-center ${
                              isSelected
                                ? btn.bg
                                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            {btn.label}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => onOpenWaStudioForContact('student', s.id, currentStatus === 'Absent' ? 'Consecutive Absences' : 'Upcoming Lecture Reminder')}
                        className="min-h-[44px] px-2 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-extrabold text-xs flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>WA Care</span>
                      </button>
                    </div>

                    <input
                      type="text"
                      defaultValue={currentNote}
                      onBlur={(e) => onMarkAttendance(selectedBatch, selectedDate, s.id, currentStatus, e.target.value)}
                      placeholder="Add remark / leave reason..."
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-base text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white"
                    />
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* SUBVIEW 2: BATCH REPORTS */}
      {subView === 'reports' && (
        <>
          <div className="hidden md:block bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto max-h-[70vh]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-50 shadow-[0_1px_0_0_#e2e8f0]">
                  <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider">
                    <th className="p-3.5">Student Name</th>
                    <th className="p-3.5">Batch</th>
                    <th className="p-3.5">Conducted</th>
                    <th className="p-3.5">Present</th>
                    <th className="p-3.5">Late</th>
                    <th className="p-3.5">Absent</th>
                    <th className="p-3.5">Excused Leave</th>
                    <th className="p-3.5">Attendance %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {state.students.filter(s => s.status !== 'Archived').map(s => {
                    const stats = getStudentStats(s.id, s.batch);
                    return (
                      <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3.5">
                          <strong className="text-slate-900 text-xs font-bold">{s.name}</strong>
                          <div className="font-mono-code text-[11px] text-blue-600">{s.regId}</div>
                        </td>
                        <td className="p-3.5 font-mono-code text-slate-700">{s.batch || 'Unassigned'}</td>
                        <td className="p-3.5 font-mono-code text-slate-900 font-medium">{stats.conducted}</td>
                        <td className="p-3.5 font-mono-code font-bold text-emerald-700">{stats.present}</td>
                        <td className="p-3.5 font-mono-code font-bold text-amber-700">{stats.late}</td>
                        <td className="p-3.5 font-mono-code font-bold text-rose-700">{stats.absent}</td>
                        <td className="p-3.5 font-mono-code text-purple-700">{stats.excused}</td>
                        <td className="p-3.5">
                          <span
                            className={`font-mono-code font-extrabold text-xs ${
                              stats.percentage < 75 ? 'text-rose-600' : 'text-emerald-700'
                            }`}
                          >
                            {stats.percentage}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:hidden">
            {state.students.filter(s => s.status !== 'Archived').map(s => {
              const stats = getStudentStats(s.id, s.batch);
              return (
                <div key={s.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-black text-slate-900">{s.name}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-mono-code text-xs font-bold text-blue-600">{s.regId}</span>
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono-code text-[11px] font-bold">
                          {s.batch || 'Unassigned'}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-mono-code font-black border ${
                        stats.percentage < 75
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}
                    >
                      {stats.percentage}%
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2 rounded-xl bg-slate-50 border border-slate-200">
                      <div className="text-[10px] font-bold text-slate-400 uppercase">Conducted</div>
                      <div className="font-mono-code text-sm font-black text-slate-900">{stats.conducted}</div>
                    </div>
                    <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200">
                      <div className="text-[10px] font-bold text-emerald-700 uppercase">Present</div>
                      <div className="font-mono-code text-sm font-black text-emerald-700">{stats.present}</div>
                    </div>
                    <div className="p-2 rounded-xl bg-amber-50 border border-amber-200">
                      <div className="text-[10px] font-bold text-amber-700 uppercase">Late</div>
                      <div className="font-mono-code text-sm font-black text-amber-700">{stats.late}</div>
                    </div>
                    <div className="p-2 rounded-xl bg-rose-50 border border-rose-200">
                      <div className="text-[10px] font-bold text-rose-700 uppercase">Absent</div>
                      <div className="font-mono-code text-sm font-black text-rose-700">{stats.absent}</div>
                    </div>
                    <div className="p-2 rounded-xl bg-purple-50 border border-purple-200 col-span-2">
                      <div className="text-[10px] font-bold text-purple-700 uppercase">Excused Leave</div>
                      <div className="font-mono-code text-sm font-black text-purple-700">{stats.excused}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* SUBVIEW 3: LOW ATTENDANCE ALERTS */}
      {subView === 'alerts' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <AlertOctagon className="w-4 h-4 text-rose-600 shrink-0" />
                <span>Students Flagged for Low Attendance (&lt;75%) or Consecutive Absences (≥2)</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Proactive student retention alerts — reach out via prefilled WhatsApp care messages
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {state.students
              .filter(s => s.status !== 'Archived')
              .map(s => ({ student: s, stats: getStudentStats(s.id, s.batch) }))
              .filter(x => x.stats.percentage < 75 || x.stats.consecutive >= 2)
              .map(({ student, stats }) => (
                <div
                  key={student.id}
                  className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <strong className="text-slate-900 text-sm font-bold">{student.name}</strong>{' '}
                    <span className="font-mono-code text-blue-600 font-medium">({student.regId})</span>
                    <div className="text-slate-600 mt-1">
                      Batch: <strong>{student.batch || 'Unassigned'}</strong> • Attendance: <strong className="text-rose-600">{stats.percentage}%</strong> ({stats.present}/{stats.conducted}) • Consecutive Absences: <strong className="text-rose-600">{stats.consecutive}</strong>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    {student.phone && (
                      <a
                        href={`tel:${(student.phone || '').replace(/[^\d+]/g, '')}`}
                        className="min-h-[44px] sm:min-h-0 px-3 py-2 rounded-lg bg-white border border-slate-200 text-blue-700 font-bold flex items-center justify-center gap-1.5"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>Call</span>
                      </a>
                    )}
                    <button
                      onClick={() => onOpenWaStudioForContact('student', student.id, 'Consecutive Absences')}
                      className="flex-1 sm:flex-none min-h-[44px] sm:min-h-0 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>Send WhatsApp Care Check-In</span>
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* SUBVIEW 4: CORRECTION HISTORY */}
      {subView === 'history' && (
        <>
          <div className="hidden md:block bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto max-h-[70vh]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-50 shadow-[0_1px_0_0_#e2e8f0]">
                  <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider">
                    <th className="p-3.5">Timestamp</th>
                    <th className="p-3.5">Student Name</th>
                    <th className="p-3.5">Batch & Date</th>
                    <th className="p-3.5">Status Mutation</th>
                    <th className="p-3.5">Authorized Actor</th>
                    <th className="p-3.5">Correction Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {state.attendanceHistory.map(h => (
                    <tr key={h.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3.5 font-mono-code text-slate-500">{h.timestamp}</td>
                      <td className="p-3.5 font-bold text-slate-900">{h.studentName}</td>
                      <td className="p-3.5 font-mono-code text-slate-600">
                        {h.batchCode} • {h.date}
                      </td>
                      <td className="p-3.5">
                        <span className="px-2 py-0.5 rounded-md text-[10px] bg-rose-50 text-rose-700 border border-rose-200 mr-1.5 font-bold">
                          {h.oldStatus}
                        </span>
                        →
                        <span className="px-2 py-0.5 rounded-md text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 ml-1.5 font-bold">
                          {h.newStatus}
                        </span>
                      </td>
                      <td className="p-3.5 text-slate-700">{h.actor}</td>
                      <td className="p-3.5 text-slate-500">{h.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:hidden">
            {state.attendanceHistory.map(h => (
              <div key={h.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-2 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <strong className="text-sm font-black text-slate-900">{h.studentName}</strong>
                  <span className="font-mono-code text-[11px] text-slate-500">{h.timestamp}</span>
                </div>
                <div className="font-mono-code text-slate-600">
                  {h.batchCode} • {h.date}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded-md text-[11px] bg-rose-50 text-rose-700 border border-rose-200 font-bold">
                    {h.oldStatus}
                  </span>
                  <span className="text-slate-400">→</span>
                  <span className="px-2 py-0.5 rounded-md text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                    {h.newStatus}
                  </span>
                </div>
                <div className="text-slate-600 pt-1 border-t border-slate-100">
                  By <strong>{h.actor}</strong>: {h.note || 'No remark'}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
