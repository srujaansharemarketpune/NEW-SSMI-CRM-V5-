import React, { useState, useRef, useEffect } from 'react';
import { AppState } from '../types';
import { LIVE_TODAY_ISO } from '../data/initialData';
import { AiChatEntry, renderRichMarkdown } from './OmniBotDrawer';
import { NavTabId } from './Navbar';
import { getStudentAttendancePct } from '../services/gemini';
import {
  AlertCircle,
  RotateCcw,
  ExternalLink,
  Send,
  Sparkles,
  GraduationCap,
  UserCheck,
  Target,
  Copy,
  Check
} from 'lucide-react';

interface AiCenterViewProps {
  state: AppState;
  onRunQuery: (query: string) => Promise<void> | void;
  onNavigate?: (tab: NavTabId) => void;
  onConvertLead?: (leadId: string) => void;
  onOpenStudentProfile?: (studentId: string) => void;
  chatLog: AiChatEntry[];
  aiError?: string | null;
  onDismissError?: () => void;
}

export const AiCenterView: React.FC<AiCenterViewProps> = ({
  state,
  onRunQuery,
  onNavigate,
  onConvertLead,
  onOpenStudentProfile,
  chatLog,
  aiError,
  onDismissError
}) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [lastAttemptedQuery, setLastAttemptedQuery] = useState<string>('');
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleCopyMessage = (text: string, idx: number) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(prev => (prev === idx ? null : prev)), 2000);
    }
  };

  useEffect(() => {
    setLocalError(null);
    onDismissError?.();
    const handleResetLoading = () => {
      setIsLoading(false);
      setLocalError(null);
    };
    window.addEventListener('ssm-reset-loading-states', handleResetLoading);
    return () => window.removeEventListener('ssm-reset-loading-states', handleResetLoading);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatLog, isLoading]);

  const activeStudents = state.students.filter(s => s.status === 'Active');
  let overdueCount = 0;
  let overdueValue = 0;
  activeStudents.forEach(s => {
    (s.milestones || []).forEach(m => {
      if (m.status !== 'Paid' && m.dueDate < LIVE_TODAY_ISO) {
        overdueCount++;
        overdueValue += m.amount;
      }
    });
  });

  const dueFollowups = state.leads.filter(
    l => l.followUpDate && l.followUpDate <= LIVE_TODAY_ISO && !['Admission Confirmed', 'Lost', 'Not Interested'].includes(l.stage)
  );

  const lowAttendanceStudents = activeStudents.filter(s => getStudentAttendancePct(s.id, state) < 75);

  const executeQuery = async (queryText: string) => {
    const trimmed = queryText.trim();
    if (!trimmed || isLoading) return;
    setLastAttemptedQuery(trimmed);
    setLocalError(null);
    onDismissError?.();
    setIsLoading(true);
    try {
      await onRunQuery(trimmed);
    } catch {
      setLocalError(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const q = input.trim();
    setInput('');
    await executeQuery(q);
  };

  const activeError = aiError || localError;

  const quickPrompts = [
    'Change the instructor of Master Price Action to Prasad Bhunje',
    'Show me enrolled students and get a complete database snapshot',
    "What is today's Nifty trend and key institutional support/resistance levels?",
    "Update Monika Patil's batch to Pro Trader Morning and set fees paid to 15000",
    'List all students with overdue fee installments and draft a polite Marathi & English reminder',
    'Mark all students in batch OCT-MTB-01 Present for today'
  ];

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-950 rounded-2xl p-4 sm:p-5 text-white shadow-md border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[11px] font-bold border border-indigo-400/20">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>CANDLE AI COPILOT • GEMINI 2.5 FLASH-LITE (FREE TIER) &amp; FULL APP CRUD</span>
          </div>
          <h1 className="text-lg sm:text-xl font-extrabold tracking-tight">
            Candle AI — God-Mode Database & Trading Strategy Engine
          </h1>
          <p className="text-xs text-slate-300 max-w-2xl">
            Connected directly to Gemini Flash with full application CRUD (courses, students, leads, fees, attendance, settings) and live market search grounding.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isLoading}
            onClick={() => executeQuery('Show me enrolled students and get a complete database snapshot')}
            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs shadow-sm transition-colors cursor-pointer"
          >
            ⚡ Run Live Database Snapshot
          </button>
        </div>
      </div>

      {/* Main Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Real-Time Operational Signals */}
        <div className="lg:col-span-5 space-y-3">
          <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs space-y-3">
            <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <span>📡 Live Institute Telemetry</span>
            </h3>

            {/* Card 1: Overdue Fee Recovery */}
            <div className="p-3.5 rounded-xl bg-rose-50/70 border border-rose-200/80 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-rose-700">
                  Overdue Fee Installments
                </span>
                <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-extrabold font-mono">
                  {overdueCount} Milestones
                </span>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">
                <strong>₹{overdueValue.toLocaleString('en-IN')}</strong> in pending installments have crossed their scheduled due date.
              </p>
              <button
                type="button"
                disabled={isLoading}
                onClick={() =>
                  executeQuery(
                    'Analyze all students with overdue fee installments and generate personalized WhatsApp fee reminder templates in English and Marathi.'
                  )
                }
                className="text-[11px] font-extrabold text-rose-700 hover:underline cursor-pointer"
              >
                Ask Gemini to Audit Overdue Accounts →
              </button>
            </div>

            {/* Card 2: Lead Pipeline Conversion */}
            <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200/80 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-800">
                  CRM Follow-up Priority
                </span>
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-extrabold font-mono">
                  {dueFollowups.length} Due Today
                </span>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">
                {dueFollowups.length > 0
                  ? `Leads requiring immediate counselor call: ${dueFollowups.map(l => l.name).join(', ')}.`
                  : 'All scheduled lead follow-ups for today are clear.'}
              </p>
              <button
                type="button"
                disabled={isLoading}
                onClick={() =>
                  executeQuery(
                    'List our open CRM leads due for follow-up and provide a counseling call script to convert them into confirmed admissions.'
                  )
                }
                className="text-[11px] font-extrabold text-amber-800 hover:underline cursor-pointer"
              >
                Generate Lead Conversion Strategy →
              </button>
            </div>

            {/* Card 3: Attendance Retention */}
            <div className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-200/80 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-800">
                  Academic Retention Watch
                </span>
                <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-900 text-[10px] font-extrabold font-mono">
                  {lowAttendanceStudents.length} Below 75%
                </span>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">
                {lowAttendanceStudents.length > 0
                  ? `Students needing revision lab support: ${lowAttendanceStudents.map(s => `${s.name} (${getStudentAttendancePct(s.id, state)}%)`).join(', ')}.`
                  : 'All active students are maintaining ≥ 75% attendance.'}
              </p>
              <button
                type="button"
                disabled={isLoading}
                onClick={() =>
                  executeQuery(
                    'Identify students with attendance below 75% and suggest a structured revision batch schedule and supportive message.'
                  )
                }
                className="text-[11px] font-extrabold text-indigo-700 hover:underline cursor-pointer"
              >
                Analyze Student Attendance →
              </button>
            </div>
          </div>

          {/* Suggested Prompts */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs space-y-2.5">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
              Suggested God-Mode Gemini Commands
            </h4>
            <div className="flex flex-col gap-1.5">
              {quickPrompts.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={isLoading}
                  onClick={() => executeQuery(p)}
                  className="text-left px-3 py-2 rounded-xl bg-slate-50 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200/80 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                >
                  💬 "{p}"
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Interactive Live Chat Stream */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/90 shadow-xs flex flex-col h-[580px] overflow-hidden">
          <div className="p-3.5 bg-slate-900 text-white flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-black text-sm">
                🕯️
              </div>
              <div>
                <h3 className="font-bold text-sm">SSMI Executive AI — Operations Console</h3>
                <p className="text-[11px] text-slate-400">
                  Autonomous CRM Read/Write/Convert/Delete &amp; Live Google Search Grounding
                </p>
              </div>
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
              🟢 Live DB + Web Connected • Admin: Prasad Sir
            </span>
          </div>

          <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-50/50">
            {chatLog.map((msg, i) => (
              <div
                key={i}
                className={`p-3.5 rounded-2xl text-xs shadow-2xs ${
                  msg.sender === 'user'
                    ? 'bg-indigo-950 text-white ml-12 rounded-br-xs'
                    : 'bg-white border border-slate-200/90 text-slate-700 mr-8 rounded-bl-xs'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] opacity-85 mb-1.5 font-semibold gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span>{msg.sender === 'user' ? '👤 Prasad Sir' : '🕯️ SSMI Executive AI'}</span>
                    {msg.sender === 'ai' && (
                      <span
                        className={`px-1.5 py-0.2 rounded text-[9px] font-extrabold border ${
                          msg.actions && msg.actions.some(a => a.toolName !== 'googleSearch')
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : msg.sources && msg.sources.length > 0
                            ? 'bg-blue-50 text-blue-800 border-blue-200'
                            : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                        }`}
                      >
                        {msg.actions && msg.actions.some(a => a.toolName !== 'googleSearch')
                          ? '🗄️ Verified CRM Database'
                          : msg.sources && msg.sources.length > 0
                          ? '🌐 Google Search Grounded'
                          : '🧠 AI Reasoning'}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {msg.sender === 'ai' && (
                      <button
                        type="button"
                        onClick={() => handleCopyMessage(msg.text, i)}
                        className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 border border-slate-200 inline-flex items-center gap-1 text-[9px] font-bold cursor-pointer transition-colors"
                        title="Copy AI response"
                      >
                        {copiedIdx === i ? (
                          <>
                            <Check className="w-2.5 h-2.5 text-emerald-600" />
                            <span className="text-emerald-700">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-2.5 h-2.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    )}
                    <span>{msg.time}</span>
                  </div>
                </div>

                {((msg.actions && msg.actions.length > 0) || (msg.sources && msg.sources.length > 0)) && (
                  <div className="mb-2.5 space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {msg.actions?.map((act, ai) => (
                        <div
                          key={ai}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-extrabold"
                        >
                          <span>{act.actionLabel || `✅ ${act.toolName}`}</span>
                          <span className="font-mono text-[9px] text-emerald-600 bg-white px-1.5 py-0.2 rounded border border-emerald-200">
                            {act.statusTag || `[Executing: ${act.toolName} -> Done]`}
                          </span>
                        </div>
                      ))}
                      {msg.sources &&
                        msg.sources.length > 0 &&
                        !msg.actions?.some(a => a.actionLabel === '🌐 Web Grounded') && (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-[10px] font-extrabold">
                            <span>🌐 Web Grounded</span>
                            <span className="font-mono text-[9px] text-blue-600 bg-white px-1.5 py-0.2 rounded border border-blue-200">
                              {msg.sources.length} Live Source{msg.sources.length > 1 ? 's' : ''}
                            </span>
                          </div>
                        )}
                    </div>

                    {msg.actions
                      ?.filter(act => Boolean(act.actionCard))
                      .map((act, cardIdx) => {
                        const card = act.actionCard!;
                        const isInquiry = card.recordType === 'inquiry';
                        return (
                          <div
                            key={`aicard-${cardIdx}`}
                            className={`p-3 rounded-xl border space-y-2 shadow-2xs ${
                              isInquiry
                                ? 'bg-amber-50/70 border-amber-200 text-slate-800'
                                : 'bg-emerald-50/70 border-emerald-200 text-slate-800'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider shrink-0 ${
                                    isInquiry
                                      ? 'bg-amber-500 text-white'
                                      : 'bg-emerald-600 text-white'
                                  }`}
                                >
                                  {isInquiry ? 'INQUIRY' : 'STUDENT'}
                                </span>
                                <span className="font-extrabold text-xs text-slate-900 truncate">
                                  {card.name}
                                </span>
                              </div>
                              <span className="font-mono text-[10px] font-bold text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200 shrink-0">
                                {card.recordId}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-1.5 text-[11px] bg-white/80 p-2 rounded-lg border border-slate-200/70">
                              <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase block">Phone</span>
                                <span className="font-mono font-bold text-slate-800">
                                  {card.phone ? (card.phone.length === 10 ? `+91 ${card.phone}` : card.phone) : 'Pending'}
                                </span>
                              </div>
                              <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase block">Branch</span>
                                <span className="font-semibold text-slate-700 truncate block">
                                  {card.branch || 'Pune'}
                                </span>
                              </div>
                              <div className="col-span-2">
                                <span className="text-[10px] font-bold text-slate-400 uppercase block">Course</span>
                                <span className="font-bold text-indigo-700">{card.course}</span>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                              {isInquiry ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => onNavigate?.('leads')}
                                    className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-extrabold inline-flex items-center gap-1 cursor-pointer transition-colors"
                                  >
                                    <Target className="w-3 h-3 text-amber-700" />
                                    <span>Open in Leads</span>
                                  </button>
                                  {!card.isConverted && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (onConvertLead) {
                                          onConvertLead(card.internalId);
                                        } else {
                                          executeQuery(`Convert ${card.name} to student`);
                                        }
                                      }}
                                      className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-extrabold inline-flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                                    >
                                      <GraduationCap className="w-3 h-3" />
                                      <span>Convert Now</span>
                                    </button>
                                  )}
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (onOpenStudentProfile) {
                                        onOpenStudentProfile(card.internalId);
                                      } else {
                                        onNavigate?.('students');
                                      }
                                    }}
                                    className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-extrabold inline-flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                                  >
                                    <UserCheck className="w-3 h-3" />
                                    <span>View Student Profile</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onNavigate?.('students')}
                                    className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300 text-[11px] font-extrabold inline-flex items-center gap-1 cursor-pointer transition-colors"
                                  >
                                    <span>Open Students Table</span>
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}

                {msg.sender === 'user' ? (
                  <div className="whitespace-pre-line leading-relaxed">{msg.text}</div>
                ) : (
                  renderRichMarkdown(msg.text)
                )}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-slate-100 space-y-1">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                      🌐 Google Search Grounded Sources:
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {msg.sources.slice(0, 5).map((src, idx) => (
                        <a
                          key={idx}
                          href={src.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 hover:bg-indigo-50 text-indigo-700 text-[10px] font-semibold truncate max-w-[220px]"
                        >
                          <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                          <span className="truncate">{src.title}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="p-3.5 rounded-2xl text-xs bg-white border border-indigo-200 text-indigo-700 mr-12 flex items-center gap-2.5 shadow-xs">
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-indigo-600 animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-2 h-2 rounded-full bg-indigo-600 animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-2 h-2 rounded-full bg-indigo-600 animate-bounce" />
                </div>
                <span className="font-bold">SSMI Executive AI is executing...</span>
              </div>
            )}

            {activeError && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs space-y-2 shadow-xs">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="font-extrabold text-rose-900">Live Gemini API Connection Issue</div>
                    <p className="text-[11px] text-rose-700 mt-0.5 leading-relaxed break-words">
                      {activeError}
                    </p>
                  </div>
                </div>
                {lastAttemptedQuery && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => executeQuery(lastAttemptedQuery)}
                      className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Retry Request</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* One-Tap Quick Prompt Chips Bar */}
          <div className="px-3.5 pt-2 pb-1.5 bg-slate-50 border-t border-slate-200 flex items-center gap-1.5 overflow-x-auto no-scrollbar whitespace-nowrap">
            {[
              {
                label: '+ Quick Add Lead',
                fill: 'add lead Rohan 9822112233 F&O',
                runDirect: false
              },
              {
                label: 'Convert Lead',
                fill: 'convert Rohan to complete course paid 5000',
                runDirect: false
              },
              {
                label: 'Fee Summary',
                fill: 'Show live fee summary, total collected, pending fees, and course breakdown',
                runDirect: true
              },
              {
                label: 'Live Nifty/Market News',
                fill: 'What is Nifty 50 and Bank Nifty level and market news today?',
                runDirect: true
              }
            ].map((chip) => (
              <button
                key={chip.label}
                type="button"
                disabled={isLoading}
                onClick={() => {
                  if (chip.runDirect) {
                    executeQuery(chip.fill);
                  } else {
                    setInput(chip.fill);
                  }
                }}
                className="px-2.5 py-1 rounded-full bg-white hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200 hover:border-indigo-300 text-[11px] font-extrabold transition-colors cursor-pointer shrink-0 shadow-2xs"
              >
                {chip.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSend} className="p-3.5 bg-white border-t border-slate-200 flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Command in English, Hindi, or Marathi (e.g., 'add lead Rahul 9876543210 F&O', 'what is Nifty 50 today?')..."
              disabled={isLoading}
              className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:outline-none focus:border-indigo-600 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-extrabold text-xs transition-colors cursor-pointer inline-flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Ask Gemini</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
