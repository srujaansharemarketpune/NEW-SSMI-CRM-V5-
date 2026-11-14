import React, { useState, useEffect } from 'react';
import { AppState, StaffMember, StudyMaterial } from '../types';
import {
  Users,
  Search,
  Plus,
  Edit2,
  Trash2,
  ShieldCheck,
  Download,
  CheckCircle2,
  Phone,
  Mail,
  Calendar,
  BookOpen,
  Upload,
  Share2,
  FileText,
  ExternalLink,
  MessageCircle
} from 'lucide-react';

interface StaffPortalViewProps {
  state: AppState;
  onOpenStaffModal: (staffId?: string) => void;
  onDeleteStaff: (staffId: string) => void;
  onToggleStaffStatus: (staffId: string) => void;
  onOpenMaterialModal: (materialId?: string) => void;
  onDeleteMaterial: (materialId: string) => void;
  onDownloadMaterial: (materialId: string) => void;
  onShareMaterialWhatsApp: (materialId: string) => void;
}

export const StaffPortalView: React.FC<StaffPortalViewProps> = ({
  state,
  onOpenStaffModal,
  onDeleteStaff,
  onToggleStaffStatus,
  onOpenMaterialModal,
  onDeleteMaterial,
  onDownloadMaterial,
  onShareMaterialWhatsApp
}) => {
  const [subView, setSubView] = useState<'staff' | 'materials' | 'portal'>('staff');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Active' | 'On Leave' | 'Inactive'>('ALL');
  const [selectedStudentId, setSelectedStudentId] = useState<string>(state.students[0]?.id || '');

  // Study material filters
  const [matSearch, setMatSearch] = useState('');
  const [matCourseFilter, setMatCourseFilter] = useState<string>('ALL');
  const [matTypeFilter, setMatTypeFilter] = useState<string>('ALL');

  const [, setTick] = useState(0);

  // Explicit window-bound wrapper functions for Staff & Study Materials
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).deleteStaff = (id: string) => {
        onDeleteStaff(id);
        setTick(t => t + 1);
      };
      (window as any).openEditStaffModal = (id: string) => {
        onOpenStaffModal(id);
      };
      (window as any).openUploadMaterialModal = (id?: string) => {
        onOpenMaterialModal(id);
      };
      (window as any).deleteMaterial = (id: string) => {
        onDeleteMaterial(id);
        setTick(t => t + 1);
      };
      (window as any).downloadMaterial = (id: string) => {
        onDownloadMaterial(id);
      };
      (window as any).shareMaterialWhatsApp = (id: string) => {
        onShareMaterialWhatsApp(id);
      };
    }
  }, [
    onDeleteStaff,
    onOpenStaffModal,
    onOpenMaterialModal,
    onDeleteMaterial,
    onDownloadMaterial,
    onShareMaterialWhatsApp
  ]);

  const student = state.students.find(s => s.id === selectedStudentId) || state.students[0];

  // Student portal metrics
  const paid = (student?.milestones || []).filter(m => m.status === 'Paid').reduce((a, b) => a + b.amount, 0);
  const balance = Math.max(0, (student?.netFee || 0) - paid);
  const studentMaterials = state.materials.filter(
    m => m.course === student?.course || m.batchAccess === 'All Batches' || m.batchAccess === student?.batch
  );

  // Filter staff list
  const filteredStaff = state.staff.filter(st => {
    if (statusFilter !== 'ALL' && st.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const combined = `${st.name} ${st.id} ${st.role} ${st.phone} ${st.email} ${st.batches}`.toLowerCase();
      if (!combined.includes(q)) return false;
    }
    return true;
  });

  // Filter study materials
  const filteredMaterials = state.materials.filter(m => {
    if (matCourseFilter !== 'ALL' && m.course !== matCourseFilter && m.courseId !== matCourseFilter) {
      return false;
    }
    if (matTypeFilter !== 'ALL' && (m.fileType || 'PDF') !== matTypeFilter) {
      return false;
    }
    if (matSearch.trim()) {
      const q = matSearch.toLowerCase().trim();
      const combined = `${m.title} ${m.course} ${m.summary} ${m.fileType || ''} ${m.batchAccess || ''}`.toLowerCase();
      if (!combined.includes(q)) return false;
    }
    return true;
  });

  // Direct Email Share helper
  const handleEmailMaterial = (m: StudyMaterial) => {
    const enrolledEmails = state.students
      .filter(s => s.status !== 'Archived' && s.course === m.course && s.email)
      .map(s => s.email)
      .join(',');
    const subject = encodeURIComponent(`Study Material: ${m.title} (${state.settings.instituteName})`);
    const linkInfo =
      m.fileData && m.fileData.startsWith('http')
        ? `\nDirect Access Link: ${m.fileData}`
        : `\nFile Format: ${m.fileType || 'PDF'} (${m.fileSize || '1.5 MB'})`;
    const body = encodeURIComponent(
      `Dear Students,\n\nPlease find the study material details for your course "${m.course}":\n\n` +
        `Title: ${m.title}\n` +
        `Batch Access: ${m.batchAccess || 'All Batches'}${linkInfo}\n\n` +
        `Overview:\n${m.summary}\n\n` +
        `Warm regards,\n${state.settings.signatoryName}\n${state.settings.instituteName}`
    );
    window.location.href = `mailto:${enrolledEmails}?subject=${subject}&body=${body}`;
  };

  // Standalone HTML export
  const exportStudentPortalHtml = () => {
    if (!student) return;
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Student Self-Service Portal — ${student.name}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #0f172a; padding: 28px; max-width: 900px; margin: 0 auto; }
    .card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; margin-bottom: 20px; box-shadow: 0 1px 3px 0 rgba(0,0,0,0.05); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }
    .stat-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 99px; font-size: 11px; font-weight: bold; background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Verified Student Dossier</div>
    <h1 style="margin: 10px 0 6px 0; color: #0f172a;">${student.name} (${student.regId})</h1>
    <p style="color: #64748b; margin: 0;">${state.settings.instituteName} • Course: <strong style="color: #0f172a;">${student.course}</strong></p>
    <div class="grid" style="margin-top: 18px;">
      <div class="stat-box">
        <div style="font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase;">BATCH</div>
        <div style="font-size: 17px; font-weight: 800; color: #0f172a; margin-top: 4px;">${student.batch || 'Unassigned'}</div>
      </div>
      <div class="stat-box">
        <div style="font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase;">FEE STATUS</div>
        <div style="font-size: 17px; font-weight: 800; color: ${balance > 0 ? '#e11d48' : '#047857'}; margin-top: 4px;">
          ${balance > 0 ? 'Due: ₹' + balance.toLocaleString('en-IN') : '✓ Full Cleared'}
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Student_Portal_${student.regId}_${student.name.replace(/\s+/g, '_')}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Title Bar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-600" />
              <span>Staff Management, Study Materials & Student Portal</span>
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
              {state.staff.length} Staff • {state.materials.length} Study Materials
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Manage faculty directory, upload & distribute study materials (PDF/DOCX/PPTX/Links) to students via WhatsApp/Email, and preview the Student Portal.
          </p>
        </div>

        {/* Subview Selector & Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="p-1 rounded-xl bg-slate-100 border border-slate-200 flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSubView('staff')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                subView === 'staff' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Staff Directory ({state.staff.length})
            </button>
            <button
              type="button"
              onClick={() => setSubView('materials')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                subView === 'materials' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Study Materials ({state.materials.length})
            </button>
            <button
              type="button"
              onClick={() => setSubView('portal')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                subView === 'portal' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Student Portal Preview
            </button>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setSubView('materials');
              onOpenMaterialModal();
            }}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>+ Upload Study Material</span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onOpenStaffModal();
            }}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Staff</span>
          </button>
        </div>
      </div>

      {/* SUBVIEW 1: STAFF DIRECTORY (FULL CRUD) */}
      {subView === 'staff' && (
        <div className="space-y-4">
          {/* Search & Filter Bar */}
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex-1 min-w-[260px] relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search staff by name, designation, phone, email, or assigned batch..."
                className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
              />
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {(['ALL', 'Active', 'On Leave', 'Inactive'] as const).map(st => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                    statusFilter === st
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                  }`}
                >
                  {st === 'ALL' ? 'All Staff' : st}
                </button>
              ))}
            </div>
          </div>

          {/* Desktop Staff Table */}
          <div className="hidden md:block bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto max-h-[70vh]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-50 shadow-[0_1px_0_0_#e2e8f0]">
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[11px] font-bold tracking-wider">
                    <th className="p-4">Staff Member & ID</th>
                    <th className="p-4">Designation / Role</th>
                    <th className="p-4">Contact Details</th>
                    <th className="p-4">Monthly Salary</th>
                    <th className="p-4">Assigned Batches</th>
                    <th className="p-4">Status (Quick Toggle)</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStaff.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-10 text-center text-slate-500">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Users className="w-8 h-8 text-slate-300" />
                          <span className="font-bold text-slate-700 text-sm">No matching staff records found</span>
                          <span className="text-xs text-slate-400">
                            {searchQuery
                              ? 'Try adjusting your search query or status filter.'
                              : 'Click "Add New Staff" to register your first instructor or counselor.'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredStaff.map((st) => (
                      <tr key={st.id} className="hover:bg-slate-50/70 transition-colors">
                        {/* Name & ID */}
                        <td className="p-4">
                          <div className="font-extrabold text-slate-900 text-sm">{st.name}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="font-mono text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                              {st.id}
                            </span>
                            {st.joiningDate && (
                              <span className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
                                <Calendar className="w-3 h-3" /> Joined {st.joiningDate}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Designation / Role */}
                        <td className="p-4">
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 inline-block">
                            {st.role}
                          </span>
                        </td>

                        {/* Contact Details */}
                        <td className="p-4">
                          <div className="font-mono font-bold text-slate-800 flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-slate-400" />
                            <span>{st.phone}</span>
                          </div>
                          {st.email && (
                            <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                              <Mail className="w-3 h-3 text-slate-400" />
                              <span className="truncate max-w-[160px]">{st.email}</span>
                            </div>
                          )}
                        </td>

                        {/* Remuneration / Salary */}
                        <td className="p-4 font-mono">
                          <div className="font-black text-slate-900 text-xs">
                            ₹{(st.salary || 65000).toLocaleString('en-IN')}
                          </div>
                          <span className="text-[10px] text-slate-400 font-sans">per month</span>
                        </td>

                        {/* Assigned Batches */}
                        <td className="p-4">
                          <span className="font-mono text-xs text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 inline-block">
                            {st.batches || 'All Batches'}
                          </span>
                        </td>

                        {/* Status Toggle */}
                        <td className="p-4">
                          <button
                            type="button"
                            onClick={() => onToggleStaffStatus(st.id)}
                            title="Click to toggle status (Active / On Leave / Inactive)"
                            className={`px-3 py-1 rounded-full text-xs font-black cursor-pointer transition-all flex items-center gap-1.5 border shadow-2xs hover:scale-105 ${
                              st.status === 'Active'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                                : st.status === 'On Leave'
                                ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                                : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
                            }`}
                          >
                            <span
                              className={`w-2 h-2 rounded-full ${
                                st.status === 'Active'
                                  ? 'bg-emerald-500'
                                  : st.status === 'On Leave'
                                  ? 'bg-amber-500'
                                  : 'bg-slate-400'
                              }`}
                            />
                            <span>{st.status}</span>
                          </button>
                        </td>

                        {/* Action Buttons: Edit & Delete */}
                        <td className="p-4 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onOpenStaffModal(st.id)}
                              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200 hover:border-indigo-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                              title={`Edit details of ${st.name}`}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              <span>Edit</span>
                            </button>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (typeof (window as any).deleteStaff === 'function') {
                                  (window as any).deleteStaff(st.id);
                                } else {
                                  onDeleteStaff(st.id);
                                  setTick(t => t + 1);
                                }
                              }}
                              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 hover:border-rose-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                              title={`Delete ${st.name} from records`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Staff Smart Cards (<768px) */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {filteredStaff.length === 0 ? (
              <div className="bg-white border border-slate-200/90 rounded-2xl p-8 text-center text-slate-500">
                <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <div className="font-bold text-slate-700 text-sm">No matching staff records found</div>
              </div>
            ) : (
              filteredStaff.map((st) => {
                const cleanTel = (st.phone || '').replace(/[^\d+]/g, '');
                return (
                  <div key={st.id} className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-extrabold text-slate-900 text-base truncate">{st.name}</div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <span className="font-mono text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                            {st.id}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {st.role}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onToggleStaffStatus(st.id)}
                        className={`min-h-[36px] px-3 py-1 rounded-full text-xs font-black cursor-pointer flex items-center gap-1.5 border shrink-0 ${
                          st.status === 'Active'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                            : st.status === 'On Leave'
                            ? 'bg-amber-50 text-amber-800 border-amber-300'
                            : 'bg-slate-100 text-slate-600 border-slate-300'
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${
                            st.status === 'Active'
                              ? 'bg-emerald-500'
                              : st.status === 'On Leave'
                              ? 'bg-amber-500'
                              : 'bg-slate-400'
                          }`}
                        />
                        <span>{st.status}</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
                      <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase">Phone</div>
                        <a
                          href={`tel:${cleanTel}`}
                          className="font-mono font-bold text-blue-600 flex items-center gap-1 mt-0.5"
                        >
                          <Phone className="w-3 h-3" />
                          <span>{st.phone}</span>
                        </a>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase">Monthly Salary</div>
                        <div className="font-mono font-black text-slate-900 mt-0.5">
                          ₹{(st.salary || 65000).toLocaleString('en-IN')}
                        </div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-[10px] font-bold text-slate-400 uppercase">Assigned Batches</div>
                        <div className="font-mono font-bold text-slate-800 mt-0.5">{st.batches || 'All Batches'}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => onOpenStaffModal(st.id)}
                        className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>Edit Profile</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (typeof (window as any).deleteStaff === 'function') {
                            (window as any).deleteStaff(st.id);
                          } else {
                            onDeleteStaff(st.id);
                            setTick(t => t + 1);
                          }
                        }}
                        className="min-h-[44px] px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* SUBVIEW 2: STUDY MATERIALS (UPLOAD, SAVE & MULTI-CHANNEL DISTRIBUTION) */}
      {subView === 'materials' && (
        <div className="space-y-4">
          {/* Study Material Upload & Filter Bar */}
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-indigo-600" />
                  <span>Study Materials, Handouts & Student Distribution Hub</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Upload PDFs, PPTX, DOCX, ZIP files or Drive links and send directly to enrolled students via WhatsApp or Email
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  onOpenMaterialModal();
                }}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
              >
                <Upload className="w-4 h-4" />
                <span>+ Upload / Add Study Material</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
              <div className="flex-1 min-w-[220px] relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={matSearch}
                  onChange={(e) => setMatSearch(e.target.value)}
                  placeholder="Search study materials by title, course, batch, or topic..."
                  className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <select
                value={matCourseFilter}
                onChange={(e) => setMatCourseFilter(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 cursor-pointer"
              >
                <option value="ALL">All Courses ({state.materials.length})</option>
                {state.courses.map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>

              <div className="flex items-center gap-1 flex-wrap">
                {(['ALL', 'PDF', 'DOCX', 'PPTX', 'ZIP', 'LINK'] as const).map(ft => (
                  <button
                    key={ft}
                    type="button"
                    onClick={() => setMatTypeFilter(ft)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                      matTypeFilter === ft
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                    }`}
                  >
                    {ft === 'ALL' ? 'All Formats' : ft}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Study Material Cards Grid */}
          {filteredMaterials.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-2">
              <FileText className="w-8 h-8 text-slate-300 mx-auto" />
              <div className="text-sm font-bold text-slate-800">No study materials match your filter</div>
              <p className="text-xs text-slate-500">
                Click "+ Upload / Add Study Material" to upload a PDF, DOCX, PPTX, ZIP or Google Drive link.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMaterials.map(m => (
                <div
                  key={m.id}
                  className="bg-white border border-slate-200/90 rounded-2xl shadow-xs p-5 flex flex-col justify-between space-y-4 hover:border-slate-300 transition-all"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <span className="px-2.5 py-0.5 rounded-md text-[10px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {m.fileType || 'PDF'}
                        </span>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          {m.fileSize || '1.5 MB'}
                        </span>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {m.batchAccess || 'All Batches'}
                        </span>
                      </div>
                      {m.uploadDate && (
                        <span className="text-[10px] font-mono text-slate-400">📅 {m.uploadDate}</span>
                      )}
                    </div>

                    <div>
                      <div className="text-[11px] font-extrabold text-indigo-600">{m.course}</div>
                      <h4 className="text-sm font-black text-slate-900 mt-0.5 leading-snug">{m.title}</h4>
                    </div>

                    <p className="text-xs text-slate-600 leading-relaxed">{m.summary}</p>
                  </div>

                  {/* Multi-Channel Distribution & CRUD Controls */}
                  <div className="pt-3 border-t border-slate-100 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          onDownloadMaterial(m.id);
                        }}
                        className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                        title="Download or Open Study Material File"
                      >
                        {m.fileType === 'LINK' ? (
                          <>
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Open Link</span>
                          </>
                        ) : (
                          <>
                            <Download className="w-3.5 h-3.5" />
                            <span>Download File</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          onShareMaterialWhatsApp(m.id);
                        }}
                        className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                        title="Send Study Material to Students on WhatsApp"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>Share via WhatsApp</span>
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleEmailMaterial(m)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Mail className="w-3 h-3" />
                        <span>Email to Students</span>
                      </button>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            onOpenMaterialModal(m.id);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            onDeleteMaterial(m.id);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SUBVIEW 3: STUDENT PORTAL PREVIEW */}
      {subView === 'portal' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <label className="text-xs font-bold text-slate-700">Preview Portal as Student:</label>
              <select
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {state.students.filter(s => s.status !== 'Archived').map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.regId}) — {s.course}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={exportStudentPortalHtml}
                className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Read-Only HTML Card</span>
              </button>
            </div>
          </div>

          {student && (
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs p-6 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-100">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Protected Student Self-Service Interface</span>
                  </div>
                  <h3 className="text-xl font-extrabold text-slate-900 mt-2">
                    {student.name}{' '}
                    <span className="font-mono text-sm font-semibold text-indigo-600">({student.regId})</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    {state.settings.instituteName} • Enrolled Course: <strong className="text-slate-800">{student.course}</strong>
                  </p>
                </div>

                <div className="text-right text-xs font-mono space-y-1">
                  <div className="text-slate-600">Assigned Batch: <strong className="text-slate-900">{student.batch || 'Pending Batch'}</strong></div>
                  <div>Status: <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">{student.status}</span></div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/90 space-y-1.5 text-xs">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Course Fee Status</div>
                  <div className="text-2xl font-black font-mono text-slate-900">
                    ₹{paid.toLocaleString('en-IN')} <span className="text-xs font-normal text-slate-500">paid</span>
                  </div>
                  <div className={`text-xs font-bold ${balance > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                    {balance > 0 ? `Pending Balance: ₹${balance.toLocaleString('en-IN')}` : '✓ 100% Course Fee Cleared'}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/90 space-y-1.5 text-xs">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Classroom Timings</div>
                  <div className="text-base font-bold text-slate-900">
                    {state.batches.find(b => b.code === student.batch)?.schedule || 'Schedule will be notified'}
                  </div>
                  <div className="text-slate-500 text-[11px]">
                    Faculty: {state.batches.find(b => b.code === student.batch)?.instructor || state.settings.signatoryName}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/90 space-y-1.5 text-xs">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Verified Credentials</div>
                  <div className="text-xs font-bold text-slate-800">
                    Aadhaar & Student Enrollment Agreement
                  </div>
                  <div className="text-emerald-700 font-bold text-[11px] flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Verified on {student.enrollDate}</span>
                  </div>
                </div>
              </div>

              {/* Study Materials for this student with Download & WhatsApp Share */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                    Assigned Study Handouts & Downloadable Guides ({studentMaterials.length})
                  </h4>
                  <button
                    type="button"
                    onClick={() => onOpenMaterialModal()}
                    className="text-xs font-bold text-indigo-600 hover:underline cursor-pointer"
                  >
                    + Upload More Materials
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {studentMaterials.map(m => (
                    <div key={m.id} className="p-4 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2.5 text-xs hover:border-slate-300 transition-colors flex flex-col justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <strong className="text-slate-900 font-bold">{m.title}</strong>
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-indigo-50 text-indigo-700 font-bold border border-indigo-200 shrink-0">
                            {m.fileType || 'PDF'} • {m.fileSize || '1.5 MB'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 leading-relaxed">{m.summary}</p>
                      </div>
                      <div className="flex items-center gap-2 pt-2 border-t border-slate-200/70">
                        <button
                          type="button"
                          onClick={() => onDownloadMaterial(m.id)}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                        >
                          <Download className="w-3 h-3" />
                          <span>Download</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onShareMaterialWhatsApp(m.id)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                        >
                          <Share2 className="w-3 h-3" />
                          <span>Send on WhatsApp</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
