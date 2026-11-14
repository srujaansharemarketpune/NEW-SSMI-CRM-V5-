import React, { useState, useRef, useEffect } from 'react';
import { AppState } from '../types';
import { NavTabId } from './Navbar';
import { ExecutedToolAction, setLastReferencedRecord } from '../services/gemini';
import { DraggableWindow } from './DraggableWindow';
import {
  Sparkles,
  AlertCircle,
  RotateCcw,
  ExternalLink,
  Send,
  Trash2,
  X,
  Minimize2,
  Maximize2,
  CheckCircle2,
  Zap,
  GraduationCap,
  UserCheck,
  Target,
  Copy,
  Check,
  PlusCircle
} from 'lucide-react';

export interface AiChatEntry {
  sender: 'user' | 'ai';
  time: string;
  text: string;
  sources?: { title: string; url: string }[];
  actions?: ExecutedToolAction[];
}

interface OmniBotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onOpen?: () => void;
  state: AppState;
  onNavigate: (tab: NavTabId) => void;
  onRunQuery: (query: string) => Promise<void> | void;
  onClearChat?: () => void;
  onConvertLead?: (leadId: string) => void;
  onOpenStudentProfile?: (studentId: string) => void;
  chatLog: AiChatEntry[];
  aiError?: string | null;
  onDismissError?: () => void;
}

export function formatInlineMarkdown(str: string) {
  const parts = str.split(/(\*\*.*?\*\*|`.*?`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-extrabold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={i}
          className="px-1.5 py-0.5 rounded bg-slate-100 text-indigo-700 font-mono text-[11px] font-bold"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

export function renderRichMarkdown(text: string) {
  const lines = (text || '').split('\n');
  const elements: React.ReactNode[] = [];
  let idx = 0;

  while (idx < lines.length) {
    const line = lines[idx];
    const trimmed = line.trim();

    if (!trimmed) {
      elements.push(<div key={`sp-${idx}`} className="h-1" />);
      idx++;
      continue;
    }

    // 1. Fenced Code Block (```)
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      idx++;
      while (idx < lines.length && !lines[idx].trim().startsWith('```')) {
        codeLines.push(lines[idx]);
        idx++;
      }
      if (idx < lines.length) idx++; // skip closing ```
      elements.push(
        <div
          key={`code-${idx}`}
          className="my-2 rounded-xl overflow-hidden border border-slate-800 bg-slate-950 text-slate-100 shadow-xs"
        >
          {lang && (
            <div className="px-3 py-1 bg-slate-900 border-b border-slate-800 text-[10px] font-mono font-bold uppercase text-indigo-300">
              {lang}
            </div>
          )}
          <pre className="p-3 text-[11px] font-mono overflow-x-auto leading-relaxed">
            <code>{codeLines.join('\n')}</code>
          </pre>
        </div>
      );
      continue;
    }

    // 2. Markdown Table (| col1 | col2 |)
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const tableLines: string[] = [];
      while (
        idx < lines.length &&
        lines[idx].trim().startsWith('|') &&
        lines[idx].trim().endsWith('|')
      ) {
        tableLines.push(lines[idx].trim());
        idx++;
      }
      if (tableLines.length >= 2) {
        const parseRow = (r: string) =>
          r
            .slice(1, -1)
            .split('|')
            .map(c => c.trim());
        const headers = parseRow(tableLines[0]);
        const isSeparator = (r: string) => /^[\s|:-]+$/.test(r);
        const bodyRows = tableLines
          .slice(1)
          .filter(r => !isSeparator(r))
          .map(parseRow);

        elements.push(
          <div
            key={`tbl-${idx}`}
            className="my-2 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs"
          >
            <table className="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-slate-800">
                  {headers.map((h, hi) => (
                    <th key={hi} className="px-2.5 py-1.5 font-extrabold">
                      {formatInlineMarkdown(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bodyRows.map((row, ri) => (
                  <tr key={ri} className="hover:bg-slate-50/80">
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-2.5 py-1.5 text-slate-700">
                        {formatInlineMarkdown(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }
    }

    // 3. Blockquote (> ...)
    if (trimmed.startsWith('>')) {
      elements.push(
        <blockquote
          key={`bq-${idx}`}
          className="pl-3 py-1 my-1 border-l-3 border-indigo-500 bg-indigo-50/50 rounded-r-lg text-slate-700 italic text-[11px]"
        >
          {formatInlineMarkdown(trimmed.replace(/^>\s*/, ''))}
        </blockquote>
      );
      idx++;
      continue;
    }

    // 4. Headings
    if (trimmed.startsWith('#### ') || trimmed.startsWith('### ')) {
      const clean = trimmed.replace(/^#+\s*/, '');
      elements.push(
        <h4
          key={`h4-${idx}`}
          className="text-xs font-black text-indigo-950 uppercase tracking-wide pt-1.5"
        >
          {formatInlineMarkdown(clean)}
        </h4>
      );
      idx++;
      continue;
    }
    if (trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
      const clean = trimmed.replace(/^#+\s*/, '');
      elements.push(
        <h3 key={`h3-${idx}`} className="text-sm font-black text-slate-900 pt-1.5">
          {formatInlineMarkdown(clean)}
        </h3>
      );
      idx++;
      continue;
    }

    // 5. Bullet List
    if (/^[-*•]\s+/.test(trimmed)) {
      elements.push(
        <div key={`ul-${idx}`} className="flex items-start gap-2 pl-1">
          <span className="text-indigo-600 font-black mt-0.5">•</span>
          <span className="flex-1">{formatInlineMarkdown(trimmed.replace(/^[-*•]\s+/, ''))}</span>
        </div>
      );
      idx++;
      continue;
    }

    // 6. Numbered List
    if (/^\d+\.\s+/.test(trimmed)) {
      const match = trimmed.match(/^(\d+\.)\s+(.*)$/);
      if (match) {
        elements.push(
          <div key={`ol-${idx}`} className="flex items-start gap-2 pl-1">
            <span className="text-indigo-700 font-mono font-extrabold text-[11px] mt-0.5 shrink-0">
              {match[1]}
            </span>
            <span className="flex-1">{formatInlineMarkdown(match[2])}</span>
          </div>
        );
        idx++;
        continue;
      }
    }

    elements.push(<p key={`p-${idx}`}>{formatInlineMarkdown(line)}</p>);
    idx++;
  }

  return <div className="space-y-1.5 leading-relaxed">{elements}</div>;
}

export const OmniBotDrawer: React.FC<OmniBotDrawerProps> = ({
  isOpen,
  onClose,
  onOpen,
  onNavigate,
  onRunQuery,
  onClearChat,
  onConvertLead,
  onOpenStudentProfile,
  chatLog,
  aiError,
  onDismissError
}) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
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
    if (isOpen) {
      setIsMinimized(false);
      setLocalError(null);
      onDismissError?.();
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isOpen]);

  useEffect(() => {
    const handleResetLoading = () => {
      setIsLoading(false);
      setLocalError(null);
    };
    window.addEventListener('ssm-reset-loading-states', handleResetLoading);
    return () => window.removeEventListener('ssm-reset-loading-states', handleResetLoading);
  }, []);

  useEffect(() => {
    if (isOpen && !isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatLog, isOpen, isMinimized, isLoading]);

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

  const quickActions = [
    {
      label: '⚡ Database Snapshot',
      query: 'Show me enrolled students and get a complete database snapshot'
    },
    {
      label: '👨‍🏫 Update Instructor',
      query: 'Change the instructor of Master Price Action to Prasad Bhunje'
    },
    {
      label: '📈 Today Nifty Trend',
      query: "What is today's Nifty trend and key institutional support/resistance levels?"
    },
    {
      label: '💳 Pending Fee Audit',
      query: 'List all active students who currently have pending or overdue fee balances.'
    },
    {
      label: '📅 Attendance Audit',
      query: 'Identify students with attendance below 75% and show current attendance standing.'
    },
    {
      label: '🎓 Courses & Batches',
      query: 'Provide a complete breakdown of all Srujaan Share Market Institute courses, instructors, fees, and active batches.'
    }
  ];

  // Desktop floating bottom shortcut removed cleanly per layout spec; drawer opens via Navbar, Sidebar, Dashboard, or Ctrl+K
  if (!isOpen) {
    return null;
  }

  // Minimized Bottom-Right Dock Bar
  if (isMinimized) {
    return (
      <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-4 right-4 z-40 w-[calc(100vw-2rem)] sm:w-80 rounded-2xl bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-950 text-white shadow-2xl border border-indigo-500/40 p-3 flex items-center justify-between animate-in fade-in duration-150">
        <div
          onClick={() => setIsMinimized(false)}
          className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0"
        >
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 via-orange-500 to-indigo-600 flex items-center justify-center font-black text-sm shadow-sm shrink-0">
            🕯️
          </div>
          <div className="min-w-0">
            <div className="text-xs font-extrabold flex items-center gap-1.5">
              <span>Candle AI (Minimized)</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <div className="text-[10px] text-indigo-200/80 truncate max-w-[165px]">
              Click to restore chat ({chatLog.length} msgs)
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setIsMinimized(false)}
            className="min-w-[36px] min-h-[36px] sm:min-w-0 sm:min-h-0 p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer flex items-center justify-center"
            title="Restore Chat Window"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[36px] min-h-[36px] sm:min-w-0 sm:min-h-0 p-1.5 rounded-lg bg-slate-800 hover:bg-rose-600 text-slate-200 hover:text-white cursor-pointer flex items-center justify-center"
            title="Close Candle AI"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <DraggableWindow
      isOpen={isOpen}
      onClose={onClose}
      variant={isExpanded ? 'modal' : 'floating'}
      zIndexClass={isExpanded ? 'z-50' : 'z-40'}
      maxWidthClass={isExpanded ? 'max-w-2xl' : 'sm:w-[430px]'}
      closeOnBackdropClick={isExpanded}
      allowMinimize={false}
      theme="dark"
      panelClassName="bg-white text-slate-800"
      headerClassName="bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-950 text-white border-b border-slate-800"
      bodyClassName="max-h-none overflow-hidden flex flex-col bg-white text-slate-800"
      icon={
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 via-orange-500 to-indigo-600 flex items-center justify-center font-black text-sm shadow-md border border-amber-300/40">
          🕯️
        </div>
      }
      title={
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-extrabold text-sm tracking-tight text-white">SSMI Executive AI</span>
          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10px] font-bold tracking-tight flex items-center gap-1">
            <span>🟢 Live DB + Web Connected • Admin: Prasad Sir</span>
          </span>
        </div>
      }
      subtitle={
        <span className="text-[11px] text-indigo-200/80">
          Autonomous CRM Read/Write/Convert/Delete &amp; Live Google Search Grounding
        </span>
      }
      headerActions={
        <div className="flex items-center gap-1">
          {onClearChat && (
            <button
              type="button"
              onClick={() => {
                setLocalError(null);
                onDismissError?.();
                setLastReferencedRecord(null);
                onClearChat();
              }}
              className="compact-touch-ignore px-2 py-1.5 rounded-lg bg-indigo-600/80 hover:bg-indigo-500 text-white text-[10px] font-extrabold inline-flex items-center gap-1 transition-colors cursor-pointer"
              title="Start a New Chat session"
            >
              <PlusCircle className="w-3 h-3" />
              <span className="hidden sm:inline">New Chat</span>
            </button>
          )}
          {onClearChat && (
            <button
              type="button"
              onClick={() => {
                setLocalError(null);
                onDismissError?.();
                setLastReferencedRecord(null);
                onClearChat();
              }}
              className="compact-touch-ignore p-2 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Clear chat history"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsMinimized(true)}
            className="compact-touch-ignore p-2 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Minimize to bottom-right corner"
          >
            <Minimize2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setIsExpanded(prev => !prev)}
            className="compact-touch-ignore p-2 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title={isExpanded ? 'Dock to floating panel' : 'Expand panel'}
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      }
    >
      <div className={`flex flex-col justify-between bg-white text-slate-800 ${isExpanded ? 'h-[82vh]' : 'h-[78dvh] sm:h-[580px]'}`}>

        {/* Quick Prompts Strip */}
        <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-indigo-600" />
              Instant God-Mode Actions & Grounded Queries
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onNavigate('batches')}
                className="px-2 py-0.5 rounded bg-white hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 border border-slate-200 text-[10px] font-bold cursor-pointer"
              >
                Courses
              </button>
              <button
                type="button"
                onClick={() => onNavigate('students')}
                className="px-2 py-0.5 rounded bg-white hover:bg-blue-50 text-slate-600 hover:text-blue-700 border border-slate-200 text-[10px] font-bold cursor-pointer"
              >
                Students
              </button>
              <button
                type="button"
                onClick={() => onNavigate('leads')}
                className="px-2 py-0.5 rounded bg-white hover:bg-amber-50 text-slate-600 hover:text-amber-700 border border-slate-200 text-[10px] font-bold cursor-pointer"
              >
                Leads
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {quickActions.map((qa, i) => (
              <button
                key={i}
                type="button"
                disabled={isLoading}
                onClick={() => executeQuery(qa.query)}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200/80 text-[11px] font-bold transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
              >
                {qa.label}
              </button>
            ))}
          </div>
        </div>

        {/* Chat Log */}
        <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-50/50">
          {chatLog.map((msg, i) => (
            <div
              key={i}
              className={`p-3.5 rounded-2xl text-xs shadow-2xs ${
                msg.sender === 'user'
                  ? 'bg-indigo-950 text-white ml-8 rounded-br-xs'
                  : 'bg-white border border-slate-200/90 text-slate-700 mr-4 rounded-bl-xs'
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

              {/* Tool Execution Action Pills & Interactive Confirmation Action Cards */}
              {((msg.actions && msg.actions.length > 0) || (msg.sources && msg.sources.length > 0)) && (
                <div className="mb-2.5 space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {msg.actions?.map((act, ai) => (
                      <div
                        key={ai}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-extrabold"
                      >
                        <Zap className="w-3 h-3 text-emerald-600 shrink-0" />
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

                  {/* Interactive Confirmation Action Cards */}
                  {msg.actions
                    ?.filter(act => Boolean(act.actionCard))
                    .map((act, cardIdx) => {
                      const card = act.actionCard!;
                      const isInquiry = card.recordType === 'inquiry';
                      return (
                        <div
                          key={`card-${cardIdx}`}
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
                                  onClick={() => onNavigate('leads')}
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
                                      onNavigate('students');
                                    }
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-extrabold inline-flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                                >
                                  <UserCheck className="w-3 h-3" />
                                  <span>View Student Profile</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onNavigate('students')}
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
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 hover:bg-indigo-50 text-indigo-700 text-[10px] font-semibold truncate max-w-[200px]"
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
            <div className="p-3.5 rounded-2xl text-xs bg-white border border-indigo-200 text-indigo-700 mr-6 flex items-center gap-2.5 shadow-xs">
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
                  <div className="font-extrabold text-rose-900">Notice</div>
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
        <div className="px-3 pt-2 pb-1.5 bg-slate-50 border-t border-slate-200 flex items-center gap-1.5 overflow-x-auto no-scrollbar whitespace-nowrap">
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

        {/* Input Form */}
        <form onSubmit={handleSend} className="p-3 sm:p-3.5 bg-white border-t border-slate-200 flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Command in English, Hindi, or Marathi (e.g. 'add lead Rahul 9876543210 F&O')..."
            disabled={isLoading}
            className="flex-1 min-w-0 px-3.5 py-2.5 min-h-[44px] sm:min-h-0 rounded-xl border border-slate-300 text-base sm:text-xs focus:outline-none focus:border-indigo-600 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="min-h-[44px] sm:min-h-0 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-extrabold text-xs transition-colors cursor-pointer inline-flex items-center gap-1.5 shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Ask</span>
          </button>
        </form>
      </div>
    </DraggableWindow>
  );
};
