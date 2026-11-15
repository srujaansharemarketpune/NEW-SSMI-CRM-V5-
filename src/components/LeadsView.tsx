import React, { useState } from 'react';
import { AppState, Lead, LeadStage } from '../types';
import { LEAD_STAGES } from '../data/initialData';
import {
  Target,
  Plus,
  Search,
  Download,
  Clock,
  MessageCircle,
  PhoneCall,
  Edit2,
  Trash2,
  GraduationCap,
  CheckCircle2,
  FileSpreadsheet
} from 'lucide-react';
import { exportCsvFile } from '../services/db';
import { findConvertedStudentForInquiry } from '../services/crmActions';

interface LeadsViewProps {
  state: AppState;
  onOpenLeadModal: (leadId?: string) => void;
  onConvertLeadToStudent: (leadId: string) => void;
  onOpenStudent360?: (studentId: string) => void;
  onDeleteLead: (leadId: string) => void;
  onUpdateLeadStage: (leadId: string, newStage: LeadStage) => void;
  onOpenWaStudioForContact: (type: 'student' | 'lead', id: string, scenarioHint?: string) => void;
  onOpenGoogleSheetsExport?: () => void;
  onRepairPipeline?: () => void;
}

const resolveCanonicalStage = (rawStage?: string): LeadStage => {
  const clean = String(rawStage || '').trim();
  if (LEAD_STAGES.includes(clean as LeadStage)) {
    return clean as LeadStage;
  }
  const lower = clean.toLowerCase();
  if (!lower || lower === 'new' || lower.includes('new enquir') || lower.includes('new inquir') || lower === 'open' || lower === 'pending') {
    return 'New Enquiry';
  }
  if (lower.includes('contact') || lower.includes('called')) return 'Contacted';
  if (lower.includes('demo attend') || lower.includes('attended')) return 'Demo Attended';
  if (lower.includes('demo')) return 'Demo Scheduled';
  if (lower.includes('future') || lower.includes('later')) return 'Future Follow-up';
  if (lower.includes('follow') || lower.includes('call back')) return 'Follow-up Required';
  if (lower.includes('hot') || lower.includes('interested') || lower.includes('warm') || lower.includes('counsel') || lower.includes('fee')) {
    return !lower.includes('not interested') ? 'Interested' : 'Not Interested';
  }
  if (lower.includes('convert') || lower.includes('admit') || lower.includes('enrol') || lower.includes('confirm')) {
    return 'Admission Confirmed';
  }
  if (lower.includes('lost') || lower.includes('closed')) {
    return 'Lost';
  }
  if (lower.includes('not interested')) {
    return 'Not Interested';
  }
  return 'New Enquiry';
};

export const LeadsView: React.FC<LeadsViewProps> = ({
  state,
  onOpenLeadModal,
  onConvertLeadToStudent,
  onOpenStudent360,
  onDeleteLead,
  onUpdateLeadStage,
  onOpenWaStudioForContact,
  onOpenGoogleSheetsExport,
  onRepairPipeline
}) => {
  const [subView, setSubView] = useState<'kanban' | 'table' | 'followups' | 'playbook'>('kanban');
  const [searchQuery, setSearchQuery] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('');

  // Strict check: only mark an inquiry as converted if it has an explicit student link or stage === 'Admission Confirmed'
  const findEnrolledStudentForLead = (lead: Lead) => {
    return findConvertedStudentForInquiry(lead, state.students);
  };

  const isLeadConverted = (lead: Lead) => {
    if (lead.recordType === 'inquiry' && lead.isConverted === false && lead.stage !== 'Admission Confirmed') {
      return false;
    }
    const enrolledStu = findEnrolledStudentForLead(lead);
    return Boolean(enrolledStu) || lead.isConverted === true || lead.stage === 'Admission Confirmed';
  };

  // Filter leads (using canonical stage so no lead is ever orphaned from the 10-stage pipeline)
  const filteredLeads = state.leads.filter(l => {
    const canonicalStage = resolveCanonicalStage(l.stage);
    if (courseFilter && l.course !== courseFilter) return false;
    if (stageFilter && canonicalStage !== stageFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      const hay = `${l.name} ${l.phone} ${l.email} ${l.locality} ${l.course} ${canonicalStage} ${l.stage} ${l.objection} ${l.notes}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const dueFollowups = state.leads.filter(
    l => !['Admission Confirmed', 'Lost', 'Not Interested'].includes(resolveCanonicalStage(l.stage))
  );

  return (
    <div className="space-y-4">
      {/* Title Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-black text-slate-900 tracking-tight">
              Enquiry & Lead Conversion CRM
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 font-mono-code">
              {state.leads.length} Active Leads
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            10-stage admission pipeline from enquiry to enrollment • Follow-up scheduler & 1-click student conversion
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 max-w-full">
          {/* Subview Selector */}
          <div className="p-1 rounded-xl bg-slate-100 border border-slate-200 flex items-center gap-1 overflow-x-auto max-w-full no-scrollbar whitespace-nowrap">
            <button
              onClick={() => setSubView('kanban')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all shrink-0 whitespace-nowrap ${
                subView === 'kanban' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Kanban Board
            </button>
            <button
              onClick={() => setSubView('table')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all shrink-0 whitespace-nowrap ${
                subView === 'table' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Search Table
            </button>
            <button
              onClick={() => setSubView('followups')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                subView === 'followups' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Follow-ups</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-100 text-amber-800 font-bold">
                {dueFollowups.length}
              </span>
            </button>
            <button
              onClick={() => setSubView('playbook')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all shrink-0 whitespace-nowrap ${
                subView === 'playbook' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Objections Playbook
            </button>
          </div>

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

          {onRepairPipeline && (
            <button
              onClick={onRepairPipeline}
              className="px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-all"
              title="Audit and repair inquiry pipeline stages and student conversion links"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
              <span>Check & Repair Pipeline</span>
            </button>
          )}
          <button
            onClick={() => onOpenLeadModal()}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs cursor-pointer transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add Enquiry</span>
          </button>
          <button
            onClick={() => exportCsvFile(state, 'leads')}
            className="px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all"
          >
            <Download className="w-3.5 h-3.5 text-blue-600" />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            Search Prospect Name / Phone
          </label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search prospects..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white font-medium transition-all"
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            Filter by Course Interest
          </label>
          <select
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white font-medium"
          >
            <option value="">All Courses</option>
            {state.courses.map(c => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            Filter by Stage
          </label>
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white font-medium"
          >
            <option value="">All 10 Pipeline Stages</option>
            {LEAD_STAGES.map(st => (
              <option key={st} value={st}>{st}</option>
            ))}
          </select>
        </div>

        {/* Mobile-Only Horizontal Stage Filter Chips */}
        <div className="sm:col-span-3 flex md:hidden items-center gap-2 overflow-x-auto whitespace-nowrap pb-1 -mx-1 px-1">
          <button
            type="button"
            onClick={() => setStageFilter('')}
            className={`px-3.5 py-2 rounded-full text-xs font-extrabold shrink-0 cursor-pointer transition-all ${
              stageFilter === ''
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 border border-slate-200'
            }`}
          >
            All Stages
          </button>
          {LEAD_STAGES.map(st => (
            <button
              key={st}
              type="button"
              onClick={() => setStageFilter(st)}
              className={`px-3.5 py-2 rounded-full text-xs font-extrabold shrink-0 cursor-pointer transition-all ${
                stageFilter === st
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 border border-slate-200'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* SUBVIEW 1: 10-STAGE KANBAN BOARD */}
      {subView === 'kanban' && (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-3 min-w-[2200px]">
            {LEAD_STAGES.map((stage) => {
              const cards = filteredLeads.filter(l => resolveCanonicalStage(l.stage) === stage);
              return (
                <div
                  key={stage}
                  className="w-72 rounded-2xl bg-slate-50 border border-slate-200 p-3.5 flex flex-col justify-between shrink-0 min-h-[480px]"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                      <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                        {stage}
                      </h4>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono-code font-bold bg-white text-slate-700 border border-slate-200 shadow-2xs">
                        {cards.length}
                      </span>
                    </div>

                    <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                      {cards.length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-400 italic">
                          No leads in this stage.
                        </div>
                      ) : (
                        cards.map((l) => (
                          <div
                            key={l.id}
                            className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-2 hover:border-slate-300 transition-all shadow-xs"
                          >
                            <div className="flex items-start justify-between gap-1.5">
                              <div>
                                <strong className="text-slate-900 text-xs font-extrabold">{l.name}</strong>
                                <div className="text-[11px] text-slate-500 font-mono-code mt-0.5 flex flex-wrap items-center gap-1">
                                  <a
                                    href={`tel:${(l.phone || '').replace(/[^\d+]/g, '')}`}
                                    className="text-blue-600 hover:underline font-bold"
                                  >
                                    📱 {l.phone}
                                  </a>
                                  <span>• {l.locality || 'Pune'}</span>
                                </div>
                              </div>
                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold ${
                                  l.intent === 'Hot'
                                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                    : l.intent === 'Warm'
                                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {l.intent}
                              </span>
                            </div>

                            <div className="text-[11px] font-bold text-blue-600">{l.course}</div>

                            {l.objection && (
                              <div className="p-1.5 rounded-lg bg-amber-50 border border-amber-200 text-[10px] text-amber-800 font-semibold">
                                ⚠️ {l.objection}
                              </div>
                            )}

                            <div className="text-[10px] text-slate-500 font-mono-code flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-400" />
                              <span>Follow-up: {l.followUpDate || 'Today'} {l.followUpTime}</span>
                            </div>

                            {/* Stage Selector */}
                            <select
                              value={resolveCanonicalStage(l.stage)}
                              onChange={(e) => onUpdateLeadStage(l.id, e.target.value as LeadStage)}
                              className="w-full px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] sm:text-[10px] text-slate-700 focus:outline-none"
                            >
                              {LEAD_STAGES.map(st => (
                                <option key={st} value={st}>{st}</option>
                              ))}
                            </select>

                            <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1">
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => onOpenWaStudioForContact('lead', l.id, 'New Enquiry')}
                                  className="compact-touch-ignore p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 cursor-pointer"
                                  title="WhatsApp Chat"
                                >
                                  <MessageCircle className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => onOpenLeadModal(l.id)}
                                  className="compact-touch-ignore p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 cursor-pointer"
                                  title="Edit"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => onDeleteLead(l.id)}
                                  className="compact-touch-ignore p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 cursor-pointer"
                                  title="Delete Lead"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              {(() => {
                                const enrolledStu = findEnrolledStudentForLead(l);
                                const isAlreadyConverted = Boolean(enrolledStu) || l.stage === 'Admission Confirmed';
                                if (isAlreadyConverted) {
                                  return (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (enrolledStu && onOpenStudent360) {
                                          onOpenStudent360(enrolledStu.id);
                                        } else {
                                          onConvertLeadToStudent(l.id);
                                        }
                                      }}
                                      className="px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-extrabold flex items-center gap-1 cursor-pointer transition-colors"
                                      title={enrolledStu ? `Enrolled as ${enrolledStu.regId} — Click to view Student Profile` : 'Already Enrolled'}
                                    >
                                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                      <span>{enrolledStu ? 'View Student' : 'Enrolled'}</span>
                                    </button>
                                  );
                                }
                                return (
                                  <button
                                    type="button"
                                    onClick={() => onConvertLeadToStudent(l.id)}
                                    className="px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-extrabold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                                  >
                                    <GraduationCap className="w-3 h-3" />
                                    <span>Convert</span>
                                  </button>
                                );
                              })()}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SUBVIEW 2: SEARCHABLE TABLE (Desktop Table + Mobile Cards) */}
      {subView === 'table' && (
        <>
          {/* Desktop Table (Strictly hidden on mobile: hidden md:block) */}
          <div className="hidden md:block bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto max-h-[70vh]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-50 shadow-[0_1px_0_0_#e2e8f0]">
                  <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider">
                  <th className="p-3.5">Prospect ID & Name</th>
                  <th className="p-3.5">Phone & Locality</th>
                  <th className="p-3.5">Course Interest</th>
                  <th className="p-3.5">Pipeline Stage</th>
                  <th className="p-3.5">Follow-Up Date</th>
                  <th className="p-3.5">Staff & Source</th>
                  <th className="p-3.5">Objection / Notes</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLeads.map(l => {
                  const enrolledStu = findEnrolledStudentForLead(l);
                  const isAlreadyConverted = Boolean(enrolledStu) || l.stage === 'Admission Confirmed';

                  return (
                    <tr key={l.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3.5">
                        <strong className="text-slate-900 text-xs font-bold">{l.name}</strong>
                        <div className="font-mono-code text-[11px] text-blue-600">{l.id}</div>
                      </td>
                      <td className="p-3.5">
                        <div className="font-mono-code text-slate-800">📱 {l.phone}</div>
                        <div className="text-[11px] text-slate-400">{l.locality}</div>
                      </td>
                      <td className="p-3.5">
                        <div className="text-slate-800 font-bold">{l.course}</div>
                        <span className="px-2 py-0.5 rounded-md text-[10px] bg-slate-100 text-slate-600 font-medium">
                          {l.mode}
                        </span>
                      </td>
                      <td className="p-3.5">
                        <select
                          value={l.stage}
                          onChange={(e) => onUpdateLeadStage(l.id, e.target.value as LeadStage)}
                          className="px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800 font-medium"
                        >
                          {LEAD_STAGES.map(st => (
                            <option key={st} value={st}>{st}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-3.5 font-mono-code text-slate-600">
                        {l.followUpDate} {l.followUpTime}
                      </td>
                      <td className="p-3.5 text-slate-600">
                        <div className="font-medium text-slate-800">{l.staff || 'Desk'}</div>
                        <div className="text-[10px] text-slate-400">{l.source}</div>
                      </td>
                      <td className="p-3.5 text-slate-500 max-w-xs truncate" title={l.notes}>
                        {l.objection || l.notes || '—'}
                      </td>
                      <td className="p-3.5 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => onOpenWaStudioForContact('lead', l.id, 'Demo Invitation')}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer shadow-2xs"
                          >
                            WA
                          </button>
                          <button
                            onClick={() => onOpenLeadModal(l.id)}
                            className="px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
                          >
                            Edit
                          </button>
                          {isAlreadyConverted ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (enrolledStu && onOpenStudent360) {
                                  onOpenStudent360(enrolledStu.id);
                                } else {
                                  onConvertLeadToStudent(l.id);
                                }
                              }}
                              className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-extrabold text-xs cursor-pointer flex items-center gap-1"
                              title={enrolledStu ? `Enrolled as ${enrolledStu.regId}` : 'Enrolled'}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>{enrolledStu ? 'View Student' : 'Enrolled'}</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onConvertLeadToStudent(l.id)}
                              className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs cursor-pointer shadow-2xs"
                            >
                              Convert
                            </button>
                          )}
                          <button
                            onClick={() => onDeleteLead(l.id)}
                            className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 cursor-pointer transition-colors"
                            title="Delete Lead"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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

          {/* Mobile-Only Lead Cards (Strictly hidden on desktop: grid md:hidden) */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {filteredLeads.map(l => {
              const enrolledStu = findEnrolledStudentForLead(l);
              const isAlreadyConverted = Boolean(enrolledStu) || l.stage === 'Admission Confirmed';
              const cleanDigits = (l.phone || '').replace(/\D/g, '').slice(-10);

              return (
                <div key={l.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-mono-code text-xs font-bold text-blue-600">{l.id}</span>
                      <h3 className="text-base font-black text-slate-900 mt-0.5 break-words">{l.name}</h3>
                      <div className="text-xs font-bold text-slate-600">{l.course}</div>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-extrabold shrink-0 ${
                        l.intent === 'Hot'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : l.intent === 'Warm'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {l.intent}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
                    <div>
                      <div className="text-[11px] font-bold text-slate-400 uppercase">Phone</div>
                      <a
                        href={cleanDigits ? `tel:+91${cleanDigits}` : '#'}
                        className="inline-block font-mono-code font-bold text-blue-700 mt-0.5"
                      >
                        📱 {l.phone}
                      </a>
                    </div>
                    <div>
                      <div className="text-[11px] font-bold text-slate-400 uppercase">Follow-Up</div>
                      <div className="font-mono-code font-bold text-amber-800 mt-0.5">{l.followUpDate} {l.followUpTime}</div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-[11px] font-bold text-slate-400 uppercase mb-1">Stage</div>
                      <select
                        value={l.stage}
                        onChange={(e) => onUpdateLeadStage(l.id, e.target.value as LeadStage)}
                        className="w-full min-h-[44px] px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm font-bold text-slate-900"
                      >
                        {LEAD_STAGES.map(st => (
                          <option key={st} value={st}>{st}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <a
                        href={cleanDigits ? `https://wa.me/91${cleanDigits}` : '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[44px] flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-extrabold"
                      >
                        <MessageCircle className="w-4 h-4 shrink-0" />
                        <span>WhatsApp</span>
                      </a>
                      <a
                        href={cleanDigits ? `tel:+91${cleanDigits}` : '#'}
                        className="min-h-[44px] flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 text-xs font-extrabold"
                      >
                        <PhoneCall className="w-4 h-4 shrink-0" />
                        <span>Call</span>
                      </a>
                      {isAlreadyConverted ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (enrolledStu && onOpenStudent360) {
                              onOpenStudent360(enrolledStu.id);
                            } else {
                              onConvertLeadToStudent(l.id);
                            }
                          }}
                          className="min-h-[44px] flex items-center justify-center gap-1 py-2 px-2 rounded-xl bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-extrabold cursor-pointer"
                        >
                          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-700" />
                          <span>Enrolled</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onConvertLeadToStudent(l.id)}
                          className="min-h-[44px] flex items-center justify-center gap-1 py-2 px-2 rounded-xl bg-blue-600 text-white text-xs font-extrabold cursor-pointer"
                        >
                          <GraduationCap className="w-4 h-4 shrink-0" />
                          <span>Convert</span>
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenLeadModal(l.id)}
                        className="min-h-[44px] flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 text-xs font-extrabold cursor-pointer"
                      >
                        <Edit2 className="w-4 h-4 shrink-0" />
                        <span>Edit Lead</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteLead(l.id)}
                        className="min-h-[44px] flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-xs font-extrabold cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4 shrink-0" />
                        <span>Delete Lead</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* SUBVIEW 3: FOLLOW-UP ALERTS */}
      {subView === 'followups' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">Overdue & Upcoming Follow-Up Calls</h3>
              <p className="text-xs text-slate-500 mt-0.5">Prioritized by schedule and prospect intent</p>
            </div>
          </div>

          <div className="space-y-2.5">
            {dueFollowups.map(l => {
              const enrolledStu = findEnrolledStudentForLead(l);
              const isAlreadyConverted = Boolean(enrolledStu) || l.stage === 'Admission Confirmed';

              return (
                <div
                  key={l.id}
                  className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/80 hover:bg-slate-50 flex flex-wrap items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <strong className="text-slate-900 text-sm font-bold">{l.name}</strong>{' '}
                    <span className="font-mono-code text-blue-600 font-medium">({l.phone})</span>
                    <div className="text-slate-500 mt-1">
                      Stage: <span className="text-blue-600 font-bold">{l.stage}</span> • Target Course: <strong>{l.course}</strong> • Follow-Up: <strong className="text-amber-700">{l.followUpDate} ({l.followUpTime})</strong>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    <button
                      onClick={() => onOpenWaStudioForContact('lead', l.id, 'Follow-up After Demo')}
                      className="min-h-[44px] md:min-h-0 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1 cursor-pointer shadow-2xs"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>Open WhatsApp Follow-Up</span>
                    </button>
                    {isAlreadyConverted ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (enrolledStu && onOpenStudent360) {
                            onOpenStudent360(enrolledStu.id);
                          } else {
                            onConvertLeadToStudent(l.id);
                          }
                        }}
                        className="min-h-[44px] md:min-h-0 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-extrabold cursor-pointer flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{enrolledStu ? `Enrolled (${enrolledStu.regId})` : 'Enrolled'}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onConvertLeadToStudent(l.id)}
                        className="min-h-[44px] md:min-h-0 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer shadow-2xs"
                      >
                        🎓 Convert to Student
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onDeleteLead(l.id)}
                      className="min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 p-2 md:p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 cursor-pointer flex items-center justify-center"
                      title="Delete Lead"
                    >
                      <Trash2 className="w-4 h-4 md:w-3.5 md:h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SUBVIEW 4: OBJECTION PLAYBOOK */}
      {subView === 'playbook' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="pb-3 border-b border-slate-100">
            <h3 className="text-sm font-extrabold text-slate-900">Counselor Lead Objection Handling Playbook</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Battle-tested responses to common prospect concerns in English, Hindi, and Marathi
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              {
                title: '1. "Fees are expensive / Out of budget"',
                tip: 'Highlight live terminal mentorship + Offer 3-stage milestone installment split.',
                script: 'Dear prospect, we completely understand budget considerations. At Srujaan Share Market Institute, our course includes live practical trading desk sessions and personal mentorship—plus you can split the fee into 3 convenient milestone installments!'
              },
              {
                title: '2. "I had past trading losses / Fear of losing money"',
                tip: 'Emphasize simulator-first risk management and position sizing rules before real capital deployment.',
                script: 'We completely respect that. Most traders lose because they trade without risk control rules. In our institute, you practice first on live simulators with strict 1% risk-per-trade rules before risking real funds.'
              },
              {
                title: '3. "Job timing clash with classes"',
                tip: 'Suggest our Evening Live Online Batch (7:00 PM) or Weekend Executive Classroom Batch (Sat & Sun).',
                script: 'We have specifically designed our Evening Live Online Batch (7:00 PM - 8:30 PM) and Weekend Executive Batch (Sat & Sun 10:00 AM) so working professionals never miss a session.'
              },
              {
                title: '4. "Absolute beginner / No financial background"',
                tip: 'Reassure that 80% of successful students start from zero fundamentals.',
                script: 'No background is required! We start from absolute zero fundamentals—candlesticks, price action, and order placement—with step-by-step guidance in English, Hindi, and Marathi.'
              }
            ].map(item => (
              <div key={item.title} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                <h4 className="font-extrabold text-amber-800">{item.title}</h4>
                <div className="text-slate-700 font-semibold">{item.tip}</div>
                <div className="p-3 rounded-lg bg-white border border-slate-200 text-slate-600 italic text-[11px] leading-relaxed">
                  "{item.script}"
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
