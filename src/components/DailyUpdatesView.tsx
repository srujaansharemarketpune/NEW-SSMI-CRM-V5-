import React, { useState } from 'react';
import { AppState, LectureSession, DailyQueueItem } from '../types';
import {
  Calendar,
  AlertTriangle,
  Clock,
  Plus,
  Send,
  Copy,
  Trash2,
  CheckCircle2,
  MessageCircle
} from 'lucide-react';

interface DailyUpdatesViewProps {
  state: AppState;
  onOpenScheduleModal: () => void;
  onAddToQueue: (items: DailyQueueItem[]) => void;
  onClearSentQueue: () => void;
  onRemoveQueueItem: (id: string) => void;
  onUpdateQueueItemStatus: (id: string, status: 'Prepared' | 'Chat Opened' | 'Marked Sent') => void;
  onOpenWaStudioForContact: (type: 'student' | 'lead', id: string, scenarioHint?: string) => void;
}

export const DailyUpdatesView: React.FC<DailyUpdatesViewProps> = ({
  state,
  onOpenScheduleModal,
  onAddToQueue,
  onClearSentQueue,
  onRemoveQueueItem,
  onUpdateQueueItemStatus,
  onOpenWaStudioForContact
}) => {
  const [calendarMode, setCalendarMode] = useState<'day' | 'week' | 'month'>('week');
  const [targetGroup, setTargetGroup] = useState<string>('BATCH_SINGLE');
  const [selectedBatch, setSelectedBatch] = useState<string>(state.batches[0]?.code || 'OCT-MTB-01');
  const [updateScenario, setUpdateScenario] = useState<string>('Upcoming Lecture Reminder');
  const [updateTime, setUpdateTime] = useState<string>('08:00 AM - 10:00 AM');
  const [updateTopic, setUpdateTopic] = useState<string>('Price Action Live Market Review');

  // Conflict Detector
  const detectConflicts = () => {
    const conflicts: string[] = [];
    const lecs = state.lectures;
    for (let i = 0; i < lecs.length; i++) {
      for (let j = i + 1; j < lecs.length; j++) {
        if (lecs[i].date === lecs[j].date && lecs[i].time === lecs[j].time) {
          if (lecs[i].instructor === lecs[j].instructor) {
            conflicts.push(
              `⚠️ Double-Booking Alert: ${lecs[i].instructor} is booked for both ${lecs[i].batchCode} and ${lecs[j].batchCode} at ${lecs[i].time} on ${lecs[i].date}!`
            );
          }
        }
      }
    }
    return conflicts;
  };

  const conflicts = detectConflicts();

  // Matched recipients count for broadcast
  const getMatchedRecipients = () => {
    if (targetGroup === 'BATCH_SINGLE') {
      return state.students.filter(s => s.status === 'Active' && s.batch === selectedBatch);
    }
    if (targetGroup === 'BATCH_ALL') {
      return state.students.filter(s => s.status === 'Active');
    }
    if (targetGroup === 'OVERDUE_FEES') {
      return state.students.filter(s => {
        const paid = (s.milestones || []).filter(m => m.status === 'Paid').reduce((a, b) => a + b.amount, 0);
        return s.status === 'Active' && s.netFee - paid > 0;
      });
    }
    return state.students.filter(s => s.status === 'Active' && s.batch === selectedBatch);
  };

  const matchedStudents = getMatchedRecipients();

  const handleGenerateQueue = () => {
    const today = new Date().toISOString().split('T')[0];
    const newItems: DailyQueueItem[] = matchedStudents.map((s, idx) => ({
      id: `DQ-${Date.now()}-${idx}`,
      date: today,
      recipientType: 'Student',
      recipientId: s.id,
      recipientName: s.name,
      phone: s.whatsapp || `+91${s.phone.replace(/\D/g, '').slice(-10)}`,
      batchCode: s.batch || 'Classroom',
      scenario: updateScenario,
      message: `Hello ${s.name}! Reminder from *${state.settings.instituteName}* regarding your *${s.course}* session on ${today} at ${updateTime}. Topic: ${updateTopic}. Please bring your workbook and join on time.`,
      status: 'Prepared',
      updatedAt: new Date().toLocaleTimeString()
    }));

    onAddToQueue(newItems);
  };

  return (
    <div className="space-y-4">
      {/* Title Bar */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
            <span>Lecture Timetable, Conflict Detector & Daily Update Hub</span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
              Interactive Timetable
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Classroom scheduling, teacher double-booking detector & personalized WhatsApp broadcast queue
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Calendar View Mode */}
          <div className="p-1 rounded-xl bg-slate-100 border border-slate-200 flex items-center gap-1">
            {(['day', 'week', 'month'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setCalendarMode(mode)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer capitalize transition-all ${
                  calendarMode === mode ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <button
            onClick={onOpenScheduleModal}
            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Schedule Lecture</span>
          </button>
        </div>
      </div>

      {/* Automatic Conflict Detector Alert Banner */}
      {conflicts.length > 0 && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 space-y-1.5 text-xs text-rose-900 shadow-xs">
          <div className="flex items-center gap-2 font-black text-rose-700">
            <AlertTriangle className="w-4 h-4 text-rose-600" />
            <span>Schedule Conflict Warning:</span>
          </div>
          {conflicts.map((c, i) => (
            <div key={i} className="pl-6 font-medium text-rose-800">{c}</div>
          ))}
        </div>
      )}

      {/* Timetable Schedule Grid */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-600" />
            <span>Master Lecture Schedule ({state.lectures.length} Sessions)</span>
          </h3>
          <div className="flex items-center gap-3 text-xs font-semibold">
            <span className="flex items-center gap-1.5 text-slate-700">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Completed
            </span>
            <span className="flex items-center gap-1.5 text-slate-700">
              <span className="w-2 h-2 rounded-full bg-indigo-500"></span> Scheduled
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {state.lectures.map((l) => (
            <div
              key={l.id}
              className={`p-4 rounded-xl border text-xs space-y-2.5 transition-all ${
                l.status === 'Completed'
                  ? 'bg-emerald-50/30 border-emerald-200 hover:border-emerald-300'
                  : 'bg-slate-50/70 border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {l.batchCode}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    l.status === 'Completed'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-blue-50 text-blue-700 border border-blue-200'
                  }`}
                >
                  {l.status}
                </span>
              </div>
              <div className="font-extrabold text-slate-900 text-xs leading-snug">{l.topic}</div>
              <div className="text-[11px] text-slate-500">Instructor: {l.instructor}</div>
              <div className="pt-2 border-t border-slate-200/70 flex items-center justify-between text-[11px] text-slate-600">
                <span>📅 {l.date}</span>
                <span className="font-mono font-bold text-slate-800">⏰ {l.time}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2-Column Broadcast Preparation & Recipient Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Broadcast Generator */}
        <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs p-5 space-y-4">
          <h3 className="text-sm font-extrabold text-slate-900 pb-3 border-b border-slate-100">
            1. Configure Daily Broadcast & Match Recipients
          </h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Target Group
              </label>
              <select
                value={targetGroup}
                onChange={(e) => setTargetGroup(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="BATCH_SINGLE">Single Batch</option>
                <option value="BATCH_ALL">All Active Batches</option>
                <option value="OVERDUE_FEES">Students with Overdue Fees</option>
              </select>
            </div>

            {targetGroup === 'BATCH_SINGLE' && (
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Select Batch
                </label>
                <select
                  value={selectedBatch}
                  onChange={(e) => setSelectedBatch(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {state.batches.map(b => (
                    <option key={b.code} value={b.code}>
                      {b.code} — {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Lecture Time Slot
              </label>
              <input
                type="text"
                value={updateTime}
                onChange={(e) => setUpdateTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Lecture Topic / Highlight
              </label>
              <input
                type="text"
                value={updateTopic}
                onChange={(e) => setUpdateTopic(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-indigo-600 font-extrabold">
              ⚡ {matchedStudents.length} student(s) matched
            </span>
            <button
              onClick={handleGenerateQueue}
              disabled={matchedStudents.length === 0}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-black cursor-pointer shadow-xs transition-colors"
            >
              Generate Queue ({matchedStudents.length})
            </button>
          </div>
        </div>

        {/* Right: Prepared Recipient Queue */}
        <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <span>2. Prepared WhatsApp Queue</span>
                <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {state.dailyQueue.length} Queued
                </span>
              </h3>
              <button
                onClick={onClearSentQueue}
                className="text-xs text-slate-500 hover:text-slate-800 font-semibold cursor-pointer transition-colors"
              >
                Clear Sent
              </button>
            </div>

            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
              {state.dailyQueue.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 italic">
                  Queue is empty. Select target recipients on the left and click "Generate Queue".
                </div>
              ) : (
                state.dailyQueue.map((item) => (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <strong className="text-slate-900 font-bold">{item.recipientName}</strong>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          item.status === 'Marked Sent'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">{item.message}</p>
                    <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between gap-1">
                      <span className="font-mono text-[10px] text-slate-500">{item.phone}</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            const clean = item.phone.replace(/\D/g, '');
                            const url = `https://wa.me/${clean}?text=${encodeURIComponent(item.message)}`;
                            window.open(url, '_blank');
                            onUpdateQueueItemStatus(item.id, 'Chat Opened');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <MessageCircle className="w-3 h-3" />
                          <span>Open WA</span>
                        </button>
                        <button
                          onClick={() => onUpdateQueueItemStatus(item.id, 'Marked Sent')}
                          className="p-1 text-slate-400 hover:text-emerald-600 cursor-pointer transition-colors"
                          title="Mark Sent"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onRemoveQueueItem(item.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer transition-colors"
                          title="Remove"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
