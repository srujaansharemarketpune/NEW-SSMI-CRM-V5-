import React, { useState, useEffect } from 'react';
import { AppState, WhatsAppPreset } from '../types';
import {
  MessageCircle,
  Copy,
  ExternalLink,
  CheckCircle2,
  Send,
  Plus,
  Search,
  Paperclip,
  Clock
} from 'lucide-react';

interface WhatsAppStudioViewProps {
  state: AppState;
  onLogCommunication: (
    recipientType: 'Student' | 'Lead' | 'Custom',
    recipientId: string,
    recipientName: string,
    phone: string,
    scenario: string,
    status: 'Prepared' | 'Chat Opened' | 'Marked Sent',
    message: string
  ) => void;
  onOpenTemplateModal: (templateId?: string) => void;
  initialRecipientType?: 'student' | 'lead' | 'custom';
  initialContactId?: string;
  initialScenarioHint?: string;
}

export const WhatsAppStudioView: React.FC<WhatsAppStudioViewProps> = ({
  state,
  onLogCommunication,
  onOpenTemplateModal,
  initialRecipientType = 'student',
  initialContactId = '',
  initialScenarioHint = ''
}) => {
  const [recipientType, setRecipientType] = useState<'student' | 'lead' | 'custom'>(initialRecipientType);
  const [selectedContactId, setSelectedContactId] = useState<string>(initialContactId);
  const [phoneInput, setPhoneInput] = useState<string>('');
  const [selectedLanguage, setSelectedLanguage] = useState<'en' | 'hi' | 'mr'>('en');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(state.templates[0]?.id || '');
  const [customMessage, setCustomMessage] = useState<string>('');
  const [librarySearch, setLibrarySearch] = useState('');
  const [selectedMediaId, setSelectedMediaId] = useState<string>('');
  const [copiedNotice, setCopiedNotice] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  // Sync phone when contact changes
  useEffect(() => {
    if (recipientType === 'student') {
      const s = state.students.find(x => x.id === selectedContactId) || state.students[0];
      if (s) {
        setSelectedContactId(s.id);
        setPhoneInput(s.whatsapp || `+91${s.phone.replace(/\D/g, '').slice(-10)}`);
      }
    } else if (recipientType === 'lead') {
      const l = state.leads.find(x => x.id === selectedContactId) || state.leads[0];
      if (l) {
        setSelectedContactId(l.id);
        setPhoneInput(`+91${l.phone.replace(/\D/g, '').slice(-10)}`);
      }
    }
  }, [recipientType, selectedContactId, state.students, state.leads]);

  // Robust template variable resolver supporting {{var}} and {var} with safe fallbacks
  const resolveTemplateText = (tpl: any, lang?: 'en' | 'hi' | 'mr'): string => {
    if (!tpl) return '';
    const targetLang = lang || selectedLanguage || 'en';
    let text =
      tpl[targetLang] ||
      tpl.en ||
      tpl.hi ||
      tpl.mr ||
      tpl.text ||
      tpl.template ||
      tpl.content ||
      tpl.message ||
      (typeof tpl === 'string' ? tpl : '') ||
      '';

    let studentName = '';
    let courseName = '';
    let batchName = '';
    let fees = '';
    let lectureTime = '08:00 AM - 10:00 AM';
    let lectureDate = new Date().toISOString().split('T')[0];
    let followUpDate = lectureDate;

    if (recipientType === 'student') {
      const s = state.students.find(x => x.id === selectedContactId) || state.students[0];
      if (s) {
        studentName = s.name;
        courseName = s.course;
        batchName = s.batch || 'Classroom Batch';
        const paid = (s.milestones || []).filter(m => m.status === 'Paid').reduce((a, b) => a + b.amount, 0);
        const bal = Math.max(0, s.netFee - paid);
        fees = bal > 0 ? `₹${bal.toLocaleString('en-IN')} (Pending balance)` : `₹${s.netFee.toLocaleString('en-IN')}`;
      }
    } else if (recipientType === 'lead') {
      const l = state.leads.find(x => x.id === selectedContactId) || state.leads[0];
      if (l) {
        studentName = l.name;
        courseName = l.course;
        batchName = 'Upcoming Batch';
        followUpDate = l.followUpDate || lectureDate;
        const crs = state.courses.find(c => c.name === l.course);
        fees = crs ? `₹${crs.fee.toLocaleString('en-IN')}` : '₹35,000';
      }
    }

    const instName = state.settings?.instituteName || 'Srujaan Share Market Institute';

    return text
      // Double curly replacements (case-insensitive)
      .replace(/\{\{\s*student_name\s*\}\}/gi, studentName || 'Student')
      .replace(/\{\{\s*lead_name\s*\}\}/gi, studentName || 'Valued Prospect')
      .replace(/\{\{\s*course_name\s*\}\}/gi, courseName || 'Trading Course')
      .replace(/\{\{\s*batch_name\s*\}\}/gi, batchName || 'Scheduled Batch')
      .replace(/\{\{\s*fees\s*\}\}/gi, fees || 'Standard Fee')
      .replace(/\{\{\s*balance\s*\}\}/gi, fees || 'Standard Fee')
      .replace(/\{\{\s*lecture_date\s*\}\}/gi, lectureDate)
      .replace(/\{\{\s*lecture_time\s*\}\}/gi, lectureTime)
      .replace(/\{\{\s*follow_up_date\s*\}\}/gi, followUpDate)
      .replace(/\{\{\s*institute_name\s*\}\}/gi, instName)
      .replace(/\{\{\s*instructor_name\s*\}\}/gi, 'Prasad Sir')
      // Single curly replacements (case-insensitive)
      .replace(/\{\s*student_name\s*\}/gi, studentName || 'Student')
      .replace(/\{\s*name\s*\}/gi, studentName || 'Student')
      .replace(/\{\s*lead_name\s*\}/gi, studentName || 'Valued Prospect')
      .replace(/\{\s*course_name\s*\}/gi, courseName || 'Trading Course')
      .replace(/\{\s*course\s*\}/gi, courseName || 'Trading Course')
      .replace(/\{\s*batch_name\s*\}/gi, batchName || 'Scheduled Batch')
      .replace(/\{\s*batch\s*\}/gi, batchName || 'Scheduled Batch')
      .replace(/\{\s*fees\s*\}/gi, fees || 'Standard Fee')
      .replace(/\{\s*balance\s*\}/gi, fees || 'Standard Fee')
      .replace(/\{\s*fee_amount\s*\}/gi, fees || 'Standard Fee')
      .replace(/\{\s*lecture_date\s*\}/gi, lectureDate)
      .replace(/\{\s*date\s*\}/gi, lectureDate)
      .replace(/\{\s*lecture_time\s*\}/gi, lectureTime)
      .replace(/\{\s*time\s*\}/gi, lectureTime)
      .replace(/\{\s*follow_up_date\s*\}/gi, followUpDate)
      .replace(/\{\s*institute_name\s*\}/gi, instName)
      .replace(/\{\s*instructor_name\s*\}/gi, 'Prasad Sir');
  };

  // Immediate preset selector and direct state updater
  const applyPresetTemplate = (tpl: any, langOverride?: 'en' | 'hi' | 'mr') => {
    if (!tpl) return;
    setSelectedTemplateId(tpl.id);
    const targetLang = langOverride || selectedLanguage;
    const resolved = resolveTemplateText(tpl, targetLang);
    setCustomMessage(resolved);
  };

  // Populate message text from currently selected template & placeholders
  const populateMessage = () => {
    const tpl = state.templates.find(t => t.id === selectedTemplateId) || state.templates[0];
    if (!tpl) return;
    setCustomMessage(resolveTemplateText(tpl, selectedLanguage));
  };

  useEffect(() => {
    populateMessage();
  }, [selectedTemplateId, selectedLanguage, selectedContactId, recipientType]);

  // Insert variable tag into editor
  const insertVariable = (tag: string) => {
    setCustomMessage(prev => prev + ' ' + tag);
  };

  // WhatsApp link generator
  const getCleanPhone = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 10) return '91' + digits;
    return digits;
  };

  const handleOpenWhatsApp = () => {
    const clean = getCleanPhone(phoneInput);
    if (!clean || clean.length < 10) {
      setPhoneError('Please enter a valid phone number with country code (e.g. +91 9823011223)');
      return;
    }
    setPhoneError(null);
    const recipientName =
      recipientType === 'student'
        ? state.students.find(s => s.id === selectedContactId)?.name || 'Student'
        : recipientType === 'lead'
        ? state.leads.find(l => l.id === selectedContactId)?.name || 'Lead'
        : 'Contact';

    const tpl = state.templates.find(t => t.id === selectedTemplateId);
    const scenario = tpl ? tpl.scenario : 'Custom Message';

    onLogCommunication(recipientType === 'student' ? 'Student' : (recipientType === 'lead' ? 'Lead' : 'Custom'), selectedContactId, recipientName, phoneInput, scenario, 'Chat Opened', customMessage);

    const url = `https://wa.me/${clean}?text=${encodeURIComponent(customMessage)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(customMessage);
    setCopiedNotice(true);
    setTimeout(() => setCopiedNotice(false), 2500);
  };

  const handleMarkSent = () => {
    const recipientName =
      recipientType === 'student'
        ? state.students.find(s => s.id === selectedContactId)?.name || 'Student'
        : recipientType === 'lead'
        ? state.leads.find(l => l.id === selectedContactId)?.name || 'Lead'
        : 'Contact';
    const tpl = state.templates.find(t => t.id === selectedTemplateId);
    onLogCommunication(recipientType === 'student' ? 'Student' : (recipientType === 'lead' ? 'Lead' : 'Custom'), selectedContactId, recipientName, phoneInput, tpl ? tpl.scenario : 'Custom', 'Marked Sent', customMessage);
  };

  return (
    <div className="space-y-4">
      {/* Title Bar */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
            <span>WhatsApp Click-to-Chat Studio & 46 Trilingual Presets</span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              100% Free Official Click-to-Chat
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            English, Hindi & Marathi presets • Dynamic record placeholder injection • Direct WhatsApp Web/App launcher
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onOpenTemplateModal()}
            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Create Custom Template</span>
          </button>
        </div>
      </div>

      {phoneError && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center justify-between gap-2">
          <span>⚠️ {phoneError}</span>
          <button
            type="button"
            onClick={() => setPhoneError(null)}
            className="text-rose-500 hover:text-rose-800 font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* 2-Column Composer & Live Preview Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left Column: Contact & Template Selector */}
        <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs p-5 space-y-4">
          <h3 className="text-sm font-extrabold text-slate-900 pb-3 border-b border-slate-100">
            Step 1–3: Select Recipient & Message Preset
          </h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Recipient Type
              </label>
              <select
                value={recipientType}
                onChange={(e) => setRecipientType(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="student">🎓 Enrolled Student</option>
                <option value="lead">🎯 Lead Prospect</option>
                <option value="custom">📱 Manual Phone Input</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Select Contact
              </label>
              {recipientType === 'student' ? (
                <select
                  value={selectedContactId}
                  onChange={(e) => setSelectedContactId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {state.students.filter(s => s.status !== 'Archived').map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.regId})
                    </option>
                  ))}
                </select>
              ) : recipientType === 'lead' ? (
                <select
                  value={selectedContactId}
                  onChange={(e) => setSelectedContactId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {state.leads.map(l => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.stage})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder="Enter contact name"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                WhatsApp Phone Number
              </label>
              <input
                type="text"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="+91 9823011223"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Preset Language
              </label>
              <select
                value={selectedLanguage}
                onChange={(e) => {
                  const nextLang = e.target.value as 'en' | 'hi' | 'mr';
                  setSelectedLanguage(nextLang);
                  const tpl = state.templates.find(t => t.id === selectedTemplateId) || state.templates[0];
                  if (tpl) {
                    setCustomMessage(resolveTemplateText(tpl, nextLang));
                  }
                }}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="en">🇬🇧 English</option>
                <option value="hi">🇮🇳 हिंदी (Hindi)</option>
                <option value="mr">🚩 मराठी (Marathi)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Preset Category
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => {
                  const nextCat = e.target.value;
                  setSelectedCategory(nextCat);
                  const filtered = state.templates.filter(t => !t.archived && (nextCat === 'ALL' || t.category === nextCat));
                  if (filtered.length > 0 && !filtered.some(t => t.id === selectedTemplateId)) {
                    applyPresetTemplate(filtered[0]);
                  }
                }}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">All Categories</option>
                <option value="Lead Conversion">🎯 Lead Conversion (23 Scenarios)</option>
                <option value="Student Communication">🎓 Student Communication (15 Scenarios)</option>
                <option value="Institute Announcement">📣 Institute Announcements (8 Scenarios)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Choose Preset Scenario
              </label>
              <select
                value={selectedTemplateId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  const tpl = state.templates.find(t => t.id === nextId);
                  if (tpl) {
                    applyPresetTemplate(tpl);
                  } else {
                    setSelectedTemplateId(nextId);
                  }
                }}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {state.templates
                  .filter(t => !t.archived && (selectedCategory === 'ALL' || t.category === selectedCategory))
                  .map(t => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Attach Media / Brochure */}
          <div className="pt-3 border-t border-slate-100 space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                Attach Media / Brochure Link (Optional)
              </label>
            </div>
            <select
              value={selectedMediaId}
              onChange={(e) => setSelectedMediaId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">-- No Attached Media (Text Message Only) --</option>
              {state.mediaLibrary.map(m => (
                <option key={m.id} value={m.id}>
                  [{m.category}] {m.title} ({m.sizeStr})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Right Column: Editable Preview & Dispatch Actions */}
        <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-extrabold text-slate-900">Step 4–6: Edit Message & Dispatch</h3>
              <button
                onClick={populateMessage}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-bold hover:underline cursor-pointer"
              >
                Reset from Record
              </button>
            </div>

            {/* Variable Interpolator Chips */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Variable Interpolators (Click to insert at cursor)
              </label>
              <div className="flex flex-wrap gap-1.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px]">
                {[
                  '{{student_name}}',
                  '{{course_name}}',
                  '{{batch_name}}',
                  '{{fees}}',
                  '{{lecture_date}}',
                  '{{lecture_time}}',
                  '{{institute_name}}'
                ].map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => insertVariable(v)}
                    className="px-2 py-0.5 rounded-md bg-white hover:bg-indigo-50 text-indigo-700 font-mono font-bold border border-slate-200 shadow-xs cursor-pointer transition-colors"
                  >
                    +{v}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  Live Editable Message Text
                </label>
                <span className="text-[10px] text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded-md">
                  Controlled Reactive Sync
                </span>
              </div>
              <textarea
                rows={6}
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="Select a preset scenario or type your WhatsApp message..."
                className="w-full p-3 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500 font-sans"
              />
              <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono mt-1 px-1">
                <span>
                  {customMessage.length} characters • {customMessage.trim() ? customMessage.trim().split(/\s+/).length : 0} words
                </span>
                <span>
                  {Math.ceil(customMessage.length / 160) || 1} WhatsApp {Math.ceil(customMessage.length / 160) === 1 ? 'segment' : 'segments'} (approx)
                </span>
              </div>
            </div>

            {/* Preview Box */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-700 whitespace-pre-wrap leading-relaxed max-h-36 overflow-y-auto">
              {customMessage}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-100 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyMessage}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 border border-slate-200 cursor-pointer transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedNotice ? '✓ Copied!' : 'Copy Text'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleMarkSent}
                  className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold border border-emerald-200 flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Mark as Sent</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleOpenWhatsApp}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 shadow-xs cursor-pointer transition-all"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Open in WhatsApp</span>
                <ExternalLink className="w-3 h-3 ml-0.5" />
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              ℹ️ <strong>Direct WhatsApp Launcher:</strong> Click-to-chat opens WhatsApp Web or App with prefilled text. Send delivery is confirmed by clicking "Mark as Sent".
            </p>
          </div>
        </div>
      </div>

      {/* Preset Library Quick Reference Grid */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">46-Scenario Trilingual Template Catalog</h3>
            <p className="text-xs text-slate-500 mt-0.5">Search all available response scripts</p>
          </div>
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={librarySearch}
              onChange={(e) => setLibrarySearch(e.target.value)}
              placeholder="Search scenarios or text..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {state.templates
            .filter(t => !t.archived && (t.title.toLowerCase().includes(librarySearch.toLowerCase()) || t.scenario.toLowerCase().includes(librarySearch.toLowerCase())))
            .slice(0, 9)
            .map(t => (
              <div
                key={t.id}
                role="button"
                tabIndex={0}
                onClick={() => applyPresetTemplate(t)}
                className={`p-3.5 rounded-xl border text-xs space-y-1.5 cursor-pointer transition-all ${
                  selectedTemplateId === t.id
                    ? 'bg-indigo-50/60 border-indigo-500 ring-1 ring-indigo-500 text-slate-900 shadow-xs'
                    : 'bg-slate-50/70 border-slate-200 hover:border-slate-300 text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-slate-900">{t.scenario}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-200/70 text-slate-700 font-bold">
                    {t.tone}
                  </span>
                </div>
                <div className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">
                  {t[selectedLanguage] || t.en || t.hi || t.mr || (t as any).text || (t as any).template || (t as any).content || (t as any).message || ''}
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};
